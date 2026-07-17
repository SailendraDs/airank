import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Globe,
  Mail,
  Play,
  Plus,
  Radar,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { TopBar } from "@/components/layout/TopBar";
import { useToast } from "@/hooks/use-toast";
import { useCurrentBrand } from "@/hooks/use-brand";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type AlertSeverity = "critical" | "warning" | "info";

type MonitoringAlert = {
  id: string;
  metric: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  value?: number;
  previousValue?: number;
  threshold?: number;
  route: string;
  recommendedAction: string;
};

type AlertRule = {
  id: string;
  name: string;
  metric: string;
  comparator: string;
  threshold?: number;
  channel: string;
  destination?: string;
  isActive: boolean;
  cooldownMinutes?: number;
  lastTriggeredAt?: string;
};

type AlertEvent = {
  id: string;
  metric: string;
  severity: AlertSeverity;
  title: string;
  message?: string;
  value?: number;
  previousValue?: number;
  channel?: string;
  deliveryStatus: string;
  deliveryError?: string;
  createdAt?: string;
};

const severityStyles: Record<AlertSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
};

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function metricIcon(metric: string) {
  if (metric.includes("competitor")) return Radar;
  if (metric.includes("source")) return Globe;
  if (metric.includes("crawler")) return Bot;
  if (metric.includes("verification")) return CheckCircle2;
  if (metric.includes("score")) return Gauge;
  return ShieldAlert;
}

const DEFAULT_RULES = [
  {
    name: "Visibility score drops by 5 points",
    metric: "score_drop",
    comparator: "drop",
    threshold: 5,
    channel: "email",
    cooldownMinutes: 360,
  },
  {
    name: "Competitor overtakes share of voice",
    metric: "competitor_overtake",
    comparator: "gt",
    threshold: 0,
    channel: "email",
    cooldownMinutes: 360,
  },
  {
    name: "Citation/source depth falls below launch floor",
    metric: "source_depth",
    comparator: "lt",
    threshold: 5,
    channel: "email",
    cooldownMinutes: 720,
  },
  {
    name: "AI crawler anomaly detected",
    metric: "crawler_anomaly",
    comparator: "any",
    threshold: 1,
    channel: "email",
    cooldownMinutes: 720,
  },
  {
    name: "Verification debt is pending",
    metric: "verification_debt",
    comparator: "gt",
    threshold: 0,
    channel: "email",
    cooldownMinutes: 360,
  },
  {
    name: "Prompt coverage below enterprise floor",
    metric: "prompt_coverage",
    comparator: "lt",
    threshold: 25,
    channel: "email",
    cooldownMinutes: 720,
  },
];

