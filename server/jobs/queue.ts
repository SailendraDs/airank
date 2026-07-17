// Job queue: in-memory (default for local/dev) or durable pg-boss (production).

import { jobMonitor } from '../services/job-monitor';
import { PgBossQueue } from './pg-boss-queue';

export type JobType =
  | 'brand_enrichment'
  | 'competitor_enrichment'
  | 'topic_generation'
  | 'query_generation'
  | 'llm_sampling'
  | 'serp_sampling'
  | 'citation_extraction'
  | 'visibility_scoring'
  | 'gap_analysis'
  | 'recommendation_generation'
  | 'axp_publish'
  | 'serp_analysis'
  | 'knowledge_graph_analysis'
  | 'social_analytics'
  | 'content_recommendations'
  | 'kg_enrichment'
  // ===== Feature-parity job types (design doc §16.1) =====
  | 'browser_sampling'
  | 'crawler_log_ingest'
  | 'prompt_volume_scoring'
  | 'agent_execution'
  | 'attribution_rollup'
  | 'social_citation_enrich'
  | 'alert_evaluation'
  // ===== Tier S3: Prompt Mining (real Reddit/YouTube/SERP) =====
  | 'prompt_mining'
  // ===== Tier S5: AI Recommendation Share simulator =====
  | 'recommendation_simulation'
  // ===== Tier C: Entity Building & Tracking workers =====
  | 'wikipedia_presence'
  | 'wikidata_claim_extractor'
  | 'identity_accuracy'
  | 'social_presence_scanner'
  | 'entity_consistency'
  | 'topic_entity_association'
  | 'mention_detector'
  | 'co_occurrence_extractor'
  | 'disambiguation_test'
  | 'retrieval_tester'
  | 'community_validation'
  | 'prompt_rewriter'
  | 'people_enricher'
  | 'wikipedia_notability'
  | 'brand_quotability'
  | 'schema_org_crawler';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobPayload {
  brandId: string;
  [key: string]: any;
}

export interface QueuedJob {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: JobPayload;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export type JobHandler = (job: QueuedJob) => Promise<any>;

export class JobQueue {
  private jobs: Map<string, QueuedJob> = new Map();
  private handlers: Map<JobType, JobHandler> = new Map();
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;

  constructor() {
    // Start processing jobs every 5 seconds
    this.startProcessing();
  }

  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    // Wrap handler to record job events
    const originalHandler = handler;
    this.handlers.set(type, async (job: QueuedJob) => {
      await jobMonitor.recordJobStart(job.id, job.type, job.payload);
      try {
        const result = await originalHandler(job);
        await jobMonitor.recordJobCompletion(job.id, result);
        return result;
      } catch (err: any) {
        await jobMonitor.recordJobFailure(job.id, err.message, err.stack);
        throw err;
      }
    });
  }

  async addJob(
    type: JobType,
    payload: JobPayload,
    priority: number = 5,
    maxAttempts: number = 3
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: QueuedJob = {
      id: jobId,
      type,
      status: 'pending',
      payload,
      priority,
      attempts: 0,
      maxAttempts,
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    console.log(`[JobQueue] Added job ${jobId} (${type}) with priority ${priority}`);
    
    return jobId;
  }

  async getJob(jobId: string): Promise<QueuedJob | undefined> {
    return this.jobs.get(jobId);
  }

  async getJobsByStatus(status: JobStatus): Promise<QueuedJob[]> {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  async getJobsByBrand(brandId: string): Promise<QueuedJob[]> {
    return Array.from(this.jobs.values()).filter(job => job.payload.brandId === brandId);
  }

  private async processNextJob(): Promise<void> {
    // Get pending jobs sorted by priority (higher first)
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending')
      .sort((a, b) => b.priority - a.priority);

    if (pendingJobs.length === 0) {
      return;
    }

    const job = pendingJobs[0];
    const handler = this.handlers.get(job.type);

    if (!handler) {
      console.error(`[JobQueue] No handler registered for job type: ${job.type}`);
      job.status = 'failed';
      job.error = `No handler registered for job type: ${job.type}`;
      return;
    }

    // Mark job as running
    job.status = 'running';
    job.startedAt = new Date();
    job.attempts++;

    console.log(`[JobQueue] Processing job ${job.id} (${job.type}) - Attempt ${job.attempts}/${job.maxAttempts}`);

    try {
      const result = await handler(job);
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      console.log(`[JobQueue] Job ${job.id} completed successfully`);
    } catch (error: any) {
      console.error(`[JobQueue] Job ${job.id} failed:`, error.message);
      
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();
      } else {
        // Retry
        job.status = 'pending';
        console.log(`[JobQueue] Job ${job.id} will be retried (${job.attempts}/${job.maxAttempts})`);
      }
    }
  }

  private startProcessing(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        this.isProcessing = true;
        try {
          await this.processNextJob();
        } finally {
          this.isProcessing = false;
        }
      }
    }, 5000); // Process every 5 seconds

    console.log('[JobQueue] Started processing jobs');
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      console.log('[JobQueue] Stopped processing jobs');
    }
  }

  async clearCompletedJobs(olderThanHours: number = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let cleared = 0;

    const entries = Array.from(this.jobs.entries());
    for (const [id, job] of entries) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt < cutoff
      ) {
        this.jobs.delete(id);
        cleared++;
      }
    }

    console.log(`[JobQueue] Cleared ${cleared} old jobs`);
    return cleared;
  }

  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
    };
  }
}

/**
 * Shared queue surface implemented by both the in-memory queue and the durable
 * pg-boss queue, so call sites are backend-agnostic.
 */
export interface IJobQueue {
  registerHandler(type: JobType, handler: JobHandler): void;
  addJob(type: JobType, payload: JobPayload, priority?: number, maxAttempts?: number): Promise<string>;
  getJob(jobId: string): Promise<QueuedJob | undefined>;
  getJobsByStatus(status: JobStatus): Promise<QueuedJob[]>;
  getJobsByBrand(brandId: string): Promise<QueuedJob[]>;
  clearCompletedJobs(olderThanHours?: number): Promise<number>;
  getStats(): { total: number; pending: number; running: number; completed: number; failed: number };
  stopProcessing(): void | Promise<void>;
}

// Singleton instance
let queueInstance: IJobQueue | null = null;

export function getJobQueue(): IJobQueue {
  if (!queueInstance) {
    const useDurable = !!process.env.DATABASE_URL && process.env.JOB_QUEUE !== 'memory';
    if (useDurable) {
      try {
        queueInstance = new PgBossQueue();
        console.log('[JobQueue] Using durable pg-boss queue');
      } catch (err: any) {
        console.error('[JobQueue] pg-boss init failed, falling back to in-memory:', err?.message || err);
        queueInstance = new JobQueue();
      }
    } else {
      queueInstance = new JobQueue();
    }
  }
  return queueInstance;
}
