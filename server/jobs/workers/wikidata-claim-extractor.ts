// Wikidata Claim Extractor Worker
//
// Pulls the full list of statements (claims) for a brand's Wikidata entity,
// normalizes them into canonical fields (founding date, HQ, employees, industry,
// founders, parent org, legal name), and persists into entity_profile.
//
// Used to populate the "ground truth" layer for the brand that LLMs should know.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface WikidataClaimExtractorPayload {
  brandId: string;
}

export interface ExtractedClaim {
  property: string;
  propertyLabel: string;
  value: string;
  rank: 'preferred' | 'normal' | 'deprecated';
  references: number;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

const PROPERTY_LABELS: Record<string, string> = {
  P31: 'instance of',
  P17: 'country',
  P131: 'located in',
  P159: 'headquarters location',
  P169: 'chief executive officer',
  P170: 'creator',
  P171: 'parent organization',
  P3324: 'founders',
  P112: 'founded by',
  P571: 'inception',
  P576: 'dissolved',
  P577: 'publication date',
  P580: 'start time',
  P582: 'end time',
  P856: 'official website',
  P2002: 'Twitter username',
  P2003: 'Instagram username',
  P2013: 'Facebook ID',
  P2397: 'YouTube channel ID',
  P6634: 'LinkedIn company ID',
  P2088: 'Crunchbase organization ID',
  P106: 'occupation',
  P108: 'employer',
  P1128: 'employees',
  P1448: 'official name',
  P1813: 'short name',
  P154: 'logo image',
  P18: 'image',
  P373: 'Commons category',
  P8687: 'social media followers',
  P166: 'award received',
  P452: 'industry',
  P414: 'stock exchange',
  P249: 'ticker symbol',
};

async function fetchEntity(qid: string): Promise<any | null> {
  const url = new URL(WIKIDATA_API);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('props', 'labels|descriptions|claims|sitelinks');
  url.searchParams.set('languages', 'en');
  url.searchParams.set('format', 'json');
  try {
    const r = await fetch(url.toString(), { headers: { 'User-Agent': 'AIRank/1.0 (wikidata claim extractor)' } });
    if (!r.ok) return null;
    const json = await r.json() as any;
    return json?.entities?.[qid] ?? null;
  } catch {
    return null;
  }
}

function extractValue(claim: any): string {
  const mainsnak = claim?.mainsnak;
  if (!mainsnak) return '';
  const dv = mainsnak.datavalue;
  if (!dv) return '';
  if (dv.type === 'wikibase-entityid') return String(dv.value?.id ?? '');
  if (dv.type === 'string') return String(dv.value);
  if (dv.type === 'time') return String(dv.value?.time ?? '');
  if (dv.type === 'quantity') return String(dv.value?.amount ?? '');
  if (dv.type === 'monolingualtext') return String(dv.value?.text ?? '');
  if (dv.type === 'globecoordinate') return `${dv.value?.latitude},${dv.value?.longitude}`;
  return JSON.stringify(dv.value);
}

export async function wikidataClaimExtractorWorker(job: QueuedJob): Promise<{ brandId: string; claimCount: number; qid: string | null; factsUpdated: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'wikidata_claim_extractor', brandId, jobId: job.id });

  const profile = await storage.getEntityProfileByBrand(brandId);
  const kgStatus = await storage.getKnowledgeGraphStatus(brandId);
  const qid = (kgStatus?.wikidataId as string | null) || (profile?.wikidataId as string | null);
  if (!qid) {
    log.warn('No Wikidata ID for brand; skipping');
    return { brandId, claimCount: 0, qid: null, factsUpdated: 0 };
  }

  const entity = await fetchEntity(qid);
  if (!entity) {
    log.warn('Wikidata entity not found');
    return { brandId, claimCount: 0, qid, factsUpdated: 0 };
  }

  const claims = entity.claims ?? {};
  const extracted: ExtractedClaim[] = [];
  for (const [prop, claimList] of Object.entries(claims)) {
    for (const c of (claimList as any[])) {
      const refCount = (c.references ?? []).length;
      const rank = (c.rank ?? 'normal') as ExtractedClaim['rank'];
      extracted.push({
        property: prop,
        propertyLabel: PROPERTY_LABELS[prop] ?? prop,
        value: extractValue(c),
        rank,
        references: refCount,
      });
    }
  }

  // Persist into entity_profile using the canonical fields
  const findClaim = (prop: string) => extracted.find(c => c.property === prop && c.value);
  const findAll = (prop: string) => extracted.filter(c => c.property === prop && c.value);

  const update: Record<string, any> = {
    brandId,
    wikidataId: qid,
  };
  const inception = findClaim('P571')?.value;
  if (inception) update.yearFounded = Number(inception.replace(/^\+/, '').slice(0, 4)) || undefined;

  const hq = findClaim('P159')?.value;
  if (hq) update.keyPeople = [...(update.keyPeople ?? []), `Headquarters: ${hq}`];

  const legalName = findClaim('P1448')?.value;
  if (legalName) update.legalName = legalName;

  const industry = findClaim('P452')?.value;
  if (industry) update.keyPeople = [...(update.keyPeople ?? []), `Industry: ${industry}`];

  const parent = findClaim('P171')?.value;
  if (parent) update.parentCompanyId = parent;

  const description = entity.descriptions?.en?.value;
  if (description) update.entityDescription = description;

  const label = entity.labels?.en?.value;
  if (label) update.dbaNames = Array.from(new Set([...(update.dbaNames ?? []), label]));

  await storage.upsertEntityProfile(update as any);

  // Also seed ground truth for each claim so identity-accuracy worker has something to test
  let factsSeeded = 0;
  const groundTruthSeed: { key: string; value: string; source: string }[] = [];
  if (inception) {
    groundTruthSeed.push({ key: 'founding_date', value: inception.slice(0, 4), source: 'wikidata' });
  }
  if (hq) {
    groundTruthSeed.push({ key: 'headquarters', value: hq, source: 'wikidata' });
  }
  if (industry) {
    groundTruthSeed.push({ key: 'industry', value: industry, source: 'wikidata' });
  }
  if (legalName) {
    groundTruthSeed.push({ key: 'legal_name', value: legalName, source: 'wikidata' });
  }
  for (const seed of groundTruthSeed) {
    await storage.upsertGroundTruth({ brandId, ...seed });
    factsSeeded++;
  }

  log.info('Wikidata claims extracted', { claimCount: extracted.length, factsSeeded });
  return { brandId, claimCount: extracted.length, qid, factsUpdated: factsSeeded };
}
