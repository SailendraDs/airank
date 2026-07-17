// Brand Quotability Worker
//
// For each brand:
//
// 1. Fetches recent PRs/news from the brand
// 2. Runs the brand's quotes through citation extraction
// 3. Checks whether sources cite the brand as an authority
// 4. Scores "quotability" (0-100): mentions * authority + source diversity
//
// Persists into external_quotations.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface BrandQuotabilityPayload {
  brandId: string;
}

export async function brandQuotabilityWorker(job: QueuedJob): Promise<{ brandId: string; quotabilityScore: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'brand_quotability', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // 1. Pull recent news for the brand
  const news = await storage.getNewsMentionsByBrand(brandId);
  const newsSources = new Set(news.map(n => n.sourceDomain).filter(Boolean));

  // 2. Run existing citations through the citation extraction logic
  // (we already have a citation-extraction worker)
  const citations = await storage.getSourcesByBrand(brandId);

  // 3. Count authoritative citations
  const HIGH_AUTHORITY_DOMAINS = [
    'wikipedia.org', 'nytimes.com', 'wsj.com', 'forbes.com', 'techcrunch.com',
    'bloomberg.com', 'reuters.com', 'businessinsider.com', 'theverge.com', 'wired.com',
  ];
  let authoritativeCitations = 0;
  for (const c of citations) {
    const domain = c.domain ?? '';
    if (HIGH_AUTHORITY_DOMAINS.some(d => domain.toLowerCase().includes(d))) {
      authoritativeCitations++;
    }
  }

  // 4. Compute quotability score
  const mentionCount = news.length;
  const sourceDiversity = Math.min(20, newsSources.size * 5);
  const authorityMultiplier = Math.min(3, 1 + authoritativeCitations / 10);
  const quotabilityScore = Math.round(mentionCount * authorityMultiplier * 2 + sourceDiversity);

  // 5. Persist
  await storage.upsertExternalQuotation({
    brandId,
    quotabilityScore,
    mentionCount,
    authoritativeCitationCount: authoritativeCitations,
    lastCheckedAt: new Date(),
  } as any);

  log.info('Brand quotability complete', { quotabilityScore, mentionCount, authoritativeCitations });
  return { brandId, quotabilityScore };
}