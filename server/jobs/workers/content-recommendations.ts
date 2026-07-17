// Content Recommendations Worker - Generate optimization suggestions from all data sources

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';

export interface ContentRecommendationsPayload {
  brandId: string;
}

export async function contentRecommendationsWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as ContentRecommendationsPayload;
  const { brandId } = payload;

  console.log(`[ContentRecommendations] Generating recommendations for brand ${brandId}`);

  // Get brand
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const recommendations: any[] = [];

  // 1. Analyze SERP data for opportunities
  try {
    const serpResults = await storage.getSerpResultsByBrand(brandId, 100);
    
    // Find queries where brand is not ranking
    const missingQueries = serpResults.filter((r: any) => r.position === null || r.position > 10);
    
    if (missingQueries.length > 0) {
      recommendations.push({
        brandId,
        type: 'serp',
        priority: 'high',
        title: `Improve rankings for ${missingQueries.length} queries`,
        description: `Brand is not ranking in top 10 for ${missingQueries.length} important queries. Create targeted content to capture these opportunities.`,
        currentValue: 0,
        potentialValue: missingQueries.length * 100, // Estimated traffic value
        effortScore: 7,
        impactScore: 9,
        status: 'pending',
        metadata: {
          queries: missingQueries.slice(0, 10).map(q => q.query),
          totalQueries: missingQueries.length,
        },
      });
    }

    // Find queries with AI Overview but no brand mention
    const aiOverviewOpportunities = serpResults.filter(
      (r: any) => r.hasAiOverview && !r.aiOverviewMentionsBrand
    );

    if (aiOverviewOpportunities.length > 0) {
      recommendations.push({
        brandId,
        type: 'ai_overview',
        priority: 'high',
        title: `Get mentioned in ${aiOverviewOpportunities.length} AI Overviews`,
        description: `These queries trigger AI Overviews but don't mention your brand. Optimize content to become a cited source.`,
        currentValue: 0,
        potentialValue: aiOverviewOpportunities.length * 150,
        effortScore: 8,
        impactScore: 10,
        status: 'pending',
        metadata: {
          queries: aiOverviewOpportunities.slice(0, 10).map(q => q.query),
          totalQueries: aiOverviewOpportunities.length,
        },
      });
    }

  } catch (error: any) {
    console.error(`[ContentRecommendations] SERP analysis failed:`, error.message);
  }

  // 2. Analyze PAA questions for content gaps
  try {
    const paaQuestions = await storage.getPaaQuestionsByBrand(brandId, 100);
    
    // Find unanswered PAA questions
    const unansweredQuestions = paaQuestions.filter((q: any) => !q.isAnsweredByBrand);

    if (unansweredQuestions.length > 0) {
      recommendations.push({
        brandId,
        type: 'paa',
        priority: 'medium',
        title: `Answer ${unansweredQuestions.length} People Also Ask questions`,
        description: `Create content addressing these commonly asked questions to improve visibility and authority.`,
        currentValue: 0,
        potentialValue: unansweredQuestions.length * 50,
        effortScore: 5,
        impactScore: 7,
        status: 'pending',
        metadata: {
          questions: unansweredQuestions.slice(0, 10).map(q => ({
            question: q.question,
            query: q.query,
          })),
          totalQuestions: unansweredQuestions.length,
        },
      });
    }

  } catch (error: any) {
    console.error(`[ContentRecommendations] PAA analysis failed:`, error.message);
  }

  // 3. Analyze Knowledge Graph for entity improvements
  try {
    const kgStatus = await storage.getKnowledgeGraphStatus(brandId);

    const kgCompleteness = kgStatus?.completenessScore ?? 0;
    if (kgStatus && kgCompleteness < 70) {
      recommendations.push({
        brandId,
        type: 'schema',
        priority: 'medium',
        title: 'Improve Knowledge Graph presence',
        description: `Your Wikidata entity is ${kgCompleteness}% complete. Adding missing claims will improve AI understanding of your brand.`,
        currentValue: kgCompleteness,
        potentialValue: 100,
        effortScore: 6,
        impactScore: 8,
        status: 'pending',
        metadata: {
          wikidataId: kgStatus.wikidataId,
          missingClaims: kgStatus.missingClaims,
          recommendations: kgStatus.recommendations,
        },
      });
    }

  } catch (error: any) {
    console.error(`[ContentRecommendations] Knowledge Graph analysis failed:`, error.message);
  }

  // 4. Analyze social performance for content strategy
  try {
    const socialPerf = await storage.getSocialPerformanceByBrand(brandId, 30);

    if (socialPerf.length > 0) {
      // Calculate average engagement by platform
      const platformEngagement = socialPerf.reduce((acc: any, perf) => {
        if (!acc[perf.platform]) {
          acc[perf.platform] = { total: 0, count: 0 };
        }
        acc[perf.platform].total += perf.totalEngagement;
        acc[perf.platform].count += 1;
        return acc;
      }, {});

      // Find underperforming platforms
      const avgEngagement = Object.values(platformEngagement).reduce(
        (sum: number, p: any) => sum + p.total / p.count,
        0
      ) / Object.keys(platformEngagement).length;

      const underperformingPlatforms = Object.entries(platformEngagement)
        .filter(([_, data]: any) => data.total / data.count < avgEngagement * 0.7)
        .map(([platform]) => platform);

      if (underperformingPlatforms.length > 0) {
        recommendations.push({
          brandId,
          type: 'social',
          priority: 'low',
          title: `Improve ${underperformingPlatforms.join(', ')} engagement`,
          description: `These platforms are underperforming. Analyze top content and adjust strategy.`,
          currentValue: 0,
          potentialValue: 200,
          effortScore: 6,
          impactScore: 5,
          status: 'pending',
          metadata: {
            platforms: underperformingPlatforms,
            avgEngagement,
          },
        });
      }

      // Check sentiment
      const negativeSentiment = socialPerf.filter((p: any) => (p.avgSentiment ?? 0) < -0.2);
      if (negativeSentiment.length > 0) {
        recommendations.push({
          brandId,
          type: 'social',
          priority: 'high',
          title: 'Address negative sentiment',
          description: `Negative sentiment detected on ${negativeSentiment.map(p => p.platform).join(', ')}. Review and respond to concerns.`,
          currentValue: -1,
          potentialValue: 0,
          effortScore: 4,
          impactScore: 8,
          status: 'pending',
          metadata: {
            platforms: negativeSentiment.map(p => ({
              platform: p.platform,
              sentiment: p.avgSentiment ?? 0,
              negativeMentions: p.negativeMentions,
            })),
          },
        });
      }
    }

  } catch (error: any) {
    console.error(`[ContentRecommendations] Social analysis failed:`, error.message);
  }

  // Store all recommendations
  for (const rec of recommendations) {
    try {
      await storage.createRecommendation(rec);
    } catch (error: any) {
      console.error(`[ContentRecommendations] Failed to store recommendation:`, error.message);
    }
  }

  console.log(
    `[ContentRecommendations] Generated ${recommendations.length} recommendations for brand ${brandId}`
  );

  return {
    brandId,
    recommendationsGenerated: recommendations.length,
    byType: recommendations.reduce((acc: any, rec) => {
      acc[rec.type] = (acc[rec.type] || 0) + 1;
      return acc;
    }, {}),
    byPriority: recommendations.reduce((acc: any, rec) => {
      acc[rec.priority] = (acc[rec.priority] || 0) + 1;
      return acc;
    }, {}),
  };
}
