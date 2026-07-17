// client/src/pages/admin/brand-detail/GapAnalysisTab.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, TrendingDown, AlertCircle, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GapAnalysisTabProps { brandId: string; }

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

export default function GapAnalysisTab({ brandId }: GapAnalysisTabProps) {
  const { toast } = useToast();

  const { data: context, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/brands", brandId, "context"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/context`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load context");
      return res.json();
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/trigger-gap-analysis`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Gap analysis queued", description: "Results will appear once the job completes. Refresh this tab to see updated data." });
    },
    onError: (e: any) => toast({ title: "Failed to queue", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const gapData = (context?.contentRecommendations as any)?.gapAnalysis ?? context?.gapAnalysis ?? null;
  const gaps = gapData?.gaps ?? null;
  const gapScore = gapData?.gapScore ?? null;
  const recommendations: any[] = gapData?.recommendations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {gapData?.lastAnalyzed
            ? <>Last analyzed: {new Date(gapData.lastAnalyzed).toLocaleDateString()} &nbsp;·&nbsp; Period: {gapData.period ?? "—"}</>
            : "No gap analysis data yet."}
        </div>
        <Button size="sm" variant="outline" onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
          {triggerMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run Analysis
        </Button>
      </div>

      {!gapData ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No gap analysis data. Click "Run Analysis" to generate.</p>
        </div>
      ) : (
        <>
          {/* Gap Score Summary */}
          {gapScore && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Missing Mentions", value: gapScore.missingMentionsCount ?? 0, color: "text-red-500" },
                { label: "Competitor Advantages", value: gapScore.competitorAdvantagesCount ?? 0, color: "text-amber-500" },
                { label: "Low Rankings", value: gapScore.lowRankingsCount ?? 0, color: "text-yellow-500" },
                { label: "Overall Gap Score", value: `${gapScore.overallGapScore ?? 0}/100`, color: "text-primary" },
              ].map(m => (
                <Card key={m.label}>
                  <CardContent className="pt-4 text-center">
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Gap Details */}
          {gaps && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Gap Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {gaps.missingMentions?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Missing Mentions ({gaps.missingMentions.length})</p>
                    <div className="space-y-1">
                      {gaps.missingMentions.slice(0, 5).map((g: any, i: number) => (
                        <div key={i} className="text-sm flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                          <span className="truncate">{g.promptText ?? g.topic ?? JSON.stringify(g)}</span>
                        </div>
                      ))}
                      {gaps.missingMentions.length > 5 && <p className="text-xs text-muted-foreground">+{gaps.missingMentions.length - 5} more</p>}
                    </div>
                  </div>
                )}
                {gaps.competitorAdvantages?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Competitor Advantages ({gaps.competitorAdvantages.length})</p>
                    <div className="space-y-1">
                      {gaps.competitorAdvantages.slice(0, 5).map((g: any, i: number) => (
                        <div key={i} className="text-sm flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="truncate">{g.competitor ?? g.topic ?? JSON.stringify(g)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Recommendations ({recommendations.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {recommendations.map((rec: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_COLORS[rec.priority] ?? "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{rec.title}</p>
                        <Badge variant="outline" className="text-xs capitalize">{rec.priority}</Badge>
                        <Badge variant="secondary" className="text-xs">{rec.type?.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
