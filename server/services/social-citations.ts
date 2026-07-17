// Social citation tracking (Epic G).
// Discovers and tracks brand citations on Reddit and YouTube over time, with a
// lightweight lexicon sentiment estimate. Deduped per (brand, platform, externalId).

import { storage } from '../storage';
import { getIntegrations } from '../integrations';
import { logger } from '../lib/logger';

const POSITIVE = ['love', 'great', 'best', 'awesome', 'recommend', 'excellent', 'amazing', 'good', 'reliable', 'worth', 'fantastic', 'helpful'];
const NEGATIVE = ['hate', 'bad', 'worst', 'terrible', 'avoid', 'scam', 'broken', 'awful', 'disappointing', 'overpriced', 'useless', 'buggy'];

export function estimateSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const t = (text || '').toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE) if (t.includes(w)) pos++;
  for (const w of NEGATIVE) if (t.includes(w)) neg++;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export interface CitationSummary {
  brandId: string;
  reddit: number;
  youtube: number;
  total: number;
}

async function trackReddit(brandId: string, brandName: string): Promise<number> {
  let count = 0;
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(`"${brandName}"`)}&sort=new&limit=50&t=year`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AIRank/1.0 (citation-tracker)' } });
    if (!res.ok) return 0;
    const data = await res.json();
    for (const c of (data?.data?.children || [])) {
      const d = c?.data;
      if (!d?.id) continue;
      const text = `${d.title || ''} ${d.selftext || ''}`;
      await storage.upsertSocialCitation({
        brandId,
        platform: 'reddit',
        externalId: d.id,
        title: d.title || null,
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : null,
        author: d.author || null,
        subredditOrChannel: d.subreddit ? `r/${d.subreddit}` : null,
        snippet: (d.selftext || d.title || '').slice(0, 500),
        sentiment: estimateSentiment(text),
        upvotes: d.ups ?? null,
        commentCount: d.num_comments ?? null,
        publishedAt: d.created_utc ? new Date(d.created_utc * 1000) : null,
      } as any);
      count++;
    }
  } catch (err: any) {
    logger.warn?.(`[Citations] Reddit failed: ${err?.message || err}`);
  }
  return count;
}

async function trackYouTube(brandId: string, brandName: string): Promise<number> {
  let count = 0;
  let youtube: any;
  try {
    youtube = getIntegrations().social?.youtube;
  } catch {
    youtube = undefined;
  }
  if (!youtube) return 0;

  try {
    const videos = await youtube.searchVideos(brandName, 25);
    for (const v of videos) {
      if (!v?.id) continue;
      const text = `${v.title || ''} ${v.description || ''}`;
      await storage.upsertSocialCitation({
        brandId,
        platform: 'youtube',
        externalId: v.id,
        title: v.title || null,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        author: v.channelTitle || null,
        subredditOrChannel: v.channelTitle || null,
        snippet: (v.description || '').slice(0, 500),
        sentiment: estimateSentiment(text),
        viewCount: parseInt(v?.statistics?.viewCount || '0', 10) || null,
        commentCount: parseInt(v?.statistics?.commentCount || '0', 10) || null,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
      } as any);
      count++;
    }
  } catch (err: any) {
    logger.warn?.(`[Citations] YouTube failed: ${err?.message || err}`);
  }
  return count;
}

/** Discover & persist brand citations from Reddit + YouTube. */
export async function trackSocialCitations(brandId: string): Promise<CitationSummary> {
  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const [reddit, youtube] = await Promise.all([
    trackReddit(brandId, brand.name),
    trackYouTube(brandId, brand.name),
  ]);

  logger.info(`[Citations] brand=${brandId} reddit=${reddit} youtube=${youtube}`);
  return { brandId, reddit, youtube, total: reddit + youtube };
}
