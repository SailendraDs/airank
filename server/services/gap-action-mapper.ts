// Gap-to-Action Mapper - Connect gap analysis to specific actionable recommendations
// Transforms "You're #4" into "Here's how to get to #2"

import { storage } from '../storage';

export interface GapAnalysis {
  topic: string;
  topicId: string;
  yourPosition: number;
  yourScore: number;
  competitor: string;
  competitorPosition: number;
  keywordDifficulty: number;
  gap: number; // Difference in positions
  suggestedAction: string;
  estimatedImpact: number; // Points
  effortLevel: 'easy' | 'medium' | 'hard';
  actionType: 'content' | 'citation' | 'schema' | 'keyword' | 'technical';
}

export interface Action {
  type: 'content_add' | 'citation_boost' | 'schema_markup' | 'keyword_optimization' | 'technical_seo';
  title: string;
  description: string;
  steps: string[];
  estimatedImpact: number;
  effortLevel: 'easy' | 'medium' | 'hard';
  priority: 'high' | 'medium' | 'low';
}

// Action mapping rules
const ACTION_RULES: Array<{
  condition: (gap: GapAnalysis) => boolean;
  action: Omit<Action, 'title' | 'description' | 'steps'>;
  getContent: (gap: GapAnalysis) => { title: string; description: string; steps: string[] };
}> = [
  // Easy wins: low difficulty, close position gap
  {
    condition: (gap) => gap.keywordDifficulty < 30 && gap.yourPosition <= 10,
    action: { type: 'keyword_optimization', estimatedImpact: 5, effortLevel: 'easy', priority: 'high' },
    getContent: (gap) => ({
      title: `Add missing keywords for "${gap.topic}"`,
      description: `You're close to ranking higher. Add 2-3 related keywords to your content.`,
      steps: [
        'Identify 2-3 related keywords competitors rank for',
        'Add keywords naturally to H2 headings and first paragraph',
        'Include in meta description if not present',
      ],
    }),
  },
  // Citation boost: medium difficulty, position 3-5
  {
    condition: (gap) => gap.yourPosition > 3 && gap.yourPosition <= 5,
    action: { type: 'citation_boost', estimatedImpact: 7, effortLevel: 'medium', priority: 'high' },
    getContent: (gap) => ({
      title: `Build citations from top sources`,
      description: `To outrank "${gap.competitor}", build citations from sources they cite.`,
      steps: [
        'Find sources that mention your competitor',
        'Reach out or create content worth citing',
        'Add schema markup for rich snippets',
      ],
    }),
  },
  // Content gap: high difficulty, far position
  {
    condition: (gap) => gap.keywordDifficulty > 50 && gap.yourPosition > 5,
    action: { type: 'content_add', estimatedImpact: 10, effortLevel: 'hard', priority: 'medium' },
    getContent: (gap) => ({
      title: `Create comprehensive content for "${gap.topic}"`,
      description: `This topic is competitive. Create detailed, expert-level content.`,
      steps: [
        'Research top 5-ranking pages for this topic',
        'Create content 2x longer with better structure',
        'Add expert quotes, statistics, and examples',
        'Include FAQ section addressing common questions',
      ],
    }),
  },
  // Schema markup: any position, missing structured data
  {
    condition: (gap) => gap.yourScore < 50,
    action: { type: 'schema_markup', estimatedImpact: 6, effortLevel: 'easy', priority: 'high' },
    getContent: (gap) => ({
      title: `Add structured data for "${gap.topic}"`,
      description: `Schema markup helps AI engines understand your content for this prompt cluster.`,
      steps: [
        'Add Organization schema to homepage',
        'Add Article/FAQ schema to content pages',
        'Validate markup with Google Rich Results Test',
      ],
    }),
  },
  // Technical SEO: very low score
  {
    condition: (gap) => gap.yourScore < 30,
    action: { type: 'technical_seo', estimatedImpact: 8, effortLevel: 'medium', priority: 'high' },
    getContent: (gap) => ({
      title: `Improve technical SEO fundamentals`,
      description: `Your score is low - address basic technical SEO issues first.`,
      steps: [
        'Ensure core web vitals are passing',
        'Add internal links from related content',
        'Improve page load speed',
        'Add descriptive alt text to images',
      ],
    }),
  },
];

