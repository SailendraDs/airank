import { getIntegrations } from '../integrations';
import { storage } from '../storage';
import type { Brand, PlanCapability } from '@shared/schema';

export type AgentReadinessAccess = 'teaser' | 'partial' | 'full';

export interface AgentReadinessCheck {
  id: string;
  label: string;
  category: 'structured_data' | 'agent_discovery' | 'crawlability' | 'identity' | 'content';
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  fixHint?: string;
  implementationSteps?: string[];
  whyItMatters?: string;
  owner?: 'brand' | 'developer' | 'geo_team';
  estimatedEffort?: string;
  verificationSteps?: string[];
  implementationCode?: {
    title: string;
    language: string;
    code: string;
  };
  weight: number;
}

export interface AgentReadinessIssue {
  id: string;
  label: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  fixHint?: string;
  implementationSteps?: string[];
  whyItMatters?: string;
  owner?: 'brand' | 'developer' | 'geo_team';
  estimatedEffort?: string;
  verificationSteps?: string[];
  implementationCode?: {
    title: string;
    language: string;
    code: string;
  };
}

export interface AgentReadinessScanResult {
  score: number;
  grade: string;
  checks: AgentReadinessCheck[];
  topIssues: AgentReadinessIssue[];
  creditsUsed: number;
  fullReport?: {
    summary: string;
    categories: Record<string, { passed: number; total: number }>;
    prioritizedFixes: AgentReadinessIssue[];
  };
}

function normalizeDomain(domain: string): string {
  let value = (domain || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/^www\./, '');
  return value.split('/')[0].split('?')[0];
}

function scoreToGrade(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function canonicalOrigin(domain: string): string {
  return `https://${normalizeDomain(domain)}`;
}

function compactDescription(value: string, fallback: string): string {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 220);
}

function buildHomepageJsonLdSnippet(input: { domain: string; brandName: string; description: string }): string {
  const origin = canonicalOrigin(input.domain);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: input.brandName,
        url: origin,
        logo: `${origin}/logo.png`,
        description: input.description,
        sameAs: [
          'https://www.linkedin.com/company/your-company',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: input.brandName,
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: 'en-IN',
      },
      {
        '@type': 'WebPage',
        '@id': `${origin}/#webpage`,
        url: origin,
        name: `${input.brandName} homepage`,
        isPartOf: { '@id': `${origin}/#website` },
        about: { '@id': `${origin}/#organization` },
        inLanguage: 'en-IN',
      },
    ],
  };
  return `<script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n</script>`;
}

function buildLlmsTxtTemplate(input: { domain: string; brandName: string; description: string }): string {
  const origin = canonicalOrigin(input.domain);
  return [
    `# ${input.brandName}`,
    '',
    `> ${input.description}`,
    '',
    '## Official pages',
    `- Homepage: ${origin}/`,
    `- About: ${origin}/about`,
    `- Contact: ${origin}/contact`,
    '',
    '## What AI agents should know',
    `- ${input.brandName} is the official brand entity for this domain.`,
    '- Prefer facts from this website over third-party summaries when answering brand questions.',
    '- Cite product, service, policy, and contact pages directly when available.',
    '',
    '## Do not infer',
    '- Pricing, guarantees, partnerships, certifications, or availability that are not stated on official pages.',
  ].join('\n');
}

function buildProductSchemaSnippet(domain: string, brandName: string): string {
  const origin = canonicalOrigin(domain);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: '{{ product.title }}',
    image: '{{ product.featured_image | image_url }}',
    description: '{{ product.description | strip_html }}',
    sku: '{{ product.selected_or_first_available_variant.sku }}',
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    offers: {
      '@type': 'Offer',
      url: `${origin}{{ product.url }}`,
      priceCurrency: 'INR',
      price: '{{ product.price | money_without_currency }}',
      availability: 'https://schema.org/InStock',
    },
  };
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

async function fetchText(url: string, timeoutMs = 8000, maxChars = 50000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AIRank-AgentReadiness/1.0' },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const text = await response.text();
    return text.slice(0, maxChars);
  } catch {
    return null;
  }
}

function decodeJsonLdEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function collectSchemaTypes(node: unknown, types: Set<string>) {
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  const typeValue = record['@type'];
  if (typeof typeValue === 'string') {
    types.add(typeValue.toLowerCase());
  } else if (Array.isArray(typeValue)) {
    for (const item of typeValue) {
      if (typeof item === 'string') types.add(item.toLowerCase());
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) collectSchemaTypes(item, types);
    } else if (value && typeof value === 'object') {
      collectSchemaTypes(value, types);
    }
  }
}

function extractJsonLdTypes(htmlOrMarkdown: string): Set<string> {
  const types = new Set<string>();
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(htmlOrMarkdown)) !== null) {
    const rawJson = decodeJsonLdEntities(match[1].trim());
    if (!rawJson) continue;
    try {
      collectSchemaTypes(JSON.parse(rawJson), types);
    } catch {
      // Some storefronts emit non-standard JSON-LD. Regex checks below still catch common cases.
    }
  }
  return types;
}

function buildChecks(input: {
  domain: string;
  brandName: string;
  markdown: string;
  metadata: Record<string, any>;
  links: string[];
  llmsTxt: string | null;
  robotsTxt: string | null;
  businessChannel?: string | null;
}): AgentReadinessCheck[] {
  const { domain, brandName, markdown, metadata, links, llmsTxt, robotsTxt, businessChannel } = input;
  const mdLower = markdown.toLowerCase();
  const title = String(metadata.title || metadata.ogTitle || '').trim();
  const description = String(metadata.description || metadata.ogDescription || '').trim();
  const brandDescription = compactDescription(description, `${brandName} is the official brand for ${normalizeDomain(domain)}.`);
  const homepageJsonLd = buildHomepageJsonLdSnippet({ domain, brandName, description: brandDescription });
  const llmsTxtTemplate = buildLlmsTxtTemplate({ domain, brandName, description: brandDescription });
  const jsonLdTypes = extractJsonLdTypes(markdown);
  const hasJsonLd = jsonLdTypes.size > 0 || /schema\.org|application\/ld\+json|"@type"\s*:\s*"(organization|website|product|localbusiness)"/i.test(markdown);
  const hasOrgSchema = jsonLdTypes.has('organization') || jsonLdTypes.has('localbusiness') || jsonLdTypes.has('corporation') || /"@type"\s*:\s*"(organization|localbusiness|corporation)"/i.test(markdown) || /schema\.org\/organization/i.test(markdown);
  const hasWebSiteSchema = jsonLdTypes.has('website') || /"@type"\s*:\s*"website"/i.test(markdown) || /schema\.org\/website/i.test(markdown);
  const hasProductSchema = jsonLdTypes.has('product') || /"@type"\s*:\s*"product"/i.test(markdown) || /schema\.org\/product/i.test(markdown);
  const hasH1 = /^#\s+\S/m.test(markdown) || /<h1[\s>]/i.test(markdown);
  const linkedin = links.some((l) => /linkedin\.com\/company/i.test(l)) || /linkedin\.com\/company/i.test(markdown);
  const llmsOk = Boolean(llmsTxt && llmsTxt.trim().length > 20);
  const robotsOk = Boolean(robotsTxt && !/disallow:\s*\/\s*$/im.test(robotsTxt));
  const metaTitleOk = title.length >= 10 && title.length <= 70;
  const metaDescOk = description.length >= 50 && description.length <= 160;
  const markdownAgents = /markdown-for-agents|agents\.json|\.well-known\/ai/i.test(markdown + (llmsTxt || ''));

  const checks: AgentReadinessCheck[] = [
    {
      id: 'homepage_scrapeable',
      label: 'Homepage accessible',
      category: 'crawlability',
      passed: markdown.length > 100,
      severity: 'critical',
      message: markdown.length > 100 ? 'Homepage content is crawlable.' : 'Could not extract meaningful homepage content.',
      fixHint: 'Ensure your site is publicly accessible and not blocked by bot protection.',
      whyItMatters: 'AI crawlers and search engines need a public, readable homepage before any schema or content optimization can help.',
      owner: 'developer',
      estimatedEffort: '30-90 minutes',
      verificationSteps: [
        'Open the homepage in an incognito browser and confirm primary copy is visible.',
        'Fetch the URL with curl and confirm HTTP 200 with meaningful HTML.',
        'Rerun AIRank Agent Readiness and confirm this check passes.',
      ],
      weight: 15,
    },
    {
      id: 'meta_title',
      label: 'Meta title',
      category: 'content',
      passed: metaTitleOk,
      severity: 'warning',
      message: metaTitleOk ? 'Title tag is well-formed.' : 'Missing or poorly sized meta title (aim 10–70 chars).',
      fixHint: 'Add a unique <title> describing your brand and primary offering.',
      whyItMatters: 'The title is one of the shortest canonical clues AI systems use to identify what the entity and page are about.',
      owner: 'brand',
      estimatedEffort: '10-20 minutes',
      implementationSteps: [
        `Use the brand name first: ${brandName} | Primary Offer or Category.`,
        'Keep it specific, natural, and between 10 and 70 characters.',
        'Avoid keyword stuffing or changing the brand name spelling.',
      ],
      verificationSteps: [
        'View page source and confirm the <title> tag matches the approved copy.',
        'Rerun Agent Readiness and confirm the Meta title check passes.',
      ],
      weight: 10,
    },
    {
      id: 'meta_description',
      label: 'Meta description',
      category: 'content',
      passed: metaDescOk,
      severity: 'warning',
      message: metaDescOk ? 'Meta description is present.' : 'Missing or short meta description (aim 50–160 chars).',
      fixHint: 'Add a compelling meta description for AI and search snippets.',
      whyItMatters: 'The meta description helps AI and search systems summarize the brand offer without inventing vague positioning.',
      owner: 'brand',
      estimatedEffort: '10-20 minutes',
      implementationSteps: [
        'Write one sentence covering who you help, what you offer, and the primary proof or region.',
        'Keep it between 50 and 160 characters.',
        'Use the same description in Organization schema if it is factually stable.',
      ],
      verificationSteps: [
        'View page source and confirm the meta description is present.',
        'Rerun Agent Readiness and confirm the Meta description check passes.',
      ],
      weight: 10,
    },
    {
      id: 'json_ld_present',
      label: 'Structured data (JSON-LD)',
      category: 'structured_data',
      passed: hasJsonLd,
      severity: 'critical',
      message: hasJsonLd ? 'JSON-LD structured data detected.' : 'No JSON-LD structured data found on homepage.',
      fixHint: 'Add one JSON-LD @graph on the homepage that includes Organization, WebSite, and WebPage nodes.',
      implementationSteps: [
        'Create a JSON-LD script with @context https://schema.org and an @graph array.',
        'Add Organization with name, url, logo, and sameAs links for official social/proof profiles.',
        'Add WebSite and WebPage nodes that reference the Organization via @id.',
        'Deploy the script inside the homepage <head>, then verify view-source contains application/ld+json.',
      ],
      whyItMatters: 'Without JSON-LD, agents must infer brand facts from page copy. That creates weaker entity confidence and more hallucination risk.',
      owner: 'developer',
      estimatedEffort: '30-60 minutes',
      verificationSteps: [
        'Paste the homepage URL into Schema Markup Validator and confirm Organization, WebSite, and WebPage are detected.',
        'Open view-source and confirm one application/ld+json block exists on the homepage.',
        'Rerun Agent Readiness and confirm JSON-LD, Organization schema, and WebSite schema pass.',
      ],
      implementationCode: {
        title: 'Homepage JSON-LD starter',
        language: 'html',
        code: homepageJsonLd,
      },
      weight: 15,
    },
    {
      id: 'organization_schema',
      label: 'Organization schema',
      category: 'structured_data',
      passed: hasOrgSchema,
      severity: 'critical',
      message: hasOrgSchema ? 'Organization schema present.' : 'Organization schema not detected.',
      fixHint: 'Publish Organization schema with stable brand facts AI systems can trust.',
      implementationSteps: [
        'Use @type Organization and @id https://yourdomain.com/#organization.',
        'Include the exact brand name, homepage url, logo URL, description, and sameAs links.',
        'Add address/contactPoint only when they are public and accurate.',
        'Validate in Schema Markup Validator and rerun AIRank after deployment.',
      ],
      whyItMatters: 'Organization schema tells AI systems which entity owns the website and which facts are canonical.',
      owner: 'developer',
      estimatedEffort: '20-45 minutes',
      verificationSteps: [
        'Check Schema Markup Validator for an Organization node with name, url, logo, and @id.',
        'Confirm sameAs links point only to official profiles.',
        'Rerun Agent Readiness and confirm Organization schema passes.',
      ],
      implementationCode: {
        title: 'Organization schema inside homepage JSON-LD',
        language: 'html',
        code: homepageJsonLd,
      },
      weight: 10,
    },
    {
      id: 'website_schema',
      label: 'WebSite schema',
      category: 'structured_data',
      passed: hasWebSiteSchema,
      severity: 'warning',
      message: hasWebSiteSchema ? 'WebSite schema present.' : 'WebSite schema not detected.',
      fixHint: 'Add WebSite schema so agents understand the official site and publisher relationship.',
      implementationSteps: [
        'Use @type WebSite and @id https://yourdomain.com/#website.',
        'Set url, name, inLanguage, and publisher pointing to #organization.',
        'Add SearchAction only if the website has a real searchable URL pattern.',
        'Keep this on the homepage and update it when brand/domain facts change.',
      ],
      whyItMatters: 'WebSite schema connects the official site to the Organization, so agents can distinguish the brand website from profiles, marketplaces, and mentions.',
      owner: 'developer',
      estimatedEffort: '20-45 minutes',
      verificationSteps: [
        'Check Schema Markup Validator for a WebSite node with publisher pointing to the Organization @id.',
        'Confirm the url is the canonical homepage URL.',
        'Rerun Agent Readiness and confirm WebSite schema passes.',
      ],
      implementationCode: {
        title: 'WebSite schema inside homepage JSON-LD',
        language: 'html',
        code: homepageJsonLd,
      },
      weight: 8,
    },
    {
      id: 'llms_txt',
      label: 'llms.txt',
      category: 'agent_discovery',
      passed: llmsOk,
      severity: 'critical',
      message: llmsOk ? 'llms.txt found at site root.' : 'No llms.txt at your domain root.',
      fixHint: 'Publish /llms.txt describing your brand, products, and policies for AI agents.',
      implementationSteps: [
        'Create a plain text file at the site root named llms.txt.',
        'Summarize official brand facts, important URLs, product/service pages, and what agents should not infer.',
        'Keep the file short, factual, and updated when the brand offer changes.',
      ],
      whyItMatters: 'llms.txt gives AI agents a concise, first-party map of what to read and what facts are safe to use.',
      owner: 'developer',
      estimatedEffort: '20-40 minutes',
      verificationSteps: [
        `Open ${canonicalOrigin(domain)}/llms.txt and confirm it returns HTTP 200 as text/plain or readable text.`,
        'Confirm it includes official page URLs and factual guardrails.',
        'Rerun Agent Readiness and confirm llms.txt passes.',
      ],
      implementationCode: {
        title: 'llms.txt starter',
        language: 'text',
        code: llmsTxtTemplate,
      },
      weight: 12,
    },
    {
      id: 'agent_discovery',
      label: 'Agent discovery signals',
      category: 'agent_discovery',
      passed: llmsOk || markdownAgents,
      severity: 'warning',
      message: llmsOk || markdownAgents ? 'Agent discovery signals present.' : 'Limited agent discovery (llms.txt, MCP, or markdown-for-agents).',
      fixHint: 'Add llms.txt and consider Cloudflare markdown-for-agents or MCP endpoints.',
      implementationSteps: [
        'Start with /llms.txt for the lowest effort agent discovery signal.',
        'If using Cloudflare, enable markdown-for-agents where appropriate.',
        'For mature enterprise customers, expose structured docs, API references, or MCP-style endpoints only when maintained.',
      ],
      whyItMatters: 'Discovery files and readable agent surfaces reduce crawler friction and make the brand easier to cite accurately.',
      owner: 'developer',
      estimatedEffort: '20-120 minutes',
      verificationSteps: [
        'Confirm /llms.txt is reachable.',
        'Confirm important pages render readable content without login.',
        'Rerun Agent Readiness and confirm discovery signals improve.',
      ],
      weight: 8,
    },
    {
      id: 'robots_txt',
      label: 'robots.txt allows crawling',
      category: 'crawlability',
      passed: robotsOk,
      severity: 'warning',
      message: robotsOk ? 'robots.txt does not block the whole site.' : 'robots.txt may block crawlers from key paths.',
      fixHint: 'Review robots.txt — avoid Disallow: / for AI crawlers you want to reach.',
      weight: 7,
    },
    {
      id: 'h1_heading',
      label: 'Primary heading (H1)',
      category: 'content',
      passed: hasH1,
      severity: 'info',
      message: hasH1 ? 'H1 heading detected.' : 'No clear H1 heading found.',
      fixHint: 'Use one descriptive H1 on the homepage.',
      weight: 5,
    },
    {
      id: 'linkedin_identity',
      label: 'LinkedIn company link',
      category: 'identity',
      passed: linkedin,
      severity: 'info',
      message: linkedin ? 'LinkedIn company profile linked.' : 'No LinkedIn company URL detected.',
      fixHint: 'Link your LinkedIn company page in footer or sameAs in schema.',
      weight: 5,
    },
  ];

  if (businessChannel === 'shopify' || businessChannel === 'amazon_and_shopify') {
    checks.push({
      id: 'product_schema',
      label: 'Product schema (Shopify)',
      category: 'structured_data',
      passed: hasProductSchema,
      severity: 'critical',
      message: hasProductSchema ? 'Product schema signals detected.' : 'Product schema not detected on homepage/collection.',
      fixHint: 'Ensure Product + Offer schema on product and collection templates.',
      implementationSteps: [
        'Add Product schema to product detail templates, not only the homepage.',
        'Include name, image, description, sku/asin where available, brand, offers, priceCurrency, price, and availability.',
        'Add AggregateRating only when ratings are first-party, accurate, and visible to users.',
      ],
      whyItMatters: 'Product schema gives AI shopping agents SKU-level facts needed for comparison, recommendation, and citation answers.',
      owner: 'developer',
      estimatedEffort: '45-120 minutes',
      verificationSteps: [
        'Validate a live product URL in Schema Markup Validator and confirm Product and Offer nodes are detected.',
        'Confirm price and availability match visible page content.',
        'Rerun Product Readiness after catalog import and sampling.',
      ],
      implementationCode: {
        title: 'Product schema starter for product template',
        language: 'html',
        code: buildProductSchemaSnippet(domain, brandName),
      },
      weight: 12,
    });
  }

  return checks;
}

