// Standalone Google Knowledge Graph Enrichment Worker
// Enriches brand records with structured KG data: foundingDate, HQ, employees, social links, etc.
// This uses the Google Knowledge Graph API for cost-efficient entity metadata.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { createKnowledgeGraphClient } from '../../integrations/enrichment/knowledge-graph';
import { logger } from '../../lib/logger';

export interface KgEnrichmentPayload {
  brandId: string;
  /** Force refresh even if already enriched */
  forceRefresh?: boolean;
}

export interface KgEnrichmentResult {
  brandId: string;
  kgId: string | null;
  kgData: Record<string, any> | null;
  fieldsExtracted: string[];
  completenessScore: number;
  skipped: boolean;
  reason?: string;
}

async function computeKgCompleteness(kgData: Record<string, any>): Promise<number> {
  const fields = [
    'foundingDate',
    'headquarters',
    'numberOfEmployees',
    'socialLinks',
    'description',
    'imageUrl',
    'url',
    'types',
  ];

  const present = fields.filter(f => {
    const val = kgData[f];
    if (f === 'socialLinks') return val && Object.keys(val).length > 0;
    if (f === 'types') return val && (val as any[]).length > 0;
    return !!val;
  });

  return Math.round((present.length / fields.length) * 100);
}

export async function kgEnrichmentWorker(job: QueuedJob): Promise<KgEnrichmentResult> {
  const payload = job.payload as KgEnrichmentPayload;
  const { brandId, forceRefresh = false } = payload;

  console.log(`[KgEnrichment] Starting KG enrichment for brand ${brandId}`);

  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const kgClient = createKnowledgeGraphClient();

  if (!kgClient.isConfigured) {
    console.log(`[KgEnrichment] Skipping — GOOGLE_KG_API_KEY not configured`);
    return {
      brandId,
      kgId: null,
      kgData: null,
      fieldsExtracted: [],
      completenessScore: 0,
      skipped: true,
      reason: 'GOOGLE_KG_API_KEY not configured',
    };
  }

  // Check if we already have a KG entity ID and it's not a forced refresh
  const existingKgId = (brand as any).kgId as string | null | undefined;
  let kgEntity = existingKgId && !forceRefresh
    ? await kgClient.getBrandEntityById(existingKgId)
    : null;

  // If no entity found by ID, search by brand name
  if (!kgEntity) {
    kgEntity = await kgClient.getBrandEntity(brand.name);
  }

  if (!kgEntity) {
    console.log(`[KgEnrichment] No KG entity found for brand ${brand.name}`);
    return {
      brandId,
      kgId: null,
      kgData: null,
      fieldsExtracted: [],
      completenessScore: 0,
      skipped: false,
    };
  }

  const kgData = kgClient.toKgData(kgEntity);
  const completenessScore = await computeKgCompleteness(kgData);
  const fieldsExtracted = Object.entries(kgData)
    .filter(([, v]) => {
      if (v === null || v === undefined || v === '') return false;
      if (typeof v === 'string' && v.length > 0) return true;
      if (typeof v === 'object' && Object.keys(v).length > 0) return true;
      if (typeof v === 'number') return true;
      return false;
    })
    .map(([k]) => k);

  // Update brand record with KG entity ID and structured data.
  const currentBrand = await storage.getBrand(brand.id);
  const existingBrandDevData = ((currentBrand as any)?.brandDevData as Record<string, any>) ?? {};

  await storage.updateBrand(brand.id, {
    brandDevData: {
      ...existingBrandDevData,
      kgId: kgEntity.id,
      kgData,
      kgEnrichedAt: new Date().toISOString(),
    } as any,
  } as any);

  logger.info(`[KgEnrichment] Enriched brand ${brand.name} with KG entity ${kgEntity.id} (${completenessScore}% complete)`);

  return {
    brandId,
    kgId: kgEntity.id,
    kgData,
    fieldsExtracted,
    completenessScore,
    skipped: false,
  };
}
