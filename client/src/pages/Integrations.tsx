import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ClipboardList, Code2, Copy, FileCheck2, Lock, Loader2, RefreshCw, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";

const INTEGRATION_DEFS: { id: string; name: string; icon: string; featureKey?: string; kind?: "google" | "social" | "system" }[] = [
  { id: "google_search_console", name: "Google Search Console", icon: "google", featureKey: "gsc_oauth", kind: "google" },
  { id: "google_analytics",      name: "Google Analytics 4",    icon: "google", featureKey: "ga4_oauth", kind: "google" },
  { id: "x",                     name: "X / Twitter",           icon: "twitter", featureKey: "social_x", kind: "social" },
  { id: "instagram",             name: "Instagram",             icon: "instagram", featureKey: "social_instagram", kind: "social" },
  { id: "youtube",               name: "YouTube",               icon: "youtube", featureKey: "social_youtube", kind: "social" },
  { id: "wikidata",              name: "Wikidata",              icon: "wiki", kind: "system" },
  { id: "knowledge_graph",       name: "Google Knowledge Graph", icon: "google", kind: "system" },
  { id: "serp",                  name: "SERP (DataForSEO)",     icon: "search", kind: "system" },
  { id: "firecrawl",             name: "Firecrawl Enrichment",  icon: "brand", kind: "system" },
];

const OAUTH_SERVICES: Record<string, string> = {
  google_search_console: "gsc",
  google_analytics: "ga4",
};

function integrationSetupActionType(stepId: string) {
  return `integration_setup:${String(stepId || "step").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}`;
}

