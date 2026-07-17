// client/src/pages/admin/AdminJobMonitor.tsx

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobTable } from '@/components/admin/JobTable';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const JOB_TYPES = [
  '',
  'brand_enrichment',
  'competitor_enrichment',
  'topic_generation',
  'query_generation',
  'llm_sampling',
  'serp_sampling',
  'citation_extraction',
  'visibility_scoring',
  'gap_analysis',
  'recommendation_generation',
  'axp_publish',
  'serp_analysis',
  'knowledge_graph_analysis',
  'social_analytics',
  'content_recommendations',
  'kg_enrichment',
  'prompt_mining',
];

export default function AdminJobMonitor() {
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['/api/admin/jobs/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/jobs/stats', { credentials: 'include' });
      return res.json();
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Job Monitor</h1>
            <p className="text-muted-foreground">Track and manage background job execution</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.successRate || 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.failed || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pending || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex gap-2">
            {STATUS_TABS.map(tab => (
              <Button
                key={tab.value}
                variant={statusFilter === tab.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {JOB_TYPES.filter(Boolean).map(type => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Job Table */}
        <Card>
          <CardContent className="pt-6">
            <JobTable filterStatus={statusFilter || undefined} filterType={typeFilter || undefined} />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}