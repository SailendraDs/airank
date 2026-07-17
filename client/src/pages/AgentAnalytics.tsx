import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Clipboard,
  Code2,
  DollarSign,
  Eye,
  Gauge,
  Globe,
  KeyRound,
  Link as LinkIcon,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

type CrawlerAnalytics = {
  totalVisits?: number;
  verifiedVisits?: number;
  byCrawler?: Record<string, number>;
  byBot?: Record<string, number>;
  topPages?: Array<{ url: string; count: number }>;
  lastVisit?: string | null;
};

type AttributionReport = {
  totalReferrals?: number;
  totalConversions?: number;
  attributedRevenue?: number;
  dataComplete?: boolean;
  message?: string;
  topSources?: Array<{ source: string; referrals: number; conversions: number }>;
  crawlerBreakdown?: Record<string, { referrals: number; conversions: number }>;
};

type AgentBenchmark = {
  benchmarkScore?: number;
  status?: string;
  crawler?: { score?: number; visits?: number; verifiedVisits?: number; activeBots?: number };
  citations?: {
    score?: number;
    domains?: number;
    citedUrls?: number;
    totalCitations?: number;
    ownedCitationShare?: number;
    thirdPartySources?: number;
    averageAuthority?: number;
  };
  shareOfVoice?: {
    score?: number;
    brandMentions?: number;
    competitorMentions?: number;
    brandShare?: number;
    competitorShare?: number;
    topCompetitor?: { name?: string; mentions?: number; share?: number } | null;
    competitors?: Array<{ name: string; mentions: number; share: number }>;
  };
  attribution?: { ready?: boolean; conversions?: number; revenue?: number; message?: string | null };
  actions?: Array<{ priority: "high" | "medium" | "low"; title: string; detail: string; route: string }>;
};

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  other: "Other AI",
};

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

