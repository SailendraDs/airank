import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/layout/TopBar";
import { CircularGauge, MiniGauge } from "@/components/geo-report/CircularGauge";
import { PillarCards } from "@/components/geo-report/PillarCards";
import { EntityFactsPanel } from "@/components/geo-report/EntityFactsPanel";
import { LLMAnalysisPanel } from "@/components/geo-report/LLMAnalysisPanel";
import { SummaryPanel } from "@/components/geo-report/SummaryPanel";
import {
  Loader2, Database, Search, Brain, BarChart3, CheckCircle2,
  ArrowRight, RefreshCw, AlertCircle, Sparkles, Code2, Copy, Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  brandName: string;
  domain?: string;
  wikidata: {
    found: boolean;
    entity_id?: string;
    label?: string;
    description?: string;
    confidence?: string;
    sitelinks?: number;
    website?: string;
    wikipedia_url?: string;
  };
  serp: {
    score: number;
    brandMentions: number;
    topRanking: number | null;
    hasKnowledgeGraph: boolean;
    hasAnswerBox: boolean;
    totalResults: number;
    serp_features: Record<string, boolean>;
  };
  llm: {
    score: number;
    recognitionLevel: string;
    keyAssociations: string[];
    brandContext: string;
    confidenceScore: number;
    hallucinationRisk?: string;
    suggestions: string[];
  };
  score: {
    totalScore: number;
    grade: string;
    breakdown: {
      wikidata: { score: number; weight: number; weightedScore: number };
      serp: { score: number; weight: number; weightedScore: number };
      llm: { score: number; weight: number; weightedScore: number };
    };
    insights: string[];
    recommendations: string[];
  };
}

