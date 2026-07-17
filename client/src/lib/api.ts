// API Client for AIRank Backend

import { APIError, NetworkError, handleAPIError, retryWithBackoff, logError } from './error-handling';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();
  const isJson = contentType.includes('application/json');
  const looksLikeHtml = /^\s*</.test(bodyText);

  if (!bodyText) return null;

  if (isJson) {
    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error('Invalid JSON response from server');
    }
  }

  if (looksLikeHtml) {
    const titleMatch = bodyText.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim();
    throw new Error(title ? `Received HTML response (${title}) instead of JSON` : 'Received HTML response instead of JSON');
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return { message: bodyText };
  }
}

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      handleAPIError(response, data || { message: response.statusText });
    }

    return data;
  } catch (error) {
    // Convert fetch errors to NetworkError
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new NetworkError();
      logError(networkError, { endpoint, options });
      throw networkError;
    }

    // Re-throw API errors and other errors
    if (error instanceof APIError || error instanceof NetworkError) {
      logError(error, { endpoint, options });
    }
    throw error;
  }
}

/**
 * Fetch API with automatic retry for network errors and 5xx errors
 */
async function fetchApiWithRetry(endpoint: string, options: RequestInit = {}) {
  return retryWithBackoff(() => fetchApi(endpoint, options), {
    maxRetries: 3,
    initialDelay: 1000,
  });
}

// ============= BRAND CONTEXT =============

export async function getBrandContext(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/context`);
}

export async function updateBrandContext(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/context`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function triggerBrandEnrichment(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/enrich`, {
    method: 'POST',
  });
}

// ============= ANALYTICS =============

export async function getPromptAnalytics(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/prompt-analytics`);
}

export async function getPromptFanouts(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/prompt-fanouts`);
}

export async function createPromptFanoutTask(brandId: string, promptId: string) {
  return fetchApi(`/api/brands/${brandId}/prompt-fanouts/${encodeURIComponent(promptId)}/task`, {
    method: 'POST',
  });
}

export async function createQueryFanoutDraft(brandId: string, logId: string) {
  return fetchApi(`/api/brands/${brandId}/optimizations/${logId}/query-fanout-draft`, {
    method: 'POST',
  });
}

export async function getAISearchOpportunityBrief(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/ai-search-opportunity-brief`);
}

export async function getMarketOpportunities(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/market-opportunities`);
}

export async function getMarketOpportunitiesReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/market-opportunities/report`);
}

export async function getVerificationEvidenceReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-evidence/report`);
}

export async function getScanOperationsReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/scan-health/report`);
}

export async function checkMarketOpportunityVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-market-opportunity`, {
    method: 'POST',
  });
}

export async function createMarketOpportunityTask(brandId: string, opportunityId: string, opportunity: any) {
  return fetchApi(`/api/brands/${brandId}/market-opportunities/${encodeURIComponent(opportunityId)}/task`, {
    method: 'POST',
    body: JSON.stringify(opportunity),
  });
}

export async function getPromptCoveragePlan(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/prompt-coverage-plan`);
}

export async function backfillPromptCoverage(brandId: string, data?: { targetCount?: number; maxCreate?: number }) {
  return fetchApi(`/api/brands/${brandId}/prompt-coverage/backfill`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function minePrompts(brandId: string, locale?: string) {
  return fetchApi(`/api/brands/${brandId}/mine-prompts`, {
    method: 'POST',
    body: JSON.stringify({ locale }),
  });
}

export async function getMinedPrompts(brandId: string, limit = 100) {
  return fetchApi(`/api/brands/${brandId}/mined-prompts?limit=${limit}`);
}

export async function promoteMinedPrompt(brandId: string, minedId: string) {
  return fetchApi(`/api/brands/${brandId}/mined-prompts/${minedId}/promote`, {
    method: 'POST',
  });
}

export async function dismissMinedPrompt(brandId: string, minedId: string) {
  return fetchApi(`/api/brands/${brandId}/mined-prompts/${minedId}/dismiss`, {
    method: 'POST',
  });
}

export async function getBrandLocales(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/locales`);
}

export async function createBrandLocale(brandId: string, data: {
  locale: string;
  language: string;
  region?: string;
  label?: string;
  isPrimary?: boolean;
}) {
  return fetchApi(`/api/brands/${brandId}/locales`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteBrandLocale(brandId: string, localeId: string) {
  return fetchApi(`/api/brands/${brandId}/locales/${localeId}`, {
    method: 'DELETE',
  });
}

export async function getLLMAnswers(brandId: string, limit = 100) {
  return fetchApi(`/api/brands/${brandId}/llm-answers?limit=${limit}`);
}

export async function getPromptRuns(brandId: string, limit = 100) {
  return fetchApi(`/api/brands/${brandId}/prompt-runs?limit=${limit}`);
}

export async function getScanHealth(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/scan-health`);
}

export async function queueScanOperationsRun(brandId: string, data?: { maxPrompts?: number; maxProviders?: number; providerSweep?: boolean; includeDownstream?: boolean; enterprisePilot?: boolean }) {
  return fetchApi(`/api/brands/${brandId}/scan-operations/run`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function getScanOperationsHistory(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/scan-operations/history`);
}

export async function getLaunchTrend(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/launch-trend`);
}

export async function runProviderPreflight(brandId: string, providers?: string[]) {
  return fetchApi(`/api/brands/${brandId}/provider-preflight`, {
    method: 'POST',
    body: JSON.stringify({ providers }),
  });
}

export async function getCompetitiveParity(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/competitive-parity`);
}

export async function getCompetitiveParityReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/competitive-parity/report`);
}

export async function getAnswerIntelligence(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/answer-intelligence`);
}

export async function getAudiencePersonas(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/audience-personas`);
}

