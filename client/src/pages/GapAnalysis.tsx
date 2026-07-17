import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sparkles,
  ChevronDown,
  Zap,
  Target,
  Clock,
  TrendingUp,
  Lightbulb,
  CheckCircle,
  Circle,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
  Eye,
  Shield,
  Search,
  Link,
  BookOpen,
  Award,
  Quote,
  BadgeCheck,
  Compass
} from "lucide-react";
import { useCurrentBrand } from "@/hooks/use-brand";
import { cn } from "@/lib/utils";
import { useBrandContext } from "@/hooks/use-brand-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageSkeleton } from "@/components/ui/SkeletonLoaders";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { createGapOpportunityTask, getGapOpportunities } from "@/lib/api";

const focusAreas = [
  { id: "all", label: "All Categories", description: "Generate balanced mix of action items" },
  { id: "content", label: "Content Strategy", description: "Create/optimize content to beat competitors on specific sources and prompts" },
  { id: "competitive", label: "Competitive Response", description: "Directly counter competitor advantages and close ranking gaps" },
  { id: "technical", label: "Technical Optimization", description: "Website, SEO, and AI model technical improvements" },
];

const gapCategoryIcons: Record<string, React.ReactNode> = {
  visibility_gaps: <Eye className="h-4 w-4 text-amber-500" />,
  authority_gaps: <Shield className="h-4 w-4 text-red-500" />,
  content_gaps: <FileText className="h-4 w-4 text-blue-500" />,
  technical_gaps: <Zap className="h-4 w-4 text-purple-500" />,
  entity_gaps: <BadgeCheck className="h-4 w-4 text-green-500" />,
};

const gapCategoryLabels: Record<string, string> = {
  visibility_gaps: "Visibility Gaps",
  authority_gaps: "Authority Gaps",
  content_gaps: "Content Gaps",
  technical_gaps: "Technical Gaps",
  entity_gaps: "Entity Gaps",
};

const recCategoryIcons: Record<string, React.ReactNode> = {
  llm_optimization: <Search className="h-4 w-4 text-blue-500" />,
  entity_building: <Link className="h-4 w-4 text-green-500" />,
  citation_strategy: <BookOpen className="h-4 w-4 text-purple-500" />,
  trust_signals: <Award className="h-4 w-4 text-amber-500" />,
};

const recCategoryLabels: Record<string, string> = {
  llm_optimization: "LLM Optimization",
  entity_building: "Entity Building",
  citation_strategy: "Citation Strategy",
  trust_signals: "Trust Signals",
};

