// Tier S5 — AI Recommendation Share card
//
// Shows the share of LLM responses that recommend the brand in the top 3,
// broken down by provider and intent. Includes a "share" button that opens
// a public-friendly card image — a virality hook for the brand.

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRecommendationShare } from "@/hooks/use-analytics";
import { useCurrentBrand } from "@/hooks/use-brand";
import { triggerRecommendationShareSimulation } from "@/lib/api";
import { Trophy, Share2, RefreshCw, Sparkles, Crown, X, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";

interface Props {
  brandTier?: string;
}

const PROVIDER_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  openai: { label: "ChatGPT", color: "bg-emerald-500", emoji: "🤖" },
  anthropic: { label: "Claude", color: "bg-orange-500", emoji: "🧠" },
  google: { label: "Gemini", color: "bg-blue-500", emoji: "✨" },
  perplexity: { label: "Perplexity", color: "bg-purple-500", emoji: "🔍" },
  grok: { label: "Grok", color: "bg-slate-500", emoji: "⚡" },
  deepseek: { label: "DeepSeek", color: "bg-cyan-500", emoji: "🌊" },
} as const;

function tierMessage(sharePct: number): { headline: string; sub: string; color: string } {
  if (sharePct >= 60) {
    return {
      headline: "AI loves recommending you",
      sub: `${sharePct}% of LLM responses name you in the top 3. Your entity is well-positioned.`,
      color: "text-emerald-500",
    };
  }
  if (sharePct >= 30) {
    return {
      headline: "You're on the radar",
      sub: `${sharePct}% of LLM responses recommend you. Targeted content could push you into the top tier.`,
      color: "text-amber-500",
    };
  }
  if (sharePct > 0) {
    return {
      headline: "Under-recommended by AI",
      sub: `Only ${sharePct}% of LLM responses name you. Competitors are taking the spot.`,
      color: "text-orange-500",
    };
  }
  return {
    headline: "AI isn't recommending you yet",
    sub: `Run a simulation to see where you stand across ChatGPT, Claude, Gemini, and more.`,
    color: "text-muted-foreground",
  };
}

