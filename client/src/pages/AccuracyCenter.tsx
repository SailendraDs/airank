import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FilePenLine,
  Flag,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type FactClaim = {
  id: string;
  claim: string;
  engine?: string | null;
  accuracy: "unverified" | "accurate" | "inaccurate";
  severity: "low" | "medium" | "high";
  correctValue?: string | null;
  explanation?: string | null;
  status: "open" | "correcting" | "resolved" | "dismissed";
  correctionTaskId?: string | null;
  detectedAt?: string | null;
};

function severityClass(severity: string) {
  if (severity === "high") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function statusIcon(status: string) {
  if (status === "resolved") return CheckCircle2;
  if (status === "dismissed") return XCircle;
  if (status === "correcting") return FilePenLine;
  return AlertTriangle;
}

export default function AccuracyCenter() {
  const { brandId, brand } = useCurrentBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [answerLimit, setAnswerLimit] = useState("15");
  const [manualClaim, setManualClaim] = useState("");
  const [manualCorrectValue, setManualCorrectValue] = useState("");
  const [manualExplanation, setManualExplanation] = useState("");
  const [manualSeverity, setManualSeverity] = useState("medium");

  const enabled = Boolean(brandId);
  const { data: claims = [], isFetching } = useQuery<FactClaim[]>({
    queryKey: ["accuracy-center", brandId, statusFilter],
    queryFn: () => api.getFactClaims(brandId || "", statusFilter),
    enabled,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["accuracy-center", brandId] });
  };

  const detectMutation = useMutation({
    mutationFn: () => api.detectFactClaims(brandId || "", Number(answerLimit) || 15),
    onSuccess: async (result: any) => {
      await refresh();
      toast({ title: "Accuracy detection completed", description: `${result?.claimsCreated || result?.claims?.length || 0} claims found` });
    },
    onError: (error: any) => {
      toast({ title: "Detection failed", description: error?.message, variant: "destructive" });
    },
  });

  const createClaimMutation = useMutation({
    mutationFn: () => {
      if (!manualClaim.trim()) throw new Error("Claim is required.");
      return api.createFactClaim(brandId || "", {
        claim: manualClaim.trim(),
        severity: manualSeverity,
        correctValue: manualCorrectValue.trim() || undefined,
        explanation: manualExplanation.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setManualClaim("");
      setManualCorrectValue("");
      setManualExplanation("");
      await refresh();
      toast({ title: "Claim flagged" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to flag claim", description: error?.message, variant: "destructive" });
    },
  });

  const updateClaimMutation = useMutation({
    mutationFn: ({ claimId, data }: { claimId: string; data: any }) => api.updateFactClaim(brandId || "", claimId, data),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Claim updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update claim", description: error?.message, variant: "destructive" });
    },
  });

  const correctionMutation = useMutation({
    mutationFn: (claimId: string) => api.createFactClaimCorrection(brandId || "", claimId),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Correction task created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create correction task", description: error?.message, variant: "destructive" });
    },
  });

  const summary = useMemo(() => {
    const open = claims.filter((claim) => claim.status === "open").length;
    const correcting = claims.filter((claim) => claim.status === "correcting").length;
    const resolved = claims.filter((claim) => claim.status === "resolved").length;
    const high = claims.filter((claim) => claim.severity === "high" && !["resolved", "dismissed"].includes(claim.status)).length;
    const inaccurate = claims.filter((claim) => claim.accuracy === "inaccurate").length;
    const total = claims.length;
    const score = Math.max(0, Math.min(100, Math.round(100 - high * 22 - open * 12 - correcting * 7 - inaccurate * 5)));
    return { open, correcting, resolved, high, inaccurate, total, score };
  }, [claims]);

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Accuracy Center" />
        <p className="text-muted-foreground">Select a brand to review AI answer accuracy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Accuracy Center" onRefresh={refresh} isRefreshing={isFetching} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">AI Accuracy & Hallucination Control</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Detect inaccurate AI claims about {brand?.name || "this brand"}, triage severity, and create correction tasks that feed the Action Workflow.
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "w-fit",
          summary.score >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            summary.score >= 55 ? "border-amber-200 bg-amber-50 text-amber-700" :
              "border-red-200 bg-red-50 text-red-700"
        )}>
          {summary.score >= 80 ? "Controlled" : summary.score >= 55 ? "Needs review" : "High risk"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Accuracy Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.score}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={summary.score} className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Open Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.open}</div>
            <p className="text-xs text-muted-foreground">{summary.high} high severity</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Correcting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.correcting}</div>
            <p className="text-xs text-muted-foreground">content tasks in motion</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.resolved}</div>
            <p className="text-xs text-muted-foreground">{summary.total} total claims</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card data-testid="accuracy-detect-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Run Accuracy Detection
            </CardTitle>
            <CardDescription>Scan recent AI answers for claims that need human review or correction content.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Answer limit</Label>
                <Input value={answerLimit} onChange={(event) => setAnswerLimit(event.target.value)} data-testid="input-answer-limit" />
              </div>
              <div className="flex items-end">
                <Button onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending} data-testid="button-detect-fact-claims">
                  {detectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                  Detect claims
                </Button>
              </div>
            </div>
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Use this before client reporting. Inaccurate facts should become correction tasks, not just dashboard warnings.
            </div>
          </CardContent>
        </Card>

        <Card data-testid="accuracy-manual-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              Manually Flag a Claim
            </CardTitle>
            <CardDescription>Capture a bad AI statement from sales calls, screenshots, or manual checks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Incorrect or risky claim</Label>
              <Textarea value={manualClaim} onChange={(event) => setManualClaim(event.target.value)} data-testid="textarea-manual-claim" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={manualSeverity} onValueChange={setManualSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Correct value</Label>
                <Input value={manualCorrectValue} onChange={(event) => setManualCorrectValue(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Why this is wrong</Label>
              <Textarea value={manualExplanation} onChange={(event) => setManualExplanation(event.target.value)} />
            </div>
            <Button onClick={() => createClaimMutation.mutate()} disabled={createClaimMutation.isPending} data-testid="button-create-fact-claim">
              <Plus className="mr-2 h-4 w-4" />
              Flag claim
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="accuracy-claims-panel">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Claim Triage</CardTitle>
              <CardDescription>Review, resolve, dismiss, or create correction content for inaccurate AI claims.</CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-44" data-testid="select-claim-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All claims</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="correcting">Correcting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {claims.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No claims found for this filter. Run detection or manually flag a risky AI statement.
            </div>
          ) : (
            claims.map((claim) => {
              const StatusIcon = statusIcon(claim.status);
              return (
                <div key={claim.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("capitalize", severityClass(claim.severity))}>{claim.severity}</Badge>
                        <Badge variant="secondary" className="capitalize">
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {claim.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">{claim.accuracy}</Badge>
                        {claim.engine && <Badge variant="outline">{claim.engine}</Badge>}
                      </div>
                      <p className="text-sm font-medium">{claim.claim}</p>
                      {claim.correctValue && (
                        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Correct:</span> {claim.correctValue}</p>
                      )}
                      {claim.explanation && <p className="text-xs text-muted-foreground">{claim.explanation}</p>}
                      {claim.correctionTaskId && <p className="text-xs text-muted-foreground">Correction task: {claim.correctionTaskId}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => correctionMutation.mutate(claim.id)}
                        disabled={correctionMutation.isPending || claim.status === "resolved"}
                      >
                        <FilePenLine className="mr-2 h-4 w-4" />
                        Create correction
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateClaimMutation.mutate({ claimId: claim.id, data: { status: "resolved", accuracy: "accurate" } })}
                        disabled={updateClaimMutation.isPending}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateClaimMutation.mutate({ claimId: claim.id, data: { status: "dismissed" } })}
                        disabled={updateClaimMutation.isPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
