// Visibility Scoring Worker - Calculates visibility scores based on LLM mentions

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { PROVIDER_MODELS } from '../../lib/plan-providers';

export interface VisibilityScoringPayload {
  brandId: string;
  period?: 'day' | 'week' | 'month';
}

/**
 * Tier S2 — Intent weight table.
 * Higher weights = prompts that matter more to "would AI recommend you" decisions.
 * Buying/comparison/migrate/problem intent carry the most weight; howto/discovery
 * carry less (they are research-phase queries, not decision-phase queries).
 */
export const INTENT_WEIGHT_TABLE: Record<string, number> = {
  comparison: 1.5,
  buying:     1.5,
  problem:    1.5,
  migrate:    1.5,
  local:      1.3,
  negative:   1.0,
  pricing:    0.9,
  review:     0.8,
  discovery:  0.7,
  howto:      0.6,
};

/**
 * Difficulty normalization: a difficulty-5 prompt is twice as hard to rank for as a
 * difficulty-1 prompt. We normalize around the median (3) so the average multiplier is 1.0.
 */
export function difficultyMultiplier(difficulty: number | null | undefined): number {
  if (difficulty === null || difficulty === undefined) return 1.0;
  const d = Math.min(5, Math.max(1, difficulty));
  // difficulty 1 -> 0.4, 2 -> 0.7, 3 -> 1.0, 4 -> 1.3, 5 -> 1.7
  return 0.1 + (d * 0.3);
}

export function computeVisibilityScore(params: {
  totalPrompts: number;
  mentionedPrompts: number;
  positions: number[];            // 1-indexed position per mention (0 = not ranked)
  sentiments: string[];           // 'positive' | 'neutral' | 'negative' per mention
  dedupedCitationCount: number;
  providerCount: number;          // how many providers have contributed data so far
  wikidataBonus: number;          // 0 or 8; always 0 when unconfirmed (spec: no partial credit)
  kgBonus: number;                // 0 or 7
  // Tier S2: per-prompt intent weight + difficulty. When omitted, behaviour is identical
  // to the legacy flat score (backward-compatible for callers that pass nothing).
  promptWeights?: number[];       // length === totalPrompts, one weight per prompt
}): {
  overallScore: number;
  mentionRate: number;
  avgPosition: number;
  sentimentScore: number;
  citationScore: number;
  confidenceBand: number;
  scoreLabel: string;
  // Tier S2: secondary outputs that the Dashboard "Score by Intent" widget uses.
  intentWeightedMentionRate: number; // mention rate after applying intent weights
  effectivePromptCount: number;      // sum of weights (denominator)
} {
  const { totalPrompts, mentionedPrompts, positions, sentiments,
          dedupedCitationCount, providerCount, wikidataBonus, kgBonus,
          promptWeights } = params;

  // Tier S2: intent-weight the mention rate. When promptWeights is provided, we
  // weight each prompt's contribution by its intent weight. The first `mentionedPrompts`
  // of the array are the ones that were mentioned (positions/sentiments align with
  // them); the rest are unmentioned. We distribute weight accordingly.
  let intentWeightedMentionRate = 0;
  let effectivePromptCount = 0;
  if (promptWeights && promptWeights.length === totalPrompts) {
    let mentionedWeight = 0;
    let totalWeight = 0;
    for (let i = 0; i < totalPrompts; i++) {
      const w = promptWeights[i] ?? 1.0;
      totalWeight += w;
      if (i < mentionedPrompts) mentionedWeight += w;
    }
    effectivePromptCount = totalWeight;
    intentWeightedMentionRate = totalWeight > 0 ? (mentionedWeight / totalWeight) * 100 : 0;
  } else {
    // Legacy: flat mention rate
    effectivePromptCount = totalPrompts;
    intentWeightedMentionRate = totalPrompts > 0 ? (mentionedPrompts / totalPrompts) * 100 : 0;
  }

  // 1. Mention rate component (0-100) — intent-weighted when weights are supplied
  const mentionRate = intentWeightedMentionRate;

  // 2. Position component (0-100)
  const positionScores = positions.map(p => {
    if (p === 1) return 100;
    if (p <= 3) return 70;
    if (p <= 5) return 40;
    if (p > 5)  return 10;
    return 0;
  });
  const avgPositionScore = positionScores.length > 0
    ? positionScores.reduce((a: number, b: number) => a + b, 0) / positionScores.length
    : 0;
  const avgPosition = positions.length > 0
    ? positions.reduce((a, b) => a + b, 0) / positions.length
    : 0;

  // 3. Sentiment component (0-100)
  const sentimentMap: Record<string, number> = { positive: 100, neutral: 50, negative: 0 };
  const sentimentScore = sentiments.length > 0
    ? sentiments.reduce((acc, s) => acc + (sentimentMap[s] ?? 50), 0) / sentiments.length
    : 50;

  // 4. Citation quality component (0-100)
  const citationsPerMention = mentionedPrompts > 0 ? dedupedCitationCount / mentionedPrompts : 0;
  const citationScore = Math.min(citationsPerMention, 10) * 10;

  // 5. Weighted base (0-100)
  const weightedBase =
    mentionRate        * 0.40 +
    avgPositionScore   * 0.30 +
    sentimentScore     * 0.20 +
    citationScore      * 0.10;

  // 6. Scale to 0-85, add entity bonuses, cap at 85
  const scaledBase = weightedBase * 0.85;
  const rawTotal = scaledBase + wikidataBonus + kgBonus;
  const overallScore = Math.min(85, Math.round(rawTotal));

  // 7. Confidence band
  const confidenceBand = Math.max(3, 20 - providerCount * 3);

  // 8. Score label
  const scoreLabel =
    overallScore < 31 ? 'Not Visible' :
    overallScore < 51 ? 'Emerging' :
    overallScore < 66 ? 'Growing' :
    overallScore < 76 ? 'Competitive' :
    'Leading';

  return {
    overallScore,
    mentionRate: Math.round(mentionRate * 10) / 10,
    avgPosition: Math.round(avgPosition * 10) / 10,
    sentimentScore: Math.round(sentimentScore),
    citationScore: Math.round(citationScore),
    confidenceBand,
    scoreLabel,
    intentWeightedMentionRate: Math.round(intentWeightedMentionRate * 10) / 10,
    effectivePromptCount: Math.round(effectivePromptCount * 10) / 10,
  };
}

