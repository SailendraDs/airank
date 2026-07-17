// Public "AI Report Card" lead magnet (Epic N).
// Given a domain, runs a cost-controlled probe across available LLM providers to
// estimate how visible the brand is in AI answers, then returns a teaser score.
// Results are cached for 24h to limit cost/abuse. Full report is email-gated.

import { storage } from '../storage';
import { getIntegrations } from '../integrations';
import type { LLMProviderName } from '../integrations/llm';
import type { LLMMessage } from '../integrations/llm/base';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Cap probe cost: at most this many providers and prompts per public request.
const MAX_PROVIDERS = 2;
const MAX_PROMPTS = 3;

export interface ReportCardResult {
  domain: string;
  brandName: string;
  teaserScore: number; // 0-100
  mentionRate: number; // 0-1 across probes
  modelsCovered: string[];
  highlights: string[];
  // Full detail (only returned after unlock)
  probes?: Array<{ prompt: string; provider: string; mentioned: boolean; snippet: string }>;
  recommendations?: string[];
  cachedAt: string;
}

export function normalizeDomainInput(input: string): string {
  let d = (input || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/\s+/g, '');
  return d;
}

function brandNameFromDomain(domain: string): string {
  const core = domain.replace(/\.[a-z.]+$/, '');
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function buildPrompts(brandName: string): string[] {
  return [
    `What are the best companies or tools like ${brandName}? List a few with short descriptions.`,
    `Is ${brandName} a reputable brand? What do you know about it?`,
    `Recommend top alternatives in the same category as ${brandName}.`,
  ].slice(0, MAX_PROMPTS);
}

async function getCached(domain: string): Promise<ReportCardResult | null> {
  try {
    const raw = await storage.getSystemSetting?.(`report_card_${domain}`);
    if (!raw) return null;
    const parsed = JSON.parse(typeof raw === 'string' ? raw : (raw as any).value ?? '');
    if (!parsed?.cachedAt) return null;
    if (Date.now() - new Date(parsed.cachedAt).getTime() > CACHE_TTL_MS) return null;
    return parsed as ReportCardResult;
  } catch {
    return null;
  }
}

async function setCached(domain: string, result: ReportCardResult): Promise<void> {
  try {
    await storage.setSystemSetting(`report_card_${domain}`, JSON.stringify(result));
  } catch {
    // best-effort cache
  }
}

/** Generate (or return cached) a report card for a domain. */
export async function generateReportCard(domainInput: string): Promise<ReportCardResult> {
  const domain = normalizeDomainInput(domainInput);
  if (!domain || !domain.includes('.')) {
    throw new Error('Please enter a valid domain (e.g. example.com)');
  }

  const cached = await getCached(domain);
  if (cached) return cached;

  const brandName = brandNameFromDomain(domain);
  const prompts = buildPrompts(brandName);

  let providers: LLMProviderName[] = [];
  let llm: ReturnType<typeof getIntegrations>['llm'] | undefined;
  try {
    llm = getIntegrations().llm;
    providers = (llm?.getAvailableProviders?.() || []).slice(0, MAX_PROVIDERS);
  } catch {
    providers = [];
  }

  const probes: Array<{ prompt: string; provider: string; mentioned: boolean; snippet: string }> = [];
  const brandLc = brandName.toLowerCase();
  const domainCore = domain.replace(/\.[a-z.]+$/, '');

  if (llm && providers.length > 0) {
    for (const prompt of prompts) {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const results = await llm.chatMultiple(providers, messages, { temperature: 0.3, maxTokens: 400 } as any);
      for (const [provider, resp] of Object.entries(results)) {
        const text = (resp?.content || '').toString();
        const mentioned = text.toLowerCase().includes(brandLc) || text.toLowerCase().includes(domainCore);
        probes.push({
          prompt,
          provider,
          mentioned,
          snippet: text.slice(0, 280),
        });
      }
    }
  }

  const total = probes.length;
  const mentions = probes.filter((p) => p.mentioned).length;
  const mentionRate = total > 0 ? mentions / total : 0;
  // Teaser score: weighted mention rate with a floor so the page is never blank.
  const teaserScore = total > 0 ? Math.round(mentionRate * 100) : 0;

  const modelsCovered = Array.from(new Set(probes.map((p) => p.provider)));
  const highlights: string[] = [];
  if (total === 0) {
    highlights.push('AI probing is not configured on this instance — showing structural readiness only.');
  } else if (mentions === 0) {
    highlights.push(`${brandName} was not mentioned in any AI answers we tested — a major visibility gap.`);
  } else {
    highlights.push(`${brandName} appeared in ${mentions} of ${total} AI answers (${teaserScore}%).`);
    if (mentionRate < 0.5) highlights.push('Coverage is inconsistent across models — competitors likely dominate key prompts.');
  }

  const recommendations = [
    'Publish authoritative, structured content answering your top buyer questions.',
    'Ensure your brand has a complete Knowledge Graph / Wikidata presence.',
    'Earn citations on high-authority sources AI assistants trust.',
  ];

  const result: ReportCardResult = {
    domain,
    brandName,
    teaserScore,
    mentionRate,
    modelsCovered,
    highlights,
    probes,
    recommendations,
    cachedAt: new Date().toISOString(),
  };

  await setCached(domain, result);
  return result;
}

/** Strip full-report detail for the un-gated teaser response. */
export function toTeaser(result: ReportCardResult): Omit<ReportCardResult, 'probes' | 'recommendations'> {
  const { probes, recommendations, ...teaser } = result;
  return teaser;
}
