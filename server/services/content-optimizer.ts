// Content Optimization Agent - One-click content generation for brand topics
// Transforms AIRank from analytics platform to AI Visibility Executor

import { storage } from '../storage';
import { getModelRouter } from './model-router';
import { OpenRouterProvider } from '../integrations/llm/openrouter';

export interface ContentSuggestion {
  id: string;
  type: 'heading' | 'keyword' | 'section' | 'citation' | 'schema' | 'faq';
  title: string;
  description: string;
  currentContent?: string;
  suggestedContent?: string;
  estimatedImpact: number; // Points (0-100)
  effortLevel: 'easy' | 'medium' | 'hard';
  priority: 'high' | 'medium' | 'low';
}

export interface OptimizationAnalysis {
  brandId: string;
  topicId: string;
  topicName: string;
  currentVisibility: number;
  currentPosition: number;
  competitorsAbove: string[];
  suggestions: ContentSuggestion[];
  generatedAt: Date;
}

export interface OptimizationLogEntry {
  id: string;
  brandId: string;
  topicId: string;
  actionType: string;
  actionDescription: string;
  estimatedImpact: number;
  actualImpact?: number;
  status: 'pending' | 'applied' | 'verified' | 'rejected';
  appliedAt?: Date;
  verifiedAt?: Date;
  createdAt: Date;
}

// Default optimization prompt templates
const OPTIMIZATION_TEMPLATES = {
  heading: {
    system: 'You are an SEO content expert. Generate optimized heading suggestions.',
    user: 'Topic: {topic}\nBrand: {brand}\nCompetitors: {competitors}\n\nSuggest 3 headings that include high-impact keywords. Format: - [Heading text] | Impact: X/10',
  },
  keyword: {
    system: 'You are an SEO keyword researcher. Find missing keywords.',
    user: 'Topic: {topic}\nExisting keywords: {keywords}\n\nSuggest 5 keywords that competitors rank for but this brand does not. Format: - [keyword] | Monthly searches estimate',
  },
  section: {
    system: 'You are a content strategist. Suggest missing content sections.',
    user: 'Topic: {topic}\nBrand description: {description}\nCompetitor sections: {competitorSections}\n\nSuggest 2 content sections that would improve AI visibility. Format: - [Section title] | What to include',
  },
  citation: {
    system: 'You are a citations expert. Find authoritative sources to cite.',
    user: 'Topic: {topic}\nCompetitors cite: {competitorCitations}\n\nSuggest 3 authoritative sources this brand should cite. Format: - [Source name] | URL | Why valuable',
  },
  faq: {
    system: 'You are a FAQ generator. Create questions users ask about this topic.',
    user: 'Topic: {topic}\nBrand industry: {industry}\n\nSuggest 5 FAQ questions that would improve AI visibility. Format: - [Question] | [Answer summary]',
  },
};

