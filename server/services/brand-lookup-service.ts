import { db } from '../db';
import { domainRegistry as domainRegistryTable } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';
import {
  type BrandEnrichmentFields,
  type BrandEnrichmentCachePayload,
  type BrandLookupResponse,
  type CompetitorSuggestion,
  brandNameFromDomain,
  fieldsToCachePayload,
  mapCachePayloadToLookup,
} from '../integrations/enrichment/brand-enrichment-types';
import { createFirecrawlBrandEnricher } from '../integrations/enrichment/firecrawl-brand';

const CACHE_TTL_DAYS = 30;

function absoluteUrl(domain: string, input?: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, `https://${domain}`).toString();
  } catch {
    return raw;
  }
}

function firstMeta(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function firstLink(html: string, relNames: string[]): string {
  for (const rel of relNames) {
    const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

async function lookupWebsiteMetadata(domain: string): Promise<{ fields: BrandEnrichmentFields; raw: Record<string, unknown> } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AIRank/1.0 (+https://airank.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return null;

    const html = (await response.text()).slice(0, 250_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = (firstMeta(html, ['og:site_name', 'application-name']) || titleMatch?.[1] || brandNameFromDomain(domain))
      .replace(/\s+/g, ' ')
      .trim();
    const description = firstMeta(html, ['description', 'og:description', 'twitter:description']);
    const logo = absoluteUrl(
      domain,
      firstMeta(html, ['og:image', 'twitter:image']) ||
        firstLink(html, ['apple-touch-icon', 'icon', 'shortcut icon']) ||
        '/favicon.ico',
    );
    const linkedinMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/[^"' <)]+/i);

    return {
      fields: {
        domain,
        name: title || brandNameFromDomain(domain),
        description,
        slogan: '',
        logo,
        industry: '',
        subindustry: '',
        city: '',
        state: '',
        country: '',
        linkedinUrl: linkedinMatch?.[0] || '',
      },
      raw: {
        title,
        description,
        logo,
        source: 'direct_homepage_metadata',
      },
    };
  } catch (error: any) {
    logger.warn('[BrandLookup] Direct website metadata failed', { domain, error: error?.message || error });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackLookup(domain: string): BrandLookupResponse {
  return {
    domain,
    name: brandNameFromDomain(domain),
    description: '',
    slogan: '',
    logo: '',
    industry: '',
    subindustry: '',
    city: '',
    state: '',
    country: '',
    linkedinUrl: '',
    brandDevData: null,
    enrichmentSource: 'fallback',
    enrichmentStatus: 'not_configured',
    enrichmentError: null,
    brandDevStatus: 'not_configured',
    brandDevError: null,
  };
}

export async function getCachedBrandEnrichment(domain: string): Promise<BrandEnrichmentCachePayload | null> {
  try {
    const [cached] = await db
      .select({
        brandDevData: domainRegistryTable.brandDevData,
        brandDevExpiresAt: domainRegistryTable.brandDevExpiresAt,
      })
      .from(domainRegistryTable)
      .where(eq(domainRegistryTable.domain, domain))
      .limit(1);

    if (!cached?.brandDevData || !cached.brandDevExpiresAt) return null;
    if (new Date(cached.brandDevExpiresAt).getTime() <= Date.now()) return null;

    await db
      .update(domainRegistryTable)
      .set({ lastAccessed: new Date(), updatedAt: new Date() })
      .where(eq(domainRegistryTable.domain, domain));

    return cached.brandDevData as BrandEnrichmentCachePayload;
  } catch (error: any) {
    logger.warn('[BrandLookupCache] Read failed', { domain, error: String(error?.message || error) });
    return null;
  }
}

export async function saveCachedBrandEnrichment(domain: string, payload: BrandEnrichmentCachePayload) {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db
      .insert(domainRegistryTable)
      .values({
        domain,
        brandDevData: payload,
        brandDevExpiresAt: expiresAt,
        usageCount: 1,
        lastAccessed: new Date(),
      })
      .onConflictDoUpdate({
        target: domainRegistryTable.domain,
        set: {
          brandDevData: payload,
          brandDevExpiresAt: expiresAt,
          lastAccessed: new Date(),
          updatedAt: new Date(),
          usageCount: sql`COALESCE(${domainRegistryTable.usageCount}, 0) + 1`,
        },
      });
  } catch (error: any) {
    logger.warn('[BrandLookupCache] Write failed', { domain, error: String(error?.message || error) });
  }
}

function toLookupResponse(
  fields: ReturnType<typeof mapCachePayloadToLookup>,
  cachePayload: BrandEnrichmentCachePayload | null,
  meta: {
    enrichmentSource: BrandLookupResponse['enrichmentSource'];
    enrichmentStatus: BrandLookupResponse['enrichmentStatus'];
    enrichmentError: string | null;
    suggestedCompetitors?: CompetitorSuggestion[];
  },
): BrandLookupResponse {
  return {
    ...fields,
    brandDevData: cachePayload,
    enrichmentSource: meta.enrichmentSource,
    enrichmentStatus: meta.enrichmentStatus,
    enrichmentError: meta.enrichmentError,
    suggestedCompetitors: meta.suggestedCompetitors || cachePayload?.suggestedCompetitors,
    brandDevStatus: meta.enrichmentStatus,
    brandDevError: meta.enrichmentError,
  };
}

export async function lookupBrandByDomain(domain: string): Promise<BrandLookupResponse> {
  const cached = await getCachedBrandEnrichment(domain);
  if (cached?.brand) {
    return toLookupResponse(mapCachePayloadToLookup(cached, domain), cached, {
      enrichmentSource: 'cache',
      enrichmentStatus: 'ok',
      enrichmentError: null,
      suggestedCompetitors: cached.suggestedCompetitors,
    });
  }

  const enricher = await createFirecrawlBrandEnricher();
  if (!enricher) {
    const direct = await lookupWebsiteMetadata(domain);
    if (!direct) return fallbackLookup(domain);
    const cachePayload = fieldsToCachePayload(direct.fields, 'website_metadata', {
      raw: direct.raw,
    });
    await saveCachedBrandEnrichment(domain, cachePayload);
    return toLookupResponse(direct.fields, cachePayload, {
      enrichmentSource: 'website_metadata',
      enrichmentStatus: 'ok',
      enrichmentError: null,
    });
  }

  try {
    const { fields, raw, suggestedCompetitors } = await enricher.enrichBrand(domain);
    const cachePayload = fieldsToCachePayload(fields, 'firecrawl', {
      suggestedCompetitors,
      raw: { metadata: raw.metadata, links: raw.links.slice(0, 50) },
    });
    await saveCachedBrandEnrichment(domain, cachePayload);

    return toLookupResponse(fields, cachePayload, {
      enrichmentSource: 'firecrawl',
      enrichmentStatus: 'ok',
      enrichmentError: null,
      suggestedCompetitors,
    });
  } catch (error: any) {
    const message = error?.message || 'Firecrawl brand lookup failed';
    logger.warn('[BrandLookup] Firecrawl enrichment failed', { domain, error: message });
    const direct = await lookupWebsiteMetadata(domain);
    if (direct) {
      const cachePayload = fieldsToCachePayload(direct.fields, 'website_metadata', {
        raw: { ...direct.raw, firecrawlError: message },
      });
      await saveCachedBrandEnrichment(domain, cachePayload);
      return toLookupResponse(direct.fields, cachePayload, {
        enrichmentSource: 'website_metadata',
        enrichmentStatus: 'ok',
        enrichmentError: null,
      });
    }
    return {
      ...fallbackLookup(domain),
      enrichmentSource: 'fallback',
      enrichmentStatus: 'error',
      enrichmentError: message,
      brandDevStatus: 'error',
      brandDevError: message,
    };
  }
}

export async function suggestCompetitorsForDomain(input: {
  domain: string;
  brandName?: string;
  industry?: string;
}): Promise<CompetitorSuggestion[]> {
  const cached = await getCachedBrandEnrichment(input.domain);
  if (cached?.suggestedCompetitors?.length) {
    return cached.suggestedCompetitors.slice(0, 3);
  }

  const enricher = await createFirecrawlBrandEnricher();
  if (!enricher) return [];

  try {
    return await enricher.suggestCompetitors(input);
  } catch (error: any) {
    logger.warn('[BrandLookup] Competitor suggestion failed', {
      domain: input.domain,
      error: error?.message || error,
    });
    return [];
  }
}
