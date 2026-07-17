import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Loader2, Brain, Globe, Search, CheckCircle2, AlertCircle,
  TrendingUp, Lightbulb, ExternalLink, RefreshCw, Database,
  BarChart3, Sparkles, ArrowRight,
} from "lucide-react";

interface QuickReportViewProps {
  brand: { id: string | number; name: string; domain?: string } | null | undefined;
}

type AnalysisStep = "wikidata" | "serp" | "llm" | "done";

interface AnalysisData {
  brandName: string;
  domain?: string;
  wikidata: any;
  serp: any;
  llm: any;
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

const STEPS: { key: AnalysisStep; label: string; icon: typeof Brain }[] = [
  { key: "wikidata", label: "Querying Knowledge Graph (Wikidata)…", icon: Database },
  { key: "serp",     label: "Analyzing Search Presence (SerpAPI)…", icon: Search },
  { key: "llm",      label: "Testing AI Recognition (OpenRouter)…", icon: Brain },
  { key: "done",     label: "Calculating GEO Score…",               icon: BarChart3 },
];

function getGradeColor(grade: string) {
  if (grade.startsWith("A")) return "text-emerald-500";
  if (grade.startsWith("B")) return "text-blue-500";
  if (grade.startsWith("C")) return "text-yellow-500";
  return "text-red-500";
}

function getScoreColor(score: number) {
  if (score >= 70) return "hsl(142.1 76.2% 36.3%)";
  if (score >= 50) return "hsl(221.2 83.2% 53.3%)";
  if (score >= 30) return "hsl(47.9 95.8% 53.1%)";
  return "hsl(0 84.2% 60.2%)";
}

function CircularScore({ score, grade }: { score: number; grade: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={radius} fill="none"
            stroke={getScoreColor(score)} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold font-mono">{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <span className={`text-2xl font-bold ${getGradeColor(grade)}`}>{grade}</span>
        <p className="text-xs text-muted-foreground mt-1">GEO Score Grade</p>
      </div>
    </div>
  );
}

function PillarCard({
  icon: Icon, title, score, weight, detail, color,
}: {
  icon: typeof Brain; title: string; score: number; weight: number; detail: string; color: string;
}) {
  return (
    <Card className="border bg-card/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{Math.round(weight * 100)}% weight</p>
          </div>
          <span className="text-2xl font-bold font-mono">{Math.round(score)}</span>
        </div>
        <Progress value={score} className="h-1.5 mb-2" />
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function QuickReportView({ brand }: QuickReportViewProps) {
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    if (!brand?.id) return;
    setLoading(true);
    setError(null);
    setData(null);
    setActiveStep(0);

    // Simulate step progression while the real request runs
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, STEPS.length - 2);
      setActiveStep(stepIdx);
    }, 8000);

