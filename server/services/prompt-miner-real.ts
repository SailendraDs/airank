// Real prompt mining + scoring (Epic C1).
// Pulls genuine demand signals from public sources — Reddit (public search JSON),
// Google SERP related searches + People-Also-Ask (via SerpAPI when configured),
// and YouTube (via the YouTube Data API when configured) — classifies intent,
// scores by demand, and persists to mined_prompts (deduped per brand).

import { storage } from '../storage';
import { getIntegrations } from '../integrations';
import { classifyIntent, type IntentType } from './prompt-intelligence';
import { logger } from '../lib/logger';

const INTENT_WEIGHT: Record<IntentType, number> = {
  comparison: 1.0,
  pricing: 0.9,
  review: 0.8,
  discovery: 0.7,
  howto: 0.6,
};

export interface MineSummary {
  brandId: string;
  sources: Record<string, number>;
  totalUpserted: number;
}

function normalize(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Score a prompt 0-100 from a normalized demand signal and its intent weight. */
function score(demandSignal: number, intent: IntentType): number {
  const w = INTENT_WEIGHT[intent] ?? 0.7;
  return Math.round(Math.min(1, demandSignal) * w * 100);
}

interface Candidate {
  query: string;
  source: string;
  sourceUrl?: string;
  upvotes?: number;
  commentCount?: number;
  viewCount?: number;
  searchVolume?: number;
  demandSignal: number; // 0-1
}

async function mineReddit(brandName: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(brandName)}&sort=relevance&limit=25&t=year`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AIRank/1.0 (prompt-intelligence)' } });
    if (!res.ok) return out;
    const data = await res.json();
    const children = data?.data?.children || [];
    let maxScore = 1;
    for (const c of children) {
      const ups = c?.data?.ups ?? 0;
      if (ups > maxScore) maxScore = ups;
    }
    for (const c of children) {
      const title = c?.data?.title;
      if (!title) continue;
      const ups = c?.data?.ups ?? 0;
      const comments = c?.data?.num_comments ?? 0;
      out.push({
        query: title,
        source: 'reddit',
        sourceUrl: c?.data?.permalink ? `https://www.reddit.com${c.data.permalink}` : undefined,
        upvotes: ups,
        commentCount: comments,
        demandSignal: Math.min(1, ups / maxScore),
      });
    }
  } catch (err: any) {
    logger.warn?.(`[PromptMiner] Reddit mining failed: ${err?.message || err}`);
  }
  return out;
}

async function mineSerp(brandName: string, seeds: string[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let serpApi: any;
  try {
    serpApi = getIntegrations().serpApi;
  } catch {
    serpApi = undefined;
  }
  if (!serpApi) return out;

  for (const seed of seeds.slice(0, 3)) {
    try {
      const result = await serpApi.searchGoogle(seed, { brandName });
      for (const rel of (result.relatedSearches || [])) {
        out.push({ query: rel, source: 'serp_related', demandSignal: 0.6 });
      }
      for (const paa of (result.peopleAlsoAsk || [])) {
        if (paa?.question) out.push({ query: paa.question, source: 'serp_paa', sourceUrl: paa.url, demandSignal: 0.7 });
      }
    } catch (err: any) {
      logger.warn?.(`[PromptMiner] SERP mining failed for "${seed}": ${err?.message || err}`);
    }
  }
  return out;
}

async function mineYouTube(brandName: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let youtube: any;
  try {
    youtube = getIntegrations().social?.youtube;
  } catch {
    youtube = undefined;
  }
  if (!youtube) return out;

  try {
    const videos = await youtube.searchVideos(brandName, 25);
    let maxViews = 1;
    for (const v of videos) {
      const views = parseInt(v?.statistics?.viewCount || '0', 10) || 0;
      if (views > maxViews) maxViews = views;
    }
    for (const v of videos) {
      if (!v?.title) continue;
      const views = parseInt(v?.statistics?.viewCount || '0', 10) || 0;
      out.push({
        query: v.title,
        source: 'youtube',
        sourceUrl: v.id ? `https://www.youtube.com/watch?v=${v.id}` : undefined,
        viewCount: views,
        demandSignal: Math.min(1, views / maxViews),
      });
    }
  } catch (err: any) {
    logger.warn?.(`[PromptMiner] YouTube mining failed: ${err?.message || err}`);
  }
  return out;
}

/** Mine, score and persist prompts for a brand from all available real sources. */
export async function mineAndScorePrompts(brandId: string, locale?: string): Promise<MineSummary> {
  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const competitors = await storage.getCompetitorsByBrand(brandId);
  const seeds = [
    `${brand.name} review`,
    `${brand.name} alternatives`,
    competitors[0] ? `${brand.name} vs ${competitors[0].name}` : `best ${brand.industry || 'software'} tools`,
  ];

  const [reddit, serp, youtube] = await Promise.all([
    mineReddit(brand.name),
    mineSerp(brand.name, seeds),
    mineYouTube(brand.name),
  ]);

  const all = [...reddit, ...serp, ...youtube];
  const sources: Record<string, number> = {};
  let totalUpserted = 0;

  for (const c of all) {
    const intent = classifyIntent(c.query);
    const normalizedQuery = normalize(c.query);
    if (!normalizedQuery) continue;
    try {
      await storage.upsertMinedPrompt({
        brandId,
        query: c.query.slice(0, 500),
        normalizedQuery,
        source: c.source,
        intentType: intent,
        sourceUrl: c.sourceUrl || null,
        upvotes: c.upvotes ?? null,
        commentCount: c.commentCount ?? null,
        viewCount: c.viewCount ?? null,
        searchVolume: c.searchVolume ?? null,
        demandSignal: c.demandSignal,
        priorityScore: score(c.demandSignal, intent),
        status: 'new',
        locale: locale || null,
      } as any);
      sources[c.source] = (sources[c.source] || 0) + 1;
      totalUpserted++;
    } catch (err: any) {
      logger.warn?.(`[PromptMiner] upsert failed: ${err?.message || err}`);
    }
  }

  logger.info(`[PromptMiner] brand=${brandId} upserted=${totalUpserted} sources=${JSON.stringify(sources)}`);
  return { brandId, sources, totalUpserted };
}
