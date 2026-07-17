import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useVisibilityScores, useLatestVisibilityScore } from "@/hooks/use-analytics";
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Eye, HelpCircle, BarChart3, Sparkles, MessageSquare, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartSkeleton, StatCardSkeleton, CardSkeleton } from "@/components/ui/SkeletonLoaders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AIVisibility() {
  const { brandId } = useCurrentBrand();
  const [scoreBreakdownOpen, setScoreBreakdownOpen] = useState(false);
  
  // Fetch real data
  const { data: visibilityHistory, isLoading, error } = useVisibilityScores(brandId ?? '', '90d', 90);
  const { data: latestScore } = useLatestVisibilityScore(brandId ?? '');

  const hasHistory = visibilityHistory && visibilityHistory.length > 0;

  // Transform data for chart
  const chartData = useMemo(() => {
    if (!hasHistory) return [];

    return visibilityHistory.map((item: any) => ({
      date: new Date(item.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: item.overallScore,
    }));
  }, [visibilityHistory, hasHistory]);

  // Model breakdown from latest score — stored as array [{ model, mentions }]
  const modelBreakdown = useMemo(() => {
    if (!latestScore?.modelBreakdown) return [];
    const raw = latestScore.modelBreakdown as any;
    const items: { model: string; mentions: number }[] = Array.isArray(raw) ? raw : Object.entries(raw).map(([model, v]: [string, any]) => ({ model, mentions: v?.mentions ?? 0 }));
    return items.map(item => ({
      name: item.model.charAt(0).toUpperCase() + item.model.slice(1),
      score: 0,
      trend: 0,
      mentions: item.mentions || 0,
    }));
  }, [latestScore]);

  // Score breakdown computation (matches server algorithm)
  const scoreBreakdown = useMemo(() => {
    const totalPromptsForCalc = (latestScore as any)?.totalPrompts || 0;
    const mentionedPromptsForCalc = (latestScore as any)?.mentionedPrompts || 0;
    const avgPositionForCalc = (latestScore as any)?.avgPosition || 0;
    const sentimentScoreForCalc = (latestScore as any)?.sentimentScore || 50;
    const citationScoreForCalc = (latestScore as any)?.citationScore || 0;
    const wikidataBonus = (latestScore as any)?.wikidataBonus || 0;
    const kgBonus = (latestScore as any)?.kgBonus || 0;

    const mentionRate = totalPromptsForCalc > 0
      ? Math.round((mentionedPromptsForCalc / totalPromptsForCalc) * 1000) / 10
      : 0;

    const positionScores = avgPositionForCalc > 0
      ? avgPositionForCalc <= 1 ? 100
        : avgPositionForCalc <= 3 ? 70
        : avgPositionForCalc <= 5 ? 40
        : 10
      : 0;

    const weightedBase =
      mentionRate * 0.40 +
      positionScores * 0.30 +
      sentimentScoreForCalc * 0.20 +
      citationScoreForCalc * 0.10;

    const scaledBase = Math.round(weightedBase * 0.85 * 10) / 10;

    return {
      mentionRate,
      mentionedPrompts: mentionedPromptsForCalc,
      totalPrompts: totalPromptsForCalc,
      mentionContrib: Math.round(mentionRate * 0.40 * 10) / 10,
      positionScore: positionScores,
      positionContrib: Math.round(positionScores * 0.30 * 10) / 10,
      sentimentScore: sentimentScoreForCalc,
      sentimentContrib: Math.round(sentimentScoreForCalc * 0.20 * 10) / 10,
      citationScore: citationScoreForCalc,
      citationContrib: Math.round(citationScoreForCalc * 0.10 * 10) / 10,
      weightedBase,
      scaledBase,
      wikidataBonus,
      kgBonus,
    };
  }, [latestScore]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">AI Visibility Intelligence</h1>
            <p className="text-muted-foreground mt-1">
              Deep dive into how Large Language Models perceive and cite your brand.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <ChartSkeleton height="h-80" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton rows={5} />
          <CardSkeleton rows={5} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-muted-foreground">Failed to load visibility data. Please try again.</p>
        </div>
      </div>
    );
  }

  // Empty state — no data yet
  if (!hasHistory && !latestScore) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">AI Visibility Intelligence</h1>
          <p className="text-muted-foreground mt-1">Deep dive into how Large Language Models perceive and cite your brand.</p>
        </div>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center space-y-3">
            <Eye className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No visibility data yet. Your first analysis will appear here.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">AI Visibility Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Deep dive into how Large Language Models perceive and cite your brand.
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline">Export CSV</Button>
            <Button>Schedule Report</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Overall Visibility Score
              </CardTitle>
              <button
                onClick={() => setScoreBreakdownOpen(true)}
                className="text-muted-foreground hover:text-primary transition-colors cursor-help"
                title="How is this score calculated?"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </div>
            <CardDescription>Current AI visibility across all models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold font-mono">{latestScore?.overallScore || 0}</span>
              <span className="text-muted-foreground">/100</span>
              {latestScore?.trend && (
                <Badge variant={latestScore.trend > 0 ? "default" : "secondary"} className="ml-2">
                  {latestScore.trend > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(latestScore.trend).toFixed(1)}%
                </Badge>
              )}
            </div>

            {/* Score Label */}
            {(latestScore as any)?.scoreLabel && (
              <div className="mt-3">
                <Badge variant="outline" className="text-xs">
                  {(latestScore as any).scoreLabel}
                </Badge>
              </div>
            )}

            {/* Why This Matters */}
            <div className="mt-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-2">Why This Score Matters</p>
              <p className="text-xs text-muted-foreground">
                {((latestScore as any)?.overallScore || 0) >= 60
                  ? "Excellent! You're in the top tier of AI visibility."
                  : ((latestScore as any)?.overallScore || 0) >= 40
                  ? "Good foundation. Focus on increasing mentions and citations."
                  : "Room to grow. Add more prompts and build citations to improve."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Model Performance</CardTitle>
            <CardDescription>Visibility breakdown by AI model</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {modelBreakdown.length > 0 ? (
              modelBreakdown.map((model) => (
                <div key={model.name} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span>{model.name}</span>
                      <span className="font-mono font-medium">{model.score}</span>
                    </div>
                    <Progress value={model.score} className="h-2" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {model.trend > 0 ? '+' : ''}{model.trend.toFixed(1)}%
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No model data available</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Share of Model Attention</CardTitle>
          <CardDescription>Visibility scores across major LLMs over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}%`} 
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: "8px", 
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorVis)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown Dialog */}
      <Dialog open={scoreBreakdownOpen} onOpenChange={setScoreBreakdownOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              How Your Score is Calculated
            </DialogTitle>
            <DialogDescription>
              Your visibility score is based on four weighted components plus entity bonuses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Mention Rate</span>
                  <span className="text-xs text-muted-foreground">
                    {scoreBreakdown.mentionedPrompts} of {scoreBreakdown.totalPrompts} prompts
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{scoreBreakdown.mentionRate}%</span>
                  <span className="text-xs text-muted-foreground ml-1">× 0.40 = </span>
                  <span className="font-mono text-emerald-600">{scoreBreakdown.mentionContrib}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-b">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Position Score</span>
                  <span className="text-xs text-muted-foreground">
                    {((latestScore as any)?.avgPosition) ? `Avg position: ${(latestScore as any).avgPosition}` : 'Average ranking in AI responses'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{scoreBreakdown.positionScore}%</span>
                  <span className="text-xs text-muted-foreground ml-1">× 0.30 = </span>
                  <span className="font-mono text-emerald-600">{scoreBreakdown.positionContrib}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-b">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Sentiment</span>
                  <span className="text-xs text-muted-foreground">
                    {scoreBreakdown.sentimentScore >= 70 ? 'Positive' : scoreBreakdown.sentimentScore >= 40 ? 'Neutral' : 'Negative'} portrayal
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{scoreBreakdown.sentimentScore}%</span>
                  <span className="text-xs text-muted-foreground ml-1">× 0.20 = </span>
                  <span className="font-mono text-emerald-600">{scoreBreakdown.sentimentContrib}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-b">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Citations</span>
                  <span className="text-xs text-muted-foreground">Source quality from mentions</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{scoreBreakdown.citationScore}%</span>
                  <span className="text-xs text-muted-foreground ml-1">× 0.10 = </span>
                  <span className="font-mono text-emerald-600">{scoreBreakdown.citationContrib}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Weighted Base</span>
                <span className="font-mono">{scoreBreakdown.weightedBase.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Scale (×0.85)</span>
                <span className="font-mono">{scoreBreakdown.scaledBase}</span>
              </div>
              {scoreBreakdown.wikidataBonus > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Wikidata Bonus</span>
                  <span className="font-mono">+{scoreBreakdown.wikidataBonus}</span>
                </div>
              )}
              {scoreBreakdown.kgBonus > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Knowledge Graph Bonus</span>
                  <span className="font-mono">+{scoreBreakdown.kgBonus}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t font-medium">
                <span>Final Score</span>
                <span className="font-mono text-lg">{latestScore?.overallScore || 0}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Scores are capped at 85 (before script impact) to ensure fair comparison across all brands.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Path to Higher Score */}
      {((latestScore as any)?.overallScore || 0) < 60 && (
        <Card className="glass-card border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              Your Path to 60+
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Brands with 60+ visibility get 3x more mentions in AI responses and higher brand recall.
            </p>
            <div className="space-y-2">
              {scoreBreakdown.mentionRate < 50 && (
                <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Add more prompts</p>
                    <p className="text-xs text-muted-foreground">
                      You're at {scoreBreakdown.mentionRate}% mention rate. Target 60%+ by adding more relevant topics.
                    </p>
                  </div>
                </div>
              )}
              {scoreBreakdown.positionScore < 50 && (
                <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                  <Globe className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Improve rankings</p>
                    <p className="text-xs text-muted-foreground">
                      Position score of {scoreBreakdown.positionScore}% shows room to grow. Focus on top 3 rankings.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Build citations</p>
                  <p className="text-xs text-muted-foreground">
                    {scoreBreakdown.citationScore < 30
                      ? "Citation score is low. Build relationships with AI-preferenced sources."
                      : "Good citation foundation. Continue building authoritative references."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
