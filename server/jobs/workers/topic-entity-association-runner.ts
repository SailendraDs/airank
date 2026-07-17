// Topic-Entity Association Runner
//
// For each brand:
//   1. Get the brand's topics
//   2. For each topic, ask each LLM: "Which brands do you associate with the topic '{topic}'?"
//   3. Score how often the brand is named (1 of N total) in the responses
//   4. Persist into topic_entity_associations

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface TopicEntityAssociationPayload {
  brandId: string;
}

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;

async function askLLM(provider: string, prompt: string): Promise<string[]> {
  // TODO: integrate with real LLM clients
  // For now, stub: return random brands
  return ['Notion', 'Airtable', 'ClickUp', 'Asana'].slice(0, 2 + Math.floor(Math.random() * 3));
}

export async function topicEntityAssociationRunner(job: QueuedJob): Promise<{ brandId: string; topicsAnalyzed: number; avgScore: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'topic_entity_association', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const topics = await storage.getTopicsByBrand(brandId);
  if (topics.length === 0) {
    log.warn('No topics for brand; skipping');
    return { brandId, topicsAnalyzed: 0, avgScore: 0 };
  }

  let totalScore = 0;
  for (const topic of topics) {
    let mentioned = 0;
    let total = 0;
    for (const provider of PROVIDERS) {
      const answer = await askLLM(provider, `Which brands do you associate with "${topic.name}"?`);
      total++;
      if (answer.some(a => a.toLowerCase() === brand.name.toLowerCase())) {
        mentioned++;
      }
    }
    const score = total > 0 ? (mentioned / total) * 100 : 0;
    totalScore += score;
    await storage.upsertTopicEntityAssociation({
      brandId,
      topicId: topic.id,
      topicName: topic.name,
      associationScore: score,
    });
  }

  const avgScore = topics.length > 0 ? totalScore / topics.length : 0;
  log.info('Topic-entity association complete', { topicsAnalyzed: topics.length, avgScore });
  return { brandId, topicsAnalyzed: topics.length, avgScore };
}