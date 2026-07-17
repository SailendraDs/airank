export interface CompetitorSuggestion {
  name: string;
  domain: string;
}

export interface BrandEnrichmentFields {
  domain: string;
  name: string;
  description: string;
  slogan: string;
  logo: string;
  industry: string;
  subindustry: string;
  city: string;
  state: string;
  country: string;
  linkedinUrl: string;
}

export interface BrandEnrichmentCachePayload {
  source: 'firecrawl' | 'website_metadata';
  enrichedAt: string;
  brand: {
    domain: string;
    title: string;
    description?: string;
    slogan?: string;
    logos?: Array<{ url: string }>;
    industries?: { eic?: Array<{ industry?: string; subindustry?: string }> };
    address?: { city?: string; state_province?: string; country?: string };
    socials?: Array<{ type: string; url: string }>;
  };
  suggestedCompetitors?: CompetitorSuggestion[];
  raw?: Record<string, unknown>;
}

export interface BrandLookupResponse extends BrandEnrichmentFields {
  brandDevData: BrandEnrichmentCachePayload | null;
  enrichmentSource: 'cache' | 'firecrawl' | 'website_metadata' | 'fallback';
  enrichmentStatus: 'ok' | 'not_configured' | 'error';
  enrichmentError: string | null;
  suggestedCompetitors?: CompetitorSuggestion[];
  /** @deprecated use enrichmentStatus */
  brandDevStatus?: 'ok' | 'not_configured' | 'error';
  /** @deprecated use enrichmentError */
  brandDevError?: string | null;
}

export function brandNameFromDomain(domain: string): string {
  const slug = domain.replace(/\..+$/, '');
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function mapCachePayloadToLookup(
  data: BrandEnrichmentCachePayload,
  domain: string,
): BrandEnrichmentFields {
  const brand = data.brand || ({} as BrandEnrichmentCachePayload['brand']);
  return {
    domain: brand.domain || domain,
    name: brand.title || brandNameFromDomain(domain),
    description: brand.description || '',
    slogan: brand.slogan || '',
    logo: brand.logos?.[0]?.url || '',
    industry: brand.industries?.eic?.[0]?.industry || '',
    subindustry: brand.industries?.eic?.[0]?.subindustry || '',
    city: brand.address?.city || '',
    state: brand.address?.state_province || '',
    country: brand.address?.country || '',
    linkedinUrl: brand.socials?.find((s) => s.type === 'linkedin')?.url || '',
  };
}

export function fieldsToCachePayload(
  fields: BrandEnrichmentFields,
  source: BrandEnrichmentCachePayload['source'],
  extras?: { suggestedCompetitors?: CompetitorSuggestion[]; raw?: Record<string, unknown> },
): BrandEnrichmentCachePayload {
  return {
    source,
    enrichedAt: new Date().toISOString(),
    brand: {
      domain: fields.domain,
      title: fields.name,
      description: fields.description,
      slogan: fields.slogan,
      logos: fields.logo ? [{ url: fields.logo }] : [],
      industries: {
        eic: fields.industry
          ? [{ industry: fields.industry, subindustry: fields.subindustry || undefined }]
          : [],
      },
      address: {
        city: fields.city || undefined,
        state_province: fields.state || undefined,
        country: fields.country || undefined,
      },
      socials: fields.linkedinUrl ? [{ type: 'linkedin', url: fields.linkedinUrl }] : [],
    },
    suggestedCompetitors: extras?.suggestedCompetitors,
    raw: extras?.raw,
  };
}
