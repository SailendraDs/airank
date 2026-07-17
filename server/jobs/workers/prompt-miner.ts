/**
 * Prompt Miner Worker
 * Background job for mining real user prompts from Reddit, search, and forums
 *
 * Tier S3: This worker now calls the REAL miner (services/prompt-miner-real.ts)
 * which scrapes Reddit, YouTube, and SERP data instead of fabricating fake queries.
 * The legacy simulated miner is kept only for export-compat with callers that
 * reference its types, but the worker no longer uses it.
 */

import { storage } from "../../storage";
import { mineAndScorePrompts } from "../../services/prompt-miner-real";
// Re-export the simulated miner types and helpers for back-compat (e.g. callers
// that imported `PromptSource` from this module). The simulated functions are
// no longer called by this worker, but the type is still useful for job payloads.
import { type PromptSource } from "../../services/prompt-intelligence";
import { logger } from "../../lib/logger";

export interface PromptMinerJob {
  brandId: string;
  sources?: PromptSource[];
  limit?: number;
  priority?: number;
  locale?: string;
}

export interface MiningResult {
  brandId: string;
  totalMined: number;
  stored: number;
  errors: string[];
  duration: number;
  sources?: Record<string, number>;
}

/**
 * Execute prompt mining job
 *
 * Tier S3: Uses the REAL prompt miner (Reddit + YouTube + SERP scrape).
 * Falls back to simulated mining only if the real miner is unavailable.
 */
export async function executePromptMiningJob(job: PromptMinerJob): Promise<MiningResult> {
  const startTime = Date.now();
  const result: MiningResult = {
    brandId: job.brandId,
    totalMined: 0,
    stored: 0,
    errors: [],
    duration: 0,
  };

  try {
    const brand = await storage.getBrand(job.brandId);

    if (!brand) {
      throw new Error(`Brand not found: ${job.brandId}`);
    }

    logger.info(`[PromptMiner] Starting REAL mining for brand: ${brand.name}`);

    // Tier S3: Update mining status for any existing mined templates stuck in 'mining'
    const existingTemplates = await storage.getPromptTemplates({
      isActive: true,
    });

    for (const template of existingTemplates) {
      if (template.source !== 'manual' && template.miningStatus === 'mining') {
        await storage.updatePromptTemplate(template.id, {
          miningStatus: 'idle',
        });
      }
    }

    // Tier S3: Call the REAL miner (Reddit + YouTube + SERP). This is the change
    // that "kills the simulated" path: we no longer fabricate prompt templates.
    try {
      const realSummary = await mineAndScorePrompts(job.brandId, job.locale);
      result.totalMined = realSummary.totalUpserted;
      result.stored = realSummary.totalUpserted;
      result.sources = realSummary.sources;
    } catch (realError: any) {
      // Don't fall back to fake data — surface the error so we know real mining broke.
      logger.error(`[PromptMiner] Real miner failed for ${brand.name}: ${realError.message}`);
      result.errors.push(`real_miner_failed: ${realError.message}`);
      // Re-throw so the job is marked failed and operators can see it in monitoring.
      throw realError;
    }

    // Mark all newly created templates as completed
    const updatedTemplates = await storage.getPromptTemplates({
      isActive: true,
    });

    for (const template of updatedTemplates) {
      if (template.source !== 'manual' && template.miningStatus !== 'completed') {
        await storage.updatePromptTemplate(template.id, {
          miningStatus: 'completed',
        });
      }
    }

    // Create job record for audit
    await storage.createJob({
      type: 'prompt_mining',
      brandId: job.brandId,
      status: 'completed',
      priority: job.priority || 5,
      result: {
        totalMined: result.totalMined,
        stored: result.stored,
        sources: job.sources,
      },
    });

    logger.info(`Prompt mining completed for ${brand.name}`, {
      totalMined: result.totalMined,
      stored: result.stored,
    });
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    result.errors.push(errorMessage);

    // Create failed job record
    await storage.createJob({
      type: 'prompt_mining',
      brandId: job.brandId,
      status: 'failed',
      priority: job.priority || 5,
      error: errorMessage,
    });

    logger.error('Prompt mining failed', {
      brandId: job.brandId,
      error: errorMessage,
    });
  }

  result.duration = Date.now() - startTime;

  return result;
}