export default function IntegrationsPage() {
  const { brand, isLoading } = useCurrentBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const brandId = brand?.id || "";

  const { data: statusMap, isLoading: statusLoading } = useQuery<Record<string, string>>({
    queryKey: ['/api/integrations/status', brand?.id],
    queryFn: async () => {
      const res = await fetch(`/api/integrations/status${brand?.id ? `?brandId=${brand.id}` : ''}`);
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
    enabled: Boolean(brandId),
  });

  const { data: featureAccess } = useQuery<any>({
    queryKey: ["brand-features", brandId],
    queryFn: () => api.getBrandFeatures(brandId),
    enabled: Boolean(brandId),
  });

  const { data: optimizations = [] } = useQuery<any[]>({
    queryKey: ["integrations", brandId, "optimizations"],
    queryFn: () => api.getOptimizationHistory(brandId, 100),
    enabled: Boolean(brandId),
  });
  const { data: crawlerStats } = useQuery<any>({
    queryKey: ["integrations", brandId, "crawler-stats"],
    queryFn: () => api.getCrawlerStats(brandId),
    enabled: Boolean(brandId),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await fetch(`/api/integrations/google/_?platform=${platform}&brandId=${brand?.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      toast({ title: "Disconnected", description: "Integration has been disconnected." });
    },
  });

  const socialConnectMutation = useMutation({
    mutationFn: async ({ platform, handle }: { platform: string; handle: string }) => {
      const res = await fetch(`/api/integrations/social/${platform}/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, handle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to request social connection");
      return data;
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/status', brand?.id] }),
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] }),
      ]);
      toast({
        title: "Connection request saved",
        description: `${variables.platform} is queued for admin-assisted setup and verification.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not request connection", description: error?.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      toast({
        title: "Connected!",
        description: `Successfully connected ${connected === "gsc" ? "Google Search Console" : "Google Analytics"}.`,
      });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
    }
    if (error) {
      toast({ title: "Connection Failed", description: `OAuth error: ${error}`, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
  const setupSteps = [
    {
      id: "gsc",
      title: "Connect Google Search Console",
      detail: "Use verified GSC property data to prove indexed pages, branded search movement, and source validation.",
      done: statusMap?.google_search_console === "connected",
      action: "Connect the verified domain property, then rerun Production Launch Audit.",
    },
    {
      id: "ga4",
      title: "Connect GA4 conversion data",
      detail: "Tie AI referrals and campaign traffic to conversions, revenue, and assisted conversion proof.",
      done: statusMap?.google_analytics === "connected",
      action: "Connect GA4 with conversion events and revenue where available.",
    },
    {
      id: "agent_analytics",
      title: "Install Agent Analytics snippet",
      detail: "Capture ChatGPT, Claude, Perplexity, Gemini, and other AI crawler visits before reporting impact.",
      done: crawlerVisits > 0,
      action: "Open Agent Analytics, generate the ingest token, install the snippet, and record a test hit.",
    },
  ];
  const setupComplete = setupSteps.filter((step) => step.done).length;
  const attributionLaunchPlan = useMemo(() => {
    const domain = brand?.domain || "your verified domain";
    const brandName = brand?.name || "the brand";
    return [
      `AIRank production attribution setup for ${brandName}`,
      ``,
      `1. Google Search Console`,
      `Owner: SEO or website admin`,
      `Access needed: verified domain property for ${domain}`,
      `Proof after connection: indexed page coverage, branded/non-branded query movement, and source validation refresh inside AIRank.`,
      ``,
      `2. GA4 conversion data`,
      `Owner: analytics or growth team`,
      `Access needed: GA4 property with purchase, lead, signup, or primary conversion events; revenue recommended for seller/D2C brands.`,
      `Proof after connection: AI referral sessions, conversions, assisted conversion signals, and attributed revenue where available.`,
      ``,
      `3. Agent Analytics snippet`,
      `Owner: website developer or tag manager owner`,
      `Access needed: ability to add the AIRank crawler snippet or pixel to the production site/template.`,
      `Proof after installation: at least one crawler/test hit, then live ChatGPT/Claude/Perplexity/Gemini crawler visits by page.`,
      ``,
      `Acceptance criteria before enterprise launch reporting: GSC connected, GA4 connected, Agent Analytics visit recorded, Production Launch Audit rerun, and Action Workflow evidence checks passing.`,
    ].join("\n");
  }, [brand?.domain, brand?.name]);

  const copyAttributionLaunchPlan = async () => {
    await navigator.clipboard.writeText(attributionLaunchPlan);
    toast({ title: "Attribution setup plan copied" });
  };

  const createSetupTasksMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) return { created: 0, reused: 0 };
      const existing = new Set((optimizations || []).map((log: any) => String(log.actionType || "")));
      let created = 0;
      let reused = 0;

      for (const step of setupSteps) {
        if (step.done) continue;
        const actionType = integrationSetupActionType(step.id);
        if (existing.has(actionType)) {
          reused += 1;
          continue;
        }
        await api.createOptimizationLog(brandId, {
          actionType,
          actionDescription: `Integration setup: ${step.title}. Why: ${step.detail} Action: ${step.action}`,
          estimatedImpact: step.id === "ga4" ? 90 : 80,
        });
        existing.add(actionType);
        created += 1;
      }

      return { created, reused };
    },
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["integrations", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] }),
      ]);
      toast({
        title: result?.created ? "Integration setup tasks created" : "Integration setup tasks already exist",
        description: result?.created
          ? `${result.created} setup task${result.created === 1 ? "" : "s"} added to Action Workflow${result.reused ? `; ${result.reused} reused` : ""}.`
          : "Open Action Workflow to assign and apply the existing setup tasks.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not create setup tasks", description: error?.message, variant: "destructive" });
    },
  });

  const recordManualProofMutation = useMutation({
    mutationFn: (stepId: string) => api.createManualIntegrationEvidence(brandId, {
      platform: stepId === "gsc" ? "google_search_console" : "google_analytics",
      accountName: `${brand?.name || "Brand"} ${stepId === "gsc" ? "GSC" : "GA4"} manual proof`,
      notes: stepId === "gsc"
        ? "Manual evidence recorded by implementation owner. Replace with OAuth connection when Google access is available."
        : "Manual GA4 evidence recorded by implementation owner. Replace with OAuth connection when analytics access is available.",
    }),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/status', brand?.id] }),
        queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] }),
        queryClient.invalidateQueries({ queryKey: ["integrations", brandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-center", brandId, "production-readiness"] }),
      ]);
      toast({
        title: "Integration proof recorded",
        description: result?.message || "Manual integration evidence is now stored.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Could not record proof", description: error?.message, variant: "destructive" });
    },
  });

  const setupCard = (
    <Card data-testid="integration-launch-setup">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Production Attribution Setup
            </CardTitle>
            <CardDescription>
              The launch audit needs GSC, GA4, and Agent Analytics evidence before AIRank can claim revenue or crawler-impact proof.
            </CardDescription>
          </div>
          <Badge variant="outline">{setupComplete}/{setupSteps.length} ready</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {setupSteps.map((step) => (
            <div key={step.id} className={cn("rounded-md border p-3 text-sm", step.done && "border-emerald-200 bg-emerald-50/60")} data-testid={`integration-setup-step-${step.id}`}>
              <div className="flex items-start gap-2">
                <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", step.done ? "text-emerald-600" : "text-muted-foreground")} />
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                  <p className="mt-2 text-xs">{step.action}</p>
                  {!step.done && (step.id === "gsc" || step.id === "ga4") ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => recordManualProofMutation.mutate(step.id)}
                      disabled={recordManualProofMutation.isPending}
                      data-testid={`button-record-${step.id}-manual-proof`}
                    >
                      {recordManualProofMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="mr-2 h-3.5 w-3.5" />}
                      Record proof
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            This checklist is visible before OAuth is connected so implementation owners know exactly what the production gate requires.
          </p>
          <div className="flex gap-2">
            <a href="/app/agent-analytics">
              <Button variant="outline" size="sm" data-testid="button-open-agent-analytics-setup">
                <Code2 className="mr-2 h-4 w-4" />
                Agent Analytics
              </Button>
            </a>
            <Button
              size="sm"
              onClick={() => createSetupTasksMutation.mutate()}
              disabled={createSetupTasksMutation.isPending || setupSteps.every((step) => step.done)}
              data-testid="button-create-integration-setup-tasks"
            >
              {createSetupTasksMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
              Create setup tasks
            </Button>
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-4" data-testid="integration-attribution-launch-pack">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Attribution Launch Pack
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Give this to the SEO, analytics, and web teams so the production audit can move from blocked to verified.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={copyAttributionLaunchPlan} data-testid="button-copy-attribution-launch-plan">
              <Copy className="mr-2 h-4 w-4" />
              Copy plan
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold">GSC Proof</p>
              <p className="mt-1 text-xs text-muted-foreground">Verified property, query movement, indexed URLs, source validation.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold">GA4 Proof</p>
              <p className="mt-1 text-xs text-muted-foreground">AI referrals, conversion events, assisted value, revenue when available.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold">Crawler Proof</p>
              <p className="mt-1 text-xs text-muted-foreground">{crawlerVisits} crawler/test visit{crawlerVisits === 1 ? "" : "s"} recorded for this brand.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading || statusLoading) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <TopBar title="Integrations" showTimeSelector={false} />
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const handleConnect = (integrationId: string) => {
    const service = OAUTH_SERVICES[integrationId];
    if (service && brand?.id) {
      window.location.href = `/api/integrations/google/connect?service=${service}&brandId=${brand.id}`;
    }
  };

  const handleSocialConnect = (platform: string) => {
    const handle = window.prompt(`Enter the ${platform} handle/channel to connect`);
    if (!handle?.trim()) return;
    socialConnectMutation.mutate({ platform, handle: handle.trim() });
  };

  const hasFeature = (featureKey?: string) => {
    if (!featureKey) return true;
    return Boolean(featureAccess?.features?.[featureKey]?.allowed);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Integrations" showTimeSelector={false} />

      {setupCard}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {INTEGRATION_DEFS.map(integration => {
              const isAllowed = hasFeature(integration.featureKey);
              const status = statusMap?.[integration.id] ?? "coming_soon";
              const isConnected = status === "connected" || status === "manual_pending";
              const isAvailable = status === "available" || integration.kind === "social";
              const isComingSoon = status === "coming_soon";
              const isOAuthService = integration.id in OAUTH_SERVICES;
              const isManualPending = status === "manual_pending";

              return (
                  <Card key={integration.id} className={cn("glass-card transition-all", !isAllowed && "opacity-80 bg-muted/20")}>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                          <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-xl">
                                  {integration.icon === 'google' && 'G'}
                                  {integration.icon === 'twitter' && 'X'}
                                  {integration.icon === 'instagram' && 'IG'}
                                  {integration.icon === 'youtube' && 'YT'}
                                  {integration.icon === 'linkedin' && 'In'}
                                  {integration.icon === 'reddit' && 'R'}
                                  {integration.icon === 'wiki' && 'W'}
                                  {integration.icon === 'search' && 'S'}
                                  {integration.icon === 'brand' && 'B'}
                              </div>
                              <div>
                                  <CardTitle className="text-base">{integration.name}</CardTitle>
                                  <CardDescription className="text-xs mt-1">
                                      {isConnected
                                        ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {isManualPending ? "Setup requested" : "Connected"}</span>
                                        : isComingSoon
                                          ? <span className="text-muted-foreground">Coming soon</span>
                                          : isAvailable
                                            ? <span className="text-muted-foreground">Ready to connect</span>
                                            : status === "error"
                                              ? <span className="text-destructive">Error</span>
                                              : "Not configured"}
                                  </CardDescription>
                              </div>
                          </div>
                          {!isAllowed && <Lock className="h-4 w-4 text-muted-foreground" />}
                      </CardHeader>
                      <CardContent>
                          <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                {isConnected ? <><RefreshCw className="h-3 w-3" /> Active</> : "Not syncing"}
                              </span>

                              {isAllowed ? (
                                  isConnected ? (
                                      isOAuthService ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => disconnectMutation.mutate(integration.id)}
                                            disabled={disconnectMutation.isPending}
                                          >
                                            <Unplug className="h-3 w-3 mr-1" />
                                            Disconnect
                                          </Button>
                                      ) : (
                                          <Button variant="outline" size="sm">Manage</Button>
                                      )
                                  ) : isAvailable && isOAuthService ? (
                                      <Button size="sm" onClick={() => handleConnect(integration.id)}>
                                        Connect
                                      </Button>
                                  ) : isAvailable && integration.kind === "social" ? (
                                      <Button
                                        size="sm"
                                        onClick={() => handleSocialConnect(integration.id)}
                                        disabled={socialConnectMutation.isPending}
                                      >
                                        Request setup
                                      </Button>
                                  ) : isComingSoon ? (
                                      <Badge variant="secondary">Coming soon</Badge>
                                  ) : (
                                      <Button size="sm">Configure</Button>
                                  )
                              ) : (
                                  <a href="/app/settings?tab=billing" data-testid={`link-upgrade-${integration.id}`}>
                                    <Badge variant="secondary" className="cursor-pointer">Upgrade</Badge>
                                  </a>
                              )}
                          </div>
                      </CardContent>
                  </Card>
              );
          })}
      </div>
    </div>
  );
}
