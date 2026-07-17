import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { useCurrentBrand } from "@/hooks/use-brand";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, TrendingUp, TrendingDown, Eye, BarChart3, Target, ChevronDown, Loader2, AlertCircle, Plus, MessageSquare, Sparkles, Compass, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { backfillPromptCoverage, createPrompt, dismissMinedPrompt, getMinedPrompts, getPromptAnalytics, getPromptCoveragePlan, getPromptFanouts, minePrompts, promoteMinedPrompt } from "@/lib/api";
import { AddPromptDialog } from "@/components/prompts/AddPromptDialog";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/use-toast";

function getModelDisplayName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt")) return "ChatGPT";
  if (m.includes("claude")) return "Claude";
  if (m.includes("gemini")) return "Gemini";
  if (m.includes("sonar") || m.includes("perplexity")) return "Perplexity";
  if (m.includes("grok")) return "Grok";
  if (m.includes("deepseek")) return "DeepSeek";
  if (m.includes("llama")) return "Llama";
  if (m.includes("mistral")) return "Mistral";
  return model;
}

function getModelColor(name: string): string {
  switch (name) {
    case "ChatGPT": return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "Claude": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800";
    case "Gemini": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case "Perplexity": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
    case "Grok": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    case "DeepSeek": return "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800";
    default: return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800";
  }
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    "Excellent": "text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-900/20",
    "Very High": "text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20",
    "High": "text-teal-700 border-teal-300 bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:bg-teal-900/20",
    "Medium": "text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-900/20",
    "Low": "text-orange-700 border-orange-300 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-900/20",
    "Very Low": "text-red-600 border-red-300 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20",
    "Poor": "text-red-700 border-red-400 bg-red-100 dark:text-red-400 dark:border-red-800 dark:bg-red-900/30",
  };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", styles[status] || styles["Poor"])} data-testid={`badge-status-${status.toLowerCase().replace(/\s/g, '-')}`}>
      {status}
    </Badge>
  );
}

const modelFilters = [
  { id: "all", label: "All Models" },
  { id: "ChatGPT", label: "ChatGPT" },
  { id: "Claude", label: "Claude" },
  { id: "Gemini", label: "Gemini" },
  { id: "Perplexity", label: "Perplexity" },
  { id: "Grok", label: "Grok" },
  { id: "DeepSeek", label: "DeepSeek" },
];

const categoryFilters = [
  "All Categories",
  "product",
  "comparison",
  "how-to",
  "pricing",
  "features",
  "alternatives",
  "reviews",
  "other",
];

interface VisibilityShare {
  entity: string;
  count: number;
  share: number;
  isBrand: boolean;
}

interface PromptAnalytic {
  id: string;
  text: string;
  category: string;
  intent?: string;
  promptVolumeScore?: number;
  estimatedMonthlySearches?: number;
  opportunityScore?: number;
  visibilityPct: number;
  avgRank: number;
  avgPosition: number;
  priorityScore: number;
  status: string;
  models: string[];
  totalResponses: number;
  brandMentionCount: number;
  competitorMentionCount: number;
  proportionalVisibility?: VisibilityShare[];
}

interface MinedPrompt {
  id: string;
  query: string;
  source: string;
  intentType: string;
  sourceUrl?: string | null;
  upvotes?: number | null;
  commentCount?: number | null;
  viewCount?: number | null;
  searchVolume?: number | null;
  demandSignal: number;
  priorityScore: number;
  status: "new" | "promoted" | "dismissed";
  locale?: string | null;
}

interface PromptFanout {
  promptId: string;
  prompt: string;
  category: string;
  intent: string;
  opportunityScore: number;
  mentionRate: number;
  totalAnswers: number;
  providers: string[];
  competitorPressure?: {
    competitors: string[];
    brandMentions: number;
    competitorMentions: number;
  };
  topTerms: Array<{ term: string; count: number }>;
  fanoutQueries: string[];
  sourceThemes: string[];
  contentActions: string[];
  status: "high_opportunity" | "watch" | "covered";
}

