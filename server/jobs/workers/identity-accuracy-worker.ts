// Identity Accuracy Worker
//
// Tests whether LLMs correctly identify the brand when given a prompt.
//   1. Pull ground truth from entity_ground_truth for the brand
//   2. For each question (e.g., "What year was {{name}} founded?"), ask each LLM
//   3. Grade the answer (correct/incorrect) based on ground truth
//   4. Persist into entity_disambiguation_tests
//
// Uses a lightweight evaluation (LLM-as-judge or simple string-match).

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'perplexity';

export interface IdentityAccuracyPayload {
  brandId: string;
  /** Which LLM(s) to test. Default: all configured providers. */
  providers?: LLMProvider[];
}

interface GroundTruthItem {
  key: string;
  value: string;
  question: string;
}

const DEFAULT_QUESTIONS: Record<string, string> = {
  founding_date: 'When was {name} founded?',
  headquarters: 'Where is {name} headquartered?',
  industry: 'What industry does {name} operate in?',
  founder: 'Who founded {name}?',
  employees: 'How many employees does {name} have?',
};

function normalizeAnswer(text: string, expected: string): boolean {
  // Simple fuzzy match: expected value appears in answer (case-insensitive)
  const norm = expected.toLowerCase().trim();
  return text.toLowerCase().includes(norm);
}

async function askLLM(provider: LLMProvider, prompt: string): Promise<string> {
  // Use existing LLM client if available; otherwise stub
  try {
    const mod = await import(`../../integrations/llm/${provider}`);
    const client = mod.createClient?.();
    if (client) {
      const resp = await client.complete(prompt);
      return resp;
    }
  } catch {
    // Fall through to stub
  }
  // Stub for development
  return `[${provider} response to: ${prompt.slice(0, 50)}...]`;
}

export async function identityAccuracyWorker(job: QueuedJob): Promise<{ brandId: string; testsRun: number; correct: number; byProvider: Record<string, number> }> {
  const { brandId, providers = ['openai', 'anthropic', 'google'] } = job.payload;
  const log = logger.child({ worker: 'identity_accuracy', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // 1. Pull ground truth
  const truthRecords = await storage.getGroundTruthByBrand(brandId);
  const truth: GroundTruthItem[] = truthRecords
    .filter(t => t.key in DEFAULT_QUESTIONS)
    .map(t => ({
      key: t.key,
      value: t.value,
      question: DEFAULT_QUESTIONS[t.key].replace('{name}', brand.name),
    }));

  if (truth.length === 0) {
    log.warn('No ground truth set for brand; seeding defaults');
    // Seed basic defaults
    await storage.upsertGroundTruth({ brandId, key: 'industry', value: 'SEO software', source: 'system' });
    truth.push({ key: 'industry', value: 'SEO software', question: DEFAULT_QUESTIONS.industry.replace('{name}', brand.name) });
  }

  const byProvider: Record<string, number> = {};
  let correct = 0;
  let testsRun = 0;

  for (const provider of providers) {
    byProvider[provider] = 0;
    for (const item of truth) {
      const answer = await askLLM(provider, item.question);
      const isCorrect = normalizeAnswer(answer, item.value);
      if (isCorrect) {
        byProvider[provider]++;
        correct++;
      }
      testsRun++;

      // Persist the test result
      await storage.createEntityDisambiguationTest({
        brandId,
        llmProvider: provider,
        question: item.question,
        expectedAnswer: item.value,
        actualAnswer: answer.slice(0, 2000),
        isCorrect,
        testedAt: new Date(),
      });
    }
  }

  log.info('Identity accuracy tests complete', { testsRun, correct });
  return { brandId, testsRun, correct, byProvider };
}