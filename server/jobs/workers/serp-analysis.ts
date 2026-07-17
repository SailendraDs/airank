// SERP Analysis Worker - Comprehensive search visibility tracking with SerpAPI

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { logger } from '../../lib/logger';

export interface SerpAnalysisPayload {
  brandId: string;
  queries?: string[]; // Optional specific queries, otherwise uses brand prompts
  location?: string;
  device?: 'desktop' | 'mobile';
}

export async function serpAnalysisWorker(job: QueuedJob): Promise<any> {
  if (!process.env.DATAFORSEO_KEY) {
    logger.info('[SerpAnalysis] skipped — no key');
    return;
  }

  const payload = job.payload as SerpAnalysisPayload;
  const { brandId, queries, location = 'United States', device = 'desktop' } = payload;

  console.log(`[SerpAnalysis] Starting SERP analysis for brand ${brandId}`);

  // Get brand context
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const context = await storage.getBrandContext(brandId);
  const brandName = brand.name;
  const brandDomain = (context?.brandIdentity as any)?.website || brand.domain;

  // Get SerpAPI integration
  const integrations = getIntegrations();
  if (!integrations.serpApi) {
    throw new Error('SerpAPI integration not configured');
  }

  // Determine queries to analyze
  let queriesToAnalyze: string[] = [];
  if (queries && queries.length > 0) {
    queriesToAnalyze = queries;
  } else {
    // Get active prompts for the brand
    const prompts = await storage.getPromptsByBrand(brandId);
    queriesToAnalyze = prompts
      .filter(p => p.status === 'active')
      .slice(0, 20) // Limit to 20 queries
      .map(p => p.text);
  }

  if (queriesToAnalyze.length === 0) {
    console.log(`[SerpAnalysis] No queries found for brand ${brandId}`);
    return {
      brandId,
      queriesAnalyzed: 0,
      serpResults: 0,
      paaQuestions: 0,
    };
  }

  const results = {
    serpResults: [] as any[],
    paaQuestions: [] as any[],
    aiOverviews: [] as any[],
  };

  for (const query of queriesToAnalyze) {
    try {
      console.log(`[SerpAnalysis] Analyzing query: "${query}"`);

      // Get comprehensive SERP data
      const serpData = await integrations.serpApi.searchGoogle(query, {
        location,
        device,
        limit: 10,
        brandName,
      });

      // Track brand position
      const normalizedDomain = brandDomain.replace(/^https?:\/\/(www\.)?/, '');
      const brandResult = serpData.results.find((r) =>
        r.domain.includes(normalizedDomain) || normalizedDomain.includes(r.domain)
      );

      // Store SERP result
      const serpResult = await storage.createSerpResult({
        brandId,
        query,
        position: brandResult?.position || null,
        url: brandResult?.url || null,
        totalResults: serpData.totalResults,
        topCompetitors: null,
        hasAiOverview: !!serpData.aiOverview,
        aiOverviewMentionsBrand: serpData.aiOverview?.brandMentioned || false,
        metadata: {
          title: brandResult?.title || null,
          description: brandResult?.description || null,
          searchType: 'organic',
          location,
          device,
        },
        sampledAt: new Date(),
      });

      results.serpResults.push({
        query,
        position: brandResult?.position || null,
        hasAiOverview: !!serpData.aiOverview,
        aiOverviewMentionsBrand: serpData.aiOverview?.brandMentioned || false,
      });

      // Store PAA questions
      if (serpData.peopleAlsoAsk && serpData.peopleAlsoAsk.length > 0) {
        for (const paa of serpData.peopleAlsoAsk) {
          // Check if brand's domain is in the answer source
          const isAnsweredByBrand = paa.url
            ? paa.url.includes(normalizedDomain)
            : false;

          const paaQuestion = await storage.createPaaQuestion({
            brandId,
            query,
            question: paa.question,
            sourceUrl: paa.url ?? null,
            isAnsweredByBrand,
            metadata: { answer: paa.answer, relevanceScore: 50, status: 'identified' },
            position: null,
            sampledAt: new Date(),
          });

          results.paaQuestions.push({
            question: paa.question,
            isAnsweredByBrand,
          });
        }
      }

      // Track AI Overview if present
      if (serpData.aiOverview) {
        results.aiOverviews.push({
          query,
          brandMentioned: serpData.aiOverview.brandMentioned,
          mentionContext: serpData.aiOverview.mentionContext,
          sourcesCount: serpData.aiOverview.sources.length,
        });

        // Store featured snippet if present
        if (serpData.featuredSnippet) {
          await storage.createSerpResult({
            brandId,
            query,
            position: 0, // Featured snippets are position 0
            url: serpData.featuredSnippet.url ?? null,
            totalResults: serpData.totalResults,
            topCompetitors: null,
            hasAiOverview: false,
            aiOverviewMentionsBrand: false,
            metadata: {
              title: serpData.featuredSnippet.title,
              description: serpData.featuredSnippet.snippet,
              searchType: 'featured_snippet',
              location,
              device,
            },
            sampledAt: new Date(),
          });
        }
      }

      // Rate limiting - wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error(`[SerpAnalysis] Error analyzing query "${query}":`, error.message);
    }
  }

  console.log(
    `[SerpAnalysis] Completed analysis for brand ${brandId}: ${results.serpResults.length} SERP results, ${results.paaQuestions.length} PAA questions, ${results.aiOverviews.length} AI Overviews`
  );

  return {
    brandId,
    queriesAnalyzed: queriesToAnalyze.length,
    serpResults: results.serpResults.length,
    paaQuestions: results.paaQuestions.length,
    aiOverviews: results.aiOverviews.length,
    details: results,
  };
}
