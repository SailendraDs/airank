// Monitoring Dashboard Service - Real-time metrics and health checks
// Phase 4.6: Monitoring Dashboard

import { getQueryCache } from './query-cache';
import { getJobRetryService } from './job-retry';
import { getRateLimitService } from './rate-limiter';
import { getErrorTracker } from './error-tracker';
import { getDatabasePoolManager } from './db-pool';
import { storage } from '../storage';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  version: string;
  components: Record<string, { status: string; latencyMs: number; message?: string }>;
}

export interface MetricsData {
  timestamp: number;
  requests: {
    total: number;
    success: number;
    errors: number;
    avgLatencyMs: number;
  };
  database: {
    connections: number;
    avgQueryTimeMs: number;
    slowQueries: number;
  };
  cache: {
    hitRate: number;
    size: number;
    hits: number;
    misses: number;
  };
  jobs: {
    active: number;
    queued: number;
    failed: number;
    avgDurationMs: number;
  };
  errors: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  rateLimits: {
    activeKeys: number;
    blockedRequests: number;
  };
}

export class MonitoringDashboard {
  private startTime = Date.now();
  private metricsHistory: MetricsData[] = [];
  private maxHistoryLength = 60; // Keep last 60 data points

  constructor() {
    // Start periodic health checks
    setInterval(() => this.performHealthCheck(), 30000);
  }

  /**
   * Get current system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const components: SystemHealth['components'] = {};

    // Check database
    try {
      const dbStart = Date.now();
      await storage.getSystemSetting('_health_check');
      components.database = {
        status: 'healthy',
        latencyMs: Date.now() - dbStart,
      };
    } catch (e) {
      components.database = {
        status: 'critical',
        latencyMs: -1,
        message: String(e),
      };
    }

    // Check cache
    const cache = getQueryCache().getStats();
    components.cache = {
      status: cache.size > 10000 ? 'degraded' : 'healthy',
      latencyMs: 0,
    };

    // Check error tracker
    const errors = getErrorTracker().getStats();
    const criticalErrors = errors.bySeverity.critical;
    components.errors = {
      status: criticalErrors > 5 ? 'critical' : criticalErrors > 0 ? 'degraded' : 'healthy',
      latencyMs: 0,
    };

    // Check job retry service
    const retryStats = getJobRetryService().getStats();
    components.jobs = {
      status: retryStats.circuitsOpen > 0 ? 'degraded' : 'healthy',
      latencyMs: 0,
    };

    // Check rate limiter
    const rateStats = getRateLimitService().getStats();
    components.rateLimits = {
      status: 'healthy',
      latencyMs: 0,
    };

    // Determine overall status
    const statuses = Object.values(components).map(c => c.status);
    let overallStatus: SystemHealth['status'] = 'healthy';

    if (statuses.includes('critical')) {
      overallStatus = 'critical';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      components,
    };
  }

  /**
   * Get current metrics snapshot
   */
  async getMetrics(): Promise<MetricsData> {
    const cacheStats = getQueryCache().getStats();
    const errorStats = getErrorTracker().getStats();
    const retryStats = getJobRetryService().getStats();
    const rateStats = getRateLimitService().getStats();
    const dbStats = getDatabasePoolManager().getStats();

    const metrics: MetricsData = {
      timestamp: Date.now(),
      requests: {
        total: rateStats.totalRequests,
        success: rateStats.totalRequests - errorStats.totalErrors,
        errors: errorStats.totalErrors,
        avgLatencyMs: 0,
      },
      database: {
        connections: dbStats.totalConnections,
        avgQueryTimeMs: 0,
        slowQueries: 0,
      },
      cache: {
        hitRate: cacheStats.hitRate,
        size: cacheStats.size,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
      },
      jobs: {
        active: retryStats.activeRetries,
        queued: retryStats.pendingJobs,
        failed: errorStats.byCategory.job,
        avgDurationMs: 0,
      },
      errors: {
        total: errorStats.totalErrors,
        critical: errorStats.bySeverity.critical,
        high: errorStats.bySeverity.high,
        medium: errorStats.bySeverity.medium,
        low: errorStats.bySeverity.low,
      },
      rateLimits: {
        activeKeys: rateStats.activeKeys,
        blockedRequests: 0,
      },
    };

    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistoryLength) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  /**
   * Get metrics history for charts
   */
  getMetricsHistory(points = 30): MetricsData[] {
    return this.metricsHistory.slice(-points);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50) {
    return getErrorTracker().getRecent(limit);
  }

  /**
   * Get job retry status
   */
  getJobRetryStatus() {
    const service = getJobRetryService();
    return {
      stats: service.getStats(),
      dueRetries: service.getDueRetries().length,
    };
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    const service = getRateLimitService();
    return {
      stats: service.getStats(),
    };
  }

  /**
   * Perform health check and log issues
   */
  private async performHealthCheck(): Promise<void> {
    const health = await this.getSystemHealth();

    if (health.status === 'critical') {
      await getErrorTracker().track(
        'critical',
        'system',
        `System health check failed: ${health.status}`,
        { metadata: { components: health.components } }
      );
    }

    // Store health status for dashboard display
    await storage.setSystemSetting(
      '_system_health',
      JSON.stringify({
        ...health,
        checkedAt: new Date().toISOString(),
      })
    );
  }

  /**
   * Get dashboard summary for admin panel
   */
  async getDashboardSummary() {
    const [health, metrics] = await Promise.all([
      this.getSystemHealth(),
      this.getMetrics(),
    ]);

    return {
      health,
      metrics,
      recentErrors: this.getRecentErrors(10),
      jobStatus: this.getJobRetryStatus(),
      rateLimitStatus: this.getRateLimitStatus(),
    };
  }
}

// Singleton instance
let monitoringInstance: MonitoringDashboard | null = null;

export function getMonitoringDashboard(): MonitoringDashboard {
  if (!monitoringInstance) {
    monitoringInstance = new MonitoringDashboard();
  }
  return monitoringInstance;
}