export async function createAudiencePersonaTask(brandId: string, personaId: string) {
  return fetchApi(`/api/brands/${brandId}/audience-personas/${encodeURIComponent(personaId)}/task`, {
    method: 'POST',
  });
}

export async function createAnswerIntelligenceRiskTask(brandId: string, answerId: string) {
  return fetchApi(`/api/brands/${brandId}/answer-intelligence/risks/${answerId}/task`, {
    method: 'POST',
  });
}

export async function getLaunchReadiness(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/launch-readiness`);
}

export async function getProductionReadinessAudit(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/production-readiness-audit`);
}

export async function getLaunchReadinessReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/launch-readiness/report`);
}

export async function getMentions(brandId: string, limit = 100) {
  return fetchApi(`/api/brands/${brandId}/mentions?limit=${limit}`);
}

export async function getVisibilityScores(brandId: string, period?: string, limit = 30) {
  const query = period ? `?period=${period}&limit=${limit}` : `?limit=${limit}`;
  return fetchApi(`/api/brands/${brandId}/visibility-scores${query}`);
}

export async function getLatestVisibilityScore(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/visibility-scores/latest`);
}

// Tier S4 — Score by Intent for the Dashboard widget
export async function getScoreByIntent(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/score-by-intent`);
}

// Tier S5 — AI Recommendation Share for the Dashboard share card
export async function getRecommendationShare(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/recommendation-share`);
}

export async function triggerRecommendationShareSimulation(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/recommendation-share/simulate`, {
    method: 'POST',
  });
}

// Tier S6 — Free-tier shock value banner
export async function getShockValue(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/shock-value`);
}

// Tier S7 — Entity Intelligence hub
export async function getEntityProfile(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/entity`);
}

export async function refreshEntityProfile(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/entity/refresh`, { method: 'POST' });
}

export async function getTrends(brandId: string, limit = 90) {
  return fetchApi(`/api/brands/${brandId}/trends?limit=${limit}`);
}

// ============= JOBS =============

export async function triggerLLMSampling(promptId: string, providers?: string[]) {
  return fetchApi(`/api/prompts/${promptId}/sample`, {
    method: 'POST',
    body: JSON.stringify({ providers }),
  });
}

export async function triggerFullPipeline(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/analyze/pipeline`, {
    method: 'POST',
  });
}

export async function triggerFullAnalysis(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/analyze/full`, {
    method: 'POST',
  });
}

export async function getJobStatus(jobId: string) {
  return fetchApi(`/api/jobs/${jobId}/status`);
}

export async function getBrandJobs(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/jobs`);
}

export async function getJobStats() {
  return fetchApi(`/api/jobs/stats`);
}

// ============= CONTENT MANAGEMENT =============

export async function getAxpPages(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/axp-pages`);
}

export async function getAxpPage(pageId: string) {
  return fetchApi(`/api/axp-pages/${pageId}`);
}

