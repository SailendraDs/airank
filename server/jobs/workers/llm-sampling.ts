import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import type { LLMMessage } from '../../integrations/llm/base';
import type { LLMProviderName } from '../../integrations/llm';
import crypto from 'crypto';
import { logger } from '../../lib/logger';
import { PLAN_PROVIDERS, PROVIDER_MODELS, configuredProviderMap } from '../../lib/plan-providers';
import { resolvePromptTemplateByName } from "../../services/prompt-template-runtime";

const POSITIVE_WORDS = ['best', 'excellent', 'leading', 'top', 'recommended', 'innovative', 'trusted', 'reliable', 'popular', 'quality', 'outstanding', 'favored', 'advantage', 'strong', 'superior', 'premier', 'renowned', 'award-winning'];
const NEGATIVE_WORDS = ['worst', 'poor', 'expensive', 'limited', 'issue', 'problem', 'lacking', 'weak', 'inferior', 'overpriced', 'disappointing', 'complaints'];

function redactProviderError(message: string): string {
  return String(message || '')
    .replace(/api_key:[A-Za-z0-9_\-]+/g, 'api_key:[redacted]')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[redacted-google-api-key]')
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, '[redacted-api-key]');
}

function analyzeSentiment(contextText: string): { sentiment: string; confidence: number } {
  const lowerContext = contextText.toLowerCase();
  const hasPositive = POSITIVE_WORDS.some(word => lowerContext.includes(word));
  const hasNegative = NEGATIVE_WORDS.some(word => lowerContext.includes(word));

  if (hasPositive && !hasNegative) {
    return { sentiment: 'positive', confidence: 0.85 };
  }
  if (hasNegative && !hasPositive) {
    return { sentiment: 'negative', confidence: 0.85 };
  }
  if (hasPositive && hasNegative) {
    return { sentiment: 'neutral', confidence: 0.7 };
  }
  return { sentiment: 'neutral', confidence: 0.7 };
}

export interface LLMSamplingPayload {
  brandId: string;
  promptId: string;
  model?: string;
  provider?: LLMProviderName;
  force?: boolean;
  allowPlanOverride?: boolean;
  competitorId?: string; // When set, runs sampling from competitor's perspective
}

function selectProviderForRun(
  planName: string,
  lastProviderIndex: number,
  configuredKeys: Record<string, boolean>,
  requestedProvider?: string,
  allowPlanOverride = false
): { provider: string; nextIndex: number } | null {
  const allowed = PLAN_PROVIDERS[planName] ?? PLAN_PROVIDERS['free'];
  const selectableProviders = allowPlanOverride ? Object.keys(configuredKeys).filter((provider) => provider !== 'openrouter') : allowed;
  const available = selectableProviders.filter(p => configuredKeys[p]);

  if (available.length === 0) {
    logger.warn(`[LLMSampling] No configured providers for plan "${planName}"`);
    return null;
  }

  if (requestedProvider) {
    if (!allowPlanOverride && !allowed.includes(requestedProvider)) {
      throw new Error(`Provider ${requestedProvider} is not available on plan "${planName}"`);
    }
    if (!configuredKeys[requestedProvider]) {
      throw new Error(`Provider ${requestedProvider} is not configured`);
    }
    return { provider: requestedProvider, nextIndex: lastProviderIndex };
  }

  const provider = available[lastProviderIndex % available.length];
  return { provider, nextIndex: lastProviderIndex + 1 };
}

