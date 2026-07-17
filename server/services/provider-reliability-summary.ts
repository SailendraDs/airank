import { sql } from 'drizzle-orm';
import { db } from '../db';
import { CORE_SCAN_PROVIDERS } from '../lib/plan-providers';
import { llmAnswers, promptRuns } from '@shared/schema';

export type ProviderReliabilitySummary = {
  freshEnterpriseProviders: string[];
  failedEnterpriseProviders: string[];
  enterpriseTargetProviders: number;
  providers: Array<{
    provider: string;
    completedRuns: number;
    failedRuns: number;
    runningRuns: number;
    totalAnswers: number;
    freshAnswers: number;
    latestStatus: string | null;
    lastRunAt: Date | null;
    lastAnswerAt: Date | null;
  }>;
  latestRuns: Array<{
    id: string;
    provider: string;
    status: string;
    createdAt: Date | string | null;
    completedAt: Date | string | null;
  }>;
};

export function normalizeReliabilityProvider(value: unknown) {
  const text = String(value || '').toLowerCase();
  if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
  if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
  if (text.includes('google') || text.includes('gemini')) return 'google';
  if (text.includes('perplexity')) return 'perplexity';
  if (text.includes('deepseek')) return 'deepseek';
  if (text.includes('grok')) return 'grok';
  return text || 'unknown';
}

function countValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getProviderReliabilitySummary(brandId: string): Promise<ProviderReliabilitySummary> {
  const freshSince = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const [runResult, answerResult, latestRunResult] = await Promise.all([
    db.execute(sql`
      SELECT
        llm_provider AS provider,
        COUNT(*) FILTER (WHERE lower(status) = 'completed') AS completed_runs,
        COUNT(*) FILTER (WHERE lower(status) = 'failed') AS failed_runs,
        COUNT(*) FILTER (WHERE lower(status) IN ('running', 'pending')) AS running_runs,
        (ARRAY_AGG(lower(status) ORDER BY COALESCE(completed_at, started_at, created_at) DESC NULLS LAST))[1] AS latest_status,
        MAX(COALESCE(completed_at, started_at, created_at)) AS last_run_at
      FROM ${promptRuns}
      WHERE brand_id = ${brandId}
      GROUP BY llm_provider
    `),
    db.execute(sql`
      SELECT
        llm_provider AS provider,
        COUNT(*) AS total_answers,
        COUNT(*) FILTER (WHERE created_at >= ${freshSince}) AS fresh_answers,
        MAX(created_at) AS last_answer_at
      FROM ${llmAnswers}
      WHERE brand_id = ${brandId}
      GROUP BY llm_provider
    `),
    db.execute(sql`
      SELECT id, llm_provider AS provider, status, created_at, completed_at
      FROM ${promptRuns}
      WHERE brand_id = ${brandId}
      ORDER BY created_at DESC
      LIMIT 10
    `),
  ]);

  const byProvider = new Map<string, ProviderReliabilitySummary['providers'][number]>();
  for (const provider of CORE_SCAN_PROVIDERS) {
    byProvider.set(provider, {
      provider,
      completedRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      totalAnswers: 0,
      freshAnswers: 0,
      latestStatus: null,
      lastRunAt: null,
      lastAnswerAt: null,
    });
  }

  for (const row of ((runResult as any).rows || [])) {
    const provider = normalizeReliabilityProvider(row.provider);
    const current = byProvider.get(provider) || {
      provider,
      completedRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      totalAnswers: 0,
      freshAnswers: 0,
      latestStatus: null,
      lastRunAt: null,
      lastAnswerAt: null,
    };
    const lastRunAt = dateValue(row.last_run_at);
    byProvider.set(provider, {
      ...current,
      completedRuns: current.completedRuns + countValue(row.completed_runs),
      failedRuns: current.failedRuns + countValue(row.failed_runs),
      runningRuns: current.runningRuns + countValue(row.running_runs),
      latestStatus: String(row.latest_status || current.latestStatus || ''),
      lastRunAt: lastRunAt && (!current.lastRunAt || lastRunAt > current.lastRunAt) ? lastRunAt : current.lastRunAt,
    });
  }

  for (const row of ((answerResult as any).rows || [])) {
    const provider = normalizeReliabilityProvider(row.provider);
    const current = byProvider.get(provider) || {
      provider,
      completedRuns: 0,
      failedRuns: 0,
      runningRuns: 0,
      totalAnswers: 0,
      freshAnswers: 0,
      latestStatus: null,
      lastRunAt: null,
      lastAnswerAt: null,
    };
    const lastAnswerAt = dateValue(row.last_answer_at);
    byProvider.set(provider, {
      ...current,
      totalAnswers: current.totalAnswers + countValue(row.total_answers),
      freshAnswers: current.freshAnswers + countValue(row.fresh_answers),
      lastAnswerAt: lastAnswerAt && (!current.lastAnswerAt || lastAnswerAt > current.lastAnswerAt) ? lastAnswerAt : current.lastAnswerAt,
    });
  }

  const providers = CORE_SCAN_PROVIDERS.map((provider) => byProvider.get(provider)!).filter(Boolean);
  return {
    freshEnterpriseProviders: providers.filter((provider) => provider.freshAnswers > 0).map((provider) => provider.provider),
    failedEnterpriseProviders: providers
      .filter((provider) => provider.latestStatus === 'failed' || (provider.completedRuns === 0 && provider.failedRuns > 0))
      .map((provider) => provider.provider),
    enterpriseTargetProviders: CORE_SCAN_PROVIDERS.length,
    providers,
    latestRuns: ((latestRunResult as any).rows || []).map((row: any) => ({
      id: String(row.id || ''),
      provider: normalizeReliabilityProvider(row.provider),
      status: String(row.status || ''),
      createdAt: row.created_at || null,
      completedAt: row.completed_at || null,
    })),
  };
}
