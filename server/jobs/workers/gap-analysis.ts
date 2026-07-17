// Gap Analysis Worker - Identifies visibility gaps and opportunities

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';

export interface GapAnalysisPayload {
  brandId: string;
  period?: string; // 'week' | 'month' | 'quarter'
}

export async function gapAnalysisWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as GapAnalysisPayload;
  const { brandId, period = 'month' } = payload;

  console.log(`[GapAnalysis] Starting gap analysis for brand ${brandId}`);

  // Get brand and context
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const context = await storage.getBrandContext(brandId);
  if (!context) {
    throw new Error(`Brand context not found for ${brandId}`);
  }

  // Get all LLM answers for the brand
  const llmAnswers = await storage.getLlmAnswersByBrand(brandId, 1000);
  
  // Get all answer mentions
  const mentions = await storage.getAnswerMentionsByBrand(brandId, 1000);

  // Get competitors
  const competitors = await storage.getCompetitorsByBrand(brandId);

  // Analyze gaps
  const gaps = {
    missingMentions: [] as any[],
    competitorAdvantages: [] as any[],
    lowRankings: [] as any[],
    missedOpportunities: [] as any[],
  };

  // 1. Find prompts where brand is not mentioned
  const promptsWithoutMention = new Set<string>();
  const promptsWithMention = new Set(mentions.map(m => m.llmAnswerId));
  
  llmAnswers.forEach(answer => {
    if (!promptsWithMention.has(answer.id)) {
      promptsWithoutMention.add(answer.promptId);
    }
  });

  // Get prompt details for missing mentions
  const promptsArray = Array.from(promptsWithoutMention);
  for (const promptId of promptsArray) {
    const prompts = await storage.getPromptsByBrand(brandId);
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      gaps.missingMentions.push({
        promptId,
        promptText: prompt.text,
        severity: 'high',
        reason: 'Brand not mentioned in LLM response',
      });
    }
  }

  // 2. Find competitor advantages (where competitors rank higher)
  const brandMentions = mentions.filter(m => m.brandId === brandId);

  // Group by answer to compare positions
  const answerGroups = new Map<string, any[]>();
  mentions.forEach(m => {
    if (!answerGroups.has(m.llmAnswerId)) {
      answerGroups.set(m.llmAnswerId, []);
    }
    answerGroups.get(m.llmAnswerId)!.push(m);
  });

  answerGroups.forEach((mentionsInAnswer, answerId) => {
    const brandMention = mentionsInAnswer.find(m => m.brandId === brandId);
    const competitorMentionsInAnswer = mentionsInAnswer.filter(m => 
      competitors.some(c => c.domain === m.entityName || c.name === m.entityName)
    );

    competitorMentionsInAnswer.forEach(compMention => {
      const compPos = compMention.position ?? Infinity;
      const brandPos = brandMention?.position ?? Infinity;
      if (!brandMention || compPos < brandPos) {
        gaps.competitorAdvantages.push({
          answerId,
          competitor: compMention.entityName,
          competitorPosition: compMention.position,
          brandPosition: brandMention?.position || null,
          severity: brandMention ? 'medium' : 'high',
        });
      }
    });
  });

  // 3. Find low rankings (brand mentioned but in low position)
  brandMentions.forEach(mention => {
    const pos = mention.position ?? 0;
    if (pos > 3) { // Mentioned after 3rd position
      gaps.lowRankings.push({
        answerId: mention.llmAnswerId,
        position: mention.position,
        severity: pos > 5 ? 'high' : 'medium',
      });
    }
  });

  // 4. Calculate gap scores
  const gapScore = {
    missingMentionsCount: gaps.missingMentions.length,
    competitorAdvantagesCount: gaps.competitorAdvantages.length,
    lowRankingsCount: gaps.lowRankings.length,
    overallGapScore: Math.min(100, 
      (gaps.missingMentions.length * 10) +
      (gaps.competitorAdvantages.length * 5) +
      (gaps.lowRankings.length * 3)
    ),
  };

  // 5. Generate recommendations
  const recommendations = [];

  if (gaps.missingMentions.length > 0) {
    recommendations.push({
      type: 'content_creation',
      priority: 'high',
      title: 'Create content for missing topics',
      description: `Brand is not mentioned in ${gaps.missingMentions.length} prompts. Create authoritative content on these topics.`,
      topics: gaps.missingMentions.slice(0, 5).map(g => g.promptText),
    });
  }

  if (gaps.competitorAdvantages.length > 0) {
    const topCompetitors = Array.from(new Set(gaps.competitorAdvantages.map(g => g.competitor)));
    recommendations.push({
      type: 'competitive_analysis',
      priority: 'high',
      title: 'Analyze competitor strategies',
      description: `Competitors (${topCompetitors.slice(0, 3).join(', ')}) are ranking higher. Analyze their content strategy.`,
      competitors: topCompetitors.slice(0, 5),
    });
  }

  if (gaps.lowRankings.length > 0) {
    recommendations.push({
      type: 'content_optimization',
      priority: 'medium',
      title: 'Optimize existing content',
      description: `Brand is mentioned but ranks low in ${gaps.lowRankings.length} responses. Improve content quality and authority.`,
    });
  }

  // 6. Update brand context with gap analysis (store in contentRecommendations field)
  const existingRecommendations = context.contentRecommendations as any || {};
  await storage.updateBrandContext(context.id, {
    contentRecommendations: {
      ...existingRecommendations,
      gapAnalysis: {
        lastAnalyzed: new Date().toISOString(),
        period,
        gaps,
        gapScore,
        recommendations,
      },
    },
  });

  console.log(`[GapAnalysis] Completed for brand ${brandId} - Gap Score: ${gapScore.overallGapScore}`);

  return {
    brandId,
    gapScore,
    gaps: {
      missingMentions: gaps.missingMentions.length,
      competitorAdvantages: gaps.competitorAdvantages.length,
      lowRankings: gaps.lowRankings.length,
    },
    recommendations: recommendations.length,
  };
}
