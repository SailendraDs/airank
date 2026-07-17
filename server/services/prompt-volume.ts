// Prompt-volume scoring (Epic C2) + opt-in aggregate dataset (Epic O).
// C2: derives a demand/volume score per prompt from mined-prompt demand signals
//     (and SERP-related coverage) and writes it back to prompts.priorityScore.
// O:  rebuilds a k-anonymized aggregate dataset across opted-in brands.

import { storage } from '../storage';
import { logger } from '../lib/logger';

const AGGREGATE_K = parseInt(process.env.AGGREGATE_K || '5', 10);

function normalize(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Score prompt volumes for a brand from mined-prompt demand signals. */
export async function scorePromptVolumes(brandId: string): Promise<{ brandId: string; scored: number }> {
  const prompts = await storage.getPromptsByBrand(brandId);
  const mined = await storage.getMinedPromptsByBrand(brandId, 1000);

  // Index mined demand by normalized query for quick matching.
  const demandByQuery = new Map<string, number>();
  for (const m of mined) {
    demandByQuery.set(m.normalizedQuery, Math.max(demandByQuery.get(m.normalizedQuery) || 0, m.demandSignal || 0));
  }

  let scored = 0;
  for (const p of prompts) {
    const key = normalize(p.text);
    let demand = demandByQuery.get(key);
    if (demand === undefined) {
      // Partial match: any mined prompt whose query is contained in / contains this prompt.
      for (const [mq, d] of demandByQuery) {
        if (mq.includes(key) || key.includes(mq)) { demand = Math.max(demand || 0, d); }
      }
    }
    if (demand === undefined) continue;
    const volumeScore = Math.round(Math.min(1, demand) * 100);
    await storage.updatePrompt(p.id, { priorityScore: volumeScore } as any);
    scored++;
  }

  logger.info(`[PromptVolume] brand=${brandId} scored=${scored}/${prompts.length}`);
  return { brandId, scored };
}

/**
 * Rebuild the opt-in aggregate dataset (Epic O).
 * Aggregates mined-prompt demand across brands that opted in, grouped by
 * (region, industry, intentType). Only groups meeting the k-anonymity threshold
 * are exposed via storage.getAggregateDataset().
 */
export async function rebuildAggregateDataset(region = 'IN'): Promise<{ groups: number; exposed: number }> {
  const contributors = await storage.getAggregateContributorBrands();

  interface Acc {
    promptCount: number;
    demandSum: number;
    prioritySum: number;
    contributors: Set<string>;
  }
  const groups = new Map<string, Acc>();

  for (const brand of contributors) {
    const industry = (brand.industry || 'unknown').toLowerCase();
    const mined = await storage.getMinedPromptsByBrand(brand.id, 1000);
    for (const m of mined) {
      const key = `${region}::${industry}::${m.intentType}`;
      let acc = groups.get(key);
      if (!acc) { acc = { promptCount: 0, demandSum: 0, prioritySum: 0, contributors: new Set() }; groups.set(key, acc); }
      acc.promptCount++;
      acc.demandSum += m.demandSignal || 0;
      acc.prioritySum += m.priorityScore || 0;
      acc.contributors.add(brand.id);
    }
  }

  await storage.clearAggregateDataset();
  let exposed = 0;
  for (const [key, acc] of groups) {
    const [reg, industry, intentType] = key.split('::');
    const contributorCount = acc.contributors.size;
    await storage.createAggregateDatasetEntry({
      region: reg,
      industry,
      intentType,
      promptCount: acc.promptCount,
      avgDemandSignal: acc.promptCount ? acc.demandSum / acc.promptCount : 0,
      avgPriorityScore: acc.promptCount ? acc.prioritySum / acc.promptCount : 0,
      contributorCount,
      rebuiltAt: new Date(),
    } as any);
    if (contributorCount >= AGGREGATE_K) exposed++;
  }

  logger.info(`[Aggregate] groups=${groups.size} exposed(k>=${AGGREGATE_K})=${exposed} contributors=${contributors.length}`);
  return { groups: groups.size, exposed };
}
