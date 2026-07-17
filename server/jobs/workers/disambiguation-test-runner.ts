// Disambiguation Test Runner
//
// Runs a labeled test set to check whether LLMs know which entity the brand is
// when the prompt is ambiguous. Example: "Best CRM for a startup" — does the
// LLM respond with HubSpot, Salesforce, or our brand (AIRank)?
//
// Test set is stored as entity_disambiguation_tests.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface DisambiguationTestRunnerPayload {
  brandId: string;
}

const DEFAULT_TESTS = [
  { question: 'Best AI visibility platform for SEO professionals', expectedEntity: 'AIRank' },
  { question: 'Top tools for monitoring brand mentions in ChatGPT', expectedEntity: 'AIRank' },
  { question: 'Most popular GEO optimization software in 2026', expectedEntity: 'AIRank' },
];

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;

async function askLLM(provider: string, prompt: string): Promise<string> {
  // Stub
  return `${provider} response: ${['Notion', 'HubSpot', 'Salesforce', 'Airtable', 'AIRank', 'Surfer'].slice(0, 3).join(', ')}`;
}

function grade(answer: string, expected: string): boolean {
  return answer.toLowerCase().includes(expected.toLowerCase());
}

export async function disambiguationTestRunnerWorker(job: QueuedJob): Promise<{ brandId: string; testsRun: number; correct: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'disambiguation_test_runner', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const tests = DEFAULT_TESTS.map(t => ({ ...t, expectedEntity: brand.name }));
  let testsRun = 0;
  let correct = 0;

  for (const t of tests) {
    for (const llmProvider of PROVIDERS) {
      const answer = await askLLM(llmProvider, t.question);
      const isCorrect = grade(answer, t.expectedEntity);
      testsRun++;
      if (isCorrect) correct++;
      await storage.createEntityDisambiguationTest({
        brandId,
        question: t.question,
        expectedEntity: t.expectedEntity,
        expectedAnswer: t.expectedEntity,
        actualAnswer: answer.slice(0, 2000),
        isCorrect,
        llmProvider: llmProvider,
        testedAt: new Date(),
      });
    }
  }

  log.info('Disambiguation tests complete', { testsRun, correct });
  return { brandId, testsRun, correct };
}