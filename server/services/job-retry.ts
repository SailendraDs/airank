// Background Job Retry Service - Exponential backoff with circuit breaker
// Phase 4.2: Job Reliability

import { storage } from '../storage';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface JobRetryState {
  jobRunId: string;
  attemptCount: number;
  lastAttemptAt: Date;
  nextRetryAt: Date | null;
  circuitState: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,     // 1 second
  maxDelayMs: 300000,   // 5 minutes
  backoffMultiplier: 2,
};

export class JobRetryService {
  private retryStates: Map<string, JobRetryState> = new Map();
  private circuitBreakerThreshold = 10; // Open circuit after 10 consecutive failures

  /**
   * Determine if a job should be retried
   */
  shouldRetry(jobRunId: string): boolean {
    const state = this.retryStates.get(jobRunId);
    if (!state) return true;
    return state.attemptCount < DEFAULT_RETRY_CONFIG.maxRetries;
  }

  /**
   * Get delay before next retry (exponential backoff)
   */
  getRetryDelay(jobRunId: string): number {
    const state = this.retryStates.get(jobRunId);
    if (!state) return DEFAULT_RETRY_CONFIG.baseDelayMs;

    const delay = Math.min(
      DEFAULT_RETRY_CONFIG.baseDelayMs *
        Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, state.attemptCount - 1),
      DEFAULT_RETRY_CONFIG.maxDelayMs
    );

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }

  /**
   * Record a job attempt
   */
  recordAttempt(jobRunId: string, success: boolean): void {
    const existing = this.retryStates.get(jobRunId);

    if (success) {
      // Clear state on success
      this.retryStates.delete(jobRunId);
      return;
    }

    const attemptCount = (existing?.attemptCount ?? 0) + 1;
    const delayMs = this.getRetryDelay(jobRunId);

    const state: JobRetryState = {
      jobRunId,
      attemptCount,
      lastAttemptAt: new Date(),
      nextRetryAt: new Date(Date.now() + delayMs),
      circuitState: this.calculateCircuitState(attemptCount, existing?.consecutiveFailures ?? 0),
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
    };

    this.retryStates.set(jobRunId, state);
  }

  /**
   * Calculate circuit breaker state based on failure rate
   */
  private calculateCircuitState(attemptCount: number, consecutiveFailures: number): 'closed' | 'open' | 'half-open' {
    if (consecutiveFailures >= this.circuitBreakerThreshold) {
      return 'open';
    }
    if (consecutiveFailures >= this.circuitBreakerThreshold / 2) {
      return 'half-open';
    }
    return 'closed';
  }

  /**
   * Check if circuit is open for a job type
   */
  isCircuitOpen(jobType: string): boolean {
    for (const [, state] of this.retryStates) {
      if (state.jobRunId.includes(jobType) && state.circuitState === 'open') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get retry statistics for monitoring
   */
  getStats(): { activeRetries: number; circuitsOpen: number; pendingJobs: number } {
    let circuitsOpen = 0;
    let pendingJobs = 0;

    for (const [, state] of this.retryStates) {
      if (state.circuitState === 'open') circuitsOpen++;
      if (state.nextRetryAt && state.nextRetryAt > new Date()) pendingJobs++;
    }

    return {
      activeRetries: this.retryStates.size,
      circuitsOpen,
      pendingJobs,
    };
  }

  /**
   * Get all jobs due for retry
   */
  getDueRetries(): JobRetryState[] {
    const now = new Date();
    const due: JobRetryState[] = [];

    for (const [, state] of this.retryStates) {
      if (state.nextRetryAt && state.nextRetryAt <= now && state.circuitState !== 'open') {
        due.push(state);
      }
    }

    return due;
  }

  /**
   * Clear retry state (manual reset)
   */
  clearState(jobRunId: string): void {
    this.retryStates.delete(jobRunId);
  }

  /**
   * Log retry attempt to database for audit
   */
  async logRetryAttempt(jobRunId: string, attemptNumber: number, delayMs: number): Promise<void> {
    await storage.createOptimizationLog({
      brandId: '',
      action: 'job_retry',
      details: JSON.stringify({
        jobRunId,
        attemptNumber,
        delayMs,
        timestamp: new Date().toISOString(),
      }),
      improvement: null,
      metrics: null,
    });
  }
}

// Singleton instance
let retryServiceInstance: JobRetryService | null = null;

export function getJobRetryService(): JobRetryService {
  if (!retryServiceInstance) {
    retryServiceInstance = new JobRetryService();
  }
  return retryServiceInstance;
}