export default function AlertCenter() {
  const { brandId, brand } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [destination, setDestination] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery<any>({
    queryKey: ["alert-summary", brandId],
    queryFn: () => api.getAlertSummary(brandId || ""),
    enabled: Boolean(brandId),
  });
  const { data: rules = [], isLoading: rulesLoading } = useQuery<AlertRule[]>({
    queryKey: ["alert-rules", brandId],
    queryFn: () => api.getAlertRules(brandId || ""),
    enabled: Boolean(brandId),
  });
  const { data: events = [], isLoading: eventsLoading } = useQuery<AlertEvent[]>({
    queryKey: ["alert-events", brandId],
    queryFn: () => api.getAlertEvents(brandId || "", 20),
    enabled: Boolean(brandId),
  });

  const alerts: MonitoringAlert[] = data?.alerts || [];
  const summary = data?.summary || {};
  const notificationDestination = destination || (brand as any)?.contactEmail || "";

  const refreshAlertData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["alert-summary", brandId] }),
      queryClient.invalidateQueries({ queryKey: ["alert-rules", brandId] }),
      queryClient.invalidateQueries({ queryKey: ["alert-events", brandId] }),
      queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "alert-summary"] }),
    ]);
  };

  const createDefaultRules = async () => {
    if (!brandId) return;
    if (!notificationDestination) {
      toast({ title: "Add an alert destination first", variant: "destructive" });
      return;
    }
    setBusyAction("defaults");
    try {
      const result = await api.createDefaultAlertRules(brandId, {
        destination: notificationDestination,
        channel: "email",
      });
      await refreshAlertData();
      toast({
        title: result?.createdCount ? "Launch monitoring defaults created" : "Launch monitoring defaults already exist",
        description: `${result?.createdCount || 0} created, ${result?.existingCount || 0} already covered.`,
      });
    } catch (error: any) {
      toast({ title: "Failed to create alert rules", description: error?.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    if (!brandId) return;
    setBusyAction(rule.id);
    try {
      await api.updateAlertRule(brandId, rule.id, { isActive: !rule.isActive });
      await refreshAlertData();
    } catch (error: any) {
      toast({ title: "Failed to update alert rule", description: error?.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  };

  const deleteRule = async (rule: AlertRule) => {
    if (!brandId) return;
    setBusyAction(rule.id);
    try {
      await api.deleteAlertRule(brandId, rule.id);
      await refreshAlertData();
      toast({ title: "Alert rule removed" });
    } catch (error: any) {
      toast({ title: "Failed to remove alert rule", description: error?.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  };

  const testRules = async () => {
    if (!brandId) return;
    setBusyAction("test");
    try {
      await api.testAlertRules(brandId);
      await refreshAlertData();
      toast({ title: "Alert evaluation queued" });
    } catch (error: any) {
      toast({ title: "Failed to queue alert evaluation", description: error?.message, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  };

  const readinessScore = useMemo(() => {
    const total = numberValue(summary.total);
    const critical = numberValue(summary.critical);
    const warning = numberValue(summary.warning);
    const score = Math.max(0, Math.min(100, Math.round(100 - (critical * 24) - (warning * 12) - (Math.max(total - critical - warning, 0) * 5))));
    return score;
  }, [summary]);
  const launchCoverage = useMemo(() => {
    const requiredMetrics = DEFAULT_RULES.map((rule) => rule.metric);
    const activeMetrics = new Set(rules.filter((rule) => rule.isActive).map((rule) => rule.metric));
    const covered = requiredMetrics.filter((metric) => activeMetrics.has(metric));
    return {
      requiredMetrics,
      covered,
      missing: requiredMetrics.filter((metric) => !activeMetrics.has(metric)),
      score: requiredMetrics.length ? Math.round((covered.length / requiredMetrics.length) * 100) : 0,
    };
  }, [rules]);
  const monitoringIntegrity = useMemo(() => {
    const activeRules = rules.filter((rule) => rule.isActive);
    const configuredDestinations = activeRules.filter((rule) => Boolean(rule.destination || notificationDestination));
    const failedEvents = events.filter((event) => event.deliveryStatus === "failed").length;
    const sentEvents = events.filter((event) => event.deliveryStatus === "sent").length;
    const latestEventAt = events
      .map((event) => event.createdAt ? new Date(event.createdAt).getTime() : 0)
      .filter((time) => Number.isFinite(time) && time > 0)
      .sort((a, b) => b - a)[0] || 0;
    const daysSinceEvent = latestEventAt ? Math.round(((Date.now() - latestEventAt) / 86400000) * 10) / 10 : null;
    const unresolvedCritical = alerts.filter((alert) => alert.severity === "critical").length;
    const rows = [
      {
        area: "Launch rule coverage",
        evidence: `${launchCoverage.covered.length}/${launchCoverage.requiredMetrics.length} required rules active`,
        status: launchCoverage.score === 100 ? "ready" : launchCoverage.score >= 60 ? "partial" : "blocked",
        action: launchCoverage.score === 100 ? "Keep all launch defaults active" : "Add missing launch monitoring defaults",
      },
      {
        area: "Notification destination",
        evidence: `${configuredDestinations.length}/${activeRules.length || 0} active rules have a destination`,
        status: activeRules.length > 0 && configuredDestinations.length === activeRules.length ? "ready" : configuredDestinations.length > 0 ? "partial" : "blocked",
        action: configuredDestinations.length === activeRules.length && activeRules.length > 0 ? "Keep destinations current" : "Add email or webhook destinations to active rules",
      },
      {
        area: "Recent evaluation",
        evidence: latestEventAt ? `Last alert event ${daysSinceEvent} day${daysSinceEvent === 1 ? "" : "s"} ago` : "No alert evaluation event recorded",
        status: latestEventAt && (daysSinceEvent ?? 99) <= 7 ? "ready" : latestEventAt ? "partial" : "blocked",
        action: latestEventAt && (daysSinceEvent ?? 99) <= 7 ? "Keep scheduled evaluations running" : "Test rules or queue alert evaluation",
      },
      {
        area: "Delivery health",
        evidence: `${sentEvents} sent, ${failedEvents} failed deliveries`,
        status: failedEvents === 0 && sentEvents > 0 ? "ready" : failedEvents === 0 ? "partial" : "blocked",
        action: failedEvents === 0 ? "Confirm first delivery before launch" : "Fix failed alert destination or channel",
      },
      {
        area: "Critical alert burden",
        evidence: `${unresolvedCritical} critical active alert${unresolvedCritical === 1 ? "" : "s"}`,
        status: unresolvedCritical === 0 ? "ready" : unresolvedCritical <= 2 ? "partial" : "blocked",
        action: unresolvedCritical === 0 ? "Keep launch watch clean" : "Clear critical alerts before enterprise reporting",
      },
    ];
    const ready = rows.filter((row) => row.status === "ready").length;
    const partial = rows.filter((row) => row.status === "partial").length;
    const score = Math.round(((ready + partial * 0.5) / rows.length) * 100);
    return { rows, ready, partial, blocked: rows.length - ready - partial, score };
  }, [alerts, events, launchCoverage, notificationDestination, rules]);

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Alert Center" />
        <p className="text-muted-foreground">Select a brand to view alert monitoring.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Alert Center" onRefresh={refreshAlertData} isRefreshing={isFetching} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">Monitoring for {brand?.name || "this brand"}</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Production launch signals across AI visibility, competitors, source citations, crawler attribution, and verification debt.
          </p>
        </div>
        <Badge variant="outline" className={cn("w-fit gap-1", alerts.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : severityStyles[(alerts[0]?.severity || "info") as AlertSeverity])}>
          <Bell className="h-4 w-4" />
          {alerts.length === 0 ? "No active alerts" : `${alerts.length} active alerts`}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Monitoring Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{isLoading ? "--" : readinessScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={readinessScore} className="mt-3 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-red-600">{numberValue(summary.critical)}</div>
            <p className="text-xs text-muted-foreground mt-2">requires immediate action</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-amber-600">{numberValue(summary.warning)}</div>
            <p className="text-xs text-muted-foreground mt-2">watch before pilot reporting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Score Movement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {numberValue(summary.scoreDelta) > 0 ? "+" : ""}{numberValue(summary.scoreDelta)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">{numberValue(summary.visibilityScore)}/100 current visibility</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="launch-monitoring-coverage">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Launch Monitoring Coverage
              </CardTitle>
              <CardDescription>Required alert coverage before a brand launch or enterprise pilot.</CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", launchCoverage.score === 100 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
              {launchCoverage.score}/100 covered
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={launchCoverage.score} />
          <div className="grid gap-2 md:grid-cols-3">
            {DEFAULT_RULES.map((rule) => {
              const covered = launchCoverage.covered.includes(rule.metric);
              const Icon = metricIcon(rule.metric);
              return (
                <div key={rule.metric} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  {covered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4 text-amber-600" />}
                  <span className="truncate">{rule.name}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="monitoring-integrity-matrix">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radar className="h-5 w-5 text-primary" />
                Monitoring Integrity Matrix
              </CardTitle>
              <CardDescription>Whether launch alerts are configured, evaluated, deliverable, and clear enough for enterprise reporting.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("w-fit", monitoringIntegrity.score >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : monitoringIntegrity.score >= 50 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700")}>
                {monitoringIntegrity.score}/100 integrity
              </Badge>
              <Badge variant="outline">{monitoringIntegrity.ready} ready</Badge>
              <Badge variant="outline">{monitoringIntegrity.partial} partial</Badge>
              <Badge variant="outline">{monitoringIntegrity.blocked} blocked</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] rounded-md border">
              <div className="grid grid-cols-[1fr_1.1fr_0.55fr_1.1fr] border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div>Integrity gate</div>
                <div>Evidence</div>
                <div>Status</div>
                <div>Next action</div>
              </div>
              {monitoringIntegrity.rows.map((row) => (
                <div key={row.area} className="grid grid-cols-[1fr_1.1fr_0.55fr_1.1fr] border-b px-3 py-3 text-sm last:border-b-0">
                  <div className="pr-3 font-medium">{row.area}</div>
                  <div className="pr-3 text-muted-foreground">{row.evidence}</div>
                  <div className="pr-3">
                    <Badge variant="outline" className={cn(
                      "capitalize",
                      row.status === "ready"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : row.status === "partial"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-red-200 bg-red-50 text-red-700"
                    )}>
                      {row.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">{row.action}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-5 w-5 text-primary" />
                Monitoring Rules
              </CardTitle>
              <CardDescription>Persistent alert rules with delivery channels, cooldowns, and event history.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={testRules} disabled={busyAction === "test" || rules.length === 0}>
                <Play className="mr-2 h-3.5 w-3.5" />
                Test Rules
              </Button>
              <Button size="sm" onClick={createDefaultRules} disabled={busyAction === "defaults"}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Launch Defaults
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="alert-destination">Default alert destination</Label>
              <Input
                id="alert-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="ops@brand.com or Slack/Teams webhook URL"
              />
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <Mail className="mr-2 inline h-4 w-4" />
              {notificationDestination || "Destination required for new defaults"}
            </div>
          </div>

          {rulesLoading ? (
            <div className="h-28 rounded-md border bg-muted/30 animate-pulse" />
          ) : rules.length === 0 ? (
            <div className="rounded-md border p-6 text-center">
              <Bell className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold">No persistent alert rules yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Add defaults to monitor score drops, competitor overtakes, citation depth, crawler anomalies, verification debt, and prompt coverage.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {rules.map((rule) => {
                const Icon = metricIcon(rule.metric);
                return (
                  <div key={rule.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold">{rule.name}</h3>
                          <Badge variant="outline" className={rule.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground"}>
                            {rule.isActive ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {rule.metric} {rule.comparator} {rule.threshold ?? "--"} via {rule.channel}
                          {rule.cooldownMinutes ? `, cooldown ${rule.cooldownMinutes} min` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          Destination: {rule.destination || "Not configured"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={rule.isActive} onCheckedChange={() => toggleRule(rule)} disabled={busyAction === rule.id} />
                        <Button variant="ghost" size="icon" onClick={() => deleteRule(rule)} disabled={busyAction === rule.id}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                          <span className="sr-only">Delete rule</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Active Alerts
          </CardTitle>
          <CardDescription>Each alert is tied to evidence and a launch workflow, not just a passive warning.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-32 rounded-md border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="rounded-md border p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
              <h3 className="font-semibold">No active monitoring alerts</h3>
              <p className="text-sm text-muted-foreground mt-1">Keep scheduled scans and verification checks running before launch.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {alerts.map((alert) => {
                const Icon = metricIcon(alert.metric);
                return (
                  <div key={alert.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold">{alert.title}</h3>
                          <Badge variant="outline" className={cn("capitalize", severityStyles[alert.severity])}>{alert.severity}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{alert.message}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild className="shrink-0">
                        <Link href={alert.route}>
                          Open Workflow
                          <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Current</p>
                        <p className="font-mono font-bold">{alert.value ?? "--"}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Previous / Baseline</p>
                        <p className="font-mono font-bold">{alert.previousValue ?? "--"}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Threshold</p>
                        <p className="font-mono font-bold">{alert.threshold ?? "--"}</p>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md border bg-background p-3 text-sm">
                      <span className="font-medium">Fix path: </span>
                      <span className="text-muted-foreground">{alert.recommendedAction}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Delivery History
          </CardTitle>
          <CardDescription>Triggered alert events and delivery status from the worker pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="h-24 rounded-md border bg-muted/30 animate-pulse" />
          ) : events.length === 0 ? (
            <div className="rounded-md border p-6 text-center">
              <ShieldAlert className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold">No alert deliveries yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Events appear after scheduled or manual alert evaluation triggers a rule.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("capitalize", severityStyles[event.severity || "info"])}>{event.severity || "info"}</Badge>
                        <h3 className="font-semibold">{event.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{event.message || "No event message recorded."}</p>
                    </div>
                    <Badge variant="outline" className={event.deliveryStatus === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : event.deliveryStatus === "failed" ? "border-red-200 bg-red-50 text-red-700" : "text-muted-foreground"}>
                      {event.deliveryStatus}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {event.channel || "channel"} · {event.createdAt ? new Date(event.createdAt).toLocaleString() : "time unavailable"}
                    {event.deliveryError ? ` · ${event.deliveryError}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitive Pressure</CardTitle>
            <CardDescription>Mentions across sampled AI answers.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{numberValue(summary.brandMentions)}:{numberValue(summary.competitorMentions)}</div>
            <p className="text-xs text-muted-foreground mt-2">brand mentions vs competitor mentions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Citation Coverage</CardTitle>
            <CardDescription>Source proof visible to answer engines.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{numberValue(summary.sourceDomains)} / {numberValue(summary.citedUrls)}</div>
            <p className="text-xs text-muted-foreground mt-2">domains / exact URLs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crawler Attribution</CardTitle>
            <CardDescription>AI crawler visits recorded locally.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{numberValue(summary.crawlerVisits)}</div>
            <p className="text-xs text-muted-foreground mt-2">{numberValue(summary.crawlerModels)} crawler identities</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