export default function AgentAnalytics() {
  const { brandId, brand } = useCurrentBrand();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [periodDays, setPeriodDays] = useState(30);
  const [tokenResult, setTokenResult] = useState<{ token: string; ingestUrl: string; pixelUrl: string } | null>(null);
  const [testHitResult, setTestHitResult] = useState<any>(null);
  const [manualEvidence, setManualEvidence] = useState({
    aiReferralSessions: "",
    aiReferralConversions: "",
    aiAttributedRevenue: "",
    brandedImpressions: "",
    brandedClicks: "",
    landingPage: "",
    sourceEngine: "chatgpt",
    proofUrl: "",
    notes: "",
  });

  const enabled = Boolean(brandId);
  const { data: analytics, isFetching: analyticsFetching } = useQuery<CrawlerAnalytics>({
    queryKey: ["agent-analytics", brandId, periodDays],
    queryFn: () => api.getCrawlerAnalytics(brandId || "", periodDays),
    enabled,
  });
  const { data: attribution, isFetching: attributionFetching } = useQuery<AttributionReport>({
    queryKey: ["agent-attribution", brandId, periodDays],
    queryFn: () => api.getAttributionReport(brandId || "", periodDays),
    enabled,
  });
  const { data: benchmark, isFetching: benchmarkFetching } = useQuery<AgentBenchmark>({
    queryKey: ["agent-benchmark", brandId, periodDays],
    queryFn: () => api.getAgentBenchmark(brandId || "", periodDays),
    enabled,
  });

  const rotateTokenMutation = useMutation({
    mutationFn: () => api.rotateCrawlerToken(brandId || ""),
    onSuccess: (result: any) => {
      const origin = window.location.origin;
      const ingestUrl = result.ingestUrl?.startsWith("http")
        ? result.ingestUrl
        : `${origin}${result.ingestUrl || `/api/ingest/crawler/${result.token}`}`;
      const pixelUrl = result.pixelUrl?.startsWith("http")
        ? result.pixelUrl
        : `${origin}${result.pixelUrl || `/api/ingest/crawler/${result.token}/pixel.gif`}`;
      setTokenResult({ token: result.token, ingestUrl, pixelUrl });
      toast({ title: "Crawler ingest token generated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to generate token", description: error?.message, variant: "destructive" });
    },
  });

  const testHitMutation = useMutation({
    mutationFn: () => api.createCrawlerTestHit(brandId || ""),
    onSuccess: async (result: any) => {
      setTestHitResult(result);
      await refresh();
      toast({ title: "Agent Analytics test hit recorded", description: result?.message });
    },
    onError: (error: any) => {
      toast({ title: "Failed to record test hit", description: error?.message, variant: "destructive" });
    },
  });

  const manualAttributionMutation = useMutation({
    mutationFn: () => api.createManualAttributionEvidence(brandId || "", {
      aiReferralSessions: numberValue(manualEvidence.aiReferralSessions),
      aiReferralConversions: numberValue(manualEvidence.aiReferralConversions),
      aiAttributedRevenue: numberValue(manualEvidence.aiAttributedRevenue),
      brandedImpressions: numberValue(manualEvidence.brandedImpressions),
      brandedClicks: numberValue(manualEvidence.brandedClicks),
      landingPage: manualEvidence.landingPage || "/",
      sourceEngine: manualEvidence.sourceEngine || "manual",
      proofUrl: manualEvidence.proofUrl || undefined,
      notes: manualEvidence.notes || undefined,
      periodDays,
    }),
    onSuccess: async (result: any) => {
      await refresh();
      toast({ title: "Attribution evidence recorded", description: result?.message });
    },
    onError: (error: any) => {
      toast({ title: "Attribution evidence failed", description: error?.message, variant: "destructive" });
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agent-analytics", brandId, periodDays] }),
      queryClient.invalidateQueries({ queryKey: ["agent-attribution", brandId, periodDays] }),
      queryClient.invalidateQueries({ queryKey: ["agent-benchmark", brandId, periodDays] }),
      queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "crawler-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["alert-summary", brandId] }),
    ]);
  };

  const summary = useMemo(() => {
    const totalVisits = numberValue(analytics?.totalVisits);
    const verifiedVisits = numberValue(analytics?.verifiedVisits);
    const totalReferrals = numberValue(attribution?.totalReferrals);
    const totalConversions = numberValue(attribution?.totalConversions);
    const revenue = numberValue(attribution?.attributedRevenue);
    const activeBots = Object.values(analytics?.byBot || {}).filter((count) => numberValue(count) > 0).length;
    const dataCompleteness = Math.round((
      (totalVisits > 0 ? 30 : 0) +
      (verifiedVisits > 0 ? 20 : 0) +
      (totalReferrals > 0 ? 20 : 0) +
      (attribution?.dataComplete ? 30 : 0)
    ));

    return { totalVisits, verifiedVisits, totalReferrals, totalConversions, revenue, activeBots, dataCompleteness };
  }, [analytics, attribution]);

  const botRows = Object.entries(analytics?.byBot || {})
    .map(([name, count]) => ({ name, count: numberValue(count) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const engineRows = Object.entries(analytics?.byCrawler || {})
    .map(([engine, count]) => ({ engine, count: numberValue(count) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const topPages = analytics?.topPages || [];
  const isFetching = analyticsFetching || attributionFetching || benchmarkFetching;

  const installSnippet = tokenResult ? `<script>
(function () {
  var endpoint = "${tokenResult.ingestUrl}";
  var pixel = "${tokenResult.pixelUrl}";
  var hit = {
    path: location.pathname,
    url: location.href,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    visitedAt: new Date().toISOString()
  };
  new Image().src = pixel + "?p=" + encodeURIComponent(location.pathname) + "&u=" + encodeURIComponent(location.href) + "&r=" + encodeURIComponent(document.referrer || "") + "&t=" + encodeURIComponent(hit.visitedAt);
  if (/GPTBot|ChatGPT|Claude|Perplexity|Google-Extended|GoogleOther|OAI-SearchBot|DeepSeek|CCBot|Amazonbot|Applebot|Bytespider|meta-externalagent/i.test(hit.userAgent)) {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hits: [hit] }),
      keepalive: true
    }).catch(function () {});
  }
})();
</script>
<noscript><img src="${tokenResult.pixelUrl}?p=noscript" alt="" width="1" height="1" style="display:none" /></noscript>` : "";

  const copySnippet = async () => {
    if (!installSnippet) return;
    await navigator.clipboard.writeText(installSnippet);
    toast({ title: "Install snippet copied" });
  };
  const updateManualEvidence = (key: keyof typeof manualEvidence, value: string) => {
    setManualEvidence((current) => ({ ...current, [key]: value }));
  };

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Agent Analytics" />
        <p className="text-muted-foreground">Select a brand to view agent analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Agent Analytics" onRefresh={refresh} isRefreshing={isFetching} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">AI Crawler & Attribution Intelligence</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            See which AI agents visit {brand?.name || "this brand"}, what pages they inspect, and whether crawler exposure connects to AI referrals, conversions, and revenue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              variant={periodDays === days ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodDays(days)}
              data-testid={`agent-analytics-period-${days}`}
            >
              {days}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              AI Crawler Visits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.totalVisits}</div>
            <p className="text-xs text-muted-foreground">{summary.activeBots} active bots</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Verified Visits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.verifiedVisits}</div>
            <p className="text-xs text-muted-foreground">{pct(summary.verifiedVisits, summary.totalVisits)}% verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              AI Conversions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{summary.totalConversions}</div>
            <p className="text-xs text-muted-foreground">{summary.totalReferrals} referrals attributed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              AI Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">${summary.revenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">from connected analytics</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="agent-analytics-readiness">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Agent Analytics Readiness
              </CardTitle>
              <CardDescription>
                Enterprise-grade attribution requires crawler ingestion, verified bot signatures, and GA4/GSC conversion data.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn(
              "w-fit",
              summary.dataCompleteness >= 75 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
            )}>
              {summary.dataCompleteness >= 75 ? "Ready" : "Setup required"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>Data completeness</span>
              <span className="font-mono">{summary.dataCompleteness}/100</span>
            </div>
            <Progress value={summary.dataCompleteness} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Crawler logs", done: summary.totalVisits > 0 },
              { label: "Verified bots", done: summary.verifiedVisits > 0 },
              { label: "AI referrals", done: summary.totalReferrals > 0 },
              { label: "GA4 conversions", done: Boolean(attribution?.dataComplete) },
            ].map((gate) => (
              <div key={gate.label} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                {gate.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <RefreshCw className="h-4 w-4 text-amber-600" />}
                <span>{gate.label}</span>
              </div>
            ))}
          </div>
          {attribution?.message && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {attribution.message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="manual-attribution-evidence">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Attribution Evidence Snapshot
              </CardTitle>
              <CardDescription>
                Record verified GA4, GSC, Shopify, Amazon, or CRM proof while automated credentials are being connected.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", attribution?.dataComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
              {attribution?.dataComplete ? "Evidence active" : "Needs proof"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <Input
              inputMode="numeric"
              placeholder="AI referrals"
              value={manualEvidence.aiReferralSessions}
              onChange={(event) => updateManualEvidence("aiReferralSessions", event.target.value)}
              data-testid="input-manual-ai-referrals"
            />
            <Input
              inputMode="numeric"
              placeholder="Conversions"
              value={manualEvidence.aiReferralConversions}
              onChange={(event) => updateManualEvidence("aiReferralConversions", event.target.value)}
              data-testid="input-manual-ai-conversions"
            />
            <Input
              inputMode="decimal"
              placeholder="Revenue"
              value={manualEvidence.aiAttributedRevenue}
              onChange={(event) => updateManualEvidence("aiAttributedRevenue", event.target.value)}
              data-testid="input-manual-ai-revenue"
            />
            <Input
              inputMode="numeric"
              placeholder="Brand impressions"
              value={manualEvidence.brandedImpressions}
              onChange={(event) => updateManualEvidence("brandedImpressions", event.target.value)}
              data-testid="input-manual-branded-impressions"
            />
            <Input
              inputMode="numeric"
              placeholder="Brand clicks"
              value={manualEvidence.brandedClicks}
              onChange={(event) => updateManualEvidence("brandedClicks", event.target.value)}
              data-testid="input-manual-branded-clicks"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <Input
              placeholder="Landing page or source URL"
              value={manualEvidence.landingPage}
              onChange={(event) => updateManualEvidence("landingPage", event.target.value)}
              data-testid="input-manual-landing-page"
            />
            <Input
              placeholder="Source engine"
              value={manualEvidence.sourceEngine}
              onChange={(event) => updateManualEvidence("sourceEngine", event.target.value)}
              data-testid="input-manual-source-engine"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Proof URL, report link, or screenshot reference"
              value={manualEvidence.proofUrl}
              onChange={(event) => updateManualEvidence("proofUrl", event.target.value)}
              data-testid="input-manual-proof-url"
            />
            <Textarea
              placeholder="Evidence notes"
              value={manualEvidence.notes}
              onChange={(event) => updateManualEvidence("notes", event.target.value)}
              data-testid="textarea-manual-attribution-notes"
            />
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              This creates an explicit manual evidence snapshot for the selected {periodDays}d period and keeps the audit honest until GA4 automation is live.
            </p>
            <Button
              onClick={() => manualAttributionMutation.mutate()}
              disabled={manualAttributionMutation.isPending || !brandId}
              data-testid="button-save-manual-attribution-evidence"
            >
              {manualAttributionMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save evidence
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="agent-benchmark">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Agent Benchmarking
              </CardTitle>
              <CardDescription>
                Benchmark crawler visibility, cited-source footprint, and AI mention share against the competitor set.
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold font-mono">
                {numberValue(benchmark?.benchmarkScore)}
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
              <Badge variant="outline" className="mt-1 capitalize">
                {(benchmark?.status || "setup_required").replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Crawler Benchmark",
                score: numberValue(benchmark?.crawler?.score),
                detail: `${numberValue(benchmark?.crawler?.visits)} visits, ${numberValue(benchmark?.crawler?.activeBots)} active bots`,
              },
              {
                label: "Citation Benchmark",
                score: numberValue(benchmark?.citations?.score),
                detail: `${numberValue(benchmark?.citations?.domains)} domains, ${numberValue(benchmark?.citations?.citedUrls)} cited URLs`,
              },
              {
                label: "Mention Share",
                score: numberValue(benchmark?.shareOfVoice?.score),
                detail: `${numberValue(benchmark?.shareOfVoice?.brandShare)}% brand vs ${numberValue(benchmark?.shareOfVoice?.competitorShare)}% competitors`,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-md border p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="font-mono">{item.score}/100</span>
                </div>
                <Progress value={item.score} />
                <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Competitive Mention Leaders</p>
                  <p className="text-xs text-muted-foreground">Who AI answers mention most in the tracked answer set.</p>
                </div>
                {benchmark?.shareOfVoice?.topCompetitor?.name && (
                  <Badge variant="secondary">{benchmark.shareOfVoice.topCompetitor.name}</Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
                  <span>{brand?.name || "Your brand"}</span>
                  <span className="font-mono">{numberValue(benchmark?.shareOfVoice?.brandMentions)} mentions</span>
                </div>
                {(benchmark?.shareOfVoice?.competitors || []).slice(0, 5).map((competitor) => (
                  <div key={competitor.name} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span className="truncate">{competitor.name}</span>
                    <span className="font-mono">{competitor.mentions} mentions</span>
                  </div>
                ))}
                {(benchmark?.shareOfVoice?.competitors || []).length === 0 && (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Add or scan competitors to unlock peer benchmarking.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border p-4">
              <p className="text-sm font-semibold">Benchmark Actions</p>
              <p className="mb-3 text-xs text-muted-foreground">Highest-impact moves to improve crawler, citation, and competitor parity.</p>
              <div className="space-y-2">
                {(benchmark?.actions || []).slice(0, 5).map((action) => (
                  <div key={action.title} className="rounded-md border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{action.title}</span>
                      <Badge variant={action.priority === "high" ? "destructive" : "outline"} className="capitalize">
                        {action.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{action.detail}</p>
                  </div>
                ))}
                {(benchmark?.actions || []).length === 0 && (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No benchmark blockers detected in the current sample.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Bot & Engine Breakdown
            </CardTitle>
            <CardDescription>Which AI crawlers are inspecting the site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {engineRows.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No AI crawler visits recorded yet.
              </div>
            ) : (
              engineRows.map((row) => (
                <div key={row.engine} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{ENGINE_LABELS[row.engine] || row.engine}</span>
                    <span className="font-mono">{row.count}</span>
                  </div>
                  <Progress value={pct(row.count, summary.totalVisits)} />
                </div>
              ))
            )}
            {botRows.length > 0 && (
              <div className="grid gap-2 pt-2 md:grid-cols-2">
                {botRows.slice(0, 8).map((row) => (
                  <div key={row.name} className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
                    <span className="truncate">{row.name}</span>
                    <Badge variant="secondary">{row.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Pages AI Agents Read
            </CardTitle>
            <CardDescription>Pages most inspected by AI crawlers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPages.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Install crawler tracking to see visited pages.
              </div>
            ) : topPages.slice(0, 8).map((page) => (
              <div key={page.url} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{page.url}</span>
                <Badge variant="outline">{page.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="agent-analytics-install">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                Install Crawler Ingestion
              </CardTitle>
              <CardDescription>
                Generate an ingest endpoint and add the snippet to the site header, GTM, or Shopify/WordPress theme.
              </CardDescription>
            </div>
            <Button
              onClick={() => rotateTokenMutation.mutate()}
              disabled={rotateTokenMutation.isPending}
              data-testid="button-generate-crawler-token"
            >
              {rotateTokenMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Generate token
            </Button>
            <Button
              variant="outline"
              onClick={() => testHitMutation.mutate()}
              disabled={testHitMutation.isPending}
              data-testid="button-send-crawler-test-hit"
            >
              {testHitMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              Send test hit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              "Add snippet to site header",
              "Verify crawler hits after next AI crawl",
              "Connect GA4/GSC for conversion attribution",
            ].map((step, index) => (
              <div key={step} className="rounded-md border p-3 text-sm">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Step {index + 1}</div>
                {step}
              </div>
            ))}
          </div>
          {tokenResult ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <div className="mb-1 font-medium">Ingest endpoint</div>
                <code className="break-all">{tokenResult.ingestUrl}</code>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <div className="mb-1 font-medium">Tracking pixel</div>
                <code className="break-all">{tokenResult.pixelUrl}</code>
              </div>
              <div className="relative">
                <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
                  <code>{installSnippet}</code>
                </pre>
                <Button className="absolute right-3 top-3" size="sm" variant="secondary" onClick={copySnippet}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Generate a token when you are ready to install tracking. Rotating the token invalidates any previously copied ingest endpoint.
            </div>
          )}
          {testHitResult ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" data-testid="crawler-test-hit-result">
              <div className="font-medium">Install verification hit recorded</div>
              <p className="mt-1">
                {testHitResult.testHit?.botName || "AI bot"} on {testHitResult.testHit?.path || "/__airank-agent-test"}.
                Total crawler visits now {numberValue(testHitResult.stats?.totalVisits)}.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Attribution Sources
          </CardTitle>
          <CardDescription>AI referrals and conversions by landing page or source.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(attribution?.topSources || []).length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No attribution sources yet. Install crawler ingestion and connect analytics to populate this table.
            </div>
          ) : (
            (attribution?.topSources || []).map((source) => (
              <div key={source.source} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[1fr_auto_auto] md:items-center">
                <span className="truncate">{source.source}</span>
                <span className="font-mono">{source.referrals} refs</span>
                <span className="font-mono">{source.conversions} conv</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
