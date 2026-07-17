// client/src/pages/admin/AdminBrandDetail.tsx
import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, Target, MessageSquare, Globe, Loader2, Eye, Wand2, Sliders, X, FileText, HelpCircle, TrendingDown, Bot, Code2, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ContextTab from "./brand-detail/ContextTab";
import ScriptSchemaTab from "./brand-detail/ScriptSchemaTab";
import FaqTab from "./brand-detail/FaqTab";
import GapAnalysisTab from "./brand-detail/GapAnalysisTab";
import PromptRunsTab from "./brand-detail/PromptRunsTab";
import AddonsTab from "./brand-detail/AddonsTab";

type ActiveTab = "competitors" | "topics" | "prompts" | "sources" | "context" | "script-schema" | "faq" | "gap" | "runs" | "addons";

const TIER_COLORS: Record<string, string> = {
  free: "bg-slate-500",
  starter: "bg-blue-500",
  growth: "bg-purple-500",
  enterprise: "bg-amber-500",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  trial: "bg-yellow-500",
  suspended: "bg-red-500",
};

export default function AdminBrandDetail() {
  const { brandId } = useParams<{ brandId: string }>();
  const [activeTab, setActiveTab] = useState<ActiveTab>("context");
  const [scoreInput, setScoreInput] = useState("");
  const { toast } = useToast();

  const scoreOverrideMutation = useMutation({
    mutationFn: (data: { scoreOverride: number | null; competitorOverrides: Record<string, number> | null }) =>
      apiRequest("PATCH", `/api/admin/brands/${brandId}/score-override`, data),
    onSuccess: () => {
      toast({ title: "Score override saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands", brandId] });
    },
    onError: () => toast({ title: "Failed to save override", variant: "destructive" }),
  });

  const matchPromptsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/brands/${brandId}/match-prompts-to-topics`);
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({ title: "Matching complete", description: `Matched ${result.matched} of ${result.total} unassigned prompts to topics.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/brands", brandId] });
    },
    onError: () => toast({ title: "Matching failed", description: "Could not match prompts to topics.", variant: "destructive" }),
  });

  const { data, isLoading } = useQuery<{
    brand: any;
    competitors: any[];
    prompts: any[];
    topics: any[];
    sources: any[];
    jobs: any[];
  }>({
    queryKey: ["/api/admin/brands", brandId],
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]" data-testid="loading-spinner">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const brand = data?.brand;
  const competitors = data?.competitors || [];
  const topics = data?.topics || [];
  const prompts = data?.prompts || [];
  const sources = data?.sources || [];

  if (!brand) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-muted-foreground" data-testid="brand-not-found">Brand not found.</div>
      </AdminLayout>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: any }[] = [
    { key: "context", label: "Context", icon: FileText },
    { key: "script-schema", label: "Script & Schema", icon: Code2 },
    { key: "faq", label: "FAQ Builder", icon: HelpCircle },
    { key: "gap", label: "Gap Analysis", icon: TrendingDown },
    { key: "runs", label: "Prompt Runs", icon: Bot },
    { key: "addons", label: "Add-ons", icon: Package },
    { key: "competitors", label: `Competitors (${competitors.length})`, icon: Users },
    { key: "topics", label: `Topics (${topics.length})`, icon: Target },
    { key: "prompts", label: `Prompts (${prompts.length})`, icon: MessageSquare },
    { key: "sources", label: `Sources (${sources.length})`, icon: Globe },
  ];

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/brands">
          <Button variant="ghost" size="sm" data-testid="back-to-brands">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Brands
          </Button>
        </Link>
      </div>

      {/* Brand Header */}
      <div className="flex items-center gap-4 mb-6" data-testid="brand-header">
        <Avatar className="h-14 w-14">
          <AvatarImage src={brand.logo || undefined} />
          <AvatarFallback>{brand.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="brand-name">{brand.name}</h1>
            <Badge className={`${TIER_COLORS[brand.tier] || ""} text-white capitalize`} data-testid="brand-tier">{brand.tier}</Badge>
            <Badge className={`${STATUS_COLORS[brand.status] || ""} text-white capitalize`} data-testid="brand-status">{brand.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="brand-domain">{brand.domain}</p>
          {brand.visibilityScore != null && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="brand-visibility-score">
              Visibility Score: <span className="font-semibold text-foreground">
                {brand.scoreOverride != null ? `${brand.scoreOverride} (override)` : brand.visibilityScore}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Score Override Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sliders className="h-4 w-4" />
            Manual Score Override
            {brand.scoreOverride != null && (
              <Badge variant="secondary" className="ml-2">Override active: {brand.scoreOverride}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs text-muted-foreground mb-1 block">Visibility Score (0–85, blank = computed)</Label>
              <Input
                type="number" min={0} max={85}
                placeholder={brand.scoreOverride != null ? String(brand.scoreOverride) : "Use computed score"}
                value={scoreInput}
                onChange={e => setScoreInput(e.target.value)}
                data-testid="input-score-override"
              />
            </div>
            <Button size="sm" disabled={scoreOverrideMutation.isPending}
              onClick={() => {
                const val = scoreInput.trim() === "" ? null : parseFloat(scoreInput);
                scoreOverrideMutation.mutate({ scoreOverride: val, competitorOverrides: brand.competitorOverrides ?? null });
                setScoreInput("");
              }}
              data-testid="btn-save-score-override"
            >
              {scoreOverrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            {brand.scoreOverride != null && (
              <Button size="sm" variant="ghost"
                onClick={() => scoreOverrideMutation.mutate({ scoreOverride: null, competitorOverrides: null })}
                data-testid="btn-clear-score-override"
              >
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Setting an override replaces the computed visibility score on the brand's dashboard.
          </p>
        </CardContent>
      </Card>

      {/* Tab Bar */}
      <div className="flex gap-1 flex-wrap border-b mb-6 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "context" && <ContextTab brandId={brandId!} />}
        {activeTab === "script-schema" && <ScriptSchemaTab brand={brand} brandId={brandId!} />}
        {activeTab === "faq" && <FaqTab brandId={brandId!} />}
        {activeTab === "gap" && <GapAnalysisTab brandId={brandId!} />}
        {activeTab === "runs" && <PromptRunsTab brandId={brandId!} />}
        {activeTab === "addons" && <AddonsTab brandId={brandId!} />}

        {activeTab === "competitors" && (
          <Card>
            <CardContent className="pt-4">
              <Table data-testid="competitors-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitors.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No competitors found.</TableCell></TableRow>
                  ) : competitors.map((c: any) => (
                    <TableRow key={c.id} data-testid={`competitor-row-${c.id}`}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.domain}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/brands/${brandId}/competitors/${c.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`view-competitor-${c.id}`}><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === "topics" && (
          <>
            <div className="mb-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => matchPromptsMutation.mutate()} disabled={matchPromptsMutation.isPending} data-testid="btn-match-prompts-to-topics">
                {matchPromptsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                Match Prompts to Topics
              </Button>
            </div>
            <Card>
              <CardContent className="pt-4">
                <Table data-testid="topics-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No topics found.</TableCell></TableRow>
                    ) : topics.map((t: any) => (
                      <TableRow key={t.id} data-testid={`topic-row-${t.id}`}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-muted-foreground">{t.category || "general"}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/brands/${brandId}/topics/${t.id}`}>
                            <Button variant="ghost" size="icon" data-testid={`view-topic-${t.id}`}><Eye className="h-4 w-4" /></Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "prompts" && (
          <Card>
            <CardContent className="pt-4">
              <Table data-testid="prompts-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Text</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prompts.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No prompts found.</TableCell></TableRow>
                  ) : prompts.map((p: any) => (
                    <TableRow key={p.id} data-testid={`prompt-row-${p.id}`}>
                      <TableCell className="font-medium">
                        {(p.text || p.promptText || "").length > 80 ? (p.text || p.promptText || "").slice(0, 80) + "..." : (p.text || p.promptText || "")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.category}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/brands/${brandId}/prompts/${p.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`view-prompt-${p.id}`}><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {activeTab === "sources" && (
          <Card>
            <CardContent className="pt-4">
              <Table data-testid="sources-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Citations</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Models</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No sources found.</TableCell></TableRow>
                  ) : sources.map((s: any, idx: number) => (
                    <TableRow key={s.id || idx} data-testid={`source-row-${s.id || idx}`}>
                      <TableCell className="font-medium">{s.domain}</TableCell>
                      <TableCell>{s.mentions ?? 0}</TableCell>
                      <TableCell className="text-muted-foreground">{s.sourceType}</TableCell>
                      <TableCell className="text-muted-foreground">{s.modelsCited}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
