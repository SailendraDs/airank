// server/services/job-monitor.ts
// Job history service with fix rule engine

import { storage } from '../storage';
import { sql } from 'drizzle-orm';

export interface JobHistoryEntry {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'fixed';
  brandId: string | null;
  payload: Record<string, any>;
  result: Record<string, any> | null;
  errorMessage: string | null;
  errorTrace: string | null;
  attempts: number;
  fixedBy: string | null;
  fixedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface JobFixRule {
  jobType: string;
  autoFix: boolean;
  fixMethod: 'cli' | 'api';
  notifyEmail: boolean;
  priority: number;
}

export interface AIFixConfig {
  enabled: boolean;
  fixMethod: 'cli' | 'api';
  cliPath: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMinutes: number;
}

export interface JobStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  successRate: number;
}

interface DbRow {
  [key: string]: unknown;
}

function rowToJobHistoryEntry(row: DbRow): JobHistoryEntry {
  return {
    id: row.id as string,
    type: row.type as string,
    status: row.status as JobHistoryEntry['status'],
    brandId: row.brand_id as string | null,
    payload: row.payload as Record<string, any>,
    result: row.result as Record<string, any> | null,
    errorMessage: row.error_message as string | null,
    errorTrace: row.error_trace as string | null,
    attempts: row.attempts as number,
    fixedBy: row.fixed_by as string | null,
    fixedAt: row.fixed_at as Date | null,
    createdAt: row.created_at as Date,
    completedAt: row.completed_at as Date | null,
  };
}

class JobMonitorService {
  private memoryJobs: Map<string, JobHistoryEntry> = new Map();
  private maxMemoryJobs = 1000;

  // ============= RECORD JOB EVENTS =============

