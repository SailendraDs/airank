import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useJobStatus, useBrandJobs } from "@/hooks/use-jobs";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobStatusBadgeProps {
  status: string;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const statusConfig: Record<string, { icon: typeof Clock; variant: "secondary" | "default" | "outline" | "destructive"; label: string; color?: string }> = {
    pending: { icon: Clock, variant: "secondary", label: "Pending" },
    running: { icon: Loader2, variant: "default", label: "Running" },
    completed: { icon: CheckCircle2, variant: "outline", label: "Completed", color: "text-green-600 border-green-600/30" },
    failed: { icon: XCircle, variant: "destructive", label: "Failed" },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", config.color, className)}>
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {config.label}
    </Badge>
  );
}

interface JobStatusCardProps {
  jobId: string;
  title?: string;
  description?: string;
}

export function JobStatusCard({ jobId, title, description }: JobStatusCardProps) {
  const { data: job, isLoading } = useJobStatus(jobId);

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading job status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!job) {
    return (
      <Card className="glass-card border-destructive/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">Job not found</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = job.progress || 0;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title || job.type || "Job"}</CardTitle>
          <JobStatusBadge status={job.status} />
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {job.status === "running" && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
        
        {job.error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs text-destructive font-medium">Error:</p>
            <p className="text-xs text-destructive/80 mt-1">{job.error}</p>
          </div>
        )}

        {job.result && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
            <p className="text-xs text-green-600 font-medium">Completed successfully</p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Job ID: {jobId.slice(0, 8)}...</span>
          {job.attempts > 1 && <span>Attempt {job.attempts}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

interface BrandJobsListProps {
  brandId: string;
  limit?: number;
}

export function BrandJobsList({ brandId, limit = 10 }: BrandJobsListProps) {
  const { data: jobs, isLoading, error } = useBrandJobs(brandId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="h-6 w-6 mx-auto text-destructive" />
          <p className="text-sm text-destructive">Failed to load jobs</p>
        </div>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <p className="text-sm">No jobs found</p>
      </div>
    );
  }

  const displayJobs = jobs.slice(0, limit);

  return (
    <div className="space-y-3">
      {displayJobs.map((job: any) => (
        <Card key={job.id} className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{job.type}</span>
                  <JobStatusBadge status={job.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(job.createdAt).toLocaleString()}
                </p>
              </div>
              {job.status === "running" && job.progress && (
                <div className="ml-4 w-24">
                  <Progress value={job.progress} className="h-1.5" />
                </div>
              )}
            </div>
            {job.error && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                {job.error}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface JobProgressIndicatorProps {
  jobId: string;
  onComplete?: () => void;
}

export function JobProgressIndicator({ jobId, onComplete }: JobProgressIndicatorProps) {
  const { data: job } = useJobStatus(jobId);

  if (!job) return null;

  if (job.status === "completed" && onComplete) {
    onComplete();
    return null;
  }

  if (job.status === "pending" || job.status === "running") {
    return (
      <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-md">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Processing...</p>
          {job.progress && (
            <Progress value={job.progress} className="h-1 mt-1" />
          )}
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
        <XCircle className="h-4 w-4 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">Job failed</p>
          {job.error && <p className="text-xs text-destructive/80 mt-1">{job.error}</p>}
        </div>
      </div>
    );
  }

  return null;
}
