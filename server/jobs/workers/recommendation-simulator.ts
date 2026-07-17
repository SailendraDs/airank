// Recommendation Simulator Worker (Tier S5 — AI Recommendation Share)
//
// For a brand, take its tracked prompts (prioritised by high-weight intents
// like buying/comparison), ask each configured LLM "what would you recommend
// for this query?", parse the ranked list, and record where (if anywhere)
// the brand appeared.  The aggregated `is_recommended` rate is the
// AI Recommendation Share surfaced to the user.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { logger } from '../../lib/logger';
import { INTENT_WEIGHT_TABLE } from './visibility-scoring';
import { db } from '../../db';
import { prompts } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import type { LLMMessage, LLMProviderName } from '../../integrations/llm';

export interface RecommendationSimulatorPayload {
  brandId: string;
  // Optional overrides; defaults are tuned for monthly simulation runs.
  maxPrompts?: number;
  maxProviders?: number;
  forceRun?: boolean;
}

const PROVIDER_LIST: LLMProviderName[] = [
  'openai', 'anthropic', 'google', 'perplexity', 'grok', 'deepseek',
];

function parseRankedBrands(response: string, brandName: string): {
  rank: number | null;
  totalBrandsInResponse: number;
  topBrands: string[];
} {
  // Split on newlines; detect numbered list patterns.
  const lines = response
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const topBrands: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Accept: "1. Notion", "1) Notion", "- Notion", "* Notion", "• Notion"
    const numbered = line.match(/^\s*(\d{1,2})[.)]\s+(.+?)\s*$/);
    const bulleted = line.match(/^\s*[-*•]\s+(.+?)\s*$/);
    let name: string | null = null;
    if (numbered) name = numbered[2];
    else if (bulleted) name = bulleted[1];
    if (!name) continue;
    // Strip trailing parentheticals like " (G2 leader)"
    name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (name.length < 2 || name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topBrands.push(name);
    if (topBrands.length >= 10) break;
  }

  // Find the brand in the list
  const brandLower = brandName.toLowerCase();
  const idx = topBrands.findIndex(n => {
    const nl = n.toLowerCase();
    return nl === brandLower || nl.includes(brandLower) || brandLower.includes(nl);
  });

  return {
    rank: idx >= 0 ? idx + 1 : null,
    totalBrandsInResponse: topBrands.length,
    topBrands: topBrands.slice(0, 10),
  };
}

function buildSystemPrompt(): string {
  return [
    'You are an expert market analyst.',
    'When asked for a recommendation, list your top picks as a numbered list.',
    'Format each pick on its own line like: "1. Brand Name"',
    'Give at most 8 picks. Be specific to real, well-known brands. Do not add commentary after the list.',
  ].join(' ');
}

export async function recommendationSimulatorWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as RecommendationSimulatorPayload;
  const { brandId, maxPrompts = 8, maxProviders = 4 } = payload;

  logger.info(`[RecommendationSim] Starting for brand ${brandId}`);

  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }
  const brandName = brand.name;

  // 1) Pick the prompts to simulate. Prefer high-weight intents.
  const candidatePrompts = await db
    .select({
      id: prompts.id,
      text: prompts.text,
      intent: prompts.intent,
      priorityScore: prompts.priorityScore,
    })
    .from(prompts)
    .where(and(
      eq(prompts.brandId, brandId),
      eq(prompts.status, 'active'),
    ))
    .limit(200);

  if (candidatePrompts.length === 0) {
    logger.info(`[RecommendationSim] No active prompts for brand ${brandId}`);
    return { brandId, simulated: 0, reason: 'no_active_prompts' };
  }

  // Rank by intent weight, then by priorityScore
  const ranked = candidatePrompts
    .map(p => ({
      ...p,
      weight: INTENT_WEIGHT_TABLE[p.intent ?? 'discovery'] ?? 1.0,
    }))
    .sort((a, b) => b.weight - a.weight || (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
    .slice(0, maxPrompts);

  // 2) Resolve available providers from the integrations singleton
  let availableProviders: LLMProviderName[] = [];
  try {
    const integrations = getIntegrations();
    const llm = integrations?.llm;
    if (llm && typeof llm.getAvailableProviders === 'function') {
      availableProviders = llm.getAvailableProviders() as LLMProviderName[];
    }
  } catch (err: any) {
    logger.warn(`[RecommendationSim] Integrations not initialized: ${err.message}`);
  }

  const providers = availableProviders.filter(p => PROVIDER_LIST.includes(p)).slice(0, maxProviders);

  if (providers.length === 0) {
    logger.warn(`[RecommendationSim] No LLM providers configured for brand ${brandId}`);
    return { brandId, simulated: 0, reason: 'no_providers' };
  }

  // 3) Run simulation. For each prompt, fan out to all providers in parallel.
  const systemPrompt = buildSystemPrompt();
  let totalInserted = 0;
  const providerStats: Record<string, { simulated: number; recommended: number }> = {};

  for (const prompt of ranked) {
    const messages: LLMMessage[] = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt.text },
    ];

    await Promise.all(providers.map(async (providerName) => {
      try {
        const integrations = getIntegrations();
        const llm = integrations?.llm;
        if (!llm?.chat) {
          logger.warn(`[RecommendationSim] LLM client not available for ${providerName}`);
          return;
        }
        const response = await llm.chat(providerName, messages, { maxTokens: 600, temperature: 0.4 });
        if (!response?.content) return;
        const parsed = parseRankedBrands(response.content, brandName);
        const isRecommended = (parsed.rank ?? 999) <= 3;

        await storage.insertRecommendationRank({
          brandId,
          promptId: prompt.id,
          promptText: prompt.text,
          llmProvider: providerName,
          llmModel: response.model ?? null,
          rank: parsed.rank,
          isRecommended,
          totalBrandsInResponse: parsed.totalBrandsInResponse,
          rawResponse: response.content.slice(0, 4000),
          topBrands: parsed.topBrands,
          intent: prompt.intent ?? null,
        });

        totalInserted++;
        providerStats[providerName] = providerStats[providerName] ?? { simulated: 0, recommended: 0 };
        providerStats[providerName].simulated++;
        if (isRecommended) providerStats[providerName].recommended++;
      } catch (err: any) {
        logger.warn(`[RecommendationSim] ${providerName} failed on prompt ${prompt.id}: ${err.message}`);
      }
    }));
  }

  logger.info(`[RecommendationSim] Done for brand ${brandId}: ${totalInserted} rows, providers=${Object.keys(providerStats).join(',')}`);

  return {
    brandId,
    simulated: totalInserted,
    providers: providerStats,
    promptCount: ranked.length,
  };
}
