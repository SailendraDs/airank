import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, ClipboardList, PlugZap, ShieldCheck, TimerReset } from "lucide-react";

type OpsTask = {
  id: string;
  brandId: string | null;
  brandName: string | null;
  title: string;
  type: string;
  source: string;
  priority: string;
  status: string;
  ownerUserId?: string | null;
  dueAt?: string | null;
  evidenceRequired: boolean;
  evidenceUrl?: string | null;
  checklistItems?: string[] | null;
  relatedActionId?: string | null;
  relatedVerificationTaskId?: string | null;
  createdAt?: string | null;
};

type QueueResponse = {
  tasks: OpsTask[];
  summary: Record<string, number>;
  types: string[];
  events?: Array<{
    id: string;
    taskId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    evidenceUrl?: string | null;
    message?: string | null;
    createdAt?: string | null;
  }>;
};

type IntegrationRow = {
  id: string;
  brandId: string;
  brandName: string | null;
  platform: string;
  status: string;
  syncStatus?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  lastSync?: string | null;
  syncError?: string | null;
};

type IntegrationSetupOption = {
  platform: string;
  label: string;
  featureKey: string;
  kind: "oauth" | "social";
  status: string;
  allowed: boolean;
  entitlementSource?: string | null;
  accountName?: string | null;
  lastSync?: string | null;
  nextStep: string;
};

type LaunchConsole = {
  brand?: { id: string; name: string; domain: string; tier: string };
  readiness?: { verdict: string; unsafeClaims: string[]; pendingProof: string[] };
  blockers?: { type: string; title: string; status: string }[];
  integrations?: IntegrationRow[];
  opsTasks?: OpsTask[];
  entitlements?: { featureKey: string; allowed: boolean; source: string }[];
};

type AuditGate = {
  id: string;
  label: string;
  status: string;
  score?: number;
  evidence: string;
  action: string;
};

type LaunchBlockerItem = {
  id: string;
  title: string;
  evidence: string;
  action?: string;
  clearCondition?: string;
  clearanceSteps?: string[];
};

type ProductionAudit = {
  score: number;
  verdict: string;
  status: string;
  gates: AuditGate[];
  launchBlockerPack?: {
    headline?: string;
    salesPositioning?: string;
    externalBlockers?: LaunchBlockerItem[];
    proofDebt?: LaunchBlockerItem[];
    buyerSafeClaims?: string[];
    doNotClaimYet?: string[];
  };
  metrics?: Record<string, unknown>;
};

type SchemaDeploymentDesk = {
  brand?: { id: string; name: string; domain: string; homepageUrl?: string | null };
  summary: {
    schemaAssets: number;
    activeSchemaAssets: number;
    schemaProofTasks: number;
    pendingSchemaProofTasks: number;
    pendingSchemaOpsTasks: number;
    status: string;
  };
  homepageSchema?: {
    id: string;
    name: string;
    schemaType: string;
    isActive?: boolean;
    updatedAt?: string | null;
    snippet: string;
  } | null;
  proofTasks: Array<{ id: string; title?: string; status?: string; verificationNote?: string }>;
  checklist: string[];
};

type ProviderReliabilityDesk = {
  summary: {
    status: string;
    freshEnterpriseProviders: number;
    enterpriseTargetProviders: number;
    failedEnterpriseProviders: number;
    preflightBlocked: number | null;
    pendingProviderOpsTasks: number;
    clearCondition: string;
    canClaimEnterpriseCoverage: boolean;
  };
  latestPreflight?: {
    ok: boolean;
    finishedAt?: string | null;
    passed: number;
    blocked: number;
  } | null;
  recoveryPlan: Array<{
    provider: string;
    label: string;
    status: string;
    severity: string;
    cause: string;
    action: string;
    envHint?: string | null;
  }>;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["done", "connected", "verified"].includes(status)) return "default";
  if (["blocked", "failed", "error"].includes(status)) return "destructive";
  if (["in_progress", "manual_pending", "pending"].includes(status)) return "secondary";
  return "outline";
}

