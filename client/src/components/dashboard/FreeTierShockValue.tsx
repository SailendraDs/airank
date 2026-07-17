// Tier S6 — Free-tier "shock value" banner.
//
// Rendered on the Dashboard for free-tier users only. Dramatises the gap
// between what the user sees today and what they could see on Growth —
// using real per-brand data (LLM sampling coverage, prompt count, etc.)
// so the headline hits personally.

import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Eye, Bot, Clock, Target, MessageSquare, Sparkles, Lock, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getShockValue } from "@/lib/api";

interface ShockValue {
  tier: string;
  isFree: boolean;
  current: {
    prompts: number;
    competitors: number;
    monthlyRuns: number;
    monthlyMentions: number;
    providersCovered: number;
  };
  freeAllowed: {
    prompts: number;
    competitors: number;
    queriesPerDay: number;
    llmProviders: number;
    cadence: string;
  };
  growthAllows: {
    prompts: number;
    competitors: number;
    queriesPerDay: number;
    llmProviders: number;
    cadence: string;
  };
  headline: { id: string; stat: string; message: string; icon: string };
  comparisons: Array<{ id: string; stat: string; message: string; icon: string }>;
  delta: {
    prompts: number;
    competitors: number;
    lockedProviders: number;
    dailyExtraRuns: number;
  };
}

const ICON_MAP: Record<string, any> = {
  eye: Eye,
  bot: Bot,
  clock: Clock,
  target: Target,
  message: MessageSquare,
};

async function fetchShockValue(brandId: string): Promise<ShockValue> {
  return getShockValue(brandId) as Promise<ShockValue>;
}

export function FreeTierShockValue({ brandId, brandTier }: { brandId: string; brandTier?: string }) {
  const isFree = brandTier === 'free' || !brandTier;
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shockValue', brandId],
    queryFn: () => fetchShockValue(brandId),
    enabled: !!brandId && isFree,
    refetchInterval: 60_000,
  });

  if (!isFree || dismissed) return null;
  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-amber-500/5 p-4 animate-pulse">
        <div className="h-4 bg-amber-500/10 rounded w-1/2 mb-2" />
        <div className="h-3 bg-amber-500/10 rounded w-3/4" />
      </div>
    );
  }

  // Pick the most dramatic stat — largest "x more" multiplier
  const sorted = [...data.comparisons].sort((a, b) => {
    const aNum = parseFloat(a.stat.split(' vs ')[1] ?? '0');
    const aBase = parseFloat(a.stat.split(' vs ')[0] ?? '0');
    const aMultiple = aBase > 0 ? aNum / aBase : aNum;
    const bNum = parseFloat(b.stat.split(' vs ')[1] ?? '0');
    const bBase = parseFloat(b.stat.split(' vs ')[0] ?? '0');
    const bMultiple = bBase > 0 ? bNum / bBase : bNum;
    return bMultiple - aMultiple;
  });
  const lead = sorted[0] ?? data.headline;
  const LeadIcon = ICON_MAP[lead.icon] ?? Sparkles;

  // Coverage percentages for the visual "what you're missing" bars
  const promptPct = Math.min(100, (data.current.prompts / data.growthAllows.prompts) * 100);
  const compPct = Math.min(100, (data.current.competitors / data.growthAllows.competitors) * 100);
  const providerPct = Math.min(100, (data.current.providersCovered / 6) * 100);

  return (
    <Card
      className="relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] via-background to-orange-500/[0.05]"
      data-testid="card-shock-value"
    >
      <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/15 border border-amber-500/30">
              <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 font-semibold">
              Free plan · what you're missing
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
            data-testid="btn-dismiss-shock"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Lead statistic */}
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
            <LeadIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="metric-shock-stat">
              {lead.stat}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{lead.message}</p>
          </div>
        </div>

        {/* Coverage bars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <CoverageBar
            label="Prompts tracked"
            current={data.current.prompts}
            max={data.growthAllows.prompts}
            pct={promptPct}
            icon={MessageSquare}
          />
          <CoverageBar
            label="Competitors"
            current={data.current.competitors}
            max={data.growthAllows.competitors}
            pct={compPct}
            icon={Target}
          />
          <CoverageBar
            label="LLM providers"
            current={data.current.providersCovered}
            max={6}
            pct={providerPct}
            icon={Bot}
          />
        </div>

        {/* Inline shock list — the rest of the comparisons */}
        <div className="space-y-1.5 mb-4">
          {sorted.slice(1, 3).map((c) => {
            const Icon = ICON_MAP[c.icon] ?? Sparkles;
            return (
              <div key={c.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Icon className="h-3 w-3 mt-0.5 text-amber-600/70 dark:text-amber-400/70 shrink-0" />
                <span>{c.message}</span>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-amber-500/20">
          <Link href="/app/settings?tab=billing">
            <Button size="sm" className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0" data-testid="btn-shock-upgrade">
              <Sparkles className="h-3.5 w-3.5" />
              See what Growth unlocks
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300 border-amber-500/30">
                  +{data.delta.dailyExtraRuns} runs/day
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Daily sampling you would get on Growth vs monthly on Free</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300 border-amber-500/30">
                  +{data.delta.lockedProviders} LLMs unlocked
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Growth samples all 6 major LLMs; Free is limited to ChatGPT</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

function CoverageBar({
  label,
  current,
  max,
  pct,
  icon: Icon,
}: {
  label: string;
  current: number;
  max: number;
  pct: number;
  icon: any;
}) {
  return (
    <div className="rounded-lg bg-background/60 border border-amber-500/20 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <span className="text-[10px] font-mono font-semibold">
          <span className="text-foreground">{current}</span>
          <span className="text-muted-foreground">/{max}</span>
        </span>
      </div>
      <Progress value={pct} className="h-1.5 bg-amber-500/10" />
    </div>
  );
}