export async function createAxpPage(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/axp-pages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAxpPage(pageId: string, data: any) {
  return fetchApi(`/api/axp-pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function publishAxpPage(brandId: string, pageId: string) {
  return fetchApi(`/api/brands/${brandId}/axp-pages/${pageId}/publish`, {
    method: 'POST',
  });
}

export async function deleteAxpPage(pageId: string) {
  return fetchApi(`/api/axp-pages/${pageId}`, {
    method: 'DELETE',
  });
}

export async function getFaqEntries(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/faqs`);
}

export async function createFaqEntry(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/faqs`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFaqEntry(faqId: string, data: any) {
  return fetchApi(`/api/faqs/${faqId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteFaqEntry(faqId: string) {
  return fetchApi(`/api/faqs/${faqId}`, {
    method: 'DELETE',
  });
}

// ============= CONTENT OPTIMIZATION =============

export async function getTopicOptimization(brandId: string, topicId: string) {
  return fetchApi(`/api/brands/${brandId}/optimize/topic/${topicId}`);
}

export async function applyTopicOptimization(brandId: string, topicId: string, suggestionId: string) {
  return fetchApi(`/api/brands/${brandId}/optimize/topic/${topicId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ suggestionId }),
  });
}

// ============= PHASE 4: MONITORING & PERFORMANCE =============

export async function getSystemHealth() {
  return fetchApi('/api/admin/system/health');
}

export async function getSystemMetrics() {
  return fetchApi('/api/admin/system/metrics');
}

export async function getSystemStats() {
  return fetchApi('/api/admin/system/stats');
}

export async function getRecentErrors(limit = 50) {
  return fetchApi(`/api/admin/errors?limit=${limit}`);
}

export async function resolveError(errorId: string) {
  return fetchApi(`/api/admin/errors/${errorId}/resolve`, {
    method: 'POST',
  });
}

export async function getJobRetryStatus() {
  return fetchApi('/api/admin/jobs/retry-status');
}

export async function getRateLimitStatus() {
  return fetchApi('/api/admin/rate-limits/status');
}

export async function getOptimizationHistory(brandId: string, limit = 20) {
  return fetchApi(`/api/brands/${brandId}/optimizations?limit=${limit}`);
}

export async function getGapAnalysisV2(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/gaps`);
}

export async function getPrioritizedActions(brandId: string, limit = 5) {
  return fetchApi(`/api/brands/${brandId}/actions?limit=${limit}`);
}

export async function getCitationGaps(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/citation-gaps`);
}

export async function getCitationSummary(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/citation-summary`);
}

export async function createOptimizationLog(brandId: string, data: {
  topicId?: string;
  actionType: string;
  actionDescription: string;
  estimatedImpact?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/optimizations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOptimizationLog(brandId: string, logId: string, data: {
  status?: string;
  actualImpact?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/optimizations/${logId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getVerificationTasks(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks`);
}

export async function getAlertSummary(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/alert-summary`);
}

export async function getAlertRules(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/alert-rules`);
}

export async function createAlertRule(brandId: string, data: {
  name: string;
  metric: string;
  comparator: string;
  threshold?: number;
  channel: string;
  destination?: string;
  cooldownMinutes?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}) {
  return fetchApi(`/api/brands/${brandId}/alert-rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createDefaultAlertRules(brandId: string, data: { destination?: string; channel?: string }) {
  return fetchApi(`/api/brands/${brandId}/alert-rules/defaults`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAlertRule(brandId: string, ruleId: string, data: {
  name?: string;
  threshold?: number;
  channel?: string;
  destination?: string;
  cooldownMinutes?: number;
  isActive?: boolean;
}) {
  return fetchApi(`/api/brands/${brandId}/alert-rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAlertRule(brandId: string, ruleId: string) {
  return fetchApi(`/api/brands/${brandId}/alert-rules/${ruleId}`, {
    method: 'DELETE',
  });
}

export async function getAlertEvents(brandId: string, limit = 50) {
  return fetchApi(`/api/brands/${brandId}/alert-events?limit=${limit}`);
}

export async function testAlertRules(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/alert-rules/test`, {
    method: 'POST',
  });
}

export async function updateVerificationTask(brandId: string, taskId: string, data: {
  status: 'pending' | 'verified';
  note?: string;
}) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function checkAgentReadinessVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-agent-readiness`, {
    method: 'POST',
  });
}

export async function checkAnswerIntelligenceVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-answer-intelligence`, {
    method: 'POST',
  });
}

export async function checkCitationOpportunityVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-citation-opportunity`, {
    method: 'POST',
  });
}

export async function checkProductPilotVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-product-pilot`, {
    method: 'POST',
  });
}

export async function checkProviderRecoveryVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-provider-recovery`, {
    method: 'POST',
  });
}

export async function checkProductionHardeningVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-production-hardening`, {
    method: 'POST',
  });
}

export async function checkIntegrationSetupVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-integration-setup`, {
    method: 'POST',
  });
}

export async function checkCompetitiveParityVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-competitive-parity`, {
    method: 'POST',
  });
}

export async function checkGenericProofVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-generic-proof`, {
    method: 'POST',
  });
}

export async function checkAxpPublicationVerificationTask(brandId: string, taskId: string) {
  return fetchApi(`/api/brands/${brandId}/verification-tasks/${encodeURIComponent(taskId)}/check-axp-publication`, {
    method: 'POST',
  });
}

// ============= ACCURACY / HALLUCINATION CORRECTION =============

export async function getFactClaims(brandId: string, status?: string) {
  const search = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return fetchApi(`/api/brands/${brandId}/fact-claims${search}`);
}

export async function detectFactClaims(brandId: string, answerLimit = 15) {
  return fetchApi(`/api/brands/${brandId}/fact-claims/detect`, {
    method: 'POST',
    body: JSON.stringify({ answerLimit }),
  });
}

export async function createFactClaim(brandId: string, data: {
  claim: string;
  engine?: string;
  severity?: string;
  correctValue?: string;
  explanation?: string;
}) {
  return fetchApi(`/api/brands/${brandId}/fact-claims`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFactClaim(brandId: string, claimId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/fact-claims/${claimId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function createFactClaimCorrection(brandId: string, claimId: string) {
  return fetchApi(`/api/brands/${brandId}/fact-claims/${claimId}/correction`, {
    method: 'POST',
  });
}

// ============= PDF REPORT (Phase 3.1) =============

export async function getReportPreview(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/report/preview`);
}