// ─── Loading Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Querying Knowledge Graph (Wikidata)…", icon: Database },
  { label: "Analyzing Search Presence (SerpAPI)…", icon: Search },
  { label: "Testing AI Recognition (OpenRouter)…", icon: Brain },
  { label: "Calculating GEO Score…",               icon: BarChart3 },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function GeoReport() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [scriptStatus, setScriptStatus] = useState<{ verified: boolean; message: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the user's brand
  const { data: brands } = useQuery<any[]>({ queryKey: ["/api/brands"] });
  const currentBrand = brands?.[0];
  const brandId = currentBrand?.id;

  // Poll pipeline status — when done, show CTA
  const { data: pipelineStatus } = useQuery<any>({
    queryKey: ["pipeline-status", brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/pipeline-status`, { credentials: "include" });
      return res.json();
    },
    enabled: !!brandId,
    refetchInterval: 5000,
  });

  const isProcessing = pipelineStatus?.isProcessing ?? true;

  // ── Run analysis ────────────────────────────────────────────────────────────
  const runAnalysis = async (id: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveStep(0);

    // Animate step progress while the real request runs (~25 s)
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, STEPS.length - 2);
      setActiveStep(stepIdx);
    }, 7000);

    try {
      const res = await fetch(`/api/brands/${id}/quick-analysis`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      clearInterval(stepTimer);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Analysis failed" }));
        throw new Error(err.message || "Analysis failed");
      }

      const data: AnalysisResult = await res.json();
      setActiveStep(STEPS.length - 1);
      await new Promise((r) => setTimeout(r, 500));
      setResult(data);
    } catch (e: any) {
      clearInterval(stepTimer);
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (brandId) runAnalysis(String(brandId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <TopBar title="GEO Score Report" />
        <div className="min-h-[420px] flex flex-col items-center justify-center gap-8 py-12">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary mb-3">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span className="font-semibold text-lg">Running GEO Analysis</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Analysing <strong>{currentBrand?.name ?? "your brand"}</strong> across knowledge
              graphs, search engines and AI models.
            </p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const done   = i < activeStep;
              const active = i === activeStep;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500 ${
                    active
                      ? "border-primary/50 bg-primary/5"
                      : done
                      ? "border-border/40 bg-muted/30 opacity-70"
                      : "border-border/20 opacity-30"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={`text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">This usually takes 20–40 seconds</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-6">
        <TopBar title="GEO Score Report" />
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 py-12">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="text-center space-y-1">
            <p className="font-medium">Analysis failed</p>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => brandId && runAnalysis(String(brandId))}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { score, wikidata, serp, llm, brandName, domain } = result;

  // ── Results ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-8">
      <TopBar title="GEO Score Report" />

      {/* Pipeline completion banner */}
      {!isProcessing ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">Full dashboard analysis is ready!</p>
            <p className="text-xs text-emerald-700">Your complete AI visibility data has been processed.</p>
          </div>
          <Button
            size="sm"
            onClick={() => setLocation("/app/dashboard")}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            View Dashboard <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Full pipeline analysis in progress</p>
            <p className="text-xs text-muted-foreground">
              {pipelineStatus?.running > 0 && `${pipelineStatus.running} running`}
              {pipelineStatus?.running > 0 && pipelineStatus?.pending > 0 && ", "}
              {pipelineStatus?.pending > 0 && `${pipelineStatus.pending} queued`}
              {" — "}your complete dashboard will be ready shortly.
            </p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{brandName} Analysis Results</h1>
        {domain && <p className="text-gray-600 text-sm mt-1">{domain}</p>}
      </div>

      {/* Overall Score + Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="text-center">
          <CardHeader>
            <CardTitle>Overall GEO Score</CardTitle>
            <CardDescription>Comprehensive AI search visibility rating</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CircularGauge score={score.totalScore} size={200} />
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <Badge
                  variant={
                    score.totalScore >= 70 ? "default" : score.totalScore >= 40 ? "secondary" : "destructive"
                  }
                >
                  Grade {score.grade}
                </Badge>
              </div>
              <p className="text-sm text-gray-600">
                {score.totalScore >= 80
                  ? "Excellent AI search visibility across all platforms"
                  : score.totalScore >= 60
                  ? "Good AI search visibility with room for improvement"
                  : score.totalScore >= 40
                  ? "Moderate AI search visibility, needs optimization"
                  : "Limited AI search visibility, requires significant improvement"}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
              <CardDescription>Individual pillar performance analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <MiniGauge score={score.breakdown.wikidata.score} label="Knowledge Graph" color="#3b82f6" size={120} />
                <MiniGauge score={score.breakdown.serp.score}     label="Search Presence" color="#10b981" size={120} />
                <MiniGauge score={score.breakdown.llm.score}      label="AI Recall"        color="#8b5cf6" size={120} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Executive Summary */}
      <SummaryPanel
        brand={brandName}
        domain={domain}
        score={score}
        wikidata={wikidata}
        serp={serp}
        llm={llm}
      />

      {/* Pillar Cards */}
      <PillarCards
        wikidataScore={score.breakdown.wikidata.score}
        serpScore={score.breakdown.serp.score}
        llmScore={score.breakdown.llm.score}
        wikidata={wikidata}
        serp={serp}
        llm={llm}
      />

      {/* Key Insights & Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights & Recommendations</CardTitle>
          <CardDescription>Actionable recommendations to improve your GEO score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...score.insights, ...score.recommendations].slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-blue-600">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <EntityFactsPanel wikidata={wikidata} />
        <LLMAnalysisPanel llm={llm} />
      </div>

      {/* Script Installation */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            Boost Your Visibility Score
          </CardTitle>
          <CardDescription>
            Add the AIRank tracking script to your website to earn a <strong>+2 Visibility Score bonus</strong> and enable advanced AI optimization features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs sm:text-sm overflow-x-auto">
            <pre>{`<!-- AIRank AXP Script -->
<script>
  (function(g,e,o,s,c,r){
    g.AIRankConfig={configId:'${currentBrand?.configBrandId || ""}',
      brandId:'${brandId || ""}',
      axpEnabled:true,schemaEnabled:true,faqEnabled:true};
    var js=e.createElement(o);js.async=1;js.src=s;
    e.head.appendChild(js);
  })(window,document,'script','https://cdn.airank.io/embed.js');
</script>`}</pre>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const script = `<!-- AIRank AXP Script -->\n<script>\n  (function(g,e,o,s,c,r){\n    g.AIRankConfig={configId:'${currentBrand?.configBrandId || ""}',\n      brandId:'${brandId || ""}',\n      axpEnabled:true,schemaEnabled:true,faqEnabled:true};\n    var js=e.createElement(o);js.async=1;js.src=s;\n    e.head.appendChild(js);\n  })(window,document,'script','https://cdn.airank.io/embed.js');\n</script>`;
                navigator.clipboard.writeText(script);
                toast({ title: "Copied!", description: "Script copied to clipboard" });
              }}
            >
              <Copy className="h-4 w-4" />
              Copy Script
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={verifying || currentBrand?.scriptInstalled}
              onClick={async () => {
                if (!brandId) return;
                setVerifying(true);
                setScriptStatus(null);
                try {
                  const res = await fetch(`/api/brands/${brandId}/verify-script`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = await res.json();
                  setScriptStatus(data);
                  if (data.verified) {
                    queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
                    toast({ title: "Verified!", description: "Script detected — your Visibility Score will get a +2 bonus." });
                  } else {
                    toast({ title: "Not found", description: data.message, variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Error", description: "Verification failed. Please try again.", variant: "destructive" });
                } finally {
                  setVerifying(false);
                }
              }}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {currentBrand?.scriptInstalled ? "Verified" : "Verify Installation"}
            </Button>
          </div>
          {scriptStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              scriptStatus.verified
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-orange-50 border border-orange-200 text-orange-700"
            }`}>
              {scriptStatus.verified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
              )}
              {scriptStatus.message}
            </div>
          )}
          {currentBrand?.scriptInstalled && !scriptStatus && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              Script verified — +2 Visibility Score bonus is active on your Dashboard.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Re-run + Dashboard CTA */}
      <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => brandId && runAnalysis(String(brandId))}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Re-run Analysis
        </Button>
        {!isProcessing && (
          <Button onClick={() => setLocation("/app/dashboard")} className="gap-2">
            View Full Dashboard <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
