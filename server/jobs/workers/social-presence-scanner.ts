// Social Presence Scanner Worker
//
// Scans for a brand's social media accounts across 14 platforms:
// linkedin, x (twitter), youtube, instagram, medium, github, reddit,
// producthunt, g2, capterra, trustpilot, stackoverflow, hackernews, substack
//
// Uses search APIs where available, manual URL patterns otherwise.
// For each found account, extracts: handle, url, follower count, verified status.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface SocialPresenceScannerPayload {
  brandId: string;
  /** Platforms to scan. Default: all 14. */
  platforms?: string[];
}

const PLATFORMS = [
  'linkedin',
  'x',
  'youtube',
  'instagram',
  'medium',
  'github',
  'reddit',
  'producthunt',
  'g2',
  'capterra',
  'trustpilot',
  'stackoverflow',
  'hackernews',
  'substack',
];

// Platform-specific search patterns { platform: query template }
const SEARCH_TEMPLATES = {
  linkedin: (name: string) => `site:linkedin.com/company "${name}"`,
  x: (name: string) => `${name} (@${name.toLowerCase().replace(/\s/g, '')}) site:twitter.com`,
  youtube: (name: string) => `site:youtube.com "${name}"`,
  instagram: (name: string) => `site:instagram.com "${name}"`,
  medium: (name: string) => `site:medium.com "${name}"`,
  github: (name: string) => `site:github.com/${name.toLowerCase().replace(/\s/g, '')}`,
  reddit: (name: string) => `site:reddit.com/r/${name.toLowerCase().replace(/\s/g, '')}`,
  producthunt: (name: string) => `site:producthunt.com "${name}"`,
  g2: (name: string) => `site:g2.com "${name}"`,
  capterra: (name: string) => `site:capterra.com "${name}"`,
  trustpilot: (name: string) => `site:trustpilot.com "${name}"`,
  stackoverflow: (name: string) => `site:stackoverflow.com "${name}"`,
  hackernews: (name: string) => `site:news.ycombinator.com "${name}"`,
  substack: (name: string) => `${name} site:substack.com`,
};

// Stub implementations since we don't have live SERP access in workers
async function searchPlatform(platform: string, searchQ: string): Promise<{ handle: string; url: string; followers: number } | null> {
  // In production, this would call a SERP API (SerpApi, BrightData, etc.)
  // For now, stub return indicating "not found"
  // TODO: integrate with serp-sampling or external SERP API
  return null;
}

function guessHandle(brandName: string, platform: string): string {
  const base = brandName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return base;
}

export async function socialPresenceScannerWorker(job: QueuedJob): Promise<{ brandId: string; scanned: number; found: number }> {
  const { brandId, platforms = PLATFORMS } = job.payload;
  const log = logger.child({ worker: 'social_presence_scanner', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);
  const name = brand.name;

  let found = 0;
  for (const platform of platforms) {
    const template = SEARCH_TEMPLATES[platform as keyof typeof SEARCH_TEMPLATES];
    if (!template) continue;
    const searchQ = template(name);
    const result = await searchPlatform(platform, searchQ);
    const handle = result?.handle || guessHandle(name, platform);

    const socialPresence = await storage.upsertEntitySocialPresence({
      brandId,
      platform: platform as any,
      handle,
      url: result?.url || `https://${platform === 'x' ? 'twitter.com' : platform}.com/${handle}`,
      verified: !!result,
      authorityScore: result?.followers ? Math.min(25, Math.floor(Math.log10(result.followers))) : 0,
      postsLast30d: 0,
      followers: result?.followers || 0,
      lastChecked: new Date(),
    });
    if (result) found++;
    log.debug('Platform checked', { platform, handle, found: !!result });
  }

  log.info('Social presence scan complete', { scanned: platforms.length, found });
  return { brandId, scanned: platforms.length, found };
}
