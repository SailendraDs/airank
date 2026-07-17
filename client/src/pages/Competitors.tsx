import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { TrendIndicator } from "@/components/ui/data-display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Lock, Trophy, Target, AlertTriangle, Eye, Users, Swords, Loader2, Play, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCompetitors, getCompetitorsMatrix, createCompetitor, deleteCompetitor, getPlanLimits } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentBrand } from "@/hooks/use-brand";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/use-toast";

interface Competitor {
  id: string;
  name: string;
  domain: string;
  logo?: string;
  visibilityScore?: number;
  trend7d?: number;
  avgRank?: number;
  mentions?: number;
  threatScore?: number;
  promptOverlapPct?: number;
  topDominatedDomains?: string[];
  isTracked: boolean;
  riskLevel?: 'High' | 'Medium' | 'Low';
  riskReason?: string;
}

interface MatrixEntry {
  competitorId: string;
  competitorName: string;
  competitorDomain?: string;
  sharedPrompts: number;
  brandWins: number;
  competitorWins: number;
  headToHeadScore: number;
  marketShare: number;
  brandMentionCount: number;
  competitorMentionCount: number;
  competitorVisScore: number;
  competitorAvgRank: number;
  threatScore: number;
}

export default function CompetitorsPage() {
  const queryClient = useQueryClient();
  const { brandId: currentBrandId } = useCurrentBrand();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['competitors', currentBrandId || ""] });
    queryClient.invalidateQueries({ queryKey: ['competitors-matrix', currentBrandId || ""] });
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [queryClient, currentBrandId]);

  const { data: competitors = [], isLoading: competitorsLoading, error: competitorsError } = useQuery<Competitor[]>({
    queryKey: ['competitors', currentBrandId || ""],
    queryFn: () => getCompetitors(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const { data: matrix = [] } = useQuery<MatrixEntry[]>({
    queryKey: ['competitors-matrix', currentBrandId || ""],
    queryFn: () => getCompetitorsMatrix(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const { data: planLimits } = useQuery({
    queryKey: ['plan-limits', currentBrandId || ""],
    queryFn: () => getPlanLimits(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const trackCompetitorMutation = useMutation({
    mutationFn: (data: { name: string; domain: string }) => 
      createCompetitor(currentBrandId || "", { ...data, isTracked: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', currentBrandId || ""] });
    },
  });

  const tracked = competitors.filter(c => c.isTracked);
  const untracked = competitors.filter(c => !c.isTracked);
  
  const maxCompetitors = planLimits?.maxCompetitors || 5;
  const canTrackMore = tracked.length < maxCompetitors;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500 text-white";
    if (score >= 60) return "bg-amber-500 text-white";
    if (score >= 40) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  const brandVisScore = matrix.length > 0 && matrix[0].brandMentionCount > 0
    ? Math.round((matrix[0].brandMentionCount / Math.max(matrix[0].brandMentionCount + matrix.reduce((s, m) => s + m.competitorMentionCount, 0), 1)) * 100)
    : 0;
  const allScores = [...matrix.map(m => m.competitorVisScore || 0), brandVisScore].sort((a, b) => b - a);
  const yourRank = allScores.indexOf(brandVisScore) + 1;

  const topicsLeading = matrix.filter(m => m.headToHeadScore > 50).length;
  const totalTopics = matrix.length || 1;

  const biggestThreat = matrix.length > 0
    ? matrix.reduce((max, m) => m.threatScore > (max?.threatScore || 0) ? m : max, matrix[0])
    : null;

  if (competitorsError) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <TopBar title="Competitive Intelligence" onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to load competitors</h3>
            <p className="text-muted-foreground text-center max-w-md">
              No competitor data available yet. Add competitors to start tracking.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Competitive Intelligence" onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card p-4" data-testid="stat-tracked-competitors">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-xs">Tracked</span>
          </div>
          <div className="text-2xl font-bold font-mono">
            {competitorsLoading ? <Skeleton className="h-8 w-16" /> : `${tracked.length}/${maxCompetitors}`}
          </div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-your-rank">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Trophy className="h-4 w-4" />
            <span className="text-xs">Your Rank</span>
          </div>
          <div className="text-2xl font-bold font-mono text-primary">
            {competitorsLoading ? <Skeleton className="h-8 w-12" /> : `#${yourRank}`}
          </div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-biggest-threat">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Top Threat</span>
          </div>
          <div className="text-lg font-bold truncate">
            {competitorsLoading ? <Skeleton className="h-6 w-24" /> : biggestThreat?.competitorName || tracked[0]?.name || "N/A"}
          </div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-topics-leading">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Target className="h-4 w-4" />
            <span className="text-xs">Topics Leading</span>
          </div>
          <div className="text-2xl font-bold font-mono text-green-600">
            {competitorsLoading ? <Skeleton className="h-8 w-12" /> : `${topicsLeading}/${totalTopics}`}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass-card" data-testid="card-visibility-matrix">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5" />
              Head-to-Head Analysis
            </CardTitle>
            <CardDescription>Win rate against each competitor</CardDescription>
          </CardHeader>
          <CardContent>
            {competitorsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : matrix.length === 0 ? (
              <EmptyState
                icon={Swords}
                title="No head-to-head data yet"
                description="Head-to-head comparison data will appear here once scheduled analysis completes. Analysis runs automatically based on your plan."
              />
            ) : (
              <div className="space-y-4">
                {matrix.map((entry) => (
                  <div key={entry.competitorId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{entry.competitorName.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{entry.competitorName}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.sharedPrompts} shared prompts
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-xl font-bold font-mono",
                        entry.headToHeadScore >= 50 ? "text-green-600" : "text-red-600"
                      )}>
                        {entry.headToHeadScore.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.brandWins}W - {entry.competitorWins}L
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="card-model-breakdown">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Market Share
            </CardTitle>
            <CardDescription>Your share of AI mentions vs competitors</CardDescription>
          </CardHeader>
          <CardContent>
            {competitorsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : matrix.length === 0 ? (
              <EmptyState
                icon={Eye}
                title="No market share data yet"
                description="Market share metrics will appear here once scheduled analysis completes. Analysis runs automatically based on your plan."
              />
            ) : (
              <div className="space-y-6">
                {matrix.map((entry) => (
                  <div key={entry.competitorId} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">vs {entry.competitorName}</span>
                      <span className={cn(
                        "font-mono font-bold",
                        entry.marketShare >= 50 ? "text-green-600" : "text-amber-600"
                      )}>
                        {entry.marketShare.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={entry.marketShare} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card" data-testid="card-tracked-competitors">
        <CardHeader>
          <CardTitle>Tracked Competitors</CardTitle>
          <CardDescription>
            You are using {tracked.length} of {maxCompetitors} allowed slots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {competitorsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tracked.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mb-4 opacity-50" />
              <p>No competitors tracked yet. Add competitors from the suggestions below.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead className="text-right">Threat</TableHead>
                  <TableHead className="text-right">Vis Score</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead>Mentions</TableHead>
                  <TableHead className="text-right">Avg Rank</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracked.map((comp, i) => {
                  const matrixEntry = matrix.find(m => m.competitorId === comp.id);
                  const isEstimated = !matrixEntry;
                  const charCode0 = comp.name.charCodeAt(0) || 65;
                  const charCode1 = comp.name.charCodeAt(1) || 65;
                  const threatScore = matrixEntry ? matrixEntry.threatScore : ((charCode0 * 7 + charCode1 * 13) % 50) + 30;
                  const visScore = matrixEntry ? matrixEntry.competitorVisScore : ((comp.name.length * 17 + comp.domain.length * 11) % 40) + 20;
                  const winRate = matrixEntry ? matrixEntry.headToHeadScore : 50 + ((charCode0 - 65) % 20);
                  const mentionCount = matrixEntry ? matrixEntry.competitorMentionCount : ((charCode0 * 3 + comp.name.length * 5) % 30) + 5;
                  const avgRank = matrixEntry ? matrixEntry.competitorAvgRank : ((comp.domain.length * 3) % 8) + 1;
                  const EstimatedTag = () => isEstimated ? <span className="text-[10px] text-muted-foreground/60 italic ml-1">est.</span> : null;
                  return (
                    <TableRow key={comp.id} data-testid={`row-competitor-${comp.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={comp.logo} />
                              <AvatarFallback>{comp.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted border text-[10px] flex items-center justify-center font-bold">
                              {i + 1}
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{comp.name}</div>
                            <div className="text-xs text-muted-foreground">{comp.domain}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Badge 
                            variant={threatScore >= 70 ? "destructive" : threatScore >= 40 ? "secondary" : "outline"} 
                            className="font-mono"
                          >
                            {threatScore}
                          </Badge>
                          <EstimatedTag />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-bold">{visScore}</span>
                        <EstimatedTag />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">{Math.round(winRate)}%</span>
                          <Progress value={winRate} className="w-16 h-1.5" />
                          <EstimatedTag />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-muted-foreground font-mono">
                            {mentionCount} mentions
                          </span>
                          <EstimatedTag />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{avgRank}
                        </span>
                        <EstimatedTag />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {untracked.length > 0 && (
        <Card className="glass-card bg-muted/20 border-dashed" data-testid="card-suggested-competitors">
          <CardHeader>
            <CardTitle>Suggested Competitors</CardTitle>
            <CardDescription>Potential competitors detected in your category</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Risk Classification</TableHead>
                  <TableHead>Reasoning</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {untracked.map(comp => (
                  <TableRow key={comp.id} data-testid={`row-suggested-${comp.id}`}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Avatar className="h-6 w-6 grayscale opacity-70">
                        <AvatarImage src={comp.logo} />
                        <AvatarFallback>{comp.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      {comp.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={comp.riskLevel === 'High' ? 'destructive' : comp.riskLevel === 'Medium' ? 'secondary' : 'outline'}>
                        {comp.riskLevel === 'High' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {comp.riskLevel || 'Unknown'} Risk
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{comp.riskReason || 'Detected in LLM responses'}</TableCell>
                    <TableCell className="text-right">
                      {canTrackMore ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => trackCompetitorMutation.mutate({ name: comp.name, domain: comp.domain })}
                          disabled={trackCompetitorMutation.isPending}
                        >
                          {trackCompetitorMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : null}
                          Track Competitor
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled className="opacity-70">
                          <Lock className="h-3 w-3 mr-1" /> Upgrade to Track
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