export class GapActionMapper {
  /**
   * Analyze gaps for a brand and map them to actionable recommendations
   */
  async analyzeGaps(brandId: string): Promise<GapAnalysis[]> {
    const [brand, topics, competitors, visibilityScores, prompts, answers, mentions] = await Promise.all([
      storage.getBrand(brandId),
      storage.getTopicsByBrand(brandId),
      storage.getCompetitors(brandId),
      storage.getLatestVisibilityScore(brandId),
      storage.getPromptsByBrand(brandId),
      storage.getLlmAnswersByBrand(brandId, 1000),
      storage.getAllMentionsForBrand(brandId, 5000),
    ]);

    const gaps: GapAnalysis[] = [];

    for (const topic of topics) {
      // Get topic performance data
      const topicData = (visibilityScores?.topicScores as any[] | undefined)?.find(
        (ts: any) => ts.topicId === topic.id
      );

      if (!topicData) continue;

      // Find competitors to analyze
      const competitorsToAnalyze = competitors.slice(0, 3);

      for (const competitor of competitorsToAnalyze) {
        const gap = this.calculateGap(topic, topicData, competitor);
        if (gap.gap > 0) {
          gaps.push(gap);
        }
      }
    }

    if (gaps.length === 0) {
      gaps.push(...this.analyzePromptEvidence(prompts, answers, mentions, competitors));
    }

    if (gaps.length === 0) {
      gaps.push(...this.buildLaunchReadinessGaps(brand, prompts, competitors, visibilityScores));
    }

    return gaps.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  }

  /**
   * Fallback for real datasets where prompt/answer evidence exists but topic score
   * snapshots have not been generated yet.
   */
  private analyzePromptEvidence(
    prompts: any[],
    answers: any[],
    mentions: any[],
    competitors: any[],
  ): GapAnalysis[] {
    const competitorById = new Map(competitors.map((competitor) => [competitor.id, competitor]));
    const gaps: GapAnalysis[] = [];

    for (const prompt of prompts) {
      const promptAnswers = answers.filter((answer) => answer.promptId === prompt.id);
      if (promptAnswers.length === 0) continue;

      const promptAnswerIds = new Set(promptAnswers.map((answer) => answer.id));
      const promptMentions = mentions.filter((mention) => promptAnswerIds.has(mention.llmAnswerId));
      const brandMentions = promptMentions.filter((mention) => !mention.isCompetitor && !mention.competitorId);
      const competitorMentions = promptMentions.filter((mention) => mention.isCompetitor || mention.competitorId);
      const bestBrandPosition = this.bestPosition(brandMentions);
      const bestCompetitor = this.bestCompetitorMention(competitorMentions, competitorById);
      const coveragePct = Math.round((brandMentions.length / Math.max(promptAnswers.length, 1)) * 100);
      const topic = this.extractTopic(prompt.text);
      const difficulty = Math.max(20, Math.min(75, (prompt.difficulty ?? 3) * 15));
      const intentWeight = ['buying', 'comparison', 'pricing', 'review'].includes(prompt.intent) ? 1.4 : 1;

      if (brandMentions.length === 0 && bestCompetitor) {
        gaps.push({
          topic,
          topicId: prompt.topicId || prompt.id,
          yourPosition: 10,
          yourScore: 0,
          competitor: bestCompetitor.name,
          competitorPosition: bestCompetitor.position,
          keywordDifficulty: difficulty,
          gap: 10 - bestCompetitor.position,
          suggestedAction: '',
          estimatedImpact: Math.round(9 * intentWeight),
          effortLevel: difficulty > 50 ? 'hard' : 'medium',
          actionType: 'content',
        });
        continue;
      }

      if (bestBrandPosition > 3) {
        gaps.push({
          topic,
          topicId: prompt.topicId || prompt.id,
          yourPosition: bestBrandPosition,
          yourScore: coveragePct,
          competitor: bestCompetitor?.name || 'top AI answer',
          competitorPosition: bestCompetitor?.position || 3,
          keywordDifficulty: difficulty,
          gap: bestBrandPosition - (bestCompetitor?.position || 3),
          suggestedAction: '',
          estimatedImpact: Math.round((bestBrandPosition > 5 ? 7 : 5) * intentWeight),
          effortLevel: bestBrandPosition > 5 ? 'medium' : 'easy',
          actionType: 'citation',
        });
      }

      if (coveragePct > 0 && coveragePct < 50) {
        gaps.push({
          topic,
          topicId: prompt.topicId || prompt.id,
          yourPosition: bestBrandPosition || 8,
          yourScore: coveragePct,
          competitor: bestCompetitor?.name || 'competitors',
          competitorPosition: bestCompetitor?.position || 3,
          keywordDifficulty: difficulty,
          gap: Math.max(1, (bestBrandPosition || 8) - (bestCompetitor?.position || 3)),
          suggestedAction: '',
          estimatedImpact: Math.round(6 * intentWeight),
          effortLevel: 'easy',
          actionType: 'schema',
        });
      }
    }

    return this.dedupeGaps(gaps).slice(0, 20);
  }