export function getReportPDFUrl(brandId: string, params: {
  type?: string;
  timeframe?: string;
  includeScores?: boolean;
  includeCompetitors?: boolean;
  includeGaps?: boolean;
  includeActions?: boolean;
} = {}): string {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.timeframe) searchParams.set('timeframe', params.timeframe);
  if (params.includeScores !== undefined) searchParams.set('includeScores', String(params.includeScores));
  if (params.includeCompetitors !== undefined) searchParams.set('includeCompetitors', String(params.includeCompetitors));
  if (params.includeGaps !== undefined) searchParams.set('includeGaps', String(params.includeGaps));
  if (params.includeActions !== undefined) searchParams.set('includeActions', String(params.includeActions));
  return `/api/brands/${brandId}/report/pdf?${searchParams.toString()}`;
}

// ============= WHITE-LABEL (Phase 3.2) =============

export async function getWhiteLabelConfig() {
  return fetchApi('/api/admin/whitelabel/config');
}

export async function updateWhiteLabelConfig(data: {
  enabled?: boolean;
  agencyName?: string;
  agencyLogoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  websiteUrl?: string;
  contactEmail?: string;
  customDomain?: string;
}) {
  return fetchApi('/api/admin/whitelabel/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getWhiteLabelTheme(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/whitelabel/theme`);
}

// ============= SEO SCORING (Phase 3.3) =============

export async function getSEOScore(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/seo-score`);
}

export async function getGEOSEComparison(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/geo-seo-comparison`);
}

// ============= CRAWLER TRACKING (Phase 3.4) =============

export async function getCrawlerStats(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/crawler-stats`);
}

export async function createManualIntegrationEvidence(brandId: string, data: {
  platform: string;
  accountName?: string;
  proofUrl?: string;
  notes?: string;
}) {
  return fetchApi(`/api/brands/${brandId}/integrations/manual-evidence`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getCrawlerAnalytics(brandId: string, periodDays = 30) {
  return fetchApi(`/api/brands/${brandId}/crawler-analytics?period=${periodDays}`);
}

export async function getAgentBenchmark(brandId: string, periodDays = 30) {
  return fetchApi(`/api/brands/${brandId}/agent-benchmark?period=${periodDays}`);
}

export async function getAttributionReport(brandId: string, periodDays = 30) {
  return fetchApi(`/api/brands/${brandId}/attribution?period=${periodDays}`);
}

export async function createManualAttributionEvidence(brandId: string, data: {
  aiReferralSessions?: number;
  aiReferralConversions?: number;
  aiAttributedRevenue?: number;
  brandedImpressions?: number;
  brandedClicks?: number;
  landingPage?: string;
  sourceEngine?: string;
  proofUrl?: string;
  notes?: string;
  periodDays?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/attribution/manual-evidence`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function rotateCrawlerToken(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/crawler-token`, {
    method: 'POST',
  });
}

export async function createCrawlerTestHit(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/crawler-test-hit`, {
    method: 'POST',
  });
}

export async function trackCrawlerVisit(brandId: string, data: {
  crawlerType: string;
  pagesCrawled?: string[];
  dataShared?: string[];
}) {
  return fetchApi(`/api/brands/${brandId}/crawler-visit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============= REPORT SCHEDULER (Phase 3.5) =============

export async function getReportSchedules(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/report-schedules`);
}

export async function createReportSchedule(brandId: string, data: {
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  reportType: string;
  recipients: string[];
}) {
  return fetchApi(`/api/brands/${brandId}/report-schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createDefaultLaunchReportSchedules(brandId: string, data: {
  recipients: string[];
  time?: string;
}) {
  return fetchApi(`/api/brands/${brandId}/report-schedules/defaults`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReportSchedule(brandId: string, scheduleId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/report-schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteReportSchedule(brandId: string, scheduleId: string) {
  return fetchApi(`/api/brands/${brandId}/report-schedules/${scheduleId}`, {
    method: 'DELETE',
  });
}

export async function triggerReportSchedule(brandId: string, scheduleId: string) {
  return fetchApi(`/api/brands/${brandId}/report-schedules/${scheduleId}/trigger`, {
    method: 'POST',
  });
}

export async function getSchemaTemplates(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/schema-templates`);
}

