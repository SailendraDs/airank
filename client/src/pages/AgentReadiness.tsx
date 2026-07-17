import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Wrench,
  ShoppingBag,
  PackageCheck,
  Save,
  TrendingUp,
  ListChecks,
  Copy,
  Download,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const GRADE_COLORS: Record<string, string> = {
  excellent: "text-emerald-600",
  good: "text-blue-600",
  fair: "text-amber-600",
  poor: "text-red-600",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-200 bg-red-50 dark:bg-red-950/30",
  warning: "border-amber-200 bg-amber-50 dark:bg-amber-950/30",
  info: "border-slate-200 bg-slate-50 dark:bg-slate-900/30",
};

type CatalogImportMode = "json" | "csv";

type CatalogValidation = {
  products: any[];
  errors: string[];
  warnings: string[];
  stats: {
    products: number;
    identifiers: number;
    competitors: number;
    claims: number;
    objections: number;
  };
};

const PUBLISH_CHANNELS = [
  { id: "schema", label: "Schema" },
  { id: "faq", label: "FAQ" },
  { id: "cms_export", label: "CMS" },
  { id: "axp", label: "AXP" },
] as const;

const JSON_CATALOG_TEMPLATE = [
  {
    name: "Hero Product",
    asin: "B0XXXXXXXX",
    marketplace: "amazon.in",
    category: "Home",
    productUrl: "https://www.amazon.in/dp/B0XXXXXXXX",
    priceBand: "INR 999-1499",
    priority: "high",
    competitors: [{ name: "Competitor Product", asin: "B0YYYYYYYY" }],
    claims: ["fast setup", "trusted proof", "clear use case"],
    objections: ["price"],
  },
];

const CSV_CATALOG_TEMPLATE = [
  "name,asin,sku,marketplace,category,productUrl,priceBand,priority,competitors,claims,objections",
  "Hero Product,B0XXXXXXXX,,amazon.in,Home,https://www.amazon.in/dp/B0XXXXXXXX,INR 999-1499,high,Competitor Product::B0YYYYYYYY,fast setup|trusted proof|clear use case,price",
].join("\n");

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseDelimitedList(value: string): string[] {
  return value.split("|").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function parseCompetitors(value: string) {
  return value.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const [name, asin] = item.split("::");
    return { name: (name || item).trim(), asin: asin?.trim() || null };
  });
}

function parseCatalogCsv(value: string): any[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] || "";
      return acc;
    }, {});
    return {
      name: row.name || row.title || row.product,
      asin: row.asin || null,
      sku: row.sku || null,
      marketplace: row.marketplace || null,
      category: row.category || null,
      productUrl: row.producturl || row.url || null,
      priceBand: row.priceband || row.price || null,
      priority: ["high", "medium", "low"].includes(row.priority) ? row.priority : "medium",
      competitors: parseCompetitors(row.competitors || ""),
      claims: parseDelimitedList(row.claims || ""),
      objections: parseDelimitedList(row.objections || ""),
    };
  });
}

function validateCatalog(products: any[]): CatalogValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  products.forEach((product, index) => {
    const row = index + 1;
    const name = String(product?.name || product?.title || "").trim();
    const asin = product?.asin ? String(product.asin).trim().toUpperCase() : "";
    const sku = product?.sku ? String(product.sku).trim() : "";
    const key = asin || sku || name.toLowerCase();

    if (!name) errors.push(`Row ${row}: product name is required.`);
    if (!asin && !sku) warnings.push(`Row ${row}: add ASIN or SKU for product-level tracking.`);
    if (asin && !/^B0[A-Z0-9]{8}$/.test(asin)) warnings.push(`Row ${row}: ASIN should look like B0XXXXXXXX.`);
    if (!product?.productUrl && !product?.url) warnings.push(`Row ${row}: add product URL for citation checks.`);
    if (!Array.isArray(product?.competitors) || product.competitors.length === 0) warnings.push(`Row ${row}: add at least one competing product.`);
    if (!Array.isArray(product?.claims) || product.claims.length < 2) warnings.push(`Row ${row}: add 2 or more proof-backed claims.`);
    if (!Array.isArray(product?.objections) || product.objections.length === 0) warnings.push(`Row ${row}: add buyer objections.`);
    if (key && seen.has(key)) errors.push(`Row ${row}: duplicate product identifier.`);
    if (key) seen.add(key);
  });

  return {
    products,
    errors,
    warnings,
    stats: {
      products: products.length,
      identifiers: products.filter((product) => product?.asin || product?.sku).length,
      competitors: products.filter((product) => Array.isArray(product?.competitors) && product.competitors.length > 0).length,
      claims: products.filter((product) => Array.isArray(product?.claims) && product.claims.length >= 2).length,
      objections: products.filter((product) => Array.isArray(product?.objections) && product.objections.length > 0).length,
    },
  };
}

function parseCatalogDraft(value: string, mode: CatalogImportMode): CatalogValidation {
  if (!value.trim()) return validateCatalog([]);
  if (mode === "csv") return validateCatalog(parseCatalogCsv(value));
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Catalog JSON must be an array of products");
  return validateCatalog(parsed);
}

function extractJsonLdTemplate(code: string) {
  const match = code.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  const rawJson = (match?.[1] || code).trim();
  try {
    return JSON.parse(rawJson);
  } catch {
    return {
      "@context": "https://schema.org",
      rawSnippet: code,
    };
  }
}

function schemaTemplateToSnippet(schema: any) {
  const template = schema?.template || {};
  const payload = typeof template === "string" ? template : JSON.stringify(template, null, 2);
  if (/application\/ld\+json/i.test(payload)) return payload;
  return `<script type="application/ld+json">\n${payload}\n</script>`;
}