  private bestPosition(mentions: any[]): number {
    const positions = mentions.map((mention) => mention.position).filter((position) => typeof position === 'number');
    return positions.length ? Math.min(...positions) : 10;
  }

  private bestCompetitorMention(mentions: any[], competitorById: Map<string, any>): { name: string; position: number } | null {
    let best: { name: string; position: number } | null = null;
    for (const mention of mentions) {
      const position = typeof mention.position === 'number' ? mention.position : 10;
      const competitor = mention.competitorId ? competitorById.get(mention.competitorId) : null;
      const name = competitor?.name || mention.entityName || 'competitor';
      if (!best || position < best.position) best = { name, position };
    }
    return best;
  }

  private extractTopic(promptText: string): string {
    return promptText.replace(/[?.!]/g, '').split(/\s+/).slice(0, 8).join(' ') || 'AI visibility';
  }

  private dedupeGaps(gaps: GapAnalysis[]): GapAnalysis[] {
    const seen = new Set<string>();
    return gaps.filter((gap) => {
      const key = `${gap.topicId}:${gap.actionType}:${gap.competitor}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildLaunchReadinessGaps(
    brand: any,
    prompts: any[],
    competitors: any[],
    visibilityScores: any,
  ): GapAnalysis[] {
    const gaps: GapAnalysis[] = [];
    const promptText = prompts.map((prompt) => `${prompt.text} ${prompt.intent || ''}`).join(' ').toLowerCase();
    const channel = (brand?.businessChannel || '').toLowerCase();
    const looksMarketplaceLed = channel.includes('amazon') || /\b(amazon|marketplace|seller|product listing|asin)\b/.test(promptText);
    const hasMeasurement = prompts.length > 0 && Boolean(visibilityScores);
    const competitorCount = competitors.length;

    if (!hasMeasurement || prompts.length < 12) {
      gaps.push({
        topic: 'AI visibility measurement coverage',
        topicId: 'launch-readiness-measurement',
        yourPosition: 10,
        yourScore: prompts.length,
        competitor: 'launch-ready benchmark',
        competitorPosition: 3,
        keywordDifficulty: 35,
        gap: Math.max(1, 12 - prompts.length),
        suggestedAction: 'measurement_coverage',
        estimatedImpact: 8,
        effortLevel: 'easy',
        actionType: 'technical',
      });
    }

    if (competitorCount < 5) {
      gaps.push({
        topic: 'Competitor and alternative coverage',
        topicId: 'launch-readiness-competitors',
        yourPosition: 8,
        yourScore: competitorCount,
        competitor: 'category alternatives',
        competitorPosition: 3,
        keywordDifficulty: 30,
        gap: Math.max(1, 5 - competitorCount),
        suggestedAction: 'competitor_coverage',
        estimatedImpact: 6,
        effortLevel: 'easy',
        actionType: 'keyword',
      });
    }

    gaps.push({
      topic: looksMarketplaceLed ? 'Amazon marketplace product discoverability' : 'Entity and answer-readiness foundation',
      topicId: looksMarketplaceLed ? 'launch-readiness-amazon' : 'launch-readiness-entity',
      yourPosition: 7,
      yourScore: 40,
      competitor: looksMarketplaceLed ? 'top marketplace sellers' : 'AI answer-ready competitors',
      competitorPosition: 3,
      keywordDifficulty: looksMarketplaceLed ? 55 : 45,
      gap: 4,
      suggestedAction: looksMarketplaceLed ? 'amazon_product_readiness' : 'entity_foundation',
      estimatedImpact: looksMarketplaceLed ? 9 : 7,
      effortLevel: looksMarketplaceLed ? 'medium' : 'easy',
      actionType: looksMarketplaceLed ? 'content' : 'schema',
    });

    return gaps;
  }

  /**
   * Calculate the gap between brand position and competitor
   */
  private calculateGap(topic: any, topicData: any, competitor: any): GapAnalysis {
    const yourPosition = topicData.position || 10;
    const yourScore = topicData.score || 0;
    const competitorPosition = (competitor as any)?.position || 5;
    const keywordDifficulty = (competitor as any)?.keywordDifficulty || 40;

    return {
      topic: topic.name,
      topicId: topic.id,
      yourPosition,
      yourScore,
      competitor: competitor.name || 'Unknown',
      competitorPosition,
      keywordDifficulty,
      gap: yourPosition - competitorPosition, // Positive means the competitor is ahead
      suggestedAction: '', // Will be filled by mapGapToAction
      estimatedImpact: 0,
      effortLevel: 'medium',
      actionType: 'content',
    };
  }

  /**
   * Map a specific gap to an actionable recommendation
   */
  mapGapToAction(gap: GapAnalysis): Action {
    if (gap.suggestedAction === 'measurement_coverage') {
      return {
        type: 'technical_seo',
        title: 'Expand AI visibility measurement coverage',
        description: 'Add enough buying, comparison, review, pricing, and problem-solving prompts to make the score defendable in a brand sales call.',
        steps: [
          'Create at least 12 active prompts across discovery, comparison, review, pricing, and buying intent',
          'Run each prompt across the enabled AI models',
          'Track brand position, competitor mentions, sentiment, and cited sources per prompt',
        ],
        estimatedImpact: gap.estimatedImpact,
        effortLevel: gap.effortLevel,
        priority: 'high',
      };
    }

    if (gap.suggestedAction === 'competitor_coverage') {
      return {
        type: 'keyword_optimization',
        title: 'Track more category alternatives',
        description: 'AI visibility is easier to sell when the customer can see exactly which alternatives are winning the same buyer questions.',
        steps: [
          'Add at least five direct competitors or substitutes',
          'Include marketplace, review-site, and regional alternatives where relevant',
          'Rerun competitor matrix after the next prompt sampling cycle',
        ],
        estimatedImpact: gap.estimatedImpact,
        effortLevel: gap.effortLevel,
        priority: 'medium',
      };
    }

    if (gap.suggestedAction === 'amazon_product_readiness') {
      return {
        type: 'content_add',
        title: 'Build an Amazon product AI-readiness pack',
        description: 'Marketplace sellers need product facts, comparison claims, reviews, and listing evidence that AI models can confidently reuse.',
        steps: [
          'Collect ASINs, hero SKUs, price range, ratings, review themes, and top competing listings',
          'Create product comparison prompts for buying, alternative, problem, and review intent',
          'Generate listing FAQ, schema, and source-citation recommendations for each priority SKU',
        ],
        estimatedImpact: gap.estimatedImpact,
        effortLevel: gap.effortLevel,
        priority: 'high',
      };
    }

    if (gap.suggestedAction === 'entity_foundation') {
      return {
        type: 'schema_markup',
        title: 'Strengthen entity and answer-readiness signals',
        description: 'AI engines need a clean entity profile, structured facts, and citable pages before recommendations become reliable.',
        steps: [
          'Add Organization schema with sameAs profiles and founder/location facts',
          'Publish FAQ and comparison pages for the highest-intent prompts',
          'Ensure authoritative sources consistently describe the brand category and offer',
        ],
        estimatedImpact: gap.estimatedImpact,
        effortLevel: gap.effortLevel,
        priority: 'high',
      };
    }

    // Find matching rule
    for (const rule of ACTION_RULES) {
      if (rule.condition(gap)) {
        const content = rule.getContent(gap);
        return {
          ...rule.action,
          ...content,
        };
      }
    }

    // Default action if no rule matches
    return {
      type: 'content_add',
      title: `Optimize content for "${gap.topic}"`,
      description: 'Create or improve content to better compete on this topic.',
      steps: [
        'Research competitor content',
        'Identify unique value proposition',
        'Create comprehensive, well-structured content',
      ],
      estimatedImpact: 5,
      effortLevel: 'medium',
      priority: 'medium',
    };
  }

  /**
   * Get prioritized action list for a brand
   */
  async getPrioritizedActions(brandId: string, limit = 5): Promise<Action[]> {
    const gaps = await this.analyzeGaps(brandId);
    const actions = gaps.slice(0, limit).map(gap => this.mapGapToAction(gap));

    // Sort by priority and estimated impact
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return actions.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.estimatedImpact - a.estimatedImpact;
    });
  }

  /**
   * Estimate the potential score improvement from applying actions
   */
  estimateScoreImprovement(actions: Action[]): number {
    return actions.reduce((sum, action) => {
      if (action.priority === 'high') {
        return sum + action.estimatedImpact;
      }
      return sum + Math.floor(action.estimatedImpact / 2);
    }, 0);
  }
}

// Singleton instance
let mapperInstance: GapActionMapper | null = null;

export function getGapActionMapper(): GapActionMapper {
  if (!mapperInstance) {
    mapperInstance = new GapActionMapper();
  }
  return mapperInstance;
}