export async function getGlobalSchemaTemplates() {
  return fetchApi(`/api/schema-templates/global`);
}

export async function createSchemaTemplate(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/schema-templates`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSchemaTemplate(templateId: string, data: any) {
  return fetchApi(`/api/schema-templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSchemaTemplate(templateId: string) {
  return fetchApi(`/api/schema-templates/${templateId}`, {
    method: 'DELETE',
  });
}

// ============= BILLING =============

export async function getSubscription(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/subscription`, {
    headers: { 'x-onboarding-flow': '1' },
  });
}

export async function getInvoices(brandId: string, limit = 50) {
  return fetchApi(`/api/brands/${brandId}/invoices?limit=${limit}`);
}

export async function getPayments(brandId: string, limit = 50) {
  return fetchApi(`/api/brands/${brandId}/payments?limit=${limit}`);
}

// ============= BRAND LOOKUP & AI GENERATION =============

export async function lookupBrand(domain: string) {
  return fetchApi('/api/brand-lookup', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

export async function suggestCompetitors(domain: string, brandName?: string, industry?: string) {
  return fetchApi('/api/brand-lookup/competitors', {
    method: 'POST',
    body: JSON.stringify({ domain, brandName, industry }),
  });
}

export async function generateTopics(brandId: string, competitors: { name: string; domain: string }[]) {
  return fetchApi(`/api/brands/${brandId}/generate-topics`, {
    method: 'POST',
    headers: { 'x-onboarding-flow': '1' },
    body: JSON.stringify({ competitors }),
  });
}

export async function generateQueries(brandId: string, competitors: { name: string; domain: string }[], topics: string[]) {
  return fetchApi(`/api/brands/${brandId}/generate-queries`, {
    method: 'POST',
    headers: { 'x-onboarding-flow': '1' },
    body: JSON.stringify({ competitors, topics }),
  });
}

export async function getTopics(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/topics`, {
    headers: { 'x-onboarding-flow': '1' },
  });
}

// ============= EXISTING APIS (keep these) =============

export async function getBrands() {
  return fetchApi('/api/brands');
}

export async function getBrand(brandId: string) {
  return fetchApi(`/api/brands/${brandId}`);
}

export async function getBrandFeatures(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/features`);
}

export async function createBrand(data: any) {
  return fetchApi('/api/brands', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBrand(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}`, {
    method: 'PATCH',
    headers: { 'x-onboarding-flow': '1' },
    body: JSON.stringify(data),
  });
}

// ============= AGENT READINESS =============

export async function getAgentReadiness(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/agent-readiness`, {
    headers: { 'x-onboarding-flow': '1' },
  });
}

export async function runAgentReadinessTeaser(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/agent-readiness/teaser`, { method: 'POST' });
}

export async function runAgentReadinessFullScan(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/agent-readiness/scan`, { method: 'POST' });
}

export async function createAgentReadinessImplementationTask(brandId: string, issueId: string, issue: any) {
  return fetchApi(`/api/brands/${brandId}/agent-readiness/issues/${encodeURIComponent(issueId)}/task`, {
    method: 'POST',
    body: JSON.stringify(issue),
  });
}

export async function createAgentReadinessSchemaFixPack(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/agent-readiness/schema-fix-pack`, {
    method: 'POST',
  });
}

export async function getProductReadiness(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-readiness`);
}

export async function getProductCatalog(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-catalog`);
}

export async function getProductCatalogImportHistory(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/import-history`);
}

export async function getProductPlaybook(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-playbook`);
}

export async function getProductVisibility(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility`);
}

export async function getProductVisibilityHistory(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/history`);
}

export async function getProductVisibilityActions(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/actions`);
}

export async function updateProductVisibilityActionStatus(
  brandId: string,
  actionId: string,
  status: 'todo' | 'in_progress' | 'blocked' | 'done',
  note?: string,
) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/actions/${encodeURIComponent(actionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}

export async function getProductVisibilityActionExport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/actions-export`);
}

export async function getProductVisibilityClientReport(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/client-report`);
}

export async function downloadProductVisibilityClientReportPdf(brandId: string) {
  const response = await fetch(`${API_BASE}/api/brands/${brandId}/product-visibility/client-report/pdf`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to download product visibility PDF report');
  }

  return response.blob();
}

export async function getProductVisibilityDrafts(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/drafts`);
}

