// Database Connection Pool Manager - Dynamic scaling with read replicas
// Phase 4.5: Database Scaling

import { db } from '../db';

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  reapIntervalMs: number;
}

export interface ReplicaConfig {
  url: string;
  weight: number;
  lagThresholdMs: number;
  isHealthy: boolean;
  lastCheck: Date;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  avgWaitTimeMs: number;
  replicaStats: Record<string, { healthy: boolean; lagMs: number; weight: number }>;
}

export class DatabasePoolManager {
  private primaryPool: PoolConfig = {
    minConnections: 5,
    maxConnections: 20,
    acquireTimeoutMs: 30000,
    idleTimeoutMs: 300000,
    reapIntervalMs: 10000,
  };

  private replicas: Map<string, ReplicaConfig> = new Map();
  private replicaIndex = 0;
  private statsInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startStatsCollection();
  }

  /**
   * Add a read replica
   */
  addReplica(url: string, weight = 1): void {
    this.replicas.set(url, {
      url,
      weight,
      lagThresholdMs: 5000,
      isHealthy: true,
      lastCheck: new Date(),
    });
  }

  /**
   * Remove a read replica
   */
  removeReplica(url: string): void {
    this.replicas.delete(url);
  }

  /**
   * Get a connection for read query (round-robin weighted)
   */
  getReadConnection(): string | null {
    const healthyReplicas = Array.from(this.replicas.entries())
      .filter(([, r]) => r.isHealthy)
      .sort((a, b) => b[1].weight - a[1].weight);

    if (healthyReplicas.length === 0) {
      return null; // Fall back to primary
    }

    // Weighted round-robin
    const totalWeight = healthyReplicas.reduce((sum, [, r]) => sum + r.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [url, replica] of healthyReplicas) {
      random -= replica.weight;
      if (random <= 0) {
        return url;
      }
    }

    return healthyReplicas[0][0];
  }

  /**
   * Check replica health
   */
  async checkReplicaHealth(url: string): Promise<{ healthy: boolean; lagMs: number }> {
    try {
      const start = Date.now();
      // In real implementation, would run: SELECT pg_last_wal_receive_lsn()
      // For now, simulate health check
      await (db as any).execute('SELECT 1');
      const lagMs = Date.now() - start;

      const replica = this.replicas.get(url);
      if (replica) {
        replica.isHealthy = lagMs < replica.lagThresholdMs;
        replica.lastCheck = new Date();
      }

      return { healthy: true, lagMs };
    } catch {
      const replica = this.replicas.get(url);
      if (replica) {
        replica.isHealthy = false;
        replica.lastCheck = new Date();
      }
      return { healthy: false, lagMs: -1 };
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(intervalMs = 30000): void {
    setInterval(async () => {
      for (const url of this.replicas.keys()) {
        await this.checkReplicaHealth(url);
      }
    }, intervalMs);
  }

  /**
   * Route query to appropriate database
   */
  routeQuery(query: string): 'primary' | 'replica' {
    const readPatterns = [
      /^SELECT/i,
      /^WITH/i,
      /^EXPLAIN/i,
      /^SHOW/i,
      /^DESCRIBE/i,
    ];

    for (const pattern of readPatterns) {
      if (pattern.test(query.trim())) {
        return 'replica';
      }
    }

    return 'primary';
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    // In real implementation, would get from actual pool
    return {
      totalConnections: this.primaryPool.maxConnections,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      avgWaitTimeMs: 0,
      replicaStats: Object.fromEntries(
        Array.from(this.replicas.entries()).map(([url, r]) => [
          url,
          { healthy: r.isHealthy, lagMs: 0, weight: r.weight },
        ])
      ),
    };
  }

  /**
   * Start collecting stats
   */
  private startStatsCollection(): void {
    this.statsInterval = setInterval(() => {
      const stats = this.getStats();
      // Could emit metrics to monitoring system
      if (stats.waitingRequests > 10) {
        console.warn(`[DB Pool] High wait queue: ${stats.waitingRequests} requests`);
      }
    }, 60000);
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
  }
}

// Singleton instance
let poolManagerInstance: DatabasePoolManager | null = null;

export function getDatabasePoolManager(): DatabasePoolManager {
  if (!poolManagerInstance) {
    poolManagerInstance = new DatabasePoolManager();
  }
  return poolManagerInstance;
}