export default function PromptsPage() {
  const { brandId } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [sortBy, setSortBy] = useState<"visibility" | "rank" | "priority" | "volume" | "opportunity">("opportunity");
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: promptAnalytics, isLoading, error } = useQuery<PromptAnalytic[]>({
    queryKey: ['promptAnalytics', brandId],
    queryFn: () => getPromptAnalytics(brandId || ""),
    enabled: !!brandId,
  });
  const { data: coveragePlan } = useQuery<any>({
    queryKey: ['promptCoveragePlan', brandId],
    queryFn: () => getPromptCoveragePlan(brandId || ""),
    enabled: !!brandId,
  });
  const { data: fanoutData } = useQuery<any>({
    queryKey: ['promptFanouts', brandId],
    queryFn: () => getPromptFanouts(brandId || ""),
    enabled: !!brandId,
  });
  const { data: minedPrompts = [], isFetching: minedPromptsFetching } = useQuery<MinedPrompt[]>({
    queryKey: ['minedPrompts', brandId],
    queryFn: () => getMinedPrompts(brandId || "", 100),
    enabled: !!brandId,
  });

  const prompts = promptAnalytics || [];
  const activeMinedPrompts = minedPrompts.filter((prompt) => prompt.status === "new");

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['promptAnalytics', brandId] });
    queryClient.invalidateQueries({ queryKey: ['minedPrompts', brandId] });
    queryClient.invalidateQueries({ queryKey: ['promptFanouts', brandId] });
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [queryClient, brandId]);

  const handlePromptAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['promptAnalytics', brandId] });
    queryClient.invalidateQueries({ queryKey: ['prompts', brandId] });
    queryClient.invalidateQueries({ queryKey: ['promptCoveragePlan', brandId] });
    queryClient.invalidateQueries({ queryKey: ['minedPrompts', brandId] });
    queryClient.invalidateQueries({ queryKey: ['promptFanouts', brandId] });
  };

  const minePromptsMutation = useMutation({
    mutationFn: () => minePrompts(brandId || ""),
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ['minedPrompts', brandId] });
      toast({ title: "Prompt discovery completed", description: `${result?.stored ?? result?.count ?? "New"} prompts scored` });
    },
    onError: (mutationError: any) => {
      toast({ title: "Prompt discovery failed", description: mutationError?.message, variant: "destructive" });
    },
  });

  const promoteMinedPromptMutation = useMutation({
    mutationFn: (minedId: string) => promoteMinedPrompt(brandId || "", minedId),
    onSuccess: async () => {
      handlePromptAdded();
      toast({ title: "Prompt promoted to tracking" });
    },
    onError: (mutationError: any) => {
      toast({ title: "Failed to promote prompt", description: mutationError?.message, variant: "destructive" });
    },
  });

  const dismissMinedPromptMutation = useMutation({
    mutationFn: (minedId: string) => dismissMinedPrompt(brandId || "", minedId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['minedPrompts', brandId] });
      toast({ title: "Prompt dismissed" });
    },
    onError: (mutationError: any) => {
      toast({ title: "Failed to dismiss prompt", description: mutationError?.message, variant: "destructive" });
    },
  });

  const addSuggestedPromptsMutation = useMutation({
    mutationFn: async (suggestions: any[]) => {
      if (!brandId) return [];
      const created = [];
      for (const suggestion of suggestions) {
        created.push(await createPrompt(brandId, {
          text: suggestion.text,
          category: suggestion.category || suggestion.intent || "general",
          priorityScore: suggestion.priorityScore || 70,
        }));
      }
      return created;
    },
    onSuccess: (_created, suggestions) => {
      handlePromptAdded();
      toast({ title: `${suggestions.length} prompt${suggestions.length === 1 ? "" : "s"} added` });
    },
    onError: (mutationError: any) => {
      toast({ title: "Failed to add prompts", description: mutationError?.message, variant: "destructive" });
    },
  });

  const backfillPromptCoverageMutation = useMutation({
    mutationFn: () => backfillPromptCoverage(brandId || "", {
      targetCount: coveragePlan?.minimumRecommended || 25,
      maxCreate: Math.max(0, (coveragePlan?.minimumRecommended || 25) - promptStats.total),
    }),
    onSuccess: async (result: any) => {
      handlePromptAdded();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "launch-readiness"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "competitive-parity"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "market-opportunities"] }),
      ]);
      toast({
        title: result?.createdCount ? "Launch prompt coverage expanded" : "Prompt coverage already sufficient",
        description: result?.message,
      });
    },
    onError: (mutationError: any) => {
      toast({ title: "Failed to backfill prompt coverage", description: mutationError?.message, variant: "destructive" });
    },
  });

  const promptStats = useMemo(() => {
    const excellentStatuses = ["Excellent"];
    const needsAttentionStatuses = ["Low", "Very Low", "Poor"];
    return {
      total: prompts.length,
      avgVisibility: prompts.length > 0
        ? Math.round(prompts.reduce((acc, p) => acc + p.visibilityPct, 0) / prompts.length)
        : 0,
      avgRank: prompts.length > 0
        ? (prompts.reduce((acc, p) => acc + p.avgRank, 0) / prompts.length).toFixed(1)
        : "0",
      avgVolume: prompts.length > 0
        ? Math.round(prompts.reduce((acc, p) => acc + (p.promptVolumeScore || 0), 0) / prompts.length)
        : 0,
      highOpportunity: prompts.filter(p => (p.opportunityScore || 0) >= 60).length,
      highPerformers: prompts.filter(p => excellentStatuses.includes(p.status)).length,
      needsAttention: prompts.filter(p => needsAttentionStatuses.includes(p.status)).length,
    };
  }, [prompts]);

  const minedStats = useMemo(() => {
    const newPrompts = minedPrompts.filter((prompt) => prompt.status === "new");
    const promoted = minedPrompts.filter((prompt) => prompt.status === "promoted").length;
    const avgPriority = newPrompts.length
      ? Math.round(newPrompts.reduce((sum, prompt) => sum + (prompt.priorityScore || 0), 0) / newPrompts.length)
      : 0;
    const highDemand = newPrompts.filter((prompt) => (prompt.priorityScore || 0) >= 70).length;
    return { newPrompts: newPrompts.length, promoted, avgPriority, highDemand };
  }, [minedPrompts]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (searchQuery && !p.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (selectedModel !== "all") {
        const displayNames = p.models.map(getModelDisplayName);
        if (!displayNames.includes(selectedModel)) return false;
      }
      if (selectedCategory !== "All Categories" && p.category !== selectedCategory) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "visibility") return b.visibilityPct - a.visibilityPct;
      if (sortBy === "rank") return a.avgRank - b.avgRank;
      if (sortBy === "volume") return (b.promptVolumeScore || 0) - (a.promptVolumeScore || 0);
      if (sortBy === "opportunity") return (b.opportunityScore || 0) - (a.opportunityScore || 0);
      return b.priorityScore - a.priorityScore;
    });
  }, [prompts, searchQuery, selectedModel, selectedCategory, sortBy]);

  const topFanouts = useMemo<PromptFanout[]>(() => {
    return Array.isArray(fanoutData?.fanouts) ? fanoutData.fanouts.slice(0, 5) : [];
  }, [fanoutData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading prompts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-muted-foreground">Failed to load prompts. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Prompt Performance Center" showExport={true} onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="glass-card p-4" data-testid="stat-total-prompts">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs">Total Prompts</span>
          </div>
          <div className="text-2xl font-bold font-mono">{promptStats.total}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-avg-visibility">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Eye className="h-4 w-4" />
            <span className="text-xs">Avg Visibility</span>
          </div>
          <div className="text-2xl font-bold font-mono">{promptStats.avgVisibility}%</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-avg-rank">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Target className="h-4 w-4" />
            <span className="text-xs">Avg Rank</span>
          </div>
          <div className="text-2xl font-bold font-mono">#{promptStats.avgRank}</div>
        </Card>
        <Card className="glass-card p-4 border-green-500/20 bg-green-500/5" data-testid="stat-high-performers">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">High Performers</span>
          </div>
          <div className="text-2xl font-bold font-mono text-green-600">{promptStats.highPerformers}</div>
        </Card>
        <Card className="glass-card p-4 border-blue-500/20 bg-blue-500/5" data-testid="stat-avg-volume">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs">Avg Volume</span>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600">{promptStats.avgVolume}</div>
        </Card>
        <Card className="glass-card p-4 border-red-500/20 bg-red-500/5" data-testid="stat-needs-attention">
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <TrendingDown className="h-4 w-4" />
            <span className="text-xs">Needs Attention</span>
          </div>
          <div className="text-2xl font-bold font-mono text-red-500">{promptStats.needsAttention}</div>
        </Card>
      </div>

      {coveragePlan && (
        <Card className="glass-card" data-testid="prompt-coverage-planner">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Prompt Coverage Planner
                </CardTitle>
                <CardDescription>
                  {coveragePlan.summary}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold font-mono">{coveragePlan.coverageScore}<span className="text-sm text-muted-foreground">/100</span></div>
                <p className="text-xs text-muted-foreground">intent balance</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Tracked</p>
                <p className="mt-1 text-2xl font-bold font-mono">{coveragePlan.promptCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Recommended Min</p>
                <p className="mt-1 text-2xl font-bold font-mono">{coveragePlan.minimumRecommended}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Missing Intents</p>
                <p className="mt-1 text-2xl font-bold font-mono">
                  {(coveragePlan.intentCoverage || []).filter((intent: any) => intent.status === "missing").length}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Suggestions</p>
                <p className="mt-1 text-2xl font-bold font-mono">{(coveragePlan.suggestions || []).length}</p>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {(coveragePlan.intentCoverage || []).map((intent: any) => (
                <div key={intent.intent} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{intent.label}</p>
                      <p className="text-xs text-muted-foreground">{intent.current}/{intent.target} prompts</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        intent.status === "covered" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                        intent.status === "partial" && "border-amber-200 bg-amber-50 text-amber-700",
                        intent.status === "missing" && "border-red-200 bg-red-50 text-red-700",
                      )}
                    >
                      {intent.status}
                    </Badge>
                  </div>
                  <Progress value={Math.min(100, Math.round((intent.current / Math.max(intent.target, 1)) * 100))} className="mt-3 h-2" />
                </div>
              ))}
            </div>

            {coveragePlan.personaCoverage ? (
              <div className="rounded-md border p-4" data-testid="prompt-persona-coverage">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Audience persona coverage</p>
                    <p className="text-xs text-muted-foreground">
                      {coveragePlan.personaCoverage.verdict}. Persona prompts improve Profound-style audience segmentation in the Command Center.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono">{coveragePlan.personaCoverage.score}<span className="text-sm text-muted-foreground">/100</span></div>
                    <p className="text-xs text-muted-foreground">
                      {coveragePlan.personaCoverage.summary?.ready || 0} ready / {coveragePlan.personaCoverage.summary?.personas || 0}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  {(coveragePlan.personaCoverage.personas || []).map((persona: any) => (
                    <div key={persona.id} className="rounded-md bg-muted/40 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{persona.label}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            persona.status === "ready" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                            persona.status === "partial" && "border-amber-200 bg-amber-50 text-amber-700",
                            persona.status === "missing" && "border-red-200 bg-red-50 text-red-700",
                          )}
                        >
                          {persona.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {persona.promptCount} prompts, {persona.answerCount} answers, {persona.mentionRate}% mention rate
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(coveragePlan.suggestions || []).length > 0 && (
              <div className="rounded-md border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Suggested prompts to add next</p>
                    <p className="text-xs text-muted-foreground">Balanced across buyer, competitor, product, review, trust, and support intents.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {coveragePlan.promptCount < coveragePlan.minimumRecommended ? (
                      <Button
                        size="sm"
                        onClick={() => backfillPromptCoverageMutation.mutate()}
                        disabled={backfillPromptCoverageMutation.isPending}
                        data-testid="button-backfill-launch-prompts"
                      >
                        {backfillPromptCoverageMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Compass className="mr-2 h-4 w-4" />}
                        Fill to launch floor
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addSuggestedPromptsMutation.mutate((coveragePlan.suggestions || []).slice(0, 5))}
                      disabled={addSuggestedPromptsMutation.isPending}
                      data-testid="button-add-top-suggested-prompts"
                    >
                      {addSuggestedPromptsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Add top 5
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {(coveragePlan.suggestions || []).slice(0, 8).map((suggestion: any) => (
                    <div key={suggestion.text} className="rounded-md bg-muted/40 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{suggestion.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => addSuggestedPromptsMutation.mutate([suggestion])}
                          disabled={addSuggestedPromptsMutation.isPending}
                        >
                          Add
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="capitalize">{suggestion.intent}</Badge>
                        {suggestion.personaLabel ? <Badge variant="outline">{suggestion.personaLabel}</Badge> : null}
                        <Badge variant="secondary">{suggestion.priorityScore}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {fanoutData && (
        <Card className="glass-card" data-testid="prompt-fanout-intelligence">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Compass className="h-5 w-5 text-primary" />
                  Query Fanout Intelligence
                </CardTitle>
                <CardDescription>
                  Subqueries, cited-source themes, and content angles AI systems are likely to use when answering tracked prompts.
                </CardDescription>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{fanoutData?.summary?.highOpportunity || 0}</div>
                  <div className="text-muted-foreground">priority</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{fanoutData?.summary?.queryCount || 0}</div>
                  <div className="text-muted-foreground">fanouts</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="font-mono text-lg font-bold">{fanoutData?.summary?.averageMentionRate || 0}%</div>
                  <div className="text-muted-foreground">mention rate</div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFanouts.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No fanout intelligence yet. Add prompts and run sampling to produce answer-derived subqueries.
              </div>
            ) : (
              topFanouts.map((fanout) => (
                <div key={fanout.promptId} className="rounded-md border p-4" data-testid={`prompt-fanout-${fanout.promptId}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={fanout.status === "high_opportunity" ? "destructive" : fanout.status === "watch" ? "secondary" : "outline"} className="capitalize">
                          {fanout.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="capitalize">{fanout.intent}</Badge>
                        <Badge variant="outline">{fanout.mentionRate}% mention rate</Badge>
                        <Badge variant="outline">{fanout.providers.length} providers</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium">{fanout.prompt}</p>
                    </div>
                    <div className="font-mono text-2xl font-bold">{fanout.opportunityScore}</div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Fanout queries</p>
                      <div className="mt-2 space-y-2">
                        {fanout.fanoutQueries.slice(0, 4).map((query) => (
                          <p key={query} className="text-xs">{query}</p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Terms and sources</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {fanout.topTerms.slice(0, 5).map((term) => (
                          <Badge key={term.term} variant="outline">{term.term}</Badge>
                        ))}
                        {fanout.sourceThemes.slice(0, 3).map((domain) => (
                          <Badge key={domain} variant="secondary">{domain}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Content actions</p>
                      <div className="mt-2 space-y-2">
                        {fanout.contentActions.slice(0, 3).map((action) => (
                          <p key={action} className="text-xs">{action}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card" data-testid="prompt-discovery-panel">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="h-5 w-5 text-primary" />
                Prompt Discovery
              </CardTitle>
              <CardDescription>
                Mine buyer questions from public demand signals, then promote the best ideas into tracked AI prompts.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => minePromptsMutation.mutate()}
              disabled={minePromptsMutation.isPending}
              data-testid="button-mine-prompts"
            >
              {minePromptsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Mine prompts
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">New Ideas</p>
              <p className="mt-1 text-2xl font-bold font-mono">{minedStats.newPrompts}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">High Demand</p>
              <p className="mt-1 text-2xl font-bold font-mono">{minedStats.highDemand}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Avg Priority</p>
              <p className="mt-1 text-2xl font-bold font-mono">{minedStats.avgPriority}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Promoted</p>
              <p className="mt-1 text-2xl font-bold font-mono">{minedStats.promoted}</p>
            </div>
          </div>

          {minedPromptsFetching ? (
            <div className="flex items-center justify-center rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading discovered prompts...
            </div>
          ) : activeMinedPrompts.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No new discovered prompts yet. Run mining to find public buyer questions and demand-led prompt opportunities.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeMinedPrompts.slice(0, 8).map((prompt) => (
                <div key={prompt.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{prompt.query}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {prompt.source.replace(/_/g, " ")} · {prompt.intentType} · priority {Math.round(prompt.priorityScore || 0)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(prompt.searchVolume || 0) > 0 && <Badge variant="secondary">{prompt.searchVolume} searches</Badge>}
                        {(prompt.upvotes || 0) > 0 && <Badge variant="outline">{prompt.upvotes} upvotes</Badge>}
                        {(prompt.commentCount || 0) > 0 && <Badge variant="outline">{prompt.commentCount} comments</Badge>}
                        {(prompt.viewCount || 0) > 0 && <Badge variant="outline">{prompt.viewCount} views</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => promoteMinedPromptMutation.mutate(prompt.id)}
                        disabled={promoteMinedPromptMutation.isPending}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Track
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => dismissMinedPromptMutation.mutate(prompt.id)}
                        disabled={dismissMinedPromptMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Progress value={Math.min(100, Math.round(prompt.priorityScore || 0))} className="mt-3 h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {promptStats.highOpportunity > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5" data-testid="banner-prompt-opportunity">
          <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-sm">Prompt volume opportunities</p>
              <p className="text-sm text-muted-foreground">
                {promptStats.highOpportunity} prompt{promptStats.highOpportunity === 1 ? "" : "s"} have high estimated demand and weak brand visibility.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSortBy("opportunity")}>
              Prioritize opportunities
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
            <div className="relative w-full lg:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-prompts"
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              <Tabs value={selectedModel} onValueChange={setSelectedModel} className="w-auto">
                <TabsList className="h-9">
                  {modelFilters.map(m => (
                    <TabsTrigger key={m.id} value={m.id} className="text-xs px-3" data-testid={`filter-model-${m.id}`}>
                      {m.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="filter-category">
                    <Filter className="h-4 w-4" />
                    {selectedCategory === "All Categories" ? "All Categories" : selectedCategory}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {categoryFilters.map(cat => (
                    <DropdownMenuItem key={cat} onClick={() => setSelectedCategory(cat)}>
                      {cat === "All Categories" ? cat : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="gap-2"
                data-testid="btn-add-prompt"
                onClick={() => setShowAddPrompt(true)}
              >
                <Plus className="h-4 w-4" />
                Add Prompt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card" data-testid="card-prompts-table">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[350px]">Prompt Text</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Models</TableHead>
                <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy("visibility")}>
                  <span className={cn("flex items-center justify-center gap-1", sortBy === "visibility" && "text-primary font-bold")}>
                    Visibility {sortBy === "visibility" && "↓"}
                  </span>
                </TableHead>
                <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy("volume")}>
                  <span className={cn("flex items-center justify-center gap-1", sortBy === "volume" && "text-primary font-bold")}>
                    Volume {sortBy === "volume" && "↓"}
                  </span>
                </TableHead>
                <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy("opportunity")}>
                  <span className={cn("flex items-center justify-center gap-1", sortBy === "opportunity" && "text-primary font-bold")}>
                    Opportunity {sortBy === "opportunity" && "↓"}
                  </span>
                </TableHead>
                <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy("rank")}>
                  <span className={cn("flex items-center justify-center gap-1", sortBy === "rank" && "text-primary font-bold")}>
                    Avg Rank {sortBy === "rank" && "↑"}
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-primary" onClick={() => setSortBy("priority")}>
                  <span className={cn("flex items-center gap-1", sortBy === "priority" && "text-primary font-bold")}>
                    Priority {sortBy === "priority" && "↓"}
                  </span>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPrompts.map((prompt) => {
                const modelDisplayNames = Array.from(new Set(prompt.models.map(getModelDisplayName)));
                return (
                  <TableRow key={prompt.id} className="hover:bg-muted/50" data-testid={`row-prompt-${prompt.id}`}>
                    <TableCell className="font-medium">
                      <div className="line-clamp-2" title={prompt.text}>{prompt.text}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal capitalize">{prompt.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {modelDisplayNames.map((name) => (
                          <span
                            key={name}
                            className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", getModelColor(name))}
                            title={name}
                          >
                            {name}
                          </span>
                        ))}
                        {modelDisplayNames.length === 0 && (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                          "font-bold font-mono",
                          prompt.visibilityPct >= 70 ? "text-green-600" :
                          prompt.visibilityPct >= 40 ? "text-amber-500" : "text-red-500"
                        )}>
                          {prompt.visibilityPct}%
                        </span>
                        {prompt.proportionalVisibility && prompt.proportionalVisibility.length > 0 ? (
                          <div className="flex w-20 h-1.5 rounded-full overflow-hidden bg-muted">
                            {prompt.proportionalVisibility.slice(0, 4).map((v, idx) => (
                              <div
                                key={v.entity}
                                className={cn(
                                  "h-full",
                                  v.isBrand ? "bg-primary" :
                                  idx === 1 ? "bg-amber-500" :
                                  idx === 2 ? "bg-red-400" : "bg-gray-400"
                                )}
                                style={{ width: `${v.share}%` }}
                                title={`${v.entity}: ${v.share}%`}
                              />
                            ))}
                          </div>
                        ) : (
                          <Progress
                            value={prompt.visibilityPct}
                            className={cn(
                              "h-1 w-16",
                              prompt.visibilityPct >= 70 ? "[&>div]:bg-green-500" :
                              prompt.visibilityPct >= 40 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"
                            )}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-bold font-mono">{prompt.promptVolumeScore || 0}</span>
                        <span className="text-[10px] text-muted-foreground">{prompt.estimatedMonthlySearches || 0}/mo</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                          "font-bold font-mono",
                          (prompt.opportunityScore || 0) >= 60 ? "text-amber-600" :
                          (prompt.opportunityScore || 0) >= 35 ? "text-blue-600" : "text-muted-foreground"
                        )}>
                          {prompt.opportunityScore || 0}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">{prompt.intent || "research"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {prompt.avgRank > 0 ? (
                        <span className={cn(
                          "font-bold",
                          prompt.avgRank <= 2 ? "text-green-600" :
                          prompt.avgRank <= 4 ? "text-amber-500" : "text-red-500"
                        )}>
                          #{prompt.avgRank}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              prompt.priorityScore >= 70 ? "bg-primary" :
                              prompt.priorityScore >= 40 ? "bg-amber-500" : "bg-muted-foreground"
                            )}
                            style={{ width: `${prompt.priorityScore}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">{prompt.priorityScore}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(prompt.status)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredPrompts.length === 0 && prompts.length > 0 && (
            <EmptyState
              icon={Search}
              title="No prompts match your filters"
              description="Try adjusting your search query or filters to find what you're looking for."
              action={{
                label: "Clear Filters",
                onClick: () => {
                  setSearchQuery("");
                  setSelectedModel("all");
                  setSelectedCategory("All Categories");
                },
              }}
            />
          )}
          {prompts.length === 0 && (
            <EmptyState
              icon={MessageSquare}
              title="No prompts yet"
              description="Get started by adding your first prompt to track how your brand appears in AI responses."
              action={{
                label: "Add Your First Prompt",
                onClick: () => setShowAddPrompt(true),
                icon: Plus,
              }}
            />
          )}
        </CardContent>
      </Card>

      <AddPromptDialog
        brandId={brandId || ""}
        open={showAddPrompt}
        onOpenChange={setShowAddPrompt}
        onSuccess={handlePromptAdded}
      />
    </div>
  );
}
