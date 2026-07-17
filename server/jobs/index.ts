// Jobs System Index

export * from './queue';
export * from './workers';

import { getJobQueue } from './queue';
import { registerAllWorkers } from './workers';
import { storage } from '../storage';

export function initializeJobSystem(): void {
  console.log('[Jobs] Initializing job system...');
  
  const queue = getJobQueue();
  
  registerAllWorkers();
  
  setInterval(() => {
    queue.clearCompletedJobs(24);
  }, 60 * 60 * 1000);
  
  startAnalysisScheduler();
  
  console.log('[Jobs] Job system initialized successfully');
  console.log('[Jobs] Queue stats:', queue.getStats());
}

export async function triggerBrandEnrichment(brandId: string, priority: number = 5): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('brand_enrichment', { brandId }, priority);
}

export async function triggerLLMSampling(
  brandId: string,
  promptId: string,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('llm_sampling', { brandId, promptId }, priority);
}

export async function triggerCompetitorSampling(
  brandId: string,
  competitorId: string,
  promptId: string,
  priority: number = 4
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('llm_sampling', { brandId, promptId, competitorId }, priority);
}

export async function triggerGapAnalysis(
  brandId: string,
  period?: string,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('gap_analysis', { brandId, period }, priority);
}

export async function triggerVisibilityScoring(
  brandId: string,
  period?: 'day' | 'week' | 'month',
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('visibility_scoring', { brandId, period }, priority);
}

export async function triggerRecommendations(
  brandId: string,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('recommendation_generation', { brandId }, priority);
}

export async function triggerCitationExtraction(
  brandId: string,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('citation_extraction', { brandId }, priority);
}

export async function triggerCompetitorEnrichment(
  brandId: string,
  competitorId?: string,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('competitor_enrichment', { brandId, competitorId }, priority);
}

export async function triggerTopicGeneration(
  brandId: string,
  count: number = 10,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('topic_generation', { brandId, count }, priority);
}

/**
 * Tier S3: Trigger REAL prompt mining (Reddit + YouTube + SERP) for a brand.
 * Replaces the simulated-miner path that was being called by the legacy
 * `executePromptMiningJob` worker.
 */
export async function triggerPromptMining(
  brandId: string,
  options: { locale?: string; priority?: number } = {}
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('prompt_mining', {
    brandId,
    locale: options.locale,
  }, options.priority ?? 5);
}

export async function triggerQueryGeneration(
  brandId: string,
  topicId?: string,
  queriesPerTopic: number = 5,
  priority: number = 5
): Promise<string> {
  const queue = getJobQueue();
  return await queue.addJob('query_generation', { brandId, topicId, queriesPerTopic }, priority);
}

export async function triggerFullAnalysis(
  brandId: string,
  priority: number = 8
): Promise<{ jobIds: string[] }> {
  const jobIds = [];
  
  jobIds.push(await triggerBrandEnrichment(brandId, priority));
  jobIds.push(await triggerVisibilityScoring(brandId, 'week', priority));
  jobIds.push(await triggerGapAnalysis(brandId, 'month', priority));
  jobIds.push(await triggerRecommendations(brandId, priority));
  
  return { jobIds };
}

