import {
  type BrandEnrichmentFields,
  type CompetitorSuggestion,
  brandNameFromDomain,
} from './brand-enrichment-types';

const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';
const DEFAULT_STRUCTURE_MODEL = 'google/gemini-2.5-flash-lite';
const FALLBACK_STRUCTURE_MODEL = 'google/gemini-2.0-flash-lite';

export interface FirecrawlScrapeResult {
  markdown: string;
  metadata: Record<string, any>;
  links: string[];
}

export interface FirecrawlSearchResult {
  url: string;
  title?: string;
  description?: string;
}

export class FirecrawlBrandEnricher {
  constructor(
    private apiKey: string,
    private options?: {
      openRouterApiKey?: string;
      structureModel?: string;
    },
  ) {}

  private async firecrawlRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.error === 'string'
          ? payload.error
          : payload?.error?.message || response.statusText || 'Firecrawl request failed';
      throw new Error(`Firecrawl API error (${response.status}): ${message}`);
    }

    return payload as T;
  }

  async scrapeDomain(domain: string): Promise<FirecrawlScrapeResult> {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const result = await this.firecrawlRequest<{ success?: boolean; data?: any }>('/scrape', {
      url,
      formats: ['markdown', 'links'],
      onlyMainContent: true,
    });

    const data = result.data || {};
    return {
      markdown: String(data.markdown || ''),
      metadata: data.metadata || {},
      links: Array.isArray(data.links) ? data.links.map(String) : [],
    };
  }

  async searchWeb(query: string, limit = 8): Promise<FirecrawlSearchResult[]> {
    const result = await this.firecrawlRequest<{ success?: boolean; data?: any[] }>('/search', {
      query,
      limit,
    });

    const rows = Array.isArray(result.data) ? result.data : [];
    return rows
      .map((row) => ({
        url: String(row.url || row.link || ''),
        title: row.title ? String(row.title) : undefined,
        description: row.description || row.snippet ? String(row.description || row.snippet) : undefined,
      }))
      .filter((row) => row.url);
  }

  private extractDomainFromUrl(input: string): string {
    try {
      const host = new URL(input.startsWith('http') ? input : `https://${input}`).hostname;
      return host.replace(/^www\./, '').toLowerCase();
    } catch {
      return input.replace(/^www\./, '').toLowerCase();
    }
  }

  private absoluteUrl(domain: string, input?: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, `https://${domain}`).toString();
    } catch {
      return raw;
    }
  }

  private findLogoCandidate(domain: string, scrape: FirecrawlScrapeResult): string {
    const md = scrape.metadata || {};
    const metadataLogo =
      md.logo ||
      md.ogLogo ||
      md.ogImage ||
      md.image ||
      md.twitterImage ||
      md['og:image'] ||
      md['twitter:image'];
    if (metadataLogo) return this.absoluteUrl(domain, String(metadataLogo));

    const logoLink = scrape.links.find((link) => /logo|brand|favicon|apple-touch-icon/i.test(link));
    if (logoLink) return this.absoluteUrl(domain, logoLink);

    return `https://${domain}/favicon.ico`;
  }

  private heuristicFromScrape(domain: string, scrape: FirecrawlScrapeResult): BrandEnrichmentFields {
    const md = scrape.metadata || {};
    const title = String(md.title || md.ogTitle || brandNameFromDomain(domain)).trim();
    const description = String(md.description || md.ogDescription || '').trim();
    const logo = this.findLogoCandidate(domain, scrape);
    const linkedinFromLinks = scrape.links.find((l) => /linkedin\.com\/company\//i.test(l));

    return {
      domain,
      name: title,
      description,
      slogan: String(md.ogSiteName || '').trim(),
      logo,
      industry: '',
      subindustry: '',
      city: '',
      state: '',
      country: '',
      linkedinUrl: linkedinFromLinks || '',
    };
  }

  private async structureWithLlm<T>(
    systemPrompt: string,
    userContent: string,
  ): Promise<T | null> {
    const apiKey = this.options?.openRouterApiKey;
    if (!apiKey) return null;

    const models = [
      this.options?.structureModel || process.env.BRAND_ENRICHMENT_LLM_MODEL || DEFAULT_STRUCTURE_MODEL,
      FALLBACK_STRUCTURE_MODEL,
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.OPENROUTER_APP_URL || 'https://airank.io',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'AIRank',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }),
        });

        if (!response.ok) continue;
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) continue;
        const cleaned = String(content).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        return JSON.parse(cleaned) as T;
      } catch (err: any) {
        console.warn(`[FirecrawlBrandEnricher] LLM structure failed (${model}):`, err?.message || err);
      }
    }

    return null;
  }

  async enrichBrand(domain: string): Promise<{
    fields: BrandEnrichmentFields;
    raw: FirecrawlScrapeResult;
    suggestedCompetitors: CompetitorSuggestion[];
  }> {
    const scrape = await this.scrapeDomain(domain);
    const base = this.heuristicFromScrape(domain, scrape);

    const structured = await this.structureWithLlm<Partial<BrandEnrichmentFields>>(
      `You extract structured company profile data from website content for an onboarding workflow.
Return ONLY valid JSON with keys: name, slogan, description, industry, subindustry, city, state, country, linkedinUrl, logo.
Prefer concise About-page descriptions, specific industry taxonomy, and official logo/icon URLs from metadata or links.
Use empty strings for unknown fields. Do not invent data that is not supported by the source.`,
      `Domain: ${domain}
Metadata: ${JSON.stringify(scrape.metadata).slice(0, 4000)}
Links: ${scrape.links.slice(0, 40).join('\n')}
Markdown:
${scrape.markdown.slice(0, 14000)}`,
    );

    const fields: BrandEnrichmentFields = {
      ...base,
      name: structured?.name || base.name,
      slogan: structured?.slogan || base.slogan,
      description: structured?.description || base.description,
      industry: structured?.industry || base.industry,
      subindustry: structured?.subindustry || base.subindustry,
      city: structured?.city || base.city,
      state: structured?.state || base.state,
      country: structured?.country || base.country,
      linkedinUrl: structured?.linkedinUrl || base.linkedinUrl,
      logo: this.absoluteUrl(domain, structured?.logo || base.logo),
      domain,
    };

    const suggestedCompetitors = await this.suggestCompetitors({
      domain,
      brandName: fields.name,
      industry: fields.industry,
    });

    return { fields, raw: scrape, suggestedCompetitors };
  }

  async suggestCompetitors(input: {
    domain: string;
    brandName?: string;
    industry?: string;
  }): Promise<CompetitorSuggestion[]> {
    const brandName = input.brandName || brandNameFromDomain(input.domain);
    const industry = input.industry ? ` ${input.industry}` : '';
    const query = `${brandName}${industry} competitors alternatives`;
    const results = await this.searchWeb(query, 10);
    const ownDomain = input.domain.replace(/^www\./, '').toLowerCase();

    const blockedHosts = new Set([
      'linkedin.com',
      'facebook.com',
      'twitter.com',
      'x.com',
      'instagram.com',
      'youtube.com',
      'wikipedia.org',
      'reddit.com',
      'g2.com',
      'capterra.com',
      'trustpilot.com',
    ]);

    const candidates = results
      .map((row) => {
        const candidateDomain = this.extractDomainFromUrl(row.url);
        return {
          domain: candidateDomain,
          name: row.title || brandNameFromDomain(candidateDomain),
          description: row.description || '',
        };
      })
      .filter((row) => row.domain && row.domain !== ownDomain)
      .filter((row) => !blockedHosts.has(row.domain) && !row.domain.endsWith('.linkedin.com'));

    if (candidates.length === 0) return [];

    const structured = await this.structureWithLlm<{ competitors?: CompetitorSuggestion[] }>(
      `Pick up to 3 direct business competitors for the brand.
Return ONLY JSON: {"competitors":[{"name":"...","domain":"example.com"}]}
Domains must be bare domains without protocol or path.
Favor same-category operators a buyer would actually shortlist, not publishers, directories, review sites, social networks, or marketplaces unless the brand itself is marketplace-native.`,
      `Brand domain: ${ownDomain}
Brand name: ${brandName}
Industry: ${input.industry || 'unknown'}
Search candidates:
${JSON.stringify(candidates.slice(0, 8), null, 2)}`,
    );

    const fromLlm = (structured?.competitors || [])
      .map((c) => ({
        name: String(c.name || brandNameFromDomain(c.domain)).trim(),
        domain: this.extractDomainFromUrl(String(c.domain || '')),
      }))
      .filter((c) => c.domain && c.domain !== ownDomain);

    if (fromLlm.length > 0) {
      return fromLlm.slice(0, 3);
    }

    return candidates.slice(0, 3).map((c) => ({ name: c.name, domain: c.domain }));
  }
}

