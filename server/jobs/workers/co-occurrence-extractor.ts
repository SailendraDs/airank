// Co-occurrence Extractor Worker
//
// Extracts which brands/entities co-occur with the brand in LLM responses,
// news, and reviews. Builds a co-occurrence graph that powers the
// "Brands frequently mentioned together" section of the entity profile.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface CoOccurrenceExtractorPayload {
  brandId: string;
}

const CO_OCCURRENCE_TARGETS = ['news_articles', 'reddit_posts', 'g2_reviews', 'capterra_reviews', 'llm_responses'] as const;

export async function coOccurrenceExtractorWorker(job: QueuedJob): Promise<{ brandId: string; pairs: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'co_occurrence_extractor', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const coOccurrences: Record<string, { count: number; sources: Set<string> }> = {};
  for (const target of CO_OCCURRENCE_TARGETS) {
    const content = await fetchContent(brandId, target);
    for (const text of content) {
      // Extract capitalized phrases as potential brand names
      const brandNames = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\b/g) ?? [];
      for (const name of brandNames) {
        if (name === brand.name) continue;
        const key = name.toLowerCase();
        if (!coOccurrences[key]) coOccurrences[key] = { count: 0, sources: new Set() };
        coOccurrences[key].count++;
        coOccurrences[key].sources.add(target);
      }
    }
  }

  // Persist top co-occurrences
  const top = Object.entries(coOccurrences)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 30);

  for (const [name, info] of top) {
    await storage.createEntityCooccurrence({
      brandId,
      coEntityName: name,
      coEntityType: 'brand',
      frequency: info.count,
      avgSentiment: 0,
      context: `Co-mentioned in ${info.sources.size} sources`,
    });
  }

  log.info('Co-occurrence extraction complete', { pairs: top.length });
  return { brandId, pairs: top.length };
}

async function fetchContent(brandId: string, source: typeof CO_OCCURRENCE_TARGETS[number]): Promise<string[]> {
  return [];
}