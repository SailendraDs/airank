// SERP Sampling Worker - Tracks brand visibility in search results using SerpAPI

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';

export interface SerpSamplingPayload {
  brandId: string;
  promptId?: string;
  location?: string;
  device?: 'desktop' | 'mobile';
}

export async function serpSamplingWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as SerpSamplingPayload;
  const { brandId, promptId, location = 'United States', device = 'desktop' } = payload;

  console.log(`[SerpSampling] Starting SERP sampling for brand ${brandId}`);

  // Get prompts to sample
  let prompts;
  if (promptId) {
    const prompt = await storage.getPrompt(promptId);
    prompts = prompt ? [prompt] : [];
  } else {
    // Get active prompts for the brand
    prompts = await storage.getPromptsByBrand(brandId);
    prompts = prompts.filter(p => p.status === 'active').slice(0, 10); // Limit to 10
  }

  if (prompts.length === 0) {
    console.log(`[SerpSampling] No prompts found for brand ${brandId}`);
    return {
      brandId,
      samplesCollected: 0,
    };
  }

  // Get brand context
  const brand = await storage.getBrand(brandId);
  const context = await storage.getBrandContext(brandId);
  const brandDomain = (context?.brandIdentity as any)?.website || brand?.domain;

  // Get SerpAPI integration
  const integrations = getIntegrations();
  if (!integrations.serpApi) {
    throw new Error('SerpAPI integration not configured');
  }

  const results: any[] = [];

  for (const prompt of prompts) {
    try {
      console.log(`[SerpSampling] Sampling SERP for query: "${prompt.text}"`);

      // Get SERP results using SerpAPI
      const serpResults = await integrations.serpApi.searchGoogle(prompt.text, {
        location,
        device,
        limit: 10,
      });

      // Find brand position
      let brandPosition = -1;
      let brandUrl = '';
      
      if (brandDomain) {
        const normalizedDomain = brandDomain.replace(/^https?:\/\/(www\.)?/, '');
        brandPosition = serpResults.results.findIndex((result) => {
          const resultDomain = result.domain;
          return resultDomain.includes(normalizedDomain) || normalizedDomain.includes(resultDomain);
        });
        
        if (brandPosition !== -1) {
          brandPosition += 1; // Convert to 1-indexed
          brandUrl = serpResults.results[brandPosition - 1].url;
        }
      }

      // Store SERP sample
      const sample = await storage.createSerpSample({
        brandId,
        promptId: prompt.id,
        query: prompt.text,
        location,
        device,
        totalResults: serpResults.totalResults,
        brandPosition,
        brandUrl,
        topResults: serpResults.results.map((r) => ({
          position: r.position,
          url: r.url,
          title: r.title,
          description: r.description || '',
        })),
        metadata: {
          searchEngine: 'google',
          timestamp: new Date().toISOString(),
          aiOverview: serpResults.aiOverview ? {
            present: true,
            brandMentioned: serpResults.aiOverview.brandMentioned,
          } : { present: false },
          paaCount: serpResults.peopleAlsoAsk?.length || 0,
          relatedSearchesCount: serpResults.relatedSearches?.length || 0,
        },
      });

      results.push({
        promptId: prompt.id,
        query: prompt.text,
        brandPosition,
        totalResults: serpResults.totalResults,
        sampleId: sample.id,
        aiOverview: serpResults.aiOverview ? {
          present: true,
          brandMentioned: serpResults.aiOverview.brandMentioned,
        } : { present: false },
      });

    } catch (error: any) {
      console.error(`[SerpSampling] Error sampling SERP for prompt ${prompt.id}:`, error.message);
      results.push({
        promptId: prompt.id,
        query: prompt.text,
        error: error.message,
      });
    }
  }

  console.log(`[SerpSampling] Completed ${results.length} SERP samples for brand ${brandId}`);

  return {
    brandId,
    samplesCollected: results.filter(r => !r.error).length,
    totalSamples: results.length,
    results,
  };
}
