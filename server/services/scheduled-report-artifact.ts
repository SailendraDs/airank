import { storage } from '../storage';
import { CORE_SCAN_PROVIDERS } from '../lib/plan-providers';
import { buildQueryFanoutIntelligence } from './query-fanout-intelligence';
import { buildLaunchTrendSnapshot } from './launch-trend';
import { getProviderReliabilitySummary } from './provider-reliability-summary';
import { db } from '../db';
import { promptRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type ScheduledReportType =
  | 'executive'
  | 'full'
  | 'action'
  | 'ai_search_opportunity'
  | 'launch_readiness'
  | 'competitive_parity'
  | 'market_opportunity'
  | 'verification_evidence'
  | 'scan_operations'
  | 'production_readiness'
  | 'product_visibility';

export function scheduledReportTypeLabel(reportType: string) {
  const labels: Record<string, string> = {
    executive: 'Executive Report',
    full: 'Full Analysis Report',
    action: 'Action Plan Report',
    ai_search_opportunity: 'AI Search Opportunity Brief',
    launch_readiness: 'Launch Readiness Report',
    competitive_parity: 'Competitive Parity Report',
    market_opportunity: 'Market Opportunity Report',
    verification_evidence: 'Verification Evidence Report',
    scan_operations: 'Scan Operations Report',
    production_readiness: 'Production Readiness Audit',
    product_visibility: 'Product Visibility Report',
  };
  return labels[reportType] || 'AI Visibility Report';
}

export function scheduledReportTypeDescription(reportType: string) {
  const descriptions: Record<string, string> = {
    launch_readiness: 'Launch gates, blockers, product/agent readiness, verification debt, and monitoring status.',
    ai_search_opportunity: 'Prompt demand, competitor pressure, citation signals, and action workflow priorities for AI-search growth.',
    competitive_parity: 'AthenaHQ, Peec.ai, Profound, and Semrush-style capability parity against the current workspace.',
    market_opportunity: 'Prioritized prompt, citation, source, launch, and product opportunities for weekly execution.',
    verification_evidence: 'Proof tasks showing which applied fixes are verified, still failing, or waiting for fresh evidence.',
    scan_operations: 'Provider freshness, prompt freshness, schedule health, failed jobs, and monitoring next actions.',
    production_readiness: 'Hard production launch verdict across provider reliability, integrations, monitoring, proof workflow, attribution, reporting cadence, and launch trend confidence.',
    product_visibility: 'Seller/product readiness, SKU visibility, pilot gates, benchmark pressure, and product launch next actions.',
  };
  return descriptions[reportType] || 'Visibility score, competitors, gaps, and recommended actions.';
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function newestDate(items: any[], fields: string[]) {
  let newest: Date | null = null;
  for (const item of items) {
    for (const field of fields) {
      const raw = item?.[field];
      if (!raw) continue;
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime()) && (!newest || date > newest)) newest = date;
    }
  }
  return newest;
}

function ageHours(date: Date | null) {
  return date ? Math.round(((Date.now() - date.getTime()) / 36e5) * 10) / 10 : null;
}

function normalizeProvider(value: unknown) {
  const text = String(value || '').toLowerCase();
  if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
  if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
  if (text.includes('google') || text.includes('gemini')) return 'google';
  if (text.includes('perplexity')) return 'perplexity';
  if (text.includes('deepseek')) return 'deepseek';
  if (text.includes('grok')) return 'grok';
  return text || 'unknown';
}

function sourceLabel(actionType: string) {
  if (actionType.startsWith('agent_readiness:')) return 'Agent Readiness';
  if (actionType.startsWith('answer_intelligence:')) return 'Answer Intelligence';
  if (actionType.startsWith('audience_persona:')) return 'Audience Persona';
  if (actionType.startsWith('citation_opportunity:')) return 'Citation Opportunity';
  if (actionType.startsWith('query_fanout:')) return 'Query Fanout';
  if (actionType.startsWith('market_opportunity:')) return 'Market Opportunity';
  if (actionType.startsWith('gap_opportunity:')) return 'Gap Opportunity';
  if (actionType.startsWith('product_pilot:')) return 'Product Readiness';
  if (actionType.startsWith('provider_recovery:')) return 'Provider Recovery';
  return 'Action Workflow';
}

