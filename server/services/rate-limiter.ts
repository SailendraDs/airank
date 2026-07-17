// API Rate Limiting Service - Token bucket with sliding window
// Phase 4.3: Rate Limiting

import { storage } from '../storage';

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

export interface RateLimitEntry {
  key: string;
  minuteCount: number;
  hourCount: number;
  dayCount: number;
  minuteWindow: number;
  hourWindow: number;
  dayWindow: number;
  tokens: number;
  lastRefill: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,
  burstLimit: 10,
};

export class RateLimitService {
  private entries: Map<string, RateLimitEntry> = new Map();
  private tokenRefillRate = 10; // Tokens per second
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Check if request is allowed (token bucket algorithm)
   */
  check(key: string, config: RateLimitConfig = DEFAULT_CONFIG): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const entry = this.getOrCreateEntry(key, config);
    const now = Date.now();

    // Refill tokens based on time elapsed
    const elapsed = (now - entry.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.tokenRefillRate;
    entry.tokens = Math.min(entry.tokens + tokensToAdd, config.burstLimit);
    entry.lastRefill = now;

    // Check all limits
    if (entry.minuteCount >= config.requestsPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.minuteWindow + 60000,
      };
    }

    if (entry.hourCount >= config.requestsPerHour) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.hourWindow + 3600000,
      };
    }

    if (entry.dayCount >= config.requestsPerDay) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.dayWindow + 86400000,
      };
    }

    if (entry.tokens < 1) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + (1000 / this.tokenRefillRate),
      };
    }

    // Allow request
    entry.tokens -= 1;
    entry.minuteCount++;
    entry.hourCount++;
    entry.dayCount++;

    return {
      allowed: true,
      remaining: Math.floor(entry.tokens),
      resetAt: entry.minuteWindow + 60000,
    };
  }

  /**
   * Get or create rate limit entry
   */
  private getOrCreateEntry(key: string, config: RateLimitConfig): RateLimitEntry {
    let entry = this.entries.get(key);

    if (!entry) {
      const now = Date.now();
      entry = {
        key,
        minuteCount: 0,
        hourCount: 0,
        dayCount: 0,
        minuteWindow: now,
        hourWindow: now,
        dayWindow: now,
        tokens: config.burstLimit,
        lastRefill: now,
      };
      this.entries.set(key, entry);
    }

    // Reset windows if expired
    const now = Date.now();
    if (now - entry.minuteWindow > 60000) {
      entry.minuteCount = 0;
      entry.minuteWindow = now;
    }
    if (now - entry.hourWindow > 3600000) {
      entry.hourCount = 0;
      entry.hourWindow = now;
    }
    if (now - entry.dayWindow > 86400000) {
      entry.dayCount = 0;
      entry.dayWindow = now;
    }

    return entry;
  }

  /**
   * Get current usage for a key
   */
  getUsage(key: string): { minute: number; hour: number; day: number } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    return {
      minute: entry.minuteCount,
      hour: entry.hourCount,
      day: entry.dayCount,
    };
  }

  /**
   * Get rate limit statistics
   */
  getStats(): { activeKeys: number; totalRequests: number } {
    let totalRequests = 0;

    for (const [, entry] of this.entries) {
      totalRequests += entry.minuteCount;
    }

    return {
      activeKeys: this.entries.size,
      totalRequests,
    };
  }

  /**
   * Reset limits for a specific key
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Reset all limits
   */
  resetAll(): void {
    this.entries.clear();
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      // Remove entries older than 1 hour with no recent activity
      const age = now - Math.max(entry.minuteWindow, entry.hourWindow, entry.dayWindow);
      if (age > 3600000 && entry.minuteCount === 0 && entry.hourCount === 0) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Express middleware-style rate limit check
   */
  async checkApiKey(userId: string, apiKey: string): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
  }> {
    const key = `api:${userId}:${apiKey}`;
    const result = this.check(key);

    // Store in database for audit
    await storage.createOptimizationLog({
      brandId: '',
      action: 'rate_limit_check',
      details: JSON.stringify({
        userId,
        allowed: result.allowed,
        remaining: result.remaining,
        timestamp: new Date().toISOString(),
      }),
      improvement: null,
      metrics: null,
    });

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      limit: DEFAULT_CONFIG.requestsPerMinute,
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
let rateLimitInstance: RateLimitService | null = null;

export function getRateLimitService(): RateLimitService {
  if (!rateLimitInstance) {
    rateLimitInstance = new RateLimitService();
  }
  return rateLimitInstance;
}