export async function llmSamplingWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as LLMSamplingPayload;
  const { brandId, promptId, model, competitorId, force, provider: requestedProvider, allowPlanOverride } = payload;

  const isCompetitorRun = !!competitorId;
  logger.info(`[LLMSampling] Starting sampling for prompt ${promptId}${isCompetitorRun ? ` (competitor: ${competitorId})` : ''}`);

  const prompt = await storage.getPrompt(promptId);
  if (!prompt) {
    throw new Error(`Prompt ${promptId} not found`);
  }

  // Skip freshness check for competitor runs (always sample)
  if (!isCompetitorRun && !force && !requestedProvider) {
    const existingAnswers = await storage.getLlmAnswersByPrompt(promptId, 1);

    if (existingAnswers.length > 0) {
      const { needsEnrichment } = await import('../../services/entity-resolution');
      const samplingCheck = await needsEnrichment(brandId, 'llmSampling');

      if (!samplingCheck.needs) {
        logger.info(`[LLMSampling] Skipping prompt ${promptId}: fresh data exists (${existingAnswers.length} answers)`);
        return {
          promptId,
          brandId,
          skipped: true,
          reason: samplingCheck.reason,
          lastSampled: samplingCheck.lastEnriched,
        };
      }
    }
  }

  logger.info(`[LLMSampling] Running sampling for prompt ${promptId}${isCompetitorRun ? ' [competitor mode]' : ''}`);

  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // For competitor runs, resolve competitor entity
  let subjectName: string;
  let subjectDomain: string;
  let providerIndex: number;

  if (isCompetitorRun) {
    const competitor = await storage.getCompetitor(competitorId);
    if (!competitor) {
      throw new Error(`Competitor ${competitorId} not found`);
    }
    subjectName = competitor.name;
    subjectDomain = competitor.domain;
    providerIndex = competitor.lastProviderIndex ?? 0;
  } else {
    const context = await storage.getBrandContext(brandId);
    const brandIdentity = context?.brandIdentity as any;
    subjectName = brand.name || brandIdentity?.officialName || '';
    subjectDomain = brand.domain || '';
    providerIndex = brand.lastProviderIndex ?? 0;
  }

  const brandTier = brand.tier || 'free';

  const configuredKeys = configuredProviderMap();

  const selection = selectProviderForRun(brandTier, providerIndex, configuredKeys, requestedProvider, allowPlanOverride);
  if (!selection) {
    throw new Error(`No providers available for brand ${brand.id} on plan ${brandTier}`);
  }

  // Update round-robin index before running (so crash doesn't re-run same provider)
  if (isCompetitorRun) {
    await storage.updateCompetitor(competitorId, { lastProviderIndex: selection.nextIndex });
  } else {
    await storage.updateBrandProviderIndex(brand.id, selection.nextIndex);
  }

  const providerName = selection.provider;
  const modelName = PROVIDER_MODELS[providerName];

  const competitors = await storage.getCompetitorsByBrand(brandId);
  const competitorNames = competitors.map((c: any) => c.name);

  const promptRun = await storage.createPromptRun({
    promptId,
    brandId,
    llmProvider: providerName,
    status: 'running',
    metadata: { providersUsed: [providerName], competitorId: competitorId || null },
  });

  const integrations = getIntegrations();
  const hasLLMProviders = integrations.llm && integrations.llm.getAvailableProviders?.().length > 0;

  if (!hasLLMProviders) {
    logger.warn(`[LLMSampling] No LLM provider keys configured — skipping sampling for prompt ${promptId}`);
    return { status: 'skipped', reason: 'no_api_keys' };
  }

  let totalCost = 0;
  let totalTokens = 0;
  let samplingError: string | null = null;

  const fallbackSystemPrompt = 'You are a helpful AI assistant. Provide accurate, detailed, and well-sourced responses. Always cite your sources by including full URLs (https://...) or domain names where the information can be verified. Include at least 3-5 source links in your response when possible.';
  let systemPrompt = await resolvePromptTemplateByName(
    'LLM Sampling Default (System)',
    fallbackSystemPrompt,
  );

  const fallbackUserPrompt = '{{prompt_text}}\n\nPlease include relevant sources, references, and URLs that support your answer. List source links at the end of your response.';
  let userPrompt = await resolvePromptTemplateByName(
    'LLM Sampling Default (User)',
    fallbackUserPrompt,
    { prompt_text: prompt.text },
  );

  if (prompt.templateId) {
    try {
      const template = await storage.getPromptTemplate(prompt.templateId);
      if (template && template.isActive && template.template) {
        let resolvedTemplate = template.template;
        resolvedTemplate = resolvedTemplate.replace(/\{\{brand_name\}\}/gi, subjectName);
        resolvedTemplate = resolvedTemplate.replace(/\{\{industry\}\}/gi, brand.industry || '');
        resolvedTemplate = resolvedTemplate.replace(/\{\{domain\}\}/gi, subjectDomain);
        resolvedTemplate = resolvedTemplate.replace(/\{\{competitors\}\}/gi, competitorNames.join(', '));
        userPrompt = resolvedTemplate;
        logger.info(`[LLMSampling] Using admin template "${template.name}" (v${template.version}) for prompt ${promptId}`);
      }
    } catch (err) {
      logger.warn(`[LLMSampling] Failed to load template for prompt ${promptId}, using default`);
    }
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let answerResult: { provider: string; model: string; answerId: string; mentions: number; citations: number; cost: number; tokens: number } | null = null;
  let extractedMentions: Array<{ brandId: string; competitorId: string | null; entityName: string; isCompetitor: boolean; position: number | null; sentiment: string }> = [];

  try {
    logger.info(`[LLMSampling] Querying ${providerName} for prompt ${promptId}`);
    const requestedMaxTokens = Number(job.payload.maxTokens || 0);
    const maxTokens = Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0
      ? Math.min(Math.round(requestedMaxTokens), 2000)
      : 2000;
    const response = await integrations.llm!.chat(providerName as LLMProviderName, messages, {
      model: model ?? modelName,
      temperature: 0.7,
      maxTokens,
    });

    const responseHash = crypto
      .createHash('sha256')
      .update(response.content)
      .digest('hex');

    const llmAnswer = await storage.createLlmAnswer({
      promptId,
      brandId,
      competitorId: competitorId || null,
      llmProvider: providerName,
      llmModel: response.model,
      rawResponse: response.content,
      responseHash,
      parsedResponse: { tokensUsed: response.usage.totalTokens, cost: response.cost },
    });

    const previousAnswers = await storage.getLlmAnswersByPrompt(promptId, 2);
    if (previousAnswers.length >= 2) {
      try {
        const { analyzeDrift, formatDriftReport } = await import('../../services/drift-detection');

        const previous = previousAnswers[1];
        const current = llmAnswer;

        const driftAnalysis = analyzeDrift({
          previous: {
            hash: previous.responseHash || '',
            content: previous.rawResponse,
            mentions: [],
            timestamp: previous.createdAt || new Date(),
          },
          current: {
            hash: current.responseHash || '',
            content: current.rawResponse,
            mentions: [],
            timestamp: current.createdAt || new Date(),
          },
        }, subjectName);

        if (driftAnalysis.hasDrift) {
          logger.info(`[LLMSampling] Drift detected for ${providerName}: ${driftAnalysis.driftScore}/100 (${driftAnalysis.significance})`);
          logger.info(formatDriftReport(driftAnalysis));
        }
      } catch (driftError: any) {
        logger.warn(`[LLMSampling] Drift detection error: ${driftError.message}`);
      }
    }

    const answerText = response.content;
    const mentions = extractMentions(
      answerText,
      isCompetitorRun ? competitorId : brand.id,
      subjectName,
      isCompetitorRun ? [] : (brand.brandVariations ?? []),
      competitors,
    );
    extractedMentions = mentions;

    for (const mention of mentions) {
      await storage.createAnswerMention({
        llmAnswerId: llmAnswer.id,
        brandId: mention.brandId,
        competitorId: mention.competitorId ?? null,
        entityName: mention.entityName,
        isCompetitor: mention.isCompetitor,
        position: mention.position,
        sentiment: mention.sentiment,
        confidence: 0.85,
      });
    }

    const urlRegex = /https?:\/\/[^\s)]+/g;
    const urls = response.content.match(urlRegex) || [];

    for (let i = 0; i < urls.length; i++) {
      try {
        const url = urls[i].replace(/[.,;:!?]+$/, '');
        const domain = new URL(url).hostname;

        await storage.createAnswerCitation({
          llmAnswerId: llmAnswer.id,
          url,
          domain,
          position: i + 1,
          citationType: 'inline',
        });
      } catch {}
    }

    totalCost += response.cost;
    totalTokens += response.usage.totalTokens;

    answerResult = {
      provider: providerName,
      model: response.model,
      answerId: llmAnswer.id,
      mentions: mentions.length,
      citations: urls.length,
      cost: response.cost,
      tokens: response.usage.totalTokens,
    };

  } catch (error: any) {
    const safeError = redactProviderError(error.message || 'Provider returned no answer');
    logger.error(`[LLMSampling] Error with ${providerName}: ${safeError}`);
    samplingError = safeError;
  }

  await storage.updatePromptRun(promptRun.id, {
    status: answerResult ? 'completed' : 'failed',
    cost: totalCost,
    tokensUsed: totalTokens,
    completedAt: new Date(),
    error: answerResult ? null : (samplingError || 'Provider returned no answer'),
    metadata: { providersUsed: [providerName], answersGenerated: answerResult ? 1 : 0, competitorId: competitorId || null },
  });

  // Update competitor visibility metrics after a competitor run
  if (isCompetitorRun && answerResult) {
    try {
      const subjectMentions = extractedMentions.filter(m => !m.isCompetitor);
      const subjectMentioned = subjectMentions.length > 0;
      const avgPosition = subjectMentions.length > 0
        ? subjectMentions.reduce((sum, m) => sum + (m.position || 10), 0) / subjectMentions.length
        : 0;

      const competitor = await storage.getCompetitor(competitorId);
      if (competitor) {
        const currentMentions = (competitor.mentions || 0) + (subjectMentioned ? 1 : 0);
        const currentAvgRank = competitor.avgRank || 0;
        const newAvgRank = currentAvgRank > 0
          ? (currentAvgRank + avgPosition) / 2
          : avgPosition;

        await storage.updateCompetitor(competitorId, {
          mentions: currentMentions,
          avgRank: Math.round(newAvgRank * 10) / 10,
          visibilityScore: subjectMentioned ? Math.min(100, (competitor.visibilityScore || 0) + 10) : competitor.visibilityScore || 0,
          lastSampledAt: new Date(),
        } as any);
      }
    } catch (err: any) {
      logger.warn(`[LLMSampling] Failed to update competitor metrics: ${err.message}`);
    }
  }

  logger.info(`[LLMSampling] Completed sampling for prompt ${promptId}${isCompetitorRun ? ' [competitor]' : ''} - provider: ${providerName}, cost: $${totalCost.toFixed(4)}`);

  return {
    promptId,
    brandId,
    results: answerResult ? [answerResult] : [],
    totalCost,
    totalTokens,
  };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\b(inc|ltd|llc|corp|co|company|technologies|tech|solutions)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMentions(
  answerText: string,
  brandId: string,
  brandName: string,
  brandVariations: string[],
  competitorList: { id: string; name: string }[]
): Array<{
  brandId: string;
  competitorId: string | null;
  entityName: string;
  isCompetitor: boolean;
  position: number | null;
  sentiment: string;
}> {
  const mentions: ReturnType<typeof extractMentions> = [];
  const normalizedAnswer = normalizeName(answerText);
  const lines = answerText.split(/\n|\./).filter(Boolean);

  // Helper: detect position (1-indexed, based on order in answer)
  const detectPosition = (name: string): number | null => {
    const idx = lines.findIndex(line =>
      normalizeName(line).includes(normalizeName(name))
    );
    return idx >= 0 ? idx + 1 : null;
  };

  // 1. Check for owner brand
  const allBrandNames = [brandName, ...brandVariations];
  const brandFound = allBrandNames.some(n =>
    normalizedAnswer.includes(normalizeName(n))
  );
  if (brandFound) {
    mentions.push({
      brandId,
      competitorId: null,
      entityName: brandName,
      isCompetitor: false,
      position: detectPosition(brandName),
      sentiment: analyzeSentiment(answerText).sentiment,
    });
  }

  // 2. Check for each competitor
  for (const competitor of competitorList) {
    if (normalizeName(normalizedAnswer).includes(normalizeName(competitor.name))) {
      mentions.push({
        brandId,           // owner brand — always set
        competitorId: competitor.id,
        entityName: competitor.name,
        isCompetitor: true,
        position: detectPosition(competitor.name),
        sentiment: analyzeSentiment(answerText).sentiment,
      });
    }
  }

  return mentions;
}

