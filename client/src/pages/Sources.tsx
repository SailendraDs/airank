import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TopBar } from "@/components/layout/TopBar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useState, useCallback, useMemo } from "react";
import { ExternalLink, Globe, AlertCircle, Link2, ShieldCheck, Target } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCitationOpportunityTask, getCitationOpportunities, getSources, getSourceDomains, getSourceRecommendations } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentBrand } from "@/hooks/use-brand";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/use-toast";

interface Source {
  id: string;
  domain: string;
  url?: string;
  title?: string;
  citationCount?: number;
  mentions?: number;
  llmProvider?: string;
  modelsCited?: string[];
  lastSeenAt?: string;
  lastSeen?: string;
  authority?: number;
  domainAuthority?: number;
  citationType?: string;
  sourceType?: string;
  isBrandAbsent?: boolean;
}

interface DomainStats {
  domain: string;
  totalCitations: number;
  uniquePages: number;
  models: string[];
  lastSeen: string;
}

interface SourceRecommendation {
  domain: string;
  actionability: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  impactScore: number;
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function SourcesPage() {
  const { brandId: currentBrandId } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['sources', currentBrandId || ""] });
    queryClient.invalidateQueries({ queryKey: ['source-domains', currentBrandId || ""] });
    queryClient.invalidateQueries({ queryKey: ['source-recommendations', currentBrandId || ""] });
    queryClient.invalidateQueries({ queryKey: ['citation-opportunities', currentBrandId || ""] });
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [queryClient, currentBrandId]);

  const { data: sources = [], isLoading: sourcesLoading, error: sourcesError } = useQuery({
    queryKey: ['sources', currentBrandId || ""],
    queryFn: () => getSources(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ['source-domains', currentBrandId || ""],
    queryFn: () => getSourceDomains(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const { data: recommendations = [] } = useQuery<SourceRecommendation[]>({
    queryKey: ['source-recommendations', currentBrandId || ""],
    queryFn: () => getSourceRecommendations(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });
  const { data: citationOpportunities } = useQuery<any>({
    queryKey: ['citation-opportunities', currentBrandId || ""],
    queryFn: () => getCitationOpportunities(currentBrandId || ""),
    retry: 1,
    enabled: !!currentBrandId,
  });

  const citationTaskMutation = useMutation({
    mutationFn: (sourceId: string) => createCitationOpportunityTask(currentBrandId || "", sourceId),
    onSuccess: async (result: any) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['citation-opportunities', currentBrandId || ""] }),
        queryClient.invalidateQueries({ queryKey: ["action-workflow", currentBrandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", currentBrandId, "optimizations"] }),
        queryClient.invalidateQueries({ queryKey: ["command-center", currentBrandId, "competitive-parity"] }),
      ]);
      toast({
        title: result?.created ? "Citation task added" : "Already in workflow",
        description: result?.message || "Open Action Workflow to track the source acquisition work.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not add citation task", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = sourcesLoading || domainsLoading;

  // If we have domain stats, use those; otherwise aggregate from sources
  const displayData = domains.length > 0 ? domains : aggregateSources(sources);
  const urlIntelligence = useMemo(() => {
    return [...sources]
      .map((source: Source) => {
        const citations = source.citationCount || source.mentions || 0;
        const authority = source.authority ?? source.domainAuthority ?? 0;
        const models = source.modelsCited || (source.llmProvider ? [source.llmProvider] : []);
        const citationType = source.citationType || (source.isBrandAbsent ? "opportunity" : "earned");
        let action = "Monitor";
        if (citationType === "owned") action = "Strengthen owned page";
        else if (source.isBrandAbsent) action = "Pitch inclusion";
        else if (authority >= 60 && citations >= 3) action = "Replicate proof";
        else if (citations <= 1) action = "Build citation depth";
        return {
          ...source,
          citations,
          authority,
          models,
          citationType,
          action,
          opportunityScore: Math.min(100, Math.round((authority * 0.45) + (citations * 8) + (models.length * 8) + (source.isBrandAbsent ? 20 : 0))),
        };
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 25);
  }, [sources]);

  const sourceStats = useMemo(() => {
    const citedUrls = sources.filter((source: Source) => source.url).length;
    const ownedSources = sources.filter((source: Source) => source.citationType === "owned").length;
    const opportunityUrls = urlIntelligence.filter((source) => source.isBrandAbsent || source.action !== "Monitor").length;
    const modelSet = new Set<string>();
    sources.forEach((source: Source) => (source.modelsCited || (source.llmProvider ? [source.llmProvider] : [])).forEach((model) => modelSet.add(model)));
    return {
      citedUrls,
      ownedSources,
      opportunityUrls,
      modelCount: modelSet.size,
    };
  }, [sources, urlIntelligence]);

  const sourceInfluenceMatrix = useMemo(() => {
    const sourceRows = urlIntelligence.length ? urlIntelligence : sources.map((source: Source) => {
      const models = source.modelsCited || (source.llmProvider ? [source.llmProvider] : []);
      return {
        ...source,
        citations: source.citationCount || source.mentions || 0,
        authority: source.authority ?? source.domainAuthority ?? 0,
        models,
        citationType: source.citationType || (source.isBrandAbsent ? "opportunity" : "earned"),
        action: source.isBrandAbsent ? "Pitch inclusion" : "Monitor",
        opportunityScore: 0,
      };
    });
    const modelSet = new Set<string>();
    sourceRows.forEach((source: any) => (source.models || []).forEach((model: string) => modelSet.add(model)));
    const owned = sourceRows.filter((source: any) => source.citationType === "owned").length;
    const earned = sourceRows.filter((source: any) => source.citationType === "earned").length;
    const opportunities = sourceRows.filter((source: any) => source.isBrandAbsent || source.citationType === "opportunity" || source.action !== "Monitor").length;
    const authoritySources = sourceRows.filter((source: any) => numberValue(source.authority) >= 60).length;
    const multiModelSources = sourceRows.filter((source: any) => (source.models || []).length >= 2).length;
    const citedUrls = sourceRows.filter((source: any) => source.url).length;
    const totalCitations = sourceRows.reduce((sum: number, source: any) => sum + numberValue(source.citations), 0);
    const rows = [
      {
        area: "Model citation coverage",
        evidence: `${modelSet.size} model${modelSet.size === 1 ? "" : "s"} cite known sources`,
        status: modelSet.size >= 4 ? "ready" : modelSet.size >= 2 ? "partial" : "blocked",
        action: modelSet.size >= 4 ? "Keep source freshness monitored" : "Run multi-provider scans and citation extraction",
      },
      {
        area: "Cited URL depth",
        evidence: `${citedUrls} cited URL${citedUrls === 1 ? "" : "s"}, ${totalCitations} citation signal${totalCitations === 1 ? "" : "s"}`,
        status: citedUrls >= 10 && totalCitations >= 20 ? "ready" : citedUrls >= 3 || totalCitations >= 5 ? "partial" : "blocked",
        action: citedUrls >= 10 ? "Prioritize source quality over volume" : "Build more citable pages and extract answer citations",
      },
      {
        area: "Authority source mix",
        evidence: `${authoritySources} authority source${authoritySources === 1 ? "" : "s"} above score 60`,
        status: authoritySources >= 5 ? "ready" : authoritySources >= 2 ? "partial" : "blocked",
        action: authoritySources >= 5 ? "Replicate proof from top authority domains" : "Add analyst, review, news, directory, or community authority sources",
      },
      {
        area: "Owned source control",
        evidence: `${owned} owned source${owned === 1 ? "" : "s"} detected`,
        status: owned >= 3 ? "ready" : owned > 0 ? "partial" : "blocked",
        action: owned >= 3 ? "Strengthen owned pages cited by models" : "Publish owned citation assets: About, comparisons, FAQs, proof pages",
      },
      {
        area: "Earned source validation",
        evidence: `${earned} earned source${earned === 1 ? "" : "s"} detected`,
        status: earned >= 5 ? "ready" : earned >= 2 ? "partial" : "blocked",
        action: earned >= 5 ? "Protect current earned-source visibility" : "Pitch inclusion in sources models already cite",
      },
      {
        area: "Cross-model source influence",
        evidence: `${multiModelSources} source${multiModelSources === 1 ? "" : "s"} cited by 2+ models`,
        status: multiModelSources >= 3 ? "ready" : multiModelSources > 0 ? "partial" : "blocked",
        action: multiModelSources >= 3 ? "Use these as reusable proof anchors" : "Create repeatable evidence that multiple models can cite",
      },
      {
        area: "Actionable source gaps",
        evidence: `${opportunities} opportunity URL${opportunities === 1 ? "" : "s"}`,
        status: opportunities === 0 && sourceRows.length > 0 ? "ready" : opportunities <= 3 && sourceRows.length > 0 ? "partial" : "blocked",
        action: opportunities === 0 ? "Monitor new competitor-cited pages" : "Move high-value source opportunities into Action Workflow",
      },
    ];
    const ready = rows.filter((row) => row.status === "ready").length;
    const partial = rows.filter((row) => row.status === "partial").length;
    const blocked = rows.length - ready - partial;
    const score = Math.round(((ready * 1) + (partial * 0.5)) / rows.length * 100);
    return { rows, ready, partial, blocked, score };
  }, [sources, urlIntelligence]);

  function aggregateSources(sources: Source[]): DomainStats[] {
    const domainMap = new Map<string, DomainStats>();
    
    sources.forEach((source) => {
      const domain = source.domain || '';
      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          domain,
          totalCitations: 0,
          uniquePages: 0,
          models: [],
          lastSeen: '',
        });
      }
      const entry = domainMap.get(domain)!;
      entry.totalCitations += source.citationCount || 1;
      if (source.llmProvider && !entry.models.includes(source.llmProvider)) {
        entry.models.push(source.llmProvider);
      }
      if (source.lastSeenAt && (!entry.lastSeen || source.lastSeenAt > entry.lastSeen)) {
        entry.lastSeen = source.lastSeenAt;
      }
    });
    
    return Array.from(domainMap.values()).sort((a, b) => b.totalCitations - a.totalCitations);
  }

  const getActionabilityBadge = (domain: string) => {
    const rec = recommendations.find(r => r.domain === domain);
    if (!rec) return <Badge variant="secondary" className="text-muted-foreground">Monitor</Badge>;
    
    switch (rec.actionability) {
      case 'acquire_backlink':
        return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Acquire Link</Badge>;
      case 'publish_content':
        return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Publish</Badge>;
      case 'partner':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Partner</Badge>;
      default:
        return <Badge variant="secondary" className="text-muted-foreground">Monitor</Badge>;
    }
  };

  if (sourcesError) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <TopBar title="Source Intelligence" onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to load sources</h3>
            <p className="text-muted-foreground text-center max-w-md">
              No source data available yet. Sources will appear here once LLM responses are analyzed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Source Intelligence" onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card p-4" data-testid="stat-source-domains">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Globe className="h-4 w-4" />
            <span className="text-xs">Cited Domains</span>
          </div>
          <div className="text-2xl font-bold font-mono">{displayData.length}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-cited-urls">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Link2 className="h-4 w-4" />
            <span className="text-xs">Cited URLs</span>
          </div>
          <div className="text-2xl font-bold font-mono">{sourceStats.citedUrls}</div>
        </Card>
        <Card className="glass-card p-4" data-testid="stat-source-models">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs">Models Covered</span>
          </div>
          <div className="text-2xl font-bold font-mono">{sourceStats.modelCount}</div>
        </Card>
        <Card className="glass-card p-4 border-amber-500/20 bg-amber-500/5" data-testid="stat-url-opportunities">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Target className="h-4 w-4" />
            <span className="text-xs">URL Opportunities</span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600">{sourceStats.opportunityUrls}</div>
        </Card>
      </div>

      <Card className="glass-card" data-testid="source-influence-matrix">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Source Influence Matrix</CardTitle>
              <CardDescription>
                Launch-grade citation coverage across model reach, authority, owned proof, earned validation, and actionable source gaps.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                {sourceInfluenceMatrix.ready} ready
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {sourceInfluenceMatrix.partial} partial
              </Badge>
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                {sourceInfluenceMatrix.blocked} blocked
              </Badge>
              <Badge variant="outline">{sourceInfluenceMatrix.score}/100</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[760px] rounded-md border">
              <div className="grid grid-cols-[1fr_1.2fr_0.55fr_1.2fr] border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div>Source capability</div>
                <div>Current evidence</div>
                <div>Status</div>
                <div>Next action</div>
              </div>
              {sourceInfluenceMatrix.rows.map((row) => (
                <div key={row.area} className="grid grid-cols-[1fr_1.2fr_0.55fr_1.2fr] border-b px-3 py-3 text-sm last:border-b-0">
                  <div className="pr-3 font-medium">{row.area}</div>
                  <div className="pr-3 text-muted-foreground">{row.evidence}</div>
                  <div className="pr-3">
                    <Badge
                      variant="outline"
                      className={
                        row.status === "ready"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : row.status === "partial"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-red-200 bg-red-50 text-red-700"
                      }
                    >
                      {row.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">{row.action}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {citationOpportunities?.opportunities?.length > 0 && (
        <Card className="glass-card" data-testid="citation-opportunities-panel">
          <CardHeader>
            <CardTitle>Citation Opportunity Engine</CardTitle>
            <CardDescription>
              Prioritized source acquisition moves based on pages AI models already cite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4 mb-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Open Opportunities</p>
                <p className="mt-1 text-2xl font-bold font-mono">{citationOpportunities.summary?.total || 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">High Priority</p>
                <p className="mt-1 text-2xl font-bold font-mono">{citationOpportunities.summary?.high || 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">In Workflow</p>
                <p className="mt-1 text-2xl font-bold font-mono">{citationOpportunities.summary?.inWorkflow || 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Cited URLs</p>
                <p className="mt-1 text-2xl font-bold font-mono">{citationOpportunities.summary?.citedUrls || 0}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {citationOpportunities.opportunities.slice(0, 6).map((opportunity: any) => (
                <div key={opportunity.id} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{opportunity.title || opportunity.domain}</p>
                      <p className="mt-1 text-xs text-muted-foreground truncate">{opportunity.url || opportunity.domain}</p>
                    </div>
                    <Badge variant={opportunity.priority === "high" ? "destructive" : opportunity.priority === "medium" ? "secondary" : "outline"} className="capitalize">
                      {opportunity.priority}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{opportunity.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{opportunity.citations} citations</Badge>
                    <Badge variant="outline">{opportunity.models?.length || 0} models</Badge>
                    <Badge variant="outline">{opportunity.opportunityScore}/100</Badge>
                    {opportunity.status === "in_workflow" && <Badge variant="secondary">In workflow</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => citationTaskMutation.mutate(opportunity.id)}
                      disabled={citationTaskMutation.isPending || opportunity.status === "in_workflow"}
                      data-testid={`button-add-citation-opportunity-${opportunity.id}`}
                    >
                      Add to workflow
                    </Button>
                    {opportunity.url && (
                      <Button variant="outline" size="sm" onClick={() => window.open(opportunity.url, "_blank")}>
                        Open source
                        <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Top Cited Domains</CardTitle>
          <CardDescription>
            Websites that AI models trust for information about your industry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-16 ml-auto" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : displayData.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="No sources discovered yet"
              description="Sources will appear here once your scheduled analysis completes. Analysis runs automatically based on your plan and discovers which domains are being cited by AI models."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Domain</TableHead>
                  <TableHead className="text-center">Citations</TableHead>
                  <TableHead className="text-center">Pages</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((source: DomainStats) => (
                  <TableRow key={source.domain}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      {source.domain}
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold">{source.totalCitations}</TableCell>
                    <TableCell className="text-center font-mono text-muted-foreground">{source.uniquePages}</TableCell>
                    <TableCell>
                      <div className="flex -space-x-1">
                        {source.models.slice(0, 3).map((model: string) => (
                          <div key={model} className="h-5 w-5 rounded-full bg-background border flex items-center justify-center text-[8px] font-bold uppercase">
                            {model.slice(0, 1)}
                          </div>
                        ))}
                        {source.models.length > 3 && (
                          <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px]">
                            +{source.models.length - 3}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getActionabilityBadge(source.domain)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => window.open(`https://${source.domain}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {urlIntelligence.length > 0 && (
        <Card className="glass-card" data-testid="card-url-source-intelligence">
          <CardHeader>
            <CardTitle>URL-Level Citation Intelligence</CardTitle>
            <CardDescription>
              Exact pages AI models cite, with model coverage and next action for source acquisition.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[360px]">Cited URL</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-center">Citations</TableHead>
                  <TableHead className="text-center">Authority</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Opportunity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {urlIntelligence.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium truncate" title={source.title || source.url || source.domain}>{source.title || source.url || source.domain}</p>
                        {source.url && (
                          <button
                            className="text-xs text-muted-foreground hover:text-primary truncate max-w-[340px] block text-left"
                            onClick={() => window.open(source.url, "_blank")}
                          >
                            {source.url}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{source.domain}</TableCell>
                    <TableCell className="text-center font-mono font-bold">{source.citations}</TableCell>
                    <TableCell className="text-center font-mono">{source.authority}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {source.models.slice(0, 4).map((model: string) => (
                          <Badge key={model} variant="outline" className="text-[10px] uppercase">{model.slice(0, 10)}</Badge>
                        ))}
                        {source.models.length === 0 && <span className="text-xs text-muted-foreground">Unknown</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{source.action}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-mono font-bold">{source.opportunityScore}</span>
                        {source.url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(source.url, "_blank")}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Actions to improve your brand's presence in AI-cited sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.slice(0, 5).map((rec) => (
                <div key={rec.domain} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{rec.domain}</span>
                      <Badge variant={rec.priority === 'high' ? 'destructive' : rec.priority === 'medium' ? 'secondary' : 'outline'}>
                        {rec.priority} priority
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.reason}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono">{rec.impactScore}</div>
                    <div className="text-xs text-muted-foreground">Impact Score</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