export default function GapAnalysis() {
  const { brand, brandId } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedFocus, setSelectedFocus] = useState(focusAreas[0]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const { data: context, isLoading, error } = useBrandContext(brandId || "");
  const { data: actionData } = useQuery<any>({
    queryKey: ['gap-actions', brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/actions?limit=8`);
      if (!res.ok) throw new Error('Failed to fetch gap actions');
      return res.json();
    },
  });
  const { data: liveRecommendations = [] } = useQuery<any[]>({
    queryKey: ['recommendations', brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const res = await fetch(`/api/brands/${brandId}/recommendations?limit=8`);
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
  });
  const { data: gapOpportunities } = useQuery<any>({
    queryKey: ['gap-opportunities', brandId],
    enabled: !!brandId,
    queryFn: () => getGapOpportunities(brandId || ""),
  });

  const gapOpportunityTaskMutation = useMutation({
    mutationFn: (opportunityId: string) => createGapOpportunityTask(brandId || "", opportunityId),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gap-opportunities', brandId] }),
        queryClient.invalidateQueries({ queryKey: ['gap-actions', brandId] }),
        queryClient.invalidateQueries({ queryKey: ['action-workflow', brandId] }),
      ]);
      toast({
        title: result?.created ? "Opportunity added to workflow" : "Opportunity already in workflow",
        description: result?.message,
      });
    },
    onError: (mutationError: any) => {
      toast({ title: "Failed to add opportunity", description: mutationError?.message, variant: "destructive" });
    },
  });

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['brandContext', brandId] });
    queryClient.invalidateQueries({ queryKey: ['gap-actions', brandId] });
    queryClient.invalidateQueries({ queryKey: ['recommendations', brandId] });
    queryClient.invalidateQueries({ queryKey: ['gap-opportunities', brandId] });
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [queryClient, brandId]);

  const handleGenerate = useCallback(async () => {
    if (!brandId) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      await apiRequest("POST", `/api/brands/${brandId}/gap-analysis/generate`, {
        focusArea: selectedFocus.id,
      });
      queryClient.invalidateQueries({ queryKey: ['brandContext', brandId] });
      setShowGenerateModal(false);
      toast({
        title: "Gap analysis generated successfully",
      });
    } catch (err: any) {
      const message = err?.message || "Failed to generate gap analysis";
      setGenerateError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [brandId, selectedFocus, queryClient, toast]);

  const aiData = useMemo(() => {
    return (context as any)?.recommendedActions || null;
  }, [context]);

  const gapData = useMemo(() => {
    const baseGaps = {
      quickWins: [] as any[],
      bigBets: [] as any[],
      fillIns: [] as any[],
      longTerm: [] as any[],
      completed: 0,
      total: 0,
    };

    if (context?.gapAnalysis && Array.isArray(context.gapAnalysis) && context.gapAnalysis.length > 0) {
      const gaps = context.gapAnalysis;
      baseGaps.quickWins = gaps.filter((g: any) => g.impact === 'high' && g.effort === 'low').map((g: any) => ({
        title: g.title || g.description,
        impact: `+${g.impactScore || 10} visibility`,
        status: g.status || 'pending',
      }));
      baseGaps.bigBets = gaps.filter((g: any) => g.impact === 'high' && g.effort === 'high').map((g: any) => ({
        title: g.title || g.description,
        impact: `+${g.impactScore || 40} visibility`,
        status: g.status || 'pending',
      }));
      baseGaps.fillIns = gaps.filter((g: any) => g.impact === 'low' && g.effort === 'low').map((g: any) => ({
        title: g.title || g.description,
        impact: `+${g.impactScore || 5} visibility`,
        status: g.status || 'pending',
      }));
      baseGaps.longTerm = gaps.filter((g: any) => g.impact === 'low' && g.effort === 'high').map((g: any) => ({
        title: g.title || g.description,
        impact: `+${g.impactScore || 60} visibility`,
        status: g.status || 'pending',
      }));
      baseGaps.completed = gaps.filter((g: any) => g.status === 'completed').length;
      baseGaps.total = gaps.length;
    }

    if (aiData?.prioritized_actions) {
      const pa = aiData.prioritized_actions;
      if (Array.isArray(pa.quick_wins)) {
        pa.quick_wins.forEach((item: any) => {
          baseGaps.quickWins.push({
            title: item.title || item.action || item.description || item,
            impact: item.impact || "+10 visibility",
            status: item.status || "pending",
          });
        });
      }
      if (Array.isArray(pa.big_bets)) {
        pa.big_bets.forEach((item: any) => {
          baseGaps.bigBets.push({
            title: item.title || item.action || item.description || item,
            impact: item.impact || "+40 visibility",
            status: item.status || "pending",
          });
        });
      }
      if (Array.isArray(pa.fill_ins_short_term)) {
        pa.fill_ins_short_term.forEach((item: any) => {
          baseGaps.fillIns.push({
            title: item.title || item.action || item.description || item,
            impact: item.impact || "+5 visibility",
            status: item.status || "pending",
          });
        });
      }
      if (Array.isArray(pa.long_term)) {
        pa.long_term.forEach((item: any) => {
          baseGaps.longTerm.push({
            title: item.title || item.action || item.description || item,
            impact: item.impact || "+60 visibility",
            status: item.status || "pending",
          });
        });
      }
      baseGaps.total = baseGaps.quickWins.length + baseGaps.bigBets.length + baseGaps.fillIns.length + baseGaps.longTerm.length;
      baseGaps.completed = [
        ...baseGaps.quickWins,
        ...baseGaps.bigBets,
        ...baseGaps.fillIns,
        ...baseGaps.longTerm,
      ].filter((item) => item.status === "completed").length;
    }

    const liveActions = Array.isArray(actionData?.actions) ? actionData.actions : [];
    liveActions.forEach((action: any) => {
      const impact = action.estimatedImpact || action.impactScore || 5;
      const item = {
        title: action.title || action.description || 'Improve AI visibility',
        impact: `+${impact} visibility`,
        status: action.status || 'pending',
      };
      const isHighImpact = impact >= 7 || action.priority === 'high';
      const effort = action.effortLevel || action.effort || 'medium';

      if (isHighImpact && effort === 'easy') {
        baseGaps.quickWins.push(item);
      } else if (isHighImpact) {
        baseGaps.bigBets.push(item);
      } else if (effort === 'easy') {
        baseGaps.fillIns.push(item);
      } else {
        baseGaps.longTerm.push(item);
      }
    });

    baseGaps.total = baseGaps.quickWins.length + baseGaps.bigBets.length + baseGaps.fillIns.length + baseGaps.longTerm.length;
    baseGaps.completed = [
      ...baseGaps.quickWins,
      ...baseGaps.bigBets,
      ...baseGaps.fillIns,
      ...baseGaps.longTerm,
    ].filter((item) => item.status === "completed").length;

    return baseGaps;
  }, [context, aiData, actionData]);

  const recommendations = useMemo(() => {
    const recs: any[] = [];
    if (context?.recommendations && Array.isArray(context.recommendations)) {
      recs.push(...context.recommendations);
    }
    if (Array.isArray(liveRecommendations)) {
      const existingTitles = new Set(recs.map((rec) => rec.title));
      liveRecommendations.forEach((rec) => {
        if (!existingTitles.has(rec.title)) recs.push(rec);
      });
    }
    return recs;
  }, [context, liveRecommendations]);

  const aiRecommendations = useMemo(() => {
    if (!aiData?.ai_recommendations) return null;
    return aiData.ai_recommendations;
  }, [aiData]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <TopBar
          title="Gap Analysis & Action Plan"
        />
        <PageSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-muted-foreground">Failed to load gap analysis. Please try again.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const progressPercentage = gapData.total > 0 ? (gapData.completed / gapData.total) * 100 : 0;
  const missedOpportunities = Array.isArray(gapOpportunities?.missedOpportunities) ? gapOpportunities.missedOpportunities : [];
  const lowRankingOpportunities = Array.isArray(gapOpportunities?.lowRankings) ? gapOpportunities.lowRankings : [];
  const liveOpportunityRows = [...missedOpportunities, ...lowRankingOpportunities]
    .sort((a: any, b: any) => ((b.impactScore || 0) - (a.impactScore || 0)) || ((a.effortScore || 0) - (b.effortScore || 0)))
    .slice(0, 8);

  const renderQuadrant = (title: string, subtitle: string, items: any[], color: string, icon: React.ReactNode) => (
    <Card className={cn("glass-card", color)} data-testid={`quadrant-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{subtitle}</CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Circle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No items in this quadrant</p>
            <p className="text-xs">Items will appear here based on priority and effort</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="p-3 bg-background/60 rounded-lg border text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{typeof item.title === 'string' ? item.title : String(item.title)}</span>
                {item.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-600 font-medium">{item.impact}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Gap Analysis - {brand?.name || ""}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">AI visibility improvement plan based on competitor analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing} data-testid="button-refresh-gap">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="gap-2" onClick={() => setShowGenerateModal(true)} data-testid="btn-generate-more">
            <Plus className="h-4 w-4" />
            Generate More
          </Button>
        </div>
      </div>

      <Card className="glass-card" data-testid="card-overall-progress">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overall Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold font-mono mb-2">{gapData.completed}<span className="text-lg text-muted-foreground"> / {gapData.total} completed</span></div>
          <Progress value={progressPercentage} className="h-2" />
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="gap-opportunity-engine">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="h-5 w-5 text-primary" />
                AI Search Opportunity Engine
              </CardTitle>
              <CardDescription>
                Live missed-prompt and low-ranking opportunities that can be moved directly into Action Workflow.
              </CardDescription>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border px-3 py-2">
                <div className="font-mono text-lg font-bold">{gapOpportunities?.summary?.totalOpportunities || 0}</div>
                <div className="text-muted-foreground">open</div>
              </div>
              <div className="rounded-md border px-3 py-2">
                <div className="font-mono text-lg font-bold">{gapOpportunities?.summary?.quickWins || 0}</div>
                <div className="text-muted-foreground">quick wins</div>
              </div>
              <div className="rounded-md border px-3 py-2">
                <div className="font-mono text-lg font-bold">{gapOpportunities?.summary?.improvements || 0}</div>
                <div className="text-muted-foreground">rank fixes</div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {liveOpportunityRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No live prompt gaps found from the latest answer evidence. Run fresh scans or add more prompts to expand detection.
            </div>
          ) : (
            liveOpportunityRows.map((opportunity: any) => (
              <div key={opportunity.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={opportunity.type === "quick_win" ? "default" : "secondary"}>
                      {opportunity.type === "quick_win" ? "Missed prompt" : "Low ranking"}
                    </Badge>
                    <Badge variant="outline">Impact {opportunity.impactScore || 0}</Badge>
                    <Badge variant="outline">Effort {opportunity.effortScore || 0}</Badge>
                    {opportunity.position && <Badge variant="outline">Position {opportunity.position}</Badge>}
                  </div>
                  <p className="mt-2 text-sm font-medium">{opportunity.promptText || "Tracked prompt"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{opportunity.action}</p>
                </div>
                <Button
                  size="sm"
                  variant={opportunity.status === "in_workflow" ? "outline" : "default"}
                  onClick={() => gapOpportunityTaskMutation.mutate(opportunity.id)}
                  disabled={gapOpportunityTaskMutation.isPending || opportunity.status === "in_workflow"}
                  data-testid={`button-add-gap-opportunity-${String(opportunity.id || "").replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                >
                  {gapOpportunityTaskMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {opportunity.status === "in_workflow" ? "In workflow" : "Add to workflow"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {aiData?.executive_summary && (
        <Card className="glass-card" data-testid="card-executive-summary">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{aiData.executive_summary}</p>
          </CardContent>
        </Card>
      )}

      {aiData?.gap_overview && Object.keys(aiData.gap_overview).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-display font-bold">Gap Overview</h2>
          </div>
          <p className="text-muted-foreground text-sm mb-4">Identified gaps across key visibility dimensions</p>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(aiData.gap_overview).map(([category, items]) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              return (
                <Card key={category} className="glass-card" data-testid={`gap-overview-${category}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      {gapCategoryIcons[category] || <Circle className="h-4 w-4 text-muted-foreground" />}
                      <CardTitle className="text-sm">{gapCategoryLabels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                      <Badge variant="secondary" className="text-xs ml-auto">{items.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((item: any, i: number) => (
                      <div key={i} className="p-2 bg-background/60 rounded-md border text-sm">
                        <span className="text-muted-foreground">{typeof item === 'string' ? item : (item.description || item.title || JSON.stringify(item))}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-display font-bold">Impact Opportunity Matrix</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-4">Strategic prioritization framework for maximum ROI</p>
        
        <div className="grid md:grid-cols-2 gap-4">
          {renderQuadrant(
            "Quick Wins", 
            "High Impact \u2022 Low Effort", 
            gapData.quickWins, 
            "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30", 
            <Zap className="h-5 w-5 text-green-600" />
          )}
          {renderQuadrant(
            "Big Bets", 
            "High Impact \u2022 High Effort", 
            gapData.bigBets, 
            "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30", 
            <Target className="h-5 w-5 text-amber-600" />
          )}
          {renderQuadrant(
            "Fill-Ins", 
            "Low Impact \u2022 Low Effort", 
            gapData.fillIns, 
            "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30", 
            <CheckCircle className="h-5 w-5 text-blue-600" />
          )}
          {renderQuadrant(
            "Long-Term", 
            "Low Impact \u2022 High Effort", 
            gapData.longTerm, 
            "border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/30", 
            <Clock className="h-5 w-5 text-purple-600" />
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-display font-bold">AI Recommendations</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-4">Generated recommendations from your brand analysis</p>
        
        {aiRecommendations && Object.keys(aiRecommendations).length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {Object.entries(aiRecommendations).map(([category, items]) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              return (
                <Card key={category} className="glass-card" data-testid={`ai-rec-${category}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      {recCategoryIcons[category] || <Lightbulb className="h-4 w-4 text-amber-500" />}
                      <CardTitle className="text-sm">{recCategoryLabels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                      <Badge variant="secondary" className="text-xs ml-auto">{items.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((item: any, i: number) => (
                      <div key={i} className="p-2 bg-background/60 rounded-md border text-sm">
                        <span className="text-muted-foreground">{typeof item === 'string' ? item : (item.description || item.title || item.recommendation || JSON.stringify(item))}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {recommendations.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {recommendations.map((rec: any, i: number) => (
              <Card key={i} className="glass-card" data-testid={`recommendation-${i}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{rec.title || rec.type || 'Recommendation'}</CardTitle>
                    <Badge variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'default' : 'secondary'}>
                      {rec.priority || 'medium'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">{rec.description || rec.content}</p>
                  {rec.impactScore && (
                    <div className="flex items-center gap-2 text-xs">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-green-600 font-medium">+{rec.impactScore} visibility impact</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !aiRecommendations ? (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Circle className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">No recommendations generated yet</p>
              <p className="text-xs text-muted-foreground mt-1">Run a full analysis to generate personalized recommendations</p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate AI Gap Analysis</DialogTitle>
            <DialogDescription>Select a focus area and AI will analyze your brand visibility gaps</DialogDescription>
          </DialogHeader>
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating analysis... This may take a moment</p>
            </div>
          ) : (
            <>
              <div className="py-4">
                <label className="text-sm font-medium mb-2 block">Focus Area</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between" data-testid="dropdown-focus-area">
                      <span>{selectedFocus.label}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-80">
                    {focusAreas.map(area => (
                      <DropdownMenuItem key={area.id} onClick={() => setSelectedFocus(area)} className="flex flex-col items-start py-3">
                        <span className="font-medium">{area.label}</span>
                        <span className="text-xs text-muted-foreground">{area.description}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {generateError && (
                  <p className="text-xs text-destructive mt-2">{generateError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGenerateModal(false)} data-testid="btn-cancel-generate">
                  Cancel
                </Button>
                <Button onClick={handleGenerate} className="gap-2" data-testid="btn-run-generate">
                  <Sparkles className="h-4 w-4" />
                  Generate Analysis
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