export default function AdminOperations() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState({
    title: "",
    type: "schema_deploy",
    priority: "high",
    brandId: "",
    internalNotes: "",
  });
  const [launchBrandId, setLaunchBrandId] = useState("");
  const [overrideFeature, setOverrideFeature] = useState("production_audit");
  const [taskEvidenceUrls, setTaskEvidenceUrls] = useState<Record<string, string>>({});

  const queueUrl = status === "all" ? "/api/admin/ops/queue" : `/api/admin/ops/queue?status=${encodeURIComponent(status)}`;
  const { data, isLoading } = useQuery<QueueResponse>({ queryKey: [queueUrl], queryFn: () => apiFetch(queueUrl) });
  const { data: integrationDesk, isLoading: integrationsLoading } = useQuery<{ integrations: IntegrationRow[]; setupOptions?: IntegrationSetupOption[] }>({
    queryKey: ["/api/admin/integration-setup-desk", launchBrandId],
    queryFn: () => apiFetch(`/api/admin/integration-setup-desk${launchBrandId ? `?brandId=${encodeURIComponent(launchBrandId)}` : ""}`),
  });
  const { data: launchConsole, isLoading: launchLoading, refetch: refetchLaunchConsole } = useQuery<LaunchConsole>({
    queryKey: ["/api/admin/brands/launch-console", launchBrandId],
    queryFn: () => apiFetch(`/api/admin/brands/${launchBrandId}/launch-console`),
    enabled: Boolean(launchBrandId),
  });
  const { data: productionAudit, isLoading: auditLoading, refetch: refetchProductionAudit } = useQuery<ProductionAudit>({
    queryKey: ["/api/brands/production-readiness-audit", launchBrandId],
    queryFn: () => apiFetch(`/api/brands/${launchBrandId}/production-readiness-audit`),
    enabled: Boolean(launchBrandId),
  });
  const { data: schemaDesk, isLoading: schemaDeskLoading, refetch: refetchSchemaDesk } = useQuery<SchemaDeploymentDesk>({
    queryKey: ["/api/admin/brands/schema-deployment-desk", launchBrandId],
    queryFn: () => apiFetch(`/api/admin/brands/${launchBrandId}/schema-deployment-desk`),
    enabled: Boolean(launchBrandId),
  });
  const { data: providerDesk, refetch: refetchProviderDesk } = useQuery<ProviderReliabilityDesk>({
    queryKey: ["/api/admin/brands/provider-reliability-desk", launchBrandId],
    queryFn: () => apiFetch(`/api/admin/brands/${launchBrandId}/provider-reliability-desk`),
    enabled: Boolean(launchBrandId),
  });

  const createTask = useMutation({
    mutationFn: () => apiFetch("/api/admin/ops/queue", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        brandId: form.brandId.trim() || null,
        source: "admin_console",
        evidenceRequired: true,
      }),
    }),
    onSuccess: () => {
      setForm({ title: "", type: "schema_deploy", priority: "high", brandId: "", internalNotes: "" });
      queryClient.invalidateQueries({ queryKey: [queueUrl] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, nextStatus, evidenceUrl }: { taskId: string; nextStatus: string; evidenceUrl?: string }) =>
      apiFetch(`/api/admin/ops/queue/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, evidenceUrl }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queueUrl] }),
  });

  const grantOverride = useMutation({
    mutationFn: () => apiFetch(`/api/admin/brands/${launchBrandId}/feature-overrides`, {
      method: "POST",
      body: JSON.stringify({
        featureKey: overrideFeature,
        enabled: true,
        reason: "Granted from Admin Operations Console",
      }),
    }),
    onSuccess: async () => {
      await refetchLaunchConsole();
    },
  });

  const createProviderRecoveryTask = useMutation({
    mutationFn: () => {
      const providerGate = productionAudit?.gates?.find((gate) => gate.id === "provider_reliability");
      const providerChecklist = [
        "Run provider preflight for configured enterprise providers.",
        "Fix credential, billing, quota, model, or plan-lock blockers for failed providers.",
        "Restart workers after credential changes.",
        "Queue an enterprise pilot sweep and confirm at least four providers produce fresh answers.",
        "Verify cross-model visibility monitoring only after preflight passes and failed providers are zero.",
      ];
      return apiFetch("/api/admin/ops/queue", {
        method: "POST",
        body: JSON.stringify({
          brandId: launchBrandId,
          title: "Recover enterprise provider reliability",
          type: "provider_recovery",
          source: "provider_reliability_desk",
          priority: "urgent",
          evidenceRequired: true,
          checklistItems: providerChecklist,
          internalNotes: [
            providerGate?.evidence,
            providerGate?.action,
            productionAudit?.launchBlockerPack?.externalBlockers?.find((item) => item.id === "provider_reliability")?.clearCondition,
          ].filter(Boolean).join("\n"),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queueUrl] });
      await refetchLaunchConsole();
      await refetchProviderDesk();
    },
  });

  const createSchemaDeploymentTask = useMutation({
    mutationFn: () => apiFetch("/api/admin/ops/queue", {
      method: "POST",
      body: JSON.stringify({
        brandId: launchBrandId,
        title: "Deploy homepage schema and verify Agent Readiness",
        type: "schema_deploy",
        source: "schema_deployment_desk",
        priority: "urgent",
        evidenceRequired: true,
        checklistItems: schemaDesk?.checklist || [
          "Deploy the active homepage JSON-LD @graph in the live homepage head.",
          "Validate Organization, WebSite, and WebPage nodes.",
          "Rerun Agent Readiness and attach proof.",
        ],
        relatedVerificationTaskId: schemaDesk?.proofTasks?.find((task) => String(task.status || "pending") !== "verified")?.id || null,
        internalNotes: [
          schemaDesk?.homepageSchema ? `Schema asset: ${schemaDesk.homepageSchema.name}` : "No homepage schema asset found.",
          schemaDesk?.brand?.homepageUrl ? `Homepage: ${schemaDesk.brand.homepageUrl}` : "",
          ...(schemaDesk?.checklist || []),
        ].filter(Boolean).join("\n"),
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queueUrl] });
      await refetchLaunchConsole();
      await refetchSchemaDesk();
    },
  });

  const syncBlockerTasks = useMutation({
    mutationFn: () => apiFetch(`/api/admin/brands/${launchBrandId}/launch-console/sync-blocker-tasks`, {
      method: "POST",
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queueUrl] });
      await refetchLaunchConsole();
      await refetchProviderDesk();
      await refetchSchemaDesk();
    },
  });

  const summaryCards = useMemo(() => {
    const summary = data?.summary || {};
    return [
      { label: "Open", value: summary.open || 0, icon: ClipboardList },
      { label: "In Progress", value: summary.in_progress || 0, icon: TimerReset },
      { label: "Blocked", value: summary.blocked || 0, icon: ShieldCheck },
      { label: "Done", value: summary.done || 0, icon: CheckCircle2 },
    ];
  }, [data]);

  const providerGate = productionAudit?.gates?.find((gate) => gate.id === "provider_reliability");
  const workflowGate = productionAudit?.gates?.find((gate) => gate.id === "workflow_proof");
  const blockerPack = productionAudit?.launchBlockerPack;
  const schemaGate = productionAudit?.gates?.find((gate) => gate.id === "agent_readiness");
  const reportWarnings = [
    ...(blockerPack?.doNotClaimYet || []),
    ...(launchConsole?.readiness?.unsafeClaims || []).map((claim) => `Do not claim ${claim.toLowerCase()}.`),
  ].slice(0, 5);
  const buyerSafeClaims = blockerPack?.buyerSafeClaims || [];

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Console</h1>
          <p className="text-muted-foreground">Manual launch execution, integration setup, and proof tasks.</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{isLoading ? <Skeleton className="h-7 w-12" /> : card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Brand Launch Console</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label>Brand ID</Label>
              <Input
                value={launchBrandId}
                onChange={(event) => setLaunchBrandId(event.target.value.trim())}
                placeholder="Paste a brand id to inspect launch readiness"
              />
            </div>
            <Button
              variant="outline"
              disabled={!launchBrandId || launchLoading || auditLoading || schemaDeskLoading}
              onClick={() => {
                refetchLaunchConsole();
                refetchProductionAudit();
                refetchSchemaDesk();
                refetchProviderDesk();
              }}
            >
              Inspect
            </Button>
            <Button
              disabled={!launchBrandId || syncBlockerTasks.isPending}
              onClick={() => syncBlockerTasks.mutate()}
            >
              Sync Blockers
            </Button>
          </div>
          {launchLoading || auditLoading || schemaDeskLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : launchConsole?.brand ? (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
                <div className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{launchConsole.brand.name}</p>
                      <p className="text-sm text-muted-foreground">{launchConsole.brand.domain}</p>
                    </div>
                    <Badge variant="outline">{launchConsole.brand.tier}</Badge>
                  </div>
                  <p className="mt-4 text-sm font-medium">{productionAudit?.verdict || launchConsole.readiness?.verdict}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {productionAudit ? `${productionAudit.score}/100 production audit - ${productionAudit.status.replace(/_/g, " ")}` : "Keep client claims in pilot-safe language until external proof gates clear."}
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm font-semibold">Open Blockers</p>
                  <div className="mt-3 space-y-2">
                    {(launchConsole.blockers || []).slice(0, 4).map((blocker, index) => (
                      <div key={`${blocker.type}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{blocker.title}</span>
                        <Badge variant={statusVariant(blocker.status)}>{blocker.status.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                    {!launchConsole.blockers?.length ? <p className="text-xs text-muted-foreground">No local blockers recorded.</p> : null}
                  </div>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-sm font-semibold">Active Entitlements</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(launchConsole.entitlements || []).filter((item) => item.allowed).slice(0, 8).map((item) => (
                      <Badge key={item.featureKey} variant="secondary">{item.featureKey.replace(/_/g, " ")}</Badge>
                    ))}
                    {!launchConsole.entitlements?.some((item) => item.allowed) ? <p className="text-xs text-muted-foreground">No advanced features enabled.</p> : null}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Select value={overrideFeature} onValueChange={setOverrideFeature}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "production_audit",
                          "competitive_parity",
                          "agent_readiness_full",
                          "schema_fix_pack",
                          "product_readiness",
                          "ga4_oauth",
                          "gsc_oauth",
                          "social_x",
                          "social_instagram",
                          "social_youtube",
                        ].map((feature) => (
                          <SelectItem key={feature} value={feature}>{feature.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={grantOverride.isPending} onClick={() => grantOverride.mutate()}>
                      Grant
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Provider Reliability Desk</p>
                      <p className="mt-1 text-xs text-muted-foreground">Freshness, failed-provider, and preflight gate for enterprise claims.</p>
                    </div>
                    <Badge variant={statusVariant(providerDesk?.summary?.status || providerGate?.status || "missing")}>
                      {(providerDesk?.summary?.status || providerGate?.status || "missing").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm">
                    {providerDesk?.summary
                      ? `${providerDesk.summary.freshEnterpriseProviders}/${providerDesk.summary.enterpriseTargetProviders} enterprise providers fresh; ${providerDesk.summary.failedEnterpriseProviders} failed; ${providerDesk.summary.preflightBlocked == null ? "no preflight" : `${providerDesk.summary.preflightBlocked} preflight blockers`}.`
                      : providerGate?.evidence || "No provider reliability audit has run yet."}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{providerDesk?.summary?.freshEnterpriseProviders ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">fresh</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{providerDesk?.summary?.failedEnterpriseProviders ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">failed</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{providerDesk?.summary?.pendingProviderOpsTasks ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">ops</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {providerDesk?.latestPreflight
                      ? `Latest preflight: ${providerDesk.latestPreflight.passed} passed, ${providerDesk.latestPreflight.blocked} blocked.`
                      : providerGate?.action || "Run production readiness after provider preflight data exists."}
                  </p>
                  <div className="mt-4 space-y-2">
                    {(providerDesk?.recoveryPlan || []).slice(0, 4).map((item, index) => (
                      <div key={`${item.provider}-${index}`} className="rounded border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.label}</span>
                          <Badge variant={statusVariant(item.severity)}>{item.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{item.cause}</p>
                      </div>
                    ))}
                    {!(providerDesk?.recoveryPlan || []).length && (blockerPack?.externalBlockers || []).filter((item) => item.id === "provider_reliability").flatMap((item) => item.clearanceSteps || []).slice(0, 4).map((step, index) => (
                      <div key={`${step}-${index}`} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="font-mono text-foreground">{index + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="mt-4"
                    disabled={!launchBrandId || createProviderRecoveryTask.isPending}
                    onClick={() => createProviderRecoveryTask.mutate()}
                  >
                    Create Recovery Task
                  </Button>
                </div>

                <div className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Schema Deployment Desk</p>
                      <p className="mt-1 text-xs text-muted-foreground">Homepage JSON-LD deployment and rescan proof for Agent Readiness.</p>
                    </div>
                    <Badge variant={statusVariant(schemaDesk?.summary?.status || "missing")}>
                      {(schemaDesk?.summary?.status || "missing").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm">{schemaGate?.evidence || "Agent Readiness schema gate has not run yet."}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{schemaDesk?.summary?.activeSchemaAssets ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">assets</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{schemaDesk?.summary?.pendingSchemaProofTasks ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">proof</p>
                    </div>
                    <div className="rounded border p-2">
                      <p className="font-mono text-sm">{schemaDesk?.summary?.pendingSchemaOpsTasks ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground">ops</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {schemaDesk?.homepageSchema
                      ? `${schemaDesk.homepageSchema.name} is ready to deploy on ${schemaDesk.brand?.homepageUrl || "the homepage"}.`
                      : "Create the homepage schema fix pack before assigning deployment."}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(schemaDesk?.checklist || []).slice(0, 3).map((step, index) => (
                      <div key={`${step}-${index}`} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="font-mono text-foreground">{index + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="mt-4"
                    disabled={!launchBrandId || createSchemaDeploymentTask.isPending}
                    onClick={() => createSchemaDeploymentTask.mutate()}
                  >
                    Create Schema Task
                  </Button>
                </div>

                <div className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Report QA Approval</p>
                      <p className="mt-1 text-xs text-muted-foreground">Client-facing claims must match verified evidence and launch blockers.</p>
                    </div>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="mt-4 text-sm font-medium">{blockerPack?.headline || launchConsole.readiness?.verdict}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{workflowGate?.evidence || launchConsole.readiness?.pendingProof?.[0]}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Buyer-safe claims</p>
                      <div className="mt-2 space-y-2">
                        {buyerSafeClaims.slice(0, 4).map((claim) => (
                          <p key={claim} className="text-xs">{claim}</p>
                        ))}
                        {!buyerSafeClaims.length ? <p className="text-xs text-muted-foreground">No safe claims generated yet.</p> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Do not approve yet</p>
                      <div className="mt-2 space-y-2">
                        {reportWarnings.map((warning) => (
                          <p key={warning} className="text-xs text-muted-foreground">{warning}</p>
                        ))}
                        {!reportWarnings.length ? <p className="text-xs text-muted-foreground">No QA warnings generated yet.</p> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Use this console for provider recovery, schema proof, integration setup, and report QA before client launch claims.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execution Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Proof</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.tasks || []).map((task) => {
                    const pendingEvidenceUrl = (taskEvidenceUrls[task.id] || "").trim();
                    const evidenceUrl = pendingEvidenceUrl || task.evidenceUrl || "";
                    const needsEvidenceBeforeDone = task.status !== "done" && task.evidenceRequired && !evidenceUrl;
                    return (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-muted-foreground">{task.type.replace(/_/g, " ")} - {task.source}</div>
                        </TableCell>
                        <TableCell>{task.brandName || task.brandId || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{task.priority}</Badge></TableCell>
                        <TableCell><Badge variant={statusVariant(task.status)}>{task.status.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell>
                          <div>{task.evidenceUrl ? "Attached" : task.evidenceRequired ? "Required" : "-"}</div>
                          {task.evidenceRequired && !task.evidenceUrl ? (
                            <Input
                              type="url"
                              className="mt-2 h-8 text-xs"
                              value={taskEvidenceUrls[task.id] || ""}
                              onChange={(event) => setTaskEvidenceUrls({ ...taskEvidenceUrls, [task.id]: event.target.value })}
                              placeholder="Evidence URL"
                            />
                          ) : null}
                          {Array.isArray(task.checklistItems) && task.checklistItems.length > 0 ? (
                            <div className="mt-1 text-xs text-muted-foreground">{task.checklistItems.length} checklist items</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={needsEvidenceBeforeDone || updateTask.isPending}
                            onClick={() => updateTask.mutate({
                              taskId: task.id,
                              nextStatus: task.status === "done" ? "open" : "done",
                              evidenceUrl: evidenceUrl || undefined,
                            })}
                          >
                            {task.status === "done" ? "Reopen" : "Done"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Ops Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.events || []).length ? (
              <div className="space-y-2">
                {(data?.events || []).slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline">{event.eventType.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {event.message || [event.fromStatus, event.toStatus].filter(Boolean).join(" -> ") || "Task activity recorded."}
                    </p>
                    {event.evidenceUrl ? <p className="mt-1 truncate text-xs text-muted-foreground">{event.evidenceUrl}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No operations activity recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Ops Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(data?.types || ["schema_deploy", "provider_recovery", "report_qa"]).map((type) => (
                    <SelectItem key={type} value={type}>{type.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Brand ID</Label>
              <Input value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
            </div>
            <Button className="w-full" disabled={!form.title || createTask.isPending} onClick={() => createTask.mutate()}>
              Create Task
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center gap-2">
          <PlugZap className="h-4 w-4" />
          <CardTitle className="text-base">Integration Setup Desk</CardTitle>
        </CardHeader>
        <CardContent>
          {integrationsLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <div className="space-y-6">
              {(integrationDesk?.setupOptions || []).length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {(integrationDesk?.setupOptions || []).map((option) => (
                    <div key={option.platform} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="mt-1 text-[11px] uppercase text-muted-foreground">{option.kind}</p>
                        </div>
                        <Badge variant={statusVariant(option.status)}>{option.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{option.nextStep}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {option.accountName || option.entitlementSource || option.featureKey}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(integrationDesk?.integrations || []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.brandName || row.brandId}</TableCell>
                      <TableCell>{row.platform.replace(/_/g, " ")}</TableCell>
                      <TableCell><Badge variant={statusVariant(row.status)}>{row.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{row.accountName || row.accountId || "-"}</TableCell>
                      <TableCell>{row.lastSync ? new Date(row.lastSync).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.syncError || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
