import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, HelpCircle, Code2, Terminal, Plus, Search, Download, ClipboardList,
  Eye, Pencil, Trash2, Copy, ExternalLink, Check, X, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, Globe, Link2, Calendar, Clock,
  ChevronRight, Sparkles, Zap, ArrowUpRight, Building2, Package, MapPin
} from "lucide-react";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useAxpPages, useFaqEntries, useSchemaTemplates, useCreateAxpPage, useCreateFaqEntry } from "@/hooks/use-content";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const schemaTypeIcons: Record<string, typeof Building2> = {
  Organization: Building2,
  Product: Package,
  FAQPage: HelpCircle,
  Article: FileText,
  LocalBusiness: MapPin,
  BreadcrumbList: Link2,
};

const CONTENT_TABS = ["axp", "faq", "schema", "script"];

function artifactElementId(id: string) {
  return `content-artifact-${String(id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getSchemaIcon(schemaType: string) {
  const Icon = schemaTypeIcons[schemaType] || Code2;
  return <Icon className="h-6 w-6 text-muted-foreground" />;
}

function schemaTemplateToJsonLd(schema: any) {
  const template = schema?.template || {};
  const json = typeof template === "string" ? template : JSON.stringify(template, null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function buildSchemaDeploymentChecklist(brandName: string, domain: string, schemas: any[]) {
  const schemaRows = schemas
    .map((schema: any, index) => `${index + 1}. ${schema.name || schema.schemaType} (${schema.schemaType || "JSON-LD"}) - ${schema.isActive ? "active" : "inactive"}`)
    .join("\n");

  return [
    `${brandName} schema deployment checklist`,
    ``,
    `Domain: ${domain || "canonical homepage"}`,
    ``,
    `Schema assets`,
    schemaRows || `No schema assets available yet. Create the Agent Readiness schema fix pack first.`,
    ``,
    `Deployment steps`,
    `1. Copy the JSON-LD bundle from AIRank.`,
    `2. Paste it into the homepage <head> or CMS custom schema field.`,
    `3. Keep one canonical Organization/WebSite/WebPage graph to avoid conflicting facts.`,
    `4. Clear CMS, page, and CDN cache.`,
    `5. View source as a logged-out visitor and confirm application/ld+json is present.`,
    `6. Validate the live URL in Schema Markup Validator.`,
    `7. Rerun Agent Readiness and confirm JSON-LD, Organization schema, and WebSite schema pass.`,
  ].join("\n");
}

export default function ContentAXP() {
  const { brand, brandId, isLoading: brandLoading } = useCurrentBrand();
  const [activeTab, setActiveTab] = useState("axp");
  const [focusedArtifactId, setFocusedArtifactId] = useState("");
  const [showNewAXP, setShowNewAXP] = useState(false);
  const [showNewFAQ, setShowNewFAQ] = useState(false);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const { toast } = useToast();

  const [axpTitle, setAxpTitle] = useState("");
  const [axpSlug, setAxpSlug] = useState("");
  const [axpContentType, setAxpContentType] = useState("about");
  const [axpTopics, setAxpTopics] = useState("");

  const [faqPage, setFaqPage] = useState("homepage");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqEvidence, setFaqEvidence] = useState("");
  const [faqPublishMode, setFaqPublishMode] = useState("axp");

  const [dismissedSuggestions, setDismissedSuggestions] = useState<number[]>([]);
  const [verifyingScript, setVerifyingScript] = useState(false);
  const [scriptStatus, setScriptStatus] = useState<{ verified: boolean; message: string } | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data: axpPages = [], isLoading: axpLoading } = useAxpPages(brandId || "");
  const { data: faqs = [], isLoading: faqsLoading } = useFaqEntries(brandId || "");
  const { data: schemas = [], isLoading: schemasLoading } = useSchemaTemplates(brandId || "");

  const createAxpPageMutation = useCreateAxpPage(brandId || "");
  const createFaqEntryMutation = useCreateFaqEntry(brandId || "");
  const draftAxpPages = axpPages.filter((page: any) => String(page.status || "").toLowerCase() !== "published");
  const publishAxpPageMutation = useMutation({
    mutationFn: (pageId: string) => api.publishAxpPage(brandId || "", pageId),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
      queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "verification-tasks"] });
      toast({
        title: "AXP page published",
        description: result?.message || "The page is live and a verification task was created.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });
  const publishAllAxpDraftsMutation = useMutation({
    mutationFn: async () => {
      const targets = draftAxpPages.slice(0, 25);
      const results = [];
      for (const page of targets) {
        results.push(await api.publishAxpPage(brandId || "", page.id));
      }
      return { published: results.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['axpPages', brandId] });
      queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "verification-tasks"] });
      toast({
        title: "AXP drafts published",
        description: `${result.published} draft${result.published === 1 ? "" : "s"} published with verification follow-up.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk publish failed", description: error.message, variant: "destructive" });
    },
  });

  const schemaCoverage = schemas.length > 0
    ? Math.round(schemas.filter((s: any) => s.isActive).length / schemas.length * 100)
    : 0;
  const homepageGraphSchema = schemas.find((schema: any) => (
    String(schema.schemaType || "").toLowerCase() === "homepagegraph"
    || String(schema.name || "").toLowerCase().includes("homepage ai readiness")
  ));
  const activeSchemaCount = schemas.filter((s: any) => s.isActive).length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") || "";
    const artifact = params.get("artifact") || "";
    if (CONTENT_TABS.includes(tab)) setActiveTab(tab);
    if (artifact) setFocusedArtifactId(artifact);
  }, []);

  useEffect(() => {
    if (!focusedArtifactId || brandLoading || axpLoading || faqsLoading || schemasLoading) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(artifactElementId(focusedArtifactId))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [focusedArtifactId, activeTab, brandLoading, axpLoading, faqsLoading, schemasLoading]);

  const focusedArtifact = useMemo(() => {
    if (!focusedArtifactId) return null;
    if (activeTab === "axp") return axpPages.find((page: any) => page.id === focusedArtifactId);
    if (activeTab === "faq") return faqs.find((faq: any) => faq.id === focusedArtifactId);
    if (activeTab === "schema") return schemas.find((schema: any) => schema.id === focusedArtifactId);
    return null;
  }, [activeTab, axpPages, faqs, focusedArtifactId, schemas]);

  if (brandLoading || axpLoading || faqsLoading || schemasLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading content...</span>
      </div>
    );
  }

  if (!brand || !brandId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-6 w-6 mr-2" />
        No brand found. Please complete onboarding first.
      </div>
    );
  }

  const handleCreateAxpPage = () => {
    if (!axpTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    createAxpPageMutation.mutate(
      {
        title: axpTitle,
        slug: axpSlug || axpTitle.toLowerCase().replace(/\s+/g, "-"),
        contentType: axpContentType,
        content: "Generated content for " + axpTitle,
        status: "draft",
      },
      {
        onSuccess: () => {
          toast({ title: "AXP Page created successfully" });
          setShowNewAXP(false);
          setAxpTitle("");
          setAxpSlug("");
          setAxpContentType("about");
          setAxpTopics("");
        },
        onError: () => {
          toast({ title: "Failed to create AXP page", variant: "destructive" });
        },
      }
    );
  };

  const handleCreateFaq = () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast({ title: "Question and answer are required", variant: "destructive" });
      return;
    }
    createFaqEntryMutation.mutate(
      {
        question: faqQuestion,
        answer: faqAnswer,
        category: faqPage,
        evidenceUrls: faqEvidence ? [faqEvidence] : [],
        publishMode: faqPublishMode,
      },
      {
        onSuccess: () => {
          toast({ title: "FAQ entry created successfully" });
          setShowNewFAQ(false);
          setFaqQuestion("");
          setFaqAnswer("");
          setFaqEvidence("");
          setFaqPage("homepage");
          setFaqPublishMode("axp");
        },
        onError: () => {
          toast({ title: "Failed to create FAQ entry", variant: "destructive" });
        },
      }
    );
  };

  const handleGenerateSuggestion = (suggestion: { title: string }, index: number) => {
    createAxpPageMutation.mutate(
      {
        title: suggestion.title,
        slug: suggestion.title.toLowerCase().replace(/\s+/g, "-"),
        content: "Generated content for " + suggestion.title,
        status: "draft",
      },
      {
        onSuccess: () => {
          toast({ title: `AXP page "${suggestion.title}" created` });
          setDismissedSuggestions((prev) => [...prev, index]);
        },
        onError: () => {
          toast({ title: "Failed to create AXP page", variant: "destructive" });
        },
      }
    );
  };

  const copySchemaBundle = async () => {
    const activeSchemas = schemas.filter((schema: any) => schema.isActive);
    const bundle = (activeSchemas.length ? activeSchemas : schemas).map(schemaTemplateToJsonLd).join("\n\n");
    await navigator.clipboard.writeText(bundle || "");
    toast({
      title: bundle ? "Schema bundle copied" : "No schema assets to copy",
      description: bundle ? "Paste the JSON-LD into the site head, then validate the live homepage." : "Create a schema fix pack from Agent Readiness first.",
    });
  };

  const copySchemaChecklist = async () => {
    await navigator.clipboard.writeText(buildSchemaDeploymentChecklist(brand?.name || "Brand", brand?.domain || "", schemas));
    toast({ title: "Schema deployment checklist copied" });
  };

  const verifyScriptInstallation = async () => {
    if (!brandId) return;
    setVerifyingScript(true);
    setScriptStatus(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/verify-script`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setScriptStatus(data);
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
        toast({
          title: "Verified!",
          description: "Script detected on your site.",
        });
      } else {
        toast({
          title: "Not detected",
          description: data.message || "Script not detected on website",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Verification failed",
        description: "Could not verify script right now. Try again.",
        variant: "destructive",
      });
    } finally {
      setVerifyingScript(false);
    }
  };

  const NewAXPModal = () => (
    <Dialog open={showNewAXP} onOpenChange={setShowNewAXP}>
      <DialogContent className="max-w-2xl" data-testid="modal-new-axp">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create New AXP Page
          </DialogTitle>
          <DialogDescription>
            Generate a bot-friendly static HTML page with canonical linking and proper headers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label>Page Title</Label>
            <Input
              placeholder={`e.g., About ${brand?.name || "Your Brand"}`}
              data-testid="input-axp-title"
              value={axpTitle}
              onChange={(e) => setAxpTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/axp/</span>
              <Input
                placeholder="about"
                className="flex-1"
                data-testid="input-axp-slug"
                value={axpSlug}
                onChange={(e) => setAxpSlug(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Content Type</Label>
            <Select value={axpContentType} onValueChange={setAxpContentType}>
              <SelectTrigger data-testid="select-axp-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="about">About / Company Info</SelectItem>
                <SelectItem value="comparison">Comparison Page</SelectItem>
                <SelectItem value="features">Feature Overview</SelectItem>
                <SelectItem value="use-case">Use Case / Industry</SelectItem>
                <SelectItem value="custom">Custom Page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Key Topics / Keywords</Label>
            <Textarea
              placeholder="Enter main topics this page should cover..."
              rows={3}
              data-testid="input-axp-topics"
              value={axpTopics}
              onChange={(e) => setAxpTopics(e.target.value)}
            />
          </div>
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <Label className="text-sm font-medium">Bot-Friendly Options</Label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Include canonical link</span>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Add structured data (JSON-LD)</span>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable X-Robots-Tag headers</span>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewAXP(false)}>Cancel</Button>
          <Button
            className="gap-2"
            data-testid="btn-generate-axp"
            onClick={handleCreateAxpPage}
            disabled={createAxpPageMutation.isPending}
          >
            {createAxpPageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate AXP Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const NewFAQModal = () => (
    <Dialog open={showNewFAQ} onOpenChange={setShowNewFAQ}>
      <DialogContent className="max-w-2xl" data-testid="modal-new-faq">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Add FAQ Entry
          </DialogTitle>
          <DialogDescription>
            Create a new FAQ entry with evidence links for AI model verification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label>Target Page</Label>
            <Select value={faqPage} onValueChange={setFaqPage}>
              <SelectTrigger data-testid="select-faq-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homepage">Homepage</SelectItem>
                <SelectItem value="pricing">Pricing</SelectItem>
                <SelectItem value="features">Features</SelectItem>
                <SelectItem value="about">About Us</SelectItem>
                <SelectItem value="all">All Pages (Global)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Question</Label>
            <Input
              placeholder="What is your question?"
              data-testid="input-faq-question"
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Answer</Label>
            <Textarea
              placeholder="Provide a detailed answer..."
              rows={4}
              data-testid="input-faq-answer"
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Evidence Links</Label>
            <p className="text-xs text-muted-foreground">Add URLs that support this answer for AI verification</p>
            <Input
              placeholder="https://example.com/source"
              data-testid="input-faq-evidence"
              value={faqEvidence}
              onChange={(e) => setFaqEvidence(e.target.value)}
            />
            <Button variant="outline" size="sm" className="w-fit gap-1">
              <Plus className="h-3 w-3" /> Add Another Link
            </Button>
          </div>
          <div className="grid gap-2">
            <Label>Publishing Mode</Label>
            <Select value={faqPublishMode} onValueChange={setFaqPublishMode}>
              <SelectTrigger data-testid="select-faq-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hidden">Hidden (Brand Only)</SelectItem>
                <SelectItem value="axp">Include in AXP Surface</SelectItem>
                <SelectItem value="website">Push to Main Website</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewFAQ(false)}>Cancel</Button>
          <Button
            data-testid="btn-save-faq"
            onClick={handleCreateFaq}
            disabled={createFaqEntryMutation.isPending}
          >
            {createFaqEntryMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save FAQ Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const SchemaEditorModal = () => {
    const selectedSchemaData = schemas.find((s: any) => s.id === selectedSchema);
    return (
      <Dialog open={showSchemaEditor} onOpenChange={setShowSchemaEditor}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="modal-schema-editor">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Edit {selectedSchemaData?.name || ""} Schema
            </DialogTitle>
            <DialogDescription>
              Customize the JSON-LD structured data for your brand.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg font-mono text-sm overflow-x-auto">
              <pre>{selectedSchemaData ? JSON.stringify(selectedSchemaData.template, null, 2) : "{}"}</pre>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
                <CheckCircle className="h-3 w-3" /> Valid JSON-LD
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Globe className="h-3 w-3" /> Schema.org Compatible
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSchemaEditor(false)}>Cancel</Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                if (!selectedSchemaData) return;
                navigator.clipboard.writeText(schemaTemplateToJsonLd(selectedSchemaData));
                toast({ title: "Schema JSON-LD copied" });
              }}
              data-testid="btn-copy-selected-schema"
            >
              <Copy className="h-4 w-4" />
              Copy JSON-LD
            </Button>
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button data-testid="btn-save-schema">Save Schema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const suggestions = [
    { title: `${brand?.name || "Your Brand"} vs Competitors Comparison`, reason: "Competitor dominance in comparison queries", impact: "+45 visibility" },
    { title: "Enterprise Security Features", reason: "Missing content for security-related prompts", impact: "+32 visibility" },
    { title: "Integration Guide for Developers", reason: "High-volume technical queries", impact: "+28 visibility" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <NewAXPModal />
      <NewFAQModal />
      <SchemaEditorModal />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Content & AXP
          </h1>
          <p className="text-muted-foreground mt-1">
            View AXP pages, FAQs, and schema content created by your admin.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card className="glass-card" data-testid="stat-axp-pages">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" data-testid="count-axp-pages">{axpPages.length}</p>
                <p className="text-sm text-muted-foreground">AXP Pages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-faqs">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-500/10">
                <HelpCircle className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" data-testid="count-faq-entries">{faqs.length}</p>
                <p className="text-sm text-muted-foreground">FAQ Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-schema-coverage">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Code2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" data-testid="count-schema-coverage">{schemaCoverage}%</p>
                <p className="text-sm text-muted-foreground">Schema Coverage</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card" data-testid="stat-bot-hits">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Zap className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono" data-testid="count-bot-hits">{axpPages.reduce((acc: number, p: any) => acc + (p.botViewCount || 0), 0)}</p>
                <p className="text-sm text-muted-foreground">Bot Hits (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-xl grid-cols-4">
          <TabsTrigger value="axp" className="gap-2" data-testid="tab-axp">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">AXP Pages</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-2" data-testid="tab-faq">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">FAQ Builder</span>
          </TabsTrigger>
          <TabsTrigger value="schema" className="gap-2" data-testid="tab-schema">
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">Schema</span>
          </TabsTrigger>
          <TabsTrigger value="script" className="gap-2" data-testid="tab-script">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">Script</span>
          </TabsTrigger>
        </TabsList>

        {focusedArtifactId && (
          <Card className={cn("mt-4 border-primary/30 bg-primary/5", !focusedArtifact && "border-amber-300 bg-amber-50/60")} data-testid="focused-artifact-banner">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div>
                <p className="text-sm font-medium">
                  {focusedArtifact ? "Focused artifact from Agent Readiness" : "Artifact link loaded"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {focusedArtifact
                    ? (focusedArtifact.title || focusedArtifact.question || focusedArtifact.name || focusedArtifactId)
                    : `Waiting for artifact ${focusedArtifactId} on ${activeTab.toUpperCase()}.`}
                </p>
              </div>
              <Badge variant={focusedArtifact ? "secondary" : "outline"}>{activeTab}</Badge>
            </CardContent>
          </Card>
        )}

        <TabsContent value="axp" className="space-y-4 mt-6">
          <Card className="border border-primary/20 bg-primary/5" data-testid="banner-axp-info">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">AXP Pages are managed by the AIRank Team</p>
                  <p className="text-sm text-muted-foreground">Upgrade your plan and contact the team to get your AXP hosted.</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" asChild data-testid="btn-contact-team-axp">
                      <a href="mailto:support@airank.io">Contact Team</a>
                    </Button>
                    <Link href="/app/settings?tab=billing">
                      <Button size="sm" data-testid="btn-upgrade-plan-axp">Upgrade Plan</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card" data-testid="card-axp-pages">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle>AXP Pages</CardTitle>
                  <CardDescription>View static HTML pages created by your admin for AI bot parsing.</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => publishAllAxpDraftsMutation.mutate()}
                  disabled={publishAllAxpDraftsMutation.isPending || draftAxpPages.length === 0}
                  data-testid="btn-publish-all-axp-drafts"
                >
                  {publishAllAxpDraftsMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="mr-2 h-3.5 w-3.5" />}
                  Publish drafts ({draftAxpPages.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page Title</TableHead>
                    <TableHead>URL Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bot Hits</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {axpPages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No AXP pages yet. Click "New AXP Page" to create one.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    axpPages.map((page: any) => (
                    <TableRow
                      key={page.id}
                      id={artifactElementId(page.id)}
                      className={cn(focusedArtifactId === page.id && "bg-primary/10 ring-2 ring-primary/40")}
                      data-testid={`row-axp-${page.id}`}
                    >
                      <TableCell className="font-medium">{page.title}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{page.slug}</TableCell>
                      <TableCell>
                        <Badge variant={page.status === "published" ? "outline" : "secondary"} className={cn(
                          page.status === "published" && "text-green-600 border-green-300"
                        )}>
                          {page.status === "published" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                          {page.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{page.botViewCount || 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {page.status !== "published" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => publishAxpPageMutation.mutate(page.id)}
                              disabled={publishAxpPageMutation.isPending}
                              title="Publish AXP page"
                              data-testid={`btn-publish-axp-${page.id}`}
                            >
                              {publishAxpPageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" asChild title="Open published HTML" data-testid={`btn-open-axp-html-${page.id}`}>
                              <a href={`/api/axp-pages/${page.id}/html`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" data-testid={`btn-view-axp-${page.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`btn-edit-axp-${page.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`btn-delete-axp-${page.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-axp-suggestions">
            <CardHeader>
              <CardTitle>Content Suggestions</CardTitle>
              <CardDescription>AI-generated AXP page ideas based on gap analysis and competitor coverage.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {suggestions.map((suggestion, i) => {
                  if (dismissedSuggestions.includes(i)) return null;
                  return (
                    <div key={i} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors" data-testid={`suggestion-${i}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-semibold mb-1">{suggestion.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{suggestion.reason}</p>
                          <Badge variant="secondary" className="text-green-600">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            {suggestion.impact}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1"
                            data-testid={`btn-generate-suggestion-${i}`}
                            onClick={() => handleGenerateSuggestion(suggestion, i)}
                            disabled={createAxpPageMutation.isPending}
                          >
                            {createAxpPageMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            Generate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid={`btn-dismiss-suggestion-${i}`}
                            onClick={() => setDismissedSuggestions((prev) => [...prev, i])}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {dismissedSuggestions.length === suggestions.length && (
                  <p className="text-center text-muted-foreground py-4">No more suggestions available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faq" className="space-y-4 mt-6">
          <Card className="border border-amber-500/20 bg-amber-500/5" data-testid="banner-faq-info">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <HelpCircle className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">FAQs are managed by the AIRank Team</p>
                  <p className="text-sm text-muted-foreground">Upgrade your plan and contact the team to get your FAQ hosted.</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" asChild data-testid="btn-contact-team-faq">
                      <a href="mailto:support@airank.io">Contact Team</a>
                    </Button>
                    <Link href="/app/settings?tab=billing">
                      <Button size="sm" data-testid="btn-upgrade-plan-faq">Upgrade Plan</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card" data-testid="card-faq-entries">
            <CardHeader>
              <div>
                  <CardTitle>FAQ Entries</CardTitle>
                  <CardDescription>View FAQ content created by your admin with evidence links and publishing controls.</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Publish Mode</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faqs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No FAQs yet. Click "New FAQ" to create one.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    faqs.map((faq: any) => (
                    <TableRow
                      key={faq.id}
                      id={artifactElementId(faq.id)}
                      className={cn(focusedArtifactId === faq.id && "bg-primary/10 ring-2 ring-primary/40")}
                      data-testid={`row-faq-${faq.id}`}
                    >
                      <TableCell className="font-medium max-w-xs truncate">{faq.question}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{faq.category || "-"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{(faq.evidenceUrls || []).length} links</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={faq.publishMode === "website" ? "default" : faq.publishMode === "axp" ? "secondary" : "outline"}>
                          {faq.publishMode === "website" ? "Website" : faq.publishMode === "axp" ? "AXP Only" : "Hidden"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {faq.updatedAt ? new Date(faq.updatedAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" data-testid={`btn-edit-faq-${faq.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`btn-delete-faq-${faq.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  Hidden Layer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">FAQs visible only to your brand for internal reference.</p>
                <div className="text-2xl font-bold font-mono" data-testid="count-faq-hidden">{faqs.filter((f: any) => f.publishMode === "hidden").length}</div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  AXP Surface
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">FAQs included in AXP pages for bot consumption.</p>
                <div className="text-2xl font-bold font-mono" data-testid="count-faq-axp">{faqs.filter((f: any) => f.publishMode === "axp").length}</div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-green-500" />
                  Main Website
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">FAQs pushed to your main website via script.</p>
                <div className="text-2xl font-bold font-mono" data-testid="count-faq-website">{faqs.filter((f: any) => f.publishMode === "website").length}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="space-y-4 mt-6">
          <Card className="border border-green-500/20 bg-green-500/5" data-testid="banner-schema-info">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Code2 className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">Schemas are managed by the AIRank Team</p>
                  <p className="text-sm text-muted-foreground">Upgrade your plan and contact the team to get your schema ready.</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" asChild data-testid="btn-contact-team-schema">
                      <a href="mailto:support@airank.io">Contact Team</a>
                    </Button>
                    <Link href="/app/settings?tab=billing">
                      <Button size="sm" data-testid="btn-upgrade-plan-schema">Upgrade Plan</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-primary/20" data-testid="schema-launch-deployment">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="h-5 w-5 text-primary" />
                    Schema Launch Deployment
                  </CardTitle>
                  <CardDescription>
                    Deploy homepage JSON-LD, validate Organization/WebSite/WebPage nodes, then rerun Agent Readiness to close schema launch blockers.
                  </CardDescription>
                </div>
                <Badge variant="outline" className={cn("w-fit", activeSchemaCount > 0 ? "border-green-300 text-green-700 bg-green-50" : "border-orange-300 text-orange-700 bg-orange-50")}>
                  {activeSchemaCount}/{schemas.length} active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Homepage graph</p>
                  <p className="mt-1 text-sm font-semibold">{homepageGraphSchema ? "Ready to deploy" : "Create from Agent Readiness"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Organization, WebSite, and WebPage should live in one canonical @graph.</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Validator</p>
                  <p className="mt-1 text-sm font-semibold">Schema Markup Validator</p>
                  <p className="mt-1 text-xs text-muted-foreground">Validate the published homepage URL after cache clear.</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Proof gate</p>
                  <p className="mt-1 text-sm font-semibold">Agent Readiness rescan</p>
                  <p className="mt-1 text-xs text-muted-foreground">JSON-LD, Organization, and WebSite checks must pass before launch reporting.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Use this pack for WordPress header snippets, Shopify theme.liquid, Webflow custom code, or any site head manager.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copySchemaBundle} data-testid="btn-copy-schema-bundle">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy JSON-LD bundle
                  </Button>
                  <Button size="sm" variant="outline" onClick={copySchemaChecklist} data-testid="btn-copy-schema-deployment-checklist">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Copy QA checklist
                  </Button>
                  <Button size="sm" variant="outline" asChild data-testid="btn-open-schema-validator">
                    <a href={brand?.domain ? `https://validator.schema.org/#url=${encodeURIComponent(`https://${String(brand.domain).replace(/^https?:\/\//, "")}`)}` : "https://validator.schema.org/"} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open validator
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card" data-testid="card-schema-templates">
            <CardHeader>
              <CardTitle>Schema / JSON-LD Manager</CardTitle>
              <CardDescription>Configure structured data templates with brand-specific overrides and validation.</CardDescription>
            </CardHeader>
            <CardContent>
              {schemas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Code2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No schema templates yet.</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {schemas.map((schema: any) => (
                    <Card 
                      key={schema.id} 
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        schema.isActive && "border-green-200 bg-green-50/30",
                        !schema.isActive && "border-gray-200 opacity-60",
                        focusedArtifactId === schema.id && "ring-2 ring-primary/50 border-primary bg-primary/10"
                      )}
                      id={artifactElementId(schema.id)}
                      onClick={() => {
                        setSelectedSchema(schema.id);
                        setShowSchemaEditor(true);
                      }}
                      data-testid={`schema-${schema.id}`}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {getSchemaIcon(schema.schemaType)}
                            <div>
                              <h4 className="font-semibold">{schema.name}</h4>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs mt-1",
                                  schema.isActive && "text-green-600 border-green-300",
                                  !schema.isActive && "text-gray-500"
                                )}
                              >
                                {schema.isActive ? "active" : "inactive"}
                              </Badge>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-mono font-medium">{schema.schemaType}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-schema-metrics">
            <CardHeader>
              <CardTitle>Schema Coverage Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-4xl font-bold font-mono text-green-600" data-testid="metric-overall-coverage">{schemaCoverage}%</div>
                  <p className="text-sm text-muted-foreground mt-1">Overall Coverage</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-4xl font-bold font-mono" data-testid="metric-active-schemas">{schemas.filter((s: any) => s.isActive).length}</div>
                  <p className="text-sm text-muted-foreground mt-1">Active Schemas</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-4xl font-bold font-mono" data-testid="metric-total-schemas">{schemas.length}</div>
                  <p className="text-sm text-muted-foreground mt-1">Total Schemas</p>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="gap-2" data-testid="btn-revalidate-schemas">
                  <RefreshCw className="h-4 w-4" />
                  Re-validate All
                </Button>
                <Button variant="outline" className="gap-2" onClick={copySchemaBundle} data-testid="btn-export-schemas">
                  <Download className="h-4 w-4" />
                  Export All Schemas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="script" className="space-y-4 mt-6">
          <Card className="border border-blue-500/20 bg-blue-500/5" data-testid="banner-script-info">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">The script below will host your FAQ, Schema, and AXP content so AI bots can access them effectively.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card" data-testid="card-script-verification">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1",
                      brand?.scriptInstalled
                        ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                        : "text-orange-700 border-orange-300 bg-orange-50",
                    )}
                  >
                    {brand?.scriptInstalled ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {brand?.scriptInstalled ? "Detected" : "Not Detected"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Verify script installation on your live domain.
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  data-testid="btn-verify-script-top"
                  disabled={verifyingScript || brand?.scriptInstalled}
                  onClick={verifyScriptInstallation}
                >
                  {verifyingScript ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {brand?.scriptInstalled ? "Verified" : "Verify Installation"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card" data-testid="card-script-config">
            <CardHeader>
              <CardTitle>Script Provider Configuration</CardTitle>
              <CardDescription>Generate and customize embed scripts for your website.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Script Controls</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label>AXP Link Injection</Label>
                        <p className="text-xs text-muted-foreground">Add navigation links to AXP pages</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label>Schema Injection</Label>
                        <p className="text-xs text-muted-foreground">Auto-inject JSON-LD on page load</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label>FAQ Widget</Label>
                        <p className="text-xs text-muted-foreground">Embed FAQ accordion component</p>
                      </div>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label>Analytics Tracking</Label>
                        <p className="text-xs text-muted-foreground">Track bot visits and interactions</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="font-medium">Brand Configuration</h4>
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label>Brand ID</Label>
                      <Input value={brandId || ""} disabled className="font-mono" />
                    </div>
                    <div className="grid gap-2">
                      <Label>AXP Base URL</Label>
                      <Input defaultValue="/axp" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Script Version</Label>
                      <Select defaultValue="latest">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="latest">Latest (1.2.0)</SelectItem>
                          <SelectItem value="1.1.0">1.1.0</SelectItem>
                          <SelectItem value="1.0.0">1.0.0</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-embed-script">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Embed Script
              </CardTitle>
              <CardDescription>Copy this script and paste it before the closing &lt;/head&gt; tag on your website.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-sm overflow-x-auto">
                <pre>{`<!-- AIRank Config (CDN loader disabled for now) -->
<script>
  window.AIRankConfig = {
    configId: '${brand?.configBrandId || ""}',
    brandId: '${brandId || ""}',
    axpEnabled: true,
    schemaEnabled: true,
    faqEnabled: true,
    analyticsEnabled: true,
    axpBaseUrl: '/axp'
  };
</script>`}</pre>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  className={cn(
                    "gap-2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
                    scriptCopied && "bg-emerald-600 hover:bg-emerald-600 text-white",
                  )}
                  data-testid="btn-copy-script"
                  onClick={async () => {
                    const script = `<!-- AIRank Config (CDN loader disabled for now) -->\n<script>\n  window.AIRankConfig = {\n    configId: '${brand?.configBrandId || ""}',\n    brandId: '${brandId || ""}',\n    axpEnabled: true,\n    schemaEnabled: true,\n    faqEnabled: true,\n    analyticsEnabled: true,\n    axpBaseUrl: '/axp'\n  };\n</script>`;
                    await navigator.clipboard.writeText(script);
                    setScriptCopied(true);
                    toast({ title: "Copied!", description: "Script copied to clipboard" });
                    setTimeout(() => setScriptCopied(false), 1600);
                  }}
                >
                  {scriptCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {scriptCopied ? "Copied" : "Copy Script"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  data-testid="btn-verify-script"
                  disabled={verifyingScript || brand?.scriptInstalled}
                  onClick={verifyScriptInstallation}
                >
                  {verifyingScript ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {brand?.scriptInstalled ? "Verified" : "Verify Installation"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Detection checks your homepage HTML for <code>AIRankConfig</code> and config ID <code>{brand?.configBrandId || "-"}</code>.
              </p>
              {scriptStatus && (
                <div
                  className={cn(
                    "mt-4 rounded-lg border p-3 text-sm",
                    scriptStatus.verified
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-orange-200 bg-orange-50 text-orange-700",
                  )}
                  data-testid="script-verify-status"
                >
                  {scriptStatus.message}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-json-config">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                JSON Configuration Endpoint
              </CardTitle>
              <CardDescription>Your dynamic configuration is available at this URL for advanced integrations.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="flex-1 font-mono text-sm">https://api.airank.io/v1/config/{brand?.configBrandId || brandId || ""}</code>
                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(`https://api.airank.io/v1/config/${brand?.configBrandId || brandId || ""}`)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