    try {
      const res = await fetch(`/api/brands/${brand.id}/quick-analysis`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      clearInterval(stepTimer);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Analysis failed" }));
        throw new Error(err.message || "Analysis failed");
      }

      const result: AnalysisData = await res.json();
      setActiveStep(STEPS.length - 1);
      await new Promise((r) => setTimeout(r, 600)); // brief pause before showing results
      setData(result);
    } catch (e: any) {
      clearInterval(stepTimer);
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id]);

  // ---- LOADING STATE ----
  if (loading) {
    return (
      <div className="min-h-[420px] flex flex-col items-center justify-center gap-8 py-12">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary mb-3">
            <Sparkles className="h-5 w-5 animate-pulse" />
            <span className="font-semibold text-lg">Running GEO Analysis</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            We're analysing <strong>{brand?.name}</strong> across knowledge graphs, search engines
            and AI models while your full pipeline warms up.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-500 ${
                  active ? "border-primary/50 bg-primary/5" : done ? "border-border/40 bg-muted/30 opacity-70" : "border-border/20 opacity-30"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={`text-sm ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {done ? step.label.replace("…", "") : step.label}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">This usually takes 20–40 seconds</p>
      </div>
    );
  }

  // ---- ERROR STATE ----
  if (error) {
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 py-12">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-center space-y-1">
          <p className="font-medium">Analysis failed</p>
          <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={runAnalysis} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { score, wikidata, serp, llm } = data;

  const wikiDetail = wikidata.found
    ? `Entity found (${wikidata.confidence} confidence)${wikidata.wikipedia_url ? " · Wikipedia page exists" : ""}${wikidata.sitelinks ? ` · ${wikidata.sitelinks} wiki sitelinks` : ""}`
    : "No Wikidata / Wikipedia entity found for this brand";

  const serpDetail = serp.brandMentions > 0
    ? `${serp.brandMentions} brand mention${serp.brandMentions > 1 ? "s" : ""}${serp.topRanking ? ` · Ranks #${serp.topRanking}` : ""}${serp.hasKnowledgeGraph ? " · Knowledge Panel present" : ""}`
    : "No brand mentions found in organic search results";

  const llmDetail = llm.brandContext
    ? llm.brandContext.length > 110 ? llm.brandContext.slice(0, 110) + "…" : llm.brandContext
    : `Recognition level: ${llm.recognitionLevel}`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* Header banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Full pipeline analysis in progress</p>
          <p className="text-xs text-muted-foreground">
            Your detailed dashboard will appear once jobs complete. Here's your instant GEO snapshot below.
          </p>
        </div>
      </div>

      {/* Main score + pillars */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* Score card */}
        <Card className="glass-card md:row-span-1 flex flex-col items-center justify-center py-6">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-base">GEO Visibility Score</CardTitle>
            <CardDescription className="text-xs">Wikidata · Search · AI Recognition</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pb-4">
            <CircularScore score={score.totalScore} grade={score.grade} />
            <div className="w-full space-y-1.5">
              {(["wikidata", "serp", "llm"] as const).map((key) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-muted-foreground capitalize shrink-0">
                    {key === "serp" ? "Search" : key === "llm" ? "AI Recall" : "Knowledge"}
                  </span>
                  <Progress value={score.breakdown[key].score} className="h-1 flex-1" />
                  <span className="w-8 text-right font-mono font-medium">{Math.round(score.breakdown[key].score)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pillar cards */}
        <div className="md:col-span-2 space-y-3">
          <PillarCard
            icon={Database}
            title="Knowledge Graph (Wikidata)"
            score={score.breakdown.wikidata.score}
            weight={score.breakdown.wikidata.weight}
            detail={wikiDetail}
            color="bg-violet-500"
          />
          <PillarCard
            icon={Globe}
            title="Search Presence (SerpAPI)"
            score={score.breakdown.serp.score}
            weight={score.breakdown.serp.weight}
            detail={serpDetail}
            color="bg-blue-500"
          />
          <PillarCard
            icon={Brain}
            title="AI Recognition (OpenRouter)"
            score={score.breakdown.llm.score}
            weight={score.breakdown.llm.weight}
            detail={llmDetail}
            color="bg-emerald-600"
          />
        </div>
      </div>

      {/* Insights + Recommendations */}
      <div className="grid md:grid-cols-2 gap-6">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {score.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground leading-snug">{insight}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" /> Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {score.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-muted-foreground leading-snug">{rec}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* LLM key associations + external links */}
      {(llm.keyAssociations?.length > 0 || wikidata.wikipedia_url) && (
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-4">
            {llm.keyAssociations?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">AI Associations:</span>
                {llm.keyAssociations.map((a: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                ))}
              </div>
            )}
            {wikidata.wikipedia_url && (
              <a
                href={wikidata.wikipedia_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Wikipedia <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button variant="ghost" size="sm" onClick={runAnalysis} className="gap-1.5 text-xs h-7 ml-auto">
              <RefreshCw className="h-3 w-3" /> Re-run analysis
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
