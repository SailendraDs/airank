/**
 * Canonical Entity Resolution Service
 * 
 * Manages entity reuse and TTL checking to prevent duplicate enrichment
 * and reduce API costs by reusing fresh data.
 */

import { storage } from '../storage';
import type { BrandContext } from '@shared/schema';

// TTL configuration (in milliseconds)
const DEFAULT_TTL = {
  brandEnrichment: 7 * 24 * 60 * 60 * 1000, // 7 days
  llmSampling: 24 * 60 * 60 * 1000, // 1 day
  serpData: 12 * 60 * 60 * 1000, // 12 hours
  visibilityScore: 6 * 60 * 60 * 1000, // 6 hours
};

/**
 * Check if data is fresh based on TTL
 */
function isFresh(timestamp: Date, ttl: number): boolean {
  const now = new Date();
  const age = now.getTime() - timestamp.getTime();
  return age < ttl;
}

/**
 * Get TTL configuration from database or use defaults
 */
async function getTTLConfig(dataType: string): Promise<number> {
  try {
    const config = await storage.getTTLConfig(dataType);
    if (config && config.ttlDays) {
      return config.ttlDays * 24 * 60 * 60 * 1000;
    }
  } catch (error) {
    console.warn(`[Entity Resolution] Could not fetch TTL config for ${dataType}, using default`);
  }
  
  return DEFAULT_TTL[dataType as keyof typeof DEFAULT_TTL] || DEFAULT_TTL.brandEnrichment;
}

/**
 * Check if a domain already exists in the registry
 */
export async function checkDomainRegistry(domain: string): Promise<{
  exists: boolean;
  brandId?: string;
  lastEnriched?: Date;
  isFresh: boolean;
}> {
  try {
    const entry = await storage.getDomainRegistryEntry(domain);
    
    if (!entry) {
      return {
        exists: false,
        isFresh: false,
      };
    }

    const ttl = await getTTLConfig('brandEnrichment');
    const fresh = entry.lastEnriched ? isFresh(entry.lastEnriched, ttl) : false;

    return {
      exists: true,
      brandId: entry.brandId ?? undefined,
      lastEnriched: entry.lastEnriched || undefined,
      isFresh: fresh,
    };
  } catch (error) {
    console.error('[Entity Resolution] Error checking domain registry:', error);
    return {
      exists: false,
      isFresh: false,
    };
  }
}

/**
 * Register a domain in the registry
 */
export async function registerDomain(domain: string, brandId: string): Promise<void> {
  try {
    await storage.upsertDomainRegistry({
      domain,
      brandId,
      lastEnriched: new Date(),
    });
    console.log(`[Entity Resolution] Registered domain: ${domain} -> ${brandId}`);
  } catch (error) {
    console.error('[Entity Resolution] Error registering domain:', error);
  }
}

/**
 * Get or create canonical brand for a domain
 */
export async function getOrCreateCanonicalBrand(params: {
  domain: string;
  name: string;
  userId: string;
  forceNew?: boolean;
}): Promise<{
  brandId: string;
  isNew: boolean;
  canReuse: boolean;
}> {
  const { domain, name, userId, forceNew = false } = params;

  // Check if domain exists in registry
  const registryCheck = await checkDomainRegistry(domain);

  // If force new or doesn't exist, create new brand
  if (forceNew || !registryCheck.exists) {
    const brand = await storage.createBrand({
      userId,
      name,
      domain,
      tier: 'free',
      status: 'active',
    });

    await registerDomain(domain, brand.id);

    return {
      brandId: brand.id,
      isNew: true,
      canReuse: false,
    };
  }

  // Domain exists - check if we can reuse
  if (registryCheck.brandId && registryCheck.isFresh) {
    console.log(`[Entity Resolution] Reusing fresh data for domain: ${domain}`);
    return {
      brandId: registryCheck.brandId,
      isNew: false,
      canReuse: true,
    };
  }

  // Domain exists but data is stale - return existing brand for re-enrichment
  if (registryCheck.brandId) {
    console.log(`[Entity Resolution] Data stale for domain: ${domain}, will re-enrich`);
    return {
      brandId: registryCheck.brandId,
      isNew: false,
      canReuse: false,
    };
  }

  // Fallback: create new brand
  const brand = await storage.createBrand({
    userId,
    name,
    domain,
    tier: 'free',
    status: 'active',
  });

  await registerDomain(domain, brand.id);

  return {
    brandId: brand.id,
    isNew: true,
    canReuse: false,
  };
}

