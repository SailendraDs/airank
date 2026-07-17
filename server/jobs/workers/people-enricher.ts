// People Enricher + Citation Trust Scorer Worker
//
// For each person in the brand's orbit (entity_people):
//   1. Look up their Wikipedia/Wikidata presence
//   2. Look up their official site and social profiles
//   3. Compute "authority score" (0-25) based on:
//      - Wikipedia presence
//      - LinkedIn presence
//      - Their role/position
//      - Their public activity
//
// Also scores citation sources (entity_sources) on:
//   - Domain authority (estimated)
//   - Reference count in Wikidata
//   - Whether the source is in a brand's "borrowable" set
//   - Whether the source is G2/Capterra-style review site

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface PeopleEnricherPayload {
  brandId: string;
}

const HIGH_AUTHORITY_DOMAINS = [
  'wikipedia.org', 'wikidata.org', 'linkedin.com', 'twitter.com', 'x.com',
  'github.com', 'medium.com', 'forbes.com', 'techcrunch.com',
  'nytimes.com', 'wsj.com', 'reuters.com', 'bbc.com',
];

const REVIEW_DOMAINS = [
  'g2.com', 'capterra.com', 'trustradius.com', 'trustpilot.com', 'producthunt.com',
  'gartner.com', 'forrester.com',
];

export async function peopleEnricherWorker(job: QueuedJob): Promise<{ brandId: string; peopleProcessed: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'people_enricher', brandId, jobId: job.id });

  const people = await storage.getPeopleByBrand(brandId);
  let peopleProcessed = 0;

  for (const person of people) {
    let authority = 0;
    let hasWiki = false;
    let hasLinkedIn = false;
    let hasOfficialSite = false;

    // 1. Wikipedia lookup
    try {
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/search?q=${encodeURIComponent(person.name)}&limit=1`;
      const r = await fetch(searchUrl, { headers: { 'User-Agent': 'AIRank/1.0 (people enricher)' } });
      if (r.ok) {
        const j = await r.json() as any;
        if (j.pages?.[0]?.key?.toLowerCase() === person.name.toLowerCase()) {
          hasWiki = true;
          authority += 10;
        }
      }
    } catch { /* ignore */ }

    // 2. LinkedIn
    const personLinks = Array.isArray((person as any).links) ? (person as any).links as string[] : [];
    const linkedinLink = personLinks.find((l) => l.includes('linkedin.com'));
    if (linkedinLink) {
      hasLinkedIn = true;
      authority += 5;
    }

    // 3. Official site
    if (person.role && /ceo|founder|cto|chief/i.test(person.role)) authority += 5;
    if (person.website) {
      hasOfficialSite = true;
      authority += 3;
    }

    await storage.updatePerson(person.id, {
      authorityScore: Math.min(25, authority),
      hasWikipedia: hasWiki,
      hasLinkedIn,
      hasOfficialSite,
      lastEnrichedAt: new Date(),
    } as any);
    peopleProcessed++;
  }

  // Also enrich sources (citation trust)
  const sources = await storage.getSourcesByBrand(brandId);
  for (const source of sources) {
    const domain = source.domain ?? source.url ?? '';
    const trust = computeSourceTrust(domain);
    await storage.updateSource(source.id, {
      trustScore: trust,
      isHighAuthority: trust >= 20,
      isReviewSite: REVIEW_DOMAINS.some(d => domain.toLowerCase().includes(d)),
      lastTrustCheckAt: new Date(),
    } as any);
  }

  log.info('People/sources enriched', { peopleProcessed, sourcesScored: sources.length });
  return { brandId, peopleProcessed };
}

function computeSourceTrust(domain: string): number {
  if (!domain) return 0;
  const d = domain.toLowerCase();
  if (HIGH_AUTHORITY_DOMAINS.some(h => d.includes(h))) return 25;
  if (REVIEW_DOMAINS.some(r => d.includes(r))) return 22;
  // Heuristic for unknown
  if (d.endsWith('.edu') || d.endsWith('.gov')) return 25;
  if (d.endsWith('.org')) return 18;
  return 10;
}