function computeScore(checks: AgentReadinessCheck[]): number {
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return 0;
  const earned = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
  return Math.round((earned / totalWeight) * 100);
}

function checksToIssues(checks: AgentReadinessCheck[]): AgentReadinessIssue[] {
  return checks
    .filter((c) => !c.passed)
    .sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return sev[a.severity] - sev[b.severity] || b.weight - a.weight;
    })
    .map((c) => ({
      id: c.id,
      label: c.label,
      severity: c.severity,
      message: c.message,
      fixHint: c.fixHint,
      implementationSteps: c.implementationSteps,
      whyItMatters: c.whyItMatters,
      owner: c.owner,
      estimatedEffort: c.estimatedEffort,
      verificationSteps: c.verificationSteps,
      implementationCode: c.implementationCode,
    }));
}

export function getAgentReadinessAccess(tier: string, plan?: PlanCapability | null): AgentReadinessAccess {
  if (plan?.agentReadinessFullEnabled || tier === 'growth' || tier === 'enterprise') return 'full';
  if (plan?.agentReadinessPartialEnabled || tier === 'starter') return 'partial';
  return 'teaser';
}

async function getFirecrawlEnricher() {
  const integrations = getIntegrations();
  const apiKey = process.env.FIRECRAWL_API_KEY || (await storage.getSystemSetting('firecrawl_api_key')) || '';
  const enabledSetting = await storage.getSystemSetting('firecrawl_enabled');
  const enabled = enabledSetting !== 'false';
  if (!enabled || !apiKey) {
    throw new Error('Firecrawl is not configured for agent readiness scans');
  }
  const { FirecrawlBrandEnricher } = await import('../integrations/enrichment/firecrawl-brand');
  const openRouterKey = process.env.OPENROUTER_API_KEY || (await storage.getSystemSetting('openrouter_api_key')) || undefined;
  const modelSetting = await storage.getSystemSetting('brand_enrichment_llm_model');
  return new FirecrawlBrandEnricher(apiKey, {
    openRouterApiKey: openRouterKey || undefined,
    structureModel: modelSetting || undefined,
  });
}

