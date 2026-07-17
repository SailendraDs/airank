import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Copy, FlaskConical, Sparkles, Pickaxe, RefreshCw, Loader2, GitBranch } from "lucide-react";
import type { PromptTemplate } from "@shared/schema";

const CATEGORIES = [
  { id: "visibility", label: "Visibility Check", color: "bg-blue-500" },
  { id: "competitive", label: "Competitive Analysis", color: "bg-purple-500" },
  { id: "citation", label: "Citation Extraction", color: "bg-amber-500" },
  { id: "summarization", label: "Summarization", color: "bg-green-500" },
  { id: "topic_generation", label: "Topic Generation", color: "bg-cyan-600" },
  { id: "query_generation", label: "Query Generation", color: "bg-indigo-600" },
  { id: "prompt_matching", label: "Prompt Matching", color: "bg-fuchsia-600" },
  { id: "claim_extraction", label: "Claim Extraction", color: "bg-orange-600" },
  { id: "brand_analysis", label: "Brand Analysis", color: "bg-emerald-600" },
  { id: "gap_analysis", label: "Gap Analysis", color: "bg-rose-600" },
  { id: "llm_sampling", label: "LLM Sampling", color: "bg-slate-600" },
];

const LLM_PROVIDERS = [
  { id: "all", label: "All Models" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
];

const SOURCES = [
  { id: "search", label: "Search Queries", color: "bg-green-500" },
  { id: "reddit", label: "Reddit", color: "bg-orange-500" },
  { id: "forum", label: "Forums", color: "bg-purple-500" },
];

const INTENT_TYPES = [
  { id: "comparison", label: "Comparison", color: "bg-blue-500" },
  { id: "review", label: "Review", color: "bg-amber-500" },
  { id: "pricing", label: "Pricing", color: "bg-emerald-500" },
  { id: "howto", label: "How-to", color: "bg-cyan-500" },
  { id: "discovery", label: "Discovery", color: "bg-indigo-500" },
];

export default function AdminPromptTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [isMiningOpen, setIsMiningOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [miningSources, setMiningSources] = useState<string[]>(["search", "reddit", "forum"]);
  const [miningLimit, setMiningLimit] = useState<number>(50);
  const [isMining, setIsMining] = useState(false);

  const { data: templates = [], isLoading } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/admin/prompt-templates", filterCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      const res = await fetch(`/api/admin/prompt-templates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load prompt templates");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
  });

  // Fetch brands for mining selector
  const { data: brandsData } = useQuery<{ brands: any[] }>({
    queryKey: ["/api/admin/brands"],
    queryFn: async () => {
      const res = await fetch("/api/admin/brands?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load brands");
      return res.json();
    },
    enabled: isMiningOpen,
  });

  // Fetch mining stats
  const { data: miningStats } = useQuery<any>({
    queryKey: ["/api/admin/prompt-mining/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/prompt-mining/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load mining stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Mining mutation
  const minePrompts = useMutation({
    mutationFn: async ({ brandId, sources, limit }: { brandId: string; sources: string[]; limit: number }) => {
      const res = await fetch("/api/admin/prompt-mining/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ brandId, sources, limit }),
      });
      if (!res.ok) throw new Error("Failed to mine prompts");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-mining/stats"] });
      toast({
        title: "Mining Complete",
        description: `Mined ${data.mined} prompts, stored ${data.stored} templates for ${data.brandName}`,
      });
      setIsMining(false);
      setIsMiningOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Mining failed", description: error.message, variant: "destructive" });
      setIsMining(false);
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (data: Partial<PromptTemplate>) => {
      const res = await fetch("/api/admin/prompt-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-templates"] });
      toast({ title: "Template created successfully" });
      setIsCreateOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PromptTemplate> & { id: string }) => {
      const res = await fetch(`/api/admin/prompt-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-templates"] });
      toast({ title: "Template updated successfully" });
      setEditingTemplate(null);
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/prompt-templates/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete template", variant: "destructive" });
    },
  });

  const getCategoryBadge = (category: string) => {
    const cat = CATEGORIES.find(c => c.id === category);
    return cat ? (
      <Badge className={`${cat.color} text-white`}>{cat.label}</Badge>
    ) : (
      <Badge variant="secondary">{category}</Badge>
    );
  };

  const getSourceBadge = (source: string | null | undefined) => {
    if (!source || source === 'manual') {
      return <Badge variant="outline">Manual</Badge>;
    }
    const src = SOURCES.find(s => s.id === source);
    return src ? (
      <Badge className={`${src.color} text-white`}>{src.label}</Badge>
    ) : (
      <Badge variant="secondary">{source}</Badge>
    );
  };

  const getIntentBadge = (intent: string | null | undefined) => {
    if (!intent) {
      return <span className="text-xs text-muted-foreground">-</span>;
    }
    const it = INTENT_TYPES.find(i => i.id === intent);
    return it ? (
      <Badge className={`${it.color} text-white text-xs`}>{it.label}</Badge>
    ) : (
      <Badge variant="outline" className="text-xs">{intent}</Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Prompt Templates</h1>
          <p className="text-muted-foreground">Manage prompt templates with versioning and A/B testing.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsMiningOpen(true)}
            data-testid="mine-prompts-button"
          >
            <Pickaxe className="h-4 w-4 mr-2" />
            Mine Real Prompts
          </Button>
          <Dialog open={isMiningOpen} onOpenChange={setIsMiningOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Mine Real User Prompts</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Brand</Label>
                  <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a brand..." />
                    </SelectTrigger>
                    <SelectContent>
                      {brandsData?.brands?.map((brand: any) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Data Sources</Label>
                  <div className="flex gap-2 mt-2">
                    {SOURCES.map((source) => (
                      <Button
                        key={source.id}
                        variant={miningSources.includes(source.id) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setMiningSources((prev) =>
                            prev.includes(source.id)
                              ? prev.filter((s) => s !== source.id)
                              : [...prev, source.id]
                          );
                        }}
                      >
                        {source.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Max Prompts to Generate</Label>
                  <Input
                    type="number"
                    value={miningLimit}
                    onChange={(e) => setMiningLimit(Math.max(10, Math.min(100, parseInt(e.target.value) || 50)))}
                    min={10}
                    max={100}
                  />
                </div>

                {miningStats && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Current Statistics</Label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Total Templates: <span className="font-mono font-medium">{miningStats.total}</span></div>
                      <div>Mined: <span className="font-mono font-medium">{miningStats.minedTemplates}</span></div>
                      <div>Search: <span className="font-mono font-medium">{miningStats.bySource?.search || 0}</span></div>
                      <div>Reddit: <span className="font-mono font-medium">{miningStats.bySource?.reddit || 0}</span></div>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={!selectedBrandId || isMining || miningSources.length === 0}
                  onClick={() => {
                    setIsMining(true);
                    minePrompts.mutate({
                      brandId: selectedBrandId,
                      sources: miningSources,
                      limit: miningLimit,
                    });
                  }}
                >
                  {isMining ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mining...
                    </>
                  ) : (
                    <>
                      <Pickaxe className="h-4 w-4 mr-2" />
                      Start Mining
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-template-button">
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Prompt Template</DialogTitle>
              </DialogHeader>
              <TemplateForm onSubmit={(data) => createTemplate.mutate(data)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={filterCategory === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterCategory("")}
          data-testid="filter-all"
        >
          All
        </Button>
        {CATEGORIES.map(cat => (
          <Button
            key={cat.id}
            variant={filterCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterCategory(cat.id)}
            data-testid={`filter-${cat.id}`}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Templates</CardTitle>
            <Badge variant="outline">{templates?.length || 0} templates</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map(template => (
                <TableRow key={template.id} data-testid={`template-row-${template.id}`}>
                  <TableCell>
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{template.description}</div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(template.category)}</TableCell>
                  <TableCell>{getSourceBadge(template.source)}</TableCell>
                  <TableCell>{getIntentBadge(template.intentType)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{template.llmProvider}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">v{template.version}</span>
                  </TableCell>
                  <TableCell>
                    {(template.usageCount ?? 0) > 0 ? (
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-xs">{template.usageCount}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(template)} data-testid={`edit-${template.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => createTemplate.mutate({ ...template, name: `${template.name} (Copy)`, version: 1 })} data-testid={`copy-${template.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteTemplate.mutate(template.id)} data-testid={`delete-${template.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {templates?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No templates found. Create your first template to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <TemplateForm
              template={editingTemplate}
              onSubmit={(data) => updateTemplate.mutate({ ...data, id: editingTemplate.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function TemplateForm({ template, onSubmit }: { template?: PromptTemplate; onSubmit: (data: Partial<PromptTemplate>) => void }) {
  const [formData, setFormData] = useState({
    name: template?.name || "",
    description: template?.description || "",
    category: template?.category || "visibility",
    llmProvider: template?.llmProvider || "all",
    template: template?.template || "",
    variables: template?.variables?.join(", ") || "",
    version: template?.version || 1,
    isActive: template?.isActive ?? true,
    isDefault: template?.isDefault ?? false,
    abTestGroup: template?.abTestGroup || "",
    abTestWeight: template?.abTestWeight || 50,
  });

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      variables: formData.variables.split(",").map(v => v.trim()).filter(Boolean),
    });
  };

  const extractVariables = () => {
    const matches = formData.template.match(/\{\{(\w+)\}\}/g);
    if (matches) {
      const vars = matches.map(m => m.replace(/\{\{|\}\}/g, ""));
      setFormData({ ...formData, variables: Array.from(new Set(vars)).join(", ") });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Template Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Brand Visibility Check"
            data-testid="input-name"
          />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
            <SelectTrigger data-testid="select-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Check if brand appears in LLM response..."
          data-testid="input-description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Target Model</Label>
          <Select value={formData.llmProvider} onValueChange={(value) => setFormData({ ...formData, llmProvider: value })}>
            <SelectTrigger data-testid="select-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LLM_PROVIDERS.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Version</Label>
          <Input
            type="number"
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: parseInt(e.target.value) || 1 })}
            data-testid="input-version"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Prompt Template</Label>
          <Button variant="outline" size="sm" onClick={extractVariables} data-testid="extract-variables">
            <Sparkles className="h-3 w-3 mr-1" />
            Extract Variables
          </Button>
        </div>
        <Textarea
          value={formData.template}
          onChange={(e) => setFormData({ ...formData, template: e.target.value })}
          placeholder="What are the best {{industry}} companies for {{topic}}?"
          rows={3}
          className="font-mono text-sm"
          data-testid="input-template"
        />
        <p className="text-xs text-muted-foreground mt-1">Use {"{{variable_name}}"} syntax for dynamic values.</p>
      </div>

      <div>
        <Label>Variables (comma-separated)</Label>
        <Input
          value={formData.variables}
          onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
          placeholder="industry, topic, brand_name"
          data-testid="input-variables"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>A/B Test Group (optional)</Label>
          <Select value={formData.abTestGroup || "none"} onValueChange={(value) => setFormData({ ...formData, abTestGroup: value === "none" ? "" : value })}>
            <SelectTrigger data-testid="select-ab-group">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="A">Group A</SelectItem>
              <SelectItem value="B">Group B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Test Weight (%)</Label>
          <Input
            type="number"
            value={formData.abTestWeight}
            onChange={(e) => setFormData({ ...formData, abTestWeight: parseInt(e.target.value) || 50 })}
            min={0}
            max={100}
            data-testid="input-ab-weight"
          />
        </div>
      </div>

      <div className="flex items-center gap-6 pt-2">
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            data-testid="toggle-active"
          />
          <Label>Active</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.isDefault}
            onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
            data-testid="toggle-default"
          />
          <Label>Default Template</Label>
        </div>
      </div>

      <DialogFooter className="pt-4">
        <Button onClick={handleSubmit} data-testid="submit-template">
          {template ? "Update Template" : "Create Template"}
        </Button>
      </DialogFooter>
    </div>
  );
}
