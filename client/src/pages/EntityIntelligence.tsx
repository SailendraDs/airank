// Entity Intelligence Hub — Tier S7
//
// "GEO is entity building." This page is the canonical view of how
// established the brand is as a real-world entity across the surfaces AI
// systems trust: Wikidata, website metadata, the citation graph, and the LLMs
// themselves. The Entity Score is a 0-100 composite of five pillars
// (Wikidata, website metadata, description, LLM coverage, citation footprint),
// each with an earned/max and a one-line human reason.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentBrand } from "@/hooks/use-brand";
import { getEntityProfile, refreshEntityProfile } from "@/lib/api";
import {
  Database, FileCheck, FileSearch, Link2, Quote, RefreshCw, Sparkles, ShieldCheck,
  TrendingUp, AlertCircle, CheckCircle2, Network, BarChart3, ArrowRight, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ALL_PROVIDERS = [
  { id: "openai", name: "ChatGPT" },
  { id: "anthropic", name: "Claude" },
  { id: "google", name: "Gemini" },
  { id: "perplexity", name: "Perplexity" },
  { id: "grok", name: "Grok" },
  { id: "deepseek", name: "DeepSeek" },
];

function sanitizeMetadataPreview(value: any) {
  return JSON.stringify(value, (_key, fieldValue) => {
    if (typeof fieldValue !== "string") return fieldValue;
    if (/(context\.dev|brand\.dev|context_dev|brand_dev|BrandDev|ContextDev)/i.test(fieldValue)) {
      return "[retired enrichment asset removed]";
    }
    return fieldValue;
  }, 2);
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Strong entity";
  if (score >= 60) return "Building";
  if (score >= 40) return "Thin";
  if (score > 0) return "Weak";
  return "Unknown";
}

export default function EntityIntelligence() {
  const { brandId } = useCurrentBrand();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['entity', brandId],
    queryFn: () => getEntityProfile(brandId ?? '') as Promise<any>,
    enabled: !!brandId,
    refetchInterval: 5 * 60_000,
  });

  const onRefresh = async () => {
    if (!brandId) return;
    setRefreshing(true);
    try {
      await refreshEntityProfile(brandId);
      qc.invalidateQueries({ queryKey: ['entity', brandId] });
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      setTimeout(() => setRefreshing(false), 4000);
    }
  };

  if (!brandId) {
    return (
      <div className="p-8 text-center text-muted-foreground">Select or create a brand first.</div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-64 bg-muted/30 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">No entity data yet.</div>;
  }

  const score: number = data.entityScore ?? 0;
  const components: any[] = data.components ?? [];
  const kg: any = data.kg;
  const brand: any = data.brand;
  const mindMap: any = data.mindMap ?? { byProvider: {}, totalAnswers: 0 };
  const citations: any = data.citations ?? { count: 0, sources: [] };
  const prompts: any = data.prompts ?? { total: 0, highIntent: 0 };

  return (
    <div className="p-6 space-y-6 min-w-0 overflow-hidden" data-testid="page-entity-intelligence">
      {/* HERO: Entity Score */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] via-background to-violet-500/[0.03] overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between min-w-0">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="relative shrink-0">
                <svg className="h-20 w-20 sm:h-24 sm:w-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" className="stroke-muted/40" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    className={cn("transition-all duration-700", score >= 60 ? "stroke-emerald-500" : "stroke-amber-500")}
                    strokeWidth="8"
                    strokeDasharray={`${(score / 100) * 264} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn("text-3xl font-bold tabular-nums", scoreColor(score))} data-testid="metric-entity-score">
                    {score}
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Database className="h-4 w-4 text-primary" />
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Entity Score</p>
                </div>
                <h1 className="text-2xl font-bold tracking-tight truncate">{brand.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {brand.domain} · {brand.industry ?? 'industry unset'} ·{" "}
                  <span className={cn("font-medium", scoreColor(score))}>{scoreLabel(score)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-md">
                  How strongly this brand exists as a real-world entity across Wikidata, website metadata, and the LLMs themselves.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={onRefresh} disabled={refreshing} className="gap-1.5" data-testid="btn-refresh-entity">
                      <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                      {refreshing ? 'Refreshing…' : 'Refresh entity data'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Re-run website metadata, Wikidata, and KG enrichment</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Prompts" value={prompts.total} icon={FileSearch} />
                <Stat label="High-intent" value={prompts.highIntent} icon={TrendingUp} />
                <Stat label="Citations" value={citations.count} icon={Quote} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5 PILLARS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 min-w-0">
        {components.map((c: any) => {
          const pct = c.max ? Math.round((c.earned / c.max) * 100) : 0;
          const Icon = c.key === 'wikidata' ? Database
            : (c.key === 'metadata' || c.key === 'brandDev') ? ShieldCheck
            : c.key === 'description' ? FileCheck
            : c.key === 'llmCoverage' ? Network
            : c.key === 'citations' ? Quote
            : Sparkles;
          return (
            <Card key={c.key} className="overflow-hidden min-w-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-mono text-right">{c.earned}/{c.max}</span>
                </div>
                <p className="text-xs font-medium capitalize mb-1 truncate">{(c.key === 'metadata' || c.key === 'brandDev') ? 'Website metadata' : c.key === 'llmCoverage' ? 'LLM coverage' : c.key}</p>
                <Progress value={pct} className="h-1.5 mb-2" />
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{c.reason}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* WIKIDATA CARD */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Wikidata
                </CardTitle>
                <CardDescription>Canonical entity in the open knowledge graph</CardDescription>
              </div>
              {kg ? (
                kg.wikidataId ? (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Q-{kg.wikidataId}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Missing
                  </Badge>
                )
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {kg ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>Completeness</span>
                    <span className="font-mono">{Math.round(kg.completenessScore ?? 0)}%</span>
                  </div>
                  <Progress value={kg.completenessScore ?? 0} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-muted-foreground text-[10px]">Sitelinks</p>
                    <p className="font-mono font-semibold">{kg.sitelinkCount ?? 0}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-muted-foreground text-[10px]">Existing claims</p>
                    <p className="font-mono font-semibold">{(kg.existingClaims ?? []).length}</p>
                  </div>
                </div>
                {kg.missingClaims && kg.missingClaims.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Missing claims</p>
                    <div className="flex flex-wrap gap-1">
                      {kg.missingClaims.slice(0, 6).map((m: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {m.property ?? m.label ?? JSON.stringify(m).slice(0, 24)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {kg.lastCheckedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Last checked {new Date(kg.lastCheckedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No Wikidata entity yet. Get one to anchor your brand in the open knowledge graph.</p>
                <Button onClick={onRefresh} variant="outline" size="sm" disabled={refreshing}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
                  Discover &amp; create
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LLM MIND MAP */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4" />
              LLM mind map
            </CardTitle>
            <CardDescription>Where each AI sees your brand vs. doesn't</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {ALL_PROVIDERS.map(p => {
                const stat = mindMap.byProvider?.[p.id] ?? { mentioned: 0, totalAnswers: 0 };
                const rate = stat.totalAnswers > 0 ? (stat.mentioned / stat.totalAnswers) * 100 : 0;
                return (
                  <div key={p.id} className="rounded-lg border bg-card p-2.5" data-testid={`mindmap-${p.id}`}>
                    <p className="text-xs font-medium">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={rate} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-mono text-muted-foreground">{Math.round(rate)}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{stat.mentioned} / {stat.totalAnswers} answers</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* CITATIONS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Quote className="h-4 w-4" />
              Citation footprint
            </CardTitle>
            <CardDescription>External sources LLMs use to describe your brand</CardDescription>
          </CardHeader>
          <CardContent>
            {citations.sources.length > 0 ? (
              <div className="space-y-1.5">
                {citations.sources.slice(0, 6).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{s.domain || 'unknown'}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{s.type}</Badge>
                  </div>
                ))}
                {citations.count > 6 && (
                  <p className="text-[10px] text-muted-foreground pt-1">+{citations.count - 6} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No citation sources yet. Encourage mentions on Wikipedia, G2, Crunchbase, and your own .com about page.</p>
            )}
          </CardContent>
        </Card>

        {/* KG RECOMMENDATIONS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Top actions to strengthen your entity
            </CardTitle>
            <CardDescription>High-leverage moves ranked by impact</CardDescription>
          </CardHeader>
          <CardContent>
            {kg?.recommendations && kg.recommendations.length > 0 ? (
              <div className="space-y-2">
                {kg.recommendations.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 text-primary font-mono text-[10px] px-1.5 py-0.5 mt-0.5">{r.priority ?? 'med'}</span>
                    <span className="flex-1">{r.action ?? r.description ?? JSON.stringify(r)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Generic playbook:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Get a Wikidata entry (Q-ID) — anchors the brand in the open knowledge graph.</li>
                  <li>Publish a structured About page on your .com with schema.org Organization markup.</li>
                  <li>Seed brand mentions on Wikipedia-notable sources: Crunchbase, G2, GitHub, news.</li>
                  <li>Run website metadata enrichment to attach canonical logo, social, and description.</li>
                  <li>Track the brand on all 6 major LLMs (not just ChatGPT) for full coverage.</li>
                </ol>
              </div>
            )}
            <Link href="/app/action-plan">
              <Button variant="link" size="sm" className="mt-2 px-0 h-auto">
                See full action plan <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Website metadata */}
      {(data.metadata || data.brandDev) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Website metadata profile
            </CardTitle>
            <CardDescription>Auto-attached metadata from the brand site and public enrichment sources</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-[10px] bg-muted/40 p-3 rounded-md overflow-auto max-h-48 text-muted-foreground">
              {sanitizeMetadataPreview(data.metadata || data.brandDev).slice(0, 1200)}
            </pre>
          </CardContent>
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground text-center pt-4">
        Generated {new Date(data.generatedAt ?? Date.now()).toLocaleString()} · Entity data refreshes every 5 minutes
      </p>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <div className="rounded-md border bg-card/50 px-2 py-1.5">
      <Icon className="h-3 w-3 text-muted-foreground mx-auto" />
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
