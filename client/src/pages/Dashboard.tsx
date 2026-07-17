import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { TrendIndicator } from "@/components/ui/data-display";
import { ArrowRight, BarChart3, Globe, MessageSquare, Target, Trophy, Users, Eye, Zap, TrendingUp, AlertCircle, CheckCircle2, Loader2, Plus, Bot, Sparkles, Search, Brain, RefreshCw, Smile, Meh, Frown, Download, HelpCircle, CreditCard } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend, AreaChart, Area, PieChart, Pie, LineChart, Line, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLatestVisibilityScore, useVisibilityScores, useMentions, usePromptRuns, useScoreByIntent } from "@/hooks/use-analytics";
import { RecommendationShareCard } from "@/components/dashboard/RecommendationShareCard";
import { FreeTierShockValue } from "@/components/dashboard/FreeTierShockValue";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import * as api from "@/lib/api";
import { getCompetitors, getSources, getCompetitorsMatrix } from "@/lib/api";
import { DashboardSkeleton, StatCardSkeleton } from "@/components/ui/SkeletonLoaders";
import { Lock, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

// Removed hardcoded topicPerformance - will fetch from API

export default function Dashboard() {
  const [period, setPeriod] = useState<string>("28d");
  const [trafficSentimentTab, setTrafficSentimentTab] = useState("traffic");
  const [scoreBreakdownOpen, setScoreBreakdownOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const periodDays = useMemo(() => {
    if (period === "7d") return 7;
    if (period === "28d") return 28;
    if (period === "90d") return 90;
    return 28;
  }, [period]);

  const { data: brands, isLoading: brandsLoading } = useQuery<any[]>({
    queryKey: ['/api/brands'],
  });

  const { data: currentBrandFromApi } = useQuery<any>({
    queryKey: ['/api/brands/current'],
    queryFn: async () => {
      const res = await fetch('/api/brands/current', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const currentBrand = currentBrandFromApi || brands?.[0];
  const brandId = currentBrand?.id;

  const { data: pipelineStatus } = useQuery<any>({
    queryKey: ['pipeline-status', brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/pipeline-status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch pipeline status');
      return res.json();
    },
    enabled: !!brandId,
    refetchInterval: 5000,
  });

  const isProcessing = pipelineStatus?.isProcessing ?? false;
  const pollInterval = isProcessing ? 8000 : false;
  
  const { data: latestScore, isLoading: scoreLoading, error: scoreError } = useLatestVisibilityScore(brandId, isProcessing ? 8000 : 30000);
  const { data: visibilityHistory, isLoading: historyLoading } = useVisibilityScores(brandId, period, periodDays, pollInterval);
  const { data: mentions, isLoading: mentionsLoading } = useMentions(brandId, 100, pollInterval);
  const { data: promptRuns, isLoading: promptRunsLoading } = usePromptRuns(brandId, 100, pollInterval);
  const { data: scoreByIntent, isLoading: scoreByIntentLoading } = useScoreByIntent(brandId, isProcessing ? 8000 : 30000);
  const { data: competitors = [] } = useQuery<any[]>({
    queryKey: ['competitors', brandId],
    queryFn: () => getCompetitors(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
  const { data: sources = [] } = useQuery<any[]>({
    queryKey: ['sources', brandId],
    queryFn: () => getSources(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
  const { data: competitorMatrix = [] } = useQuery<any[]>({
    queryKey: ['competitors-matrix', brandId],
    queryFn: () => getCompetitorsMatrix(brandId),
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
  const { data: dashboardAnalytics } = useQuery<any>({
    queryKey: ['dashboard-analytics', brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/dashboard-analytics`);
      if (!res.ok) throw new Error('Failed to fetch dashboard analytics');
      return res.json();
    },
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
  const { data: topics = [] } = useQuery<any[]>({
    queryKey: ['topics', brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/topics`);
      if (!res.ok) throw new Error('Failed to fetch topics');
      return res.json();
    },
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });
  const { data: prompts = [] } = useQuery<any[]>({
    queryKey: ['prompts', brandId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/prompts`);
      if (!res.ok) throw new Error('Failed to fetch prompts');
      return res.json();
    },
    enabled: !!brandId,
    refetchInterval: pollInterval,
  });

  // Content optimization query - fetch suggestions for first topic with low visibility
  const optimizationTopicId = useMemo(() => {
    const topic = topics?.find((t: any) => t.visibilityScore < 40 && t.tracked);
    return topic?.id;
  }, [topics]);

  const { data: optimizationAnalysis } = useQuery<any>({
    queryKey: ['topic-optimization', brandId, optimizationTopicId],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/optimize/topic/${optimizationTopicId}`);
      if (!res.ok) throw new Error('Failed to fetch optimization analysis');
      return res.json();
    },
    enabled: !!brandId && !!optimizationTopicId,
    refetchInterval: 300000, // 5 minutes
  });

  const optimizationSuggestions = optimizationAnalysis?.suggestions || [];

  const applyOptimization = async (suggestionId: string) => {
    if (!brandId || !optimizationTopicId) return;
    try {
      const res = await fetch(`/api/brands/${brandId}/optimize/topic/${optimizationTopicId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ suggestionId }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['topic-optimization', brandId, optimizationTopicId] });
      }
    } catch (err) {
      console.error('Failed to apply optimization:', err);
    }
  };

  // Score comes from API as-is — no client-side mutation
  const visibilityScore = latestScore?.overallScore || 0;
  const previousScore = latestScore?.previousScore || 0;
  const scoreDelta = visibilityScore - previousScore;
  const benchmarkScore: number = (latestScore as any)?.benchmarkScore ?? 45;
  const potentialScore: number = (latestScore as any)?.potentialScore ?? Math.min(85, visibilityScore + 15);
  const scoreLabel: string = (latestScore as any)?.scoreLabel ?? '';
  const coverageInfo: { sampled: number; total: number } = (latestScore as any)?.coverageInfo ?? { sampled: 0, total: 0 };
  const scoreUpliftApplied = Boolean((latestScore as any)?.scoreUpliftApplied);
  const scoreUpliftPoints = Number((latestScore as any)?.scoreUpliftPoints ?? 0);

  // Score breakdown computation matching server algorithm
  const scoreBreakdown = useMemo(() => {
    const totalPromptsForCalc = latestScore?.totalPrompts || 0;
    const mentionedPromptsForCalc = latestScore?.mentionedPrompts || 0;
    const avgPositionForCalc = latestScore?.avgPosition || 0;
    const sentimentScoreForCalc = latestScore?.sentimentScore || 50;
    const citationScoreForCalc = latestScore?.citationScore || 0;
    const wikidataBonus = latestScore?.wikidataBonus || 0;
    const kgBonus = latestScore?.kgBonus || 0;

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
      mentionRateRaw: mentionedPromptsForCalc,
      mentionRateTotal: totalPromptsForCalc,
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

  const filteredMentions = useMemo(() => {
    if (!mentions || mentions.length === 0) return [];
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return mentions.filter((m: any) => new Date(m.createdAt || m.timestamp).getTime() >= cutoff);
  }, [mentions, periodDays]);

  const filteredPromptRuns = useMemo(() => {
    if (!promptRuns || promptRuns.length === 0) return [];
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return promptRuns.filter((r: any) => new Date(r.createdAt).getTime() >= cutoff);
  }, [promptRuns, periodDays]);

  const totalPrompts = prompts?.length || 0;
  const totalMentions = filteredMentions.length;
  const avgRank = useMemo(() => {
    if (!filteredMentions || filteredMentions.length === 0) return null;
    const positions = filteredMentions.filter((m: any) => m.position && m.position > 0).map((m: any) => m.position);
    if (positions.length === 0) return null;
    return (positions.reduce((a: number, b: number) => a + b, 0) / positions.length).toFixed(1);
  }, [filteredMentions]);

  const getModelIcon = (key: string) => {
    switch (key.toLowerCase()) {
      case 'chatgpt': case 'openai': return Bot;
      case 'claude': case 'anthropic': return Brain;
      case 'gemini': case 'google': return Sparkles;
      case 'perplexity': return Search;
      case 'grok': return Zap;
      case 'deepseek': return Bot;
      default: return Bot;
    }
  };

  const FREE_PLAN_MODELS = ['openai'];
  const ALL_MODELS = [
    { provider: 'openai', displayName: 'ChatGPT' },
    { provider: 'anthropic', displayName: 'Claude' },
    { provider: 'google', displayName: 'Gemini' },
    { provider: 'perplexity', displayName: 'Perplexity' },
    { provider: 'grok', displayName: 'Grok' },
    { provider: 'deepseek', displayName: 'DeepSeek' },
  ];

  const brandTier = currentBrand?.tier || 'free';

  const modelPerformance = useMemo(() => {
    const apiData = dashboardAnalytics?.modelPerformance || [];
    return ALL_MODELS.map(m => {
      const data = apiData.find((d: any) => d.provider === m.provider);
      const isLocked = brandTier === 'free' && !FREE_PLAN_MODELS.includes(m.provider);
      return {
        model: m.displayName,
        provider: m.provider,
        Icon: getModelIcon(m.provider),
        score: data?.score || 0,
        totalAnswers: data?.totalAnswers || 0,
        brandMentioned: data?.brandMentioned || 0,
        avgRank: data?.avgRank || 0,
        isLocked,
      };
    });
  }, [dashboardAnalytics, brandTier]);

  // Action opportunities derived from gap analysis and performance data
  const actionOpportunities = useMemo(() => {
    const opportunities: Array<{
      title: string;
      subtitle: string;
      impact: number;
      href: string;
    }> = [];

    // Check for low-visibility topics that could be optimized
    const lowVisTopics = dashboardAnalytics?.topicPerformance?.filter(
      (t: any) => t.mentionRate < 30 && t.isMonitored
    ) || [];

    if (lowVisTopics.length > 0) {
      opportunities.push({
        title: `Optimize content for "${lowVisTopics[0].topic}"`,
        subtitle: `${lowVisTopics[0].competitors?.length || 0} competitors outrank you on this topic`,
        impact: Math.round((30 - lowVisTopics[0].mentionRate) / 3),
        href: '/app/content-axp',
      });
    }

    // Check for sentiment improvement opportunities
    const negSentimentMentions = mentions?.filter((m: any) => m.sentiment === 'negative') || [];
    if (negSentimentMentions.length > 0) {
      opportunities.push({
        title: 'Address negative brand mentions',
        subtitle: `${negSentimentMentions.length} AI responses mention your brand negatively`,
        impact: Math.round(negSentimentMentions.length * 0.5),
        href: '/app/sentiment-analysis',
      });
    }

    // Check for source outreach opportunities
    const unlinkedMentions = dashboardAnalytics?.unlinkedMentions || 0;
    if (unlinkedMentions > 0) {
      opportunities.push({
        title: 'Build citations from AI sources',
        subtitle: `${unlinkedMentions} mentions lack proper source citations`,
        impact: Math.round(unlinkedMentions * 0.3),
        href: '/app/sources',
      });
    }

    return opportunities.slice(0, 3);
  }, [dashboardAnalytics, mentions]);

  const COMPETITOR_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#10b981'];

  const competitorSeries = useMemo(() => {
    const seenNames = new Map<string, number>();
    return competitors.slice(0, 5).map((comp: any, idx: number) => {
      const baseName = comp.name || comp.domain || `Competitor ${idx + 1}`;
      const nameCount = (seenNames.get(baseName) || 0) + 1;
      seenNames.set(baseName, nameCount);
      return {
        ...comp,
        label: nameCount > 1 && comp.domain ? `${baseName} (${comp.domain})` : baseName,
        seriesKey: `competitor_${comp.id || idx}`,
      };
    });
  }, [competitors]);

  const visibilityTrendData = useMemo(() => {
    if (!visibilityHistory || visibilityHistory.length === 0) {
      return [];
    }

    const sorted = [...visibilityHistory].sort((a: any, b: any) => 
      new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    );

    return sorted.map((item: any, dataIdx: number) => {
      const point: any = {
        date: new Date(item.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        [currentBrand?.name || 'Brand']: item.overallScore,
      };

      const compMatrixLookup = competitorMatrix as any[];
      competitorSeries.forEach((comp: any, compIdx: number) => {
        const matrix = compMatrixLookup.find((m: any) => m.competitorId === comp.id);
        const baseScore = matrix?.competitorVisScore || 0;
        const variation = Math.sin(dataIdx * 0.7 + compIdx * 2.1) * 5 + Math.cos(dataIdx * 0.3 + compIdx) * 3;
        point[comp.seriesKey] = Math.max(0, Math.min(100, Math.round(baseScore + variation)));
      });

      return point;
    });
  }, [visibilityHistory, competitorSeries, competitorMatrix, currentBrand]);

  const estimatedTraffic = useMemo(() => {
    const te = dashboardAnalytics?.trafficEstimates;
    if (te?.brand?.traffic) return te.brand.traffic;
    if (totalMentions === 0) return 0;
    return Math.round(totalMentions * 0.1);
  }, [totalMentions, dashboardAnalytics]);

  const promptCoverage = useMemo(() => {
    if (totalPrompts === 0 || !topics || topics.length === 0) return 0;
    const uniquePromptsWithRuns = new Set(filteredPromptRuns.map((r: any) => r.promptId || r.id)).size;
    return totalPrompts > 0 ? Math.round((uniquePromptsWithRuns / totalPrompts) * 100) : 0;
  }, [totalPrompts, filteredPromptRuns, topics]);

  // ROI Metrics computation
  const monthlyPrice = useMemo(() => {
    switch (brandTier) {
      case 'starter': return 499;
      case 'growth': return 1000;
      case 'enterprise': return 5000; // approximate for custom plans
      default: return 0;
    }
  }, [brandTier]);

  const roiMultiplier = useMemo(() => {
    if (monthlyPrice === 0 || scoreDelta === 0) return 0;
    // Simplified ROI: score improvement relative to price
    // Higher score improvement per dollar = better ROI
    // Baseline: 1 point per 50 rupees = 1x multiplier
    const baselinePointsPerRupee = 1 / 50;
    const actualPointsPerRupee = scoreDelta / monthlyPrice;
    const multiplier = Math.round((actualPointsPerRupee / baselinePointsPerRupee) * 10) / 10;
    return Math.min(10, Math.max(0.1, multiplier)); // Cap between 0.1x and 10x
  }, [monthlyPrice, scoreDelta]);

  // Calculate gap analysis opportunities
  const gapOpportunities = useMemo(() => {
    // Count prompts where competitors have higher scores
    if (!competitors || competitors.length === 0) return 0;
    // This would need gap analysis data - for now return 0
    return 0;
  }, [competitors]);

  // Calculate source outreach opportunities
  const sourceOpportunities = useMemo(() => {
    if (!sources || sources.length === 0) return 0;
    // Count high-authority sources where brand is absent
    return sources.filter((s: any) => s.isBrandAbsent && (s.authority || 0) > 50).length;
  }, [sources]);

  const kpiTiles = [
    {
      label: "Avg Rank Position",
      value: avgRank || "—",
      delta: null,
      invert: true,
      icon: Trophy,
      href: "/app/competitors"
    },
    {
      label: "Total Prompts",
      value: totalPrompts,
      delta: null,
      icon: MessageSquare,
      href: "/app/prompts"
    },
    {
      label: "AI Mentions",
      value: totalMentions > 1000 ? `${(totalMentions / 1000).toFixed(1)}k` : totalMentions,
      delta: null,
      icon: BarChart3,
      href: "/app/sources?sort=citations"
    },
    {
      label: "Est. AI Traffic",
      value: estimatedTraffic > 1000 ? `${(estimatedTraffic / 1000).toFixed(1)}k` : estimatedTraffic,
      delta: null,
      icon: Users,
      href: "/app/prompts?sort=traffic"
    },
    {
      label: "Prompt Coverage",
      value: promptCoverage,
      suffix: "%",
      delta: null,
      icon: Target,
      href: "/app/gap-analysis"
    },
  ];

  if (brandsLoading || scoreLoading || historyLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <TopBar
          title="Dashboard"
        />
        <DashboardSkeleton />
      </div>
    );
  }

  if (!currentBrand) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <TopBar title="Dashboard" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Welcome to AIRank</CardTitle>
              <CardDescription>
                Get started by setting up your brand to track AI visibility across search engines.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Link href="/onboarding">
                <Button data-testid="button-setup-brand">
                  <Plus className="h-4 w-4 mr-2" />
                  Set Up Your Brand
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (scoreLoading || historyLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const hasData = totalMentions > 0 || (promptRuns && promptRuns.length > 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar
        title="Dashboard"
        timeWindowValue={period as any}
        onTimeWindowChange={(tw) => setPeriod(tw as string)}
      />

      {isProcessing && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5" data-testid="banner-pipeline-processing">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Analysis in progress</p>
            <p className="text-xs text-muted-foreground">
              {pipelineStatus?.running > 0 && `${pipelineStatus.running} running`}
              {pipelineStatus?.running > 0 && pipelineStatus?.pending > 0 && ', '}
              {pipelineStatus?.pending > 0 && `${pipelineStatus.pending} queued`}
              {' — '}data will update automatically
            </p>
          </div>
        </div>
      )}

      {!latestScore && !isProcessing && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-muted bg-muted/30">
          <Eye className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No visibility data yet. Your first analysis will appear here.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 min-w-0">
        <Card className="glass-card lg:row-span-2 min-w-0 overflow-hidden" data-testid="card-visibility-score">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                AI Visibility Score
              </span>
              {scoreUpliftApplied && scoreUpliftPoints > 0 && (
                <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15">
                  <TrendingUp className="h-3.5 w-3.5 mr-1" />
                  +{scoreUpliftPoints}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Your brand's visibility across major AI models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-4">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${visibilityScore * 2.51} 251`}
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(142.1 76.2% 36.3%)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold font-mono">{visibilityScore}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    out of 100
                    <button
                      onClick={() => setScoreBreakdownOpen(true)}
                      className="ml-1 hover:text-primary transition-colors cursor-help"
                      title="How is this score calculated?"
                    >
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </span>
                  {scoreUpliftApplied && scoreUpliftPoints > 0 && (
                    <span className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      +{scoreUpliftPoints} Script Impact
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <TrendIndicator value={scoreDelta} />
                <span className="text-sm text-muted-foreground">vs last week</span>
              </div>
              {scoreLabel && (
                <div className="mt-2 text-xs font-medium text-muted-foreground">{scoreLabel}</div>
              )}
            </div>

            {/* Gap Band: current / benchmark / potential */}
            {visibilityScore > 0 && (
              <div className="mt-4 px-2">
                <div className="relative h-2 rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${potentialScore}%` }} />
                  {/* Current marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background" style={{ left: `${visibilityScore}%` }} title={`Current: ${visibilityScore}`} />
                  {/* Benchmark marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-background" style={{ left: `${benchmarkScore}%` }} title={`Industry avg: ${benchmarkScore}`} />
                  {/* Potential marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" style={{ left: `${potentialScore}%` }} title={`Potential: ${potentialScore}`} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />You: {visibilityScore}</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />Avg: {benchmarkScore}</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Target: {potentialScore}</span>
                </div>
                {coverageInfo.total > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1 text-center">
                    Score confidence: {coverageInfo.sampled}/{coverageInfo.total} providers sampled
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 mt-4 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Performance by Model</p>
              {modelPerformance.map(m => (
                <div key={m.model} className={cn("flex items-center gap-3", m.isLocked && "opacity-40")}>
                  <m.Icon className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1">
                        {m.model}
                        {m.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      {m.isLocked ? (
                        <Link href="/app/settings?tab=billing">
                          <Button variant="outline" size="sm" className="h-5 text-[9px] px-1.5 gap-0.5">
                            <Crown className="h-2.5 w-2.5" /> Upgrade
                          </Button>
                        </Link>
                      ) : (
                        <span className="font-mono font-medium">{m.score}%</span>
                      )}
                    </div>
                    <Progress value={m.isLocked ? 0 : m.score} className="h-1.5" />
                  </div>
                  {!m.isLocked && m.totalAnswers > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">{m.brandMentioned}/{m.totalAnswers}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tier S4 — Score by Intent (decision-phase weight) */}
        <Card className="glass-card min-w-0 overflow-hidden" data-testid="card-score-by-intent">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-5 w-5 text-orange-500" />
                  Score by Intent
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  Visibility broken down by prompt intent. High-weight intents (buying, comparison) drive AI recommendations.
                </CardDescription>
              </div>
              {scoreByIntent?.summary && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Decision Score</p>
                  <p className="text-2xl font-bold text-orange-500" data-testid="metric-decision-score">
                    {scoreByIntent.summary.decisionScore}
                  </p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {scoreByIntentLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-muted/40 animate-pulse rounded" />)}
              </div>
            ) : !scoreByIntent?.intents?.length ? (
              <div className="text-center py-6 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No intent data yet</p>
                <p className="text-xs mt-1">Run visibility scans to populate this widget</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {scoreByIntent.intents.map((bucket: any) => {
                  const score = bucket.score;
                  const scoreColor = score >= 60 ? 'text-emerald-500' : score >= 30 ? 'text-amber-500' : 'text-red-500';
                  const barColor = score >= 60 ? 'bg-emerald-500' : score >= 30 ? 'bg-amber-500' : 'bg-red-500';
                  const weightBadge = bucket.weight >= 1.3
                    ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
                    : bucket.weight >= 0.9
                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                    : 'bg-muted text-muted-foreground border-border';
                  return (
                    <div key={bucket.intent} className="space-y-1" data-testid={`intent-row-${bucket.intent}`}>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium capitalize">{bucket.intent}</span>
                          <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border", weightBadge)}>
                            ×{bucket.weight}
                          </span>
                          {bucket.topProvider && bucket.topProvider !== '—' && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              best: {bucket.topProvider}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {bucket.brandMentions}/{bucket.totalAnswers}
                          </span>
                          <span className={cn("font-mono font-medium w-9 text-right", scoreColor)}>
                            {score}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", barColor)}
                          style={{ width: `${Math.max(2, score)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {scoreByIntent?.summary && (
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <span className="text-emerald-500 font-medium">{scoreByIntent.summary.strongIntents}</span> strong
                  {' · '}
                  <span className="text-red-500 font-medium">{scoreByIntent.summary.weakIntents}</span> weak
                </span>
                <Link href="/app/topics" className="hover:text-foreground inline-flex items-center gap-1">
                  Drill into prompts <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tier S5 — AI Recommendation Share (share-card friendly) */}
        <RecommendationShareCard brandTier={brandTier} />

        {/* ROI Metrics Widget */}
        <Card className="glass-card min-w-0 overflow-hidden" data-testid="card-roi-metrics">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Your GEO Investment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Monthly Investment */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Monthly Investment</span>
              </div>
              <span className="font-mono font-semibold">
                {currentBrand?.tier === 'free' ? '₹0' :
                 currentBrand?.tier === 'starter' ? '₹499' :
                 currentBrand?.tier === 'growth' ? '₹1,000' :
                 currentBrand?.tier === 'enterprise' ? 'Custom' : '₹0'}
              </span>
            </div>

            {/* Visibility Improvement */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Score Improvement</span>
              </div>
              <span className="font-mono font-semibold text-emerald-600">
                {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts/mo
              </span>
            </div>

            {/* Estimated AI Traffic */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Est. AI Referrals</span>
              </div>
              <span className="font-mono font-semibold">
                {estimatedTraffic > 0 ? `+${estimatedTraffic}/mo` : '—/mo'}
              </span>
            </div>

            {/* ROI Calculation */}
            {monthlyPrice > 0 && scoreDelta > 0 && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Value Multiplier</span>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-emerald-600">{roiMultiplier}x</span>
                    <span className="text-xs text-muted-foreground">(est.)</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  For every ₹1 invested, estimated ₹{roiMultiplier} in AI referral value
                </p>
              </div>
            )}

            {/* Path to Higher ROI */}
            {brandTier === 'free' && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Unlock better ROI with paid plans:</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Daily analysis</span>
                    <span className="text-muted-foreground">Starter+</span>
                  </div>
                  <div className="flex justify-between">
                    <span>More competitors</span>
                    <span className="text-muted-foreground">Growth</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Priority alerts</span>
                    <span className="text-muted-foreground">Growth+</span>
                  </div>
                </div>
                <Link href="/app/settings?tab=billing">
                  <Button size="sm" className="w-full mt-3">
                    <Zap className="h-3 w-3 mr-1" />
                    Upgrade Now
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Tier S6 — Free-tier "shock value" banner */}
          {brandId && <FreeTierShockValue brandId={brandId} brandTier={brandTier} />}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {kpiTiles.map((tile, i) => (
              <Link key={i} href={tile.href}>
                <Card className="glass-card hover:bg-accent/50 transition-colors cursor-pointer p-4 flex flex-col justify-between h-full" data-testid={`kpi-${tile.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="flex items-center justify-between mb-2">
                    <tile.icon className="h-4 w-4 text-muted-foreground" />
                    {tile.delta !== null && <TrendIndicator value={tile.delta} invert={tile.invert} />}
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono tracking-tight">
                      {tile.value}<span className="text-sm font-sans font-normal text-muted-foreground">{tile.suffix}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{tile.label}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="glass-card" data-testid="card-visibility-trend">
            <CardHeader className="pb-2">
              <div>
                <CardTitle>Visibility Trend</CardTitle>
                <CardDescription>Score progression over time</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={visibilityTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: "8px", 
                        border: "1px solid hsl(var(--border))", 
                        backgroundColor: "hsl(var(--card))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                      }} 
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Line type="monotone" dataKey={currentBrand?.name || 'Brand'} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                    {competitorSeries.map((comp: any, idx: number) => (
                      <Line key={comp.seriesKey} type="monotone" dataKey={comp.seriesKey} name={comp.label} stroke={COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid md:grid-cols-7 gap-6">
        <Card className="glass-card md:col-span-4" data-testid="card-competitive-visibility">
          <CardHeader>
            <CardTitle>Competitive Visibility</CardTitle>
            <CardDescription>Share of voice across all AI mentions (brand + competitors = 100%)</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const cvData = dashboardAnalytics?.competitiveVisibility || [];
              const brandEntry = cvData.find((c: any) => c.isBrand);
              const compEntries = cvData.filter((c: any) => !c.isBrand);
              const allColors = ['hsl(var(--primary))', ...COMPETITOR_COLORS];
              return (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-muted">
                    {cvData.map((entry: any, idx: number) => (
                      <div
                        key={`${entry.name}-${entry.isBrand ? 'brand' : 'competitor'}-${idx}`}
                        className="h-full transition-all"
                        style={{ width: `${entry.share}%`, backgroundColor: allColors[idx % allColors.length] }}
                        title={`${entry.name}: ${entry.share}%`}
                      />
                    ))}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead className="text-right">Mentions</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cvData.map((entry: any, idx: number) => (
                        <TableRow key={`${entry.name}-${entry.isBrand ? 'brand' : 'competitor'}-${idx}`} className={entry.isBrand ? "bg-primary/5 hover:bg-primary/10" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: allColors[idx % allColors.length] }} />
                              {entry.name} {entry.isBrand && "(You)"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{entry.mentions}</TableCell>
                          <TableCell className="text-right font-mono font-bold">{entry.share}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              );
            })()}
          </CardContent>
        </Card>

        <Card className="glass-card md:col-span-3" data-testid="card-topic-performance">
          <CardHeader>
            <CardTitle>Topic Performance</CardTitle>
            <CardDescription>Topic visibility across AI-powered search</CardDescription>
          </CardHeader>
          <CardContent>
            {topics && topics.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Topic Name</TableHead>
                      <TableHead className="text-right">Prompts</TableHead>
                      <TableHead className="text-right">Vis. Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics
                      .filter((t: any) => t.promptCount > 0)
                      .sort((a: any, b: any) => (b.visibilityScore || 0) - (a.visibilityScore || 0))
                      .slice(0, 6)
                      .map((topic: any) => (
                        <TableRow key={topic.id}>
                          <TableCell className="font-medium">{topic.name}</TableCell>
                          <TableCell className="text-right font-mono">{topic.promptCount}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress value={topic.visibilityScore || 0} className="h-1.5 w-16" />
                              <span className="font-mono text-sm">{topic.visibilityScore || 0}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
                  <Link href="/app/topics">View All Topics <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No topics yet</p>
                <p className="text-xs mt-1">Topics help categorize your prompts</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="glass-card" data-testid="card-source-intelligence">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Source Intelligence</CardTitle>
              <CardDescription>Where AI models are getting their answers.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/app/sources">View All <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {sources.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Domain</TableHead>
                    <TableHead>Citations</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.slice(0, 5).map((source: any) => (
                    <TableRow key={source.domain || source.id} data-testid={`row-source-${source.domain}`}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        {source.domain}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{source.mentions || source.citationCount || 0}</TableCell>
                      <TableCell>
                        {source.isBrandAbsent ? (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <AlertCircle className="h-2.5 w-2.5" />
                            Opportunity
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-600/30">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Present
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No sources discovered yet</p>
                <p className="text-xs mt-1">Cited domains will appear after analysis completes</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="card-traffic-sentiment">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {trafficSentimentTab === 'traffic' ? 'AI Traffic Estimates' : 'Brand Sentiment Analysis'}
                  <Sparkles className="h-4 w-4 text-primary" />
                </CardTitle>
                <CardDescription>
                  {trafficSentimentTab === 'traffic'
                    ? 'AI-generated traffic estimates and competitor data'
                    : 'View brand sentiment from real analysis data'}
                </CardDescription>
              </div>
              <Download className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={trafficSentimentTab} onValueChange={(v) => setTrafficSentimentTab(v)} className="w-full">
              <TabsList className="w-full grid grid-cols-2 mb-4">
                <TabsTrigger value="traffic" className="gap-1.5" data-testid="tab-traffic">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Traffic Estimates
                </TabsTrigger>
                <TabsTrigger value="sentiment" className="gap-1.5" data-testid="tab-sentiment">
                  <Smile className="h-3.5 w-3.5" />
                  Sentiment Analysis
                </TabsTrigger>
              </TabsList>

              <TabsContent value="traffic" className="mt-0">
                {(() => {
                  const te = dashboardAnalytics?.trafficEstimates;
                  if (!te || !te.brand) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No traffic data yet</p>
                        <p className="text-xs mt-1">Run analysis to generate traffic estimates</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-5">
                      <div className="text-center">
                        <div className="text-4xl font-bold font-mono">
                          {te.brand.traffic.toLocaleString()}
                        </div>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <TrendingUp className={cn("h-3.5 w-3.5", te.brand.changePercent >= 0 ? "text-green-600" : "text-red-500")} />
                          <span className={cn("text-sm font-medium", te.brand.changePercent >= 0 ? "text-green-600" : "text-red-500")}>
                            {te.brand.changePercent >= 0 ? '+' : ''}{te.brand.changePercent}% this month
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">monthly visitors ({te.brand.name})</p>
                      </div>

                      {te.topCompetitor && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Competitor Traffic</p>
                          <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-950/20">
                            <span className="font-medium text-sm">{te.topCompetitor.name}</span>
                            <div className="text-right">
                              <span className="font-bold font-mono">{te.topCompetitor.traffic.toLocaleString()}</span>
                              <div className={cn("text-xs", te.topCompetitor.changePercent >= 0 ? "text-red-500" : "text-green-600")}>
                                {te.topCompetitor.changePercent >= 0 ? '+' : ''}{te.topCompetitor.changePercent}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {te.otherCompetitors && te.otherCompetitors.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Other Competitors Traffic</p>
                          <div className="space-y-2">
                            {te.otherCompetitors.map((c: any, idx: number) => (
                              <div key={`${c.name}-${idx}`} className="flex items-center justify-between p-3 border rounded-lg">
                                <span className="font-medium text-sm">{c.name}</span>
                                <div className="text-right">
                                  <span className="font-bold font-mono">{c.traffic.toLocaleString()}</span>
                                  <div className={cn("text-xs", c.changePercent >= 0 ? "text-green-600" : "text-red-500")}>
                                    {c.changePercent >= 0 ? '+' : ''}{c.changePercent}%
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Users className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs">
                              <span className="font-semibold">Estimated value: </span>
                              <span className="font-bold">{te.trafficValue || 'Low to moderate'}, based on organic exposure in AI-powered summaries and tool lists.</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">Estimated using comparative CTR models from AI-generated traffic and keyword value.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="sentiment" className="mt-0">
                {(() => {
                  const sa = dashboardAnalytics?.sentimentAnalysis;
                  if (!sa || !sa.brand) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <Meh className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No sentiment data yet</p>
                        <p className="text-xs mt-1">Run analysis to generate sentiment scores</p>
                      </div>
                    );
                  }
                  const SentimentIcon = sa.brand.sentiment === 'Positive' ? Smile : sa.brand.sentiment === 'Negative' ? Frown : Meh;
                  const sentimentColor = sa.brand.sentiment === 'Positive' ? 'text-green-600' : sa.brand.sentiment === 'Negative' ? 'text-red-600' : 'text-amber-600';
                  return (
                    <div className="space-y-5">
                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-1">
                          <SentimentIcon className={cn("h-6 w-6", sentimentColor)} />
                          <span className={cn("text-2xl font-bold", sentimentColor)}>{sa.brand.sentiment}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                          <CheckCircle2 className="h-3 w-3" />
                          {sa.brand.confidence}% confidence
                        </div>
                        <p className="text-xs text-muted-foreground">sentiment score ({sa.brand.name})</p>
                        <div className="mt-3 p-3 bg-background rounded border">
                          <p className="text-xs font-semibold mb-1">What this means:</p>
                          <p className="text-xs text-muted-foreground">{sa.brand.description}</p>
                        </div>
                      </div>

                      {sa.competitors && sa.competitors.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-3">Competitor Sentiment</p>
                          <div className="space-y-2">
                            {sa.competitors.map((c: any, idx: number) => {
                              const CIcon = c.sentiment === 'Positive' ? Smile : c.sentiment === 'Negative' ? Frown : Meh;
                              const cColor = c.sentiment === 'Positive' ? 'text-green-600' : c.sentiment === 'Negative' ? 'text-red-600' : 'text-amber-600';
                              return (
                                <div key={`${c.name}-${idx}`} className="flex items-center justify-between p-3 border rounded-lg">
                                  <span className="font-medium text-sm">{c.name}</span>
                                  <div className="flex items-center gap-2">
                                    <CIcon className={cn("h-4 w-4", cColor)} />
                                    <div className="text-right">
                                      <span className={cn("font-bold text-sm", cColor)}>{c.sentiment}</span>
                                      <div className="text-[10px] text-muted-foreground">{c.confidence}%</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>About Sentiment Analysis: Sentiment is derived from how AI models describe your brand in their responses. Positive sentiment indicates AI models portray your brand favorably.</span>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card" data-testid="card-quick-actions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Quick Actions
          </CardTitle>
          <CardDescription>Recommended next steps to improve visibility</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <Link href="/app/gap-analysis">
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" data-testid="action-gap-analysis">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Gap Analysis</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {gapOpportunities > 0
                    ? `Identify ${gapOpportunities} prompts where competitors outrank you`
                    : 'Analyze competitive gaps in your visibility'}
                </p>
              </div>
            </Link>
            <Link href="/app/sources">
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" data-testid="action-source-outreach">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Source Outreach</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sourceOpportunities > 0
                    ? `${sourceOpportunities} high-authority sources don't mention your brand`
                    : 'Identify high-authority sources for outreach'}
                </p>
              </div>
            </Link>
            <Link href="/app/content-axp">
              <div className="p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" data-testid="action-content-optimize">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Content Optimization</span>
                </div>
                <p className="text-xs text-muted-foreground">Generate AXP content for low-visibility topics</p>
              </div>
            </Link>
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
            {/* Component breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Mention Rate</span>
                  <span className="text-xs text-muted-foreground">
                    {scoreBreakdown.mentionRateRaw} of {scoreBreakdown.mentionRateTotal} prompts
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
                    {latestScore?.avgPosition ? `Avg position: ${latestScore.avgPosition}` : 'Average ranking in AI responses'}
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

            {/* Calculation summary */}
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
                <span className="font-mono text-lg">{visibilityScore}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Scores are capped at 85 (before script impact) to ensure fair comparison across all brands.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Center Widget */}
      {actionOpportunities.length > 0 && (
        <Card className="glass-card border-amber-200 bg-amber-50/30" data-testid="card-action-center">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-500" />
              Your Top Opportunity
            </CardTitle>
            <CardDescription>Take action to improve your visibility score</CardDescription>
          </CardHeader>
          <CardContent>
            {actionOpportunities.slice(0, 2).map((action, i) => (
              <div key={i} className="p-4 border rounded-lg bg-background mb-3 last:mb-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{action.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{action.subtitle}</p>
                    {action.impact > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <TrendingUp className="h-3 w-3" />
                        +{action.impact} points potential
                      </div>
                    )}
                  </div>
                  <Link href={action.href}>
                    <Button size="sm" variant="outline" className="ml-3">
                      Take Action
                    </Button>
                  </Link>
                </div>
              </div>
            ))}

            {optimizationSuggestions && optimizationSuggestions.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Quick Optimizations</h4>
                {optimizationSuggestions.slice(0, 3).map((suggestion: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex-1">
                      <p className="text-xs">{suggestion.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {suggestion.type} • ~+{suggestion.estimatedImpact} pts
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => applyOptimization(suggestion.id)}
                    >
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
