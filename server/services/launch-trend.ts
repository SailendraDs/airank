import { storage } from '../storage';
import { CORE_SCAN_PROVIDERS } from '../lib/plan-providers';
import { getProviderReliabilitySummary } from './provider-reliability-summary';

export interface LaunchTrendSnapshot {
  brandId: string;
  brandName: string;
  verdict: string;
  scoreDirection: 'up' | 'down' | 'flat';
  currentScore: number;
  previousScore: number;
  scoreDelta: number;
  scoreHistory: Array<{
    id: string;
    date: string | Date | null;
    score: number;
    brandMentions: number;
    totalPrompts: number;
  }>;
  historicalConfidence: {
    status: 'ready' | 'partial' | 'blocked';
    score: number;
    snapshotCount: number;
    latestSnapshotAgeHours: number | null;
    baselineDays: number;
    evidence: string;
    action: string;
  };
  providerTrend: {
    freshEnterpriseProviders: number;
    enterpriseTargetProviders: number;
    failedEnterpriseProviders: number;
    latestRuns: Array<{
      id: string;
      provider: string;
      status: string;
      createdAt: string | Date | null;
      completedAt: string | Date | null;
    }>;
  };
  workflowTrend: {
    plannedActions: number;
    appliedActions: number;
    verifiedActions: number;
    pendingProofTasks: number;
  };
  scanTrend: {
    scanJobs: number;
    completedJobs: number;
    failedJobs: number;
    failureRate: number;
  };
  blockers: string[];
  nextActions: string[];
  generatedAt: string;
}

export function normalizeLaunchProvider(value: unknown) {
  const text = String(value || '').toLowerCase();
  if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
  if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
  if (text.includes('google') || text.includes('gemini')) return 'google';
  if (text.includes('perplexity')) return 'perplexity';
  if (text.includes('deepseek')) return 'deepseek';
  if (text.includes('grok')) return 'grok';
  return text || 'unknown';
}

