// Competitor Enrichment Worker - Enriches competitor data

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';

export interface CompetitorEnrichmentPayload {
  brandId: string;
  competitorId?: string;
}

export async function competitorEnrichmentWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as CompetitorEnrichmentPayload;
  const { brandId, competitorId } = payload;

  console.log(`[CompetitorEnrichment] Starting enrichment for brand ${brandId}`);

  // Get competitors
  let competitors;
  if (competitorId) {
    const allCompetitors = await storage.getCompetitorsByBrand(brandId);
    competitors = allCompetitors.filter(c => c.id === competitorId);
  } else {
    competitors = await storage.getCompetitorsByBrand(brandId);
  }

  if (competitors.length === 0) {
    console.log(`[CompetitorEnrichment] No competitors found for brand ${brandId}`);
    return {
      brandId,
      competitorsEnriched: 0,
    };
  }

  const integrations = getIntegrations();
  const enrichedCompetitors: any[] = [];

  for (const competitor of competitors) {
    try {
      console.log(`[CompetitorEnrichment] Enriching ${competitor.name} (${competitor.domain})`);

      let enrichmentData: any = {
        name: competitor.name,
        domain: competitor.domain,
      };

      // Enrich from Firecrawl
      if (competitor.domain) {
        try {
          const { createFirecrawlBrandEnricher } = await import('../../integrations/enrichment/firecrawl-brand');
          const enricher = await createFirecrawlBrandEnricher();
          if (enricher) {
            const scrape = await enricher.scrapeDomain(competitor.domain);
            const logo = String(scrape.metadata?.ogImage || scrape.metadata?.image || '');
            if (logo) {
              enrichmentData.logo = logo;
            }
          }
        } catch (error: any) {
          console.error(`[CompetitorEnrichment] Firecrawl error for ${competitor.name}:`, error.message);
        }
      }

      // Enrich from Knowledge Graph
      if (integrations.knowledgeGraph) {
        try {
          const kgEntity = await integrations.knowledgeGraph.getBrandEntity(competitor.name);
          if (kgEntity) {
            enrichmentData.types = kgEntity.types;
          }
        } catch (error: any) {
          console.error(`[CompetitorEnrichment] Knowledge Graph error for ${competitor.name}:`, error.message);
        }
      }

      // Update competitor with available fields only
      await storage.updateCompetitor(competitor.id, {
        logo: enrichmentData.logo,
      });

      enrichedCompetitors.push({
        id: competitor.id,
        name: competitor.name,
        enriched: true,
      });

    } catch (error: any) {
      console.error(`[CompetitorEnrichment] Error enriching ${competitor.name}:`, error.message);
      enrichedCompetitors.push({
        id: competitor.id,
        name: competitor.name,
        enriched: false,
        error: error.message,
      });
    }
  }

  console.log(`[CompetitorEnrichment] Enriched ${enrichedCompetitors.filter(c => c.enriched).length}/${competitors.length} competitors`);

  return {
    brandId,
    competitorsEnriched: enrichedCompetitors.filter(c => c.enriched).length,
    competitorsTotal: competitors.length,
    results: enrichedCompetitors,
  };
}
