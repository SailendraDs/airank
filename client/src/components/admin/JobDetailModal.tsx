// client/src/components/admin/JobDetailModal.tsx

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface JobDetailModalProps {
  jobId: string;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  fixed: 'bg-purple-500',
};

export function JobDetailModal({ jobId, onClose }: JobDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: job, isLoading } = useQuery({
    queryKey: ['/api/admin/jobs', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/jobs/${jobId}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!jobId,
  });

  const copyError = () => {
    if (job?.errorMessage) {
      navigator.clipboard.writeText(job.errorMessage);
    }
  };

  const triggerFix = async () => {
    const res = await fetch(`/api/admin/jobs/${jobId}/fix`, {
      method: 'POST',
      credentials: 'include',
    });
    const result = await res.json();
    alert(result.message || `Fix ${result.status}`);
    onClose();
  };

  const retryJob = async () => {
    const res = await fetch(`/api/admin/jobs/${jobId}/retry`, {
      method: 'POST',
      credentials: 'include',
    });
    const result = await res.json();
    alert(result.message || `Job re-queued: ${result.jobId}`);
    onClose();
  };

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Job Details: {jobId.slice(0, 20)}...</DialogTitle>
            <Badge className={`${STATUS_COLORS[job.status]} text-white`}>
              {job.status}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="payload">Payload</TabsTrigger>
            <TabsTrigger value="result">Result</TabsTrigger>
            <TabsTrigger value="error">Error Trace</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Job ID</label>
                <p className="font-mono text-sm">{job.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <p className="font-mono text-sm">{job.type}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Brand ID</label>
                <p className="font-mono text-sm">{job.brandId || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Attempts</label>
                <p className="font-mono text-sm">{job.attempts}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <p className="font-mono text-sm">
                  {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Completed</label>
                <p className="font-mono text-sm">
                  {job.completedAt ? new Date(job.completedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
              {job.fixedBy && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Fixed By</label>
                  <p className="font-mono text-sm">{job.fixedBy}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={retryJob}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Job
              </Button>
              <Button variant="secondary" onClick={triggerFix}>
                <Sparkles className="h-4 w-4 mr-2" />
                Trigger AI Fix
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="payload" className="pt-4">
            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </TabsContent>

          <TabsContent value="result" className="pt-4">
            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
              {job.result ? JSON.stringify(job.result, null, 2) : 'No result available'}
            </pre>
          </TabsContent>

          <TabsContent value="error" className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">Error Message</label>
              <Button variant="ghost" size="sm" onClick={copyError}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="bg-destructive/10 text-destructive p-4 rounded-md overflow-x-auto text-xs whitespace-pre-wrap">
              {job.errorMessage || 'No error'}
            </pre>

            {job.errorTrace && (
              <>
                <label className="text-sm font-medium text-muted-foreground mt-4 block">Stack Trace</label>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs">
                  {job.errorTrace}
                </pre>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}