export async function buildLaunchTrendSnapshot(brand: any): Promise<LaunchTrendSnapshot> {
  const brandId = String(brand.id);
  const [scores, providerSummary, jobs, optimizations] = await Promise.all([
    storage.getVisibilityScoresByBrand(brandId, undefined, 8).catch(() => []),
    getProviderReliabilitySummary(brandId).catch(() => null),
    storage.getJobsByBrand(brandId, 200).catch(() => []),
    storage.getOptimizationLogsByBrand(brandId, 200).catch(() => []),
  ]);

  const data = (brand.brandDevData && typeof brand.brandDevData === 'object') ? brand.brandDevData : {};
  const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
  const currentScore = Number((scores as any[])[0]?.overallScore || 0);
  const previousScore = Number((scores as any[])[1]?.overallScore ?? currentScore);
  const scoreDelta = Math.round((currentScore - previousScore) * 10) / 10;
  const scoreDirection = scoreDelta > 0 ? 'up' : scoreDelta < 0 ? 'down' : 'flat';

  const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
  const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
  const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
  const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
  const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
  const pendingProofTasks = verificationTasks.filter((task: any) => task.status === 'pending').length;
  const scoreHistory = (scores as any[]).slice(0, 8).map((score: any) => ({
    id: score.id,
    date: score.createdAt || score.calculatedAt || null,
    score: Number(score.overallScore || 0),
    brandMentions: Number(score.mentionedPrompts || 0),
    totalPrompts: Number(score.totalPrompts || 0),
  }));
  const snapshotDates = scoreHistory
    .map((score) => score.date ? new Date(score.date) : null)
    .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())))
    .sort((a, b) => b.getTime() - a.getTime());
  const latestSnapshotAgeHours = snapshotDates[0]
    ? Math.round(((Date.now() - snapshotDates[0].getTime()) / 36e5) * 10) / 10
    : null;
  const oldestSnapshot = snapshotDates[snapshotDates.length - 1] || null;
  const baselineDays = snapshotDates[0] && oldestSnapshot
    ? Math.max(0, Math.round(((snapshotDates[0].getTime() - oldestSnapshot.getTime()) / 86400000) * 10) / 10)
    : 0;
  const snapshotDepthScore = Math.min(45, scoreHistory.length * 9);
  const freshnessScore = latestSnapshotAgeHours == null ? 0 : latestSnapshotAgeHours <= 72 ? 30 : latestSnapshotAgeHours <= 168 ? 18 : 6;
  const baselineScore = baselineDays >= 21 ? 25 : baselineDays >= 7 ? 15 : baselineDays > 0 ? 8 : 0;
  const historicalConfidenceScore = Math.min(100, snapshotDepthScore + freshnessScore + baselineScore);
  const historicalConfidenceStatus: LaunchTrendSnapshot['historicalConfidence']['status'] = historicalConfidenceScore >= 75
    ? 'ready'
    : historicalConfidenceScore >= 40
      ? 'partial'
      : 'blocked';
  const historicalConfidence = {
    status: historicalConfidenceStatus,
    score: historicalConfidenceScore,
    snapshotCount: scoreHistory.length,
    latestSnapshotAgeHours,
    baselineDays,
    evidence: `${scoreHistory.length} visibility snapshot${scoreHistory.length === 1 ? '' : 's'}, ${latestSnapshotAgeHours == null ? 'no recent snapshot' : `${latestSnapshotAgeHours}h latest age`}, ${baselineDays} baseline day${baselineDays === 1 ? '' : 's'}`,
    action: historicalConfidenceStatus === 'ready'
      ? 'Use score movement in stakeholder reporting with weekly trend monitoring.'
      : scoreHistory.length < 2
        ? 'Capture at least two visibility snapshots before claiming movement.'
        : latestSnapshotAgeHours == null || latestSnapshotAgeHours > 168
          ? 'Run a fresh visibility scoring pass before using trend claims.'
          : 'Keep weekly snapshots running until at least 7 baseline days exist.',
  };
  const scanTypes = new Set(['llm_sampling', 'citation_extraction', 'visibility_scoring', 'alert_evaluation', 'browser_sampling', 'prompt_volume_scoring']);
  const scanJobs = (jobs as any[]).filter((job: any) => scanTypes.has(String(job.type || '')));
  const completedJobs = scanJobs.filter((job: any) => String(job.status || '').toLowerCase() === 'completed').length;
  const failedJobs = scanJobs.filter((job: any) => String(job.status || '').toLowerCase() === 'failed').length;
  const latestRuns = providerSummary?.latestRuns || [];
  const blockers = [
    freshEnterpriseProviders.length < 4 ? `${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh` : '',
    failedEnterpriseProviders.length > 0 ? `${failedEnterpriseProviders.length} enterprise provider${failedEnterpriseProviders.length === 1 ? '' : 's'} failing` : '',
    verifiedActions === 0 ? 'No verified actions yet' : '',
    pendingProofTasks > 0 ? `${pendingProofTasks} pending proof task${pendingProofTasks === 1 ? '' : 's'}` : '',
    failedJobs > 0 ? `${failedJobs} failed scan job${failedJobs === 1 ? '' : 's'}` : '',
    historicalConfidence.status === 'blocked' ? `Trend confidence blocked: ${historicalConfidence.evidence}` : '',
  ].filter(Boolean);
  const verdict = blockers.length === 0 && scoreDelta >= 0
    ? 'Launch trend healthy'
    : scoreDelta > 0
      ? 'Improving with launch blockers'
      : 'Trend needs action';

  return {
    brandId,
    brandName: brand.name,
    verdict,
    scoreDirection,
    currentScore,
    previousScore,
    scoreDelta,
    scoreHistory,
    historicalConfidence,
    providerTrend: {
      freshEnterpriseProviders: freshEnterpriseProviders.length,
      enterpriseTargetProviders: CORE_SCAN_PROVIDERS.length,
      failedEnterpriseProviders: failedEnterpriseProviders.length,
      latestRuns,
    },
    workflowTrend: {
      plannedActions,
      appliedActions,
      verifiedActions,
      pendingProofTasks,
    },
    scanTrend: {
      scanJobs: scanJobs.length,
      completedJobs,
      failedJobs,
      failureRate: scanJobs.length ? Math.round((failedJobs / scanJobs.length) * 100) : 0,
    },
    blockers,
    nextActions: [
      freshEnterpriseProviders.length < 4 ? 'Restore enterprise provider coverage before claiming multi-engine readiness.' : '',
      verifiedActions === 0 ? 'Mark one implemented fix as applied, then verify with scan evidence.' : '',
      scoreDelta <= 0 ? 'Run a fresh sampling sweep after fixes to create measurable upward movement.' : '',
      historicalConfidence.status !== 'ready' ? historicalConfidence.action : '',
    ].filter(Boolean),
    generatedAt: new Date().toISOString(),
  };
}