export async function triggerFullPipeline(
  brandId: string,
  priority: number = 8
): Promise<{ jobIds: string[], message: string }> {
  console.log(`[Pipeline] Starting full analysis pipeline for brand ${brandId}`);
  const jobIds: string[] = [];

  try {
    jobIds.push(await triggerBrandEnrichment(brandId, priority + 2));
    jobIds.push(await triggerCompetitorEnrichment(brandId, undefined, priority + 1));

    const prompts = await storage.getPromptsByBrand(brandId);
    if (prompts.length > 0) {
      for (const prompt of prompts) {
        jobIds.push(await triggerLLMSampling(brandId, prompt.id, priority));
      }

      // Independent competitor sampling — run same prompts for each tracked competitor
      const competitors = await storage.getCompetitorsByBrand(brandId);
      const trackedCompetitors = competitors.filter((c: any) => c.isTracked);
      for (const competitor of trackedCompetitors) {
        for (const prompt of prompts) {
          jobIds.push(await triggerCompetitorSampling(brandId, competitor.id, prompt.id, priority - 1));
        }
      }
    }

    jobIds.push(await triggerCitationExtraction(brandId, priority - 1));
    jobIds.push(await triggerVisibilityScoring(brandId, 'week', priority - 1));
    jobIds.push(await triggerGapAnalysis(brandId, 'month', priority - 2));
    jobIds.push(await triggerRecommendations(brandId, priority - 3));

    console.log(`[Pipeline] Queued ${jobIds.length} jobs for brand ${brandId}`);

    await storage.updateBrand(brandId, {
      lastAnalysis: new Date(),
      nextScheduledAnalysis: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return {
      jobIds,
      message: `Full pipeline started: ${jobIds.length} jobs queued (${prompts.length} prompts for LLM sampling)`,
    };
  } catch (error: any) {
    console.error(`[Pipeline] Error starting pipeline for brand ${brandId}:`, error.message);
    throw error;
  }
}

let lastAlertEvalAt = 0;
const ALERT_EVAL_INTERVAL = 15 * 60 * 1000;

function startAnalysisScheduler(): void {
  const SCHEDULER_INTERVAL = 60 * 1000;

  console.log('[Scheduler] Starting analysis scheduler (checks every minute)');
  console.log('[Scheduler] Paid accounts: daily at 11:45 PM | Free accounts: monthly at 11:45 AM');

  setInterval(async () => {
    try {
      await runScheduledAnalyses();
    } catch (error: any) {
      console.error('[Scheduler] Error running scheduled analyses:', error.message);
    }
    try {
      const { runDueReports } = await import('../services/report-runner');
      await runDueReports();
    } catch (error: any) {
      console.error('[Scheduler] Error running due reports:', error.message);
    }
    try {
      const { runDueProductSamplingAutomation } = await import('../services/product-readiness');
      const summary = await runDueProductSamplingAutomation();
      if (summary.dueBrands > 0 || summary.queuedJobs > 0) {
        console.log(`[Scheduler] Product sampling automation checked ${summary.checkedBrands} brands, due=${summary.dueBrands}, queued=${summary.queuedJobs}`);
      }
    } catch (error: any) {
      console.error('[Scheduler] Error running product sampling automation:', error.message);
    }
    try {
      if (Date.now() - lastAlertEvalAt >= ALERT_EVAL_INTERVAL) {
        lastAlertEvalAt = Date.now();
        await getJobQueue().addJob('alert_evaluation', {} as any, 4);
      }
    } catch (error: any) {
      console.error('[Scheduler] Error enqueuing alert evaluation:', error.message);
    }
  }, SCHEDULER_INTERVAL);

  setTimeout(async () => {
    try {
      console.log('[Scheduler] Running startup catch-up check...');
      await runScheduledAnalyses();
    } catch (error: any) {
      console.error('[Scheduler] Error on startup catch-up:', error.message);
    }
  }, 30000);
}

function isPaidScheduleDue(now: Date, lastAnalysis: Date | null): boolean {
  if (!lastAnalysis) return false;

  const last = new Date(lastAnalysis);
  const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  if (diffHours < 20) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  if (hours === 23 && minutes === 45) return true;

  if (diffHours >= 25) return true;

  return false;
}

function isFreeScheduleDue(now: Date, lastAnalysis: Date | null): boolean {
  if (!lastAnalysis) return false;

  const last = new Date(lastAnalysis);
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 28) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  if (hours === 11 && minutes === 45) return true;

  if (diffDays >= 32) return true;

  return false;
}

async function runScheduledAnalyses(): Promise<void> {
  try {
    const brands = await storage.getAllBrands();
    const now = new Date();
    let triggered = 0;

    for (const brand of brands) {
      if (brand.status !== 'active') continue;
      if (brand.analysisEnabled === false) continue;

      const schedule = await storage.getAnalysisSchedule(brand.id);
      if (schedule && !schedule.isEnabled) continue;

      const isPaid = brand.tier && brand.tier !== 'free';
      let isDue = false;

      if (isPaid) {
        isDue = isPaidScheduleDue(now, brand.lastAnalysis);
      } else {
        isDue = isFreeScheduleDue(now, brand.lastAnalysis);
      }

      if (isDue) {
        console.log(`[Scheduler] Triggering ${isPaid ? 'daily' : 'monthly'} analysis for brand ${brand.name} (${brand.id}, tier: ${brand.tier || 'free'})`);

        try {
          await triggerFullPipeline(brand.id, 5);
          triggered++;

          if (schedule) {
            await storage.updateAnalysisSchedule(schedule.id, {
              lastRun: now,
              nextRun: isPaid ? getNextDailyRun() : getNextMonthlyRun(),
              runCount: (schedule.runCount || 0) + 1,
            });
          }
        } catch (error: any) {
          console.error(`[Scheduler] Failed to trigger analysis for brand ${brand.id}:`, error.message);
          if (schedule) {
            await storage.updateAnalysisSchedule(schedule.id, {
              failCount: (schedule.failCount || 0) + 1,
            });
          }
        }
      }
    }

    if (triggered > 0) {
      console.log(`[Scheduler] Triggered ${triggered} analyses.`);
    }
  } catch (error: any) {
    console.error('[Scheduler] Error:', error.message);
  }
}

function getNextDailyRun(): Date {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(23, 45, 0, 0);
  return next;
}

function getNextMonthlyRun(): Date {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  next.setHours(11, 45, 0, 0);
  return next;
}
