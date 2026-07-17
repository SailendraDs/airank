// Schema.org Crawler Worker
//
// Fetches the brand's website and extracts structured data:
//   - JSON-LD blocks (Schema.org/Organization, Person, Product, etc.)
//   - Microdata
//   - Open Graph tags
//   - Twitter Card tags
//
// Validates that the Schema.org markup is well-formed and contains canonical
// entity fields (logo, name, sameAs links to social profiles).

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface SchemaOrgCrawlerPayload {
  brandId: string;
  /** URL to crawl. Defaults to brand.url */
  url?: string;
}

export interface SchemaOrgCrawlResult {
  brandId: string;
  url: string;
  hasJsonLd: boolean;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  schemas: { type: string; fields: string[] }[];
  sameAsLinks: string[];
  missingFields: string[];
}

const CANONICAL_FIELDS = [
  '@context', '@type', 'name', 'url', 'logo', 'description',
  'foundingDate', 'address', 'sameAs', 'contactPoint',
];

export async function schemaOrgCrawlerWorker(job: QueuedJob): Promise<SchemaOrgCrawlResult> {
  const { brandId, url } = job.payload;
  const log = logger.child({ worker: 'schema_org_crawler', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const targetUrl = url ?? brand.url ?? brand.website ?? null;
  if (!targetUrl) {
    log.warn('No URL for brand; skipping');
    return {
      brandId,
      url: '',
      hasJsonLd: false, hasOpenGraph: false, hasTwitterCard: false,
      schemas: [], sameAsLinks: [], missingFields: CANONICAL_FIELDS,
    };
  }

  const result: SchemaOrgCrawlResult = {
    brandId,
    url: targetUrl,
    hasJsonLd: false,
    hasOpenGraph: false,
    hasTwitterCard: false,
    schemas: [],
    sameAsLinks: [],
    missingFields: [],
  };

  try {
    const r = await fetch(targetUrl, {
      headers: { 'User-Agent': 'AIRank/1.0 (schema.org crawler)' },
      redirect: 'follow',
    });
    if (!r.ok) {
      log.warn(`HTTP error fetching URL: status=${r.status}`);
      return result;
    }
    const html = await r.text();
    result.hasOpenGraph = /<meta\s+property=["']og:/.test(html);
    result.hasTwitterCard = /<meta\s+name=["']twitter:/.test(html);

    // Extract JSON-LD blocks
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/g;
    const schemas: { type: string; fields: string[] }[] = [];
    let match: RegExpExecArray | null;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          const type = item['@type'] ?? 'Unknown';
          const fields = Object.keys(item);
          schemas.push({ type, fields });
          if (item.sameAs) {
            const sameAs = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
            result.sameAsLinks.push(...sameAs.filter((s: any) => typeof s === 'string'));
          }
        }
        result.hasJsonLd = true;
      } catch (e) {
        log.warn(`JSON-LD parse error: ${(e as Error).message}`);
      }
    }
    result.schemas = schemas;

    // Compute missing canonical fields
    if (result.hasJsonLd) {
      const allFields = new Set(schemas.flatMap(s => s.fields));
      result.missingFields = CANONICAL_FIELDS.filter(f => !allFields.has(f));
    } else {
      result.missingFields = CANONICAL_FIELDS;
    }

    // Persist sameAs links as entity_links (if not already)
    for (const link of result.sameAsLinks.slice(0, 30)) {
      const platform = detectPlatform(link);
      if (platform) {
        await storage.createEntityLink({
          brandId,
          platform: platform as any,
          url: link,
          verified: true,
          source: 'schema.org',
        });
      }
    }
  } catch (e: any) {
    log.error(`Crawl error: ${e.message}`);
  }

  log.info(`Schema.org crawl complete: ${JSON.stringify(result)}`);
  return result;
}

function detectPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x';
  if (u.includes('youtube.com')) return 'youtube';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('github.com')) return 'github';
  if (u.includes('facebook.com')) return 'facebook';
  if (u.includes('crunchbase.com')) return 'crunchbase';
  return null;
}