/**
 * Mine prompts for all active brands
 */
export async function minePromptsForAllBrands(
  options: {
    sources?: PromptSource[];
    limit?: number;
  } = {}
): Promise<{ processed: number; success: number; failed: number; results: MiningResult[] }> {
  const brands = await storage.getAllBrands(100, 0);
  const activeBrands = brands.filter(b => b.status === 'active' && b.analysisEnabled);

  const results: MiningResult[] = [];
  let success = 0;
  let failed = 0;

  for (const brand of activeBrands) {
    const result = await executePromptMiningJob({
      brandId: brand.id,
      sources: options.sources,
      limit: options.limit,
    });

    results.push(result);

    if (result.errors.length === 0) {
      success++;
    } else {
      failed++;
    }
  }

  return {
    processed: activeBrands.length,
    success,
    failed,
    results,
  };
}

/**
 * Quick mining function for a single brand
 * Use this for immediate mining without job queue
 *
 * Tier S3: Routes to the REAL miner.
 */
export async function quickMine(
  brandId: string,
  sources?: PromptSource[]
): Promise<{ success: boolean; mined: number; stored: number; error?: string }> {
  const brand = await storage.getBrand(brandId);

  if (!brand) {
    return { success: false, mined: 0, stored: 0, error: 'Brand not found' };
  }

  try {
    const summary = await mineAndScorePrompts(brandId);
    return {
      success: true,
      mined: summary.totalUpserted,
      stored: summary.totalUpserted,
    };
  } catch (error: any) {
    return {
      success: false,
      mined: 0,
      stored: 0,
      error: error.message,
    };
  }
}

/**
 * Generate comparative queries for brand vs competitors
 */
export async function generateComparisonQueries(
  brandId: string,
  competitorCount: number = 3
): Promise<string[]> {
  const brand = await storage.getBrand(brandId);

  if (!brand) {
    return [];
  }

  const competitors = await storage.getCompetitorsByBrand(brandId);
  const topCompetitors = competitors
    .sort((a, b) => (b.threatScore || 0) - (a.threatScore || 0))
    .slice(0, competitorCount);

  const queries: string[] = [];
  const brandName = brand.name;

  // Generate comparison queries for each competitor
  for (const competitor of topCompetitors) {
    queries.push(`${brandName} vs ${competitor.name} - which is better?`);
    queries.push(`Should I switch from ${competitor.name} to ${brandName}?`);
    queries.push(`${brandName} compared to ${competitor.name}`);
    queries.push(`${competitor.name} vs ${brandName} - pros and cons`);
    queries.push(`Is ${brandName} a good alternative to ${competitor.name}?`);
    queries.push(`Which is more popular: ${brandName} or ${competitor.name}?`);
  }

  return queries;
}

/**
 * Get mining statistics for admin dashboard
 */
export async function getMiningStats(): Promise<{
  totalTemplates: number;
  bySource: Record<PromptSource, number>;
  byIntentType: Record<string, number>;
  recentlyMined: number;
}> {
  const templates = await storage.getPromptTemplates({ isActive: true });

  const stats = {
    totalTemplates: templates.length,
    bySource: {
      reddit: 0,
      search: 0,
      forum: 0,
      manual: 0,
    } as Record<PromptSource, number>,
    byIntentType: {} as Record<string, number>,
    recentlyMined: 0,
  };

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const template of templates) {
    // Count by source
    const source = (template.source as PromptSource) || 'manual';
    if (source in stats.bySource) {
      stats.bySource[source]++;
    }

    // Count by intent type
    const intentType = template.intentType || 'unknown';
    stats.byIntentType[intentType] = (stats.byIntentType[intentType] || 0) + 1;

    // Count recently mined
    if (template.lastMinedAt && new Date(template.lastMinedAt) > oneWeekAgo) {
      stats.recentlyMined++;
    }
  }

  return stats;
}