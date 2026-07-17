// Recommendation Worker - Generates actionable recommendations based on analysis

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';

export interface RecommendationPayload {
  brandId: string;
}

export async function recommendationWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as RecommendationPayload;
  const { brandId } = payload;

  console.log(`[Recommendation] Generating recommendations for brand ${brandId}`);

  // Get brand and context
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const context = await storage.getBrandContext(brandId);
  if (!context) {
    throw new Error(`Brand context not found for ${brandId}`);
  }

  const recommendations = [];

  // 1. Content Recommendations based on completeness
  if ((context.completenessScore ?? 0) < 70) {
    recommendations.push({
      type: 'brand_enrichment',
      priority: 'high',
      title: 'Complete Brand Profile',
      description: `Your brand profile is ${context.completenessScore ?? 0}% complete. Add missing information to improve AI visibility.`,
      actions: [
        'Add brand description and mission',
        'Specify products and services',
        'Define target audience',
        'Add brand values and differentiators',
      ],
      impact: 'high',
      effort: 'low',
    });
  }

  // 2. Visibility Recommendations based on latest score
  const latestScore = await storage.getLatestVisibilityScore(brandId);
  
  if (latestScore) {
    if ((latestScore.overallScore ?? 0) < 50) {
      recommendations.push({
        type: 'visibility_improvement',
        priority: 'critical',
        title: 'Improve AI Visibility',
        description: `Your visibility score is ${latestScore.overallScore ?? 0}/100. Focus on creating authoritative content.`,
        actions: [
          'Create comprehensive guides on your expertise',
          'Publish case studies and success stories',
          'Engage with industry discussions',
          'Build high-quality backlinks',
        ],
        impact: 'high',
        effort: 'high',
      });
    }

    if ((latestScore.mentionCount ?? 0) < 30) {
      recommendations.push({
        type: 'content_creation',
        priority: 'high',
        title: 'Increase Topic Coverage',
        description: `You're only mentioned in ${latestScore.mentionCount ?? 0} of relevant queries. Expand your content coverage.`,
        actions: [
          'Identify missing topic areas',
          'Create FAQ content',
          'Publish thought leadership articles',
          'Optimize existing content for AI',
        ],
        impact: 'high',
        effort: 'medium',
      });
    }

    if ((latestScore.avgPosition ?? 0) > 3) {
      recommendations.push({
        type: 'ranking_improvement',
        priority: 'medium',
        title: 'Improve Mention Rankings',
        description: `Average mention position is ${(latestScore.avgPosition ?? 0).toFixed(1)}. Aim for top 3 positions.`,
        actions: [
          'Strengthen brand authority signals',
          'Improve content quality and depth',
          'Build more authoritative citations',
          'Engage with AI training data sources',
        ],
        impact: 'medium',
        effort: 'medium',
      });
    }

    if ((latestScore.sentimentScore ?? 0) < 0) {
      recommendations.push({
        type: 'reputation_management',
        priority: 'critical',
        title: 'Address Negative Sentiment',
        description: 'Negative sentiment detected in AI responses. Address reputation issues immediately.',
        actions: [
          'Identify sources of negative mentions',
          'Address customer concerns publicly',
          'Publish positive case studies',
          'Monitor and respond to feedback',
        ],
        impact: 'high',
        effort: 'high',
      });
    }
  }

  // 3. Gap Analysis Recommendations
  const gapAnalysis = (context.gapAnalysis as any)?.gaps ? (context.gapAnalysis as any) : null;

  if (gapAnalysis) {
    if (gapAnalysis.gaps.missingMentions.length > 0) {
      const topGaps = gapAnalysis.gaps.missingMentions.slice(0, 3);
      recommendations.push({
        type: 'content_gaps',
        priority: 'high',
        title: 'Fill Content Gaps',
        description: `${gapAnalysis.gaps.missingMentions.length} topics where you're not mentioned.`,
        actions: topGaps.map((gap: any) => `Create content about: ${gap.promptText}`),
        impact: 'high',
        effort: 'medium',
      });
    }

    if (gapAnalysis.gaps.competitorAdvantages.length > 0) {
      recommendations.push({
        type: 'competitive_strategy',
        priority: 'high',
        title: 'Counter Competitor Advantages',
        description: `Competitors outrank you in ${gapAnalysis.gaps.competitorAdvantages.length} areas.`,
        actions: [
          'Analyze competitor content strategy',
          'Identify your unique differentiators',
          'Create comparison content',
          'Strengthen authority in key areas',
        ],
        impact: 'high',
        effort: 'high',
      });
    }
  }

  // 4. Technical Recommendations
  const hasAXP = (context.recommendedActions as any)?.axpOptimization?.enabled;
  if (!hasAXP) {
    recommendations.push({
      type: 'technical_optimization',
      priority: 'medium',
      title: 'Enable AI Experience Pages (AXP)',
      description: 'Create AI-optimized pages to improve discoverability.',
      actions: [
        'Set up AXP pages for key topics',
        'Optimize for AI consumption',
        'Add structured data',
        'Monitor AXP performance',
      ],
      impact: 'medium',
      effort: 'medium',
    });
  }

  // 5. Prioritize recommendations
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => 
    priorityOrder[a.priority as keyof typeof priorityOrder] - 
    priorityOrder[b.priority as keyof typeof priorityOrder]
  );

  // 6. Update brand context with recommendations
  await storage.updateBrandContext(context.id, {
    recommendedActions: {
      ...(context.recommendedActions as any),
      recommendations: {
        lastGenerated: new Date(),
        items: recommendations,
        totalRecommendations: recommendations.length,
        criticalCount: recommendations.filter(r => r.priority === 'critical').length,
        highCount: recommendations.filter(r => r.priority === 'high').length,
      },
    },
  });

  console.log(`[Recommendation] Generated ${recommendations.length} recommendations for brand ${brandId}`);

  return {
    brandId,
    totalRecommendations: recommendations.length,
    byPriority: {
      critical: recommendations.filter(r => r.priority === 'critical').length,
      high: recommendations.filter(r => r.priority === 'high').length,
      medium: recommendations.filter(r => r.priority === 'medium').length,
      low: recommendations.filter(r => r.priority === 'low').length,
    },
    topRecommendations: recommendations.slice(0, 5).map(r => ({
      type: r.type,
      priority: r.priority,
      title: r.title,
    })),
  };
}