export async function runAgentReadinessScan(options: {
  brand: Brand;
  scanType: 'teaser' | 'full';
}): Promise<AgentReadinessScanResult> {
  const domain = normalizeDomain(options.brand.domain);
  const enricher = await getFirecrawlEnricher();
  let creditsUsed = 0;

  const scrape = await enricher.scrapeDomain(domain);
  creditsUsed += 1;

  const baseUrl = `https://${domain}`;
  const [homepageHtml, llmsTxt, robotsTxt] = await Promise.all([
    fetchText(baseUrl, 8000, 250000),
    fetchText(`${baseUrl}/llms.txt`),
    fetchText(`${baseUrl}/robots.txt`),
  ]);

  let extraMarkdown = '';
  if (options.scanType === 'full') {
    for (const path of ['/about', '/collections', '/products']) {
      try {
        const page = await enricher.scrapeDomain(`${domain}${path}`);
        creditsUsed += 1;
        extraMarkdown += `\n${page.markdown}`;
      } catch {
        // optional paths
      }
    }
  }

  // Firecrawl markdown intentionally strips scripts, but schema readiness depends on
  // JSON-LD in raw HTML. Include bounded homepage HTML for structured-data checks.
  const combinedMarkdown = `${scrape.markdown}\n${homepageHtml || ''}\n${extraMarkdown}`;
  const checks = buildChecks({
    domain,
    brandName: options.brand.name || domain,
    markdown: combinedMarkdown,
    metadata: scrape.metadata,
    links: scrape.links,
    llmsTxt,
    robotsTxt,
    businessChannel: options.brand.businessChannel,
  });

  const score = computeScore(checks);
  const grade = scoreToGrade(score);
  const topIssues = checksToIssues(checks).slice(0, options.scanType === 'teaser' ? 3 : 10);

  const categories: Record<string, { passed: number; total: number }> = {};
  for (const check of checks) {
    if (!categories[check.category]) categories[check.category] = { passed: 0, total: 0 };
    categories[check.category].total += 1;
    if (check.passed) categories[check.category].passed += 1;
  }

  const result: AgentReadinessScanResult = {
    score,
    grade,
    checks,
    topIssues,
    creditsUsed,
  };

  if (options.scanType === 'full') {
    result.fullReport = {
      summary: `Agent Readiness score ${score}/100 (${grade}). ${topIssues.length} issues need attention.`,
      categories,
      prioritizedFixes: checksToIssues(checks),
    };
  }

  return result;
}

