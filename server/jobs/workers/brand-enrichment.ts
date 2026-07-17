// Brand Enrichment Worker - Enriches brand context from external sources

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { WikidataClient } from '../../integrations/enrichment/wikidata';
import { createKnowledgeGraphClient } from '../../integrations/enrichment/knowledge-graph';
import { logger } from '../../lib/logger';

export interface BrandEnrichmentPayload {
  brandId: string;
  sources?: Array<'metadata' | 'brandDev' | 'knowledgeGraph' | 'wikidata'>;
}

export async function brandEnrichmentWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as BrandEnrichmentPayload;
  const { brandId, sources = ['metadata', 'knowledgeGraph', 'wikidata'] } = payload;
  const shouldRunMetadata = sources.includes('metadata') || sources.includes('brandDev');

  console.log(`[BrandEnrichment] Starting enrichment for brand ${brandId}`);

  // Get brand
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // Check if enrichment is needed using entity resolution
  const { needsEnrichment, registerDomain } = await import('../../services/entity-resolution');
  const enrichmentCheck = await needsEnrichment(brandId);

  if (!enrichmentCheck.needs) {
    console.log(`[BrandEnrichment] Skipping enrichment for brand ${brandId}: ${enrichmentCheck.reason}`);
    console.log(`[BrandEnrichment] Last enriched: ${enrichmentCheck.lastEnriched}`);
    
    // Return existing context
    const context = await storage.getBrandContext(brandId);
    return {
      brandId,
      skipped: true,
      reason: enrichmentCheck.reason,
      lastEnriched: enrichmentCheck.lastEnriched,
      completenessScore: context?.completenessScore || 0,
    };
  }

  console.log(`[BrandEnrichment] Enrichment needed: ${enrichmentCheck.reason}`);

  // Get or create brand context
  let context = await storage.getBrandContext(brandId);
  if (!context) {
    context = await storage.createBrandContext({
      brandId,
      brandIdentity: {
        officialName: brand.name,
        variations: [brand.name],
      },
      dataQualityScore: 0,
      completenessScore: 0,
    });
  }

  const integrations = getIntegrations();
  const enrichmentData: any = {
    brandIdentity: context.brandIdentity || {},
    industryContext: context.industryContext || {},
    productServices: context.productServices || {},
  };

  // Enrich from Firecrawl (primary brand enrichment)
  const firecrawlEnabled = await storage.getSystemSetting('firecrawl_enabled');
  const shouldUseFirecrawl = firecrawlEnabled !== 'false';
  if (shouldRunMetadata && shouldUseFirecrawl) {
    try {
      const { createFirecrawlBrandEnricher } = await import('../../integrations/enrichment/firecrawl-brand');
      const enricher = await createFirecrawlBrandEnricher();
      if (enricher) {
        console.log(`[BrandEnrichment] Fetching from Firecrawl for ${brand.domain}`);
        const { fields } = await enricher.enrichBrand(brand.domain);

        enrichmentData.brandIdentity = {
          ...enrichmentData.brandIdentity,
          officialName: fields.name || enrichmentData.brandIdentity.officialName,
          variations: [
            ...(enrichmentData.brandIdentity.variations || []),
            fields.name,
          ].filter((v, i, a) => v && a.indexOf(v) === i),
        };

        if (fields.description) {
          enrichmentData.brandIdentity.mission = fields.description;
        }
        if (fields.logo) {
          enrichmentData.brandIdentity.logo = fields.logo;
        }
        if (fields.industry) {
          enrichmentData.industryContext = {
            ...enrichmentData.industryContext,
            primaryIndustry: fields.industry,
            subIndustry: fields.subindustry,
          };
        }
      } else {
        console.log(`[BrandEnrichment] Skipping Firecrawl enrichment: not configured`);
      }
    } catch (error: any) {
      console.error(`[BrandEnrichment] Firecrawl error:`, error.message);
    }
  }

  // === Wikidata entity lookup ===
  let wikidataBonus = 0;
  let wikidataEntityId: string | null = null;
  try {
    const wikidataClient = new WikidataClient();
    const wikidataResult = await wikidataClient.getBrandEntityWithDomainCheck(
      brand.name,
      brand.domain
    );
    if (wikidataResult) {
      // Spec: bonus is 0 or 8 only. No partial credit for unconfirmed matches.
      wikidataBonus = wikidataResult.confirmed ? 8 : 0;
      wikidataEntityId = wikidataResult.entity.id;
      logger.info(`[BrandEnrichment] Wikidata entity found: ${wikidataEntityId} (confirmed: ${wikidataResult.confirmed})`);

      if (wikidataResult.entity.description) {
        enrichmentData.brandIdentity.description =
          enrichmentData.brandIdentity.description || wikidataResult.entity.description;
      }

      if (wikidataResult.entity.aliases) {
        enrichmentData.brandIdentity.variations = [
          ...(enrichmentData.brandIdentity.variations || []),
          ...wikidataResult.entity.aliases,
        ].filter((v, i, a) => a.indexOf(v) === i);
      }
    }
  } catch (err) {
    logger.warn('[BrandEnrichment] Wikidata lookup failed (non-blocking):', err);
  }

  // === Google Knowledge Graph lookup ===
  let kgBonus = 0;
  let kgId: string | undefined;
  let kgData: Record<string, any> | undefined;
  try {
    const kgClient = createKnowledgeGraphClient();
    if (kgClient.isConfigured) {
      const kgEntity = await kgClient.getBrandEntity(brand.name);
      if (kgEntity) {
        kgBonus = 7;
        kgId = kgEntity.id;
        kgData = kgClient.toKgData(kgEntity);
        logger.info(`[BrandEnrichment] KG entity found: ${kgEntity.id}`);

        if (kgEntity.description) {
          enrichmentData.brandIdentity.taglines = [
            ...(enrichmentData.brandIdentity.taglines || []),
            kgEntity.description,
          ];
        }

        if (kgEntity.detailedDescription) {
          enrichmentData.brandIdentity.description = kgEntity.detailedDescription.articleBody;
        }

        if (kgEntity.types) {
          enrichmentData.industryContext = {
            ...enrichmentData.industryContext,
            types: kgEntity.types,
          };
        }
      }
    } else {
      logger.info('[BrandEnrichment] Google KG skipped — no API key');
    }
  } catch (err) {
    logger.warn('[BrandEnrichment] KG lookup failed (non-blocking):', err);
  }

  // Store enrichment bonuses in the existing metadata JSON field for visibility scoring.
  const currentBrand = await storage.getBrand(brand.id);
  const existingBrandDevData = ((currentBrand as any)?.brandDevData as Record<string, any>) ?? {};

  // Build update payload with optional KG fields (backward compatible)
  const brandUpdate: Partial<any> = {
    brandDevData: {
      ...existingBrandDevData,
      wikidataBonus,
      wikidataEntityId,
      kgBonus,
      enrichedAt: new Date().toISOString(),
    } as any,
  };

  // Store KG entity ID and structured data in brandDevData (schema-level kgId/kgData fields pending)
  if (kgId || kgData) {
    brandUpdate.brandDevData = {
      ...brandUpdate.brandDevData,
      kgId,
      kgData,
    } as any;
  }

  await storage.updateBrand(brand.id, brandUpdate);

  // Calculate completeness score
  const fields = [
    enrichmentData.brandIdentity.officialName,
    enrichmentData.brandIdentity.description,
    enrichmentData.brandIdentity.logo,
    enrichmentData.brandIdentity.variations?.length > 1,
    enrichmentData.industryContext.types?.length > 0,
  ];
  const completenessScore = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  // Update brand context
  await storage.updateBrandContext(context.id, {
    brandIdentity: enrichmentData.brandIdentity,
    industryContext: enrichmentData.industryContext,
    productServices: enrichmentData.productServices,
    completenessScore,
    dataQualityScore: completenessScore, // Simplified - should be more sophisticated
    lastEnriched: new Date(),
  });

  // Register domain in entity resolution registry
  await registerDomain(brand.domain, brandId);

  console.log(`[BrandEnrichment] Completed enrichment for brand ${brandId} (${completenessScore}% complete)`);

  return {
    brandId,
    completenessScore,
    sourcesUsed: sources,
    fieldsEnriched: fields.filter(Boolean).length,
  };
}