export function RecommendationShareCard({ brandTier }: Props) {
  const { brandId, brand: currentBrand } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { data, isLoading } = useRecommendationShare(brandId ?? '');
  const [shareOpen, setShareOpen] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const isFree = brandTier === 'free' || !brandTier;
  const sharePct = data?.sharePct ?? 0;
  const totalRuns = data?.totalRuns ?? 0;
  const brandName = currentBrand?.name ?? "Your brand";

  const handleRerun = async () => {
    if (!brandId) return;
    setRerunning(true);
    try {
      await triggerRecommendationShareSimulation(brandId);
      // Poll for fresh data
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['recommendationShare', brandId] });
      }, 4000);
      setTimeout(() => setRerunning(false), 8000);
    } catch (e) {
      setRerunning(false);
    }
  };

  const msg = tierMessage(sharePct);

  return (
    <Card className="glass-card relative overflow-hidden min-w-0" data-testid="card-recommendation-share">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-amber-500" />
              AI Recommendation Share
            </CardTitle>
            <CardDescription className="line-clamp-2">
              How often ChatGPT, Claude, Gemini and others put you in their top 3 picks.
            </CardDescription>
          </div>
          {isFree && (
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-amber-600 border-amber-500/30 bg-amber-500/5">
              <Crown className="h-2.5 w-2.5 mr-0.5" /> Free preview
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-16 bg-muted/40 animate-pulse rounded" />
            <div className="h-20 bg-muted/40 animate-pulse rounded" />
          </div>
        ) : (
          <>
            {/* Hero stat */}
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-4xl sm:text-5xl font-bold tracking-tight" data-testid="metric-share-pct">
                  <span className={msg.color}>{sharePct}%</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  of {totalRuns} LLM responses recommended {brandName}
                </p>
              </div>
              <div className="text-right flex flex-col items-end gap-1.5">
                <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                  <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="gap-1.5" data-testid="btn-share-card">
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Share your AI visibility</DialogTitle>
                      <DialogDescription>
                        Drop this card on LinkedIn, X, or anywhere you want to brag (or commiserate).
                      </DialogDescription>
                    </DialogHeader>
                    <PublicShareCard brandName={brandName} sharePct={sharePct} totalRuns={totalRuns} topProvider={data?.byProvider?.[0]?.provider} />
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-muted-foreground"
                  onClick={handleRerun}
                  disabled={rerunning}
                  data-testid="btn-rerun-sim"
                >
                  {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Re-run
                </Button>
              </div>
            </div>

            {/* Headline message */}
            <div className="rounded-lg bg-muted/30 border p-3 mb-4">
              <p className={cn("text-sm font-medium", msg.color)}>{msg.headline}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{msg.sub}</p>
            </div>

            {/* Per-provider breakdown */}
            {data?.byProvider && data.byProvider.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">By provider</p>
                {data.byProvider.map((p: { provider: string; runs: number; recommended: number; sharePct: number }) => {
                  const meta = PROVIDER_LABELS[p.provider] ?? { label: p.provider, color: "bg-slate-500", emoji: "•" };
                  return (
                    <div key={p.provider} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-base">{meta.emoji}</span>
                      <span className="flex-1 truncate">{meta.label}</span>
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", meta.color)}
                          style={{ width: `${Math.max(2, p.sharePct)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs w-9 text-right">{p.sharePct}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* By intent */}
            {data?.byIntent && data.byIntent.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">By intent</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.byIntent.slice(0, 6).map((i: { intent: string; runs: number; recommended: number; sharePct: number }) => (
                    <TooltipProvider key={i.intent}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono",
                              i.sharePct >= 50 ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-300" :
                              i.sharePct >= 20 ? "border-amber-500/30 text-amber-700 dark:text-amber-300" :
                              "border-red-500/30 text-red-700 dark:text-red-300"
                            )}
                          >
                            {i.intent}: {i.sharePct}%
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{i.recommended} of {i.runs} responses recommend you for {i.intent} queries</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            )}

            {/* Top competitors the LLM keeps recommending instead */}
            {data?.topCompetitors && data.topCompetitors.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  LLMs keep recommending
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.topCompetitors.map((c: { name: string; count: number }) => (
                    <Badge key={c.name} variant="secondary" className="text-[10px]">
                      {c.name}
                      <span className="ml-1 text-muted-foreground font-mono">×{c.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Trend sparkline */}
            {data?.trend && data.trend.some((d: { runs: number }) => d.runs > 0) && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">14-day trend</p>
                <div className="h-12 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="shareGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, 100]} />
                      <RTooltip
                        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                        formatter={(v: number) => [`${v}%`, 'Share']}
                        labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                      />
                      <Area type="monotone" dataKey="sharePct" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#shareGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Empty state nudge */}
            {totalRuns === 0 && (
              <div className="mt-2 text-center">
                <Button variant="outline" size="sm" onClick={handleRerun} disabled={rerunning} className="gap-1.5">
                  {rerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {rerunning ? "Running simulation..." : "Run my first simulation"}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-2">
                  We'll ask 4 LLMs about your tracked prompts and record who they recommend.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PublicShareCard({
  brandName,
  sharePct,
  totalRuns,
  topProvider,
}: {
  brandName: string;
  sharePct: number;
  totalRuns: number;
  topProvider?: string;
}) {
  const meta = topProvider ? (PROVIDER_LABELS[topProvider] ?? { emoji: "🤖", label: topProvider }) : { emoji: "🤖", label: "AI" };
  const headline = sharePct >= 30 ? "AI recommends us." : "We're working on it.";

  return (
    <div
      className="relative rounded-xl p-6 text-white overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}
    >
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-400 font-semibold mb-1">AIRank · AI Recommendation Share</p>
        <h3 className="text-2xl font-bold mb-4">{headline}</h3>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-6xl font-black tracking-tighter">{sharePct}%</span>
          <span className="text-sm text-slate-300">of LLM responses recommend</span>
        </div>
        <p className="text-2xl font-semibold mb-4">{brandName}</p>
        <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-700 pt-3">
          <span className="text-base">{meta.emoji}</span>
          <span>Tested across {totalRuns} responses · {meta.label} included</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-3 font-mono">airank.io/share</p>
      </div>
    </div>
  );
}