export async function updateProductVisibilityDraftStatus(
  brandId: string,
  actionId: string,
  status: 'draft' | 'in_review' | 'approved' | 'rejected',
  note?: string,
  markdown?: string,
  assignee?: string,
) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/drafts/${encodeURIComponent(actionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note, markdown, assignee }),
  });
}

export async function getProductVisibilityPublishQueue(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/publish-queue`);
}

export async function queueProductVisibilityDraftPublish(
  brandId: string,
  actionId: string,
  channel: 'schema' | 'faq' | 'cms_export' | 'axp',
  note?: string,
) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/drafts/${encodeURIComponent(actionId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ channel, note }),
  });
}

export async function publishProductVisibilityQueueItem(brandId: string, itemId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/publish-queue/${encodeURIComponent(itemId)}/publish`, {
    method: 'POST',
  });
}

export async function saveProductVisibilitySnapshot(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-visibility/snapshot`, {
    method: 'POST',
  });
}

export async function getProductSamplingAutomation(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/product-sampling-automation`);
}

export async function updateProductSamplingAutomation(brandId: string, data: {
  enabled?: boolean;
  frequency?: 'daily' | 'weekly' | 'manual';
  maxPromptsPerRun?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/product-sampling-automation`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function launchProductSellerPilotKit(brandId: string, data: {
  products?: any[];
  enrich?: boolean;
  createPrompts?: boolean;
  queueSampling?: boolean;
  maxPrompts?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/product-seller-pilot-kit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function activateProductPromptPack(brandId: string, data?: {
  maxPrompts?: number;
  maxSamplingPrompts?: number;
}) {
  return fetchApi(`/api/brands/${brandId}/product-prompt-pack/activate`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function createProductPilotCheckTask(brandId: string, checkId: string) {
  return fetchApi(`/api/brands/${brandId}/product-pilot-checks/${encodeURIComponent(checkId)}/task`, {
    method: 'POST',
  });
}

export async function extractProductCatalogFromUrls(brandId: string, urls: string[]) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/extract`, {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
}

export async function discoverProductCatalogFromStorefront(brandId: string, url: string, limit = 12) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/discover`, {
    method: 'POST',
    body: JSON.stringify({ url, limit }),
  });
}

export async function enrichProductCatalog(brandId: string, products: any[]) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/enrich`, {
    method: 'POST',
    body: JSON.stringify({ products }),
  });
}

export async function mapProductCatalogCompetitors(brandId: string, products: any[], competitorUrls: string[]) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/map-competitors`, {
    method: 'POST',
    body: JSON.stringify({ products, competitorUrls }),
  });
}

export async function validateProductCatalogImport(brandId: string, payload: {
  mode: 'json' | 'csv';
  input?: string;
  products?: any[];
}) {
  return fetchApi(`/api/brands/${brandId}/product-catalog/validate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProductCatalog(brandId: string, products: any[], mode: 'json' | 'csv' = 'json') {
  return fetchApi(`/api/brands/${brandId}/product-catalog`, {
    method: 'PUT',
    body: JSON.stringify({ products, mode }),
  });
}

// ============= ADD-ON OFFERS =============

export async function getBrandAddonOffers(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/addon-offers`);
}

export async function checkoutAddonOffer(brandId: string, offerId: string) {
  return fetchApi(`/api/brands/${brandId}/addon-offers/${offerId}/checkout`, { method: 'POST' });
}

export async function verifyAddonPayment(brandId: string, payload: {
  purchaseId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  return fetchApi(`/api/brands/${brandId}/addon-offers/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCompetitors(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/competitors`, {
    headers: { 'x-onboarding-flow': '1' },
  });
}

export async function createCompetitor(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/competitors`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createTopic(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/topics`, {
    method: 'POST',
    headers: { 'x-onboarding-flow': '1' },
    body: JSON.stringify(data),
  });
}

export async function updateTopic(topicId: string, data: any) {
  return fetchApi(`/api/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTopic(topicId: string) {
  return fetchApi(`/api/topics/${topicId}`, {
    method: 'DELETE',
  });
}

export async function getPrompts(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/prompts`, {
    headers: { 'x-onboarding-flow': '1' },
  });
}

export async function createPrompt(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/prompts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createPromptsBulk(brandId: string, prompts: string[]) {
  return fetchApi(`/api/brands/${brandId}/prompts/bulk`, {
    method: 'POST',
    headers: { 'x-onboarding-flow': '1' },
    body: JSON.stringify({ prompts }),
  });
}

export async function getSources(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/sources`);
}

export async function getSourceDomains(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/sources/domains`);
}

export async function getSourceRecommendations(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/sources/recommendations`);
}

export async function getCitationOpportunities(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/citation-opportunities`);
}

export async function createCitationOpportunityTask(brandId: string, sourceId: string) {
  return fetchApi(`/api/brands/${brandId}/citation-opportunities/${sourceId}/task`, {
    method: 'POST',
  });
}

export async function getSourceMentions(brandId: string, sourceId: string) {
  return fetchApi(`/api/brands/${brandId}/sources/${sourceId}/mentions`);
}

export async function getAxpPageHtml(brandId: string, pageId: string) {
  const response = await fetch(`${API_BASE}/api/brands/${brandId}/axp/${pageId}/html`);
  if (!response.ok) {
    throw new Error('Failed to fetch AXP HTML');
  }
  return response.text();
}

export async function getJobs(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/jobs`);
}

