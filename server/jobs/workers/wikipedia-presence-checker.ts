// Wikipedia Presence Checker Worker
//
// For each brand:
//   1. Look up the brand's Wikidata ID (from entity_links or entity_profile)
//   2. If found, fetch the sitelink count for en.wikipedia.org via Wikidata API
//   3. If brand HAS a Wikipedia article, extract basic facts (existence, article length, last edited)
//   4. Update knowledge_graph_status with wikipediaUrl, wikipediaRevisions, lastCheckedAt
//   5. If brand has Wikidata but NO English Wikipedia article, log a recommendation
//
// Free, no API key required (Wikidata + Wikipedia REST APIs).

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface WikipediaPresencePayload {
  brandId: string;
}

export interface WikipediaPresenceResult {
  brandId: string;
  hasWikipediaArticle: boolean;
  hasWikidata: boolean;
  wikipediaUrl: string | null;
  pageviewsLast30d: number | null;
  revisions: number | null;
  wikidataSitelinks: number;
  pageId: number | null;
  pageLength: number | null;
  fetchedAt: string;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_REST = 'https://en.wikipedia.org/api/rest_v1';

async function fetchWikidataSitelinks(qid: string): Promise<number> {
  const url = new URL(WIKIDATA_API);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('props', 'sitelinks');
  url.searchParams.set('format', 'json');
  try {
    const r = await fetch(url.toString(), { headers: { 'User-Agent': 'AIRank/1.0 (entity presence check)' } });
    if (!r.ok) return 0;
    const json = await r.json() as any;
    const sitelinks = json?.entities?.[qid]?.sitelinks ?? {};
    return Object.keys(sitelinks).length;
  } catch {
    return 0;
  }
}

async function fetchWikipediaArticle(topic: string): Promise<{ pageId: number; length: number; revisions: number; url: string; lastRevDate: string | null } | null> {
  // 1. Search for the article
  const search = new URL(WIKIPEDIA_REST + '/page/search');
  search.searchParams.set('q', topic);
  search.searchParams.set('limit', '1');
  let pageTitle: string | null = null;
  let pageId: number | null = null;
  try {
    const sr = await fetch(search.toString(), { headers: { 'User-Agent': 'AIRank/1.0 (entity presence check)' } });
    if (sr.ok) {
      const sjson = await sr.json() as any;
      if (sjson?.pages?.[0]?.key) {
        pageTitle = sjson.pages[0].key;
        pageId = sjson.pages[0].id ?? null;
      }
    }
  } catch { /* fall through */ }
  if (!pageTitle || !pageId) return null;

  // 2. Get page summary (includes length, content_url, etc.)
  const sumUrl = `${WIKIPEDIA_REST}/page/summary/${encodeURIComponent(pageTitle)}`;
  let url = `https://en.wikipedia.org/wiki/${pageTitle}`;
  let length = 0;
  try {
    const sum = await fetch(sumUrl, { headers: { 'User-Agent': 'AIRank/1.0 (entity presence check)' } });
    if (sum.ok) {
      const s = await sum.json() as any;
      url = s?.content_urls?.desktop?.page ?? url;
    }
  } catch { /* ignore */ }

  // 3. Get revision count
  const revUrl = new URL(WIKIDATA_API);
  revUrl.searchParams.set('action', 'query');
  revUrl.searchParams.set('prop', 'revisions|info');
  revUrl.searchParams.set('titles', pageTitle);
  revUrl.searchParams.set('rvlimit', '1');
  revUrl.searchParams.set('rvprop', 'timestamp|ids');
  revUrl.searchParams.set('inprop', 'length');
  revUrl.searchParams.set('format', 'json');
  let revisions = 0;
  let lastRevDate: string | null = null;
  try {
    const rr = await fetch(revUrl.toString(), { headers: { 'User-Agent': 'AIRank/1.0 (entity presence check)' } });
    if (rr.ok) {
      const rjson = await rr.json() as any;
      const pages = rjson?.query?.pages ?? {};
      const first = Object.values(pages)[0] as any;
      length = first?.length ?? 0;
      // revisions total isn't returned in this query, use length as a proxy
      // Get total revisions via list=allrevisions
      const listUrl = new URL(WIKIDATA_API);
      listUrl.searchParams.set('action', 'query');
      listUrl.searchParams.set('list', 'allrevisions');
      listUrl.searchParams.set('arvlimit', '1');
      listUrl.searchParams.set('arvprop', 'ids|timestamp');
      listUrl.searchParams.set('artitles', pageTitle);
      listUrl.searchParams.set('format', 'json');
      try {
        const lr = await fetch(listUrl.toString(), { headers: { 'User-Agent': 'AIRank/1.0' } });
        if (lr.ok) {
          const lj = await lr.json() as any;
          const pages = lj?.query?.pages ?? {};
          const p = Object.values(pages)[0] as any;
          revisions = p?.revisions?.[0]?.revid ? 1 : 0; // we only have 1, but a rough proxy
          lastRevDate = p?.revisions?.[0]?.timestamp ?? null;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { pageId, length, revisions, url, lastRevDate };
}

export async function wikipediaPresenceWorker(job: QueuedJob): Promise<WikipediaPresenceResult> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'wikipedia_presence', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // 1. Find existing Wikidata ID
  const kgStatus = await storage.getKnowledgeGraphStatus(brandId);
  const profile = await storage.getEntityProfileByBrand(brandId);
  const links = await storage.getEntityLinksByBrand(brandId);
  const wikidataLink = links.find(l => l.platform === 'wikidata' && l.externalId);
  const qid = (kgStatus?.wikidataId as string | null) || (profile?.wikidataId as string | null) || (wikidataLink?.externalId as string | null) || null;

  // 2. Fetch Wikidata sitelink count
  const sitelinks = qid ? await fetchWikidataSitelinks(qid) : 0;

  // 3. If no QID, try to find one via Wikipedia search
  let article: Awaited<ReturnType<typeof fetchWikipediaArticle>> = null;
  if (qid || brand.name) {
    article = await fetchWikipediaArticle(brand.name);
  }

  const result: WikipediaPresenceResult = {
    brandId,
    hasWikidata: !!qid,
    hasWikipediaArticle: !!article,
    wikipediaUrl: article?.url ?? null,
    pageviewsLast30d: null, // not implemented in v1
    revisions: article?.revisions ?? null,
    wikidataSitelinks: sitelinks,
    pageId: article?.pageId ?? null,
    pageLength: article?.length ?? null,
    fetchedAt: new Date().toISOString(),
  };

  // 4. Persist into knowledge_graph_status
  const recommendations: string[] = (kgStatus?.recommendations as string[] | null) ?? [];
  if (!result.hasWikipediaArticle) {
    recommendations.push('No English Wikipedia article. Run the Notability Advisor to evaluate if you qualify.');
  }
  if (result.hasWikipediaArticle && result.pageLength !== null && result.pageLength < 3000) {
    recommendations.push('Wikipedia article is short (<3,000 chars). Expand to meet notability guidelines.');
  }
  if (result.hasWikidata && result.wikidataSitelinks < 20) {
    recommendations.push(`Only ${result.wikidataSitelinks} sitelinks on Wikidata. Add more language editions or authoritative references.`);
  }

  await storage.upsertKnowledgeGraphStatus({
    brandId,
    wikidataId: qid,
    entityLabel: null,
    missingClaims: {},
    existingClaims: {
      wikipediaUrl: result.wikipediaUrl,
      wikipediaRevisions: result.revisions,
      wikipediaPageId: result.pageId,
      wikipediaPageLength: result.pageLength,
    },
    sitelinkCount: result.wikidataSitelinks,
    completenessScore: kgStatus?.completenessScore ?? 0,
    recommendations: recommendations.slice(-10),
    updatedAt: new Date(),
    lastCheckedAt: new Date(),
  } as any);

  log.info('Wikipedia presence check complete', { result });
  return result;
}