export class ContentOptimizer {
  private modelRouter = getModelRouter();
  private openRouter: OpenRouterProvider | null = null;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.openRouter = new OpenRouterProvider(apiKey);
    }
  }

  /**
   * Analyze a topic and generate optimization suggestions
   */
  async analyzeForTopic(brandId: string, topicId: string): Promise<OptimizationAnalysis> {
    // Get brand and topic data
    const brand = await storage.getBrand(brandId);
    const topic = await storage.getTopic(topicId);

    if (!brand || !topic) {
      throw new Error(`Brand ${brandId} or Topic ${topicId} not found`);
    }

    // Get current visibility data
    const visibilityScores = await storage.getLatestVisibilityScore(brandId);
    const topicVisibility = (visibilityScores?.topicScores as any[] | undefined)?.find(
      (ts: any) => ts.topicId === topicId
    );

    // Get competitor data
    const competitors = await storage.getCompetitors(brandId);
    const competitorData = await Promise.all(
      competitors.slice(0, 5).map(c => storage.getCompetitor(c.id))
    );

    // Generate suggestions using model router
    const suggestions: ContentSuggestion[] = [];

    try {
      // Generate heading suggestions
      const headingSuggestions = await this.generateSuggestions(
        'heading',
        {
          topic: topic.name,
          brand: brand.name,
          competitors: competitorData.map(c => c?.name || 'Unknown').join(', '),
        }
      );
      suggestions.push(...headingSuggestions);
    } catch (err) {
      console.error('[ContentOptimizer] Heading generation failed:', err);
    }

    try {
      // Generate keyword suggestions
      const keywordSuggestions = await this.generateSuggestions(
        'keyword',
        {
          topic: topic.name,
          keywords: topicVisibility?.keywords?.join(', ') || 'None',
        }
      );
      suggestions.push(...keywordSuggestions);
    } catch (err) {
      console.error('[ContentOptimizer] Keyword generation failed:', err);
    }

    try {
      // Generate FAQ suggestions
      const faqSuggestions = await this.generateSuggestions(
        'faq',
        {
          topic: topic.name,
          industry: brand.industry || 'General',
        }
      );
      suggestions.push(...faqSuggestions);
    } catch (err) {
      console.error('[ContentOptimizer] FAQ generation failed:', err);
    }

    return {
      brandId,
      topicId,
      topicName: topic.name,
      currentVisibility: topicVisibility?.score || 0,
      currentPosition: topicVisibility?.position || 10,
      competitorsAbove: competitorData
        .filter(c => (c as any)?.position < (topicVisibility?.position || 10))
        .map(c => c?.name || 'Unknown'),
      suggestions: suggestions.sort((a, b) => b.estimatedImpact - a.estimatedImpact),
      generatedAt: new Date(),
    };
  }

  /**
   * Generate content suggestions using LLM
   */
  private async generateSuggestions(
    type: keyof typeof OPTIMIZATION_TEMPLATES,
    variables: Record<string, string>
  ): Promise<ContentSuggestion[]> {
    if (!this.openRouter) {
      // Return fallback suggestions if no OpenRouter configured
      return this.getFallbackSuggestions(type);
    }

    const template = OPTIMIZATION_TEMPLATES[type];
    const userPrompt = this.interpolate(template.user, variables);

    try {
      // Use model router to pick appropriate model
      const complexity = type === 'heading' || type === 'keyword' ? 'simple' : 'medium';
      const modelConfig = await this.modelRouter.route(type, userPrompt);

      const result = await this.openRouter.chat(
        [
          { role: 'system', content: template.system },
          { role: 'user', content: userPrompt },
        ],
        {
          model: modelConfig.model,
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature,
        }
      );

      return this.parseSuggestions(type, result.content);
    } catch (err) {
      console.error(`[ContentOptimizer] ${type} generation failed:`, err);
      return this.getFallbackSuggestions(type);
    }
  }

  /**
   * Simple template interpolation
   */
  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
  }

  /**
   * Parse LLM output into structured suggestions
   */
  private parseSuggestions(type: string, content: string): ContentSuggestion[] {
    const suggestions: ContentSuggestion[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      // Simple parsing - expects format: "- [Content] | [Details]"
      const match = line.match(/[-*]?\s*\[(.+?)\]\s*\|?\s*(.+)?/);
      if (match) {
        const [, title, description] = match;
        suggestions.push({
          id: `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: type as ContentSuggestion['type'],
          title: title.trim(),
          description: description?.trim() || '',
          estimatedImpact: this.estimateImpact(type, description),
          effortLevel: this.estimateEffort(type, description),
          priority: this.estimatePriority(type, description),
        });
      }
    }

    return suggestions;
  }

  /**
   * Fallback suggestions when no LLM available
   */
  private getFallbackSuggestions(type: string): ContentSuggestion[] {
    const fallbacks: Record<string, ContentSuggestion[]> = {
      heading: [
        { id: `fallback-${type}-1`, type: 'heading', title: 'Add primary keyword to H2 heading', description: 'Include target keyword in a clear H2 heading', estimatedImpact: 5, effortLevel: 'easy', priority: 'high' },
        { id: `fallback-${type}-2`, type: 'heading', title: 'Add "Best" or "Top" modifier', description: 'Headlines with comparison terms rank higher', estimatedImpact: 4, effortLevel: 'easy', priority: 'medium' },
      ],
      keyword: [
        { id: `fallback-${type}-1`, type: 'keyword', title: 'Add long-tail keyword variation', description: 'Include 2-3 word keyword phrases', estimatedImpact: 6, effortLevel: 'medium', priority: 'high' },
        { id: `fallback-${type}-2`, type: 'keyword', title: 'Include question keywords', description: 'Add "how", "what", "why" prefixed keywords', estimatedImpact: 5, effortLevel: 'easy', priority: 'medium' },
      ],
      section: [
        { id: `fallback-${type}-1`, type: 'section', title: 'Add comparison section', description: 'Include a table comparing your solution with alternatives', estimatedImpact: 8, effortLevel: 'medium', priority: 'high' },
        { id: `fallback-${type}-2`, type: 'section', title: 'Add use cases section', description: 'Include real-world application examples', estimatedImpact: 6, effortLevel: 'medium', priority: 'medium' },
      ],
      citation: [
        { id: `fallback-${type}-1`, type: 'citation', title: 'Cite industry authority', description: 'Add reference from recognized industry source', estimatedImpact: 7, effortLevel: 'medium', priority: 'high' },
      ],
      faq: [
        { id: `fallback-${type}-1`, type: 'faq', title: 'Add "What is [topic]?" question', description: 'Answer the fundamental question first', estimatedImpact: 5, effortLevel: 'easy', priority: 'high' },
        { id: `fallback-${type}-2`, type: 'faq', title: 'Add "How to" question', description: 'Address step-by-step queries', estimatedImpact: 4, effortLevel: 'easy', priority: 'medium' },
      ],
    };

    return fallbacks[type] || [];
  }

  private estimateImpact(type: string, description?: string): number {
    const baseImpacts: Record<string, number> = {
      heading: 5,
      keyword: 6,
      section: 8,
      citation: 7,
      faq: 5,
    };
    return baseImpacts[type] || 5;
  }

  private estimateEffort(type: string, description?: string): 'easy' | 'medium' | 'hard' {
    const efforts: Record<string, 'easy' | 'medium' | 'hard'> = {
      heading: 'easy',
      keyword: 'easy',
      section: 'medium',
      citation: 'medium',
      faq: 'easy',
    };
    return efforts[type] || 'medium';
  }

  private estimatePriority(type: string, description?: string): 'high' | 'medium' | 'low' {
    const priorities: Record<string, 'high' | 'medium' | 'low'> = {
      heading: 'high',
      keyword: 'high',
      section: 'medium',
      citation: 'high',
      faq: 'medium',
    };
    return priorities[type] || 'medium';
  }

  /**
   * Apply a suggestion (mark as applied)
   */
  async applyOptimization(brandId: string, topicId: string, suggestionId: string): Promise<void> {
    // Log the optimization action
    await this.logAction({
      brandId,
      topicId,
      actionType: 'applied',
      actionDescription: `Applied suggestion: ${suggestionId}`,
      estimatedImpact: 0,
      status: 'applied',
    });
  }

  /**
   * Log an optimization action
   */
  private async logAction(entry: Omit<OptimizationLogEntry, 'id' | 'createdAt'>): Promise<void> {
    // This would store in the optimization_logs table
    // For now, we'll store in brandDevData as a workaround
    const brand = await storage.getBrand(entry.brandId);
    if (brand) {
      const existingLogs = ((brand as any).brandDevData?.optimizationLogs as OptimizationLogEntry[]) || [];
      const newLog: OptimizationLogEntry = {
        ...entry,
        id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date(),
      };
      existingLogs.push(newLog);

      await storage.updateBrand(entry.brandId, {
        brandDevData: {
          ...(brand as any).brandDevData,
          optimizationLogs: existingLogs.slice(-50), // Keep last 50
        } as any,
      });
    }
  }

  /**
   * Get optimization history for a brand
   */
  async getOptimizationHistory(brandId: string, limit = 20): Promise<OptimizationLogEntry[]> {
    const brand = await storage.getBrand(brandId);
    const logs = ((brand as any)?.brandDevData?.optimizationLogs as OptimizationLogEntry[]) || [];
    return logs.slice(-limit).reverse();
  }
}

// Singleton instance
let optimizerInstance: ContentOptimizer | null = null;

export function getContentOptimizer(): ContentOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new ContentOptimizer();
  }
  return optimizerInstance;
}