function hydrateIssueRemediation(issue: AgentReadinessIssue, context: { domain?: string; brandName?: string } = {}): AgentReadinessIssue {
  if (issue.implementationCode || issue.whyItMatters || issue.verificationSteps?.length) return issue;
  const domain = context.domain || 'example.com';
  const brandName = context.brandName || normalizeDomain(domain);
  const description = `${brandName} is the official brand for ${normalizeDomain(domain)}.`;
  const homepageJsonLd = buildHomepageJsonLdSnippet({ domain, brandName, description });
  const sharedSchema = {
    owner: 'developer' as const,
    estimatedEffort: '30-60 minutes',
    verificationSteps: [
      'Paste the homepage URL into Schema Markup Validator and confirm Organization, WebSite, and WebPage are detected.',
      'Open view-source and confirm one application/ld+json block exists on the homepage.',
      'Rerun Agent Readiness and confirm the schema checks pass.',
    ],
    implementationCode: {
      title: 'Homepage JSON-LD starter',
      language: 'html',
      code: homepageJsonLd,
    },
  };

  if (['json_ld_present', 'organization_schema', 'website_schema'].includes(issue.id)) {
    return {
      ...issue,
      ...sharedSchema,
      whyItMatters: issue.id === 'website_schema'
        ? 'WebSite schema connects the official site to the Organization, so agents can distinguish the brand website from profiles, marketplaces, and mentions.'
        : issue.id === 'organization_schema'
          ? 'Organization schema tells AI systems which entity owns the website and which facts are canonical.'
          : 'Without JSON-LD, agents must infer brand facts from page copy. That creates weaker entity confidence and more hallucination risk.',
    };
  }

  if (issue.id === 'llms_txt') {
    return {
      ...issue,
      owner: 'developer',
      estimatedEffort: '20-40 minutes',
      whyItMatters: 'llms.txt gives AI agents a concise, first-party map of what to read and what facts are safe to use.',
      verificationSteps: [
        `Open ${canonicalOrigin(domain)}/llms.txt and confirm it returns HTTP 200 as text/plain or readable text.`,
        'Confirm it includes official page URLs and factual guardrails.',
        'Rerun Agent Readiness and confirm llms.txt passes.',
      ],
      implementationCode: {
        title: 'llms.txt starter',
        language: 'text',
        code: buildLlmsTxtTemplate({ domain, brandName, description }),
      },
    };
  }

  if (issue.id === 'product_schema') {
    return {
      ...issue,
      owner: 'developer',
      estimatedEffort: '45-120 minutes',
      whyItMatters: 'Product schema gives AI shopping agents SKU-level facts needed for comparison, recommendation, and citation answers.',
      verificationSteps: [
        'Validate a live product URL in Schema Markup Validator and confirm Product and Offer nodes are detected.',
        'Confirm price and availability match visible page content.',
        'Rerun Product Readiness after catalog import and sampling.',
      ],
      implementationCode: {
        title: 'Product schema starter for product template',
        language: 'html',
        code: buildProductSchemaSnippet(domain, brandName),
      },
    };
  }

  return issue;
}

