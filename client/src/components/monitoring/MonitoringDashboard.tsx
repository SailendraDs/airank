// Monitoring Dashboard Component - Real-time system metrics and health
// Phase 4.6: Monitoring Dashboard

import { useState, useEffect, useCallback } from 'react';
import { getSystemHealth, getSystemMetrics, getRecentErrors, resolveError } from '@/lib/api';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  version: string;
  components: Record<string, {
    status: string;
    latencyMs: number;
    message?: string;
  }>;
}

interface Metrics {
  timestamp: number;
  requests: {
    total: number;
    success: number;
    errors: number;
    avgLatencyMs: number;
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
}

interface ErrorEvent {
  id: string;
  severity: string;
  category: string;
  message: string;
  timestamp: string;
  count: number;
  resolved: boolean;
}

export function MonitoringDashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'errors' | 'jobs'>('overview');

  const fetchData = useCallback(async () => {
    try {
      const [healthData, metricsData, errorsData] = await Promise.all([
        getSystemHealth(),
        getSystemMetrics(),
        getRecentErrors(50),
      ]);

      setHealth(healthData);
      setMetrics(metricsData);
      setErrors(errorsData || []);
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleResolveError = async (errorId: string) => {
    try {
      await resolveError(errorId);
      setErrors(prev => prev.map(e =>
        e.id === errorId ? { ...e, resolved: true } : e
      ));
    } catch (error) {
      console.error('Failed to resolve error:', error);
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'degraded':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
      case 'error':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
          <p className="text-sm text-gray-500">
            Uptime: {health ? formatUptime(health.uptime) : 'N/A'} | Version: {health?.version || 'N/A'}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full font-medium ${
          health?.status === 'healthy' ? 'bg-green-100 text-green-800' :
          health?.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {health?.status?.toUpperCase() || 'UNKNOWN'}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['overview', 'errors', 'jobs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Total Requests</div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics?.requests.total.toLocaleString() || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.requests.errors || 0} errors
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Cache Hit Rate</div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics ? `${(metrics.cache.hitRate * 100).toFixed(1)}%` : '0%'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.cache.size || 0} entries
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Active Jobs</div>
              <div className="text-2xl font-bold text-gray-900">
                {metrics?.jobs.active || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.jobs.queued || 0} queued
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Critical Errors</div>
              <div className="text-2xl font-bold text-red-600">
                {metrics?.errors.critical || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics?.errors.total || 0} total
              </div>
            </div>
          </div>

          {/* Component Health */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Component Health</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {health?.components && Object.entries(health.components).map(([name, data]) => (
                  <div key={name} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 capitalize">{name}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(data.status)}`}>
                        {data.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      {data.latencyMs >= 0 ? `${data.latencyMs}ms` : 'N/A'}
                    </div>
                    {data.message && (
                      <div className="mt-1 text-xs text-red-500 truncate">{data.message}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Error Breakdown */}
          {metrics?.errors && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Error Distribution</h2>
              </div>
              <div className="p-4">
                <div className="flex items-center space-x-4">
                  {[
                    { key: 'critical', color: 'bg-red-600', label: 'Critical' },
                    { key: 'high', color: 'bg-orange-500', label: 'High' },
                    { key: 'medium', color: 'bg-yellow-500', label: 'Medium' },
                    { key: 'low', color: 'bg-blue-500', label: 'Low' },
                  ].map(({ key, color, label }) => (
                    <div key={key} className="flex items-center">
                      <div className={`w-3 h-3 rounded ${color}`}></div>
                      <span className="ml-2 text-sm text-gray-600">{label}: {metrics.errors[key as keyof typeof metrics.errors] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Errors</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {errors.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No errors to display</div>
            ) : (
              errors.map(error => (
                <div key={error.id} className="p-4 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(error.severity)}`}>
                        {error.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">{error.category}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(error.timestamp).toLocaleString()}
                      </span>
                      {error.count > 1 && (
                        <span className="text-xs text-gray-400">×{error.count}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-900">{error.message}</p>
                  </div>
                  {!error.resolved && (
                    <button
                      onClick={() => handleResolveError(error.id)}
                      className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Resolve
                    </button>
                  )}
                  {error.resolved && (
                    <span className="ml-4 text-sm text-green-600">Resolved</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === 'jobs' && metrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Active Jobs</div>
              <div className="text-2xl font-bold text-gray-900">{metrics.jobs.active}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Queued Jobs</div>
              <div className="text-2xl font-bold text-yellow-600">{metrics.jobs.queued}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Failed Jobs</div>
              <div className="text-2xl font-bold text-red-600">{metrics.jobs.failed}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Job Metrics</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Average Duration</div>
                  <div className="text-lg font-medium">{metrics.jobs.avgDurationMs}ms</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Throughput</div>
                  <div className="text-lg font-medium">
                    {metrics.requests.total > 0
                      ? `${(metrics.jobs.active / metrics.requests.total * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}