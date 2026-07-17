import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  FileDown,
  Mail,
  PackageCheck,
  Plus,
  Send,
  SearchCheck,
  Trash2,
  ExternalLink,
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
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type ReportPreview = {
  brandName?: string;
  domain?: string;
  overallScore?: number;
  previousScore?: number;
  scoreDelta?: number;
  competitorCount?: number;
  topicCount?: number;
  totalMentions?: number;
  topTopics?: Array<{ name: string; score: number; position?: number }>;
  competitors?: Array<{ name: string; score: number }>;
};

type ReportSchedule = {
  id: string;
  frequency: "weekly" | "monthly";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  time: string;
  reportType: "executive" | "full" | "action" | "ai_search_opportunity" | "launch_readiness" | "competitive_parity" | "market_opportunity" | "verification_evidence" | "scan_operations" | "production_readiness" | "product_visibility";
  recipients: string[];
  isActive?: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

const SCHEDULE_REPORT_TYPES = [
  { value: "executive", label: "Executive" },
  { value: "full", label: "Full analysis" },
  { value: "action", label: "Action plan" },
  { value: "ai_search_opportunity", label: "AI search opportunity" },
  { value: "launch_readiness", label: "Launch readiness" },
  { value: "competitive_parity", label: "Competitive parity" },
  { value: "market_opportunity", label: "Market opportunity" },
  { value: "verification_evidence", label: "Verification evidence" },
  { value: "scan_operations", label: "Scan operations" },
  { value: "production_readiness", label: "Production readiness" },
  { value: "product_visibility", label: "Product visibility" },
] as const;

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

function escapeReportHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function productionHardeningActionType(gateId: string) {
  return `production_hardening:${String(gateId || "gate").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}`;
}

function getScheduleReportTypeLabel(value: ReportSchedule["reportType"]) {
  return SCHEDULE_REPORT_TYPES.find((type) => type.value === value)?.label || value;
}

function optimizationSourceLabel(actionType: unknown) {
  const value = String(actionType || "");
  if (value.startsWith("agent_readiness:")) return "Agent Readiness";
  if (value.startsWith("answer_intelligence:")) return "Answer Intelligence";
  if (value.startsWith("citation_opportunity:")) return "Citation Opportunity";
  if (value.startsWith("query_fanout:")) return "Query Fanout";
  if (value.startsWith("market_opportunity:")) return "Market Opportunity";
  if (value.startsWith("product_pilot:")) return "Product Readiness";
  if (value.startsWith("provider_recovery:")) return "Provider Recovery";
  if (value.startsWith("production_hardening:")) return "Production Hardening";
  return "Action Workflow";
}

export default function ReportsCenter() {
  const { brandId, brand } = useCurrentBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState("executive");
  const [timeframe, setTimeframe] = useState("monthly");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [recipientInput, setRecipientInput] = useState((brand as any)?.contactEmail || "");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const enabled = Boolean(brandId);
  const { data: preview, isFetching: previewFetching } = useQuery<ReportPreview>({
    queryKey: ["reports-center", brandId, "preview"],
    queryFn: () => api.getReportPreview(brandId || ""),
    enabled,
  });
  const { data: schedules = [], isFetching: schedulesFetching } = useQuery<ReportSchedule[]>({
    queryKey: ["reports-center", brandId, "schedules"],
    queryFn: () => api.getReportSchedules(brandId || ""),
    enabled,
  });
  const { data: launchReadiness } = useQuery<any>({
    queryKey: ["reports-center", brandId, "launch-readiness"],
    queryFn: () => api.getLaunchReadiness(brandId || ""),
    enabled,
  });
  const { data: productionAudit } = useQuery<any>({
    queryKey: ["reports-center", brandId, "production-readiness-audit"],
    queryFn: () => api.getProductionReadinessAudit(brandId || ""),
    enabled,
  });
  const { data: launchTrend } = useQuery<any>({
    queryKey: ["reports-center", brandId, "launch-trend"],
    queryFn: () => api.getLaunchTrend(brandId || ""),
    enabled,
  });
  const { data: competitiveParity } = useQuery<any>({
    queryKey: ["reports-center", brandId, "competitive-parity"],
    queryFn: () => api.getCompetitiveParity(brandId || ""),
    enabled,
  });
  const { data: verificationData } = useQuery<any>({
    queryKey: ["reports-center", brandId, "verification-tasks"],
    queryFn: () => api.getVerificationTasks(brandId || ""),
    enabled,
  });
  const { data: scanHealth } = useQuery<any>({
    queryKey: ["reports-center", brandId, "scan-health"],
    queryFn: () => api.getScanHealth(brandId || ""),
    enabled,
  });
  const { data: crawlerAnalytics } = useQuery<any>({
    queryKey: ["reports-center", brandId, "crawler-analytics"],
    queryFn: () => api.getCrawlerAnalytics(brandId || "", 30),
    enabled,
  });
  const { data: attribution } = useQuery<any>({
    queryKey: ["reports-center", brandId, "attribution"],
    queryFn: () => api.getAttributionReport(brandId || "", 30),
    enabled,
  });
  const { data: agentBenchmark } = useQuery<any>({
    queryKey: ["reports-center", brandId, "agent-benchmark"],
    queryFn: () => api.getAgentBenchmark(brandId || "", 30),
    enabled,
  });
  const { data: productReadiness } = useQuery<any>({
    queryKey: ["reports-center", brandId, "product-readiness"],
    queryFn: () => api.getProductReadiness(brandId || ""),
    enabled,
  });
  const { data: optimizations = [] } = useQuery<any[]>({
    queryKey: ["reports-center", brandId, "optimizations"],
    queryFn: () => api.getOptimizationHistory(brandId || "", 30),
    enabled,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "schedules"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-readiness"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "production-readiness-audit"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-trend"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "competitive-parity"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "verification-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "scan-health"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "crawler-analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "attribution"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "agent-benchmark"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "product-readiness"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "optimizations"] }),
    ]);
  };

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return null;
      const recipients = recipientInput.split(",").map((email: string) => email.trim()).filter(Boolean);
      if (recipients.length === 0) throw new Error("Add at least one recipient email.");
      return api.createReportSchedule(brandId, {
        frequency,
        dayOfWeek: frequency === "weekly" ? 1 : undefined,
        dayOfMonth: frequency === "monthly" ? 1 : undefined,
        time: scheduleTime,
        reportType,
        recipients,
      });
    },
    onSuccess: async () => {
      await refresh();
      toast({ title: "Report schedule created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create report schedule", description: error?.message, variant: "destructive" });
    },
  });

  const createDefaultLaunchSchedulesMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return null;
      const recipients = recipientInput.split(",").map((email: string) => email.trim()).filter(Boolean);
      if (recipients.length === 0) throw new Error("Add at least one recipient email.");
      return api.createDefaultLaunchReportSchedules(brandId, {
        recipients,
        time: scheduleTime,
      });
    },
    onSuccess: async (result: any) => {
      await refresh();
      toast({
        title: result?.created?.length ? "Launch reporting cadence created" : "Launch reporting cadence already exists",
        description: result?.message || "Default launch report schedules are ready.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create launch cadence", description: error?.message, variant: "destructive" });
    },
  });

  const triggerScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => api.triggerReportSchedule(brandId || "", scheduleId),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Report send triggered" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to trigger report", description: error?.message, variant: "destructive" });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => api.deleteReportSchedule(brandId || "", scheduleId),
    onSuccess: async () => {
      await refresh();
      toast({ title: "Report schedule removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove schedule", description: error?.message, variant: "destructive" });
    },
  });

  const launchReportMutation = useMutation({
    mutationFn: () => api.getLaunchReadinessReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "launch-readiness-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Launch readiness report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export launch report", description: error?.message, variant: "destructive" });
    },
  });

  const competitiveParityReportMutation = useMutation({
    mutationFn: () => api.getCompetitiveParityReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "competitive-parity-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Competitive parity report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export parity report", description: error?.message, variant: "destructive" });
    },
  });

  const marketOpportunityReportMutation = useMutation({
    mutationFn: () => api.getMarketOpportunitiesReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "market-opportunity-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Market opportunity report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export opportunity report", description: error?.message, variant: "destructive" });
    },
  });

  const aiSearchOpportunityBriefMutation = useMutation({
    mutationFn: () => api.getAISearchOpportunityBrief(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "ai-search-opportunity-brief"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "AI search opportunity brief exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export opportunity brief", description: error?.message, variant: "destructive" });
    },
  });

  const verificationEvidenceReportMutation = useMutation({
    mutationFn: () => api.getVerificationEvidenceReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "verification-evidence-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Verification evidence report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export evidence report", description: error?.message, variant: "destructive" });
    },
  });

  const scanOperationsReportMutation = useMutation({
    mutationFn: () => api.getScanOperationsReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "scan-operations-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Scan operations report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export scan report", description: error?.message, variant: "destructive" });
    },
  });

  const productVisibilityReportMutation = useMutation({
    mutationFn: () => api.getProductVisibilityClientReport(brandId || ""),
    onSuccess: async (report: any) => {
      const blob = new Blob([report.html || report.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.filenameBase || "product-visibility-client-report"}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (report.markdown && navigator.clipboard) {
        await navigator.clipboard.writeText(report.markdown);
      }
      toast({ title: "Product visibility report exported", description: "HTML downloaded and Markdown copied for sharing." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to export product report", description: error?.message, variant: "destructive" });
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
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "scan-health"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-trend"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "competitive-parity"] }),
      ]);
      toast({
        title: result?.ok ? "Provider preflight passed" : "Provider preflight found blockers",
        description: result?.message || "Provider credentials and billing were checked with a small request.",
        variant: result?.ok ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({ title: "Provider preflight failed", description: error?.message, variant: "destructive" });
    },
  });

  const queueEnterprisePilotMutation = useMutation({
    mutationFn: () => api.queueScanOperationsRun(brandId || "", { maxPrompts: 3, maxProviders: 6, providerSweep: true, includeDownstream: false, enterprisePilot: true }),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "scan-health"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-trend"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "competitive-parity"] }),
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

  const applyProofStarterMutation = useMutation({
    mutationFn: (optimizationId: string) => api.updateOptimizationLog(brandId || "", optimizationId, { status: "applied" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "verification-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-trend"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "verification-tasks"] }),
      ]);
      toast({
        title: "Proof task created",
        description: "The action was marked applied. Run the matching proof check after fresh evidence exists.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not mark action applied", description: error?.message, variant: "destructive" });
    },
  });

  const createProviderRecoveryTaskMutation = useMutation({
    mutationFn: (item: any) => {
      const provider = String(item.provider || "provider").toLowerCase();
      return api.createOptimizationLog(brandId || "", {
        actionType: `provider_recovery:${provider}`,
        actionDescription: `Provider Recovery: Restore ${provider} enterprise sampling. ${item.cause || "Provider recovery evidence required."} Action: ${item.action || "Fix credentials, billing, quota, plan access, or sampling blockers, rerun provider preflight, then queue an enterprise pilot sweep."}`,
        estimatedImpact: item.severity === "blocked" || item.status === "failed" ? 90 : 65,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: "Provider recovery added",
        description: "Open Action Workflow to assign, apply, and verify the provider fix.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not add provider recovery", description: error?.message, variant: "destructive" });
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
          actionDescription: `Provider Recovery: Restore ${provider} enterprise sampling. ${item.planLocked ? "Plan access is currently locked for this provider. " : ""}${item.cause || "Provider recovery evidence required."} Action: ${item.action || "Fix credentials, billing, quota, plan access, or sampling blockers, rerun provider preflight, then queue an enterprise pilot sweep."}`,
          estimatedImpact: item.severity === "blocked" || item.status === "failed" ? 90 : 65,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Provider recovery tasks created" : "Provider recovery tasks already exist",
        description: result?.created
          ? `${result.created} provider recovery task${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign, apply, and verify the existing provider fixes.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not add provider recovery tasks", description: error?.message, variant: "destructive" });
    },
  });

  const createProductionHardeningTasksMutation = useMutation({
    mutationFn: async () => {
      if (!brandId || !productionAudit) return { created: 0, reused: 0 };
      const existing = new Set((optimizations || []).map((log: any) => String(log.actionType || "")));
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
          actionDescription: `Production hardening: ${gate.label}. Evidence: ${gate.evidence}. Action: ${gate.action}`,
          estimatedImpact: gate.status === "blocked" ? 90 : 65,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "production-readiness-audit"] }),
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
      toast({ title: "Could not create launch tasks", description: error?.message, variant: "destructive" });
    },
  });

  const readiness = useMemo(() => {
    const score = numberValue(preview?.overallScore);
    const competitors = numberValue(preview?.competitorCount);
    const topics = numberValue(preview?.topicCount);
    const mentions = numberValue(preview?.totalMentions);
    const scheduleCount = schedules.length;
    const launchScore = numberValue(launchReadiness?.score);
    const parityScore = numberValue(competitiveParity?.score);
    const freshEnterpriseProviders = numberValue(
      scanHealth?.enterpriseCoverage?.freshProviders ??
      scanHealth?.summary?.freshEnterpriseProviders ??
      scanHealth?.providerCoverage?.enterpriseFreshCount ??
      launchTrend?.providerTrend?.freshEnterpriseProviders
    );
    const enterpriseTargetProviders = numberValue(
      scanHealth?.enterpriseCoverage?.targetProviders ??
      scanHealth?.summary?.enterpriseTargetProviders ??
      scanHealth?.providerCoverage?.enterpriseTargetCount ??
      launchTrend?.providerTrend?.enterpriseTargetProviders,
      6
    );
    const failedEnterpriseProviders = numberValue(
      scanHealth?.enterpriseCoverage?.failedProviders ??
      scanHealth?.summary?.failedEnterpriseProviders ??
      scanHealth?.providerCoverage?.enterpriseBlockedProviders?.length ??
      launchTrend?.providerTrend?.failedEnterpriseProviders
    );
    const crawlerVisits = numberValue(crawlerAnalytics?.totalVisits ?? crawlerAnalytics?.summary?.totalVisits);
    const verifiedCrawlerVisits = numberValue(crawlerAnalytics?.verifiedVisits ?? crawlerAnalytics?.summary?.verifiedVisits);
    const activeBots = Object.values(crawlerAnalytics?.byBot || {}).filter((count) => numberValue(count) > 0).length;
    const aiReferrals = numberValue(attribution?.totalReferrals);
    const aiConversions = numberValue(attribution?.totalConversions);
    const aiRevenue = numberValue(attribution?.attributedRevenue);
    const attributionComplete = Boolean(attribution?.dataComplete || agentBenchmark?.attribution?.ready);
    const attributionRows = [
      {
        area: "AI crawler visibility",
        metric: `${crawlerVisits} visits / ${verifiedCrawlerVisits} verified`,
        status: crawlerVisits > 0 && verifiedCrawlerVisits > 0 ? "Ready" : crawlerVisits > 0 ? "Partial" : "Gap",
        action: crawlerVisits > 0 ? "Verify crawler identity and watched pages" : "Install Agent Analytics crawler tracking",
      },
      {
        area: "Engine coverage",
        metric: `${activeBots} active AI bots`,
        status: activeBots >= 3 ? "Ready" : activeBots > 0 ? "Partial" : "Gap",
        action: activeBots >= 3 ? "Monitor bot/page mix weekly" : "Capture ChatGPT, Claude, Gemini, Perplexity, and Google agent visits",
      },
      {
        area: "AI referral sessions",
        metric: `${aiReferrals} referrals`,
        status: aiReferrals > 0 ? "Ready" : attributionComplete ? "Partial" : "Gap",
        action: aiReferrals > 0 ? "Map referrals to landing pages" : "Connect GA4 and tag AI-answer referral sources",
      },
      {
        area: "Conversion proof",
        metric: `${aiConversions} conversions`,
        status: aiConversions > 0 ? "Ready" : attributionComplete ? "Partial" : "Gap",
        action: aiConversions > 0 ? "Report conversion trend and winning sources" : "Configure GA4 conversion events for AI traffic",
      },
      {
        area: "Revenue attribution",
        metric: `$${Math.round(aiRevenue).toLocaleString()}`,
        status: aiRevenue > 0 ? "Ready" : attributionComplete ? "Partial" : "Gap",
        action: aiRevenue > 0 ? "Use revenue in executive report" : "Connect ecommerce/GA4 revenue or upload attribution snapshots",
      },
    ];
    const attributionReadyRows = attributionRows.filter((row) => row.status === "Ready").length;
    const attributionPartialRows = attributionRows.filter((row) => row.status === "Partial").length;
    const attributionScore = Math.min(100, Math.round(
      (crawlerVisits > 0 ? 25 : 0) +
      (verifiedCrawlerVisits > 0 ? 15 : 0) +
      (activeBots >= 3 ? 20 : activeBots > 0 ? 10 : 0) +
      (aiReferrals > 0 ? 15 : attributionComplete ? 8 : 0) +
      (aiConversions > 0 ? 15 : 0) +
      (aiRevenue > 0 ? 10 : 0)
    ));
    const verificationTasks = Array.isArray(verificationData?.tasks) ? verificationData.tasks : Array.isArray(verificationData) ? verificationData : [];
    const verifiedTasks = verificationTasks.filter((task: any) => task.status === "verified").length;
    const pendingProofTaskList = verificationTasks.filter((task: any) => task.status !== "verified");
    const pendingProofTasks = numberValue(launchTrend?.workflowTrend?.pendingProofTasks, pendingProofTaskList.length);
    const plannedActions = numberValue(launchTrend?.workflowTrend?.plannedActions);
    const appliedActions = numberValue(launchTrend?.workflowTrend?.appliedActions);
    const workflowActions = optimizations.filter((log: any) => ["pending", "applied", "verified"].includes(String(log.status || "").toLowerCase()));
    const totalEstimatedImpact = workflowActions.reduce((sum: number, log: any) => sum + numberValue(log.estimatedImpact), 0);
    const verifiedImpact = workflowActions
      .filter((log: any) => String(log.status || "").toLowerCase() === "verified")
      .reduce((sum: number, log: any) => sum + numberValue(log.actualImpact, numberValue(log.estimatedImpact)), 0);
    const proofConversionRate = appliedActions + verifiedTasks > 0 ? Math.round((verifiedTasks / (appliedActions + verifiedTasks)) * 100) : 0;
    const impactConversionRate = totalEstimatedImpact > 0 ? Math.round((verifiedImpact / totalEstimatedImpact) * 100) : 0;
    const failingProofTasks = pendingProofTaskList.filter((task: any) => task.evidence?.passed === false).length;
    const unknownProofTasks = pendingProofTaskList.filter((task: any) => task.evidence?.passed !== false).length;
    const proofValueRows = [
      {
        area: "Workflow coverage",
        metric: `${plannedActions} planned / ${appliedActions} applied / ${verifiedTasks} verified`,
        status: plannedActions > 0 && appliedActions > 0 ? "Active" : plannedActions > 0 ? "Planned" : "Gap",
        action: plannedActions > 0 ? "Keep moving priority work into applied proof checks" : "Create priority actions from readiness gaps",
      },
      {
        area: "Applied-to-verified conversion",
        metric: `${proofConversionRate}%`,
        status: proofConversionRate >= 50 ? "Healthy" : proofConversionRate > 0 ? "Early" : "Gap",
        action: proofConversionRate > 0 ? "Raise conversion by clearing pending proof checks" : "Mark one live fix applied and verify it",
      },
      {
        area: "Verified impact",
        metric: `${verifiedImpact}/${totalEstimatedImpact || 0}`,
        status: verifiedImpact > 0 ? "Proven" : totalEstimatedImpact > 0 ? "Unproven" : "Gap",
        action: verifiedImpact > 0 ? "Use verified impact in stakeholder reporting" : "Verify impact before claiming ROI",
      },
      {
        area: "Evidence freshness",
        metric: `${pendingProofTasks} pending`,
        status: pendingProofTasks === 0 && verifiedTasks > 0 ? "Clear" : pendingProofTasks > 0 ? "Debt" : "Missing",
        action: pendingProofTasks === 0 && verifiedTasks > 0 ? "Keep evidence fresh with weekly scans" : "Run specialist proof checks after fresh scans",
      },
      {
        area: "Failed evidence",
        metric: `${failingProofTasks} failing / ${unknownProofTasks} waiting`,
        status: failingProofTasks === 0 ? "Controlled" : "Blocked",
        action: failingProofTasks === 0 ? "Resolve waiting evidence next" : "Fix failing applied changes before reporting wins",
      },
    ];
    const proofValueScore = Math.min(100, Math.round(
      (plannedActions > 0 ? 15 : 0) +
      (appliedActions > 0 ? 20 : 0) +
      (verifiedTasks > 0 ? 25 : 0) +
      (pendingProofTasks === 0 && verifiedTasks > 0 ? 20 : pendingProofTasks > 0 ? 8 : 0) +
      (verifiedImpact > 0 ? 20 : impactConversionRate > 0 ? 10 : 0)
    ));
    const productRelevant = Boolean(productReadiness?.relevant);
    const productScore = numberValue(productReadiness?.score);
    const parityBlockers = Array.isArray(competitiveParity?.blockers) ? competitiveParity.blockers.length : 0;
    const launchBlockedGates = Array.isArray(launchReadiness?.gates)
      ? launchReadiness.gates.filter((gate: any) => gate.status === "blocked").length
      : 0;
    const proofStarterActions = optimizations
      .filter((log: any) => !["applied", "verified"].includes(String(log.status || "").toLowerCase()))
      .sort((a: any, b: any) => numberValue(b.estimatedImpact) - numberValue(a.estimatedImpact))
      .slice(0, 5)
      .map((log: any) => ({
        id: log.id,
        title: String(log.actionDescription || log.title || "Apply priority action").split(/\r?\n/).find(Boolean) || "Apply priority action",
        source: optimizationSourceLabel(log.actionType),
        status: log.status || "pending",
        impact: numberValue(log.estimatedImpact),
      }));
    const gates = [
      score <= 0 ? {
        message: "No current visibility score for the report headline.",
        action: "Run visibility scoring",
        href: "/app/ai-command-center",
      } : null,
      competitors < 3 ? {
        message: "Add at least 3 competitors for buyer-ready benchmarking.",
        action: "Open competitors",
        href: "/app/competitors",
      } : null,
      topics < 5 ? {
        message: "Track at least 5 topics before sending recurring reports.",
        action: "Open prompts",
        href: "/app/prompts",
      } : null,
      mentions <= 0 ? {
        message: "Run fresh AI scans so mentions and movement are reportable.",
        action: "Queue scan run",
        href: "/app/ai-command-center",
      } : null,
      scheduleCount === 0 ? {
        message: "Create at least one recurring executive or action report schedule.",
        action: "Create schedule",
        href: "/app/reports",
      } : null,
      launchScore < 70 ? {
        message: `Launch readiness is ${launchScore}/100; fix blocked gates before calling this launch-ready.`,
        action: "Open launch gates",
        href: "/app/ai-command-center",
      } : null,
      launchBlockedGates > 0 ? {
        message: `${launchBlockedGates} launch gate${launchBlockedGates === 1 ? "" : "s"} still blocked.`,
        action: "Review launch actions",
        href: "/app/ai-command-center",
      } : null,
      parityScore < 70 ? {
        message: `Competitive parity is ${parityScore}/100 against AthenaHQ, Peec.ai, Profound, and Semrush-style expectations.`,
        action: "Open parity audit",
        href: "/app/ai-command-center",
      } : null,
      parityBlockers > 0 ? {
        message: `${parityBlockers} enterprise parity blocker${parityBlockers === 1 ? "" : "s"} still need action.`,
        action: "Review parity blockers",
        href: "/app/ai-command-center",
      } : null,
      freshEnterpriseProviders < 4 || failedEnterpriseProviders > 0 ? {
        message: `Enterprise provider evidence is ${freshEnterpriseProviders}/${enterpriseTargetProviders} fresh with ${failedEnterpriseProviders} failing.`,
        action: "Fix provider coverage",
        href: "/app/ai-command-center",
      } : null,
      verifiedTasks === 0 ? {
        message: "No verified proof tasks yet; report impact only after at least one applied fix is verified.",
        action: "Open Action Workflow",
        href: "/app/action-plan",
      } : null,
      pendingProofTasks > 0 ? {
        message: `${pendingProofTasks} proof task${pendingProofTasks === 1 ? "" : "s"} still need verification.`,
        action: "Verify proof tasks",
        href: "/app/action-plan",
      } : null,
      attributionScore < 60 ? {
        message: `AI attribution readiness is ${attributionScore}/100; connect crawler, referral, conversion, and revenue proof before claiming business impact.`,
        action: "Open Agent Analytics",
        href: "/app/agent-analytics",
      } : null,
      productRelevant && productScore < 70 ? {
        message: `Product Readiness is ${productScore}/100; finish SKU/ASIN evidence before sending seller reports.`,
        action: "Open Product Readiness",
        href: "/app/product-readiness",
      } : null,
    ].filter(Boolean) as Array<{ message: string; action: string; href: string }>;
    const value = Math.min(100, Math.round(
      (score > 0 ? 10 : 0) +
      (competitors >= 3 ? 10 : competitors > 0 ? 5 : 0) +
      (topics >= 5 ? 8 : topics > 0 ? 4 : 0) +
      (mentions > 0 ? 8 : 0) +
      (scheduleCount > 0 ? 10 : 0) +
      (launchScore >= 70 ? 14 : launchScore > 0 ? 7 : 0) +
      (parityScore >= 70 ? 14 : parityScore > 0 ? 7 : 0) +
      (freshEnterpriseProviders >= 4 && failedEnterpriseProviders === 0 ? 10 : freshEnterpriseProviders > 0 ? 5 : 0) +
      (verifiedTasks > 0 && pendingProofTasks === 0 ? 8 : verifiedTasks > 0 || pendingProofTasks > 0 ? 4 : 0) +
      (attributionScore >= 60 ? 6 : attributionScore > 0 ? 3 : 0) +
      (!productRelevant || productScore >= 70 ? 8 : productScore > 0 ? 4 : 0)
    ));
    return {
      value,
      status: value >= 75 ? "client_ready" : value >= 45 ? "needs_review" : "setup_required",
      proof: {
        launchScore,
        parityScore,
        freshEnterpriseProviders,
        enterpriseTargetProviders,
        failedEnterpriseProviders,
        verifiedTasks,
        pendingProofTasks,
        plannedActions,
        appliedActions,
        totalEstimatedImpact,
        verifiedImpact,
        proofConversionRate,
        impactConversionRate,
        failingProofTasks,
        unknownProofTasks,
        proofValueScore,
        proofValueRows,
        attributionScore,
        attributionRows,
        attributionReadyRows,
        attributionPartialRows,
        crawlerVisits,
        verifiedCrawlerVisits,
        activeBots,
        aiReferrals,
        aiConversions,
        aiRevenue,
        attributionComplete,
        productRelevant,
        productScore,
      },
      proofTasks: pendingProofTaskList.slice(0, 6),
      proofStarterActions,
      gates,
      blockers: gates.map((gate) => gate.message),
    };
  }, [agentBenchmark, attribution, competitiveParity, crawlerAnalytics, launchReadiness, launchTrend, optimizations, preview, productReadiness, scanHealth, schedules, verificationData]);

  const capabilityMatrix = useMemo(() => {
    const freshEnterpriseProviders = readiness.proof.freshEnterpriseProviders;
    const enterpriseTargetProviders = readiness.proof.enterpriseTargetProviders || 6;
    const failedEnterpriseProviders = readiness.proof.failedEnterpriseProviders;
    const competitorCount = numberValue(preview?.competitorCount);
    const topicCount = numberValue(preview?.topicCount);
    const mentionCount = numberValue(preview?.totalMentions);
    const parityScore = readiness.proof.parityScore;
    const launchScore = readiness.proof.launchScore;
    const verifiedTasks = readiness.proof.verifiedTasks;
    const pendingProofTasks = readiness.proof.pendingProofTasks;
    const productRelevant = readiness.proof.productRelevant;
    const productScore = readiness.proof.productScore;
    const attributionScore = readiness.proof.attributionScore;
    const aiReferrals = readiness.proof.aiReferrals;
    const aiConversions = readiness.proof.aiConversions;
    const aiRevenue = readiness.proof.aiRevenue;
    const queryFanoutActions = optimizations.filter((log: any) => String(log.actionType || "").startsWith("query_fanout:")).length;
    const citationActions = optimizations.filter((log: any) => String(log.actionType || "").startsWith("citation_opportunity:")).length;
    const providerReady = freshEnterpriseProviders >= 4 && failedEnterpriseProviders === 0;
    const proofReady = verifiedTasks > 0 && pendingProofTasks === 0;
    const productReady = !productRelevant || productScore >= 70;
    const attributionReady = attributionScore >= 60 && (aiReferrals > 0 || aiConversions > 0 || aiRevenue > 0);

    const rows = [
      {
        area: "Multi-engine AI visibility",
        benchmark: "AthenaHQ / Profound / Peec track major answer engines, not one model.",
        airank: `${freshEnterpriseProviders}/${enterpriseTargetProviders} enterprise providers fresh, ${failedEnterpriseProviders} failing`,
        status: providerReady ? "Ready" : freshEnterpriseProviders > 0 ? "Partial" : "Gap",
        action: providerReady ? "Keep provider freshness monitored" : "Run provider preflight and enterprise pilot sweep",
        href: "/app/reports",
      },
      {
        area: "Prompt and topic coverage",
        benchmark: "Buyers expect topic-level prompt tracking and recurring movement.",
        airank: `${topicCount} topics tracked, ${mentionCount} mentions captured`,
        status: topicCount >= 5 && mentionCount > 0 ? "Ready" : topicCount > 0 ? "Partial" : "Gap",
        action: topicCount >= 5 && mentionCount > 0 ? "Expand high-intent prompt clusters" : "Add topics and queue fresh scans",
        href: "/app/prompts",
      },
      {
        area: "Competitor benchmarking",
        benchmark: "Peec and Profound-style reporting needs competitor share and parity gaps.",
        airank: `${competitorCount} competitors, parity ${parityScore}/100`,
        status: competitorCount >= 3 && parityScore >= 70 ? "Ready" : competitorCount > 0 || parityScore > 0 ? "Partial" : "Gap",
        action: competitorCount >= 3 && parityScore >= 70 ? "Export parity report" : "Add competitors and review parity blockers",
        href: "/app/competitors",
      },
      {
        area: "Citations and source targeting",
        benchmark: "Enterprise GEO tools show which sources influence AI answers.",
        airank: `${citationActions} citation workflow actions, ${mentionCount} mention signals`,
        status: citationActions > 0 && mentionCount > 0 ? "Ready" : citationActions > 0 || mentionCount > 0 ? "Partial" : "Gap",
        action: citationActions > 0 ? "Verify citation fixes after fresh scans" : "Create citation opportunity actions",
        href: "/app/action-plan",
      },
      {
        area: "Query fanout intelligence",
        benchmark: "Peec highlights query fanouts as a direct optimization input.",
        airank: `${queryFanoutActions} query fanout action${queryFanoutActions === 1 ? "" : "s"}`,
        status: queryFanoutActions > 0 ? "Ready" : "Gap",
        action: queryFanoutActions > 0 ? "Apply and verify query fanout tasks" : "Generate fanout actions from AI search opportunities",
        href: "/app/action-plan",
      },
      {
        area: "Action-to-proof workflow",
        benchmark: "Profound/Athena-style value depends on recommended fixes becoming verified outcomes.",
        airank: `${verifiedTasks} verified, ${pendingProofTasks} pending proof checks`,
        status: proofReady ? "Ready" : verifiedTasks > 0 || pendingProofTasks > 0 ? "Partial" : "Gap",
        action: proofReady ? "Export verification evidence" : "Mark one live fix applied and run proof checks",
        href: "/app/action-plan",
      },
      {
        area: "AI revenue attribution",
        benchmark: "Athena/Profound-style enterprise value connects AI visibility to bot visits, referrals, conversions, and revenue.",
        airank: `${readiness.proof.crawlerVisits} crawler visits, ${aiReferrals} referrals, ${aiConversions} conversions, $${Math.round(aiRevenue).toLocaleString()} revenue`,
        status: attributionReady ? "Ready" : attributionScore > 0 ? "Partial" : "Gap",
        action: attributionReady ? "Export attribution proof" : "Install Agent Analytics and connect GA4/ecommerce revenue",
        href: "/app/agent-analytics",
      },
      {
        area: "Product and seller readiness",
        benchmark: "Amazon/D2C brands need SKU, ASIN, marketplace, product claims, and competitor product visibility.",
        airank: productRelevant ? `Product score ${productScore}/100` : "Inactive for this non-product brand",
        status: productReady ? "Ready" : productScore > 0 ? "Partial" : "Gap",
        action: productRelevant ? "Open Product Readiness" : "Use Agent Readiness unless SKUs/ASINs are imported",
        href: "/app/product-readiness",
      },
      {
        area: "Boardroom reporting cadence",
        benchmark: "Enterprise buyers expect scheduled executive reports, exports, and evidence packs.",
        airank: `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}, launch ${launchScore}/100`,
        status: schedules.length > 0 && launchScore >= 70 ? "Ready" : schedules.length > 0 || launchScore > 0 ? "Partial" : "Gap",
        action: schedules.length > 0 && launchScore >= 70 ? "Send launch report" : "Create schedule and clear launch blockers",
        href: "/app/reports",
      },
    ];

    const ready = rows.filter((row) => row.status === "Ready").length;
    const partial = rows.filter((row) => row.status === "Partial").length;
    const gaps = rows.length - ready - partial;
    return { rows, ready, partial, gaps };
  }, [optimizations, preview, readiness, schedules.length]);

  const pdfUrl = brandId ? api.getReportPDFUrl(brandId, {
    type: reportType,
    timeframe,
    includeScores: true,
    includeCompetitors: true,
    includeGaps: true,
    includeActions: true,
  }) : "#";

  const exportProductionAudit = async () => {
    if (!productionAudit) return;
    const generatedAt = new Date().toISOString();
    const brandName = brand?.name || productionAudit.brandName || "Brand";
    const markdown = [
      `# Production Readiness Audit: ${brandName}`,
      "",
      `Domain: ${brand?.domain || ""}`,
      `Generated: ${generatedAt}`,
      `Verdict: ${productionAudit.verdict}`,
      `Production readiness score: ${productionAudit.score}/100`,
      "",
      "## Executive Summary",
      `${brandName} is ${String(productionAudit.verdict || "").toLowerCase()} with ${(productionAudit.blocked || []).length} blocked production gate${(productionAudit.blocked || []).length === 1 ? "" : "s"} and ${(productionAudit.partial || []).length} partial gate${(productionAudit.partial || []).length === 1 ? "" : "s"}.`,
      "",
      "## Gate Scorecard",
      ...((productionAudit.gates || []).map((gate: any) => `- ${gate.label}: ${String(gate.status).toUpperCase()} - ${gate.evidence}. Next: ${gate.action}`)),
      "",
      "## Priority Next Actions",
      ...((productionAudit.nextActions || []).length
        ? productionAudit.nextActions.map((action: any, index: number) => `${index + 1}. ${action.action} (${action.title}: ${action.evidence})`)
        : ["All production gates are ready. Keep weekly monitoring, reporting, and verification active."]),
      "",
      "## Launch Blocker Pack",
      productionAudit.launchBlockerPack?.headline || "No launch blocker pack available.",
      "",
      "### Buyer-Safe Claims",
      ...((productionAudit.launchBlockerPack?.buyerSafeClaims || []).length
        ? productionAudit.launchBlockerPack.buyerSafeClaims.map((claim: string) => `- ${claim}`)
        : ["- Keep proof claims tied to the gate scorecard above."]),
      "",
      "### Do Not Claim Yet",
      ...((productionAudit.launchBlockerPack?.doNotClaimYet || []).length
        ? productionAudit.launchBlockerPack.doNotClaimYet.map((claim: string) => `- ${claim}`)
        : ["- No restricted claims identified by the current audit."]),
      "",
      "## Operating Metrics",
      ...Object.entries(productionAudit.metrics || {}).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`),
    ].join("\n");
    const blockerPack = productionAudit.launchBlockerPack || {};
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReportHtml(brandName)} Production Readiness Audit</title><style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.gate{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.ready{border-color:#86efac}.partial,.needs_hardening{border-color:#fcd34d}.blocked{border-color:#fca5a5}.small{color:#4b5563;font-size:14px}.claim{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin:8px 0}</style></head><body><h1>Production Readiness Audit: ${escapeReportHtml(brandName)}</h1><p class="meta">Domain: ${escapeReportHtml(brand?.domain || "")}<br>Generated: ${escapeReportHtml(generatedAt)}</p><p class="score">${productionAudit.score}/100 - ${escapeReportHtml(productionAudit.verdict)}</p><h2>Gate Scorecard</h2>${(productionAudit.gates || []).map((gate: any) => `<div class="gate ${escapeReportHtml(gate.status)}"><strong>${escapeReportHtml(gate.label)}</strong><div class="small">${escapeReportHtml(String(gate.status).toUpperCase())} - weight ${escapeReportHtml(gate.weight)}</div><p>${escapeReportHtml(gate.evidence)}</p><p><strong>Next:</strong> ${escapeReportHtml(gate.action)}</p></div>`).join("")}<h2>Launch Blocker Pack</h2><p>${escapeReportHtml(blockerPack.headline || "No launch blocker pack available.")}</p><p>${escapeReportHtml(blockerPack.salesPositioning || "")}</p><h3>Buyer-Safe Claims</h3>${(blockerPack.buyerSafeClaims || []).map((claim: string) => `<div class="claim">${escapeReportHtml(claim)}</div>`).join("") || "<p>Keep proof claims tied to the gate scorecard above.</p>"}<h3>Do Not Claim Yet</h3>${(blockerPack.doNotClaimYet || []).map((claim: string) => `<div class="claim blocked">${escapeReportHtml(claim)}</div>`).join("") || "<p>No restricted claims identified by the current audit.</p>"}<h2>Priority Next Actions</h2>${(productionAudit.nextActions || []).length ? productionAudit.nextActions.map((action: any, index: number) => `<p>${index + 1}. ${escapeReportHtml(action.action)} <span class="small">(${escapeReportHtml(action.title)}: ${escapeReportHtml(action.evidence)})</span></p>`).join("") : "<p>All production gates are ready. Keep weekly monitoring, reporting, and verification active.</p>"}<h2>Operating Metrics</h2>${Object.entries(productionAudit.metrics || {}).map(([key, value]) => `<p>${escapeReportHtml(key)}: ${escapeReportHtml(Array.isArray(value) ? value.join(", ") : String(value))}</p>`).join("")}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(brandName).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "brand"}-production-readiness.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (navigator.clipboard) await navigator.clipboard.writeText(markdown);
    toast({ title: "Production readiness audit exported", description: "HTML downloaded and Markdown copied for sharing." });
  };

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Reports" />
        <p className="text-muted-foreground">Select a brand to view reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Reports" onRefresh={refresh} isRefreshing={previewFetching || schedulesFetching} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Executive Reporting Center</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Package {brand?.name || "this brand"} visibility, competitors, gaps, and actions into client-ready reports and scheduled stakeholder updates.
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "w-fit capitalize",
          readiness.status === "client_ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
            readiness.status === "needs_review" ? "border-amber-200 bg-amber-50 text-amber-700" :
              "border-red-200 bg-red-50 text-red-700"
        )}>
          {readiness.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Report Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{readiness.value}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={readiness.value} className="mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Visibility Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{numberValue(preview?.overallScore)}</div>
            <p className="text-xs text-muted-foreground">Delta {numberValue(preview?.scoreDelta) >= 0 ? "+" : ""}{numberValue(preview?.scoreDelta)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Benchmark Inputs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{numberValue(preview?.competitorCount)}</div>
            <p className="text-xs text-muted-foreground">{numberValue(preview?.topicCount)} topics tracked</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{schedules.length}</div>
            <p className="text-xs text-muted-foreground">{schedules.filter((s) => s.isActive !== false).length} active</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4" data-testid="reports-enterprise-proof-strip">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Launch Gate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{readiness.proof.launchScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <p className="text-xs text-muted-foreground">launch readiness</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Parity Gate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{readiness.proof.parityScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <p className="text-xs text-muted-foreground">Athena / Peec / Profound</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Provider Proof</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{readiness.proof.freshEnterpriseProviders}/{readiness.proof.enterpriseTargetProviders}</div>
            <p className="text-xs text-muted-foreground">{readiness.proof.failedEnterpriseProviders} failing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Verified Proof</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{readiness.proof.verifiedTasks}</div>
            <p className="text-xs text-muted-foreground">{readiness.proof.pendingProofTasks} pending checks</p>
          </CardContent>
        </Card>
      </div>

      {productionAudit ? (
        <Card data-testid="reports-production-readiness-audit">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    "h-5 w-5",
                    productionAudit.status === "ready" ? "text-emerald-600" : productionAudit.status === "needs_hardening" ? "text-amber-600" : "text-red-600"
                  )} />
                  Production Launch Audit
                </CardTitle>
                <CardDescription>
                  A hard launch verdict across provider reliability, integrations, monitoring, proof workflow, attribution, product fit, and reporting cadence.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Badge variant="outline" className={cn(
                  productionAudit.status === "ready"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : productionAudit.status === "needs_hardening"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-red-200 bg-red-50 text-red-700"
                )}>
                  {productionAudit.score}/100 - {productionAudit.verdict}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportProductionAudit}
                  data-testid="button-export-production-readiness-audit"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button
                  size="sm"
                  onClick={() => createProductionHardeningTasksMutation.mutate()}
                  disabled={createProductionHardeningTasksMutation.isPending || !(productionAudit.gates || []).some((gate: any) => gate.status !== "ready")}
                  data-testid="button-create-production-hardening-tasks"
                >
                  {createProductionHardeningTasksMutation.isPending ? <Clock className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Create tasks
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Blocked", productionAudit.blocked?.length || 0],
                ["Partial", productionAudit.partial?.length || 0],
                ["Providers", `${productionAudit.metrics?.freshEnterpriseProviders || 0}/${readiness.proof.enterpriseTargetProviders || 6}`],
                ["Proof", `${productionAudit.metrics?.verifiedActions || 0} verified`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[1fr_0.7fr_1.2fr_1.2fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                <span>Gate</span>
                <span>Status</span>
                <span>Evidence</span>
                <span>Next move</span>
              </div>
              {(productionAudit.gates || []).map((gate: any) => (
                <div key={gate.id} className="grid grid-cols-[1fr_0.7fr_1.2fr_1.2fr] gap-3 border-b px-3 py-3 text-sm last:border-b-0">
                  <span className="font-medium">{gate.label}</span>
                  <Badge variant="outline" className={cn("w-fit capitalize", gate.status === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : gate.status === "partial" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700")}>
                    {gate.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{gate.evidence}</span>
                  <span className="text-xs text-muted-foreground">{gate.action}</span>
                </div>
              ))}
            </div>
            {(productionAudit.nextActions || []).length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {productionAudit.nextActions.slice(0, 4).map((action: any) => (
                  <div key={action.id} className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{action.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{action.evidence}</p>
                      </div>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={action.href || "/app/ai-command-center"}>
                          Open
                          <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{action.action}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {productionAudit.launchBlockerPack ? (
              <div className="rounded-md border bg-muted/20 p-4" data-testid="reports-launch-blocker-pack">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Enterprise Launch Blocker Pack</p>
                    <p className="mt-1 text-xs text-muted-foreground">{productionAudit.launchBlockerPack.headline}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{productionAudit.launchBlockerPack.salesPositioning}</p>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {(productionAudit.launchBlockerPack.externalBlockers || []).length} external / {(productionAudit.launchBlockerPack.proofDebt || []).length} proof
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Buyer-safe claims</p>
                    <div className="mt-2 space-y-2">
                      {(productionAudit.launchBlockerPack.buyerSafeClaims || []).slice(0, 4).map((claim: string) => (
                        <div key={claim} className="flex gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{claim}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">External blockers</p>
                    <div className="mt-2 space-y-2">
                      {(productionAudit.launchBlockerPack.externalBlockers || []).length ? (
                        productionAudit.launchBlockerPack.externalBlockers.slice(0, 3).map((item: any) => (
                          <div key={item.id} className="text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium">{item.title}</p>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" asChild>
                                <Link href={item.href || "/app/ai-command-center"}>
                                  Open
                                </Link>
                              </Button>
                            </div>
                            <p className="mt-1 text-muted-foreground">{item.evidence}</p>
                            <p className="mt-1 text-muted-foreground">Clear when: {item.clearCondition}</p>
                            {(item.clearanceSteps || []).length ? (
                              <div className="mt-2 space-y-1">
                                {item.clearanceSteps.slice(0, 4).map((step: string) => (
                                  <div key={step} className="flex gap-2 text-muted-foreground">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                                    <span>{step}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No external blockers in the current audit.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Do not claim yet</p>
                    <div className="mt-2 space-y-2">
                      {(productionAudit.launchBlockerPack.doNotClaimYet || []).length ? (
                        productionAudit.launchBlockerPack.doNotClaimYet.slice(0, 4).map((claim: string) => (
                          <div key={claim} className="flex gap-2 text-xs text-muted-foreground">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>{claim}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No restricted claims identified by this audit.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="reports-proof-value-matrix">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SearchCheck className="h-5 w-5 text-primary" />
                Proof Value Matrix
              </CardTitle>
              <CardDescription>
                Shows whether recommended work is becoming verified business evidence, not just a task list.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn(
              readiness.proof.proofValueScore >= 70
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : readiness.proof.proofValueScore >= 35
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            )}>
              {readiness.proof.proofValueScore}/100 value proof
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Proof conversion</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.proofConversionRate}%</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Verified impact</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.verifiedImpact}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Open impact</p>
              <p className="mt-1 font-mono text-lg font-semibold">{Math.max(0, readiness.proof.totalEstimatedImpact - readiness.proof.verifiedImpact)}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Evidence risk</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.failingProofTasks}/{readiness.proof.unknownProofTasks}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_0.8fr_0.6fr_1.1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Area</span>
              <span>Metric</span>
              <span>Status</span>
              <span>Next move</span>
            </div>
            {readiness.proof.proofValueRows.map((row: any) => (
              <div key={row.area} className="grid grid-cols-[1fr_0.8fr_0.6fr_1.1fr] gap-3 border-b px-3 py-3 text-sm last:border-b-0">
                <span className="font-medium">{row.area}</span>
                <span className="font-mono text-xs">{row.metric}</span>
                <Badge variant="outline" className="w-fit">{row.status}</Badge>
                <span className="text-xs text-muted-foreground">{row.action}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="reports-ai-attribution-readiness">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                AI Attribution Readiness
              </CardTitle>
              <CardDescription>
                Connect AI visibility to crawler visits, AI referrals, conversions, and revenue before claiming business impact.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn(
              readiness.proof.attributionScore >= 60
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : readiness.proof.attributionScore > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
            )}>
              {readiness.proof.attributionScore}/100 attribution
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Crawler visits</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.crawlerVisits}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Verified visits</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.verifiedCrawlerVisits}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">AI referrals</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.aiReferrals}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Conversions</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.aiConversions}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">AI revenue</p>
              <p className="mt-1 font-mono text-lg font-semibold">${Math.round(readiness.proof.aiRevenue).toLocaleString()}</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_0.8fr_0.6fr_1.1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Signal</span>
              <span>Metric</span>
              <span>Status</span>
              <span>Next move</span>
            </div>
            {readiness.proof.attributionRows.map((row: any) => (
              <div key={row.area} className="grid grid-cols-[1fr_0.8fr_0.6fr_1.1fr] gap-3 border-b px-3 py-3 text-sm last:border-b-0">
                <span className="font-medium">{row.area}</span>
                <span className="font-mono text-xs">{row.metric}</span>
                <Badge variant="outline" className="w-fit">{row.status}</Badge>
                <span className="text-xs text-muted-foreground">{row.action}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild data-testid="button-open-agent-analytics-attribution">
              <Link href="/app/agent-analytics">
                Open Agent Analytics
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/app/integrations">
                Connect GA4
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="reports-ai-search-capability-matrix">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-primary" />
                AI Search Competitive Matrix
              </CardTitle>
              <CardDescription>
                Buyer-facing coverage against AthenaHQ, Profound, Peec, and Semrush AI visibility expectations.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {capabilityMatrix.ready} ready
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {capabilityMatrix.partial} partial
              </Badge>
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {capabilityMatrix.gaps} gaps
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] rounded-md border">
              <div className="grid grid-cols-[1.05fr_1.35fr_1fr_0.65fr_0.95fr] gap-0 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div>Capability</div>
                <div>Enterprise benchmark</div>
                <div>Current evidence</div>
                <div>Status</div>
                <div>Next action</div>
              </div>
              {capabilityMatrix.rows.map((row) => (
                <div
                  key={row.area}
                  className="grid grid-cols-[1.05fr_1.35fr_1fr_0.65fr_0.95fr] gap-0 border-b px-3 py-3 text-sm last:border-b-0"
                >
                  <div className="pr-3 font-medium">{row.area}</div>
                  <div className="pr-3 text-muted-foreground">{row.benchmark}</div>
                  <div className="pr-3">{row.geoscore}</div>
                  <div className="pr-3">
                    <Badge variant="outline" className={cn(
                      row.status === "Ready"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : row.status === "Partial"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-red-200 bg-red-50 text-red-700"
                    )}>
                      {row.status}
                    </Badge>
                  </div>
                  <div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={row.href}>
                        {row.action}
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {scanHealth?.providerCoverage ? (
        <Card data-testid="reports-provider-recovery-panel">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <SearchCheck className="h-5 w-5 text-primary" />
                  Provider Recovery
                </CardTitle>
                <CardDescription>
                  Resolve multi-engine evidence before exporting enterprise launch or parity reports.
                </CardDescription>
              </div>
              <Badge variant="outline" className={cn(
                scanHealth.providerCoverage.readyForEnterprise
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              )}>
                {scanHealth.providerCoverage.readyForEnterprise ? "enterprise ready" : "coverage gap"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => providerPreflightMutation.mutate()}
                disabled={providerPreflightMutation.isPending || !(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length}
                data-testid="button-reports-provider-preflight"
              >
                {providerPreflightMutation.isPending ? "Checking..." : "Preflight blockers"}
              </Button>
              <Button
                variant="outline"
                onClick={() => queueEnterprisePilotMutation.mutate()}
                disabled={queueEnterprisePilotMutation.isPending}
                data-testid="button-reports-enterprise-pilot-sweep"
              >
                {queueEnterprisePilotMutation.isPending ? "Queueing..." : "Enterprise pilot sweep"}
              </Button>
              <Button
                onClick={() => createAllProviderRecoveryTasksMutation.mutate()}
                disabled={createAllProviderRecoveryTasksMutation.isPending || !(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length}
                data-testid="button-create-all-provider-recovery-tasks"
              >
                {createAllProviderRecoveryTasksMutation.isPending ? "Adding..." : "Create recovery tasks"}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">Current plan</p>
                <p className="mt-1 font-semibold capitalize">{scanHealth.providerCoverage.plan || "free"}</p>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">Fresh enterprise engines</p>
                <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.freshEnterpriseProviders}/{readiness.proof.enterpriseTargetProviders}</p>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">Failed engines</p>
                <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.failedEnterpriseProviders}</p>
              </div>
            </div>
            {(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).length ? (
              <div className="grid gap-2 md:grid-cols-2" data-testid="reports-provider-recovery-items">
                {(scanHealth.providerCoverage.enterpriseRecoveryPlan || []).slice(0, 6).map((item: any) => {
                  const provider = String(item.provider || "").toLowerCase();
                  const actionType = `provider_recovery:${provider}`;
                  const existing = optimizations.some((log: any) => String(log.actionType || "") === actionType && String(log.status || "").toLowerCase() !== "verified");
                  return (
                    <div key={`provider-recovery-${item.provider}`} className="rounded-md border bg-muted/20 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold capitalize">{item.provider}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.cause || item.reason || item.status || "Recovery needed"}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">{String(item.status || "blocked").replace(/_/g, " ")}</Badge>
                      </div>
                      {item.envHint ? (
                        <p className="mt-2 font-mono text-[11px] text-muted-foreground">{item.envHint}</p>
                      ) : null}
                      <p className="mt-2 text-xs">{item.action || "Fix credentials, billing, quota, or plan access, then rerun preflight."}</p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => createProviderRecoveryTaskMutation.mutate(item)}
                          disabled={existing || createProviderRecoveryTaskMutation.isPending}
                          data-testid={`button-add-provider-recovery-${provider}`}
                        >
                          {existing ? "In workflow" : createProviderRecoveryTaskMutation.isPending ? "Adding..." : "Add to Action Workflow"}
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
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No provider recovery items are open right now.
              </div>
            )}
            {(scanHealth.providerPreflight || scanHealth.providerCoverage.latestPreflight) ? (
              <div className="rounded-md border p-3 text-sm" data-testid="reports-latest-provider-preflight">
                {(() => {
                  const preflight = scanHealth.providerPreflight || scanHealth.providerCoverage.latestPreflight;
                  const results = Array.isArray(preflight?.results) ? preflight.results : [];
                  return (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">Latest provider preflight</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {preflight?.finishedAt ? new Date(preflight.finishedAt).toLocaleString() : "Run in progress"} - {results.filter((result: any) => result.ok).length} passed, {results.filter((result: any) => !result.ok).length} blocked
                          </p>
                        </div>
                        <Badge variant="outline" className={cn(
                          preflight?.ok
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        )}>
                          {preflight?.ok ? "passed" : "blockers found"}
                        </Badge>
                      </div>
                      {results.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {results.slice(0, 6).map((result: any) => (
                            <div key={`reports-preflight-${result.provider}`} className="rounded-md bg-muted/30 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium capitalize">{result.provider}</span>
                                <Badge variant="outline" className={cn(
                                  "capitalize",
                                  result.ok
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-red-200 bg-red-50 text-red-700"
                                )}>
                                  {String(result.status || (result.ok ? "ok" : "failed")).replace(/_/g, " ")}
                                </Badge>
                              </div>
                              {result.envHint ? (
                                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{result.envHint}</p>
                              ) : null}
                              {result.message ? (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.message}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/20 p-3 text-sm" data-testid="reports-latest-provider-preflight-empty">
                No provider preflight has been run yet. Use preflight before claiming multi-engine report readiness.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="reports-proof-recovery-panel">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Proof Recovery
              </CardTitle>
              <CardDescription>
                Convert actions into verified evidence before reporting impact to brand stakeholders.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn(
              readiness.proof.verifiedTasks > 0 && readiness.proof.pendingProofTasks === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            )}>
              {readiness.proof.verifiedTasks > 0 && readiness.proof.pendingProofTasks === 0 ? "proof ready" : "proof needed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Planned</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.plannedActions}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Applied</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.appliedActions}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Verified</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.verifiedTasks}</p>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Pending proof</p>
              <p className="mt-1 font-mono text-lg font-semibold">{readiness.proof.pendingProofTasks}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "1. Move a finding into work", body: "Create an Action Workflow item from Agent Readiness, Query Fanouts, Market Opportunities, Product Readiness, or provider recovery." },
              { title: "2. Mark the fix applied", body: "After the brand change is live, mark the action applied so AIRank creates or updates the proof task." },
              { title: "3. Verify with fresh evidence", body: "Run the specialist proof check or manual proof only after fresh scans, citations, readiness checks, or product evidence exist." },
            ].map((step) => (
              <div key={step.title} className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="font-semibold">{step.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
          {readiness.proofTasks.length ? (
            <div className="grid gap-2 md:grid-cols-2" data-testid="reports-pending-proof-items">
              {readiness.proofTasks.map((task: any) => (
                <div key={task.id || task.sourceId || task.title} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{task.title || task.sourceType || "Pending proof task"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{task.verificationMethod || "proof_check"}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{String(task.status || "pending").replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{task.verificationNote || task.evidence?.message || "Waiting for fresh evidence or manual proof."}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border p-3 text-sm">
              {readiness.proof.verifiedTasks > 0
                ? "No pending proof tasks remain. Keep verification evidence fresh before exporting reports."
                : "No proof tasks exist yet. Mark a priority Action Workflow item as applied to create the first proof task."}
            </div>
          )}
          {!readiness.proofTasks.length && readiness.proofStarterActions.length ? (
            <div className="space-y-2" data-testid="reports-proof-starter-actions">
              <div>
                <p className="text-sm font-semibold">Fastest actions to turn into proof</p>
                <p className="text-xs text-muted-foreground">Open Action Workflow, mark one live fix as applied, then run the matching proof check.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {readiness.proofStarterActions.map((action) => (
                  <div
                    key={action.id}
                    className="rounded-md border bg-muted/20 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium">{action.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{action.source} - {String(action.status).replace(/_/g, " ")}</p>
                      </div>
                      <Badge variant="outline">{action.impact || 0}</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyProofStarterMutation.mutate(action.id)}
                        disabled={applyProofStarterMutation.isPending}
                        data-testid={`button-report-apply-proof-starter-${action.id}`}
                      >
                        {applyProofStarterMutation.isPending ? "Applying..." : "Mark applied"}
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href="/app/action-plan">
                          Review
                          <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" asChild data-testid="button-open-action-workflow-proof">
              <Link href="/app/action-plan">
                Open Action Workflow
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => verificationEvidenceReportMutation.mutate()}
              disabled={verificationEvidenceReportMutation.isPending}
              data-testid="button-export-proof-evidence-inline"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export proof evidence
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card data-testid="reports-export-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              Build Report
            </CardTitle>
            <CardDescription>Generate a PDF for leadership, clients, or brand operators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Report type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_REPORT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger data-testid="select-report-timeframe"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md border p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4 text-primary" />
                Included sections
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  "Visibility score",
                  "Competitor benchmark",
                  "Launch trend",
                  "Parity audit",
                  "Provider freshness",
                  "Verified proof",
                  "Product readiness",
                  "Prioritized actions",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <Button asChild className="w-full" data-testid="button-download-report-pdf">
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <FileDown className="mr-2 h-4 w-4" />
                Download PDF report
              </a>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => launchReportMutation.mutate()}
              disabled={launchReportMutation.isPending}
              data-testid="button-export-launch-readiness-report"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export launch readiness report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => competitiveParityReportMutation.mutate()}
              disabled={competitiveParityReportMutation.isPending}
              data-testid="button-export-competitive-parity-report"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export competitive parity report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => aiSearchOpportunityBriefMutation.mutate()}
              disabled={aiSearchOpportunityBriefMutation.isPending}
              data-testid="button-export-ai-search-opportunity-brief"
            >
              <SearchCheck className="mr-2 h-4 w-4" />
              Export AI search opportunity brief
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => marketOpportunityReportMutation.mutate()}
              disabled={marketOpportunityReportMutation.isPending}
              data-testid="button-export-market-opportunity-report"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export market opportunity report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => productVisibilityReportMutation.mutate()}
              disabled={productVisibilityReportMutation.isPending}
              data-testid="button-export-product-visibility-report"
            >
              <PackageCheck className="mr-2 h-4 w-4" />
              Export product visibility report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => verificationEvidenceReportMutation.mutate()}
              disabled={verificationEvidenceReportMutation.isPending}
              data-testid="button-export-verification-evidence-report"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export verification evidence report
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => scanOperationsReportMutation.mutate()}
              disabled={scanOperationsReportMutation.isPending}
              data-testid="button-export-scan-operations-report"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export scan operations report
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="reports-readiness-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Report Quality Gates
            </CardTitle>
            <CardDescription>What must be true before sending this report to a serious brand team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {readiness.gates.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                This report has enough signal for a stakeholder-ready snapshot.
              </div>
            ) : (
              readiness.gates.map((gate) => (
                <div key={gate.message} className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>{gate.message}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="w-fit shrink-0 px-0 sm:px-2" asChild>
                    <Link href={gate.href}>
                      {gate.action}
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              {(preview?.topTopics || []).slice(0, 4).map((topic) => (
                <div key={topic.name} className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="truncate font-medium">{topic.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Score {numberValue(topic.score)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="reports-schedule-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Scheduled Reports
          </CardTitle>
          <CardDescription>Send recurring executive, action, verification, operations, or product visibility reports to stakeholders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label>Report type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger data-testid="select-schedule-report-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCHEDULE_REPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(value) => setFrequency(value as "weekly" | "monthly")}>
                  <SelectTrigger data-testid="select-report-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Send time</Label>
                <Input value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} placeholder="09:00" data-testid="input-report-time" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recipients</Label>
              <Input
                value={recipientInput}
                onChange={(event) => setRecipientInput(event.target.value)}
                placeholder="founder@brand.com, team@agency.com"
                data-testid="input-report-recipients"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createScheduleMutation.mutate()}
                disabled={createScheduleMutation.isPending}
                data-testid="button-create-report-schedule"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create schedule
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between" data-testid="default-launch-report-cadence">
            <div>
              <p className="text-sm font-medium">Default launch reporting cadence</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create weekly Production Readiness and Verification Evidence reports plus a monthly Competitive Parity report for stakeholder follow-up.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => createDefaultLaunchSchedulesMutation.mutate()}
              disabled={createDefaultLaunchSchedulesMutation.isPending}
              data-testid="button-create-default-launch-report-schedules"
            >
              {createDefaultLaunchSchedulesMutation.isPending ? <Clock className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
              Create launch cadence
            </Button>
          </div>

          <div className="space-y-2">
            {schedules.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No recurring reports yet. Create a recurring stakeholder report before enterprise launch.
              </div>
            ) : (
              schedules.map((schedule) => (
                <div key={schedule.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={schedule.isActive === false ? "outline" : "secondary"}>
                        {getScheduleReportTypeLabel(schedule.reportType)}
                      </Badge>
                      <span className="text-sm font-medium capitalize">{schedule.frequency} at {schedule.time}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{schedule.recipients.join(", ")}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Next: {formatDate(schedule.nextRunAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => triggerScheduleMutation.mutate(schedule.id)}
                      disabled={triggerScheduleMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send now
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                      disabled={deleteScheduleMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