// ============= BILLING & PLANS =============

export async function getPlanLimits(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/limits`);
}

export async function checkLimit(brandId: string, limitType: string) {
  return fetchApi(`/api/brands/${brandId}/limits/${limitType}`);
}

export async function getUsage(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/usage`);
}

export async function createSubscription(brandId: string, data: any) {
  return fetchApi(`/api/brands/${brandId}/subscription`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function changePlan(brandId: string, newPlanId: string, immediate = true) {
  return fetchApi(`/api/brands/${brandId}/subscription/change-plan`, {
    method: 'POST',
    body: JSON.stringify({ newPlanId, immediate }),
  });
}

export async function cancelSubscription(brandId: string, immediate = false, reason?: string) {
  return fetchApi(`/api/brands/${brandId}/subscription/cancel`, {
    method: 'POST',
    body: JSON.stringify({ immediate, reason }),
  });
}

export async function downloadInvoice(invoiceId: string) {
  const response = await fetch(`${API_BASE}/api/invoices/${invoiceId}/pdf`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to download invoice');
  }

  return response.blob();
}

// ============= RECOMMENDATIONS & GAP ANALYSIS =============

export async function getRecommendations(brandId: string, limit = 20) {
  return fetchApi(`/api/brands/${brandId}/recommendations?limit=${limit}`);
}

export async function getGapOpportunities(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/gap-analysis/opportunities`);
}

export async function createGapOpportunityTask(brandId: string, opportunityId: string) {
  return fetchApi(`/api/brands/${brandId}/gap-analysis/opportunities/${encodeURIComponent(opportunityId)}/task`, {
    method: 'POST',
  });
}

export async function triggerGapAnalysis(brandId: string, period?: string) {
  return fetchApi(`/api/brands/${brandId}/analyze/gaps`, {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
}

// ============= DASHBOARD =============

export async function getDashboardSummary(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/dashboard/summary`);
}

export async function getDashboardVisibilityScore(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/dashboard/visibility-score`);
}

export async function getDashboardTrends(brandId: string, period: '7d' | '30d' | '90d' = '30d') {
  return fetchApi(`/api/brands/${brandId}/dashboard/trends?period=${period}`);
}

export async function getDashboardModelBreakdown(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/dashboard/model-breakdown`);
}

export async function getDashboardTopicPerformance(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/dashboard/topic-performance`);
}

// ============= PROMPTS PERFORMANCE =============

export async function getPromptResults(brandId: string, promptId: string) {
  return fetchApi(`/api/brands/${brandId}/prompts/${promptId}/results`);
}

export async function runPrompt(brandId: string, promptId: string, providers?: string[]) {
  return fetchApi(`/api/brands/${brandId}/prompts/${promptId}/run`, {
    method: 'POST',
    body: JSON.stringify({ providers }),
  });
}

export async function getPromptsPerformance(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/prompts/performance`);
}

// ============= COMPETITORS ANALYSIS =============

export async function deleteCompetitor(brandId: string, competitorId: string) {
  return fetchApi(`/api/brands/${brandId}/competitors/${competitorId}`, {
    method: 'DELETE',
  });
}

export async function getCompetitorsMatrix(brandId: string) {
  return fetchApi(`/api/brands/${brandId}/competitors/matrix`);
}

export async function getCompetitorComparison(brandId: string, competitorId: string) {
  return fetchApi(`/api/brands/${brandId}/competitors/${competitorId}/comparison`);
}

