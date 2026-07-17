// SerpAPI integration for comprehensive Google Search data
// Supports: Google Search, AI Overview, AI mode, PAA, Related Searches

export interface SERPResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  description?: string;
  type: 'organic' | 'featured_snippet' | 'people_also_ask' | 'related_searches' | 'ai_overview';
}

export interface AIOverviewData {
  text: string;
  sources: Array<{
    title: string;
    url: string;
    position: number;
  }>;
  brandMentioned: boolean;
  mentionContext?: string[];
}

export interface SERPResponse {
  query: string;
  totalResults: number;
  results: SERPResult[];
  relatedSearches?: string[];
  peopleAlsoAsk?: Array<{ question: string; answer: string; url?: string }>;
  aiOverview?: AIOverviewData;
  featuredSnippet?: {
    title: string;
    url: string;
    snippet: string;
  };
}

export class SerpAPIClient {
  private apiKey: string;
  private baseURL: string = 'https://serpapi.com/search';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Execute Google Search with comprehensive data extraction
   */
  async searchGoogle(
    query: string,
    options: {
      location?: string;
      device?: 'desktop' | 'mobile';
      limit?: number;
      brandName?: string; // For AI Overview brand mention detection
    } = {}
  ): Promise<SERPResponse> {
    const {
      location = 'United States',
      device = 'desktop',
      limit = 10,
      brandName,
    } = options;

    try {
      const params = new URLSearchParams({
        q: query,
        api_key: this.apiKey,
        engine: 'google',
        location: location,
        device: device,
        num: limit.toString(),
        gl: 'us',
        hl: 'en',
      });

      const response = await fetch(`${this.baseURL}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`SerpAPI error: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract organic results
      const organicResults: SERPResult[] = (data.organic_results || [])
        .slice(0, limit)
        .map((item: any, index: number) => ({
          position: item.position || index + 1,
          title: item.title || '',
          url: item.link || '',
          domain: this.extractDomain(item.link || ''),
          description: item.snippet || '',
          type: 'organic' as const,
        }));

      // Extract related searches
      const relatedSearches = (data.related_searches || [])
        .map((item: any) => item.query)
        .filter(Boolean);

      // Extract People Also Ask
      const peopleAlsoAsk = (data.related_questions || []).map((item: any) => ({
        question: item.question || '',
        answer: item.snippet || item.answer || '',
        url: item.link || item.source?.link,
      }));

      // Extract AI Overview (Google's AI-generated summary)
      let aiOverview: AIOverviewData | undefined;
      if (data.ai_overview || data.answer_box?.type === 'ai_overview') {
        const overview = data.ai_overview || data.answer_box;
        const overviewText = overview.text || overview.snippet || overview.answer || '';
        
        // Check if brand is mentioned in AI Overview
        const brandMentioned = brandName
          ? overviewText.toLowerCase().includes(brandName.toLowerCase())
          : false;

        // Extract mention contexts if brand is mentioned
        let mentionContext: string[] | undefined;
        if (brandMentioned && brandName) {
          const sentences = overviewText.split(/[.!?]+/);
          mentionContext = sentences
            .filter((sentence: string) =>
              sentence.toLowerCase().includes(brandName.toLowerCase())
            )
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        // Extract cited sources
        const sources = (overview.sources || overview.citations || []).map(
          (source: any, index: number) => ({
            title: source.title || '',
            url: source.link || source.url || '',
            position: index + 1,
          })
        );

        aiOverview = {
          text: overviewText,
          sources,
          brandMentioned,
          mentionContext,
        };
      }

      // Extract featured snippet
      let featuredSnippet;
      if (data.answer_box && data.answer_box.type !== 'ai_overview') {
        featuredSnippet = {
          title: data.answer_box.title || '',
          url: data.answer_box.link || '',
          snippet: data.answer_box.snippet || data.answer_box.answer || '',
        };
      }

      return {
        query,
        totalResults: data.search_information?.total_results || 0,
        results: organicResults,
        relatedSearches,
        peopleAlsoAsk,
        aiOverview,
        featuredSnippet,
      };
    } catch (error: any) {
      console.error(`SerpAPI search failed for "${query}":`, error.message);
      throw error;
    }
  }

  /**
   * Check if a query triggers Google AI Overview
   */
  async checkAIOverview(query: string, brandName: string): Promise<AIOverviewData | null> {
    const result = await this.searchGoogle(query, { brandName });
    return result.aiOverview || null;
  }

  /**
   * Batch check multiple queries for AI Overview presence
   */
  async checkMultipleAIOverviews(
    queries: string[],
    brandName: string
  ): Promise<Array<{ query: string; overview: AIOverviewData | null }>> {
    const results: Array<{ query: string; overview: AIOverviewData | null }> = [];

    for (const query of queries) {
      try {
        const overview = await this.checkAIOverview(query, brandName);
        results.push({ query, overview });

        // Rate limiting - SerpAPI has rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`Failed to check AI Overview for "${query}":`, error.message);
        results.push({ query, overview: null });
      }
    }

    return results;
  }

  /**
   * Get domain authority estimate (simplified)
   * Note: SerpAPI doesn't provide direct domain authority
   * This is a placeholder for future enhancement
   */
  async getDomainAuthority(domain: string): Promise<number> {
    // Placeholder - would need additional API integration
    // Could integrate with Moz, Ahrefs, or similar
    return 50;
  }

  /**
   * Track SERP position for a specific domain/URL
   */
  async trackPosition(
    query: string,
    targetDomain: string,
    options: {
      location?: string;
      device?: 'desktop' | 'mobile';
    } = {}
  ): Promise<{
    position: number | null;
    url: string | null;
    title: string | null;
    found: boolean;
  }> {
    const result = await this.searchGoogle(query, options);

    const match = result.results.find((r) =>
      r.domain.toLowerCase().includes(targetDomain.toLowerCase())
    );

    if (match) {
      return {
        position: match.position,
        url: match.url,
        title: match.title,
        found: true,
      };
    }

    return {
      position: null,
      url: null,
      title: null,
      found: false,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  /**
   * Analyze AI Overview visibility across multiple queries
   */
  async analyzeAIOverviewVisibility(queries: string[], brandName: string): Promise<{
    totalQueries: number;
    queriesWithOverview: number;
    queriesWithBrandMention: number;
    visibilityRate: number;
    topCitedSources: { url: string; count: number }[];
  }> {
    const overviews = await this.checkMultipleAIOverviews(queries, brandName);

    const totalQueries = queries.length;
    const queriesWithOverview = overviews.filter((o) => o.overview !== null).length;
    const queriesWithBrandMention = overviews.filter(
      (o) => o.overview?.brandMentioned
    ).length;
    const visibilityRate =
      queriesWithOverview > 0 ? (queriesWithBrandMention / queriesWithOverview) * 100 : 0;

    // Count cited sources
    const sourceCounts = new Map<string, number>();
    overviews.forEach((item) => {
      if (item.overview) {
        item.overview.sources.forEach((source) => {
          sourceCounts.set(source.url, (sourceCounts.get(source.url) || 0) + 1);
        });
      }
    });

    const topCitedSources = Array.from(sourceCounts.entries())
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalQueries,
      queriesWithOverview,
      queriesWithBrandMention,
      visibilityRate,
      topCitedSources,
    };
  }
}
