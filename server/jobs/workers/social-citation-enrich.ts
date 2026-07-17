// Social Citation Enrich Worker (Epic G)
// Discovers and refreshes brand citations on Reddit and YouTube.

import type { QueuedJob } from '../queue';
import { trackSocialCitations } from '../../services/social-citations';

export interface SocialCitationEnrichPayload {
  brandId: string;
}

export async function socialCitationEnrichWorker(job: QueuedJob): Promise<{ brandId: string; reddit: number; youtube: number; total: number }> {
  const { brandId } = job.payload as unknown as SocialCitationEnrichPayload;
  return await trackSocialCitations(brandId);
}