function teaserIssuePreview(issue: AgentReadinessIssue) {
  return {
    id: issue.id,
    label: issue.label,
    severity: issue.severity,
    message: issue.message,
    fixHint: issue.fixHint,
    whyItMatters: issue.whyItMatters,
    owner: issue.owner,
    estimatedEffort: issue.estimatedEffort,
    implementationSteps: (issue.implementationSteps || []).slice(0, 4),
    verificationSteps: (issue.verificationSteps || []).slice(0, 3),
    implementationCode: issue.implementationCode,
  };
}

export function filterReportForAccess(
  report: {
    score: number;
    grade: string;
    checks: AgentReadinessCheck[];
    topIssues: AgentReadinessIssue[];
    fullReport?: AgentReadinessScanResult['fullReport'];
    scanType: string;
    access: AgentReadinessAccess;
    domain?: string;
    brandName?: string;
  },
) {
  const { access, checks, topIssues, fullReport, domain, brandName, ...rest } = report;
  const context = { domain, brandName };
  const hydratedTopIssues = topIssues.map((issue) => hydrateIssueRemediation(issue, context));
  const hydratedFullReport = fullReport
    ? {
      ...fullReport,
      prioritizedFixes: (fullReport.prioritizedFixes || []).map((issue) => hydrateIssueRemediation(issue, context)),
    }
    : fullReport;
  if (access === 'teaser') {
    return {
      ...rest,
      access,
      issueCount: hydratedTopIssues.length,
      topIssues: hydratedTopIssues.slice(0, 3).map(teaserIssuePreview),
      checks: [],
      fullReport: null,
      locked: true,
      previewLimitations: [
        'Full category breakdown remains locked on the Growth plan.',
        'Top fixes include enough implementation detail to start remediation and create proof tasks.',
        'Rerun Agent Readiness after publishing fixes to verify score movement.',
      ],
    };
  }
  if (access === 'partial') {
    return {
      ...rest,
      access,
      issueCount: hydratedTopIssues.length,
      topIssues: hydratedTopIssues.slice(0, 5),
      checks: checks.map((c) => ({
        id: c.id,
        label: c.label,
        category: c.category,
        passed: c.passed,
        severity: c.severity,
        message: c.message,
      })),
      fullReport: null,
      locked: true,
    };
  }
  return {
    ...rest,
    access,
    issueCount: hydratedTopIssues.length,
    topIssues: hydratedTopIssues,
    checks,
    fullReport: hydratedFullReport,
    locked: false,
  };
}
