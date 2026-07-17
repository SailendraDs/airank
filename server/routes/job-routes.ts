// server/routes/job-routes.ts
// Admin job monitoring API endpoints

import { Router } from 'express';
import { jobMonitor } from '../services/job-monitor';
import { triggerManualFix, runAIFix } from '../services/ai-fix-agent';
import { getJobQueue } from '../jobs/queue';
import { logAudit } from '../lib/logger';

export function registerJobRoutes(app: Router): void {
  // ============= GET /api/admin/jobs =============

  app.get('/api/admin/jobs', async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        type: req.query.type as string,
        brandId: req.query.brand_id as string,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
      };

      const result = await jobMonitor.getJobs(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= GET /api/admin/jobs/stats =============

  app.get('/api/admin/jobs/stats', async (req, res) => {
    try {
      const result = await jobMonitor.getJobs({});
      res.json(result.stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= GET /api/admin/jobs/:id =============

  app.get('/api/admin/jobs/:id', async (req, res) => {
    try {
      const job = await jobMonitor.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= POST /api/admin/jobs/:id/retry =============

  app.post('/api/admin/jobs/:id/retry', async (req, res) => {
    try {
      const job = await jobMonitor.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Re-queue the job
      const queue = getJobQueue();
      const newJobId = await queue.addJob(
        job.type as any,
        job.payload as any,
        5,
        3
      );

      await jobMonitor.recordJobRetry(newJobId);
      await logAudit((req.user as any)?.id || 'system', 'job_retry', { jobId: req.params.id, newJobId });

      res.json({ jobId: newJobId, message: 'Job re-queued' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= POST /api/admin/jobs/:id/fix =============

  app.post('/api/admin/jobs/:id/fix', async (req, res) => {
    try {
      const job = await jobMonitor.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const config = await jobMonitor.getAIFixConfig();
      if (!config.enabled) {
        return res.status(400).json({ message: 'AI Fix is not enabled. Enable it in Settings.' });
      }

      const result = await runAIFix(job, config);
      await logAudit((req.user as any)?.id || 'system', 'job_ai_fix', { jobId: req.params.id, result });

      res.json({
        jobId: req.params.id,
        status: result.fixed ? 'fixed' : 'failed',
        result: result.message,
        changes: result.changes,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= PUT /api/admin/jobs/rules =============

  app.put('/api/admin/jobs/rules', async (req, res) => {
    try {
      const { jobType, ...updates } = req.body;
      if (!jobType) {
        return res.status(400).json({ message: 'jobType is required' });
      }

      await jobMonitor.updateFixRule(jobType, updates);
      await logAudit((req.user as any)?.id || 'system', 'fix_rule_update', { jobType, updates });

      res.json({ message: 'Fix rule updated' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= GET /api/admin/ai-fix/config =============

  app.get('/api/admin/ai-fix/config', async (req, res) => {
    try {
      const config = await jobMonitor.getAIFixConfig();
      // Mask API key
      if (config.apiKey) {
        config.apiKey = '••••••••' + config.apiKey.slice(-4);
      }
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= PUT /api/admin/ai-fix/config =============

  app.put('/api/admin/ai-fix/config', async (req, res) => {
    try {
      const config = req.body;
      await jobMonitor.updateAIFixConfig(config);
      await logAudit((req.user as any)?.id || 'system', 'ai_fix_config_update', { config: { ...config, apiKey: '[REDACTED]' } });

      res.json({ message: 'AI Fix config updated' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= GET /api/admin/jobs/failed-count =============

  app.get('/api/admin/jobs/failed-count', async (req, res) => {
    try {
      const count = await jobMonitor.getFailedCount();
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ============= GET /api/admin/jobs/rules =============

  app.get('/api/admin/jobs/rules', async (req, res) => {
    try {
      const rules = await jobMonitor.getFixRules();
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}