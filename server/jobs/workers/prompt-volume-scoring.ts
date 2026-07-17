// Prompt Volume Scoring Worker (Epic C2)
// Scores prompt volumes for a brand and optionally rebuilds the aggregate dataset.

import type { QueuedJob } from '../queue';
import { scorePromptVolumes, rebuildAggregateDataset } from '../../services/prompt-volume';

export interface PromptVolumeScoringPayload {
  brandId?: string;
  rebuildAggregate?: boolean;
  region?: string;
}

export async function promptVolumeScoringWorker(job: QueuedJob): Promise<any> {
  const { brandId, rebuildAggregate, region } = job.payload as unknown as PromptVolumeScoringPayload;
  const result: any = {};
  if (brandId) result.scoring = await scorePromptVolumes(brandId);
  if (rebuildAggregate) result.aggregate = await rebuildAggregateDataset(region || 'IN');
  return result;
}
