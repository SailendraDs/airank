// client/src/pages/admin/brand-detail/PromptRunsTab.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight, Eye, EyeOff, Bot } from "lucide-react";
import { format } from "date-fns";

interface PromptRunsTabProps { brandId: string; }

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  negative: "bg-red-100 text-red-800",
};

function AnswerRow({ answer }: { answer: any }) {
  const [showResponse, setShowResponse] = useState(false);
  const brandMentions = answer.mentions?.filter((m: any) => !m.isCompetitor) ?? [];
  const competitorMentions = answer.mentions?.filter((m: any) => m.isCompetitor) ?? [];

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium flex-1 min-w-0 truncate" title={answer.promptText}>
          {answer.promptText}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-xs font-mono">{answer.llmProvider}</Badge>
          <Badge variant="outline" className="text-xs font-mono">{answer.llmModel}</Badge>
          {answer.citationCount > 0 && <Badge variant="secondary" className="text-xs">{answer.citationCount} citations</Badge>}
        </div>
      </div>

      {brandMentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brandMentions.map((m: any, i: number) => (
            <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${SENTIMENT_COLORS[m.sentiment] ?? "bg-muted"}`}>
              #{m.position ?? "?"} · {m.sentiment ?? "neutral"}
            </span>
          ))}
        </div>
      )}

      {competitorMentions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Competitors cited: {competitorMentions.map((m: any) => m.entityName).filter(Boolean).join(", ")}
        </p>
      )}

      {brandMentions.length === 0 && competitorMentions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Brand not mentioned in this response.</p>
      )}

      <div>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowResponse(v => !v)}>
          {showResponse ? <><EyeOff className="h-3 w-3 mr-1" /> Hide response</> : <><Eye className="h-3 w-3 mr-1" /> Show full response</>}
        </Button>
        {showResponse && (
          <pre className="mt-2 text-xs bg-muted rounded p-3 whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
            {answer.rawResponse}
          </pre>
        )}
      </div>
    </div>
  );
}

function RunGroup({ group }: { group: any }) {
  const [expanded, setExpanded] = useState(false);
  const brandMentionCount = group.answers.reduce(
    (sum: number, a: any) => sum + (a.mentions?.filter((m: any) => !m.isCompetitor).length ?? 0), 0
  );
  const mentionRate = group.answers.length > 0
    ? Math.round((group.answers.filter((a: any) => a.mentions?.some((m: any) => !m.isCompetitor)).length / group.answers.length) * 100)
    : 0;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="text-sm">{format(new Date(group.date), "EEEE, MMMM d yyyy")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{group.answers.length} prompts</Badge>
            <Badge variant="secondary" className="text-xs">{mentionRate}% mention rate</Badge>
            {brandMentionCount > 0 && <Badge className="text-xs bg-primary/20 text-primary">{brandMentionCount} brand mentions</Badge>}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2 pt-0">
          {group.answers.map((answer: any) => (
            <AnswerRow key={answer.answerId} answer={answer} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function PromptRunsTab({ brandId }: PromptRunsTabProps) {
  const { data: groups = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/brands", brandId, "prompt-runs"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandId}/prompt-runs?limit=300`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load prompt runs");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (groups.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No prompt runs yet. Trigger an analysis to see outputs here.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{groups.length} run dates · click a date to expand</p>
      {groups.map(group => <RunGroup key={group.date} group={group} />)}
    </div>
  );
}