// Export all as api object
export const api = {
  // Brand Context
  getBrandContext,
  updateBrandContext,
  triggerBrandEnrichment,

  // Analytics
  getPromptAnalytics,
  getAISearchOpportunityBrief,
  getMarketOpportunities,
  createMarketOpportunityTask,
  getPromptCoveragePlan,
  minePrompts,
  getMinedPrompts,
  promoteMinedPrompt,
  dismissMinedPrompt,
  getBrandLocales,
  createBrandLocale,
  deleteBrandLocale,
  getLLMAnswers,
  getPromptRuns,
  getMentions,
  getScanHealth,
  queueScanOperationsRun,
  getScanOperationsHistory,
  getCompetitiveParity,
  getAnswerIntelligence,
  getAudiencePersonas,
  createAnswerIntelligenceRiskTask,
  getLaunchReadiness,
  getLaunchReadinessReport,
  getVisibilityScores,
  getLatestVisibilityScore,
  getTrends,

  // Dashboard
  getDashboardSummary,
  getDashboardVisibilityScore,
  getDashboardTrends,
  getDashboardModelBreakdown,
  getDashboardTopicPerformance,

  // Recommendations & Gap Analysis
  getRecommendations,
  getGapOpportunities,
  getGapAnalysisV2,
  triggerGapAnalysis,

  // Prompts
  getPrompts,
  createPrompt,
  getPromptResults,
  runPrompt,
  getPromptsPerformance,
  triggerLLMSampling,

  // Competitors
  getCompetitors,
  createCompetitor,
  deleteCompetitor,
  getCompetitorsMatrix,
  getCompetitorComparison,

  // Sources
  getSources,
  getSourceDomains,
  getSourceRecommendations,
  getCitationOpportunities,
  createCitationOpportunityTask,
  getSourceMentions,
  getAxpPageHtml,

  // AXP Pages
  getAxpPages,
  getAxpPage,
  createAxpPage,
  updateAxpPage,
  publishAxpPage,
  deleteAxpPage,

  // FAQs
  getFaqEntries,
  createFaqEntry,
  updateFaqEntry,
  deleteFaqEntry,

  // Schema Templates
  getSchemaTemplates,
  getGlobalSchemaTemplates,
  createSchemaTemplate,
  updateSchemaTemplate,
  deleteSchemaTemplate,

  // Jobs
  getJobs,
  getBrandJobs,
  getJobStatus,
  getJobStats,
  triggerFullPipeline,
  triggerFullAnalysis,

  // Brands
  getBrands,
  getBrand,
  getBrandFeatures,
  createBrand,
  updateBrand,
  getAgentReadiness,
  backfillPromptCoverage,
  createQueryFanoutDraft,
  runAgentReadinessTeaser,
  runAgentReadinessFullScan,
  createAgentReadinessImplementationTask,
  getProductReadiness,
  getProductCatalog,
  getProductCatalogImportHistory,
  getProductPlaybook,
  getProductVisibility,
  getProductVisibilityHistory,
  getProductVisibilityActions,
  updateProductVisibilityActionStatus,
  getProductVisibilityActionExport,
  getProductVisibilityClientReport,
  downloadProductVisibilityClientReportPdf,
  getProductVisibilityDrafts,
  updateProductVisibilityDraftStatus,
  getProductVisibilityPublishQueue,
  queueProductVisibilityDraftPublish,
  publishProductVisibilityQueueItem,
  saveProductVisibilitySnapshot,
  getProductSamplingAutomation,
  updateProductSamplingAutomation,
  launchProductSellerPilotKit,
  activateProductPromptPack,
  createProductPilotCheckTask,
  extractProductCatalogFromUrls,
  discoverProductCatalogFromStorefront,
  enrichProductCatalog,
  mapProductCatalogCompetitors,
  validateProductCatalogImport,
  updateProductCatalog,
  getAlertSummary,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getAlertEvents,
  testAlertRules,
  getVerificationTasks,
  updateVerificationTask,
  checkAgentReadinessVerificationTask,
  checkAnswerIntelligenceVerificationTask,
  checkCitationOpportunityVerificationTask,
  checkProductPilotVerificationTask,
  checkProviderRecoveryVerificationTask,
  checkProductionHardeningVerificationTask,
  checkIntegrationSetupVerificationTask,
  checkCompetitiveParityVerificationTask,
  checkGenericProofVerificationTask,
  checkAxpPublicationVerificationTask,
  updateOptimizationLog,
  getFactClaims,
  detectFactClaims,
  createFactClaim,
  updateFactClaim,
  createFactClaimCorrection,
  getCrawlerStats,
  createManualIntegrationEvidence,
  getCrawlerAnalytics,
  getAgentBenchmark,
  getAttributionReport,
  createManualAttributionEvidence,
  getMarketOpportunitiesReport,
  getVerificationEvidenceReport,
  getScanOperationsReport,
  rotateCrawlerToken,

  // Billing & Plans
  getPlanLimits,
  checkLimit,
  getUsage,
  getSubscription,
  createSubscription,
  changePlan,
  cancelSubscription,
  getInvoices,
  getPayments,
  downloadInvoice,

  // Monitoring & Performance
  getSystemHealth,
  getSystemMetrics,
  getSystemStats,
  getRecentErrors,
  resolveError,
  getJobRetryStatus,
  getRateLimitStatus,
};
