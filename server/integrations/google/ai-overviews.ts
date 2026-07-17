/**
 * Google AI Overviews Tracking
 * 
 * Track brand mentions in Google's AI-generated search summaries
 * Uses SerpAPI for comprehensive AI Overview tracking
 */

import { SerpAPIClient } from '../serp/serpapi';

export interface AIOverviewConfig {
  serpApiKey: string;
}

export interface AIOverviewMention {
  query: string;
  overviewText: string;
  brandMentioned: boolean;
  mentionContext: string[];
  citedSources: {
    title: string;
    url: string;
    position: number;
  }[];
  timestamp: Date;
}

export class AIOverviewsClient {
  private serpApi: SerpAPIClient;

  constructor(config: AIOverviewConfig) {
    this.serpApi = new SerpAPIClient(config.serpApiKey);
  }

  /**
   * Check if a query triggers an AI Overview
   */
  async checkQuery(query: string, brandName: string): Promise<AIOverviewMention | null> {
    const result = await this.serpApi.searchGoogle(query, { brandName });

    if (!result.aiOverview) {
      return null;
    }

    return {
      query,
      overviewText: result.aiOverview.text,
      brandMentioned: result.aiOverview.brandMentioned,
      mentionContext: result.aiOverview.mentionContext || [],
      citedSources: result.aiOverview.sources,
      timestamp: new Date(),
    };
  }

  /**
   * Batch check multiple queries
   */
  async checkMultipleQueries(queries: string[], brandName: string): Promise<AIOverviewMention[]> {
    const results: AIOverviewMention[] = [];
    
    for (const query of queries) {
      try {
        const mention = await this.checkQuery(query, brandName);
        if (mention) {
          results.push(mention);
        }
        
        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`Failed to check query "${query}":`, error.message);
      }
    }

    return results;
  }

  /**
   * Analyze AI Overview visibility
   */
  async analyzeVisibility(queries: string[], brandName: string): Promise<{
    totalQueries: number;
    queriesWithOverview: number;
    queriesWithBrandMention: number;
    visibilityRate: number;
    topCitedSources: { url: string; count: number }[];
  }> {
    return this.serpApi.analyzeAIOverviewVisibility(queries, brandName);
  }
}


