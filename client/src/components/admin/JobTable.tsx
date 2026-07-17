// client/src/components/admin/JobTable.tsx

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JobDetailModal } from './JobDetailModal';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  fixed: 'bg-purple-500',
};

const JOB_TYPES = [
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

interface JobTableProps {
  filterStatus?: string;
  filterType?: string;
}

export function JobTable({ filterStatus, filterType }: JobTableProps) {
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/jobs', filterStatus, filterType, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const res = await fetch(`/api/admin/jobs?${params}`, { credentials: 'include' });
      return res.json();
    },
  });

  const triggerFix = async (jobId: string) => {
    if (!confirm('Trigger AI fix for this job?')) return;
    const res = await fetch(`/api/admin/jobs/${jobId}/fix`, {
      method: 'POST',
      credentials: 'include',
    });
    const result = await res.json();
    alert(result.message || `Fix ${result.status}`);
  };

  const retryJob = async (jobId: string) => {
    const res = await fetch(`/api/admin/jobs/${jobId}/retry`, {
      method: 'POST',
      credentials: 'include',
    });
    const result = await res.json();
    alert(result.message || `Job re-queued: ${result.jobId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.jobs?.map((job: any) => (
            <TableRow key={job.id}>
              <TableCell className="font-mono text-xs">{job.id.slice(0, 20)}...</TableCell>
              <TableCell>
                <Badge variant="outline">{job.type}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {job.brandId?.slice(0, 8) || '-'}
              </TableCell>
              <TableCell>
                <Badge className={`${STATUS_COLORS[job.status]} text-white`}>
                  {job.status}
                </Badge>
              </TableCell>
              <TableCell>{job.attempts}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {new Date(job.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedJob(job.id)}
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => retryJob(job.id)}
                    title="Retry Job"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => triggerFix(job.id)}
                    title="Trigger AI Fix"
                    className="text-purple-500"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!data?.jobs || data.jobs.length === 0) && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No jobs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selectedJob && (
        <JobDetailModal jobId={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </>
  );
}