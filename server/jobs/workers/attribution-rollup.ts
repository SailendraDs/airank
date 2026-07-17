// Attribution Rollup Worker (Epic E)
// Periodically computes and persists a real GA4/GSC attribution snapshot for a brand.

import type { QueuedJob } from '../queue';
import { computeAttribution } from '../../services/attribution';
import { logger } from '../../lib/logger';

export interface AttributionRollupPayload {
  brandId: string;
  periodDays?: number;
}

export async function attributionRollupWorker(job: QueuedJob): Promise<{ brandId: string; dataComplete: boolean; sessions: number; conversions: number; revenue: number }> {
  const { brandId, periodDays = 30 } = job.payload as AttributionRollupPayload;
  const result = await computeAttribution(brandId, periodDays, true);
  logger.info(`[AttributionRollup] brand=${brandId} source=${result.source} sessions=${result.aiReferralSessions} conversions=${result.aiReferralConversions} revenue=${result.aiAttributedRevenue}`);
  return {
    brandId,
    dataComplete: result.dataComplete,
    sessions: result.aiReferralSessions,
    conversions: result.aiReferralConversions,
    revenue: result.aiAttributedRevenue,
  };
}
