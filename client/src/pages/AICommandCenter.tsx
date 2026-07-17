import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  Compass,
  ExternalLink,
  FileText,
  Globe,
  MessageSquare,
  PackageCheck,
  Radar,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type CoverageStatus = "live" | "partial" | "missing";

type CommandCapability = {
  title: string;
  competitor: string;
  status: CoverageStatus;
  metric: string;
  detail: string;
  href: string;
  icon: typeof BarChart3;
};

type LaunchRoadmapItem = {
  id: string;
  phase: string;
  title: string;
  owner: string;
  priority: "critical" | "high" | "medium";
  status: "blocked" | "ready" | "queued";
  evidence: string;
  action: string;
  href: string;
};

const STATUS_STYLES: Record<CoverageStatus, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  partial: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  missing: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
};

function statusLabel(status: CoverageStatus) {
  if (status === "live") return "Live";
  if (status === "partial") return "Partial";
  return "Missing";
}

function statusIcon(status: CoverageStatus) {
  if (status === "live") return <CheckCircle2 className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function productionHardeningActionType(gateId: string) {
  return `production_hardening:${String(gateId || "gate").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}`;
}

export default function AICommandCenter() {
  const { brandId, brand } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const enabled = Boolean(brandId);
  const { data: latestScore, isLoading: latestLoading } = useQuery({
    queryKey: ["command-center", brandId, "latest-score"],
    queryFn: () => api.getLatestVisibilityScore(brandId || ""),
    enabled,
  });
  const { data: prompts = [], isLoading: promptsLoading } = useQuery<any[]>({
    queryKey: ["command-center", brandId, "prompts"],
    queryFn: () => api.getPromptAnalytics(brandId || ""),
    enabled,
  });
  const { data: domains = [] } = useQuery<any[]>({
    queryKey: ["command-center", brandId, "source-domains"],
    queryFn: () => api.getSourceDomains(brandId || ""),
    enabled,
  });
  const { data: sources = [] } = useQuery<any[]>({
    queryKey: ["command-center", brandId, "sources"],
    queryFn: () => api.getSources(brandId || ""),
    enabled,
  });
  const { data: agentReadiness } = useQuery<any>({
    queryKey: ["command-center", brandId, "agent-readiness"],
    queryFn: () => api.getAgentReadiness(brandId || ""),
    enabled,
  });
  const { data: productReadiness } = useQuery<any>({
    queryKey: ["command-center", brandId, "product-readiness"],
    queryFn: () => api.getProductReadiness(brandId || ""),
    enabled,
  });
  const { data: crawlerStats } = useQuery<any>({
    queryKey: ["command-center", brandId, "crawler-stats"],
    queryFn: () => api.getCrawlerStats(brandId || ""),
    enabled,
  });
  const { data: actionData } = useQuery<any>({
    queryKey: ["command-center", brandId, "actions"],
    queryFn: () => api.getPrioritizedActions(brandId || "", 20),
    enabled,
  });
  const { data: optimizations = [] } = useQuery<any[]>({
    queryKey: ["command-center", brandId, "optimizations"],
    queryFn: () => api.getOptimizationHistory(brandId || "", 30),
    enabled,
  });
  const { data: verificationData } = useQuery<any>({
    queryKey: ["command-center", brandId, "verification-tasks"],
    queryFn: () => api.getVerificationTasks(brandId || ""),
    enabled,
  });
  const { data: alertSummary } = useQuery<any>({
    queryKey: ["command-center", brandId, "alert-summary"],
    queryFn: () => api.getAlertSummary(brandId || ""),
    enabled,
  });
  const { data: scanHealth } = useQuery<any>({
    queryKey: ["command-center", brandId, "scan-health"],
    queryFn: () => api.getScanHealth(brandId || ""),
    enabled,
  });
  const { data: scanHistory } = useQuery<any>({
    queryKey: ["command-center", brandId, "scan-operations-history"],
    queryFn: () => api.getScanOperationsHistory(brandId || ""),
    enabled,
  });
  const { data: competitiveParity } = useQuery<any>({
    queryKey: ["command-center", brandId, "competitive-parity"],
    queryFn: () => api.getCompetitiveParity(brandId || ""),
    enabled,
  });
  const { data: fanoutData } = useQuery<any>({
    queryKey: ["command-center", brandId, "prompt-fanouts"],
    queryFn: () => api.getPromptFanouts(brandId || ""),
    enabled,
  });
  const { data: answerIntelligence } = useQuery<any>({
    queryKey: ["command-center", brandId, "answer-intelligence"],
    queryFn: () => api.getAnswerIntelligence(brandId || ""),
    enabled,
  });
  const { data: audiencePersonas } = useQuery<any>({
    queryKey: ["command-center", brandId, "audience-personas"],
    queryFn: () => api.getAudiencePersonas(brandId || ""),
    enabled,
  });
  const { data: launchReadinessData } = useQuery<any>({
    queryKey: ["command-center", brandId, "launch-readiness"],
    queryFn: () => api.getLaunchReadiness(brandId || ""),
    enabled,
  });
  const { data: productionAudit } = useQuery<any>({
    queryKey: ["command-center", brandId, "production-readiness-audit"],
    queryFn: () => api.getProductionReadinessAudit(brandId || ""),
    enabled,
  });
  const { data: launchTrend } = useQuery<any>({
    queryKey: ["command-center", brandId, "launch-trend"],
    queryFn: () => api.getLaunchTrend(brandId || ""),
    enabled,
  });
  const { data: marketOpportunities } = useQuery<any>({
    queryKey: ["command-center", brandId, "market-opportunities"],
    queryFn: () => api.getMarketOpportunities(brandId || ""),
    enabled,
  });
  const answerRiskTaskMutation = useMutation({
    mutationFn: (answerId: string) => api.createAnswerIntelligenceRiskTask(brandId || "", answerId),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "answer-intelligence"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Answer risk added" : "Already in workflow",
        description: result?.message || "Open Action Workflow to assign and track the fix.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create workflow task", description: error?.message, variant: "destructive" });
    },
  });
  const marketOpportunityTaskMutation = useMutation({
    mutationFn: (opportunity: any) => api.createMarketOpportunityTask(brandId || "", opportunity.id, opportunity),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "market-opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Opportunity added" : "Already in workflow",
        description: result?.message || "Open Action Workflow to assign and verify the work.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create workflow task", description: error?.message, variant: "destructive" });
    },
  });
  const audiencePersonaTaskMutation = useMutation({
    mutationFn: (personaId: string) => api.createAudiencePersonaTask(brandId || "", personaId),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "audience-personas"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Persona gap added" : "Already in workflow",
        description: result?.message || "Open Action Workflow to assign and verify the persona fix.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create persona task", description: error?.message, variant: "destructive" });
    },
  });
  const promptFanoutTaskMutation = useMutation({
    mutationFn: (promptId: string) => api.createPromptFanoutTask(brandId || "", promptId),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "prompt-fanouts"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Fanout brief added" : "Already in workflow",
        description: result?.message || "Open Action Workflow to assign and verify the content brief.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create fanout task", description: error?.message, variant: "destructive" });
    },
  });
  const createTopFanoutBriefsMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return { created: 0, reused: 0, total: 0 };
      const existing = new Set((optimizations || [])
        .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
        .map((log: any) => String(log.actionType || "")));
      const fanouts = (fanoutData?.fanouts || [])
        .filter((fanout: any) => fanout?.promptId && fanout.status === "high_opportunity")
        .sort((a: any, b: any) => numberValue(b.opportunityScore) - numberValue(a.opportunityScore))
        .slice(0, 8);
      let created = 0;
      let reused = 0;

      for (const fanout of fanouts) {
        const actionType = `query_fanout:${fanout.promptId}`;
        if (existing.has(actionType)) {
          reused += 1;
          continue;
        }
        const result = await api.createPromptFanoutTask(brandId, fanout.promptId);
        if (result?.created === false) {
          reused += 1;
        } else {
          created += 1;
        }
        existing.add(actionType);
      }

      return { created, reused, total: fanouts.length };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "prompt-fanouts"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Fanout briefs created" : "Fanout briefs already exist",
        description: result?.created
          ? `${result.created} fanout brief${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign and verify the existing fanout briefs.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create fanout briefs", description: error?.message, variant: "destructive" });
    },
  });
  const queueScanRunMutation = useMutation({
    mutationFn: () => api.queueScanOperationsRun(brandId || "", { maxPrompts: 25, maxProviders: 4, providerSweep: true, includeDownstream: true }),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-health"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-operations-history"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
      ]);
      toast({
        title: "Scan run queued",
        description: result?.message || "Fresh prompt, citation, visibility, and alert jobs were queued.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not queue scan run", description: error?.message, variant: "destructive" });
    },
  });
  const queueEnterprisePilotMutation = useMutation({
    mutationFn: () => api.queueScanOperationsRun(brandId || "", { maxPrompts: 3, maxProviders: 6, providerSweep: true, includeDownstream: false, enterprisePilot: true }),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-health"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-operations-history"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
      ]);
      toast({
        title: "Enterprise pilot sweep queued",
        description: result?.message || "Configured enterprise providers were queued for a small proof sweep.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not queue enterprise pilot", description: error?.message, variant: "destructive" });
    },
  });
  const providerPreflightMutation = useMutation({
    mutationFn: () => {
      const recoveryProviders = (scanHealth?.providerCoverage?.enterpriseRecoveryPlan || [])
        .map((item: any) => String(item.provider || "").toLowerCase())
        .filter(Boolean)
        .slice(0, 6);
      return api.runProviderPreflight(brandId || "", recoveryProviders);
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-health"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "scan-operations-history"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
      ]);
      toast({
        title: result?.ok ? "Provider preflight passed" : "Provider preflight found blockers",
        description: result?.message || "Provider credentials and billing were checked with a tiny request.",
        variant: result?.ok ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({ title: "Provider preflight failed", description: error?.message, variant: "destructive" });
    },
  });

  const createAllProviderRecoveryTasksMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return { created: 0, reused: 0 };
      const recoveryItems = (scanHealth?.providerCoverage?.enterpriseRecoveryPlan || [])
        .filter((item: any) => item?.provider)
        .slice(0, 6);
      const existing = new Set((optimizations || [])
        .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
        .map((log: any) => String(log.actionType || "")));
      let created = 0;
      let reused = 0;

      for (const item of recoveryItems) {
        const provider = String(item.provider || "provider").toLowerCase();
        const actionType = `provider_recovery:${provider}`;
        if (existing.has(actionType)) {
          reused += 1;
          continue;
        }
        await api.createOptimizationLog(brandId, {
          actionType,
          actionDescription: [
            `Provider Recovery: Restore ${provider} enterprise sampling.`,
            item.planLocked ? "Plan access is currently locked for this provider." : "",
            item.cause || "Provider recovery evidence required.",
            `Action: ${item.action || "Fix credentials, billing, quota, plan access, or sampling blockers, rerun provider preflight, then queue an enterprise pilot sweep."}`,
          ].filter(Boolean).join(" "),
          estimatedImpact: item.severity === "blocked" || item.status === "failed" ? 90 : 65,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused, total: recoveryItems.length };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Provider recovery tasks created" : "Provider recovery tasks already exist",
        description: result?.created
          ? `${result.created} provider recovery task${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign, apply, and verify the existing provider recovery tasks.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create provider recovery tasks", description: error?.message, variant: "destructive" });
    },
  });

  const createParityActionPackMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return { created: 0, reused: 0 };
      const blockers = (competitiveParity?.nextActions || [])
        .filter((item: any) => item?.id)
        .slice(0, 8);
      const existing = new Set((optimizations || [])
        .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
        .map((log: any) => String(log.actionType || "")));
      let created = 0;
      let reused = 0;

      for (const item of blockers) {
        const blockerId = String(item.id || item.title || "blocker").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
        const actionType = `competitive_parity:${blockerId}`;
        if (existing.has(actionType)) {
          reused += 1;
          continue;
        }

        await api.createOptimizationLog(brandId, {
          actionType,
          actionDescription: [
            `Competitive Parity: ${item.title || "Enterprise parity blocker"}`,
            `Benchmark: ${item.benchmark || "AthenaHQ / Peec.ai / Profound parity"}`,
            `Evidence: ${item.evidence || "Capability is missing or partial in the latest parity audit."}`,
            `Action: ${item.action || "Close this parity blocker and rerun the parity audit."}`,
            item.href ? `Route: ${item.href}` : "",
          ].filter(Boolean).join("\n"),
          estimatedImpact: item.status === "missing" ? 90 : 75,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused, total: blockers.length };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Parity action pack created" : "Parity action pack already exists",
        description: result?.created
          ? `${result.created} blocker task${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign and verify the existing parity blockers.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create parity action pack", description: error?.message, variant: "destructive" });
    },
  });

  const createProductionHardeningTasksMutation = useMutation({
    mutationFn: async () => {
      if (!brandId || !productionAudit) return { created: 0, reused: 0, total: 0 };
      const existing = new Set((optimizations || [])
        .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
        .map((log: any) => String(log.actionType || "")));
      const gates = (productionAudit.gates || [])
        .filter((gate: any) => gate?.status && gate.status !== "ready")
        .slice(0, 8);
      let created = 0;
      let reused = 0;

      for (const gate of gates) {
        const actionType = productionHardeningActionType(gate.id);
        if (existing.has(actionType)) {
          reused += 1;
          continue;
        }

        await api.createOptimizationLog(brandId, {
          actionType,
          actionDescription: [
            `Production hardening: ${gate.label || "Launch gate"}`,
            `Evidence: ${gate.evidence || "Production readiness gate is not ready."}`,
            `Action: ${gate.action || "Close this production blocker and rerun Production Readiness Audit."}`,
            gate.href ? `Route: ${gate.href}` : "",
          ].filter(Boolean).join("\n"),
          estimatedImpact: gate.status === "blocked" ? 90 : 65,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused, total: gates.length };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "production-readiness-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Launch hardening tasks created" : "Launch hardening tasks already exist",
        description: result?.created
          ? `${result.created} production gate task${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign, apply, and verify the existing production gate tasks.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create launch hardening tasks", description: error?.message, variant: "destructive" });
    },
  });

  const summary = useMemo(() => {
    const totalPrompts = prompts.length;
    const avgVisibility = totalPrompts
      ? Math.round(prompts.reduce((sum, prompt) => sum + numberValue(prompt.visibilityPct), 0) / totalPrompts)
      : numberValue((latestScore as any)?.overallScore);
    const sourceCitations = domains.reduce((sum, domain) => sum + numberValue(domain.totalCitations || domain.citationCount), 0);
    const sourceDomains = domains.length;
    const citedUrls = sources.filter((source) => source?.url).length;
    const urlOpportunities = sources.filter((source) => source?.isBrandAbsent || source?.citationType === "competitor").length;
    const competitorMentions = prompts.reduce((sum, prompt) => sum + numberValue(prompt.competitorMentionCount), 0);
    const brandMentions = prompts.reduce((sum, prompt) => sum + numberValue(prompt.brandMentionCount), 0);
    const avgPromptVolume = totalPrompts
      ? Math.round(prompts.reduce((sum, prompt) => sum + numberValue(prompt.promptVolumeScore), 0) / totalPrompts)
      : 0;
    const highOpportunityPrompts = prompts.filter((prompt) => numberValue(prompt.opportunityScore) >= 60).length;
    const productScore = numberValue(productReadiness?.score);
    const agentScore = numberValue(agentReadiness?.score);
    const crawlerVisits = numberValue(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits);
    const plannedActions = (actionData?.actions || []).length;
    const appliedActions = optimizations.filter((item) => ["applied", "verified"].includes(String(item.status || "").toLowerCase())).length;
    const verifiedActions = optimizations.filter((item) => String(item.status || "").toLowerCase() === "verified").length + numberValue(verificationData?.summary?.verified);
    const pendingVerificationTasks = numberValue(verificationData?.summary?.pending);
    const activeAlerts = numberValue(alertSummary?.summary?.total);
    const criticalAlerts = numberValue(alertSummary?.summary?.critical);
    const warningAlerts = numberValue(alertSummary?.summary?.warning);
    const scanHealthScore = numberValue(scanHealth?.score);
    const freshProviders = (scanHealth?.providers || []).filter((provider: any) => provider.status === "fresh").length;
    const totalProviders = (scanHealth?.providers || []).length;
    const enterpriseFreshProviders = numberValue(scanHealth?.providerCoverage?.enterpriseFreshCount);
    const enterpriseTargetProviders = numberValue(scanHealth?.providerCoverage?.enterpriseTargetCount, 6);
    const lockedEnterpriseProviders = (scanHealth?.providerCoverage?.configuredButPlanLocked || []).length;
    const missingEnterpriseProviders = (scanHealth?.providerCoverage?.missingForEnterprise || []).length;
    const freshPromptCoverage = numberValue(scanHealth?.prompts?.freshCoveragePct);
    const failedScanJobs = numberValue(scanHealth?.jobs?.failed);
    const overdueScanHours = numberValue(scanHealth?.schedule?.overdueHours);
    const personaScore = numberValue(audiencePersonas?.score);
    const readyPersonas = numberValue(audiencePersonas?.summary?.ready);
    const partialPersonas = numberValue(audiencePersonas?.summary?.partial);
    const missingPersonas = numberValue(audiencePersonas?.summary?.missing);
    const fanoutScore = numberValue(fanoutData?.score);
    const fanoutQueries = numberValue(fanoutData?.summary?.queryCount);
    const highOpportunityFanouts = numberValue(fanoutData?.summary?.highOpportunity);
    const fanoutMentionRate = numberValue(fanoutData?.summary?.averageMentionRate);

    return {
      avgVisibility,
      totalPrompts,
      sourceCitations,
      sourceDomains,
      citedUrls,
      urlOpportunities,
      competitorMentions,
      brandMentions,
      avgPromptVolume,
      highOpportunityPrompts,
      productScore,
      agentScore,
      crawlerVisits,
      plannedActions,
      appliedActions,
      verifiedActions,
      pendingVerificationTasks,
      activeAlerts,
      criticalAlerts,
      warningAlerts,
      scanHealthScore,
      freshProviders,
      totalProviders,
      enterpriseFreshProviders,
      enterpriseTargetProviders,
      lockedEnterpriseProviders,
      missingEnterpriseProviders,
      freshPromptCoverage,
      failedScanJobs,
      overdueScanHours,
      personaScore,
      readyPersonas,
      partialPersonas,
      missingPersonas,
      fanoutScore,
      fanoutQueries,
      highOpportunityFanouts,
      fanoutMentionRate,
      loading: latestLoading || promptsLoading,
    };
  }, [actionData, agentReadiness, alertSummary, audiencePersonas, crawlerStats, domains, fanoutData, latestLoading, latestScore, optimizations, productReadiness, prompts, promptsLoading, scanHealth, sources, verificationData]);

  const enterpriseRecoveryGroups = useMemo(() => {
    const items = scanHealth?.providerCoverage?.enterpriseRecoveryPlan || [];
    return {
      blocked: items.filter((item: any) => item.severity === "blocked"),
      planLocked: items.filter((item: any) => item.planLocked),
      retryable: items.filter((item: any) => item.canRetry && item.severity !== "blocked" && !item.planLocked),
      all: items,
    };
  }, [scanHealth?.providerCoverage?.enterpriseRecoveryPlan]);

  const activeProviderRecoveryActions = useMemo(() => new Set((optimizations || [])
    .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
    .map((log: any) => String(log.actionType || ""))
    .filter((actionType) => actionType.startsWith("provider_recovery:"))), [optimizations]);
  const activeFanoutActions = useMemo(() => new Set((optimizations || [])
    .filter((log: any) => String(log.status || "").toLowerCase() !== "verified")
    .map((log: any) => String(log.actionType || ""))
    .filter((actionType) => actionType.startsWith("query_fanout:"))), [optimizations]);

  const capabilities = useMemo<CommandCapability[]>(() => {
    const promptStatus: CoverageStatus = summary.totalPrompts >= 25 ? "live" : summary.totalPrompts > 0 ? "partial" : "missing";
    const sourceStatus: CoverageStatus = summary.sourceDomains >= 10 && summary.citedUrls >= 10 ? "live" : summary.sourceDomains > 0 ? "partial" : "missing";
    const competitorStatus: CoverageStatus = summary.competitorMentions > 0 ? "partial" : "missing";
    const productStatus: CoverageStatus = productReadiness?.relevant
      ? summary.productScore >= 60 ? "live" : "partial"
      : "live";
    const agentStatus: CoverageStatus = summary.agentScore >= 70 ? "live" : summary.agentScore > 0 ? "partial" : "missing";
    const crawlerStatus: CoverageStatus = summary.crawlerVisits > 0 ? "partial" : "missing";
    const workflowStatus: CoverageStatus = summary.verifiedActions > 0 ? "live" : summary.plannedActions + summary.appliedActions > 0 ? "partial" : "missing";
    const alertStatus: CoverageStatus = summary.criticalAlerts === 0 && summary.activeAlerts <= 2 ? "live" : summary.activeAlerts > 0 ? "partial" : "missing";
    const scanStatus: CoverageStatus = summary.scanHealthScore >= 80 ? "live" : summary.scanHealthScore >= 55 ? "partial" : "missing";
    const personaStatus: CoverageStatus = summary.readyPersonas >= 3 ? "live" : summary.readyPersonas + summary.partialPersonas > 0 ? "partial" : "missing";

    return [
      {
        title: "Durable scan operations",
        competitor: "Semrush projects, Profound monitoring",
        status: scanStatus,
        metric: `${summary.scanHealthScore}/100 health`,
        detail: `${summary.freshProviders}/${summary.totalProviders || 4} plan providers fresh; enterprise target ${summary.enterpriseFreshProviders}/${summary.enterpriseTargetProviders} fresh, ${summary.freshPromptCoverage}% prompt freshness.`,
        href: "/app/ai-command-center",
        icon: Radar,
      },
      {
        title: "Cross-model visibility monitoring",
        competitor: "Athena, Peec",
        status: promptStatus,
        metric: `${summary.totalPrompts} prompts`,
        detail: "Track prompt-level visibility, model coverage, brand mentions, and rankings.",
        href: "/app/prompts",
        icon: BarChart3,
      },
      {
        title: "Prompt volume and opportunity demand",
        competitor: "Profound Prompt Volumes, Athena prompt demand",
        status: (summary.avgPromptVolume >= 60 ? "live" : summary.avgPromptVolume > 0 ? "partial" : "missing") as CoverageStatus,
        metric: `${summary.avgPromptVolume}/100 avg volume`,
        detail: `${summary.highOpportunityPrompts} high-demand prompts need visibility work.`,
        href: "/app/prompts",
        icon: TrendingUp,
      },
      {
        title: "Query fanout intelligence",
        competitor: "Peec ChatGPT query fanouts",
        status: summary.fanoutQueries >= 100 && summary.highOpportunityFanouts === 0 ? "live" : summary.fanoutQueries > 0 ? "partial" : "missing",
        metric: `${summary.fanoutQueries} fanouts`,
        detail: `${summary.highOpportunityFanouts} high-opportunity fanout prompt${summary.highOpportunityFanouts === 1 ? "" : "s"}; ${summary.fanoutMentionRate}% average mention rate.`,
        href: "/app/prompts",
        icon: Compass,
      },
      {
        title: "Source and citation intelligence",
        competitor: "Peec, Athena",
        status: sourceStatus,
        metric: `${summary.sourceDomains} domains / ${summary.citedUrls} URLs`,
        detail: `Show exact cited URLs, model coverage, and ${summary.urlOpportunities} source acquisition opportunities.`,
        href: "/app/sources",
        icon: Globe,
      },
      {
        title: "Audience persona intelligence",
        competitor: "Profound Personas, Peec prompt segmentation",
        status: personaStatus,
        metric: `${summary.personaScore}/100`,
        detail: `${summary.readyPersonas} ready, ${summary.partialPersonas} partial, ${summary.missingPersonas} missing audience segments across buyer, trust, technical, local, and objection prompts.`,
        href: "/app/ai-command-center",
        icon: Users,
      },
      {
        title: "Competitive share of voice",
        competitor: "Athena, Profound",
        status: competitorStatus,
        metric: `${summary.competitorMentions} competitor mentions`,
        detail: "Measure who wins buyer prompts and which competitors are taking attention.",
        href: "/app/competitors",
        icon: Radar,
      },
      {
        title: "Shopping and product readiness",
        competitor: "Profound Shopping, Athena Ecommerce",
        status: productStatus,
        metric: productReadiness?.relevant ? `${summary.productScore}/100` : "Not required",
        detail: productReadiness?.relevant
          ? "Separate SKU, Amazon, D2C, catalog, schema, and listing readiness workflows."
          : "Skipped for non-product-led brands; Agent Readiness remains the active launch path.",
        href: "/app/product-readiness",
        icon: PackageCheck,
      },
      {
        title: "Agent and brand integrity readiness",
        competitor: "Athena Brand Integrity",
        status: agentStatus,
        metric: `${summary.agentScore}/100`,
        detail: "Detect schema, llms.txt, entity clarity, crawlability, and hallucination-risk gaps.",
        href: "/app/agent-readiness",
        icon: ShieldCheck,
      },
      {
        title: "Verified action workflow",
        competitor: "Semrush projects, Athena content agents",
        status: workflowStatus,
        metric: `${summary.plannedActions} planned / ${summary.appliedActions} applied / ${summary.verifiedActions} verified`,
        detail: `Mark implemented work as applied to create proof tasks automatically, then verify with scan evidence. ${summary.pendingVerificationTasks} verification task${summary.pendingVerificationTasks === 1 ? '' : 's'} pending.`,
        href: "/app/action-plan",
        icon: ClipboardList,
      },
      {
        title: "Alerts and launch monitoring",
        competitor: "Semrush alerts, Profound monitoring",
        status: alertStatus,
        metric: `${summary.activeAlerts} active`,
        detail: `${summary.criticalAlerts} critical and ${summary.warningAlerts} warning alert${summary.warningAlerts === 1 ? '' : 's'} across visibility, competitors, citations, crawlers, and verification.`,
        href: "/app/alerts",
        icon: AlertTriangle,
      },
      {
        title: "Agent analytics and attribution",
        competitor: "Profound Agent Analytics",
        status: crawlerStatus,
        metric: `${summary.crawlerVisits} visits`,
        detail: "Track AI crawler visits, inspected pages, install status, and AI-attributed conversions.",
        href: "/app/agent-analytics",
        icon: Bot,
      },
    ];
  }, [productReadiness?.relevant, summary]);

  const launchReadiness = useMemo(() => {
    if (launchReadinessData?.gates?.length) {
      return {
        score: numberValue(launchReadinessData.score),
        liveCount: launchReadinessData.gates.filter((gate: any) => gate.status === "ready").length,
        partialCount: launchReadinessData.gates.filter((gate: any) => gate.status === "partial").length,
        blockers: launchReadinessData.gates.filter((gate: any) => gate.status === "blocked"),
        verdict: launchReadinessData.verdict || "Needs launch hardening",
      };
    }
    const liveCount = capabilities.filter((capability) => capability.status === "live").length;
    const partialCount = capabilities.filter((capability) => capability.status === "partial").length;
    const score = Math.round(((liveCount * 100) + (partialCount * 55)) / (capabilities.length || 1));
    const blockers = capabilities.filter((capability) => capability.status === "missing");
    const enterpriseReady = Boolean(scanHealth?.providerCoverage?.readyForEnterprise);

    return {
      score,
      liveCount,
      partialCount,
      blockers,
      verdict: score >= 80 && enterpriseReady ? "Enterprise pilot ready" : score >= 60 ? "Pilot ready with gaps" : "Needs launch hardening",
    };
  }, [capabilities, launchReadinessData, scanHealth]);

  const launchRoadmap = useMemo<LaunchRoadmapItem[]>(() => {
    const items: LaunchRoadmapItem[] = [];
    const addItem = (item: LaunchRoadmapItem) => {
      if (items.some((existing) => existing.id === item.id)) return;
      items.push(item);
    };

    const providerCoverage = scanHealth?.providerCoverage;
    if (providerCoverage && !providerCoverage.readyForEnterprise) {
      const recoveryPlan = providerCoverage.enterpriseRecoveryPlan || [];
      addItem({
        id: "provider-coverage",
        phase: "Stabilize evidence",
        title: "Restore enterprise provider coverage",
        owner: "Ops",
        priority: "critical",
        status: "blocked",
        evidence: `${numberValue(providerCoverage.enterpriseFreshCount)}/${numberValue(providerCoverage.enterpriseTargetCount, 6)} fresh engines; ${recoveryPlan.length} recovery item${recoveryPlan.length === 1 ? "" : "s"}.`,
        action: "Run preflight, fix billing/credential blockers, then queue an enterprise pilot sweep before client reporting.",
        href: "/app/ai-command-center",
      });
    }

    if (summary.totalPrompts < 25) {
      addItem({
        id: "prompt-coverage",
        phase: "Build demand coverage",
        title: "Expand prompt portfolio",
        owner: "Strategy",
        priority: "high",
        status: "queued",
        evidence: `${summary.totalPrompts}/25 tracked prompts; ${summary.highOpportunityPrompts} high-opportunity prompts detected.`,
        action: "Add buyer, comparison, trust, local, support, and product-intent prompts, then sample them across fresh engines.",
        href: "/app/prompts",
      });
    }

    if (summary.sourceDomains < 10 || summary.citedUrls < 10) {
      addItem({
        id: "citation-depth",
        phase: "Build demand coverage",
        title: "Deepen cited-source evidence",
        owner: "Content",
        priority: "high",
        status: "queued",
        evidence: `${summary.sourceDomains} source domains and ${summary.citedUrls} cited URLs.`,
        action: "Prioritize competitor-cited domains, strengthen owned pages, and create source acquisition tasks for missing authority URLs.",
        href: "/app/sources",
      });
    }

    if (summary.fanoutQueries === 0 || summary.highOpportunityFanouts > 0) {
      addItem({
        id: "query-fanouts",
        phase: "Build demand coverage",
        title: "Turn query fanouts into content briefs",
        owner: "Content",
        priority: summary.highOpportunityFanouts > 0 ? "high" : "medium",
        status: summary.fanoutQueries > 0 ? "queued" : "blocked",
        evidence: `${summary.fanoutQueries} generated fanout queries; ${summary.highOpportunityFanouts} high-opportunity prompt${summary.highOpportunityFanouts === 1 ? "" : "s"}; ${summary.fanoutMentionRate}% average mention rate.`,
        action: "Use fanout queries to expand answer-ready sections, comparison pages, proof blocks, FAQ/schema, and cited-source targets.",
        href: "/app/prompts",
      });
    }

    if (productReadiness?.relevant && summary.productScore < 70) {
      addItem({
        id: "product-readiness",
        phase: "Implement fixes",
        title: "Prepare product/SKU launch workflow",
        owner: "Marketplace",
        priority: "high",
        status: "blocked",
        evidence: `${summary.productScore}/100 product readiness.`,
        action: "Import priority SKUs or ASINs, add competitor product mapping, generate product prompts, and export listing/schema fixes.",
        href: "/app/product-readiness",
      });
    }

    const productionGates = productionAudit?.gates?.length ? productionAudit.gates : launchReadinessData?.gates || [];
    const launchBlockers = productionGates.filter((gate: any) => gate.status === "blocked");
    launchBlockers.slice(0, 4).forEach((gate: any) => {
      addItem({
        id: `launch-${gate.id}`,
        phase: "Implement fixes",
        title: gate.label || "Launch gate blocker",
        owner: "Growth",
        priority: "critical",
        status: "blocked",
        evidence: gate.evidence || "Launch gate is blocked.",
        action: gate.action || "Resolve this launch gate before exporting client-ready reports.",
        href: gate.href || "/app/action-plan",
      });
    });

    const partialProductionGates = productionGates.filter((gate: any) => gate.status === "partial" || gate.status === "needs_hardening");
    partialProductionGates.slice(0, 3).forEach((gate: any) => {
      addItem({
        id: `launch-partial-${gate.id}`,
        phase: "Harden pilot",
        title: gate.label || "Launch gate needs hardening",
        owner: "Growth",
        priority: "high",
        status: "queued",
        evidence: gate.evidence || "Launch gate is partial.",
        action: gate.action || "Harden this gate before enterprise launch reporting.",
        href: gate.href || "/app/action-plan",
      });
    });

    (competitiveParity?.nextActions || []).slice(0, 4).forEach((action: any) => {
      addItem({
        id: `parity-${action.id}`,
        phase: "Implement fixes",
        title: action.title || "Competitive parity blocker",
        owner: "Growth",
        priority: "high",
        status: "queued",
        evidence: action.evidence || action.benchmark || "Competitive parity evidence is incomplete.",
        action: action.action || "Close this parity blocker and rerun the audit.",
        href: action.href || "/app/ai-command-center",
      });
    });

    if (summary.pendingVerificationTasks > 0 || summary.verifiedActions === 0) {
      addItem({
        id: "proof-loop",
        phase: "Prove launch",
        title: "Close the proof loop",
        owner: "Delivery",
        priority: summary.pendingVerificationTasks > 0 ? "critical" : "high",
        status: summary.pendingVerificationTasks > 0 ? "blocked" : "queued",
        evidence: `${summary.verifiedActions} verified actions; ${summary.pendingVerificationTasks} pending verification task${summary.pendingVerificationTasks === 1 ? "" : "s"}.`,
        action: "Move priority tasks through applied, verified, and rescanned states so reports show proof instead of advice.",
        href: "/app/action-plan",
      });
    }

    const rank: Record<LaunchRoadmapItem["priority"], number> = { critical: 0, high: 1, medium: 2 };
    return items.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 8);
  }, [competitiveParity, launchReadinessData, productionAudit, productReadiness?.relevant, scanHealth, summary]);

  const enterpriseDistance = useMemo(() => {
    const productionScore = numberValue(productionAudit?.score);
    const parityScore = numberValue(competitiveParity?.score);
    const combinedScore = productionScore || parityScore
      ? Math.round(((productionScore || 0) * 0.55) + ((parityScore || 0) * 0.45))
      : launchReadiness.score;
    const productionBlockers = Array.isArray(productionAudit?.blocked) ? productionAudit.blocked.length : 0;
    const parityBlockers = Array.isArray(competitiveParity?.blockers) ? competitiveParity.blockers.length : 0;
    const productionPartials = Array.isArray(productionAudit?.partial) ? productionAudit.partial.length : 0;
    const parityPartials = Array.isArray(competitiveParity?.capabilities)
      ? competitiveParity.capabilities.filter((item: any) => item.status === "partial").length
      : 0;
    const enterpriseReady = combinedScore >= 85 && productionBlockers === 0 && parityBlockers === 0;
    const pilotReady = combinedScore >= 70 && productionBlockers <= 2;
    const nextActions = [
      ...(productionAudit?.nextActions || []).map((item: any) => ({ ...item, source: "Production" })),
      ...(competitiveParity?.nextActions || []).map((item: any) => ({ ...item, source: "Parity" })),
    ].slice(0, 6);

    return {
      combinedScore,
      productionScore,
      parityScore,
      productionBlockers,
      parityBlockers,
      productionPartials,
      parityPartials,
      nextActions,
      verdict: enterpriseReady ? "Enterprise comparable" : pilotReady ? "Pilot sellable, not Semrush-level yet" : "Launch hardening required",
      narrative: enterpriseReady
        ? "The current evidence supports a stronger Athena/Peec/Profound-style enterprise claim. Keep weekly proof, scans, and reports active."
        : pilotReady
          ? "The app is credible for Indian brand pilots, but Semrush-level positioning still needs fewer launch blockers, stronger attribution, and more verified outcomes."
          : "Do not sell this as a Semrush replacement yet. Sell the diagnostic and implementation workflow while closing the critical proof gates.",
    };
  }, [competitiveParity, launchReadiness.score, productionAudit]);

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="AI Command Center" />
        <p className="text-muted-foreground">Select a brand to view AI search readiness.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="AI Command Center" showExport />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">AI Search Operating System</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Unified view of {brand?.name || "this brand"} across visibility, source trust, product readiness, agent readiness, and launch gaps.
          </p>
        </div>
        <Badge variant="outline" className="w-fit text-sm">
          {launchReadiness.verdict}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Launch Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{launchReadiness.score}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={launchReadiness.score} className="mt-3 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Visibility</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.avgVisibility}<span className="text-sm text-muted-foreground">%</span></div>
            <p className="text-xs text-muted-foreground mt-2">{summary.totalPrompts} tracked prompts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Source Citations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.sourceCitations}</div>
            <p className="text-xs text-muted-foreground mt-2">{summary.sourceDomains} domains · {summary.citedUrls} URLs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Brand vs Competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.brandMentions}:{summary.competitorMentions}</div>
            <p className="text-xs text-muted-foreground mt-2">mention ratio in sampled prompts</p>
          </CardContent>
        </Card>
      </div>

      {launchTrend ? (
        <Card data-testid="launch-trend-monitor">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Launch Trend Monitor
                </CardTitle>
                <CardDescription>
                  Historical movement across visibility score, enterprise providers, proof workflow, and scan reliability.
                </CardDescription>
              </div>
              <Badge variant="outline" className={cn(
                launchTrend.scoreDirection === "up" ? STATUS_STYLES.live : launchTrend.scoreDirection === "flat" ? STATUS_STYLES.partial : STATUS_STYLES.missing
              )}>
                {launchTrend.verdict}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Visibility movement</p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {launchTrend.scoreDelta > 0 ? "+" : ""}{numberValue(launchTrend.scoreDelta)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{numberValue(launchTrend.previousScore)} to {numberValue(launchTrend.currentScore)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Enterprise providers</p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {numberValue(launchTrend.providerTrend?.freshEnterpriseProviders)}/{numberValue(launchTrend.providerTrend?.enterpriseTargetProviders, 6)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{numberValue(launchTrend.providerTrend?.failedEnterpriseProviders)} failing</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Proof workflow</p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {numberValue(launchTrend.workflowTrend?.verifiedActions)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {numberValue(launchTrend.workflowTrend?.appliedActions)} applied · {numberValue(launchTrend.workflowTrend?.pendingProofTasks)} proof pending
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Scan reliability</p>
                <p className="mt-1 font-mono text-2xl font-bold">{numberValue(launchTrend.scanTrend?.failureRate)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{numberValue(launchTrend.scanTrend?.failedJobs)} failed of {numberValue(launchTrend.scanTrend?.scanJobs)} jobs</p>
              </div>
            </div>
            {launchTrend.historicalConfidence ? (
              <div className="rounded-md border bg-muted/20 p-3" data-testid="launch-trend-confidence">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Historical Confidence</p>
                    <p className="mt-1 text-xs text-muted-foreground">{launchTrend.historicalConfidence.evidence}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    launchTrend.historicalConfidence.status === "ready" ? STATUS_STYLES.live : launchTrend.historicalConfidence.status === "partial" ? STATUS_STYLES.partial : STATUS_STYLES.missing
                  )}>
                    {numberValue(launchTrend.historicalConfidence.score)}/100 {launchTrend.historicalConfidence.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs">{launchTrend.historicalConfidence.action}</p>
              </div>
            ) : null}
            {(launchTrend.blockers || []).length > 0 ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-semibold">Trend blockers</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(launchTrend.blockers || []).slice(0, 6).map((blocker: string) => (
                    <div key={blocker} className="flex gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>{blocker}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {(launchTrend.nextActions || []).length > 0 ? (
              <div className="grid gap-2 md:grid-cols-3">
                {(launchTrend.nextActions || []).slice(0, 3).map((action: string) => (
                  <div key={action} className="rounded-md border p-3 text-xs">
                    {action}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {launchRoadmap.length > 0 ? (
        <Card data-testid="enterprise-launch-roadmap">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Enterprise Launch Roadmap
                </CardTitle>
                <CardDescription>
                  Sequenced workstreams to move this brand from diagnostic coverage to a client-ready AI search launch.
                </CardDescription>
              </div>
              <Badge variant="outline">{launchRoadmap.filter((item) => item.priority === "critical").length} critical</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-2">
              {launchRoadmap.map((item) => {
                const status = item.status === "ready" ? "live" : item.status === "queued" ? "partial" : "missing";
                return (
                  <div key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.phase}</Badge>
                      <Badge variant={item.priority === "critical" ? "destructive" : item.priority === "high" ? "secondary" : "outline"} className="capitalize">
                        {item.priority}
                      </Badge>
                      <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
                        {item.status}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">{item.owner}</span>
                    </div>
                    <p className="mt-3 font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
                    <p className="mt-2 text-xs">{item.action}</p>
                    <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                      <Link href={item.href}>
                        Open workstream
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {marketOpportunities?.opportunities?.length ? (
        <Card data-testid="market-opportunity-queue">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Market Opportunity Queue
                </CardTitle>
                <CardDescription>
                  Semrush-style prioritized work queue across prompts, citations, launch gates, answer risks, and product readiness.
                </CardDescription>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{marketOpportunities.summary?.high || 0}</div>
                  <div className="text-muted-foreground">high</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{marketOpportunities.summary?.prompt || 0}</div>
                  <div className="text-muted-foreground">prompt</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{marketOpportunities.summary?.source || 0}</div>
                  <div className="text-muted-foreground">source</div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {marketOpportunities.opportunities.slice(0, 8).map((opportunity: any) => (
              <div key={opportunity.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={opportunity.priority === "high" ? "destructive" : opportunity.priority === "medium" ? "secondary" : "outline"} className="capitalize">
                      {opportunity.priority}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{String(opportunity.type || "").replace(/_/g, " ")}</Badge>
                    {opportunity.status === "in_workflow" ? <Badge variant="secondary">In workflow</Badge> : null}
                    <span className="font-mono text-sm font-semibold">{opportunity.score}/100</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{opportunity.title}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{opportunity.target}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{opportunity.evidence}</p>
                  <p className="mt-1 text-xs">{opportunity.recommendedAction}</p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    size="sm"
                    onClick={() => marketOpportunityTaskMutation.mutate(opportunity)}
                    disabled={marketOpportunityTaskMutation.isPending || opportunity.status === "in_workflow"}
                    data-testid={`button-add-market-opportunity-${String(opportunity.id || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                  >
                    {opportunity.status === "in_workflow" ? "In workflow" : "Add to workflow"}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={opportunity.href || "/app/action-plan"}>
                      Open
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {fanoutData ? (
        <Card data-testid="command-center-fanout-intelligence">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Compass className="h-5 w-5 text-primary" />
                  Query Fanout Intelligence
                </CardTitle>
                <CardDescription>
                  Peec-style subquery intelligence showing the topics, source themes, and content briefs AI systems may fan out from tracked prompts.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border px-3 py-2">
                    <div className="font-mono text-lg font-bold">{summary.highOpportunityFanouts}</div>
                    <div className="text-muted-foreground">priority</div>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <div className="font-mono text-lg font-bold">{summary.fanoutQueries}</div>
                    <div className="text-muted-foreground">fanouts</div>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <div className="font-mono text-lg font-bold">{summary.fanoutMentionRate}%</div>
                    <div className="text-muted-foreground">mentions</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => createTopFanoutBriefsMutation.mutate()}
                  disabled={createTopFanoutBriefsMutation.isPending || !(fanoutData.fanouts || []).some((fanout: any) => fanout.status === "high_opportunity")}
                  data-testid="button-create-top-fanout-briefs"
                >
                  <ClipboardList className="mr-2 h-3.5 w-3.5" />
                  {createTopFanoutBriefsMutation.isPending ? "Creating..." : "Create fanout briefs"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(fanoutData.fanouts || []).length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {(fanoutData.fanouts || []).slice(0, 6).map((fanout: any) => {
                  const actionType = `query_fanout:${fanout.promptId}`;
                  const existing = activeFanoutActions.has(actionType);
                  return (
                  <div key={fanout.promptId} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={fanout.status === "high_opportunity" ? "destructive" : fanout.status === "watch" ? "secondary" : "outline"} className="capitalize">
                        {String(fanout.status || "watch").replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{fanout.intent || "discovery"}</Badge>
                      <Badge variant="outline">{numberValue(fanout.mentionRate)}% mention rate</Badge>
                      {existing ? <Badge variant="secondary">In workflow</Badge> : null}
                      <span className="ml-auto font-mono font-semibold">{numberValue(fanout.opportunityScore)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 font-medium">{fanout.prompt}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Fanout queries</p>
                        <div className="mt-2 space-y-1">
                          {(fanout.fanoutQueries || []).slice(0, 3).map((query: string) => (
                            <p key={query} className="text-xs">{query}</p>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Actions</p>
                        <div className="mt-2 space-y-1">
                          {(fanout.contentActions || []).slice(0, 2).map((action: string) => (
                            <p key={action} className="text-xs">{action}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => promptFanoutTaskMutation.mutate(fanout.promptId)}
                        disabled={existing || promptFanoutTaskMutation.isPending || !fanout.promptId}
                        data-testid={`button-add-fanout-task-${String(fanout.promptId || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                      >
                        {existing ? "In workflow" : "Add to workflow"}
                      </Button>
                      <Button variant="ghost" size="sm" className="px-0" asChild>
                        <Link href="/app/prompts">
                          Open prompt fanouts
                          <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Add prompts and run sampling to generate answer-derived fanout intelligence.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {answerIntelligence?.summary ? (
        <Card data-testid="answer-intelligence-panel">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Answer Intelligence
                </CardTitle>
                <CardDescription>
                  Peec/Profound-style sentiment, rank position, and AI perception across tracked answers.
                </CardDescription>
              </div>
              <div className="text-left md:text-right">
                <div className="text-3xl font-bold font-mono">
                  {numberValue(answerIntelligence.score)}
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Badge variant="outline" className="mt-2">{answerIntelligence.verdict}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Mention Rate</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(answerIntelligence.summary.mentionRate)}%</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Brand Share</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(answerIntelligence.summary.brandShare)}%</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Avg Position</p>
                <p className="mt-1 text-2xl font-bold font-mono">{answerIntelligence.summary.avgPosition ?? "N/A"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sentiment</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(answerIntelligence.summary.sentimentScore)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Prompt Risks</p>
                <p className="mt-1 text-2xl font-bold font-mono">{(answerIntelligence.promptRisks || []).length}</p>
              </div>
            </div>

            {(answerIntelligence.byProvider || []).length > 0 ? (
              <div className="grid gap-2 md:grid-cols-4">
                {(answerIntelligence.byProvider || []).slice(0, 4).map((provider: any) => (
                  <div key={provider.provider} className="rounded-md bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{provider.provider}</span>
                      <span className="font-mono">{numberValue(provider.shareOfVoice)}%</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {numberValue(provider.brandMentions)} brand mentions, avg position {provider.avgPosition ?? "N/A"}, sentiment {numberValue(provider.sentimentScore)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {(answerIntelligence.promptRisks || []).length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-3" data-testid="answer-intelligence-risks">
                <p className="text-sm font-semibold">Highest-risk answer gaps</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(answerIntelligence.promptRisks || []).slice(0, 4).map((risk: any) => (
                    <div key={risk.answerId} className="rounded-md border bg-background p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 font-medium">{risk.prompt}</p>
                        <Badge variant={risk.severity === "high" ? "destructive" : "outline"} className="capitalize">{risk.severity}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{risk.action}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => answerRiskTaskMutation.mutate(risk.answerId)}
                          disabled={answerRiskTaskMutation.isPending}
                          data-testid={`button-add-answer-risk-${risk.answerId}`}
                        >
                          Add to workflow
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/app/action-plan">
                            Open workflow
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(answerIntelligence.nextActions || []).length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {(answerIntelligence.nextActions || []).slice(0, 4).map((action: string) => (
                  <div key={action} className="flex gap-3 rounded-md border p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {audiencePersonas?.personas?.length ? (
        <Card data-testid="audience-persona-intelligence">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5 text-primary" />
                  Audience Persona Intelligence
                </CardTitle>
                <CardDescription>
                  Profound-style audience segmentation across buyer, trust, technical, India/local, and objection-led prompts.
                </CardDescription>
              </div>
              <div className="text-left md:text-right">
                <div className="text-3xl font-bold font-mono">
                  {numberValue(audiencePersonas.score)}
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Badge variant="outline" className="mt-2">{audiencePersonas.verdict}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Ready Personas</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(audiencePersonas.summary?.ready)}/{numberValue(audiencePersonas.summary?.personas)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Prompt Base</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(audiencePersonas.summary?.totalPrompts)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Answer Evidence</p>
                <p className="mt-1 text-2xl font-bold font-mono">{numberValue(audiencePersonas.summary?.totalAnswers)}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              {(audiencePersonas.personas || []).map((persona: any) => {
                const status = persona.status === "ready" ? "live" : persona.status === "partial" ? "partial" : "missing";
                return (
                  <div key={persona.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{persona.label}</p>
                      <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>{persona.status}</Badge>
                    </div>
                    <p className="mt-2 font-mono text-lg font-bold">{numberValue(persona.score)}/100</p>
                    <p className="mt-1 text-xs text-muted-foreground">{persona.evidence}</p>
                    <p className="mt-2 text-xs">{persona.gap}</p>
                    {persona.status !== "ready" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={() => audiencePersonaTaskMutation.mutate(persona.id)}
                        disabled={audiencePersonaTaskMutation.isPending}
                        data-testid={`button-add-persona-task-${persona.id}`}
                      >
                        Add to workflow
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {(audiencePersonas.nextActions || []).length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-3" data-testid="audience-persona-next-actions">
                <p className="text-sm font-semibold">Persona coverage to build next</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(audiencePersonas.nextActions || []).slice(0, 4).map((action: any) => (
                    <Link key={action.id} href={action.href || "/app/prompts"} className="rounded-md border bg-background p-3 text-sm hover:bg-muted/40">
                      <p className="font-medium">{action.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{action.evidence}</p>
                      <p className="mt-2 text-xs">{action.action}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {competitiveParity?.capabilities?.length ? (
        <Card data-testid="competitive-parity-audit">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Search className="h-5 w-5 text-primary" />
                  Competitive Parity Audit
                </CardTitle>
                <CardDescription>
                  Server-backed score against AthenaHQ, Peec.ai, Profound, and Semrush-style enterprise expectations.
                </CardDescription>
              </div>
              <div className="text-left md:text-right">
                <div className="text-3xl font-bold font-mono">
                  {numberValue(competitiveParity.score)}
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Badge variant="outline" className="mt-2">{competitiveParity.verdict}</Badge>
                {(competitiveParity.nextActions || []).length > 0 ? (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => createParityActionPackMutation.mutate()}
                    disabled={createParityActionPackMutation.isPending}
                    data-testid="button-create-parity-action-pack"
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    {createParityActionPackMutation.isPending ? "Creating..." : "Create action pack"}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {(competitiveParity.capabilities || []).slice(0, 9).map((item: any) => {
                const status = item.status === "ready" ? "live" : item.status === "partial" ? "partial" : "missing";
                return (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.benchmark}</p>
                      </div>
                      <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>{item.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{item.evidence}</p>
                    <p className="mt-2 text-xs">{item.gap}</p>
                    <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                      <Link href={item.href || "/app/ai-command-center"}>
                        Open
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
            {(competitiveParity.nextActions || []).length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-3" data-testid="competitive-parity-next-actions">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold">Parity blockers to close next</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createParityActionPackMutation.mutate()}
                    disabled={createParityActionPackMutation.isPending}
                    data-testid="button-create-parity-action-pack-secondary"
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Add blockers to workflow
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(competitiveParity.nextActions || []).slice(0, 6).map((action: any) => (
                    <Link key={action.id} href={action.href || "/app/action-plan"} className="rounded-md border bg-background p-3 text-sm hover:bg-muted/40">
                      <p className="font-medium">{action.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{action.action}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {launchReadinessData?.gates?.length ? (
        <Card data-testid="launch-readiness-scorecard">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Launch Readiness Gates
            </CardTitle>
            <CardDescription>
              Backend scorecard used for executive reports, alerts, and launch decisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {(launchReadinessData.gates || []).slice(0, 9).map((gate: any) => {
                const status = gate.status === "ready" ? "live" : gate.status === "partial" ? "partial" : "missing";
                return (
                  <div key={gate.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{gate.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{gate.evidence}</p>
                      </div>
                      <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>{gate.status}</Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{gate.action}</p>
                    <Button variant="ghost" size="sm" className="mt-2 px-0" asChild>
                      <Link href={gate.href || "/app/ai-command-center"}>
                        Open
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
            {(launchReadinessData.nextActions || []).length > 0 ? (
              <div className="rounded-md border bg-muted/30 p-3" data-testid="launch-readiness-next-actions">
                <p className="text-sm font-semibold">Next launch actions</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(launchReadinessData.nextActions || []).slice(0, 6).map((action: any) => (
                    <Link key={action.id} href={action.href || "/app/action-plan"} className="rounded-md border bg-background p-3 text-sm hover:bg-muted/40">
                      <p className="font-medium">{action.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{action.action}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radar className="h-5 w-5 text-primary" />
                Scan Operations Health
              </CardTitle>
              <CardDescription>
                Freshness, provider coverage, queue state, and schedule health behind every visibility score.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                variant="outline"
                onClick={() => queueEnterprisePilotMutation.mutate()}
                disabled={queueEnterprisePilotMutation.isPending}
                data-testid="button-queue-enterprise-pilot-sweep"
              >
                {queueEnterprisePilotMutation.isPending ? "Queueing..." : "Enterprise pilot sweep"}
              </Button>
              <Button
                size="sm"
                onClick={() => queueScanRunMutation.mutate()}
                disabled={queueScanRunMutation.isPending}
                data-testid="button-queue-scan-operations"
              >
                {queueScanRunMutation.isPending ? "Queueing..." : "Queue scan run"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Health Score</p>
              <p className="mt-1 text-2xl font-bold font-mono">{summary.scanHealthScore}<span className="text-sm text-muted-foreground">/100</span></p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fresh Providers</p>
              <p className="mt-1 text-2xl font-bold font-mono">{summary.freshProviders}/{summary.totalProviders || 4}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fresh Prompt Coverage</p>
              <p className="mt-1 text-2xl font-bold font-mono">{summary.freshPromptCoverage}%</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Failed Jobs</p>
              <p className="mt-1 text-2xl font-bold font-mono">{summary.failedScanJobs}</p>
            </div>
          </div>
          {scanHealth?.providerCoverage ? (
            <div className="mt-4 rounded-md border bg-background p-4" data-testid="enterprise-provider-coverage">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold">Enterprise Provider Coverage</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current plan: {scanHealth.providerCoverage.plan || "free"}. Enterprise launch target: {summary.enterpriseFreshProviders}/{summary.enterpriseTargetProviders} fresh providers.
                  </p>
                </div>
                <Badge variant="outline" className={cn(
                  scanHealth.providerCoverage.readyForEnterprise ? STATUS_STYLES.live : STATUS_STYLES.partial
                )}>
                  {scanHealth.providerCoverage.readyForEnterprise ? "enterprise ready" : "coverage gap"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => providerPreflightMutation.mutate()}
                  disabled={providerPreflightMutation.isPending || !(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length}
                  data-testid="button-provider-preflight"
                >
                  {providerPreflightMutation.isPending ? "Checking..." : "Preflight blockers"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => queueEnterprisePilotMutation.mutate()}
                  disabled={queueEnterprisePilotMutation.isPending}
                  data-testid="button-queue-enterprise-pilot-sweep-inline"
                >
                  {queueEnterprisePilotMutation.isPending ? "Queueing..." : "Enterprise pilot sweep"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => createAllProviderRecoveryTasksMutation.mutate()}
                  disabled={createAllProviderRecoveryTasksMutation.isPending || !(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length}
                  data-testid="button-command-center-create-provider-recovery-tasks"
                >
                  <ClipboardList className="mr-2 h-3.5 w-3.5" />
                  {createAllProviderRecoveryTasksMutation.isPending ? "Adding..." : "Create recovery tasks"}
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Fresh enterprise engines</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{summary.enterpriseFreshProviders}/{summary.enterpriseTargetProviders}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Configured but plan-locked</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{summary.lockedEnterpriseProviders}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Missing credentials</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{summary.missingEnterpriseProviders}</p>
                </div>
              </div>
              {(enterpriseRecoveryGroups.all || []).length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3" data-testid="enterprise-provider-blocker-summary">
                  <div className="rounded-md border bg-background p-3 text-xs">
                    <p className="font-semibold">Billing or credential blockers</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{enterpriseRecoveryGroups.blocked.length}</p>
                    <p className="mt-1 text-muted-foreground">Fix keys, billing, quota, or suspended API projects before rerunning sweeps.</p>
                  </div>
                  <div className="rounded-md border bg-background p-3 text-xs">
                    <p className="font-semibold">Plan-locked engines</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{enterpriseRecoveryGroups.planLocked.length}</p>
                    <p className="mt-1 text-muted-foreground">Upgrade this brand before claiming enterprise multi-engine coverage.</p>
                  </div>
                  <div className="rounded-md border bg-background p-3 text-xs">
                    <p className="font-semibold">Retryable sampling gaps</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{enterpriseRecoveryGroups.retryable.length}</p>
                    <p className="mt-1 text-muted-foreground">Queue an enterprise pilot sweep after blockers and plan access are resolved.</p>
                  </div>
                </div>
              ) : null}
              {summary.lockedEnterpriseProviders > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Upgrade this brand to an Enterprise plan before claiming full multi-engine coverage; configured engines outside the current plan will not be swept.
                </p>
              ) : null}
              {scanHealth.providerPreflight ? (
                <div className="mt-3 rounded-md border p-3 text-xs" data-testid="latest-provider-preflight">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Latest preflight</p>
                      <p className="mt-1 text-muted-foreground">
                        {scanHealth.providerPreflight.finishedAt
                          ? new Date(scanHealth.providerPreflight.finishedAt).toLocaleString()
                          : "Run in progress"} · {scanHealth.providerPreflight.passed || 0} passed, {scanHealth.providerPreflight.failed || 0} blocked
                      </p>
                    </div>
                    <Badge variant="outline" className={cn(
                      scanHealth.providerPreflight.ok ? STATUS_STYLES.live : STATUS_STYLES.missing
                    )}>
                      {scanHealth.providerPreflight.ok ? "passed" : "blockers found"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(scanHealth.providerPreflight.results || []).map((result: any) => (
                      <div key={`preflight-${result.provider}`} className="rounded-md bg-muted/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{result.provider}</span>
                          <Badge variant="outline" className={cn(
                            "capitalize",
                            result.ok ? STATUS_STYLES.live : STATUS_STYLES.missing
                          )}>
                            {String(result.status || (result.ok ? "ok" : "failed")).replace(/_/g, " ")}
                          </Badge>
                        </div>
                        {result.envHint ? (
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{result.envHint}</p>
                        ) : null}
                        {result.message ? (
                          <p className="mt-1 line-clamp-2 text-muted-foreground">{result.message}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).map((item: any) => {
                    const provider = String(item.provider || "provider").toLowerCase();
                    const actionType = `provider_recovery:${provider}`;
                    const existing = activeProviderRecoveryActions.has(actionType);
                    return (
                      <div key={`enterprise-${item.provider}`} className="rounded-md border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{item.provider}</span>
                          <Badge variant="outline" className={cn(
                            "capitalize",
                            item.severity === "blocked" ? STATUS_STYLES.missing :
                              item.severity === "watch" ? STATUS_STYLES.partial :
                                STATUS_STYLES.missing
                          )}>
                            {existing ? "in workflow" : item.planLocked ? "plan locked" : String(item.severity || "review").replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-muted-foreground">{item.cause}</p>
                        <p className="mt-1">{item.action}</p>
                        {item.envHint ? (
                          <p className="mt-2 font-mono text-[11px] text-muted-foreground">{item.envHint}</p>
                        ) : null}
                        {item.latestError ? (
                          <p className="mt-2 line-clamp-3 text-red-600">{item.latestError}</p>
                        ) : null}
                        <div className="mt-3 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          <p className="font-medium text-foreground">Proof required to clear</p>
                          <p className="mt-1">Passing provider preflight, one completed enterprise sweep run, one fresh answer, and zero failed runs after the recovery task is applied.</p>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createAllProviderRecoveryTasksMutation.mutate()}
                            disabled={existing || createAllProviderRecoveryTasksMutation.isPending}
                            data-testid={`button-command-center-provider-recovery-${provider}`}
                          >
                            {existing ? "In workflow" : createAllProviderRecoveryTasksMutation.isPending ? "Adding..." : "Add recovery task"}
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link href="/app/action-plan">
                              Review
                              <ExternalLink className="ml-2 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {(scanHealth?.providers || []).length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {(scanHealth.providers || []).map((provider: any) => (
                <div key={provider.provider} className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{provider.provider}</span>
                    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[provider.status === "fresh" ? "live" : provider.status === "stale" ? "partial" : "missing"])}>
                      {String(provider.status || "unknown").replace("_", " ")}
                    </Badge>
                  </div>
                  {provider.latestError ? (
                    <p className="mt-2 line-clamp-2 text-xs text-red-600">{provider.latestError}</p>
                  ) : provider.answerlessCompletedRuns ? (
                    <p className="mt-2 text-xs text-red-600">{provider.answerlessCompletedRuns} completed run{provider.answerlessCompletedRuns === 1 ? "" : "s"} produced no answer.</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {provider.ageHours == null ? "No signal yet" : `${provider.ageHours}h old`} · {provider.totalAnswers || 0} answers
                  </p>
                </div>
              ))}
            </div>
          )}
          {(scanHealth?.recoveryPlan || []).length > 0 && (
            <div className="mt-4 rounded-md border bg-background p-4" data-testid="scan-provider-recovery-plan">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Provider Recovery Runbook</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(scanHealth.recoveryPlan || []).slice(0, 4).map((item: any) => (
                  <div key={`${item.provider}-${item.status}`} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{item.provider}</span>
                      <Badge variant="outline" className={cn(
                        "capitalize",
                        item.severity === "blocked" ? STATUS_STYLES.missing :
                          item.severity === "watch" ? STATUS_STYLES.partial :
                            STATUS_STYLES.missing
                      )}>
                        {String(item.severity || "review").replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.cause}</p>
                    <p className="mt-2 text-xs">{item.action}</p>
                    <p className="mt-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      Verification needs a passing preflight plus fresh provider answer evidence after the task is applied.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {item.envHint ? <Badge variant="outline">{item.envHint}</Badge> : null}
                      <Badge variant="outline">{item.canRetry ? "Retry after check" : "Fix before retry"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(scanHealth?.nextActions || []).length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {(scanHealth.nextActions || []).slice(0, 4).map((action: string) => (
                <div key={action} className="flex gap-3 rounded-md border p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          )}
          {scanHistory?.summary ? (
            <div className="mt-4 rounded-md border bg-muted/20 p-3" data-testid="scan-operations-history">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold">Run History</p>
                  <p className="text-xs text-muted-foreground">
                    {numberValue(scanHistory.summary.manifests)} manual runs, {numberValue(scanHistory.summary.scanJobs)} scan jobs, {numberValue(scanHistory.summary.providerRuns)} provider runs, {numberValue(scanHistory.summary.failureRate)}% job failure, {numberValue(scanHistory.summary.providerRunFailureRate)}% provider failure.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(scanHistory.providers || []).slice(0, 4).map((provider: any) => (
                    <Badge key={provider.provider} variant="outline" className={cn("capitalize", numberValue(provider.failed) > 0 ? "border-amber-300 text-amber-700" : "")}>
                      {provider.provider}: {numberValue(provider.completed)}/{numberValue(provider.total)}{numberValue(provider.failed) > 0 ? `, ${numberValue(provider.failed)} failed` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
              {(scanHistory.recentJobs || []).length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(scanHistory.recentJobs || []).slice(0, 4).map((job: any) => {
                    const status = String(job.status || "pending").toLowerCase();
                    return (
                      <div key={job.id} className="rounded-md border bg-background p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{String(job.type || "scan").replace(/_/g, " ")}</span>
                          <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status === "completed" ? "live" : status === "failed" ? "missing" : "partial"])}>
                            {status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : "Queued"}{job.durationSeconds ? ` · ${job.durationSeconds}s` : ""}
                        </p>
                        {job.error ? <p className="mt-1 line-clamp-2 text-red-600">{job.error}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {(scanHistory.manifests || []).length > 0 ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(scanHistory.manifests || []).slice(0, 2).map((run: any) => {
                    const status = String(run.status || "queued").toLowerCase();
                    return (
                      <div key={run.id} className="rounded-md border bg-background p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Manual scan run</span>
                          <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status === "completed" ? "live" : status === "failed" ? "missing" : "partial"])}>
                            {status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {run.queuedAt ? new Date(run.queuedAt).toLocaleString() : "Queued"} · {numberValue(run.queuedJobs)} queued jobs
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {numberValue(run.promptJobs)} prompt jobs, {numberValue(run.downstreamJobs)} downstream, {numberValue(run.persistedJobs)} persisted
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5 text-primary" />
            Competitor-Parity Matrix
          </CardTitle>
          <CardDescription>
            What a buyer expects after seeing AthenaHQ, Peec.ai, and Profound-style positioning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <div key={capability.title} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-sm">{capability.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Comparable promise: {capability.competitor}</p>
                    </div>
                    <Badge variant="outline" className={cn("gap-1 shrink-0", STATUS_STYLES[capability.status])}>
                      {statusIcon(capability.status)}
                      {statusLabel(capability.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{capability.detail}</p>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold">{capability.metric}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href={capability.href}>
                      Open
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Semrush-Level Distance
                </CardTitle>
                <CardDescription>Live distance from pilot-ready AI visibility workflow to enterprise-grade platform claim.</CardDescription>
              </div>
              {(productionAudit?.gates || []).some((gate: any) => gate.status !== "ready") ? (
                <Button
                  size="sm"
                  onClick={() => createProductionHardeningTasksMutation.mutate()}
                  disabled={createProductionHardeningTasksMutation.isPending}
                  data-testid="button-create-command-center-production-hardening-tasks"
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  {createProductionHardeningTasksMutation.isPending ? "Creating..." : "Create hardening tasks"}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Combined distance</p>
                <p className="mt-1 font-mono text-2xl font-bold">{enterpriseDistance.combinedScore}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Production audit</p>
                <p className="mt-1 font-mono text-2xl font-bold">{enterpriseDistance.productionScore}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Competitor parity</p>
                <p className="mt-1 font-mono text-2xl font-bold">{enterpriseDistance.parityScore}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Open blockers</p>
                <p className="mt-1 font-mono text-2xl font-bold">{enterpriseDistance.productionBlockers + enterpriseDistance.parityBlockers}</p>
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold">{enterpriseDistance.verdict}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{enterpriseDistance.narrative}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{enterpriseDistance.productionPartials} production partial</Badge>
                  <Badge variant="outline">{enterpriseDistance.parityPartials} parity partial</Badge>
                </div>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2" data-testid="semrush-distance-next-actions">
              {(enterpriseDistance.nextActions.length ? enterpriseDistance.nextActions : launchRoadmap).slice(0, 6).map((item: any, index: number) => (
                <Link
                  key={`${item.source || item.phase || "roadmap"}-${item.id || item.title || index}`}
                  href={item.href || "/app/action-plan"}
                  className="rounded-md border p-3 text-sm hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant="outline">{item.source || item.phase || "Roadmap"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
                  <p className="mt-2 text-xs">{item.action}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Launch Narrative
            </CardTitle>
            <CardDescription>Positioning that fits the current product state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Sell this as AI visibility readiness plus execution for Indian brands and Amazon sellers, not yet as a full Semrush replacement.
            </p>
            <p>
              The credible pilot promise is: find AI visibility gaps, produce fix plans, create schema/FAQ/AXP assets, and track whether visibility improves.
            </p>
            <p>
              The Semrush-level promise needs durable data volume, historical benchmarking, alerts, attribution, and verified workflows.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
