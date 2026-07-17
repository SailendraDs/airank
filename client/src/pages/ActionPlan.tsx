import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

type WorkflowItem = {
  id: string;
  title: string;
  source: string;
  type: string;
  priority: "high" | "medium" | "low";
  impact: number;
  status: string;
  stage: "finding" | "planned" | "drafted" | "queued" | "applied" | "verified";
  actionableKind?: "optimization" | "verification";
  actionableId?: string;
  evidenceKind?: "agent_readiness_scan" | "answer_intelligence_scan" | "citation_opportunity_scan" | "market_opportunity_check" | "product_pilot_check" | "provider_recovery_check" | "production_hardening_check" | "integration_setup_check" | "competitive_parity_check" | "generic_proof_check" | "axp_publication_check";
  evidenceSummary?: string;
  evidenceStatus?: "passed" | "failed" | "unknown";
  proofRequirement?: string;
};

const STAGE_LABELS: Record<WorkflowItem["stage"], string> = {
  finding: "Finding",
  planned: "Planned",
  drafted: "Drafted",
  queued: "Queued",
  applied: "Applied",
  verified: "Verified",
};

function normalizePriority(value: unknown): WorkflowItem["priority"] {
  const text = String(value || "").toLowerCase();
  if (text.includes("high") || text === "critical") return "high";
  if (text.includes("low")) return "low";
  return "medium";
}

function stageFromStatus(status: unknown): WorkflowItem["stage"] {
  const text = String(status || "").toLowerCase();
  if (text === "verified") return "verified";
  if (["applied", "done", "completed", "published"].includes(text)) return "applied";
  if (["queued", "publishing", "ready_to_publish"].includes(text)) return "queued";
  if (["draft", "in_review", "approved"].includes(text)) return "drafted";
  if (["todo", "pending", "in_progress", "blocked"].includes(text)) return "planned";
  return "finding";
}

function priorityClass(priority: WorkflowItem["priority"]) {
  if (priority === "high") return "text-red-600 border-red-300 bg-red-50";
  if (priority === "medium") return "text-amber-600 border-amber-300 bg-amber-50";
  return "text-muted-foreground";
}

