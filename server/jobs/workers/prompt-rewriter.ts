// Prompt Rewriter Worker
//
// Takes a generic prompt (e.g., "Best CRM") and rewrites it into harder variants:
//   - Discovery: "Best tools for managing leads"
//   - Comparison: "HubSpot vs Salesforce"
//   - Buying-intent: "Affordable CRM with WhatsApp integration under $100/month"
//   - Local: "Best CRM for Indian SaaS startup"
//   - Problem: "Need a CRM that doesn't require sales ops team"
//   - Negative: "Why do teams churn off HubSpot?"
//   - Migrate: "Switching from Pipedrive to HubSpot, what should I know?"
//
// Each variant gets classified (intent, difficulty) and added to the prompts table.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface PromptRewriterPayload {
  brandId: string;
  /** Max variants to generate per source prompt. */
  maxVariants?: number;
}

const REWRITE_TEMPLATES: { type: string; intent: string; difficulty: number; weight: number; template: (p: string) => string }[] = [
  { type: 'discovery', intent: 'discovery', difficulty: 3, weight: 0.7, template: (p) => `Best ${p} for small businesses` },
  { type: 'comparison', intent: 'comparison', difficulty: 4, weight: 1.5, template: (p) => `${p} vs competitors — which is better?` },
  { type: 'buying', intent: 'buying', difficulty: 4, weight: 1.5, template: (p) => `Where can I buy ${p} at the best price?` },
  { type: 'local', intent: 'local', difficulty: 5, weight: 1.3, template: (p) => `Top ${p} providers in India` },
  { type: 'problem', intent: 'problem', difficulty: 4, weight: 1.5, template: (p) => `Need ${p} that doesn't require a sales team` },
  { type: 'negative', intent: 'negative', difficulty: 5, weight: 1.0, template: (p) => `Why do teams churn off ${p}?` },
  { type: 'migrate', intent: 'migrate', difficulty: 5, weight: 1.5, template: (p) => `Switching to ${p}, what should I know?` },
];

export async function promptRewriterWorker(job: QueuedJob): Promise<{ brandId: string; generated: number }> {
  const { brandId, maxVariants = 7 } = job.payload;
  const log = logger.child({ worker: 'prompt_rewriter', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // Pull existing prompts for the brand
  const existing = await storage.getPromptsByBrand(brandId);
  const basePrompts = existing.length > 0 ? existing : [{ text: brand.industry || brand.name, topicId: null } as any];

  let generated = 0;
  for (const sourcePrompt of basePrompts.slice(0, 5)) {
    for (const tpl of REWRITE_TEMPLATES.slice(0, maxVariants)) {
      const newText = tpl.template(sourcePrompt.text);
      // Check if already exists
      const already = existing.find(p => p.text === newText);
      if (already) continue;
      await storage.createPrompt({
        brandId,
        text: newText,
        category: tpl.type,
        intent: tpl.intent as any,
        difficulty: tpl.difficulty,
        weight: tpl.weight,
        source: 'llm_generation',
        isActive: true,
      } as any);
      generated++;
    }
  }

  log.info('Prompt rewriting complete', { generated });
  return { brandId, generated };
}