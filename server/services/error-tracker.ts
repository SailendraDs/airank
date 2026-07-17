// Error Tracking & Alerting Service - Real-time error monitoring
// Phase 4.4: Error Tracking & Alerting

import { storage } from '../storage';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'validation' | 'database' | 'api' | 'external' | 'auth' | 'job' | 'system';

export interface ErrorEvent {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context: {
    userId?: string;
    brandId?: string;
    jobRunId?: string;
    endpoint?: string;
    metadata?: Record<string, any>;
  };
  count: number; // For rate limiting duplicate errors
  lastOccurrence: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: 'error_count' | 'error_rate' | 'severity_threshold' | 'category_threshold';
  threshold: number;
  windowMinutes: number;
  severity: ErrorSeverity;
  channels: ('log' | 'email' | 'webhook' | 'slack')[];
  enabled: boolean;
  cooldownMinutes: number;
}

export interface ErrorStats {
  totalErrors: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  unhandledCount: number;
  resolvedCount: number;
  avgResolutionTimeMs: number;
}

export class ErrorTracker {
  private errors: Map<string, ErrorEvent> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'critical_threshold',
        name: 'Critical Error Alert',
        condition: 'severity_threshold',
        threshold: 1,
        windowMinutes: 1,
        severity: 'critical',
        channels: ['log', 'email'],
        enabled: true,
        cooldownMinutes: 15,
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate Alert',
        condition: 'error_rate',
        threshold: 10,
        windowMinutes: 5,
        severity: 'high',
        channels: ['log'],
        enabled: true,
        cooldownMinutes: 30,
      },
      {
        id: 'database_errors',
        name: 'Database Error Alert',
        condition: 'category_threshold',
        threshold: 5,
        windowMinutes: 10,
        severity: 'high',
        channels: ['log', 'webhook'],
        enabled: true,
        cooldownMinutes: 30,
      },
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }

  /**
   * Track an error event
   */
  async track(
    severity: ErrorSeverity,
    category: ErrorCategory,
    message: string,
    context: ErrorEvent['context'] = {},
    stack?: string
  ): Promise<string> {
    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check for duplicate (same message within 60 seconds)
    const dedupeKey = `${category}:${message}`;
    const existing = Array.from(this.errors.values()).find(
      e => e.message === message && !e.resolved &&
        (Date.now() - e.lastOccurrence.getTime()) < 60000
    );

    if (existing) {
      existing.count++;
      existing.lastOccurrence = new Date();
      return existing.id;
    }

    const event: ErrorEvent = {
      id,
      timestamp: new Date(),
      severity,
      category,
      message,
      stack,
      context,
      count: 1,
      lastOccurrence: new Date(),
      resolved: false,
    };

    this.errors.set(id, event);

    // Persist to database
    await storage.createOptimizationLog({
      brandId: context.brandId || '',
      action: 'error_tracked',
      details: JSON.stringify({
        errorId: id,
        severity,
        category,
        message,
        stack,
        context,
      }),
      improvement: null,
      metrics: null,
    });

    // Check alert rules
    await this.evaluateAlertRules(event);

    return id;
  }

  /**
   * Evaluate alert rules for an error event
   */
  private async evaluateAlertRules(event: ErrorEvent): Promise<void> {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastAlert = this.alertCooldowns.get(ruleId);
      if (lastAlert && Date.now() - lastAlert.getTime() < rule.cooldownMinutes * 60000) {
        continue;
      }

      let shouldAlert = false;

      switch (rule.condition) {
        case 'severity_threshold':
          shouldAlert = event.severity === rule.severity;
          break;

        case 'error_rate':
          const recentErrors = this.getErrorsInWindow(rule.windowMinutes);
          shouldAlert = recentErrors.length >= rule.threshold;
          break;

        case 'category_threshold':
          const categoryErrors = this.getErrorsByCategory(event.category, rule.windowMinutes);
          shouldAlert = categoryErrors.length >= rule.threshold;
          break;

        case 'error_count':
          shouldAlert = event.count >= rule.threshold;
          break;
      }

      if (shouldAlert) {
        await this.sendAlert(rule, event);
        this.alertCooldowns.set(ruleId, new Date());
      }
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(rule: AlertRule, event: ErrorEvent): Promise<void> {
    const alertMessage = `[${rule.name}] ${event.severity.toUpperCase()}: ${event.message}`;

    for (const channel of rule.channels) {
      switch (channel) {
        case 'log':
          console.error(`[ALERT:${rule.name}]`, {
            error: event,
            rule: rule.id,
          });
          break;

        case 'email':
          // Would integrate with email service
          console.log(`[EMAIL ALERT] To: admin@airank.io | ${alertMessage}`);
          break;

        case 'webhook':
          // Would call configured webhook URLs
          console.log(`[WEBHOOK ALERT] ${alertMessage}`);
          break;

        case 'slack':
          // Would post to Slack channel
          console.log(`[SLACK ALERT] ${alertMessage}`);
          break;
      }
    }
  }

  /**
   * Get errors within time window
   */
  private getErrorsInWindow(windowMinutes: number): ErrorEvent[] {
    const cutoff = Date.now() - windowMinutes * 60000;
    return Array.from(this.errors.values()).filter(
      e => e.timestamp.getTime() > cutoff
    );
  }

  /**
   * Get errors by category within time window
   */
  private getErrorsByCategory(category: ErrorCategory, windowMinutes: number): ErrorEvent[] {
    return this.getErrorsInWindow(windowMinutes).filter(e => e.category === category);
  }

  /**
   * Resolve an error
   */
  resolve(errorId: string): void {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date();
    }
  }

  /**
   * Resolve all errors of a category
   */
  resolveByCategory(category: ErrorCategory): number {
    let count = 0;
    for (const [id, error] of this.errors) {
      if (error.category === category) {
        error.resolved = true;
        error.resolvedAt = new Date();
        count++;
      }
    }
    return count;
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    const errors = Array.from(this.errors.values());
    const resolved = errors.filter(e => e.resolved);

    const bySeverity: Record<ErrorSeverity, number> = {
      low: 0, medium: 0, high: 0, critical: 0,
    };

    const byCategory: Record<ErrorCategory, number> = {
      validation: 0, database: 0, api: 0, external: 0,
      auth: 0, job: 0, system: 0,
    };

    for (const error of errors) {
      bySeverity[error.severity]++;
      byCategory[error.category]++;
    }

    const resolutionTimes = resolved
      .filter(e => e.resolvedAt)
      .map(e => e.resolvedAt!.getTime() - e.timestamp.getTime());

    const avgResolutionTimeMs = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    return {
      totalErrors: errors.length,
      bySeverity,
      byCategory,
      unhandledCount: errors.filter(e => !e.resolved).length,
      resolvedCount: resolved.length,
      avgResolutionTimeMs,
    };
  }

  /**
   * Get recent errors
   */
  getRecent(limit = 50): ErrorEvent[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Add or update alert rule
   */
  setAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get unhandled errors by severity
   */
  getUnhandledBySeverity(severity: ErrorSeverity): ErrorEvent[] {
    return Array.from(this.errors.values()).filter(
      e => !e.resolved && e.severity === severity
    );
  }
}

// Singleton instance
let errorTrackerInstance: ErrorTracker | null = null;

export function getErrorTracker(): ErrorTracker {
  if (!errorTrackerInstance) {
    errorTrackerInstance = new ErrorTracker();
  }
  return errorTrackerInstance;
}