function parseOptimizationDescription(description: string) {
  const lines = String(description || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "Optimization";
  const marketTitle = first.match(/^Market Opportunity:\s*(.+)$/i)?.[1];
  const fanoutTitle = first.match(/^Query Fanout:\s*(.+)$/i)?.[1];
  const target = lines.find((line) => /^Target:/i.test(line))?.replace(/^Target:\s*/i, "");
  const type = lines.find((line) => /^Type:/i.test(line))?.replace(/^Type:\s*/i, "");
  return {
    title: marketTitle || fanoutTitle || first,
    target,
    type,
  };
}

function optimizationSource(actionType: string) {
  if (actionType.startsWith("market_opportunity:")) return "Market Opportunity Queue";
  if (actionType.startsWith("citation_opportunity:")) return "Citation Opportunity";
  if (actionType.startsWith("answer_intelligence:")) return "Answer Intelligence";
  if (actionType.startsWith("audience_persona:")) return "Audience Persona";
  if (actionType.startsWith("query_fanout:")) return "Query Fanout";
  if (actionType.startsWith("agent_readiness:")) return "Agent Readiness";
  if (actionType.startsWith("gap_opportunity:")) return "Gap Opportunity";
  if (actionType.startsWith("product_pilot:")) return "Product Readiness";
  if (actionType.startsWith("production_hardening:")) return "Production Hardening";
  if (actionType.startsWith("integration_setup:")) return "Integration Setup";
  if (actionType.startsWith("competitive_parity:")) return "Competitive Parity";
  return "Optimization Log";
}

function proofRequirementForAction(params: {
  actionType?: string;
  source?: string;
  evidenceKind?: WorkflowItem["evidenceKind"];
}) {
  const actionType = String(params.actionType || "").toLowerCase();
  const source = String(params.source || "").toLowerCase();

  if (params.evidenceKind === "agent_readiness_scan" || actionType.startsWith("agent_readiness:")) {
    if (actionType.includes("schema_fix_pack")) {
      return "Deploy the homepage JSON-LD @graph, validate Organization/WebSite/WebPage schema, rerun Agent Readiness, then use Check latest scan to verify all three schema checks pass.";
    }
    return "Apply the readiness fix, rerun Agent Readiness, and confirm the failing check passes with fresh evidence.";
  }
  if (actionType.startsWith("audience_persona:")) {
    return "Publish persona-targeted proof content, run the persona prompts again, and confirm mention rate or evidence improves.";
  }
  if (actionType.startsWith("query_fanout:")) {
    return "Publish the fanout content brief, add proof/comparison/schema blocks, rerun the prompt, and confirm fresh AI answers, mentions, citations, or visibility movement.";
  }
  if (params.evidenceKind === "answer_intelligence_scan" || actionType.startsWith("answer_intelligence:")) {
    return "Rerun the same prompt and provider, then confirm the brand appears positively and competitor pressure is reduced.";
  }
  if (params.evidenceKind === "citation_opportunity_scan" || actionType.startsWith("citation_opportunity:")) {
    return "Publish or acquire the cited source update, rerun citation extraction, and confirm the target source is now cited.";
  }
  if (params.evidenceKind === "market_opportunity_check" || actionType.startsWith("market_opportunity:")) {
    return "Run the market opportunity checker and confirm prompt, source, product, and launch gates are no longer blocking.";
  }
  if (params.evidenceKind === "product_pilot_check" || actionType.startsWith("product_pilot:") || source.includes("product readiness")) {
    return "Refresh Product Readiness, verify core product pages, and pass the launch or ecommerce pilot gate.";
  }
  if (params.evidenceKind === "provider_recovery_check" || actionType.startsWith("provider_recovery:") || source.includes("provider recovery")) {
    return "Fix provider billing, key, quota, or plan access, rerun Enterprise pilot sweep, and confirm the provider has fresh successful answer evidence.";
  }
  if (params.evidenceKind === "production_hardening_check" || actionType.startsWith("production_hardening:") || source.includes("production hardening")) {
    return "Complete the launch hardening action, rerun Production Launch Audit, and confirm this gate moves to ready or no longer blocks launch.";
  }
  if (params.evidenceKind === "integration_setup_check" || actionType.startsWith("integration_setup:") || source.includes("integration setup")) {
    return "Connect or install the integration, mark this applied, then run Production Launch Audit or the matching setup check to confirm attribution readiness improved.";
  }
  if (actionType.startsWith("competitive_parity:") || source.includes("competitive parity")) {
    return "Complete the parity blocker, rerun Competitive Parity and Production Launch Audit, then verify the blocker moved to ready or no longer appears in next actions.";
  }
  if (source.includes("publish queue")) {
    return "Publish the approved artifact, then run a fresh visibility or citation scan to prove the new asset is discoverable.";
  }
  if (params.evidenceKind === "axp_publication_check" || source.includes("axp publication")) {
    return "Confirm the AXP page is published with a current version and live HTML, then rerun prompts later to prove AI answer movement.";
  }
  if (source.includes("recommendation") || source.includes("gap analysis") || source.includes("gap opportunity")) {
    return "Apply the recommended fix, capture the live URL or artifact, then rerun the relevant visibility check.";
  }
  return "Apply the change, capture live proof, then rerun the matching visibility, citation, or readiness check.";
}

function workstreamHrefForAction(actionType?: string, evidenceKind?: WorkflowItem["evidenceKind"]) {
  const value = String(actionType || "").toLowerCase();
  if (evidenceKind === "agent_readiness_scan" || value.startsWith("agent_readiness:")) return "/app/agent-readiness";
  if (evidenceKind === "integration_setup_check" || value.startsWith("integration_setup:")) return "/app/integrations";
  if (evidenceKind === "production_hardening_check" || value.startsWith("production_hardening:")) return "/app/ai-command-center";
  if (evidenceKind === "competitive_parity_check" || value.startsWith("competitive_parity:")) return "/app/ai-command-center";
  if (evidenceKind === "provider_recovery_check" || value.startsWith("provider_recovery:")) return "/app/ai-command-center";
  if (value.startsWith("query_fanout:")) return "/app/prompts";
  if (evidenceKind === "product_pilot_check" || value.startsWith("product_pilot:")) return "/app/product-readiness";
  if (evidenceKind === "market_opportunity_check" || value.startsWith("market_opportunity:")) return "/app/ai-command-center";
  if (evidenceKind === "citation_opportunity_scan" || value.startsWith("citation_opportunity:")) return "/app/sources";
  return "/app/action-plan";
}

export default function ActionPlan() {
  const { brandId } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: actionData, isLoading: actionsLoading } = useQuery<any>({
    queryKey: ["action-workflow", brandId, "actions"],
    queryFn: () => api.getPrioritizedActions(brandId || "", 20),
    enabled: Boolean(brandId),
  });
  const { data: recommendations = [] } = useQuery<any[]>({
    queryKey: ["action-workflow", brandId, "recommendations"],
    queryFn: () => api.getRecommendations(brandId || "", 20),
    enabled: Boolean(brandId),
  });
  const { data: optimizations = [] } = useQuery<any[]>({
    queryKey: ["action-workflow", brandId, "optimizations"],
    queryFn: () => api.getOptimizationHistory(brandId || "", 30),
    enabled: Boolean(brandId),
  });
  const { data: productActions } = useQuery<any>({
    queryKey: ["action-workflow", brandId, "product-actions"],
    queryFn: () => api.getProductVisibilityActions(brandId || ""),
    enabled: Boolean(brandId),
  });
  const { data: publishQueue } = useQuery<any>({
    queryKey: ["action-workflow", brandId, "publish-queue"],
    queryFn: () => api.getProductVisibilityPublishQueue(brandId || ""),
    enabled: Boolean(brandId),
  });
  const { data: verificationData } = useQuery<any>({
    queryKey: ["action-workflow", brandId, "verification-tasks"],
    queryFn: () => api.getVerificationTasks(brandId || ""),
    enabled: Boolean(brandId),
  });
  const { data: scanHealth } = useQuery<any>({
    queryKey: ["action-workflow", brandId, "scan-health"],
    queryFn: () => api.getScanHealth(brandId || ""),
    enabled: Boolean(brandId),
  });

  const workflow = useMemo(() => {
    const items: WorkflowItem[] = [];

    (actionData?.actions || []).forEach((action: any, index: number) => {
      items.push({
        id: `gap-${action.id || index}`,
        title: action.title || action.description || "Improve AI visibility",
        source: "Gap Analysis",
        type: action.actionType || action.type || "visibility",
        priority: normalizePriority(action.priority),
        impact: Number(action.estimatedImpact || action.impactScore || 0),
        status: action.status || "planned",
        stage: stageFromStatus(action.status || "planned"),
        proofRequirement: proofRequirementForAction({ actionType: action.actionType || action.type, source: "Gap Analysis" }),
      });
    });

    recommendations.forEach((rec: any, index: number) => {
      items.push({
        id: `rec-${rec.id || index}`,
        title: rec.title || rec.description || "Recommendation",
        source: "Recommendation",
        type: rec.type || "recommendation",
        priority: normalizePriority(rec.priority),
        impact: Number(rec.impactScore || rec.potentialValue || 0),
        status: rec.status || "pending",
        stage: stageFromStatus(rec.status || "pending"),
        proofRequirement: proofRequirementForAction({ actionType: rec.type, source: "Recommendation" }),
      });
    });

    optimizations.forEach((log: any, index: number) => {
      const actionType = String(log.actionType || "optimization");
      const parsed = parseOptimizationDescription(log.actionDescription || log.title || "Optimization");
      items.push({
        id: `opt-${log.id || index}`,
        title: parsed.target ? `${parsed.title}: ${parsed.target}` : parsed.title,
        source: optimizationSource(actionType),
        type: parsed.type || actionType,
        priority: Number(log.estimatedImpact || 0) >= 7 ? "high" : "medium",
        impact: Number(log.actualImpact ?? log.estimatedImpact ?? 0),
        status: log.status || "pending",
        stage: stageFromStatus(log.status || "pending"),
        actionableKind: "optimization",
        actionableId: log.id,
        proofRequirement: proofRequirementForAction({ actionType, source: optimizationSource(actionType) }),
      });
    });

    (productActions?.actions || []).forEach((action: any, index: number) => {
      items.push({
        id: `product-${action.id || action.actionId || index}`,
        title: action.title || action.description || "Product visibility action",
        source: "Product Readiness",
        type: action.type || "product",
        priority: normalizePriority(action.priority),
        impact: Number(action.impactScore || action.estimatedImpact || 0),
        status: action.status || "todo",
        stage: stageFromStatus(action.status || "todo"),
        proofRequirement: proofRequirementForAction({ actionType: action.type || "product", source: "Product Readiness" }),
      });
    });

    (publishQueue?.items || publishQueue?.queue || []).forEach((item: any, index: number) => {
      items.push({
        id: `queue-${item.id || index}`,
        title: item.title || item.actionTitle || "Publish approved artifact",
        source: "Publish Queue",
        type: item.channel || item.type || "publish",
        priority: "high",
        impact: Number(item.impactScore || 8),
        status: item.status || "queued",
        stage: stageFromStatus(item.status || "queued"),
        proofRequirement: proofRequirementForAction({ actionType: item.channel || item.type, source: "Publish Queue" }),
      });
    });

    (verificationData?.tasks || []).forEach((task: any, index: number) => {
      const sourceOptimization = optimizations.find((log: any) => log.id === task.sourceId) || task.sourceOptimization;
      const isAgentReadinessTask = String(sourceOptimization?.actionType || "").startsWith("agent_readiness:");
      const isAnswerIntelligenceTask = String(sourceOptimization?.actionType || "").startsWith("answer_intelligence:");
      const isCitationOpportunityTask = String(sourceOptimization?.actionType || "").startsWith("citation_opportunity:");
      const isProductPilotTask = String(sourceOptimization?.actionType || "").startsWith("product_pilot:");
      const isMarketOpportunityTask = String(sourceOptimization?.actionType || "").startsWith("market_opportunity:");
      const isQueryFanoutTask = String(sourceOptimization?.actionType || "").startsWith("query_fanout:");
      const isProviderRecoveryTask = String(sourceOptimization?.actionType || "").startsWith("provider_recovery:") || task.verificationMethod === "provider_recovery_check";
      const isProductionHardeningTask = String(sourceOptimization?.actionType || "").startsWith("production_hardening:") || task.verificationMethod === "production_hardening_check";
      const isIntegrationSetupTask = String(sourceOptimization?.actionType || "").startsWith("integration_setup:") || task.verificationMethod === "integration_setup_check";
      const isCompetitiveParityTask = String(sourceOptimization?.actionType || "").startsWith("competitive_parity:") || task.verificationMethod === "competitive_parity_check";
      const isAxpPublicationTask = task.sourceType === "axp_page" || task.verificationMethod === "axp_publication_check";
      const isGenericProofTask = task.sourceType === "optimization" && task.verificationMethod === "rerun_visibility_scan" && !isAgentReadinessTask && !isAnswerIntelligenceTask && !isCitationOpportunityTask && !isProductPilotTask && !isMarketOpportunityTask && !isProviderRecoveryTask && !isProductionHardeningTask && !isIntegrationSetupTask && !isCompetitiveParityTask;
      const parsed = parseOptimizationDescription(sourceOptimization?.actionDescription || task.title || "Verify published change");
      const evidence = task.evidence || {};
      const evidenceSummary = task.verificationNote || evidence.message || (
        evidence.label
          ? `${evidence.label}: ${evidence.passed === true ? "passed" : evidence.passed === false ? "still failing" : "latest evidence pending"}${evidence.scannedAt ? ` (${new Date(evidence.scannedAt).toLocaleDateString()})` : ""}`
          : undefined
      );
      const evidenceKind: WorkflowItem["evidenceKind"] = isAgentReadinessTask ? "agent_readiness_scan" : isAnswerIntelligenceTask ? "answer_intelligence_scan" : isCitationOpportunityTask ? "citation_opportunity_scan" : isMarketOpportunityTask ? "market_opportunity_check" : isProductPilotTask ? "product_pilot_check" : isProviderRecoveryTask ? "provider_recovery_check" : isProductionHardeningTask ? "production_hardening_check" : isIntegrationSetupTask ? "integration_setup_check" : isCompetitiveParityTask ? "competitive_parity_check" : isAxpPublicationTask ? "axp_publication_check" : isGenericProofTask ? "generic_proof_check" : undefined;
      const source = isAxpPublicationTask ? "AXP Publication Verification" : isCompetitiveParityTask ? "Competitive Parity Verification" : isIntegrationSetupTask ? "Integration Setup Verification" : isProductionHardeningTask ? "Production Hardening Verification" : isProviderRecoveryTask ? "Provider Recovery Verification" : isMarketOpportunityTask ? "Market Opportunity Verification" : isProductPilotTask ? "Product Readiness Verification" : isQueryFanoutTask ? "Query Fanout Verification" : "Verification Queue";
      items.push({
        id: `verify-${task.id || index}`,
        title: isMarketOpportunityTask ? `Verify market opportunity: ${parsed.title}` : isQueryFanoutTask ? `Verify query fanout: ${parsed.title}` : task.title || "Verify published change",
        source,
        type: task.verificationMethod || task.sourceType || "verification",
        priority: "high",
        impact: task.status === "verified" ? 10 : 0,
        status: task.status || "pending",
        stage: task.status === "verified" ? "verified" : "queued",
        actionableKind: "verification",
        actionableId: task.id,
        evidenceKind,
        evidenceSummary,
        evidenceStatus: task.status === "verified" || evidence.passed === true ? "passed" : evidence.passed === false ? "failed" : "unknown",
        proofRequirement: proofRequirementForAction({ actionType: sourceOptimization?.actionType, source, evidenceKind }),
      });
    });

    const providerRecoveryItems = [
      ...(scanHealth?.recoveryPlan || []),
      ...(scanHealth?.providerCoverage?.enterpriseRecoveryPlan || []),
    ];
    const providerRecoverySeen = new Set<string>();
    providerRecoveryItems.forEach((item: any, index: number) => {
      const provider = String(item.provider || `provider-${index}`).toLowerCase();
      if (providerRecoverySeen.has(provider)) return;
      providerRecoverySeen.add(provider);
      const severity = String(item.severity || "review").toLowerCase();
      const status = String(item.status || "blocked").toLowerCase();
      items.push({
        id: `provider-recovery-${provider}`,
        title: `Restore ${provider} enterprise sampling`,
        source: "Provider Recovery",
        type: status,
        priority: severity === "blocked" || status === "failed" ? "high" : "medium",
        impact: severity === "blocked" || status === "failed" ? 9 : 6,
        status: "blocked",
        stage: "planned",
        evidenceSummary: item.cause || item.latestError || "Provider recovery evidence required.",
        evidenceStatus: "failed",
        proofRequirement: proofRequirementForAction({ actionType: `provider_recovery:${provider}`, source: "Provider Recovery" }),
      });
    });

    const unique = new Map<string, WorkflowItem>();
    items.forEach((item) => unique.set(item.id, item));
    return Array.from(unique.values()).sort((a, b) => {
      const stageOrder = { queued: 0, applied: 1, planned: 2, drafted: 3, finding: 4, verified: 5 };
      return stageOrder[a.stage] - stageOrder[b.stage] || b.impact - a.impact;
    });
  }, [actionData, optimizations, productActions, publishQueue, recommendations, scanHealth, verificationData]);

  const invalidateWorkflow = () => {
    queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId] });
    queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] });
    queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "verification-tasks"] });
  };

  const pendingQueryFanoutDrafts = useMemo(() => workflow.filter((item) => (
    item.actionableKind === "optimization"
    && item.actionableId
    && String(item.type || "").startsWith("query_fanout:")
    && !["drafted", "applied", "verified"].includes(item.stage)
  )), [workflow]);

  const updateOptimizationMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "applied" | "verified" }) => (
      api.updateOptimizationLog(brandId || "", id, { status, actualImpact: status === "verified" ? 10 : undefined })
    ),
    onSuccess: (_result, variables) => {
      invalidateWorkflow();
      toast({
        title: variables.status === "applied" ? "Action marked applied" : "Action marked verified",
        description: variables.status === "applied" ? "A verification follow-up was added to the queue." : "Verified impact is now reflected in the workflow.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Workflow update failed", description: error.message, variant: "destructive" });
    },
  });

  const updateVerificationMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pending" | "verified" }) => (
      api.updateVerificationTask(brandId || "", id, { status, note: status === "verified" ? "Verified from Action Workflow." : undefined })
    ),
    onSuccess: (_result, variables) => {
      invalidateWorkflow();
      toast({
        title: variables.status === "verified" ? "Verification marked complete" : "Verification reopened",
        description: variables.status === "verified" ? "The proof task is now closed." : "The proof task is back in the queue.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Verification update failed", description: error.message, variant: "destructive" });
    },
  });

  const checkAgentReadinessMutation = useMutation({
    mutationFn: (id: string) => api.checkAgentReadinessVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Scan evidence verified" : "Verification still pending",
        description: result?.message || "Latest Agent Readiness scan was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Latest scan did not verify this yet", description: error.message, variant: "destructive" });
    },
  });

  const checkAnswerIntelligenceMutation = useMutation({
    mutationFn: (id: string) => api.checkAnswerIntelligenceVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Answer evidence verified" : "Verification still pending",
        description: result?.message || "Latest Answer Intelligence evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Latest answer did not verify this yet", description: error.message, variant: "destructive" });
    },
  });

  const checkCitationOpportunityMutation = useMutation({
    mutationFn: (id: string) => api.checkCitationOpportunityVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Citation evidence verified" : "Verification still pending",
        description: result?.message || "Latest source evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Citation evidence did not verify this yet", description: error.message, variant: "destructive" });
    },
  });

  const checkMarketOpportunityMutation = useMutation({
    mutationFn: (id: string) => api.checkMarketOpportunityVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Market evidence verified" : "Market opportunity still open",
        description: result?.message || "Latest market opportunity evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Market evidence did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkProductPilotMutation = useMutation({
    mutationFn: (id: string) => api.checkProductPilotVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Product gate verified" : "Product gate still pending",
        description: result?.message || "Latest Product Readiness evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Product gate did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkProviderRecoveryMutation = useMutation({
    mutationFn: (id: string) => api.checkProviderRecoveryVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Provider evidence verified" : "Provider recovery still pending",
        description: result?.message || "Latest provider evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Provider evidence did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkProductionHardeningMutation = useMutation({
    mutationFn: (id: string) => api.checkProductionHardeningVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Launch gate verified" : "Launch gate still open",
        description: result?.message || "Latest Production Launch Audit gate evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Launch gate did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkIntegrationSetupMutation = useMutation({
    mutationFn: (id: string) => api.checkIntegrationSetupVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Integration setup verified" : "Integration setup still pending",
        description: result?.message || "Latest integration setup evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Integration setup did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkCompetitiveParityMutation = useMutation({
    mutationFn: (id: string) => api.checkCompetitiveParityVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Parity evidence verified" : "Parity blocker still open",
        description: result?.message || "Latest Competitive Parity evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Parity evidence did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkGenericProofMutation = useMutation({
    mutationFn: (id: string) => api.checkGenericProofVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "Proof evidence verified" : "Proof still pending",
        description: result?.message || "Latest AI visibility evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Proof evidence did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkAxpPublicationMutation = useMutation({
    mutationFn: (id: string) => api.checkAxpPublicationVerificationTask(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      toast({
        title: result?.verified ? "AXP publication verified" : "AXP publication still pending",
        description: result?.message || "Published AXP page evidence was checked.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "AXP publication did not verify yet", description: error.message, variant: "destructive" });
    },
  });

  const checkAllPendingEvidenceMutation = useMutation({
    mutationFn: async () => {
      const tasks = (verificationData?.tasks || []).filter((task: any) => String(task.status || "pending") !== "verified");
      let verified = 0;
      let pending = 0;
      let unsupported = 0;

      for (const task of tasks) {
        const taskId = String(task.id || "");
        if (!taskId) {
          unsupported += 1;
          continue;
        }

        const sourceOptimization = optimizations.find((log: any) => log.id === task.sourceId);
        const actionType = String(sourceOptimization?.actionType || "").toLowerCase();
        const method = String(task.verificationMethod || "").toLowerCase();
        let result: any;

        try {
          if (method === "agent_readiness_scan" || method === "agent_readiness_check" || actionType.startsWith("agent_readiness:")) {
            result = await api.checkAgentReadinessVerificationTask(brandId || "", taskId);
          } else if (method === "answer_intelligence_check" || actionType.startsWith("answer_intelligence:")) {
            result = await api.checkAnswerIntelligenceVerificationTask(brandId || "", taskId);
          } else if (method === "citation_opportunity_check" || actionType.startsWith("citation_opportunity:")) {
            result = await api.checkCitationOpportunityVerificationTask(brandId || "", taskId);
          } else if (method === "market_opportunity_check" || actionType.startsWith("market_opportunity:")) {
            result = await api.checkMarketOpportunityVerificationTask(brandId || "", taskId);
          } else if (method === "product_pilot_check" || actionType.startsWith("product_pilot:")) {
            result = await api.checkProductPilotVerificationTask(brandId || "", taskId);
          } else if (method === "provider_recovery_check" || actionType.startsWith("provider_recovery:")) {
            result = await api.checkProviderRecoveryVerificationTask(brandId || "", taskId);
          } else if (method === "production_hardening_check" || actionType.startsWith("production_hardening:")) {
            result = await api.checkProductionHardeningVerificationTask(brandId || "", taskId);
          } else if (method === "integration_setup_check" || actionType.startsWith("integration_setup:")) {
            result = await api.checkIntegrationSetupVerificationTask(brandId || "", taskId);
          } else if (method === "competitive_parity_check" || actionType.startsWith("competitive_parity:")) {
            result = await api.checkCompetitiveParityVerificationTask(brandId || "", taskId);
          } else if (method === "axp_publication_check" || task.sourceType === "axp_page") {
            result = await api.checkAxpPublicationVerificationTask(brandId || "", taskId);
          } else if (method === "rerun_visibility_scan") {
            result = await api.checkGenericProofVerificationTask(brandId || "", taskId);
          } else {
            unsupported += 1;
            continue;
          }

          if (result?.verified) verified += 1;
          else pending += 1;
        } catch (_error) {
          pending += 1;
        }
      }

      return { checked: verified + pending, verified, pending, unsupported };
    },
    onSuccess: (result) => {
      invalidateWorkflow();
      toast({
        title: "Evidence sweep complete",
        description: `${result.checked} task${result.checked === 1 ? "" : "s"} checked: ${result.verified} verified, ${result.pending} still pending${result.unsupported ? `, ${result.unsupported} manual` : ""}.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Evidence sweep failed", description: error.message, variant: "destructive" });
    },
  });

  const createQueryFanoutDraftMutation = useMutation({
    mutationFn: (id: string) => api.createQueryFanoutDraft(brandId || "", id),
    onSuccess: (result: any) => {
      invalidateWorkflow();
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
      queryClient.invalidateQueries({ queryKey: ['faqEntries', brandId] });
      toast({
        title: "AXP draft created",
        description: result?.message || "Query fanout brief is now saved as a draft asset.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Draft creation failed", description: error.message, variant: "destructive" });
    },
  });

  const createAllQueryFanoutDraftsMutation = useMutation({
    mutationFn: async () => {
      const targets = pendingQueryFanoutDrafts.slice(0, 20);
      const results = [];
      for (const item of targets) {
        results.push(await api.createQueryFanoutDraft(brandId || "", item.actionableId!));
      }
      return { created: results.length };
    },
    onSuccess: (result) => {
      invalidateWorkflow();
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
      queryClient.invalidateQueries({ queryKey: ['faqEntries', brandId] });
      toast({
        title: "Fanout drafts created",
        description: `${result.created} query fanout draft${result.created === 1 ? "" : "s"} saved to Content AXP.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk draft creation failed", description: error.message, variant: "destructive" });
    },
  });

  const renderWorkflowControls = (item: WorkflowItem) => {
    if (!item.actionableKind || !item.actionableId) return <span className="text-xs text-muted-foreground">View source</span>;
    if (item.actionableKind === "optimization") {
      const isQueryFanoutTask = String(item.type || "").startsWith("query_fanout:");
      if (item.stage === "verified") return <Badge variant="outline" className="border-emerald-300 text-emerald-700">Verified</Badge>;
      if (isQueryFanoutTask && item.stage === "drafted") {
        return (
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Draft saved</Badge>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/app/content-axp">
                Review draft
              </Link>
            </Button>
          </div>
        );
      }
      if (item.stage === "applied") {
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateOptimizationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateOptimizationMutation.isPending}
            data-testid={`button-verify-optimization-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Mark verified
          </Button>
        );
      }
      if (isQueryFanoutTask) {
        return (
          <div className="flex flex-col items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => createQueryFanoutDraftMutation.mutate(item.actionableId!)}
              disabled={createQueryFanoutDraftMutation.isPending}
              data-testid={`button-create-query-fanout-draft-${item.actionableId}`}
            >
              {createQueryFanoutDraftMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
              Create AXP draft
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateOptimizationMutation.mutate({ id: item.actionableId!, status: "applied" })}
              disabled={updateOptimizationMutation.isPending}
              data-testid={`button-apply-optimization-${item.actionableId}`}
            >
              Mark applied
            </Button>
          </div>
        );
      }
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateOptimizationMutation.mutate({ id: item.actionableId!, status: "applied" })}
          disabled={updateOptimizationMutation.isPending}
          data-testid={`button-apply-optimization-${item.actionableId}`}
        >
          <FileCheck2 className="mr-2 h-3.5 w-3.5" />
          Mark applied
        </Button>
      );
    }
    if (item.stage === "verified") {
      return (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "pending" })}
          disabled={updateVerificationMutation.isPending}
          data-testid={`button-reopen-verification-${item.actionableId}`}
        >
          Reopen
        </Button>
      );
    }
    if (item.evidenceKind === "agent_readiness_scan") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkAgentReadinessMutation.mutate(item.actionableId!)}
            disabled={checkAgentReadinessMutation.isPending}
            data-testid={`button-check-agent-readiness-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check latest scan
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "answer_intelligence_scan") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkAnswerIntelligenceMutation.mutate(item.actionableId!)}
            disabled={checkAnswerIntelligenceMutation.isPending}
            data-testid={`button-check-answer-intelligence-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check latest answer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "citation_opportunity_scan") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkCitationOpportunityMutation.mutate(item.actionableId!)}
            disabled={checkCitationOpportunityMutation.isPending}
            data-testid={`button-check-citation-opportunity-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check citation evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "market_opportunity_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkMarketOpportunityMutation.mutate(item.actionableId!)}
            disabled={checkMarketOpportunityMutation.isPending}
            data-testid={`button-check-market-opportunity-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check market evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "product_pilot_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkProductPilotMutation.mutate(item.actionableId!)}
            disabled={checkProductPilotMutation.isPending}
            data-testid={`button-check-product-pilot-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check product gate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "provider_recovery_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkProviderRecoveryMutation.mutate(item.actionableId!)}
            disabled={checkProviderRecoveryMutation.isPending}
            data-testid={`button-check-provider-recovery-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check provider evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "production_hardening_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkProductionHardeningMutation.mutate(item.actionableId!)}
            disabled={checkProductionHardeningMutation.isPending}
            data-testid={`button-check-production-hardening-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check launch gate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "integration_setup_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkIntegrationSetupMutation.mutate(item.actionableId!)}
            disabled={checkIntegrationSetupMutation.isPending}
            data-testid={`button-check-integration-setup-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check setup
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "competitive_parity_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkCompetitiveParityMutation.mutate(item.actionableId!)}
            disabled={checkCompetitiveParityMutation.isPending}
            data-testid={`button-check-competitive-parity-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check parity evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "generic_proof_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkGenericProofMutation.mutate(item.actionableId!)}
            disabled={checkGenericProofMutation.isPending}
            data-testid={`button-check-generic-proof-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check proof evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    if (item.evidenceKind === "axp_publication_check") {
      return (
        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkAxpPublicationMutation.mutate(item.actionableId!)}
            disabled={checkAxpPublicationMutation.isPending}
            data-testid={`button-check-axp-publication-${item.actionableId}`}
          >
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Check AXP live
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
            disabled={updateVerificationMutation.isPending}
            data-testid={`button-complete-verification-${item.actionableId}`}
          >
            Manual proof
          </Button>
        </div>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => updateVerificationMutation.mutate({ id: item.actionableId!, status: "verified" })}
        disabled={updateVerificationMutation.isPending}
        data-testid={`button-complete-verification-${item.actionableId}`}
      >
        <ShieldCheck className="mr-2 h-3.5 w-3.5" />
        Complete proof
      </Button>
    );
  };

  const stats = useMemo(() => {
    const counts = workflow.reduce<Record<WorkflowItem["stage"], number>>((acc, item) => {
      acc[item.stage] += 1;
      return acc;
    }, { finding: 0, planned: 0, drafted: 0, queued: 0, applied: 0, verified: 0 });
    const total = workflow.length;
    const active = counts.planned + counts.drafted + counts.queued;
    const executionRate = total ? Math.round(((counts.applied + counts.verified) / total) * 100) : 0;
    const verificationRate = total ? Math.round((counts.verified / total) * 100) : 0;
    return { counts, total, active, executionRate, verificationRate };
  }, [workflow]);

  const proofBlockers = useMemo(() => workflow
    .filter((item) => item.actionableKind === "verification" && item.stage !== "verified")
    .sort((a, b) => {
      const evidenceRank = { failed: 0, unknown: 1, passed: 2 };
      return (evidenceRank[a.evidenceStatus || "unknown"] ?? 1) - (evidenceRank[b.evidenceStatus || "unknown"] ?? 1)
        || b.impact - a.impact;
    })
    .slice(0, 6), [workflow]);

  const proofDebtStats = useMemo(() => {
    const pending = workflow.filter((item) => item.actionableKind === "verification" && item.stage !== "verified");
    const failed = pending.filter((item) => item.evidenceStatus === "failed").length;
    const passed = pending.filter((item) => item.evidenceStatus === "passed").length;
    const unknown = pending.filter((item) => !item.evidenceStatus || item.evidenceStatus === "unknown").length;
    const generic = pending.filter((item) => item.evidenceKind === "generic_proof_check").length;
    const specialist = pending.length - generic;
    return { pending: pending.length, failed, passed, unknown, generic, specialist };
  }, [workflow]);

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Action Workflow" />
        <p className="text-muted-foreground">Select a brand to view execution workflow.</p>
      </div>
    );
  }

  if (actionsLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Action Workflow" showExport />

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Verified Action Workflow</h1>
        <p className="mt-1 text-muted-foreground">
          Turn visibility findings into planned tasks, approved assets, published changes, and verified impact.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="glass-card p-4" data-testid="stat-workflow-total">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardList className="h-4 w-4" />
            <span className="text-xs">Total Actions</span>
          </div>
          <div className="text-2xl font-bold font-mono">{stats.total}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-workflow-active">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <RefreshCw className="h-4 w-4" />
            <span className="text-xs">Active</span>
          </div>
          <div className="text-2xl font-bold font-mono">{stats.active}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-workflow-applied">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileCheck2 className="h-4 w-4" />
            <span className="text-xs">Applied</span>
          </div>
          <div className="text-2xl font-bold font-mono">{stats.counts.applied}</div>
        </Card>
        <Card className="glass-card p-4 border-emerald-500/20 bg-emerald-500/5" data-testid="stat-workflow-verified">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs">Verified</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600">{stats.counts.verified}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-workflow-rate">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs">Execution Rate</span>
          </div>
          <div className="text-2xl font-bold font-mono">{stats.executionRate}%</div>
        </Card>
      </div>

      <Card className="glass-card" data-testid="card-workflow-funnel">
        <CardHeader>
          <CardTitle>Execution Funnel</CardTitle>
          <CardDescription>Healthy production workflows should move from findings to verified impact.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          {(Object.keys(STAGE_LABELS) as WorkflowItem["stage"][]).map((stage) => (
            <div key={stage} className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{STAGE_LABELS[stage]}</p>
              <p className="mt-1 text-2xl font-bold font-mono">{stats.counts[stage]}</p>
              <Progress value={stats.total ? (stats.counts[stage] / stats.total) * 100 : 0} className="mt-2 h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-workflow-actions">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Action Queue</CardTitle>
              <CardDescription>Live tasks from gap analysis, recommendations, optimization history, product readiness, and publish queue.</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createAllQueryFanoutDraftsMutation.mutate()}
              disabled={createAllQueryFanoutDraftsMutation.isPending || pendingQueryFanoutDrafts.length === 0}
              data-testid="button-create-all-query-fanout-drafts"
            >
              {createAllQueryFanoutDraftsMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
              Draft fanouts ({pendingQueryFanoutDrafts.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {workflow.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No live actions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Generate gap analysis or product visibility actions to populate the workflow.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-center">Impact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflow.slice(0, 30).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-start gap-2">
                        {item.stage === "verified" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        ) : item.stage === "applied" ? (
                          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                        ) : (
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span>
                          {item.title}
                          {item.evidenceSummary ? (
                            <span className={cn(
                              "mt-1 block text-xs font-normal",
                              item.evidenceStatus === "passed" ? "text-emerald-700" :
                                item.evidenceStatus === "failed" ? "text-amber-700" :
                                  "text-muted-foreground"
                            )}>
                              Proof: {item.evidenceSummary}
                            </span>
                          ) : null}
                          {item.stage !== "verified" && item.proofRequirement ? (
                            <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                              Proof needed: {item.proofRequirement}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{item.source}</TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{item.type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("capitalize", priorityClass(item.priority))}>{item.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono">{item.impact || "-"}</TableCell>
                    <TableCell><Badge variant="outline">{STAGE_LABELS[item.stage]}</Badge></TableCell>
                    <TableCell className="text-right">{renderWorkflowControls(item)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5" data-testid="card-verification-gap">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageCheck className="h-5 w-5 text-amber-600" />
                Verification Gap
              </CardTitle>
              <CardDescription>
                {stats.verificationRate}% of actions are verified. {verificationData?.summary?.pending || 0} verification task{verificationData?.summary?.pending === 1 ? "" : "s"} need follow-up evidence.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => checkAllPendingEvidenceMutation.mutate()}
              disabled={checkAllPendingEvidenceMutation.isPending || !verificationData?.summary?.pending}
              data-testid="button-check-all-pending-evidence"
            >
              {checkAllPendingEvidenceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Check all evidence
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4" data-testid="verification-proof-debt-summary">
            {[
              { label: "Failed evidence", value: proofDebtStats.failed, detail: "Checked but not yet passing" },
              { label: "Waiting for scan", value: proofDebtStats.unknown, detail: "Needs fresh AI/source evidence" },
              { label: "Generic proof", value: proofDebtStats.generic, detail: "Published changes need resampling" },
              { label: "Specialist checks", value: proofDebtStats.specialist, detail: "Readiness, parity, provider, or integration gates" },
            ].map((row) => (
              <div key={row.label} className="rounded-md border bg-background p-3 text-sm">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="mt-1 font-mono text-2xl font-bold">{row.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
              </div>
            ))}
          </div>
          {proofBlockers.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2" data-testid="verification-proof-blockers">
              {proofBlockers.map((item) => (
                <div key={`proof-blocker-${item.id}`} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.source}</p>
                    </div>
                    <Badge variant="outline" className={cn(
                      item.evidenceStatus === "failed" ? "border-amber-300 bg-amber-50 text-amber-700" :
                        item.evidenceStatus === "passed" ? "border-emerald-300 bg-emerald-50 text-emerald-700" :
                          "text-muted-foreground"
                    )}>
                      {item.evidenceStatus || "unknown"}
                    </Badge>
                  </div>
                  {item.evidenceSummary ? (
                    <p className="mt-2 text-xs text-amber-700">{item.evidenceSummary}</p>
                  ) : null}
                  {item.proofRequirement ? (
                    <p className="mt-2 text-xs text-muted-foreground">{item.proofRequirement}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {renderWorkflowControls(item)}
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={workstreamHrefForAction(item.type, item.evidenceKind)}>
                        Open workstream
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open proof blockers. Keep scheduled scans and evidence checks active.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Next production step: close these proof blockers with live evidence before claiming verified impact in launch or parity reports.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