/**
 * Share of Voice: the % of mentions a brand owns versus its competitors,
 * overall and broken down per LLM provider. Pure + exported for testing (Epic I).
 */
export function computeShareOfVoice(params: {
  brandName: string;
  brandMentions: Array<{ llmAnswerId: string }>;
  competitorMentions: Array<{ llmAnswerId: string; competitorId: string | null; entityName: string }>;
  answerProvider: Map<string, string>;
}): {
  overall: { brand: number; byCompetitor: Record<string, number>; total: number; brandSharePct: number };
  byModel: Record<string, { brand: number; competitors: number; brandSharePct: number }>;
} {
  const { brandMentions, competitorMentions, answerProvider } = params;

  const brandCount = brandMentions.length;
  const byCompetitor: Record<string, number> = {};
  for (const m of competitorMentions) {
    const key = m.entityName || m.competitorId || 'unknown';
    byCompetitor[key] = (byCompetitor[key] ?? 0) + 1;
  }
  const competitorTotal = competitorMentions.length;
  const total = brandCount + competitorTotal;
  const brandSharePct = total > 0 ? Math.round((brandCount / total) * 1000) / 10 : 0;

  // Per-model breakdown
  const byModel: Record<string, { brand: number; competitors: number; brandSharePct: number }> = {};
  const bump = (provider: string, key: 'brand' | 'competitors') => {
    const p = provider || 'unknown';
    byModel[p] = byModel[p] ?? { brand: 0, competitors: 0, brandSharePct: 0 };
    byModel[p][key] += 1;
  };
  for (const m of brandMentions) bump(answerProvider.get(m.llmAnswerId) ?? 'unknown', 'brand');
  for (const m of competitorMentions) bump(answerProvider.get(m.llmAnswerId) ?? 'unknown', 'competitors');
  for (const p of Object.keys(byModel)) {
    const t = byModel[p].brand + byModel[p].competitors;
    byModel[p].brandSharePct = t > 0 ? Math.round((byModel[p].brand / t) * 1000) / 10 : 0;
  }

  return {
    overall: { brand: brandCount, byCompetitor, total, brandSharePct },
    byModel,
  };
}