/**
 * Check if brand context needs enrichment
 */
export async function needsEnrichment(brandId: string, dataType: string = 'brandEnrichment'): Promise<{
  needs: boolean;
  reason: string;
  lastEnriched?: Date;
}> {
  try {
    const context = await storage.getBrandContext(brandId);

    if (!context) {
      return {
        needs: true,
        reason: 'No brand context exists',
      };
    }

    if (!context.lastEnriched) {
      return {
        needs: true,
        reason: 'Never enriched',
      };
    }

    const ttl = await getTTLConfig(dataType);
    const fresh = isFresh(context.lastEnriched, ttl);

    if (fresh) {
      return {
        needs: false,
        reason: 'Data is fresh',
        lastEnriched: context.lastEnriched,
      };
    }

    return {
      needs: true,
      reason: 'Data is stale',
      lastEnriched: context.lastEnriched,
    };
  } catch (error) {
    console.error('[Entity Resolution] Error checking enrichment need:', error);
    return {
      needs: true,
      reason: 'Error checking - defaulting to enrich',
    };
  }
}

/**
 * Reuse brand context from another brand (for same domain)
 */
export async function reuseBrandContext(sourceBrandId: string, targetBrandId: string): Promise<boolean> {
  try {
    const sourceContext = await storage.getBrandContext(sourceBrandId);
    
    if (!sourceContext) {
      console.warn(`[Entity Resolution] No context found for source brand: ${sourceBrandId}`);
      return false;
    }

    // Check if source context is fresh
    const enrichmentCheck = await needsEnrichment(sourceBrandId);
    if (enrichmentCheck.needs) {
      console.log(`[Entity Resolution] Source context is stale, cannot reuse`);
      return false;
    }

    // Create a copy of the context for the target brand
    await storage.upsertBrandContext({
      ...sourceContext,
      id: undefined, // Let DB generate new ID
      brandId: targetBrandId, // Override with target
      createdAt: undefined, // Let DB set timestamp
      updatedAt: undefined,
    });

    console.log(`[Entity Resolution] Reused context from ${sourceBrandId} to ${targetBrandId}`);
    return true;
  } catch (error) {
    console.error('[Entity Resolution] Error reusing context:', error);
    return false;
  }
}

/**
 * Admin override to force re-enrichment
 */
export async function forceReEnrichment(brandId: string, reason: string): Promise<void> {
  try {
    // Update brand context to mark as stale
    const context = await storage.getBrandContext(brandId);
    if (context) {
      await storage.updateBrandContext(brandId, {
        lastEnriched: new Date(0), // Set to epoch to force re-enrichment
      });
    }

    // Log the override
    await storage.createUsageLog({
      brandId,
      type: 'admin_force_reenrichment',
      amount: 0,
      metadata: {
        reason,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
    });

    console.log(`[Entity Resolution] Forced re-enrichment for brand: ${brandId}, reason: ${reason}`);
  } catch (error) {
    console.error('[Entity Resolution] Error forcing re-enrichment:', error);
    throw error;
  }
}

/**
 * Get enrichment statistics
 */
export async function getEnrichmentStats(): Promise<{
  totalDomains: number;
  freshDomains: number;
  staleDomains: number;
  neverEnriched: number;
}> {
  try {
    const allDomains = await storage.getAllDomainRegistryEntries();
    const ttl = await getTTLConfig('brandEnrichment');

    let fresh = 0;
    let stale = 0;
    let never = 0;

    for (const entry of allDomains) {
      if (!entry.lastEnriched) {
        never++;
      } else if (isFresh(entry.lastEnriched, ttl)) {
        fresh++;
      } else {
        stale++;
      }
    }

    return {
      totalDomains: allDomains.length,
      freshDomains: fresh,
      staleDomains: stale,
      neverEnriched: never,
    };
  } catch (error) {
    console.error('[Entity Resolution] Error getting stats:', error);
    return {
      totalDomains: 0,
      freshDomains: 0,
      staleDomains: 0,
      neverEnriched: 0,
    };
  }
}