  async recordJobStart(jobId: string, type: string, payload: Record<string, any>): Promise<void> {
    const entry: JobHistoryEntry = {
      id: jobId,
      type,
      status: 'running',
      brandId: payload.brandId || null,
      payload,
      result: null,
      errorMessage: null,
      errorTrace: null,
      attempts: 1,
      fixedBy: null,
      fixedAt: null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.memoryJobs.set(jobId, entry);
  }

  async recordJobCompletion(jobId: string, result: Record<string, any>): Promise<void> {
    const entry = this.memoryJobs.get(jobId);
    if (entry) {
      entry.status = 'completed';
      entry.result = result;
      entry.completedAt = new Date();
      await this.persistJob(entry);
    }
  }

  async recordJobFailure(jobId: string, error: string, trace?: string): Promise<void> {
    const entry = this.memoryJobs.get(jobId);
    if (entry) {
      entry.status = 'failed';
      entry.errorMessage = error;
      entry.errorTrace = trace || null;
      entry.completedAt = new Date();
      await this.persistJob(entry);

      // Check if auto-fix should trigger
      await this.checkAutoFix(entry);
    }
  }

  async recordJobRetry(jobId: string): Promise<void> {
    const entry = this.memoryJobs.get(jobId);
    if (entry) {
      entry.attempts++;
      entry.status = 'pending';
      entry.errorMessage = null;
      entry.errorTrace = null;
      entry.completedAt = null;
    }
  }

  async recordAIFix(jobId: string, fixedBy: string): Promise<void> {
    const entry = this.memoryJobs.get(jobId);
    if (entry) {
      entry.status = 'fixed';
      entry.fixedBy = fixedBy;
      entry.fixedAt = new Date();
      await this.persistJob(entry);
    }
  }

  // ============= PERSIST & RETRIEVE =============

  private async persistJob(entry: JobHistoryEntry): Promise<void> {
    try {
      await storage.db.execute(sql`
        INSERT INTO job_history (id, type, status, brand_id, payload, result, error_message, error_trace, attempts, fixed_by, fixed_at, created_at, completed_at)
        VALUES (${entry.id}, ${entry.type}, ${entry.status}, ${entry.brandId}, ${JSON.stringify(entry.payload)}, ${entry.result ? JSON.stringify(entry.result) : null}, ${entry.errorMessage}, ${entry.errorTrace}, ${entry.attempts}, ${entry.fixedBy}, ${entry.fixedAt}, ${entry.createdAt}, ${entry.completedAt})
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          result = EXCLUDED.result,
          error_message = EXCLUDED.error_message,
          error_trace = EXCLUDED.error_trace,
          attempts = EXCLUDED.attempts,
          fixed_by = EXCLUDED.fixed_by,
          fixed_at = EXCLUDED.fixed_at,
          completed_at = EXCLUDED.completed_at
      `);

      // Clean up memory if over limit
      if (this.memoryJobs.size > this.maxMemoryJobs) {
        const oldestKey = this.memoryJobs.keys().next().value;
        if (oldestKey) this.memoryJobs.delete(oldestKey);
      }
    } catch (err) {
      console.error('[JobMonitor] persistJob failed:', err);
    }
  }

  async getJobs(filters: {
    status?: string;
    type?: string;
    brandId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: JobHistoryEntry[]; stats: JobStats }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let whereClause = sql`1=1`;
    if (filters.status) {
      whereClause = sql`${whereClause} AND status = ${filters.status}`;
    }
    if (filters.type) {
      whereClause = sql`${whereClause} AND type = ${filters.type}`;
    }
    if (filters.brandId) {
      whereClause = sql`${whereClause} AND brand_id = ${filters.brandId}`;
    }

    const jobsResult = await storage.db.execute(sql`
      SELECT * FROM job_history WHERE ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `);

    const jobs: JobHistoryEntry[] = (jobsResult.rows || []).map((row) =>
      rowToJobHistoryEntry(row as DbRow)
    );

    const statsResult = await storage.db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM job_history WHERE ${whereClause}
    `);

    const row = (statsResult.rows?.[0] || {}) as Record<string, unknown>;
    const stats: JobStats = {
      total: Number(row.total) || 0,
      pending: Number(row.pending) || 0,
      running: Number(row.running) || 0,
      completed: Number(row.completed) || 0,
      failed: Number(row.failed) || 0,
      successRate: 0,
    };

    if (stats.total > 0) {
      stats.successRate = Math.round((stats.completed / stats.total) * 100);
    }

    return { jobs, stats };
  }

  async getJob(jobId: string): Promise<JobHistoryEntry | null> {
    // Check memory first
    if (this.memoryJobs.has(jobId)) {
      return this.memoryJobs.get(jobId)!;
    }

    // Fall back to DB
    const result = await storage.db.execute(sql`SELECT * FROM job_history WHERE id = ${jobId}`);

    if (result.rows?.length) {
      return rowToJobHistoryEntry(result.rows[0] as DbRow);
    }

    return null;
  }

  // ============= FIX RULES =============

  async getFixRules(): Promise<JobFixRule[]> {
    const result = await storage.db.execute(sql`SELECT * FROM job_fix_rules ORDER BY priority DESC`);
    return (result.rows || []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        jobType: r.job_type as string,
        autoFix: r.auto_fix as boolean,
        fixMethod: r.fix_method as 'cli' | 'api',
        notifyEmail: r.notify_email as boolean,
        priority: r.priority as number,
      };
    });
  }

  async getFixRule(jobType: string): Promise<JobFixRule | null> {
    const result = await storage.db.execute(sql`SELECT * FROM job_fix_rules WHERE job_type = ${jobType}`);
    if (result.rows?.length) {
      const r = result.rows[0] as Record<string, unknown>;
      return {
        jobType: r.job_type as string,
        autoFix: r.auto_fix as boolean,
        fixMethod: r.fix_method as 'cli' | 'api',
        notifyEmail: r.notify_email as boolean,
        priority: r.priority as number,
      };
    }
    return null;
  }

  async updateFixRule(jobType: string, updates: Partial<JobFixRule>): Promise<void> {
    const sets: (string | ReturnType<typeof sql>)[] = [];
    const args: unknown[] = [];

    if (updates.autoFix !== undefined) {
      sets.push('auto_fix = ?');
      args.push(updates.autoFix);
    }
    if (updates.fixMethod !== undefined) {
      sets.push('fix_method = ?');
      args.push(updates.fixMethod);
    }
    if (updates.notifyEmail !== undefined) {
      sets.push('notify_email = ?');
      args.push(updates.notifyEmail);
    }
    if (updates.priority !== undefined) {
      sets.push('priority = ?');
      args.push(updates.priority);
    }

    sets.push('updated_at = NOW()');
    args.push(jobType);

    await storage.db.execute(sql`UPDATE job_fix_rules SET ${sql.raw(sets.join(', '))} WHERE job_type = ${jobType}`);
  }

  // ============= AI FIX CONFIG =============

  async getAIFixConfig(): Promise<AIFixConfig> {
    const result = await storage.db.execute(sql`SELECT * FROM ai_fix_config WHERE id = 1`);
    if (result.rows?.length) {
      const r = result.rows[0] as Record<string, unknown>;
      return {
        enabled: r.enabled as boolean,
        fixMethod: r.fix_method as 'cli' | 'api',
        cliPath: r.cli_path as string,
        apiUrl: r.api_url as string,
        apiKey: (r.api_key as string) || '',
        model: r.model as string,
        timeoutMinutes: r.timeout_minutes as number,
      };
    }
    return {
      enabled: false,
      fixMethod: 'api',
      cliPath: '/usr/local/bin/claude',
      apiUrl: 'https://api.anthropic.com',
      apiKey: '',
      model: 'claude-opus-4.6',
      timeoutMinutes: 5,
    };
  }

  async updateAIFixConfig(config: Partial<AIFixConfig>): Promise<void> {
    const sets: (string | ReturnType<typeof sql>)[] = ['updated_at = NOW()'];
    const args: unknown[] = [];

    if (config.enabled !== undefined) {
      sets.push('enabled = ?');
      args.push(config.enabled);
    }
    if (config.fixMethod !== undefined) {
      sets.push('fix_method = ?');
      args.push(config.fixMethod);
    }
    if (config.cliPath !== undefined) {
      sets.push('cli_path = ?');
      args.push(config.cliPath);
    }
    if (config.apiUrl !== undefined) {
      sets.push('api_url = ?');
      args.push(config.apiUrl);
    }
    if (config.apiKey !== undefined) {
      sets.push('api_key = ?');
      args.push(config.apiKey);
    }
    if (config.model !== undefined) {
      sets.push('model = ?');
      args.push(config.model);
    }
    if (config.timeoutMinutes !== undefined) {
      sets.push('timeout_minutes = ?');
      args.push(config.timeoutMinutes);
    }

    await storage.db.execute(sql`UPDATE ai_fix_config SET ${sql.raw(sets.join(', '))} WHERE id = 1`);
  }

  // ============= AUTO-FIX CHECK =============

  private async checkAutoFix(job: JobHistoryEntry): Promise<void> {
    const config = await this.getAIFixConfig();
    if (!config.enabled) return;

    const rule = await this.getFixRule(job.type);
    if (!rule?.autoFix) return;

    // Trigger AI fix
    const { runAIFix } = await import('./ai-fix-agent');
    try {
      await runAIFix(job, config);

      if (rule.notifyEmail) {
        await this.sendFixNotification(job, 'success');
      }
    } catch (err) {
      console.error('[JobMonitor] Auto-fix failed:', err);
      await this.sendFixNotification(job, 'failed');
    }
  }

  private async sendFixNotification(job: JobHistoryEntry, status: 'success' | 'failed'): Promise<void> {
    // TODO: Send email notification
    console.log(`[JobMonitor] Fix notification: job=${job.id} status=${status}`);
  }

  // ============= GET FAILED COUNT (for nav badge) =============

  async getFailedCount(): Promise<number> {
    const result = await storage.db.execute(sql`SELECT COUNT(*) as count FROM job_history WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'`);
    return Number((result.rows?.[0] as Record<string, unknown>)?.count || 0);
  }
}

const jobMonitor = new JobMonitorService();
export { jobMonitor };