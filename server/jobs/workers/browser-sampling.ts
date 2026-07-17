// Browser Sampling Worker (Epic A)
// Runs self-managed browser sampling for a brand's top-N prompts.

import type { QueuedJob } from '../queue';
import { sampleTopPrompts } from '../../services/browser-sampler';

export interface BrowserSamplingPayload {
  brandId: string;
  topN?: number;
}

export async function browserSamplingWorker(job: QueuedJob): Promise<{ brandId: string; sampled: number; status: string }> {
  const { brandId, topN } = job.payload as unknown as BrowserSamplingPayload;
  const { samples, status } = await sampleTopPrompts(brandId, topN ?? 5);
  return { brandId, sampled: samples.length, status };
}
