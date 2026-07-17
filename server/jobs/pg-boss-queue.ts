// Durable, Postgres-backed job queue using pg-boss (design §18.6).
// Implements the same public surface as the in-memory JobQueue so call sites
// (workers/index.ts, routes.ts, jobs/index.ts) need no changes. Introspection
// methods (getJob/getJobsByBrand/getStats) are backed by the job_history table
// via jobMonitor, which the worker wrapper already populates.

import { PgBoss } from 'pg-boss';
import { jobMonitor } from '../services/job-monitor';
import type { JobType, JobPayload, QueuedJob, JobHandler, JobStatus } from './queue';

interface CachedStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

function toQueuedJob(entry: any): QueuedJob {
  return {
    id: entry.id,
    type: entry.type,
    status: (entry.status === 'fixed' ? 'completed' : entry.status) as JobStatus,
    payload: entry.payload || { brandId: entry.brandId },
    priority: 5,
    attempts: entry.attempts ?? 1,
    maxAttempts: 3,
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
    startedAt: entry.createdAt ? new Date(entry.createdAt) : undefined,
    completedAt: entry.completedAt ? new Date(entry.completedAt) : undefined,
    error: entry.errorMessage || undefined,
    result: entry.result || undefined,
  };
}

export class PgBossQueue {
  private boss: PgBoss;
  private ready: Promise<void>;
  private isReady = false;
  private handlers = new Map<JobType, JobHandler>();
  private pendingSends: Array<{
    type: JobType; payload: JobPayload; priority: number; maxAttempts: number; resolve: (id: string) => void;
  }> = [];
  private stats: CachedStats = { total: 0, pending: 0, running: 0, completed: 0, failed: 0 };
  private statsTimer?: NodeJS.Timeout;

  constructor() {
    this.boss = new PgBoss({ connectionString: process.env.DATABASE_URL as string });
    this.boss.on('error', (err: any) => console.error('[PgBoss] error:', err?.message || err));
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.boss.start();
    this.isReady = true;

    for (const [type, handler] of Array.from(this.handlers.entries())) {
      await this.ensureWorker(type, handler);
    }

    for (const p of this.pendingSends) {
      try {
        const id = await this.boss.send(p.type, p.payload, { priority: p.priority, retryLimit: Math.max(0, p.maxAttempts - 1) });
        p.resolve(id ?? '');
      } catch (err: any) {
        console.error('[PgBoss] flush send failed:', err?.message || err);
        p.resolve('');
      }
    }
    this.pendingSends = [];

    await this.refreshStats();
    this.statsTimer = setInterval(() => { void this.refreshStats(); }, 5000);
    console.log('[PgBoss] Durable job queue started');
  }

  private async refreshStats(): Promise<void> {
    try {
      const { stats } = await jobMonitor.getJobs({ limit: 1 });
      this.stats = {
        total: stats.total,
        pending: stats.pending,
        running: stats.running,
        completed: stats.completed,
        failed: stats.failed,
      };
    } catch {
      // keep last snapshot
    }
  }

  private async ensureWorker(type: JobType, handler: JobHandler): Promise<void> {
    try {
      await this.boss.createQueue(type);
    } catch {
      // queue may already exist
    }
    await this.boss.work(type, async (jobs: any) => {
      const list = Array.isArray(jobs) ? jobs : [jobs];
      const results: any[] = [];
      for (const job of list) {
        const queued: QueuedJob = {
          id: job.id,
          type,
          status: 'running',
          payload: job.data,
          priority: job.priority ?? 5,
          attempts: 1,
          maxAttempts: 3,
          createdAt: new Date(),
          startedAt: new Date(),
        };
        await jobMonitor.recordJobStart(job.id, type, job.data);
        try {
          const result = await handler(queued);
          await jobMonitor.recordJobCompletion(job.id, result);
          results.push(result);
        } catch (err: any) {
          await jobMonitor.recordJobFailure(job.id, err?.message || String(err), err?.stack);
          throw err; // let pg-boss handle retry/backoff
        }
      }
      return results;
    });
  }

  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    if (this.isReady) {
      this.ensureWorker(type, handler).catch((err) =>
        console.error(`[PgBoss] Failed to register worker for ${type}:`, err?.message || err),
      );
    }
  }

  async addJob(type: JobType, payload: JobPayload, priority = 5, maxAttempts = 3): Promise<string> {
    if (!this.isReady) {
      return new Promise<string>((resolve) => {
        this.pendingSends.push({ type, payload, priority, maxAttempts, resolve });
      });
    }
    try {
      const id = await this.boss.send(type, payload, { priority, retryLimit: Math.max(0, maxAttempts - 1) });
      return id ?? '';
    } catch (err: any) {
      console.error(`[PgBoss] addJob(${type}) failed:`, err?.message || err);
      throw err;
    }
  }

  async getJob(jobId: string): Promise<QueuedJob | undefined> {
    const entry = await jobMonitor.getJob(jobId);
    return entry ? toQueuedJob(entry) : undefined;
  }

  async getJobsByStatus(status: JobStatus): Promise<QueuedJob[]> {
    const { jobs } = await jobMonitor.getJobs({ status, limit: 200 });
    return jobs.map(toQueuedJob);
  }

  async getJobsByBrand(brandId: string): Promise<QueuedJob[]> {
    const { jobs } = await jobMonitor.getJobs({ brandId, limit: 200 });
    return jobs.map(toQueuedJob);
  }

  async clearCompletedJobs(_olderThanHours = 24): Promise<number> {
    // pg-boss performs its own archival/maintenance; nothing to do here.
    return 0;
  }

  getStats(): CachedStats {
    return { ...this.stats };
  }

  async stopProcessing(): Promise<void> {
    if (this.statsTimer) clearInterval(this.statsTimer);
    try {
      await this.boss.stop({ graceful: true });
    } catch {
      // ignore
    }
  }
}