export function getFirecrawlApiKey(): string {
  return process.env.FIRECRAWL_API_KEY || '';
}

export async function isFirecrawlEnabled(): Promise<boolean> {
  const { storage } = await import('../../storage');
  const toggle = await storage.getSystemSetting('firecrawl_enabled');
  if (toggle === 'false') return false;
  return Boolean(getFirecrawlApiKey() || (await storage.getSystemSetting('firecrawl_api_key')));
}

export async function resolveFirecrawlApiKey(): Promise<string | null> {
  const envKey = getFirecrawlApiKey();
  if (envKey) return envKey;
  const { storage } = await import('../../storage');
  const dbKey = await storage.getSystemSetting('firecrawl_api_key');
  return dbKey || null;
}

export async function createFirecrawlBrandEnricher(): Promise<FirecrawlBrandEnricher | null> {
  if (!(await isFirecrawlEnabled())) return null;
  const apiKey = await resolveFirecrawlApiKey();
  if (!apiKey) return null;

  const { storage } = await import('../../storage');
  const openRouterFromDb = await storage.getSystemSetting('openrouter_api_key');
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || openRouterFromDb || undefined;
  const structureModel =
    (await storage.getSystemSetting('brand_enrichment_llm_model')) ||
    process.env.BRAND_ENRICHMENT_LLM_MODEL ||
    DEFAULT_STRUCTURE_MODEL;

  return new FirecrawlBrandEnricher(apiKey, { openRouterApiKey, structureModel });
}
