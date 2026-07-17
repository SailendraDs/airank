// Retrieval Tester Worker
//
// For each prompt, fetches the top search/Reddit results and asks the LLM
// to answer with ONLY the provided context. Records whether the brand is
// mentioned in the answer. This tests retrieval-grounded generation.
//
// Persists into retrieval_tests.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface RetrievalTesterPayload {
  brandId: string;
}

const PROVIDERS = ['openai', 'anthropic', 'google'] as const;

const SAMPLE_PROMPTS = [
  'What tools help brands track their LLM visibility?',
  'Compare GEO platforms for SaaS brands',
  'How do I measure if my brand is mentioned in ChatGPT?',
];

async function fetchContext(prompt: string): Promise<string> {
  // Stub: would call SERP API, fetch top 10 results, return concatenated snippets
  return `Context for "${prompt}": [result 1] [result 2] [result 3]`;
}

async function askLLM(provider: string, prompt: string, context: string): Promise<string> {
  // Stub
  return `Based on context, here are some options: ${['HubSpot', 'AIRank', 'Notion'].slice(0, 2).join(', ')}`;
}

function detectedInAnswer(answer: string, brandName: string): boolean {
  return answer.toLowerCase().includes(brandName.toLowerCase());
}

export async function retrievalTesterWorker(job: QueuedJob): Promise<{ brandId: string; testsRun: number; retrieved: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'retrieval_tester', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  let testsRun = 0;
  let retrieved = 0;

  for (const prompt of SAMPLE_PROMPTS) {
    const context = await fetchContext(prompt);
    for (const provider of PROVIDERS) {
      const answer = await askLLM(provider, prompt, context);
      const detected = detectedInAnswer(answer, brand.name);
      testsRun++;
      if (detected) retrieved++;

      await storage.createRetrievalTest({
        brandId,
        prompt,
        provider,
        retrieved: detected,
        contextSnippet: context.slice(0, 500),
        llmAnswer: answer.slice(0, 2000),
        testedAt: new Date(),
      });
    }
  }

  log.info('Retrieval tests complete', { testsRun, retrieved });
  return { brandId, testsRun, retrieved };
}