export async function visibilityScoringWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as VisibilityScoringPayload;
  const { brandId, period = 'week' } = payload;

  console.log(`[VisibilityScoring] Starting scoring for brand ${brandId} (${period})`);

  // Get brand
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // Calculate date range based on period
  const periodEnd = new Date();
  const periodStart = new Date();
  switch (period) {
    case 'day':
      periodStart.setDate(periodEnd.getDate() - 1);
      break;
    case 'week':
      periodStart.setDate(periodEnd.getDate() - 7);
      break;
    case 'month':
      periodStart.setMonth(periodEnd.getMonth() - 1);
      break;
  }

  // Read wikidataBonus and kgBonus from brand.brandDevData
  const brandDevData = (brand.brandDevData as any) ?? {};
  const wikidataBonus: number = brandDevData.wikidataBonus ?? 0;
  const kgBonus: number = brandDevData.kgBonus ?? 0;

  // Load deduped citation count from DB (after citation worker ran)
  const dedupedCitationCount = await storage.getDedupedCitationCount(brand.id, periodStart, periodEnd);

  // Load owner-brand mentions only (isCompetitor = false)
  const mentions = await storage.getBrandMentionsForPeriod(brand.id, periodStart, periodEnd);

  // Get all LLM answers in period for prompt count
  const allAnswers = await storage.getLlmAnswersByBrand(brandId, 10000);
  const answersInPeriod = allAnswers.filter(a =>
    a.createdAt && new Date(a.createdAt) >= periodStart
  );

  const uniquePromptIds = new Set(answersInPeriod.map(a => (a as any).promptId));
  const totalPrompts = uniquePromptIds.size || answersInPeriod.length;

  const answersWithMentions = new Set(mentions.map(m => m.llmAnswerId));
  const promptsWithMentions = new Set<string>();
  for (const answer of answersInPeriod) {
    if (answersWithMentions.has(answer.id)) {
      promptsWithMentions.add((answer as any).promptId || answer.id);
    }
  }
  const mentionedPrompts = promptsWithMentions.size;

  // Build positions and sentiments arrays from mentions
  const positions = mentions
    .map(m => m.position)
    .filter((p): p is number => p !== null && p !== undefined);

  const sentiments = mentions
    .map(m => m.sentiment)
    .filter((s): s is string => s !== null && s !== undefined);

  // Count distinct providers used in the period
  const providerCount = new Set(answersInPeriod.map(a => a.llmProvider)).size;

  // Get last provider used (for score record providerBreakdown)
  const providerName = brand.tier
    ? (PROVIDER_MODELS[answersInPeriod[answersInPeriod.length - 1]?.llmProvider] ? answersInPeriod[answersInPeriod.length - 1]?.llmProvider : 'openai')
    : 'openai';
  const modelName = PROVIDER_MODELS[providerName] ?? 'gpt-4o';

  // ===== Share of Voice (Epic I): brand vs competitors, overall + per model =====
  const competitorMentions = await storage.getCompetitorMentionsForPeriod(brand.id, periodStart, periodEnd);
  const answerProvider = new Map<string, string>();
  for (const a of answersInPeriod) answerProvider.set(a.id, a.llmProvider);

  const shareOfVoice = computeShareOfVoice({
    brandName: brand.name,
    brandMentions: mentions,
    competitorMentions,
    answerProvider,
  });

  // Compute canonical score
  const result = computeVisibilityScore({
    totalPrompts,
    mentionedPrompts,
    positions,
    sentiments,
    dedupedCitationCount,
    providerCount: Math.max(1, providerCount),
    wikidataBonus,
    kgBonus,
  });

  let trend: 'up' | 'down' | 'stable' = 'stable';
  try {
    const previousScores = await storage.getVisibilityScoresByBrand(brandId, period, 2);
    if (previousScores.length > 0) {
      const previousScore = previousScores[0].overallScore || 0;
      const diff = result.overallScore - previousScore;
      if (diff > 5) trend = 'up';
      else if (diff < -5) trend = 'down';
    }
  } catch (e) {
    // No previous scores, trend stays stable
  }

  // Persist new score shape including citationScore and confidenceBand fields
  const visibilityScore = await storage.createVisibilityScore({
    brandId,
    period,
    periodStart,
    periodEnd,
    overallScore: result.overallScore,
    mentionCount: mentions.length,
    avgPosition: result.avgPosition,
    totalPrompts,
    mentionedPrompts,
    promptsCovered: mentionedPrompts,
    coverageRate: result.mentionRate,
    sentimentScore: result.sentimentScore,
    citationScore: result.citationScore,
    wikidataBonus,
    kgBonus,
    confidenceBand: result.confidenceBand,
    citationCount: dedupedCitationCount,
    modelBreakdown: [{ model: modelName, mentions: mentions.length }],
    categoryBreakdown: {
      scoreLabel: result.scoreLabel,
      trend,
      shareOfVoice,
      providerBreakdown: [{ provider: providerName, score: result.overallScore }],
      positionDistribution: {
        first: mentions.filter(m => m.position === 1).length,
        topThree: mentions.filter(m => m.position !== null && (m.position as number) <= 3).length,
        topFive: mentions.filter(m => m.position !== null && (m.position as number) <= 5).length,
        other: mentions.filter(m => m.position !== null && (m.position as number) > 5).length,
      },
    },
  });

  await storage.createTrendSnapshot({
    brandId,
    snapshotDate: periodEnd,
    visibilityScore: result.overallScore,
    mentionCount: mentions.length,
    avgRank: result.avgPosition,
    trendDirection: trend,
    metadata: {
      period,
      totalPrompts,
      providerCount,
      sentimentScore: result.sentimentScore,
      scoreLabel: result.scoreLabel,
      wikidataBonus,
      kgBonus,
    },
  });

  console.log(`[VisibilityScoring] Completed for brand ${brandId} - Score: ${result.overallScore} (${result.scoreLabel})`);

  // Trigger gap analysis after visibility scoring completes
  try {
    const { triggerGapAnalysis } = await import('../index');
    await triggerGapAnalysis(brandId, 'month', 5);
    console.log(`[VisibilityScoring] Triggered gap analysis for brand ${brandId}`);
  } catch (error: any) {
    console.error(`[VisibilityScoring] Failed to trigger gap analysis:`, error.message);
    // Don't fail the job if gap analysis trigger fails
  }

  return {
    brandId,
    period,
    score: result.overallScore,
    mentionRate: result.mentionRate,
    avgPosition: result.avgPosition,
    sentimentScore: result.sentimentScore,
    citationScore: result.citationScore,
    confidenceBand: result.confidenceBand,
    scoreLabel: result.scoreLabel,
    trend,
    totalMentions: mentions.length,
  };
}