function titleFromOptimization(description: unknown) {
  const firstLine = String(description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || 'Verify published change';
  return firstLine
    .replace(/^Market Opportunity:\s*/i, '')
    .replace(/^Agent Readiness:\s*/i, '')
    .replace(/^Audience Persona:\s*/i, '')
    .replace(/^Query Fanout:\s*/i, '')
    .replace(/^Product Pilot:\s*/i, '')
    .replace(/^Provider Recovery:\s*/i, '');
}

function providerStatus(hours: number | null, failedRuns: number, completedRuns: number, answerCount = 0) {
  if (failedRuns > 0 && completedRuns === 0) return 'failed';
  if (completedRuns > 0 && answerCount === 0) return 'failed';
  if (hours == null) return 'not_sampled';
  if (hours <= 72) return 'fresh';
  if (hours <= 168) return 'stale';
  return 'expired';
}

async function getSampledPromptIds(brandId: string) {
  const rows = await db
    .selectDistinct({ promptId: promptRuns.promptId })
    .from(promptRuns)
    .where(eq(promptRuns.brandId, brandId));
  return new Set(rows.map((row) => row.promptId).filter(Boolean));
}

function buildSourceInfluenceMatrix(sources: any[]) {
  const modelSet = new Set<string>();
  const normalized = sources.map((source: any) => {
    const models = Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : (source.llmProvider ? [source.llmProvider] : []);
    models.forEach((model: string) => modelSet.add(model));
    return {
      ...source,
      citations: Number(source.mentions || source.citationCount || 0),
      authority: Number(source.authority || source.domainAuthority || 0),
      models,
      citationType: String(source.citationType || (source.isBrandAbsent ? 'opportunity' : 'earned')).toLowerCase(),
      hasUrl: Boolean(source.url),
    };
  });
  const owned = normalized.filter((source: any) => source.citationType === 'owned').length;
  const earned = normalized.filter((source: any) => source.citationType === 'earned').length;
  const opportunities = normalized.filter((source: any) => source.isBrandAbsent || source.citationType === 'opportunity' || source.citationType === 'competitor').length;
  const authoritySources = normalized.filter((source: any) => source.authority >= 60).length;
  const multiModelSources = normalized.filter((source: any) => source.models.length >= 2).length;
  const citedUrls = normalized.filter((source: any) => source.hasUrl).length;
  const totalCitations = normalized.reduce((sum: number, source: any) => sum + source.citations, 0);
  const rows = [
    {
      area: 'Model citation coverage',
      evidence: `${modelSet.size} model${modelSet.size === 1 ? '' : 's'} cite known sources`,
      status: modelSet.size >= 4 ? 'ready' : modelSet.size >= 2 ? 'partial' : 'blocked',
      action: modelSet.size >= 4 ? 'Keep source freshness monitored.' : 'Run multi-provider scans and citation extraction.',
    },
    {
      area: 'Cited URL depth',
      evidence: `${citedUrls} cited URL${citedUrls === 1 ? '' : 's'}, ${totalCitations} citation signal${totalCitations === 1 ? '' : 's'}`,
      status: citedUrls >= 10 && totalCitations >= 20 ? 'ready' : citedUrls >= 3 || totalCitations >= 5 ? 'partial' : 'blocked',
      action: citedUrls >= 10 ? 'Prioritize source quality over volume.' : 'Build more citable pages and extract answer citations.',
    },
    {
      area: 'Authority source mix',
      evidence: `${authoritySources} authority source${authoritySources === 1 ? '' : 's'} above score 60`,
      status: authoritySources >= 5 ? 'ready' : authoritySources >= 2 ? 'partial' : 'blocked',
      action: authoritySources >= 5 ? 'Replicate proof from top authority domains.' : 'Add analyst, review, news, directory, or community authority sources.',
    },
    {
      area: 'Owned source control',
      evidence: `${owned} owned source${owned === 1 ? '' : 's'} detected`,
      status: owned >= 3 ? 'ready' : owned > 0 ? 'partial' : 'blocked',
      action: owned >= 3 ? 'Strengthen owned pages cited by models.' : 'Publish owned citation assets: About, comparisons, FAQs, proof pages.',
    },
    {
      area: 'Earned source validation',
      evidence: `${earned} earned source${earned === 1 ? '' : 's'} detected`,
      status: earned >= 5 ? 'ready' : earned >= 2 ? 'partial' : 'blocked',
      action: earned >= 5 ? 'Protect current earned-source visibility.' : 'Pitch inclusion in sources models already cite.',
    },
    {
      area: 'Cross-model source influence',
      evidence: `${multiModelSources} source${multiModelSources === 1 ? '' : 's'} cited by 2+ models`,
      status: multiModelSources >= 3 ? 'ready' : multiModelSources > 0 ? 'partial' : 'blocked',
      action: multiModelSources >= 3 ? 'Use these as reusable proof anchors.' : 'Create repeatable evidence that multiple models can cite.',
    },
    {
      area: 'Actionable source gaps',
      evidence: `${opportunities} opportunity URL${opportunities === 1 ? '' : 's'}`,
      status: opportunities === 0 && normalized.length > 0 ? 'ready' : opportunities <= 3 && normalized.length > 0 ? 'partial' : 'blocked',
      action: opportunities === 0 ? 'Monitor new competitor-cited pages.' : 'Move high-value source opportunities into Action Workflow.',
    },
  ];
  const ready = rows.filter((row) => row.status === 'ready').length;
  const partial = rows.filter((row) => row.status === 'partial').length;
  const score = Math.round(((ready + partial * 0.5) / rows.length) * 100);
  return { rows, score, ready, partial, blocked: rows.length - ready - partial, citedUrls, totalCitations, modelCount: modelSet.size };
}

export async function buildScheduledReportArtifactHtml(input: {
  brandId: string;
  brandName: string;
  domain?: string | null;
  reportType: ScheduledReportType;
}) {
  const [
    latestScore,
    prompts,
    competitors,
    sources,
    optimizations,
    agentReport,
    jobs,
    providerSummary,
    promptIdsWithRuns,
    answers,
    allMentions,
    schedule,
    brand,
    crawlerSummary,
  ] = await Promise.all([
    storage.getLatestVisibilityScore(input.brandId).catch(() => undefined),
    storage.getPromptsByBrand(input.brandId).catch(() => []),
    storage.getCompetitorsByBrand(input.brandId).catch(() => []),
    storage.getSourcesByBrand(input.brandId).catch(() => []),
    storage.getOptimizationLogsByBrand(input.brandId, 200).catch(() => []),
    storage.getLatestAgentReadinessReport(input.brandId).catch(() => undefined),
    storage.getJobsByBrand(input.brandId, 100).catch(() => []),
    getProviderReliabilitySummary(input.brandId).catch(() => null),
    getSampledPromptIds(input.brandId).catch(() => new Set<string>()),
    storage.getLlmAnswersByBrand(input.brandId, 2000).catch(() => []),
    storage.getAllMentionsForBrand(input.brandId, 5000).catch(() => []),
    storage.getAnalysisSchedule(input.brandId).catch(() => undefined),
    storage.getBrand(input.brandId).catch(() => undefined),
    storage.getCrawlerStatsSummary(input.brandId, 30).catch(() => null),
  ]);

  const brandDevData = ((brand as any)?.brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
  const providerPreflightRuns = Array.isArray((brandDevData as any).providerPreflightRuns)
    ? (brandDevData as any).providerPreflightRuns
    : [];
  const latestProviderPreflight = providerPreflightRuns[0] || null;
  if (input.reportType === 'product_visibility' && brand) {
    const { buildProductVisibilityClientReport } = await import('./product-readiness');
    const report = await buildProductVisibilityClientReport(brand as any);
    return report.html;
  }
  const launchTrend = brand ? await buildLaunchTrendSnapshot(brand as any).catch(() => null) : null;

  const verificationTasks = Array.isArray(brandDevData.verificationTasks) ? brandDevData.verificationTasks : [];
  const expectedProviders = [...CORE_SCAN_PROVIDERS];
  const providerRows = expectedProviders.map((provider) => {
    const summary = providerSummary?.providers.find((item) => item.provider === provider);
    const completedRuns = summary?.completedRuns || 0;
    const failedRuns = summary?.failedRuns || 0;
    const lastAnswerAt = summary?.lastAnswerAt || null;
    const hours = ageHours(lastAnswerAt);
    return {
      provider,
      status: providerStatus(hours, failedRuns, completedRuns, summary?.totalAnswers || 0),
      ageHours: hours,
      totalAnswers: summary?.totalAnswers || 0,
      failedRuns,
    };
  });

  const freshPromptIds = new Set((answers as any[])
    .filter((answer: any) => {
      const created = answer.createdAt ? new Date(answer.createdAt) : null;
      return created && !Number.isNaN(created.getTime()) && Date.now() - created.getTime() <= 7 * 24 * 60 * 60 * 1000;
    })
    .map((answer: any) => answer.promptId)
    .filter(Boolean));
  const totalPrompts = (prompts as any[]).length;
  const freshCoveragePct = totalPrompts ? Math.round((freshPromptIds.size / totalPrompts) * 100) : 0;
  const sampledCoveragePct = totalPrompts ? Math.round((promptIdsWithRuns.size / totalPrompts) * 100) : 0;
  const visibilityScore = Number((latestScore as any)?.overallScore || 0);
  const pendingVerification = verificationTasks.filter((task: any) => task.status !== 'verified').length;
  const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
  const appliedActions = (optimizations as any[]).filter((log: any) => ['applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
  const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
  const totalEstimatedImpact = (optimizations as any[])
    .filter((log: any) => ['pending', 'applied', 'verified'].includes(String(log.status || '').toLowerCase()))
    .reduce((sum: number, log: any) => sum + Number(log.estimatedImpact || 0), 0);
  const verifiedImpact = (optimizations as any[])
    .filter((log: any) => String(log.status || '').toLowerCase() === 'verified')
    .reduce((sum: number, log: any) => sum + Number(log.actualImpact || log.estimatedImpact || 0), 0);
  const failedEvidence = verificationTasks.filter((task: any) => task.evidence?.passed === false).length;
  const unknownEvidence = verificationTasks.filter((task: any) => task.status !== 'verified' && task.evidence?.passed !== false).length;
  const proofConversionRate = appliedActions > 0 ? Math.round((verifiedActions / appliedActions) * 100) : 0;
  const impactConversionRate = totalEstimatedImpact > 0 ? Math.round((verifiedImpact / totalEstimatedImpact) * 100) : 0;
  let attribution: any = null;
  try {
    const { computeAttribution } = await import('./attribution');
    attribution = await computeAttribution(input.brandId, 30, true);
  } catch (error: any) {
    attribution = {
      dataComplete: false,
      aiReferralSessions: 0,
      aiReferralConversions: 0,
      aiAttributedRevenue: 0,
      message: error?.message || 'Attribution could not be computed.',
    };
  }
  const crawlerVisits = Number((crawlerSummary as any)?.totalVisits || 0);
  const verifiedCrawlerVisits = Number((crawlerSummary as any)?.verifiedVisits || 0);
  const activeBots = Object.values(((crawlerSummary as any)?.byBot || {}) as Record<string, number>)
    .filter((count) => Number(count) > 0)
    .length;
  const aiReferralSessions = Number(attribution?.aiReferralSessions || attribution?.totalReferrals || 0);
  const aiReferralConversions = Number(attribution?.aiReferralConversions || attribution?.totalConversions || 0);
  const aiAttributedRevenue = Number(attribution?.aiAttributedRevenue || attribution?.attributedRevenue || 0);
  const attributionDataComplete = Boolean(attribution?.dataComplete);
  const attributionScore = Math.min(100, Math.round(
    (crawlerVisits > 0 ? 25 : 0) +
    (verifiedCrawlerVisits > 0 ? 15 : 0) +
    (activeBots >= 3 ? 20 : activeBots > 0 ? 10 : 0) +
    (aiReferralSessions > 0 ? 15 : attributionDataComplete ? 8 : 0) +
    (aiReferralConversions > 0 ? 15 : 0) +
    (aiAttributedRevenue > 0 ? 10 : 0)
  ));
  const attributionRows = [
    ['AI crawler visibility', `${crawlerVisits} visits / ${verifiedCrawlerVisits} verified`, crawlerVisits > 0 && verifiedCrawlerVisits > 0 ? 'ready' : crawlerVisits > 0 ? 'partial' : 'gap', crawlerVisits > 0 ? 'Verify crawler identity and watched pages.' : 'Install Agent Analytics crawler tracking.'],
    ['Engine coverage', `${activeBots} active AI bots`, activeBots >= 3 ? 'ready' : activeBots > 0 ? 'partial' : 'gap', activeBots >= 3 ? 'Monitor bot/page mix weekly.' : 'Capture ChatGPT, Claude, Gemini, Perplexity, and Google agent visits.'],
    ['AI referral sessions', `${aiReferralSessions} referrals`, aiReferralSessions > 0 ? 'ready' : attributionDataComplete ? 'partial' : 'gap', aiReferralSessions > 0 ? 'Map referrals to landing pages.' : 'Connect GA4 and tag AI-answer referral sources.'],
    ['Conversion proof', `${aiReferralConversions} conversions`, aiReferralConversions > 0 ? 'ready' : attributionDataComplete ? 'partial' : 'gap', aiReferralConversions > 0 ? 'Report conversion trend and winning sources.' : 'Configure GA4 conversion events for AI traffic.'],
    ['Revenue attribution', `$${Math.round(aiAttributedRevenue).toLocaleString()}`, aiAttributedRevenue > 0 ? 'ready' : attributionDataComplete ? 'partial' : 'gap', aiAttributedRevenue > 0 ? 'Use revenue in executive reports.' : 'Connect ecommerce/GA4 revenue or upload attribution snapshots.'],
  ];
  const proofValue = {
    score: Math.min(100, Math.round(
      (plannedActions > 0 ? 15 : 0) +
      (appliedActions > 0 ? 20 : 0) +
      (verifiedActions > 0 ? 25 : 0) +
      (pendingVerification === 0 && verifiedActions > 0 ? 20 : pendingVerification > 0 ? 8 : 0) +
      (verifiedImpact > 0 ? 20 : impactConversionRate > 0 ? 10 : 0)
    )),
    rows: [
      ['Workflow coverage', `${plannedActions} planned / ${appliedActions} applied / ${verifiedActions} verified`, plannedActions > 0 && appliedActions > 0 ? 'active' : plannedActions > 0 ? 'planned' : 'gap', plannedActions > 0 ? 'Keep moving priority work into applied proof checks.' : 'Create priority actions from readiness gaps.'],
      ['Applied-to-verified conversion', `${proofConversionRate}%`, proofConversionRate >= 50 ? 'healthy' : proofConversionRate > 0 ? 'early' : 'gap', proofConversionRate > 0 ? 'Raise conversion by clearing pending proof checks.' : 'Mark one live fix applied and verify it.'],
      ['Verified impact', `${verifiedImpact}/${totalEstimatedImpact || 0}`, verifiedImpact > 0 ? 'proven' : totalEstimatedImpact > 0 ? 'unproven' : 'gap', verifiedImpact > 0 ? 'Use verified impact in stakeholder reporting.' : 'Verify impact before claiming ROI.'],
      ['Evidence freshness', `${pendingVerification} pending`, pendingVerification === 0 && verifiedActions > 0 ? 'clear' : pendingVerification > 0 ? 'debt' : 'missing', pendingVerification === 0 && verifiedActions > 0 ? 'Keep evidence fresh with weekly scans.' : 'Run specialist proof checks after fresh scans.'],
      ['Failed evidence', `${failedEvidence} failing / ${unknownEvidence} waiting`, failedEvidence === 0 ? 'controlled' : 'blocked', failedEvidence === 0 ? 'Resolve waiting evidence next.' : 'Fix failing applied changes before reporting wins.'],
    ],
  };
  const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
  const sourceInfluence = buildSourceInfluenceMatrix(sources as any[]);
  const failedJobs = (jobs as any[]).filter((job: any) => job.status === 'failed').length;
  const activeSchedule = Boolean((schedule as any)?.isEnabled || (brand as any)?.analysisEnabled);
  const nextRun = (schedule as any)?.nextRun || (brand as any)?.nextScheduledAnalysis || null;
  const nextRunAt = nextRun ? new Date(nextRun) : null;
  const overdueHours = nextRunAt && nextRunAt.getTime() < Date.now() ? Math.round(((Date.now() - nextRunAt.getTime()) / 36e5) * 10) / 10 : 0;

  const optimizationById = new Map((optimizations as any[]).map((log: any) => [String(log.id), log]));
  const proofRows = verificationTasks.map((task: any) => {
    const optimization = optimizationById.get(String(task.sourceId || ''));
    const actionType = String(optimization?.actionType || task.sourceType || 'verification');
    const evidence = task.evidence || {};
    const evidenceSummary = String(task.verificationNote || evidence.message || (
      evidence.label
        ? `${evidence.label}: ${evidence.passed === true ? 'passed' : evidence.passed === false ? 'still failing' : 'latest evidence pending'}`
        : 'No scan evidence stored yet'
    ));
    return {
      title: titleFromOptimization(optimization?.actionDescription || task.title || ''),
      source: sourceLabel(actionType),
      status: task.status || 'pending',
      verificationMethod: task.verificationMethod || 'manual',
      evidenceStatus: task.status === 'verified' || evidence.passed === true ? 'passed' : evidence.passed === false ? 'failed' : 'unknown',
      evidenceSummary,
      lastCheckedAt: task.lastCheckedAt || task.createdAt || null,
    };
  }).sort((a: any, b: any) => {
    const order: Record<string, number> = { failed: 0, unknown: 1, passed: 2 };
    return (order[a.evidenceStatus] ?? 1) - (order[b.evidenceStatus] ?? 1)
      || new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime();
  });
  const proofStarterRows = (optimizations as any[])
    .filter((log: any) => !['applied', 'verified'].includes(String(log.status || '').toLowerCase()))
    .sort((a: any, b: any) => Number(b.estimatedImpact || 0) - Number(a.estimatedImpact || 0))
    .slice(0, 8)
    .map((log: any) => ({
      title: titleFromOptimization(log.actionDescription || log.title || ''),
      source: sourceLabel(String(log.actionType || '')),
      status: log.status || 'pending',
      estimatedImpact: Number(log.estimatedImpact || 0),
      nextAction: 'Mark this action applied after the fix is live, then run the matching proof check from Action Workflow.',
    }));

  const competitorNames = new Set((competitors as any[]).map((competitor: any) => String(competitor.name || '').toLowerCase()).filter(Boolean));
  const inWorkflow = new Set((optimizations as any[]).map((log: any) => String(log.actionType || '')));
  const fanoutIntelligenceBase = buildQueryFanoutIntelligence({
    brand: brand || { name: input.brandName },
    prompts: prompts as any[],
    answers: answers as any[],
    allMentions: allMentions as any[],
    competitors: competitors as any[],
    sources: sources as any[],
  });
  const fanoutIntelligence = {
    ...fanoutIntelligenceBase,
    fanouts: (fanoutIntelligenceBase.fanouts || []).map((fanout: any) => ({
      ...fanout,
      workflowStatus: inWorkflow.has(`query_fanout:${fanout.promptId}`) ? 'in_workflow' : 'open',
    })),
  };
  const fanoutSummary = fanoutIntelligence.summary;
  const opportunityRows: any[] = [];

  for (const prompt of prompts as any[]) {
    const promptAnswers = (answers as any[]).filter((answer: any) => answer.promptId === prompt.id);
    const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
    const mentions = (allMentions as any[]).filter((mention: any) => answerIds.has(mention.llmAnswerId));
    const brandMentions = mentions.filter((mention: any) => !mention.competitorId && !competitorNames.has(String(mention.entityName || '').toLowerCase()));
    const competitorMentions = mentions.filter((mention: any) => mention.competitorId || competitorNames.has(String(mention.entityName || '').toLowerCase()));
    const providers = new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean));
    const mentionRate = promptAnswers.length ? Math.round((new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size / promptAnswers.length) * 100) : 0;
    const competitorPressure = competitorMentions.length > brandMentions.length;
    const isUnsampled = promptAnswers.length === 0;
    const score = Math.max(0, Math.min(100, Math.round(
      (isUnsampled ? 35 : (100 - mentionRate) * 0.5)
      + (competitorPressure ? 25 : 0)
      + (providers.size < 3 ? 15 : 0)
      + (String(prompt.category || '').match(/comparison|product|pricing|review/i) ? 10 : 0)
    )));
    if (score >= 35) {
      const actionType = `market_opportunity:prompt:${prompt.id}`;
      opportunityRows.push({
        type: isUnsampled ? 'sampling_gap' : competitorPressure ? 'competitive_prompt' : 'visibility_prompt',
        title: isUnsampled ? 'Sample an untested high-intent prompt' : competitorPressure ? 'Recover competitor-led prompt' : 'Improve low-visibility prompt',
        target: prompt.text || 'Tracked prompt',
        score,
        priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
        evidence: `${mentionRate}% mention rate, ${brandMentions.length} brand mentions, ${competitorMentions.length} competitor mentions, ${providers.size} providers.`,
        recommendedAction: isUnsampled
          ? 'Run this prompt across core answer engines, then create content from the first answer gaps.'
          : competitorPressure
            ? 'Create comparison and proof content that directly counters the competitor currently winning the answer.'
            : `Strengthen answer-ready content so ${input.brandName} is named earlier and cited more often.`,
        status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
      });
    }
  }

  for (const source of sources as any[]) {
    const citations = Number(source.mentions || source.citationCount || 0);
    const models = Array.isArray(source.modelsCited) ? source.modelsCited : (source.llmProvider ? [source.llmProvider] : []);
    const authority = Number(source.authority || source.domainAuthority || 0);
    const domain = source.domain || String(source.url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#\s]/)[0].toLowerCase();
    const sourceGap = Boolean(source.isBrandAbsent || source.citationType === 'competitor');
    const score = Math.max(0, Math.min(100, Math.round((authority * 0.35) + (citations * 8) + (models.length * 9) + (sourceGap ? 25 : 0))));
    if (score >= 35) {
      const actionType = `citation_opportunity:${source.id}`;
      opportunityRows.push({
        type: sourceGap ? 'citation_gap' : 'source_depth',
        title: sourceGap ? 'Win a competitor-cited source' : 'Expand citation depth',
        target: source.title || source.url || domain || 'Cited source',
        score,
        priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
        evidence: `${citations} citations across ${models.length || 1} model surface${models.length === 1 ? '' : 's'}${domain ? ` from ${domain}` : ''}.`,
        recommendedAction: sourceGap
          ? 'Pitch inclusion, update the cited marketplace/profile/review page, or publish supporting proof that makes the brand citable.'
          : 'Replicate the cited proof pattern across owned pages, FAQs, schema, reviews, and third-party profiles.',
        status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
      });
    }
  }

  if (totalPrompts < 25) {
    opportunityRows.push({
      type: 'launch_gate',
      title: 'Reach enterprise prompt coverage floor',
      target: 'Prompt portfolio',
      score: Math.min(100, 90 - totalPrompts),
      priority: totalPrompts < 10 ? 'high' : 'medium',
      evidence: `${totalPrompts}/25 tracked prompts.`,
      recommendedAction: 'Add buyer, competitor, product, trust, support, and review prompts before using launch-ready language.',
      status: 'open',
    });
  }

  if (pendingVerification > 0) {
    opportunityRows.push({
      type: 'launch_gate',
      title: 'Clear verification debt',
      target: 'Action Workflow proof',
      score: Math.min(100, 50 + pendingVerification * 10),
      priority: pendingVerification >= 3 ? 'high' : 'medium',
      evidence: `${pendingVerification} pending verification task${pendingVerification === 1 ? '' : 's'}.`,
      recommendedAction: 'Apply the fixes, run verification checks, and only report impact after fresh evidence exists.',
      status: 'open',
    });
  }

  const topOpportunityRows = opportunityRows.sort((a, b) => b.score - a.score).slice(0, 20);

  const sections: Array<{ title: string; rows: Array<[string, string | number]> }> = [
    {
      title: 'Core Metrics',
      rows: [
        ['Visibility score', `${visibilityScore}/100`],
        ['Prompts tracked', totalPrompts],
        ['Competitors tracked', (competitors as any[]).length],
        ['Source domains', sourceDomains],
        ['Cited URLs', sourceInfluence.citedUrls],
        ['Source influence score', `${sourceInfluence.score}/100`],
        ['Agent readiness', `${Number((agentReport as any)?.score || 0)}/100`],
      ],
    },
    {
      title: 'Execution Proof',
      rows: [
        ['Applied actions', appliedActions],
        ['Verified actions', verifiedActions],
        ['Pending proof tasks', pendingVerification],
        ['Proof value score', `${proofValue.score}/100`],
        ['Proof conversion', `${proofConversionRate}%`],
        ['Verified impact', `${verifiedImpact}/${totalEstimatedImpact || 0}`],
        ['Attribution readiness', `${attributionScore}/100`],
        ['AI referrals', aiReferralSessions],
        ['AI conversions', aiReferralConversions],
        ['AI attributed revenue', `$${Math.round(aiAttributedRevenue).toLocaleString()}`],
      ],
    },
    {
      title: 'Scan Operations',
      rows: [
        ['Fresh enterprise providers', `${providerRows.filter((provider) => provider.status === 'fresh').length}/${expectedProviders.length}`],
        ['Fresh prompt coverage', `${freshCoveragePct}%`],
        ['Sampled prompt coverage', `${sampledCoveragePct}%`],
        ['Failed jobs', failedJobs],
        ['Schedule enabled', activeSchedule ? 'yes' : 'no'],
        ['Overdue hours', overdueHours],
      ],
    },
    {
      title: 'Query Fanout Intelligence',
      rows: [
        ['Fanout queries', fanoutSummary.queryCount],
        ['High-opportunity fanouts', fanoutSummary.highOpportunity],
        ['Average fanout mention rate', `${fanoutSummary.averageMentionRate}%`],
        ['Fanout readiness score', `${fanoutIntelligence.score}/100`],
      ],
    },
  ];
  if (launchTrend && ['launch_readiness', 'competitive_parity', 'market_opportunity', 'production_readiness'].includes(input.reportType)) {
    sections.splice(1, 0, {
      title: 'Launch Trend',
      rows: [
        ['Trend verdict', launchTrend.verdict],
        ['Visibility movement', `${launchTrend.currentScore}/100 now vs ${launchTrend.previousScore}/100 previous (${launchTrend.scoreDelta >= 0 ? '+' : ''}${launchTrend.scoreDelta}, ${launchTrend.scoreDirection})`],
        ['Fresh enterprise providers', `${launchTrend.providerTrend.freshEnterpriseProviders}/${launchTrend.providerTrend.enterpriseTargetProviders}`],
        ['Failed enterprise providers', launchTrend.providerTrend.failedEnterpriseProviders],
        ['Proof workflow', `${launchTrend.workflowTrend.plannedActions} planned / ${launchTrend.workflowTrend.appliedActions} applied / ${launchTrend.workflowTrend.verifiedActions} verified`],
        ['Pending proof tasks', launchTrend.workflowTrend.pendingProofTasks],
        ['Scan failure rate', `${launchTrend.scanTrend.failureRate}%`],
        ['Historical confidence', `${launchTrend.historicalConfidence.score}/100 (${launchTrend.historicalConfidence.status}) - ${launchTrend.historicalConfidence.evidence}`],
        ['Trend blockers', launchTrend.blockers.length ? launchTrend.blockers.join('; ') : 'None'],
      ],
    });
  }

  const label = scheduledReportTypeLabel(input.reportType);
  const description = scheduledReportTypeDescription(input.reportType);
  const generatedAt = new Date().toISOString();
  const providerHtml = providerRows.map((provider) => `<div class="provider ${escapeHtml(provider.status)}"><strong>${escapeHtml(provider.provider)}</strong><span>${escapeHtml(provider.status)} · ${provider.ageHours == null ? 'no signal yet' : `${provider.ageHours}h old`} · ${provider.totalAnswers} answers · ${provider.failedRuns} failed runs</span></div>`).join('');
  const providerPreflightHtml = latestProviderPreflight
    ? `<h2>Latest Provider Preflight</h2><div class="provider ${escapeHtml(latestProviderPreflight.ok ? 'fresh' : 'failed')}"><strong>${escapeHtml(latestProviderPreflight.ok ? 'Preflight passed' : 'Preflight blockers found')}</strong><span>${escapeHtml(String(latestProviderPreflight.finishedAt || 'Run in progress'))} · ${(latestProviderPreflight.results || []).filter((result: any) => result.ok).length} passed · ${(latestProviderPreflight.results || []).filter((result: any) => !result.ok).length} blocked</span></div>${(latestProviderPreflight.results || []).slice(0, 6).map((result: any) => `<div class="provider ${escapeHtml(result.ok ? 'fresh' : 'failed')}"><strong>${escapeHtml(result.provider)}</strong><span>${escapeHtml(String(result.status || (result.ok ? 'ok' : 'failed')).replace(/_/g, ' '))}${result.envHint ? ` · ${escapeHtml(result.envHint)}` : ''}</span>${result.message ? `<p>${escapeHtml(result.message)}</p>` : ''}</div>`).join('')}`
    : '<h2>Latest Provider Preflight</h2><p>No provider preflight has been run yet. Run provider preflight before claiming multi-engine report readiness.</p>';
  const sectionHtml = sections.map((section) => `<h2>${escapeHtml(section.title)}</h2><table>${section.rows.map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>`).join('');
  const proofQueueHtml = proofRows.length
    ? `<h2>Proof Queue</h2>${proofRows.slice(0, 20).map((row: any, index: number) => `<div class="provider ${escapeHtml(row.evidenceStatus)}"><strong>${index + 1}. ${escapeHtml(row.title)}</strong><span>${escapeHtml(row.source)} - ${escapeHtml(String(row.status).toUpperCase())} - ${escapeHtml(row.verificationMethod)}</span><p>${escapeHtml(row.evidenceSummary)}</p></div>`).join('')}`
    : '<h2>Proof Queue</h2><p>No verification evidence tasks exist yet. Mark applied actions and run proof checks before sending client reporting.</p>';
  const proofStarterHtml = proofStarterRows.length
    ? `<h2>Proof Starter Queue</h2>${proofStarterRows.map((row: any, index: number) => `<div class="provider unknown"><strong>${index + 1}. ${escapeHtml(row.title)}</strong><span>${escapeHtml(row.source)} - ${escapeHtml(String(row.status).toUpperCase())} - impact ${escapeHtml(String(row.estimatedImpact))}</span><p>${escapeHtml(row.nextAction)}</p></div>`).join('')}`
    : '<h2>Proof Starter Queue</h2><p>No pending workflow actions are available to turn into proof yet. Create one from Agent Readiness, Query Fanouts, Market Opportunities, Product Readiness, or provider recovery.</p>';
  const proofValueHtml = `<h2>Proof Value Matrix</h2><p class="meta">${proofValue.score}/100 value proof. ${proofConversionRate}% applied-to-verified conversion. Verified impact ${verifiedImpact}/${totalEstimatedImpact || 0}.</p><table>${proofValue.rows.map((row: any) => `<tr><td>${escapeHtml(row[0])}<br><span class="meta">${escapeHtml(row[1])}</span></td><td>${escapeHtml(String(row[2]).toUpperCase())}<br><span class="meta">${escapeHtml(row[3])}</span></td></tr>`).join('')}</table>`;
  const attributionHtml = `<h2>AI Attribution Readiness</h2><p class="meta">${attributionScore}/100 attribution readiness. ${aiReferralSessions} AI referrals, ${aiReferralConversions} conversions, $${Math.round(aiAttributedRevenue).toLocaleString()} attributed revenue.${attributionDataComplete ? '' : ` ${escapeHtml(attribution?.message || 'GA4/ecommerce attribution is incomplete.')}`}</p><table>${attributionRows.map((row: any) => `<tr><td>${escapeHtml(row[0])}<br><span class="meta">${escapeHtml(row[1])}</span></td><td>${escapeHtml(String(row[2]).toUpperCase())}<br><span class="meta">${escapeHtml(row[3])}</span></td></tr>`).join('')}</table>`;
  const marketQueueHtml = topOpportunityRows.length
    ? `<h2>Market Opportunity Queue</h2>${topOpportunityRows.map((row: any, index: number) => `<div class="provider ${escapeHtml(row.priority)}"><strong>${index + 1}. ${escapeHtml(row.title)}</strong><span>${escapeHtml(row.type)} - ${escapeHtml(row.priority)} - ${row.score}/100 - ${escapeHtml(row.status)}</span><p><strong>Target:</strong> ${escapeHtml(row.target)}</p><p>${escapeHtml(row.evidence)}</p><p><strong>Next:</strong> ${escapeHtml(row.recommendedAction)}</p></div>`).join('')}`
    : '<h2>Market Opportunity Queue</h2><p>No open market opportunities need action right now.</p>';
  const sourceInfluenceHtml = `<h2>Source Influence Matrix</h2><table>${sourceInfluence.rows.map((row: any) => `<tr><td>${escapeHtml(row.area)}<br><span class="meta">${escapeHtml(row.evidence)}</span></td><td>${escapeHtml(String(row.status).toUpperCase())}<br><span class="meta">${escapeHtml(row.action)}</span></td></tr>`).join('')}</table><p class="meta">${sourceInfluence.ready} ready, ${sourceInfluence.partial} partial, ${sourceInfluence.blocked} blocked - ${sourceInfluence.score}/100 source influence score.</p>`;
  const fanoutQueueHtml = fanoutIntelligence.fanouts.filter((row: any) => row.status !== 'covered').slice(0, 12).length
    ? `<h2>Query Fanout Queue</h2>${fanoutIntelligence.fanouts.filter((row: any) => row.status !== 'covered').slice(0, 12).map((row: any, index: number) => `<div class="provider ${escapeHtml(row.status === 'high_opportunity' ? 'high' : 'medium')}"><strong>${index + 1}. ${escapeHtml(row.prompt)}</strong><span>${escapeHtml(row.intent)} - ${row.opportunityScore}/100 - ${escapeHtml(row.workflowStatus)}</span><p><strong>Evidence:</strong> ${row.mentionRate}% brand mention rate across ${row.providers.length} provider${row.providers.length === 1 ? '' : 's'}; ${row.fanoutQueries.length} query fanouts.</p><p><strong>Next:</strong> ${escapeHtml(row.contentActions[0] || 'Turn this fanout into an answer-ready content brief and rerun the prompt.')}</p></div>`).join('')}`
    : '<h2>Query Fanout Queue</h2><p>No open query fanout content gaps need action right now.</p>';
  const launchTrendHtml = launchTrend && ['launch_readiness', 'competitive_parity', 'market_opportunity', 'production_readiness'].includes(input.reportType)
    ? `<h2>Launch Trend Next Actions</h2>${launchTrend.nextActions.length
      ? launchTrend.nextActions.map((action: string, index: number) => `<div class="provider ${escapeHtml(launchTrend.blockers.length ? 'medium' : 'fresh')}"><strong>${index + 1}. ${escapeHtml(action)}</strong><span>${escapeHtml(launchTrend.verdict)}</span></div>`).join('')
      : `<div class="provider fresh"><strong>Trend is healthy</strong><span>Keep weekly sampling, proof checks, and provider monitoring active.</span></div>`}`
    : '';
  const reportSpecificHtml = input.reportType === 'verification_evidence'
    ? `${proofValueHtml}${attributionHtml}${proofQueueHtml}${proofStarterHtml}`
    : input.reportType === 'production_readiness'
      ? `${launchTrendHtml}${proofValueHtml}${attributionHtml}${sourceInfluenceHtml}${fanoutQueueHtml}${proofQueueHtml}`
    : input.reportType === 'market_opportunity'
      ? `${launchTrendHtml}${attributionHtml}${sourceInfluenceHtml}${marketQueueHtml}`
      : ['launch_readiness', 'competitive_parity', 'ai_search_opportunity'].includes(input.reportType)
        ? `${launchTrendHtml}${attributionHtml}${sourceInfluenceHtml}${fanoutQueueHtml}`
      : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.brandName)} ${escapeHtml(label)}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.summary{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e5e7eb;padding:10px 4px}td:last-child{text-align:right;font-weight:700}.provider{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin:8px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.provider p{flex-basis:100%;margin:8px 0 0}.fresh,.passed{border-color:#86efac}.stale,.unknown,.medium{border-color:#fcd34d}.failed,.expired,.not_sampled,.high{border-color:#fca5a5}.low{border-color:#bfdbfe}</style></head><body><h1>${escapeHtml(input.brandName)} - ${escapeHtml(label)}</h1><p class="meta">Domain: ${escapeHtml(input.domain || '')}<br>Generated: ${escapeHtml(generatedAt)}</p><div class="summary"><p>${escapeHtml(description)}</p><p>This scheduled artifact includes live workspace metrics at send time.</p></div>${sectionHtml}${reportSpecificHtml}<h2>Provider Freshness</h2>${providerHtml}${providerPreflightHtml}</body></html>`;
}
