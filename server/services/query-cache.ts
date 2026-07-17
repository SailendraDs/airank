// Query Caching Service - Redis-less in-memory caching for frequently accessed data
// Phase 4.1: Performance Optimization

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheConfig {
  ttl: number; // milliseconds
  maxSize: number; // max entries
}

export class QueryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private hitCount = 0;
  private missCount = 0;

  private readonly defaults: CacheConfig = {
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 1000,
  };

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.data as T;
  }

  /**
   * Set cached value with custom TTL
   */
  set<T>(key: string, data: T, ttl = this.defaults.ttl): void {
    // Enforce max size
    if (this.cache.size >= this.defaults.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Clear cache by prefix (e.g., clear all brand-specific cache)
   */
  clearByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number; hits: number; misses: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hitCount / total : 0,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }

  /**
   * Evict oldest entry (LRU approximation)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries (run periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Pre-configured cache instances for different data types
export const visibilityCache = new QueryCache();
export const brandCache = new QueryCache();
export const topicCache = new QueryCache();
export const mentionsCache = new QueryCache();

// Cache TTLs
export const CACHE_TTL = {
  VISIBILITY_SCORE: 2 * 60 * 1000,      // 2 minutes
  BRAND_DATA: 5 * 60 * 1000,             // 5 minutes
  TOPIC_LIST: 5 * 60 * 1000,             // 5 minutes
  MENTIONS: 1 * 60 * 1000,               // 1 minute (more volatile)
  COMPETITOR_DATA: 10 * 60 * 1000,      // 10 minutes
  DASHBOARD_ANALYTICS: 3 * 60 * 1000,    // 3 minutes
};

// Cache key builders
export const cacheKeys = {
  visibilityScore(brandId: string) { return `vis:${brandId}`; },
  brandData(brandId: string) { return `brand:${brandId}`; },
  topicList(brandId: string) { return `topics:${brandId}`; },
  mentions(brandId: string) { return `mentions:${brandId}`; },
  dashboardAnalytics(brandId: string) { return `dash:${brandId}`; },
  competitorMatrix(brandId: string) { return `matrix:${brandId}`; },
};

// Singleton instance
let cacheInstance: QueryCache | null = null;

export function getQueryCache(): QueryCache {
  if (!cacheInstance) {
    cacheInstance = new QueryCache();
    // Start cleanup interval
    setInterval(() => cacheInstance?.cleanup(), 60000); // Every minute
  }
  return cacheInstance;
}