function buildExistingSchemaDeployPack(schema: any, brand: any) {
  if (!schema) return null;
  const cleanDomain = String(brand?.domain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#\s]/)[0];
  const homepageUrl = cleanDomain ? `https://${cleanDomain}` : String(brand?.domain || "");
  const validatorUrl = homepageUrl
    ? `https://validator.schema.org/#url=${encodeURIComponent(homepageUrl)}`
    : "https://validator.schema.org/";
  return {
    title: schema.name || "Homepage AI Readiness Schema Fix Pack",
    target: {
      page: "Homepage",
      placement: "Inside the <head> before the closing </head> tag",
      domain: cleanDomain || brand?.domain,
      url: homepageUrl,
    },
    files: [
      {
        path: "homepage-head-jsonld.html",
        language: "html",
        description: "Paste this JSON-LD block into the homepage head after replacing placeholder logo/social URLs.",
        content: schemaTemplateToSnippet(schema),
      },
      {
        path: "agent-readiness-qa.md",
        language: "markdown",
        description: "Developer QA checklist for the schema deployment.",
        content: [
          "# Agent Readiness Schema QA",
          "",
          `Brand: ${brand?.name || "Brand"}`,
          `Homepage: ${homepageUrl || brand?.domain || "Homepage"}`,
          "",
          "## Before Publish",
          "- Replace placeholder logo URL with the final public logo asset.",
          "- Replace placeholder sameAs links with official brand profiles only.",
          "- Confirm Organization @id, WebSite @id, and WebPage @id use the canonical domain.",
          "- Keep one JSON-LD @graph block on the homepage to avoid conflicting duplicate entity facts.",
          "",
          "## After Publish",
          `- Validate the page in Schema Markup Validator: ${validatorUrl}`,
          "- Confirm Organization, WebSite, and WebPage nodes are detected.",
          "- Open view-source and confirm application/ld+json appears on the homepage.",
          "- Rerun AIRank Agent Readiness and verify JSON-LD, Organization schema, and WebSite schema pass.",
        ].join("\n"),
      },
    ],
    cmsInstall: [
      { platform: "WordPress", steps: ["Add the JSON-LD through the theme header, a code-snippet plugin, or SEO/schema plugin custom schema field.", "Clear page/cache/CDN cache.", "View source to confirm the script renders for logged-out visitors."] },
      { platform: "Shopify", steps: ["Add the JSON-LD to theme.liquid inside <head> or the homepage template section.", "Avoid duplicating Organization schema emitted by another app.", "Preview and validate the live homepage."] },
      { platform: "Webflow/Framer", steps: ["Add the JSON-LD in custom code for the homepage head.", "Publish the site, not only preview.", "Validate the published canonical URL."] },
      { platform: "Next.js/React", steps: ["Render the script in the homepage head using the framework Head/metadata mechanism.", "Use type application/ld+json and escaped JSON output.", "Deploy and verify server-rendered HTML contains the block."] },
    ],
    validation: {
      validatorUrl,
      requiredNodes: ["Organization", "WebSite", "WebPage"],
      acceptanceCriteria: [
        "Schema validator detects Organization, WebSite, and WebPage without critical errors.",
        "Organization name and url match the brand and canonical homepage.",
        "WebSite publisher points to the Organization @id.",
        "AIRank Agent Readiness marks JSON-LD, Organization schema, and WebSite schema as passing.",
      ],
    },
  };
}

function schemaTypeForIssue(issue: any) {
  if (issue?.id === "organization_schema") return "Organization";
  if (issue?.id === "website_schema") return "WebSite";
  if (issue?.id === "product_schema") return "Product";
  if (issue?.id === "json_ld_present") return "HomepageGraph";
  return "JSONLD";
}

async function loadRazorpay(): Promise<void> {
  if (typeof (window as any).Razorpay === "function") return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

type AgentReadinessProps = {
  productOnly?: boolean;
  hideTopBar?: boolean;
};

export default function AgentReadiness({ productOnly = false, hideTopBar = false }: AgentReadinessProps) {
  const { brand, brandId } = useCurrentBrand();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [catalogImportMode, setCatalogImportMode] = useState<CatalogImportMode>("json");
  const [catalogDraft, setCatalogDraft] = useState("");
  const [serverCatalogValidation, setServerCatalogValidation] = useState<any>(null);
  const [actionExportPreview, setActionExportPreview] = useState("");
  const [clientReportPreview, setClientReportPreview] = useState("");
  const [clientReportData, setClientReportData] = useState<any>(null);
  const [actionDraftPreview, setActionDraftPreview] = useState("");
  const [actionDraftPack, setActionDraftPack] = useState<any>(null);
  const [schemaFixDeployPack, setSchemaFixDeployPack] = useState<any>(null);
  const [selectedDraftActionId, setSelectedDraftActionId] = useState("");
  const [draftReviewNote, setDraftReviewNote] = useState("");
  const [draftAssignee, setDraftAssignee] = useState("");

  const { data: report, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/brands", brandId, "agent-readiness"],
    queryFn: () => api.getAgentReadiness(brandId!),
    enabled: Boolean(brandId),
  });

  const { data: offersData } = useQuery({
    queryKey: ["/api/brands", brandId, "addon-offers"],
    queryFn: () => api.getBrandAddonOffers(brandId!),
    enabled: Boolean(brandId),
  });

  const { data: productReadiness, isLoading: productReadinessLoading } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-readiness"],
    queryFn: () => api.getProductReadiness(brandId!),
    enabled: Boolean(brandId),
  });

  const { data: schemaTemplates = [] } = useQuery<any[]>({
    queryKey: ["schemaTemplates", brandId],
    queryFn: () => api.getSchemaTemplates(brandId!),
    enabled: Boolean(brandId),
  });

  const { data: productCatalog } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-catalog"],
    queryFn: () => api.getProductCatalog(brandId!),
    enabled: Boolean(brandId),
  });

  const { data: productImportHistory } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-catalog", "import-history"],
    queryFn: () => api.getProductCatalogImportHistory(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  const { data: productPlaybook } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-playbook"],
    queryFn: () => api.getProductPlaybook(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  const { data: productVisibility } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-visibility"],
    queryFn: () => api.getProductVisibility(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  const { data: productVisibilityHistory } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-visibility", "history"],
    queryFn: () => api.getProductVisibilityHistory(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  const { data: productVisibilityActions } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-visibility", "actions"],
    queryFn: () => api.getProductVisibilityActions(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  const { data: productVisibilityPublishQueue } = useQuery<any>({
    queryKey: ["/api/brands", brandId, "product-visibility", "publish-queue"],
    queryFn: () => api.getProductVisibilityPublishQueue(brandId!),
    enabled: Boolean(productOnly && brandId && productReadiness?.relevant),
  });

  useEffect(() => {
    if (productCatalog?.products && !catalogDraft) {
      setCatalogDraft(JSON.stringify(productCatalog.products, null, 2));
    }
  }, [productCatalog, catalogDraft]);

  const catalogValidation = useMemo<CatalogValidation>(() => {
    try {
      return parseCatalogDraft(catalogDraft, catalogImportMode);
    } catch (err: any) {
      return {
        products: [],
        errors: [err.message || "Catalog import could not be parsed."],
        warnings: [],
        stats: { products: 0, identifiers: 0, competitors: 0, claims: 0, objections: 0 },
      };
    }
  }, [catalogDraft, catalogImportMode]);

  const homepageSchemaDeployPack = useMemo(() => {
    const homepageSchema = (schemaTemplates || []).find((schema: any) => (
      schema?.isActive !== false
      && (schema?.schemaType === "HomepageGraph" || schema?.name === "Homepage AI Readiness Schema Fix Pack")
    ));
    return buildExistingSchemaDeployPack(homepageSchema, brand);
  }, [brand, schemaTemplates]);

  const activeSchemaDeployPack = schemaFixDeployPack || homepageSchemaDeployPack;

  const selectedDraft = useMemo(() => {
    const drafts = actionDraftPack?.drafts || [];
    return drafts.find((draft: any) => draft.actionId === selectedDraftActionId) || drafts[0] || null;
  }, [actionDraftPack, selectedDraftActionId]);

  const schemaFixIssues = useMemo(() => {
    const checks = [...(report?.checks || []), ...(report?.topIssues || [])];
    const byId = new Map<string, any>();
    checks.forEach((issue: any) => {
      if (!["json_ld_present", "organization_schema", "website_schema"].includes(String(issue?.id || ""))) return;
      if (issue?.passed) return;
      byId.set(issue.id, issue);
    });
    return Array.from(byId.values());
  }, [report?.checks, report?.topIssues]);

  const agentScoreLiftGap = useMemo(() => {
    if (productOnly || !report?.hasReport) return null;
    const score = Number(report?.score || 0);
    if (score >= 75) return null;
    const issues = Array.isArray(report?.topIssues) ? report.topIssues : [];
    const schemaIssueCount = issues.filter((issue: any) => ["json_ld_present", "organization_schema", "website_schema"].includes(String(issue?.id || ""))).length;
    return {
      score,
      target: 75,
      gap: Math.max(0, 75 - score),
      issueCount: Number(report?.issueCount || issues.length || 0),
      schemaIssueCount,
    };
  }, [productOnly, report?.hasReport, report?.issueCount, report?.score, report?.topIssues]);

  useEffect(() => {
    if (!selectedDraft) return;
    setDraftReviewNote(selectedDraft.note || "");
    setDraftAssignee(selectedDraft.assignee || "");
  }, [selectedDraft?.actionId]);

  const catalogMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      const validation = parseCatalogDraft(catalogDraft, catalogImportMode);
      if (validation.errors.length > 0) throw new Error(validation.errors[0]);
      return api.updateProductCatalog(brandId, validation.products, catalogImportMode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-catalog", "import-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-readiness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-playbook"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-visibility", "actions"] });
      toast({ title: "Product catalog saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Catalog import failed", description: err.message, variant: "destructive" });
    },
  });

  const catalogValidationMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      return api.validateProductCatalogImport(brandId, {
        mode: catalogImportMode,
        input: catalogDraft,
      });
    },
    onSuccess: (validation: any) => {
      setServerCatalogValidation(validation);
      toast({
        title: validation.valid ? "Catalog validation passed" : "Catalog validation needs fixes",
        description: validation.valid ? `${validation.stats.products} product${validation.stats.products === 1 ? "" : "s"} ready to save.` : validation.errors?.[0],
        variant: validation.valid ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      setServerCatalogValidation(null);
      toast({ title: "Server validation failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilitySnapshotMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      return api.saveProductVisibilitySnapshot(brandId);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-visibility", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-visibility", "actions"] });
      toast({
        title: "Product visibility snapshot saved",
        description: `${result?.snapshot?.products?.length || 0} SKU${result?.snapshot?.products?.length === 1 ? "" : "s"} captured for trend tracking.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Snapshot failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityActionMutation = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: "todo" | "in_progress" | "blocked" | "done" }) => {
      if (!brandId) throw new Error("No brand selected");
      return api.updateProductVisibilityActionStatus(brandId, actionId, status);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-visibility", "actions"] });
      toast({ title: "Action updated", description: `Status changed to ${variables.status.replace("_", " ")}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Action update failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityActionExportMutation = useMutation({
    mutationFn: (format: "markdown" | "csv") => {
      if (!brandId) throw new Error("No brand selected");
      return api.getProductVisibilityActionExport(brandId).then((exportPack: any) => ({ exportPack, format }));
    },
    onSuccess: async ({ exportPack, format }: any) => {
      if (format === "csv") {
        const blob = new Blob([exportPack.csv || ""], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${exportPack.filenameBase || "product-visibility-actions"}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast({ title: "CSV exported", description: "Product visibility actions downloaded." });
        return;
      }
      setActionExportPreview(exportPack.markdown || "");
      try {
        await navigator.clipboard.writeText(exportPack.markdown || "");
        toast({ title: "Action pack copied", description: "Markdown action pack copied to clipboard." });
      } catch {
        toast({ title: "Action pack ready", description: "Markdown export is shown below for review." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityClientReportMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      return api.getProductVisibilityClientReport(brandId);
    },
    onSuccess: async (clientReport: any) => {
      setClientReportPreview(clientReport.markdown || "");
      setClientReportData(clientReport);
      const blob = new Blob([clientReport.html || clientReport.markdown || ""], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${clientReport.filenameBase || "product-visibility-client-report"}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      try {
        await navigator.clipboard.writeText(clientReport.markdown || "");
      } catch {
        // Clipboard access is optional; the preview remains available in-page.
      }
      toast({
        title: "Client report generated",
        description: `${String(clientReport.launchVerdict || "needs_review").replace("_", " ")} report downloaded for review.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Client report failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityClientReportPdfMutation = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand selected");
      const blob = await api.downloadProductVisibilityClientReportPdf(brandId);
      return { blob };
    },
    onSuccess: ({ blob }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${brand?.name ? brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "brand"}-product-visibility-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: "PDF report downloaded", description: "Product visibility report is ready to share." });
    },
    onError: (err: Error) => {
      toast({ title: "PDF report failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityDraftMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      return api.getProductVisibilityDrafts(brandId);
    },
    onSuccess: (draftPack: any) => {
      setActionDraftPack(draftPack);
      setActionDraftPreview(draftPack.markdown || "");
      setSelectedDraftActionId(draftPack.drafts?.[0]?.actionId || "");
      toast({ title: "Drafts generated", description: draftPack.summary });
    },
    onError: (err: Error) => {
      toast({ title: "Draft generation failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityDraftStatusMutation = useMutation({
    mutationFn: ({ actionId, status, markdown, note, assignee }: { actionId: string; status: "draft" | "in_review" | "approved" | "rejected"; markdown?: string; note?: string; assignee?: string }) => {
      if (!brandId) throw new Error("No brand selected");
      return api.updateProductVisibilityDraftStatus(brandId, actionId, status, note, markdown, assignee);
    },
    onSuccess: (result: any, variables) => {
      setActionDraftPack(result.draftPack);
      setActionDraftPreview(result.draftPack?.markdown || "");
      setSelectedDraftActionId(variables.actionId);
      toast({ title: "Draft updated", description: `Draft marked ${variables.status.replace("_", " ")}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Draft update failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityPublishMutation = useMutation({
    mutationFn: ({ actionId, channel }: { actionId: string; channel: typeof PUBLISH_CHANNELS[number]["id"] }) => {
      if (!brandId) throw new Error("No brand selected");
      return api.queueProductVisibilityDraftPublish(brandId, actionId, channel);
    },
    onSuccess: (result: any) => {
      queryClient.setQueryData(["/api/brands", brandId, "product-visibility", "publish-queue"], result);
      toast({
        title: "Draft queued",
        description: `${result.item?.title || "Approved draft"} added to ${String(result.item?.channel || "publish").replace("_", " ")} handoff.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Publish queue failed", description: err.message, variant: "destructive" });
    },
  });

  const productVisibilityPublishQueueMutation = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => {
      if (!brandId) throw new Error("No brand selected");
      return api.publishProductVisibilityQueueItem(brandId, itemId);
    },
    onSuccess: (result: any) => {
      queryClient.setQueryData(["/api/brands", brandId, "product-visibility", "publish-queue"], result);
      queryClient.invalidateQueries({ queryKey: ["axpPages", brandId] });
      queryClient.invalidateQueries({ queryKey: ["faqEntries", brandId] });
      queryClient.invalidateQueries({ queryKey: ["schemaTemplates", brandId] });
      toast({
        title: "Artifact published",
        description: `${result.item?.artifact?.label || "Draft"} is now available in Content & AXP.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => {
      if (report?.access === "full") {
        return api.runAgentReadinessFullScan(brandId!);
      }
      return api.runAgentReadinessTeaser(brandId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "agent-readiness"] });
      toast({ title: "Scan complete" });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const createIssueTaskMutation = useMutation({
    mutationFn: (issue: any) => api.createAgentReadinessImplementationTask(brandId || "", issue.id, issue),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] });
      toast({
        title: result?.duplicate ? "Task already exists" : "Task added to Action Workflow",
        description: result?.duplicate ? "This Agent Readiness fix is already being tracked." : "Open Action Workflow to plan, apply, and verify the fix.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Task creation failed", description: err.message, variant: "destructive" });
    },
  });

  const schemaFixPackMutation = useMutation({
    mutationFn: () => {
      if (!brandId) throw new Error("No brand selected");
      return api.createAgentReadinessSchemaFixPack(brandId);
    },
    onSuccess: (result: any) => {
      setSchemaFixDeployPack(result?.deployPack || null);
      queryClient.invalidateQueries({ queryKey: ["schemaTemplates", brandId] });
      queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId, "optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] });
      toast({
        title: result?.ready ? "Schema checks already pass" : "Schema fix pack created",
        description: result?.ready
          ? result.message
          : result?.duplicateTask
            ? "Existing schema task reused and the homepage schema asset is ready in Content & AXP."
            : "Homepage JSON-LD asset and Action Workflow task are ready.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Schema fix pack failed", description: err.message, variant: "destructive" });
    },
  });

  const saveIssueSchemaMutation = useMutation({
    mutationFn: (issue: any) => {
      if (!brandId) throw new Error("No brand selected");
      const code = issue?.implementationCode?.code;
      if (!code) throw new Error("No schema snippet available for this issue.");
      return api.createSchemaTemplate(brandId, {
        name: `${issue.label || "Agent Readiness"} fix`,
        schemaType: schemaTypeForIssue(issue),
        template: extractJsonLdTemplate(code),
        isActive: true,
        isGlobal: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schemaTemplates", brandId] });
      toast({
        title: "Schema saved",
        description: "The implementation snippet is now available in Content & AXP Schema Manager.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Schema save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAddonCheckout = async (offerId: string) => {
    if (!brandId) return;
    setCheckoutLoading(offerId);
    try {
      const checkout = await api.checkoutAddonOffer(brandId, offerId);
      await loadRazorpay();
      const RazorpayCtor = (window as any).Razorpay;
      const rzp = new RazorpayCtor({
        key: checkout.razorpayKeyId,
        amount: checkout.amountInr * 100,
        currency: "INR",
        order_id: checkout.razorpayOrderId,
        name: "AIRank",
        description: checkout.offerTitle,
        handler: async (response: any) => {
          await api.verifyAddonPayment(brandId, {
            purchaseId: checkout.purchaseId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          toast({ title: "Payment successful", description: "Our team will reach out to schedule implementation." });
          queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "addon-offers"] });
        },
      });
      rzp.open();
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const copyImplementationCode = async (issue: any) => {
    const code = issue?.implementationCode?.code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast({ title: "Fix snippet copied", description: `${issue.implementationCode.title || issue.label} copied to clipboard.` });
  };

  const renderIssueImplementation = (issue: any) => {
    if (!issue?.whyItMatters && !issue?.implementationCode && !issue?.verificationSteps?.length && !issue?.owner) return null;
    return (
      <div className="mt-3 space-y-3 rounded-md border bg-background/70 p-3 text-xs">
        <div className="flex flex-wrap gap-2">
          {issue.owner ? <Badge variant="outline" className="capitalize">Owner: {String(issue.owner).replace("_", " ")}</Badge> : null}
          {issue.estimatedEffort ? <Badge variant="outline">Effort: {issue.estimatedEffort}</Badge> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={() => createIssueTaskMutation.mutate(issue)}
            disabled={createIssueTaskMutation.isPending || !brandId}
            data-testid={`button-create-fix-task-${issue.id}`}
          >
            {createIssueTaskMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ListChecks className="mr-2 h-3.5 w-3.5" />}
            Add to Action Workflow
          </Button>
          {issue.implementationCode?.code ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveIssueSchemaMutation.mutate(issue)}
              disabled={saveIssueSchemaMutation.isPending || !brandId}
              data-testid={`button-save-schema-${issue.id}`}
            >
              {saveIssueSchemaMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Save schema asset
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setLocation("/app/action-plan")}>
            Open workflow
          </Button>
          {issue.implementationCode?.code ? (
            <Button variant="ghost" size="sm" onClick={() => setLocation("/app/content-axp?tab=schema")}>
              Open Schema Manager
            </Button>
          ) : null}
        </div>
        {issue.whyItMatters ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Why it matters: </span>
            {issue.whyItMatters}
          </p>
        ) : null}
        {issue.implementationCode?.code ? (
          <div className="rounded-md border bg-muted/40">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
              <p className="font-medium">{issue.implementationCode.title || "Implementation snippet"}</p>
              <Button variant="ghost" size="sm" onClick={() => copyImplementationCode(issue)} data-testid={`button-copy-fix-${issue.id}`}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed">
              {issue.implementationCode.code}
            </pre>
          </div>
        ) : null}
        {issue.verificationSteps?.length > 0 ? (
          <div>
            <p className="font-medium text-foreground">How to verify after publishing</p>
            <ol className="mt-1 space-y-1 text-muted-foreground">
              {issue.verificationSteps.slice(0, 4).map((step: string, index: number) => (
                <li key={`${issue.id}-verify-${index}`} className="flex gap-2">
                  <span className="font-mono text-primary">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    );
  };

  if (!brandId) {
    return (
      <div className="p-6">
        {!hideTopBar && <TopBar title={productOnly ? "Product Readiness" : "Agent Readiness"} />}
        <p className="text-muted-foreground">Select a brand to view {productOnly ? "product readiness" : "agent readiness"}.</p>
      </div>
    );
  }

  const access = report?.access || "teaser";
  const locked = report?.locked ?? true;
  const offers = offersData?.offers || [];
  const hasProductCatalog = Number(productCatalog?.count || productReadiness?.metrics?.catalogProducts || 0) > 0;
  const productReadinessAvailable = Boolean(productOnly || productReadiness?.relevant);
  const shouldShowProductReadiness = Boolean(productOnly && productReadiness && productReadinessAvailable);

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {!hideTopBar && <TopBar title={productOnly ? "Product Readiness" : "Agent Readiness"} />}

      {productOnly && productReadinessLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {productOnly && !productReadinessLoading && !productReadiness && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Product Readiness could not be loaded for this brand.</p>
          </CardContent>
        </Card>
      )}

      {!productOnly && (
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            Is your site agent-ready?
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            How well AI shopping agents and LLM crawlers can understand and recommend {brand?.domain}.
            {brand?.businessChannel === "amazon_seller" && (
              <span className="block mt-1 text-sm">
                Amazon listing pages cannot be modified — this report covers your owned storefront only.
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || (access !== "full" && report?.hasReport)}
        >
          {scanMutation.isPending || isFetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {access === "full" ? "Run full scan" : "Refresh teaser"}
        </Button>
      </div>
      )}

      {!productOnly && (isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !report?.hasReport ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No agent readiness scan yet.</p>
            <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              {scanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Run teaser scan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-5xl font-bold", GRADE_COLORS[report.grade] || "text-foreground")}>
                  {report.score}
                  <span className="text-lg text-muted-foreground font-normal">/100</span>
                </div>
                <Badge variant="outline" className="mt-2 capitalize">{report.grade}</Badge>
                <Progress value={report.score} className="mt-4 h-2" />
                <p className="text-xs text-muted-foreground mt-3">
                  {report.issueCount} issue{report.issueCount === 1 ? "" : "s"} found
                  {report.scannedAt && ` · Last scan ${new Date(report.scannedAt).toLocaleDateString()}`}
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Top issues</CardTitle>
                <CardDescription>
                  {locked ? "Fix plan preview for the highest-priority blockers. Upgrade for full category breakdown." : "Prioritized fixes for AI agent discovery."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {schemaFixIssues.length > 0 && (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-4" data-testid="schema-fix-pack-card">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Homepage schema fix pack</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Bundle the JSON-LD, Organization, and WebSite/WebPage fixes into one schema asset and one tracked workflow task.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {schemaFixIssues.map((issue: any) => (
                            <Badge key={issue.id} variant="outline">{issue.label}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                        <Button
                          onClick={() => schemaFixPackMutation.mutate()}
                          disabled={schemaFixPackMutation.isPending || !brandId}
                          data-testid="button-create-schema-fix-pack"
                        >
                          {schemaFixPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Create fix pack
                        </Button>
                        <Button variant="outline" onClick={() => setLocation("/app/content-axp?tab=schema")} data-testid="button-open-schema-manager-from-pack">
                          Open Schema Manager
                        </Button>
                      </div>
                    </div>
                    {activeSchemaDeployPack && (
                      <div className="mt-4 rounded-md border bg-background p-3" data-testid="schema-fix-deploy-pack">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Deployable implementation pack</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {activeSchemaDeployPack.target?.page} · {activeSchemaDeployPack.target?.placement}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {activeSchemaDeployPack.validation?.validatorUrl && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={activeSchemaDeployPack.validation.validatorUrl} target="_blank" rel="noreferrer">
                                  Open validator
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigator.clipboard?.writeText(activeSchemaDeployPack.files?.[0]?.content || "")}
                              data-testid="button-copy-schema-fix-snippet"
                            >
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              Copy snippet
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {(activeSchemaDeployPack.validation?.requiredNodes || []).map((node: string) => (
                            <Badge key={node} variant="secondary">{node}</Badge>
                          ))}
                        </div>
                        <Textarea
                          className="mt-3 min-h-[180px] font-mono text-xs"
                          readOnly
                          value={activeSchemaDeployPack.files?.[0]?.content || ""}
                          data-testid="textarea-schema-fix-snippet"
                        />
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {(activeSchemaDeployPack.validation?.acceptanceCriteria || []).slice(0, 4).map((criterion: string) => (
                            <div key={criterion} className="flex gap-2 rounded-md bg-muted/40 p-2 text-xs">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>{criterion}</span>
                            </div>
                          ))}
                        </div>
                        {(activeSchemaDeployPack.cmsInstall || []).length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-semibold">CMS install plan</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              {(activeSchemaDeployPack.cmsInstall || []).map((install: any) => (
                                <div key={install.platform} className="rounded-md border bg-muted/20 p-3">
                                  <p className="text-xs font-semibold text-foreground">{install.platform}</p>
                                  <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    {(install.steps || []).map((step: string, index: number) => (
                                      <li key={`${install.platform}-${index}`} className="flex gap-2">
                                        <span className="font-mono text-primary">{index + 1}.</span>
                                        <span>{step}</span>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {activeSchemaDeployPack.files?.[1]?.content && (
                          <div className="mt-4 rounded-md border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">Developer QA checklist</p>
                                <p className="mt-1 text-xs text-muted-foreground">{activeSchemaDeployPack.files?.[1]?.description}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigator.clipboard?.writeText(activeSchemaDeployPack.files?.[1]?.content || "")}
                                data-testid="button-copy-schema-qa"
                              >
                                <Copy className="mr-2 h-3.5 w-3.5" />
                                Copy QA
                              </Button>
                            </div>
                            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed">
                              {activeSchemaDeployPack.files?.[1]?.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(report.topIssues || []).map((issue: any) => (
                  <div
                    key={issue.id}
                    className={cn("rounded-lg border p-3", SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.info)}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{issue.label}</p>
                        <p className="text-sm text-muted-foreground">{issue.message}</p>
                        {issue.fixHint && (
                          <p className="text-xs mt-2 text-primary">{issue.fixHint}</p>
                        )}
                        {issue.implementationSteps?.length > 0 && (
                          <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {issue.implementationSteps.slice(0, 4).map((step: string, index: number) => (
                              <li key={`${issue.id}-step-${index}`} className="flex gap-2">
                                <span className="font-mono text-primary">{index + 1}.</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {renderIssueImplementation(issue)}
                      </div>
                    </div>
                  </div>
                ))}
                {locked && (
                  <Button className="w-full" onClick={() => setLocation("/app/settings")}>
                    <Lock className="h-4 w-4 mr-2" />
                    Unlock full report on Growth plan
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {agentScoreLiftGap && (
            <Card className="border-amber-500/30 bg-amber-500/5" data-testid="agent-readiness-score-lift">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ListChecks className="h-5 w-5 text-amber-600" />
                      Launch Score Lift Needed
                    </CardTitle>
                    <CardDescription>
                      Agent Readiness is {agentScoreLiftGap.score}/100. Production launch target is 75+, so {agentScoreLiftGap.gap} points still need proof-backed improvement.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{agentScoreLiftGap.issueCount} visible issue{agentScoreLiftGap.issueCount === 1 ? "" : "s"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  {agentScoreLiftGap.schemaIssueCount > 0
                    ? "Start with the homepage schema pack: it can close JSON-LD, Organization, and WebSite schema together after the live page is updated and rescanned."
                    : "Create implementation tasks from the visible issues, apply them, then rerun Agent Readiness so the score can be verified."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {agentScoreLiftGap.schemaIssueCount > 0 && (
                    <Button
                      onClick={() => schemaFixPackMutation.mutate()}
                      disabled={schemaFixPackMutation.isPending || !brandId}
                      data-testid="button-score-lift-schema-pack"
                    >
                      {schemaFixPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Create schema pack
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setLocation("/app/action-plan")} data-testid="button-open-score-lift-workflow">
                    Open workflow
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!locked && report.checks?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All checks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-2">
                  {report.checks.map((check: any) => (
                    <div key={check.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                      {check.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className={check.passed ? "text-muted-foreground" : ""}>{check.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.fullReport?.prioritizedFixes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Implementation roadmap</CardTitle>
                <CardDescription>{report.fullReport.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.fullReport.prioritizedFixes.slice(0, 8).map((fix: any, i: number) => (
                  <div key={fix.id} className="flex gap-3 text-sm">
                    <span className="font-mono text-muted-foreground w-6">{i + 1}.</span>
                    <div>
                      <p className="font-medium">{fix.label}</p>
                      {fix.fixHint && <p className="text-muted-foreground">{fix.fixHint}</p>}
                      {fix.implementationSteps?.length > 0 && (
                        <ol className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {fix.implementationSteps.slice(0, 4).map((step: string, index: number) => (
                            <li key={`${fix.id}-roadmap-step-${index}`} className="flex gap-2">
                              <span className="font-mono">{index + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {renderIssueImplementation(fix)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ))}

      {!productOnly && productReadinessAvailable && (
        <Card data-testid="product-readiness-gate">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  Product Readiness
                </CardTitle>
                <CardDescription>
                  Separate SKU, marketplace, and ecommerce checks from the core Agent Readiness score.
                </CardDescription>
              </div>
              <Badge variant="outline">Optional</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Open this only for D2C, Amazon seller, ecommerce, or product-led brands. Education, services, and SaaS audits can stay focused on entity, content, crawlability, and schema readiness.
            </p>
            <Button onClick={() => setLocation("/app/product-readiness")} data-testid="open-product-readiness">
              <PackageCheck className="h-4 w-4 mr-2" />
              Open Product Readiness
            </Button>
          </CardContent>
        </Card>
      )}

      {shouldShowProductReadiness && (
        <Card data-testid="card-product-readiness">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  Product AI Readiness
                </CardTitle>
                <CardDescription>{productReadiness.summary}</CardDescription>
              </div>
              <div className="flex shrink-0 items-start gap-3">
                <div className="text-right">
                  <div className="text-3xl font-bold font-mono">
                    {productReadiness.score}
                    <span className="text-sm text-muted-foreground font-normal">/100</span>
                  </div>
                  <Badge variant="outline" className="capitalize">{productReadiness.grade}</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["Prompts", `${productReadiness.metrics.productIntentPrompts}/${productReadiness.metrics.prompts}`],
                ["Catalog", productReadiness.metrics.catalogProducts],
                ["ASINs", productReadiness.metrics.detectedAsins],
                ["Marketplace Sources", productReadiness.metrics.marketplaceSources],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold font-mono">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border p-4 space-y-3" data-testid="product-catalog-import">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Product Catalog Import</p>
                  <p className="text-xs text-muted-foreground">Import priority ASIN/SKU products for product-level readiness and seller playbooks.</p>
                </div>
                <Badge variant="secondary">{productCatalog?.count || 0} saved</Badge>
              </div>

              <Tabs
                value={catalogImportMode}
                onValueChange={(value) => {
                  setCatalogImportMode(value as CatalogImportMode);
                  setServerCatalogValidation(null);
                }}
              >
                <TabsList className="grid w-full max-w-xs grid-cols-2">
                  <TabsTrigger value="json">JSON</TabsTrigger>
                  <TabsTrigger value="csv">CSV</TabsTrigger>
                </TabsList>
                <TabsContent value="json" className="mt-3 space-y-2">
                  <Textarea
                    className="min-h-[150px] font-mono text-xs"
                    value={catalogDraft}
                    onChange={(event) => {
                      setCatalogDraft(event.target.value);
                      setServerCatalogValidation(null);
                    }}
                    placeholder={JSON.stringify(JSON_CATALOG_TEMPLATE, null, 2)}
                  />
                </TabsContent>
                <TabsContent value="csv" className="mt-3 space-y-2">
                  <Textarea
                    className="min-h-[150px] font-mono text-xs"
                    value={catalogDraft}
                    onChange={(event) => {
                      setCatalogDraft(event.target.value);
                      setServerCatalogValidation(null);
                    }}
                    placeholder={CSV_CATALOG_TEMPLATE}
                  />
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  ["Products", catalogValidation.stats.products],
                  ["IDs", catalogValidation.stats.identifiers],
                  ["Competitors", catalogValidation.stats.competitors],
                  ["Claims", catalogValidation.stats.claims],
                  ["Objections", catalogValidation.stats.objections],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-muted/40 p-2">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="font-mono text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              {(catalogValidation.errors.length > 0 || catalogValidation.warnings.length > 0) && (
                <div className="space-y-1">
                  {catalogValidation.errors.slice(0, 3).map((error) => (
                    <p key={error} className="text-xs text-red-600">{error}</p>
                  ))}
                  {catalogValidation.warnings.slice(0, 4).map((warning) => (
                    <p key={warning} className="text-xs text-amber-600">{warning}</p>
                  ))}
                </div>
              )}

              {serverCatalogValidation && (
                <div className={cn(
                  "rounded-md border p-3 text-xs",
                  serverCatalogValidation.valid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
                )}>
                  <p className="font-medium">
                    {serverCatalogValidation.valid ? "Server validation passed" : "Server validation failed"}
                  </p>
                  <p className="mt-1">
                    {serverCatalogValidation.stats?.products || 0} products, {serverCatalogValidation.stats?.identifiers || 0} IDs, {serverCatalogValidation.warnings?.length || 0} warnings
                  </p>
                  {(serverCatalogValidation.errors || []).slice(0, 2).map((error: string) => (
                    <p key={error} className="mt-1">{error}</p>
                  ))}
                </div>
              )}

              {(productImportHistory?.history || []).length > 0 && (
                <div className="rounded-md border p-3" data-testid="product-import-history">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Recent imports</p>
                    <Badge variant="outline">{productImportHistory.count} logged</Badge>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(productImportHistory.history || []).slice(0, 3).map((item: any) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-2 text-xs">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={item.status === "success" ? "secondary" : "destructive"}>{item.status}</Badge>
                            <span className="font-mono">{String(item.mode || "").toUpperCase()}</span>
                            <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{item.message}</p>
                          {item.errors?.[0] && <p className="mt-1 text-red-600">{item.errors[0]}</p>}
                        </div>
                        <div className="shrink-0 text-right font-mono">
                          <p>{item.stats?.products || 0} products</p>
                          <p className="text-muted-foreground">{item.warnings?.length || 0} warnings</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCatalogImportMode("json");
                      setCatalogDraft(JSON.stringify(JSON_CATALOG_TEMPLATE, null, 2));
                      setServerCatalogValidation(null);
                    }}
                  >
                    JSON template
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCatalogImportMode("csv");
                      setCatalogDraft(CSV_CATALOG_TEMPLATE);
                      setServerCatalogValidation(null);
                    }}
                  >
                    CSV template
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => catalogValidationMutation.mutate()}
                    disabled={catalogValidationMutation.isPending || !catalogDraft.trim()}
                  >
                    {catalogValidationMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Server check
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => catalogMutation.mutate()}
                    disabled={catalogMutation.isPending || catalogValidation.errors.length > 0}
                  >
                    {catalogMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save catalog
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3" data-testid="product-visibility">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Product Visibility</p>
                  <p className="text-xs text-muted-foreground">{productVisibility?.summary || "Track per-SKU AI visibility after catalog import."}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{productVisibility?.metrics?.visibleProducts || 0}/{productVisibility?.metrics?.products || 0} visible</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => productVisibilitySnapshotMutation.mutate()}
                    disabled={productVisibilitySnapshotMutation.isPending || !productVisibility?.metrics?.products}
                  >
                    {productVisibilitySnapshotMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save snapshot
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ["Products", productVisibility?.metrics?.products || 0],
                  ["Prompts", productVisibility?.metrics?.promptMatches || 0],
                  ["Mentions", productVisibility?.metrics?.mentionMatches || 0],
                  ["Sources", productVisibility?.metrics?.sourceMatches || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-muted/40 p-2">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="font-mono text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              {(productVisibility?.providerFreshness || []).length > 0 && (
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Provider Freshness</p>
                    <p className="text-xs text-muted-foreground">
                      {productVisibility.metrics?.sampledProviders || 0} fresh / {productVisibility.metrics?.notSampledProviders || 0} not sampled
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {(productVisibility.providerFreshness || []).map((provider: any) => (
                      <div key={provider.provider} className="rounded-md border bg-background p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">{provider.provider}</span>
                          <Badge
                            variant={provider.status === "fresh" ? "secondary" : provider.status === "not_sampled" ? "outline" : "destructive"}
                            className="text-[10px]"
                          >
                            {String(provider.status).replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {provider.lastAnswerAt || provider.lastRunAt
                            ? new Date(provider.lastAnswerAt || provider.lastRunAt).toLocaleDateString()
                            : "No run"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {productVisibility?.samplingReadiness && (
                <div
                  className={cn(
                    "rounded-md border p-3",
                    productVisibility.samplingReadiness.status === "ready" && "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/20",
                    productVisibility.samplingReadiness.status === "partial" && "border-amber-200 bg-amber-50/70 dark:bg-amber-950/20",
                    productVisibility.samplingReadiness.status === "blocked" && "border-red-200 bg-red-50/70 dark:bg-red-950/20",
                  )}
                  data-testid="product-visibility-sampling-readiness"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {productVisibility.samplingReadiness.status === "ready" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        Sampling Readiness
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {productVisibility.samplingReadiness.summary}
                      </p>
                    </div>
                    <Badge
                      variant={productVisibility.samplingReadiness.status === "ready" ? "secondary" : productVisibility.samplingReadiness.status === "partial" ? "outline" : "destructive"}
                      className="capitalize"
                    >
                      {productVisibility.samplingReadiness.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid md:grid-cols-[160px_1fr] gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {productVisibility.samplingReadiness.coverageScore}
                        <span className="text-sm font-normal text-muted-foreground">/100</span>
                      </p>
                      <Progress value={productVisibility.samplingReadiness.coverageScore || 0} className="mt-2 h-2" />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-background/80 p-2">
                        <p className="text-muted-foreground">Fresh providers</p>
                        <p className="font-mono font-semibold">
                          {(productVisibility.samplingReadiness.freshProviders || []).length}/{(productVisibility.providerFreshness || []).length}
                        </p>
                      </div>
                      <div className="rounded-md bg-background/80 p-2">
                        <p className="text-muted-foreground">SKU prompt coverage</p>
                        <p className="font-mono font-semibold">
                          {productVisibility.samplingReadiness.productPromptCoverage?.coveragePercent || 0}%
                        </p>
                      </div>
                      <div className="rounded-md bg-background/80 p-2">
                        <p className="text-muted-foreground">Blocked providers</p>
                        <p className="font-mono font-semibold">
                          {[
                            ...(productVisibility.samplingReadiness.missingProviders || []),
                            ...(productVisibility.samplingReadiness.staleProviders || []),
                            ...(productVisibility.samplingReadiness.failedProviders || []),
                          ].length}
                        </p>
                      </div>
                    </div>
                  </div>
                  {(productVisibility.samplingReadiness.nextActions || []).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {(productVisibility.samplingReadiness.nextActions || []).slice(0, 3).map((action: string) => (
                        <p key={action} className="text-xs text-muted-foreground flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                          <span>{action}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {productVisibility?.competitiveBenchmark && !productVisibility.competitiveBenchmark.setupRequired && (
                <div className="rounded-md border p-3" data-testid="product-visibility-competitive-benchmark">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Swords className="h-4 w-4" />
                        Competitive Benchmark
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{productVisibility.competitiveBenchmark.summary}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant={productVisibility.competitiveBenchmark.competitorShare >= 55 ? "destructive" : "secondary"}>
                        {productVisibility.competitiveBenchmark.competitorShare}% competitor share
                      </Badge>
                      <Badge variant="outline">
                        {productVisibility.competitiveBenchmark.topThreats?.length || 0} threats
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid lg:grid-cols-2 gap-2">
                    {(productVisibility.competitiveBenchmark.products || []).slice(0, 4).map((benchmark: any) => (
                      <div key={benchmark.productId} className="rounded-md bg-muted/40 p-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{benchmark.name}</p>
                            {benchmark.leadingCompetitor && (
                              <p className="text-muted-foreground">vs {benchmark.leadingCompetitor}</p>
                            )}
                          </div>
                          <Badge variant={benchmark.pressure === "high" ? "destructive" : benchmark.pressure === "medium" ? "secondary" : "outline"}>
                            {benchmark.pressure}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-muted-foreground">Brand</p>
                            <p className="font-mono font-semibold">{benchmark.brandSignals}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Competitor</p>
                            <p className="font-mono font-semibold">{benchmark.competitorSignals}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Gap</p>
                            <p className="font-mono font-semibold">{benchmark.benchmarkGap > 0 ? "+" : ""}{benchmark.benchmarkGap}</p>
                          </div>
                        </div>
                        {benchmark.gaps?.[0] && <p className="mt-2 text-primary">{benchmark.gaps[0]}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {productVisibility?.externalBenchmarkReadiness && (
                <div className="rounded-md border p-3" data-testid="product-visibility-external-benchmark-readiness">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Real Brand Benchmark Readiness
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {productVisibility.externalBenchmarkReadiness.summary}
                      </p>
                    </div>
                    <Badge
                      variant={productVisibility.externalBenchmarkReadiness.status === "ready" ? "secondary" : productVisibility.externalBenchmarkReadiness.status === "partial" ? "outline" : "destructive"}
                      className="capitalize"
                    >
                      {productVisibility.externalBenchmarkReadiness.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid md:grid-cols-[160px_1fr] gap-3">
                    <div>
                      <p className="text-2xl font-semibold">
                        {productVisibility.externalBenchmarkReadiness.score}
                        <span className="text-sm font-normal text-muted-foreground">/100</span>
                      </p>
                      <Progress value={productVisibility.externalBenchmarkReadiness.score || 0} className="mt-2 h-2" />
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                      {(productVisibility.externalBenchmarkReadiness.checks || []).map((check: any) => (
                        <div key={check.id} className="rounded-md bg-muted/40 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium">{check.label}</p>
                            <Badge
                              variant={check.status === "pass" ? "secondary" : check.status === "warning" ? "outline" : "destructive"}
                              className="text-[10px] uppercase"
                            >
                              {check.status}
                            </Badge>
                          </div>
                          <p className="mt-1 font-mono font-semibold">{check.score}/100</p>
                          <p className="mt-1 text-muted-foreground">{check.evidence}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(productVisibility.externalBenchmarkReadiness.nextActions || []).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {(productVisibility.externalBenchmarkReadiness.nextActions || []).slice(0, 3).map((action: string) => (
                        <p key={action} className="text-xs text-muted-foreground flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                          <span>{action}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(productVisibility?.products || []).length > 0 ? (
                <div className="grid lg:grid-cols-2 gap-3">
                  {(productVisibility.products || []).slice(0, 4).map((product: any) => (
                    <div key={product.productId} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[product.asin, product.sku].filter(Boolean).join(" | ") || "No identifier"}
                          </p>
                        </div>
                        <Badge variant={product.status === "visible" ? "secondary" : product.status === "weak" ? "outline" : "destructive"}>
                          {product.visibilityScore}/100
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Prompts</p>
                          <p className="font-mono font-semibold">{product.promptMatches}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Mentions</p>
                          <p className="font-mono font-semibold">{product.mentionMatches}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Sources</p>
                          <p className="font-mono font-semibold">{product.sourceMatches}</p>
                        </div>
                      </div>
                      {product.evidence?.[0] && <p className="mt-2 text-xs text-muted-foreground">{product.evidence[0]}</p>}
                      {product.gaps?.[0] && <p className="mt-2 text-xs text-primary">{product.gaps[0]}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  Import products above to start per-SKU visibility tracking.
                </div>
              )}

              {(productVisibilityHistory?.history || []).length > 0 && (
                <div className="rounded-md bg-muted/40 p-3" data-testid="product-visibility-history">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Recent snapshots</p>
                    <p className="text-xs text-muted-foreground">{productVisibilityHistory.count || 0} saved</p>
                  </div>
                  {productVisibilityHistory.trend?.hasComparison ? (
                    <div className="mt-2 rounded-md border bg-background p-3" data-testid="product-visibility-trend">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Snapshot movement
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{productVisibilityHistory.trend.summary}</p>
                        </div>
                        <Badge variant={productVisibilityHistory.trend.scoreDelta >= 0 ? "secondary" : "destructive"}>
                          {productVisibilityHistory.trend.scoreDelta > 0 ? "+" : ""}{productVisibilityHistory.trend.scoreDelta}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Visible</p>
                          <p className="font-mono font-semibold">
                            {productVisibilityHistory.trend.visibleDelta > 0 ? "+" : ""}{productVisibilityHistory.trend.visibleDelta}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Missing</p>
                          <p className="font-mono font-semibold">
                            {productVisibilityHistory.trend.missingDelta > 0 ? "+" : ""}{productVisibilityHistory.trend.missingDelta}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Fresh providers</p>
                          <p className="font-mono font-semibold">
                            {productVisibilityHistory.trend.providerFreshDelta > 0 ? "+" : ""}{productVisibilityHistory.trend.providerFreshDelta}
                          </p>
                        </div>
                      </div>
                      {(productVisibilityHistory.trend.productDeltas || []).slice(0, 3).map((product: any) => (
                        <div key={product.productId} className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{product.name}</span>
                          <Badge variant={product.movement === "improved" || product.movement === "new" ? "secondary" : product.movement === "declined" || product.movement === "removed" ? "destructive" : "outline"}>
                            {product.scoreDelta > 0 ? "+" : ""}{product.scoreDelta}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                      {productVisibilityHistory.trend?.summary || "Save another snapshot to compare movement."}
                    </div>
                  )}
                  <div className="mt-2 space-y-2">
                    {(productVisibilityHistory.history || []).slice(0, 3).map((snapshot: any) => (
                      <div key={snapshot.id} className="rounded-md border bg-background p-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{new Date(snapshot.createdAt).toLocaleString()}</p>
                            <p className="text-muted-foreground">
                              {snapshot.metrics?.visibleProducts || 0}/{snapshot.metrics?.products || 0} visible, {snapshot.metrics?.missingProducts || 0} missing
                            </p>
                          </div>
                          <Badge variant="outline">
                            {snapshot.providerSummary?.fresh || 0} fresh / {snapshot.providerSummary?.notSampled || 0} not sampled
                          </Badge>
                        </div>
                        {(snapshot.products || []).slice(0, 2).map((product: any) => (
                          <div key={product.productId} className="mt-2 flex items-center justify-between gap-2 text-muted-foreground">
                            <span className="truncate">{product.name}</span>
                            <span className="font-mono">{product.visibilityScore}/100</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(productVisibilityActions?.actions || []).length > 0 && (
                <div className="rounded-md border p-4 space-y-3" data-testid="product-visibility-actions">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <ListChecks className="h-4 w-4" />
                        Product Visibility Actions
                      </p>
                      <p className="text-xs text-muted-foreground">{productVisibilityActions.summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Badge variant="outline">{productVisibilityActions.metrics?.highPriority || 0} high priority</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => productVisibilityClientReportMutation.mutate()}
                        disabled={productVisibilityClientReportMutation.isPending}
                        data-testid="product-visibility-client-report-button"
                      >
                        {productVisibilityClientReportMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                        Client report
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => productVisibilityClientReportPdfMutation.mutate()}
                        disabled={productVisibilityClientReportPdfMutation.isPending}
                        data-testid="product-visibility-client-report-pdf-button"
                      >
                        {productVisibilityClientReportPdfMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => productVisibilityActionExportMutation.mutate("markdown")}
                        disabled={productVisibilityActionExportMutation.isPending}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy pack
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => productVisibilityActionExportMutation.mutate("csv")}
                        disabled={productVisibilityActionExportMutation.isPending}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => productVisibilityDraftMutation.mutate()}
                        disabled={productVisibilityDraftMutation.isPending}
                      >
                        {productVisibilityDraftMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Drafts
                      </Button>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-2 gap-3">
                    {(productVisibilityActions.actions || []).slice(0, 4).map((action: any) => (
                      <div key={action.id} className="rounded-md bg-muted/40 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{action.title}</p>
                            {action.productName && <p className="text-xs text-muted-foreground">{action.productName}</p>}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Badge variant={action.priority === "high" ? "destructive" : action.priority === "medium" ? "secondary" : "outline"}>
                              {action.priority}
                            </Badge>
                            <Badge variant="outline">{action.owner === "geo_team" ? "AIRank" : "Brand"}</Badge>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Badge variant={action.status === "done" ? "secondary" : action.status === "blocked" ? "destructive" : "outline"}>
                            {String(action.status || "todo").replace("_", " ")}
                          </Badge>
                          {(["todo", "in_progress", "blocked", "done"] as const).map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={action.status === status ? "default" : "outline"}
                              className="h-7 px-2 text-[11px]"
                              disabled={productVisibilityActionMutation.isPending || action.status === status}
                              onClick={() => productVisibilityActionMutation.mutate({ actionId: action.id, status })}
                            >
                              {status === "todo" ? "Todo" : status === "in_progress" ? "Doing" : status === "blocked" ? "Blocked" : "Done"}
                            </Button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{action.evidence}</p>
                        <p className="mt-2 text-xs text-primary">{action.expectedImpact}</p>
                        {action.updatedAt && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Updated {new Date(action.updatedAt).toLocaleString()}
                          </p>
                        )}
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {(action.steps || []).slice(0, 3).map((step: string) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {actionExportPreview && (
                    <Textarea
                      className="min-h-[180px] font-mono text-xs"
                      readOnly
                      value={actionExportPreview}
                      data-testid="product-visibility-action-export-preview"
                    />
                  )}
                  {clientReportPreview && (
                    <div className="space-y-2">
                      {clientReportData?.pilotReadiness && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-pilot-readiness">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <PackageCheck className="h-4 w-4" />
                                Pilot Launch Readiness
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {clientReportData.pilotReadiness.summary}
                              </p>
                            </div>
                            <Badge
                              variant={clientReportData.pilotReadiness.status === "ready" ? "secondary" : clientReportData.pilotReadiness.status === "needs_review" ? "outline" : "destructive"}
                              className="capitalize"
                            >
                              {String(clientReportData.pilotReadiness.status).replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="mt-3 grid md:grid-cols-[140px_1fr] gap-3">
                            <div>
                              <p className="text-2xl font-semibold">
                                {clientReportData.pilotReadiness.score}
                                <span className="text-sm font-normal text-muted-foreground">/100</span>
                              </p>
                              <Progress value={clientReportData.pilotReadiness.score || 0} className="mt-2 h-2" />
                            </div>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                              {(clientReportData.pilotReadiness.checks || []).slice(0, 6).map((check: any) => (
                                <div key={check.id} className="rounded-md bg-muted/40 p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium">{check.label}</p>
                                    <Badge
                                      variant={check.status === "pass" ? "secondary" : check.status === "warning" ? "outline" : "destructive"}
                                      className="text-[10px] uppercase"
                                    >
                                      {check.status}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 font-mono font-semibold">{check.score}/100</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {(clientReportData.pilotReadiness.nextActions || []).length > 0 && (
                            <div className="mt-3 space-y-1">
                              {(clientReportData.pilotReadiness.nextActions || []).slice(0, 3).map((action: string) => (
                                <p key={action} className="text-xs text-muted-foreground flex gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                                  <span>{action}</span>
                                </p>
                              ))}
                            </div>
                          )}
                          {(clientReportData.pilotReadiness.launchPlan || []).length > 0 && (
                            <div className="mt-3 grid lg:grid-cols-3 gap-2" data-testid="product-visibility-pilot-launch-plan">
                              {(clientReportData.pilotReadiness.launchPlan || []).map((phase: any) => (
                                <div key={phase.phase} className="rounded-md bg-muted/40 p-2 text-xs">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium">{phase.title}</p>
                                    <Badge variant="outline" className="capitalize">{String(phase.owner).replace("_", " ")}</Badge>
                                  </div>
                                  <p className="mt-1 text-muted-foreground capitalize">{String(phase.phase).replace(/_/g, " ")}</p>
                                  <div className="mt-2 space-y-1">
                                    {(phase.actions || []).slice(0, 2).map((action: string) => (
                                      <p key={action} className="text-muted-foreground flex gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                                        <span>{action}</span>
                                      </p>
                                    ))}
                                  </div>
                                  {(phase.exitCriteria || [])[0] && (
                                    <p className="mt-2 text-primary">{phase.exitCriteria[0]}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {clientReportData?.brandIntelligence && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-brand-intelligence">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Brand Intelligence
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {clientReportData.brandIntelligence.summary}
                              </p>
                            </div>
                            <Badge variant={clientReportData.brandIntelligence.marketPosition === "blocked" || clientReportData.brandIntelligence.marketPosition === "defensive" ? "destructive" : clientReportData.brandIntelligence.marketPosition === "contested" ? "outline" : "secondary"} className="capitalize">
                              {String(clientReportData.brandIntelligence.marketPosition).replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="mt-3 grid md:grid-cols-[140px_1fr] gap-3">
                            <div>
                              <p className="text-2xl font-semibold">
                                {clientReportData.brandIntelligence.confidenceScore}
                                <span className="text-sm font-normal text-muted-foreground">/100</span>
                              </p>
                              <Progress value={clientReportData.brandIntelligence.confidenceScore || 0} className="mt-2 h-2" />
                            </div>
                            <div className="grid lg:grid-cols-2 gap-2 text-xs">
                              {(clientReportData.brandIntelligence.strategicThemes || []).slice(0, 4).map((theme: any) => (
                                <div key={theme.id} className="rounded-md bg-muted/40 p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium">{theme.label}</p>
                                    <Badge
                                      variant={theme.severity === "critical" ? "destructive" : theme.severity === "warning" ? "outline" : "secondary"}
                                      className="text-[10px] uppercase"
                                    >
                                      {theme.severity}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-muted-foreground">{theme.evidence}</p>
                                  <p className="mt-2">{theme.recommendation}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {(clientReportData.brandIntelligence.executiveActions || []).length > 0 && (
                            <div className="mt-3 grid lg:grid-cols-2 gap-2 text-xs">
                              {(clientReportData.brandIntelligence.executiveActions || []).slice(0, 4).map((action: string) => (
                                <p key={action} className="text-muted-foreground flex gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                                  <span>{action}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(clientReportData?.categoryIntelligence || []).length > 0 && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-category-intelligence">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <ListChecks className="h-4 w-4" />
                                Category Intelligence
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Category campaigns grouped by buyer intent, competitor pressure, and proof gaps.
                              </p>
                            </div>
                            <Badge variant="outline">{clientReportData.categoryIntelligence.length} categories</Badge>
                          </div>
                          <div className="mt-3 grid lg:grid-cols-2 gap-2">
                            {(clientReportData.categoryIntelligence || []).slice(0, 4).map((category: any) => (
                              <div key={category.id} className="rounded-md bg-muted/40 p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{category.category}</p>
                                    <p className="text-muted-foreground">{(category.products || []).slice(0, 2).join(", ")}</p>
                                  </div>
                                  <Badge
                                    variant={category.priority === "critical" ? "destructive" : category.priority === "high" ? "outline" : "secondary"}
                                    className="capitalize"
                                  >
                                    {category.priority}
                                  </Badge>
                                </div>
                                <p className="mt-2 font-mono font-semibold">{category.score}/100 category opportunity</p>
                                <p className="mt-1 text-muted-foreground">{category.recommendedCampaign}</p>
                                <p className="mt-2">{category.firstAction}</p>
                                {(category.buyerIntents || [])[0] && (
                                  <p className="mt-2 text-primary">{category.buyerIntents[0]}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(clientReportData?.creativeBriefs || []).length > 0 && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-creative-briefs">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Creative Briefs
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Mockup and video-ad briefs generated from category campaigns and proof gaps.
                              </p>
                            </div>
                            <Badge variant="outline">{clientReportData.creativeBriefs.length} briefs</Badge>
                          </div>
                          <div className="mt-3 grid lg:grid-cols-2 gap-2">
                            {(clientReportData.creativeBriefs || []).slice(0, 4).map((brief: any) => (
                              <div key={brief.id} className="rounded-md bg-muted/40 p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{brief.productName}</p>
                                    <p className="text-muted-foreground capitalize">
                                      {String(brief.format || "").replace(/_/g, " ")} brief
                                    </p>
                                  </div>
                                  <Badge variant={brief.status === "draft_ready" ? "secondary" : "outline"} className="capitalize">
                                    {String(brief.status || "").replace(/_/g, " ")}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-muted-foreground">{brief.objective}</p>
                                <p className="mt-2">{brief.message}</p>
                                {(brief.scriptOutline || [])[0] && (
                                  <p className="mt-2 text-primary">{brief.scriptOutline[0]}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(clientReportData?.competitorBattlecards || []).length > 0 && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-competitor-battlecards">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <Swords className="h-4 w-4" />
                                Competitor Battlecards
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Comparison prompts and proof angles for named category competitors.
                              </p>
                            </div>
                            <Badge variant="outline">{clientReportData.competitorBattlecards.length} battlecards</Badge>
                          </div>
                          <div className="mt-3 grid lg:grid-cols-2 gap-2">
                            {(clientReportData.competitorBattlecards || []).slice(0, 4).map((battlecard: any) => (
                              <div key={battlecard.id} className="rounded-md bg-muted/40 p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{battlecard.productName}</p>
                                    <p className="text-muted-foreground">vs {battlecard.competitorName}</p>
                                  </div>
                                  <Badge
                                    variant={battlecard.threatLevel === "high" ? "destructive" : battlecard.threatLevel === "medium" ? "outline" : "secondary"}
                                    className="capitalize"
                                  >
                                    {battlecard.threatLevel}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-muted-foreground">{battlecard.comparisonAngle}</p>
                                <p className="mt-2">{battlecard.recommendedContent}</p>
                                <p className="mt-2 text-primary">{battlecard.testPrompt}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {(clientReportData?.opportunityMap || []).length > 0 && (
                        <div className="rounded-md border p-3" data-testid="product-visibility-opportunity-map">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                AI Visibility Opportunity Map
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Ranked SKU gaps for recommendation share, sources, prompts, and proof assets.
                              </p>
                            </div>
                            <Badge variant="outline">{clientReportData.opportunityMap.length} opportunities</Badge>
                          </div>
                          <div className="mt-3 grid lg:grid-cols-2 gap-2">
                            {(clientReportData.opportunityMap || []).slice(0, 4).map((opportunity: any) => (
                              <div key={opportunity.id} className="rounded-md bg-muted/40 p-2 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{opportunity.productName}</p>
                                    <p className="text-muted-foreground capitalize">{String(opportunity.type || "").replace(/_/g, " ")}</p>
                                  </div>
                                  <Badge
                                    variant={opportunity.severity === "critical" ? "destructive" : opportunity.severity === "warning" ? "outline" : "secondary"}
                                    className="capitalize"
                                  >
                                    {opportunity.severity}
                                  </Badge>
                                </div>
                                <p className="mt-2 font-mono font-semibold">{opportunity.score}/100 opportunity</p>
                                <p className="mt-1 text-muted-foreground">{opportunity.opportunity}</p>
                                <p className="mt-2">{opportunity.recommendedAction}</p>
                                <p className="mt-2 text-primary">{opportunity.proofPrompt}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Client report preview</p>
                        <Badge variant="outline">HTML downloaded</Badge>
                      </div>
                      <Textarea
                        className="min-h-[220px] font-mono text-xs"
                        readOnly
                        value={clientReportPreview}
                        data-testid="product-visibility-client-report-preview"
                      />
                    </div>
                  )}
                  {(actionDraftPack?.drafts || []).length > 0 && (
                    <div className="rounded-md bg-muted/40 p-3 space-y-2" data-testid="product-visibility-draft-review">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Draft review</p>
                        <Badge variant="outline">{actionDraftPack.drafts.length} drafts</Badge>
                      </div>
                      <div className="grid lg:grid-cols-2 gap-2">
                        {(actionDraftPack.drafts || []).slice(0, 4).map((draft: any) => (
                          <div key={draft.actionId} className="rounded-md border bg-background p-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{draft.title}</p>
                                <p className="text-muted-foreground">{draft.draftType?.replace("_", " ")} | v{draft.version || 1}</p>
                              </div>
                              <Badge variant={draft.status === "approved" ? "secondary" : draft.status === "rejected" ? "destructive" : "outline"}>
                                {String(draft.status || "draft").replace("_", " ")}
                              </Badge>
                            </div>
                            <p className="mt-2 text-muted-foreground">{draft.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant={selectedDraftActionId === draft.actionId ? "default" : "outline"}
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setSelectedDraftActionId(draft.actionId);
                                  setActionDraftPreview(draft.markdown || "");
                                  setDraftReviewNote(draft.note || "");
                                  setDraftAssignee(draft.assignee || "");
                                }}
                              >
                                Edit
                              </Button>
                              {(["draft", "in_review", "approved", "rejected"] as const).map((status) => (
                                <Button
                                  key={status}
                                  size="sm"
                                  variant={draft.status === status ? "default" : "outline"}
                                  className="h-7 px-2 text-[11px]"
                                  disabled={productVisibilityDraftStatusMutation.isPending || draft.status === status}
                                  onClick={() => productVisibilityDraftStatusMutation.mutate({
                                    actionId: draft.actionId,
                                    status,
                                    note: draftReviewNote,
                                    assignee: draftAssignee,
                                  })}
                                >
                                  {status === "draft" ? "Draft" : status === "in_review" ? "Review" : status === "approved" ? "Approve" : "Reject"}
                                </Button>
                              ))}
                              {PUBLISH_CHANNELS.map((channel) => (
                                <Button
                                  key={channel.id}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={productVisibilityPublishMutation.isPending || draft.status !== "approved"}
                                  onClick={() => productVisibilityPublishMutation.mutate({ actionId: draft.actionId, channel: channel.id })}
                                >
                                  Queue {channel.label}
                                </Button>
                              ))}
                            </div>
                            {draft.updatedAt && (
                              <p className="mt-2 text-[11px] text-muted-foreground">Updated {new Date(draft.updatedAt).toLocaleString()}</p>
                            )}
                            {(draft.reviewerId || draft.assignee) && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {[draft.reviewerId ? `Reviewer ${draft.reviewerId}` : "", draft.assignee ? `Assignee ${draft.assignee}` : ""].filter(Boolean).join(" | ")}
                              </p>
                            )}
                            {(draft.history || []).length > 0 && (
                              <div className="mt-2 rounded-md bg-muted/50 p-2">
                                <p className="font-medium">History</p>
                                {(draft.history || []).slice(0, 2).map((entry: any) => (
                                  <p key={entry.id} className="mt-1 text-[11px] text-muted-foreground">
                                    {`v${entry.fromVersion || 0} -> v${entry.toVersion}: ${String(entry.fromStatus || "new").replace("_", " ")} -> ${String(entry.toStatus || "draft").replace("_", " ")}`}
                                    {entry.markdownChanged ? `, ${entry.addedLines?.length || 0} added / ${entry.removedLines?.length || 0} removed` : ""}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(productVisibilityPublishQueue?.queue || []).length > 0 && (
                    <div className="rounded-md border p-3 space-y-2" data-testid="product-visibility-publish-queue">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <PackageCheck className="h-4 w-4" />
                          Publish queue
                        </p>
                        <Badge variant="outline">{productVisibilityPublishQueue.count || productVisibilityPublishQueue.queue.length} queued</Badge>
                      </div>
                      <div className="grid lg:grid-cols-2 gap-2">
                        {(productVisibilityPublishQueue.queue || []).slice(0, 4).map((item: any) => (
                          <div key={`${item.actionId}-${item.channel}`} className="rounded-md bg-muted/40 p-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{item.title}</p>
                                <p className="text-muted-foreground">{[item.productName, `v${item.draftVersion || 1}`].filter(Boolean).join(" | ")}</p>
                              </div>
                              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                <Badge variant="secondary">{String(item.channel || "queue").replace("_", " ")}</Badge>
                                <Badge variant={item.status === "published" ? "default" : "outline"}>
                                  {String(item.status || "queued").replace("_", " ")}
                                </Badge>
                              </div>
                            </div>
                            <p className="mt-2 text-muted-foreground line-clamp-2">{item.markdownPreview}</p>
                            {item.artifact && (
                              <p className="mt-2 text-[11px] text-primary">
                                {String(item.artifact.type || "artifact").replace("_", " ")}: {item.artifact.label}
                              </p>
                            )}
                            {(item.reviewerId || item.assignee || item.queuedBy || item.publishedBy) && (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {[
                                  item.reviewerId ? `Reviewer ${item.reviewerId}` : "",
                                  item.assignee ? `Assignee ${item.assignee}` : "",
                                  item.queuedBy ? `Queued by ${item.queuedBy}` : "",
                                  item.publishedBy ? `Published by ${item.publishedBy}` : "",
                                ].filter(Boolean).join(" | ")}
                              </p>
                            )}
                            {item.measurement && (
                              <div className="mt-2 rounded-md border bg-background p-2 text-[11px]" data-testid="product-visibility-measurement-followup">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium">Post-publish measurement</p>
                                  <Badge variant={item.measurement.status === "queued" ? "secondary" : item.measurement.status === "failed" ? "destructive" : "outline"}>
                                    {String(item.measurement.status || "snapshot_only").replace("_", " ")}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-muted-foreground">{item.measurement.summary}</p>
                                <p className="mt-1 text-muted-foreground">
                                  {[
                                    item.measurement.snapshotId ? `Snapshot ${item.measurement.snapshotId}` : "",
                                    item.measurement.jobIds?.length ? `${item.measurement.jobIds.length} sampling job${item.measurement.jobIds.length === 1 ? "" : "s"}` : "",
                                    item.measurement.promptIds?.length ? `${item.measurement.promptIds.length} prompt${item.measurement.promptIds.length === 1 ? "" : "s"}` : "",
                                  ].filter(Boolean).join(" | ")}
                                </p>
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                disabled={productVisibilityPublishQueueMutation.isPending || item.status === "published"}
                                onClick={() => productVisibilityPublishQueueMutation.mutate({ itemId: item.id })}
                              >
                                Publish
                              </Button>
                              {item.artifact?.url && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => setLocation(item.artifact.url)}
                                >
                                  Open artifact
                                </Button>
                              )}
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">Queued {new Date(item.queuedAt).toLocaleString()}</p>
                            {item.publishedAt && (
                              <p className="mt-1 text-[11px] text-muted-foreground">Published {new Date(item.publishedAt).toLocaleString()}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {actionDraftPreview && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {selectedDraft ? `Editing ${selectedDraft.title}` : "Draft preview"}
                        </p>
                        {selectedDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={productVisibilityDraftStatusMutation.isPending}
                            onClick={() => productVisibilityDraftStatusMutation.mutate({
                              actionId: selectedDraft.actionId,
                              status: selectedDraft.status || "draft",
                              markdown: actionDraftPreview,
                              note: draftReviewNote,
                              assignee: draftAssignee,
                            })}
                          >
                            Save edit
                          </Button>
                        )}
                      </div>
                      {selectedDraft && (
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            value={draftAssignee}
                            onChange={(event) => setDraftAssignee(event.target.value)}
                            placeholder="Assignee"
                            data-testid="product-visibility-draft-assignee"
                          />
                          <Input
                            value={draftReviewNote}
                            onChange={(event) => setDraftReviewNote(event.target.value)}
                            placeholder="Review note"
                            data-testid="product-visibility-draft-review-note"
                          />
                        </div>
                      )}
                      <Textarea
                        className="min-h-[220px] font-mono text-xs"
                        value={actionDraftPreview}
                        onChange={(event) => setActionDraftPreview(event.target.value)}
                        data-testid="product-visibility-action-draft-preview"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border p-4 space-y-3" data-testid="product-listing-playbook">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">SKU Listing Playbook</p>
                  <p className="text-xs text-muted-foreground">{productPlaybook?.summary || "Generate listing actions from your product catalog."}</p>
                </div>
                <Badge variant="outline">{productPlaybook?.products?.length || 0} SKUs</Badge>
              </div>

              {productPlaybook?.setupRequired ? (
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-sm font-medium">Catalog required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Import priority ASINs/SKUs above to unlock listing titles, bullets, FAQ, Product schema, prompt clusters, and objection handling.
                  </p>
                  <Textarea
                    className="mt-3 min-h-[115px] font-mono text-xs"
                    readOnly
                    value={JSON.stringify(productPlaybook.importTemplate || [], null, 2)}
                  />
                </div>
              ) : (
                <>
                  <div className="grid lg:grid-cols-2 gap-3">
                    {(productPlaybook?.products || []).slice(0, 4).map((product: any) => (
                      <div key={product.productId} className="rounded-md border p-3 text-sm space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[product.asin, product.sku, product.category].filter(Boolean).join(" | ") || "No identifier"}
                            </p>
                          </div>
                          <Badge variant={product.readinessScore >= 70 ? "secondary" : "destructive"}>
                            {product.readinessScore}/100
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Title</p>
                          <p>{product.listingEdits.title}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Listing bullets</p>
                          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                            {product.listingEdits.bullets.slice(0, 3).map((bullet: string) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Prompt cluster</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {product.listingEdits.promptCluster.slice(0, 3).map((prompt: string) => (
                              <Badge key={prompt} variant="outline" className="max-w-full whitespace-normal text-left">
                                {prompt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {product.sourceGaps.length > 0 && (
                          <p className="text-xs text-primary">{product.sourceGaps[0]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {productPlaybook?.exportMarkdown && (
                    <Textarea
                      className="min-h-[140px] font-mono text-xs"
                      readOnly
                      value={productPlaybook.exportMarkdown}
                    />
                  )}
                </>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {productReadiness.checks.map((check: any) => (
                <div key={check.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start gap-2">
                    {check.status === "pass" ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                    ) : check.status === "warning" ? (
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                    ) : (
                      <PackageCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{check.label}</p>
                      <p className="text-muted-foreground">{check.evidence}</p>
                      {check.status !== "pass" && <p className="text-xs text-primary mt-1">{check.fix}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border p-4">
              <p className="text-sm font-semibold mb-3">Seller Launch Playbook</p>
              <div className="grid md:grid-cols-3 gap-3">
                {productReadiness.playbook.map((item: any) => (
                  <div key={item.title} className="text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={item.priority === "high" ? "destructive" : "secondary"}>{item.priority}</Badge>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {item.steps.slice(0, 3).map((step: string) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {offers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-5 w-5" />
              Fix it for me
            </CardTitle>
            <CardDescription>
              {productOnly
                ? "AIRank team implements product schema, catalog, and marketplace readiness fixes."
                : "AIRank team implements agent readiness fixes on your site."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {offers.map((offer: any) => (
              <div key={offer.id} className="border rounded-lg p-4 flex flex-col">
                <Badge variant="secondary" className="w-fit mb-2 capitalize">{offer.category}</Badge>
                <h3 className="font-semibold">
                  {productOnly && String(offer.title || "").toLowerCase().includes("agent readiness")
                    ? "Product Readiness Implementation"
                    : offer.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 flex-1">
                  {productOnly && String(offer.title || "").toLowerCase().includes("agent readiness")
                    ? "We implement Product, Offer, Review, FAQ, and marketplace discovery fixes for priority SKUs."
                    : offer.description}
                </p>
                <p className="text-lg font-bold mt-3">₹{offer.effectivePriceInr.toLocaleString("en-IN")}</p>
                {offer.purchased ? (
                  <Badge className="mt-3 w-fit" variant="outline">Purchased</Badge>
                ) : (
                  <Button
                    className="mt-3"
                    size="sm"
                    disabled={checkoutLoading === offer.id}
                    onClick={() => handleAddonCheckout(offer.id)}
                  >
                    {checkoutLoading === offer.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Get started
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
