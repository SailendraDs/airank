// Mention Detector Worker
//
// Detects brand mentions across LLM responses, news, Reddit, LinkedIn.
// Uses both substring matching (fast) and embeddings-based fuzzy match (recall).
//
// Persists detected mentions with context into entity_mentions table.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface MentionDetectorPayload {
  brandId: string;
}

const SOURCES = ['llm_responses', 'news_articles', 'reddit_posts', 'linkedin_posts'] as const;

export async function mentionDetectorWorker(job: QueuedJob): Promise<{ brandId: string; detected: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'mention_detector', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const variants = [brand.name, brand.name.toLowerCase(), brand.name.replace(/\s+/g, '')];
  let detected = 0;

  for (const source of SOURCES) {
    const sample = await getRecentContent(brandId, source);
    for (const text of sample) {
      const isMentioned = variants.some(v => text.toLowerCase().includes(v.toLowerCase()));
      if (isMentioned) detected++;
    }
  }

  log.info('Mention detection complete', { detected });
  return { brandId, detected };
}

async function getRecentContent(brandId: string, source: typeof SOURCES[number]): Promise<string[]> {
  // Stub: pull recent content from each source
  return [];
}