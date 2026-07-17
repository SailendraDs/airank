import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileCheck2,
  Loader2,
  Link2,
  MessageSquarePlus,
  PackageCheck,
  Sparkles,
  PlayCircle,
  Rocket,
  Send,
  ShoppingBag,
  UploadCloud,
  Swords,
  TimerReset,
} from "lucide-react";
import AgentReadiness from "@/pages/AgentReadiness";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

const SELLER_CATALOG_TEMPLATE = [
  {
    name: "Hero Product Name",
    asin: "B0XXXXXXXX",
    sku: "HERO-SKU-01",
    marketplace: "amazon",
    category: "Category",
    productUrl: "https://www.amazon.in/dp/B0XXXXXXXX",
    priceBand: "premium",
    priority: "high",
    competitors: [
      { name: "Competitor Product", asin: "B0YYYYYYYY", url: "https://www.amazon.in/dp/B0YYYYYYYY" },
    ],
    claims: [
      "Primary buying claim customers should see in AI answers",
      "Proof-backed differentiator such as warranty, rating, material, or performance",
    ],
    objections: [
      "Common buyer concern to answer in FAQ, schema, comparison, and AXP content",
    ],
  },
];

const SELLER_CATALOG_CSV_TEMPLATE = `name,asin,sku,marketplace,category,productUrl,priceBand,priority,competitors,claims,objections
Hero Product Name,B0XXXXXXXX,HERO-SKU-01,amazon,Category,https://www.amazon.in/dp/B0XXXXXXXX,premium,high,Competitor Product::B0YYYYYYYY,Primary buying claim|Proof-backed differentiator,Common buyer concern`;

const AMAZON_SELLER_PILOT_TEMPLATE = [
  {
    name: "Wireless Earbuds Pro",
    asin: "B0AIRDOPES1",
    sku: "AUDIO-HERO-01",
    marketplace: "amazon",
    category: "Wireless earbuds",
    productUrl: "https://www.amazon.in/dp/B0AIRDOPES1",
    priceBand: "mid-market",
    priority: "high",
    rating: 4.1,
    reviewCount: 18420,
    competitors: [
      { name: "Noise Buds VS", asin: "B0NOISEBUD", url: "https://www.amazon.in/dp/B0NOISEBUD" },
      { name: "Boult Audio Z40", asin: "B0BOULTZ40", url: "https://www.amazon.in/dp/B0BOULTZ40" },
    ],
    claims: [
      "Long battery life with fast charging for daily commute use",
      "Low-latency gaming mode and clear call microphone support",
    ],
    objections: [
      "Buyers worry whether call quality stays clear in traffic and office noise",
    ],
  },
  {
    name: "Neckband Bass Wireless",
    asin: "B0NECKBAND1",
    sku: "AUDIO-NECK-02",
    marketplace: "amazon",
    category: "Bluetooth neckbands",
    productUrl: "https://www.amazon.in/dp/B0NECKBAND1",
    priceBand: "value",
    priority: "medium",
    rating: 4.0,
    reviewCount: 9300,
    competitors: [
      { name: "Realme Buds Wireless", asin: "B0REALMEBW", url: "https://www.amazon.in/dp/B0REALMEBW" },
    ],
    claims: [
      "Sweat-resistant build for workouts and commute use",
      "Bass-forward tuning with quick charge support",
    ],
    objections: [
      "Buyers compare comfort, wire durability, and microphone reliability",
    ],
  },
  {
    name: "Portable Bluetooth Speaker",
    asin: "B0SPEAKER01",
    sku: "AUDIO-SPK-03",
    marketplace: "amazon",
    category: "Bluetooth speakers",
    productUrl: "https://www.amazon.in/dp/B0SPEAKER01",
    priceBand: "mid-market",
    priority: "medium",
    rating: 4.2,
    reviewCount: 7600,
    competitors: [
      { name: "JBL Go Essential", asin: "B0JBLGOESS", url: "https://www.amazon.in/dp/B0JBLGOESS" },
    ],
    claims: [
      "Compact portable speaker with strong bass for small rooms",
      "Water-resistant build and long playback for outdoor use",
    ],
    objections: [
      "Buyers want proof that loudness and battery life match listing claims",
    ],
  },
];

const PRODUCT_READINESS_FIT = [
  {
    title: "Amazon sellers",
    detail: "ASIN/SKU catalog, marketplace URLs, competing ASINs, reviews, listing claims, and buyer objections.",
  },
  {
    title: "D2C or Shopify brands",
    detail: "Product page URLs, product schema, category pages, competitor products, FAQs, proof claims, and post-publish sampling.",
  },
  {
    title: "Service or education brands",
    detail: "Use Agent Readiness, Entity Intelligence, and Query Fanouts first. Product Readiness only applies after you define product-like offers.",
  },
];

const SELLER_IMPORT_REQUIREMENTS = [
  "3-10 priority SKUs or ASINs",
  "One canonical product URL per SKU",
  "At least one named competitor product per priority SKU",
  "2 proof-backed claims per SKU",
  "1 buyer objection or review concern per SKU",
  "Category and priority so prompts map to real buying intent",
];

function buildSellerPilotPlan(brandName: string, products: any[]) {
  const productRows = (products.length ? products : AMAZON_SELLER_PILOT_TEMPLATE)
    .slice(0, 5)
    .map((product: any, index) => `${index + 1}. ${getProductLabel(product)} - ${product.asin || product.sku || "SKU missing"} - ${product.category || "category missing"}`)
    .join("\n");

  return [
    `${brandName} Product Readiness pilot plan`,
    ``,
    `Catalog scope`,
    productRows,
    ``,
    `Required seller inputs`,
    `- Priority ASIN/SKU and canonical Amazon/D2C product URL for each product`,
    `- One or more competing product ASINs/URLs per hero SKU`,
    `- Two proof-backed claims per SKU, such as rating, reviews, warranty, battery, material, certification, or performance`,
    `- One buyer objection per SKU from reviews, FAQs, or sales calls`,
    `- Category and priority so prompts map to buying intent`,
    ``,
    `AIRank workflow`,
    `1. Save the seller catalog and validate missing proof.`,
    `2. Generate buying, comparison, review, alternatives, and objection prompts for each hero SKU.`,
    `3. Run the seller pilot kit to queue product sampling and save a visibility snapshot.`,
    `4. Review SKU Launch Matrix and Marketplace Listing Proof Matrix.`,
    `5. Publish schema, FAQ, comparison, and AXP assets for weak SKUs.`,
    `6. Rerun Product Readiness and verify product pilot checks before reporting impact.`,
    ``,
    `Launch acceptance criteria`,
    `- 3+ priority products imported`,
    `- 70+ Product Readiness score`,
    `- SKU Launch Matrix has no blocked hero SKUs`,
    `- Marketplace Listing Proof Matrix averages 80+/100 for hero SKUs`,
    `- At least one product prompt pack sampled and visible in reporting`,
  ].join("\n");
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statusClass(status: string) {
  if (["ready", "pass", "visible", "approved", "published"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["partial", "warning", "weak", "in_review", "queued"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function countCsvDataRows(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(1).length;
}

function getProductLabel(product: any) {
  return String(product?.name || product?.title || product?.asin || product?.sku || "this product").trim();
}

function getCompetitorLabel(product: any) {
  const competitor = Array.isArray(product?.competitors) ? product.competitors[0] : null;
  if (!competitor) return "competing products";
  return String(competitor?.name || competitor?.asin || "competing products").trim();
}

function buildProductPromptPack(products: any[], brandName: string) {
  const prompts = products.slice(0, 10).flatMap((product: any) => {
    const productName = getProductLabel(product);
    const competitor = getCompetitorLabel(product);
    const category = product?.category ? String(product.category).trim() : "this category";
    const objection = Array.isArray(product?.objections) && product.objections[0]
      ? String(product.objections[0]).trim()
      : "common buyer concerns";

    return [
      `Is ${productName} from ${brandName} worth buying in ${category}?`,
      `Compare ${productName} vs ${competitor} for Indian buyers`,
      `What are the pros, cons, and reviews of ${productName}?`,
      `Best alternatives to ${productName} on Amazon or D2C stores`,
      `Does ${productName} solve ${objection}, and who should avoid it?`,
    ];
  });

  return Array.from(new Set(prompts.map((prompt) => prompt.replace(/\s+/g, " ").trim()).filter(Boolean)));
}

function promptMatchesProduct(promptText: string, products: any[]) {
  const haystack = promptText.toLowerCase();
  return products.some((product: any) => {
    const needles = [product?.name, product?.title, product?.asin, product?.sku]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value.length >= 3);
    return needles.some((needle) => haystack.includes(needle));
  });
}

function isPromptStale(prompt: any) {
  if (!prompt?.runCount || !prompt?.lastChecked) return true;
  const lastChecked = new Date(prompt.lastChecked).getTime();
  if (!Number.isFinite(lastChecked)) return true;
  return Date.now() - lastChecked > 14 * 24 * 60 * 60 * 1000;
}

export default function ProductReadiness() {
  const { brandId, brand } = useCurrentBrand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const enabled = Boolean(brandId);
  const [catalogImportMode, setCatalogImportMode] = useState<"json" | "csv">("json");
  const [catalogDraft, setCatalogDraft] = useState(JSON.stringify(SELLER_CATALOG_TEMPLATE, null, 2));
  const [catalogUrlDraft, setCatalogUrlDraft] = useState("https://www.amazon.in/dp/B0XXXXXXXX");
  const [storefrontUrlDraft, setStorefrontUrlDraft] = useState("https://example.com/collections/all");
  const [competitorUrlDraft, setCompetitorUrlDraft] = useState("https://www.amazon.in/dp/B0YYYYYYYY");
  const [draftTouched, setDraftTouched] = useState(false);
  const [serverValidation, setServerValidation] = useState<any>(null);
  const [urlExtractionSources, setUrlExtractionSources] = useState<any[]>([]);
  const [urlDiscoverySummary, setUrlDiscoverySummary] = useState<any>(null);
  const [catalogEnrichmentSummary, setCatalogEnrichmentSummary] = useState<any>(null);
  const [competitorMappingSummary, setCompetitorMappingSummary] = useState<any>(null);
  const [generatedProductPrompts, setGeneratedProductPrompts] = useState<string[]>([]);
  const [productPromptPackSummary, setProductPromptPackSummary] = useState<any>(null);
  const [sellerPilotKitSummary, setSellerPilotKitSummary] = useState<any>(null);
  const [quickProductName, setQuickProductName] = useState("");
  const [quickProductAsin, setQuickProductAsin] = useState("");
  const [quickProductSku, setQuickProductSku] = useState("");
  const [quickProductCategory, setQuickProductCategory] = useState("");
  const [quickProductUrl, setQuickProductUrl] = useState("");
  const [quickCompetitors, setQuickCompetitors] = useState("");
  const [quickClaims, setQuickClaims] = useState("");
  const [quickObjections, setQuickObjections] = useState("");

  const loadCatalogTemplate = (mode: "json" | "csv") => {
    setCatalogImportMode(mode);
    setCatalogDraft(mode === "json" ? JSON.stringify(SELLER_CATALOG_TEMPLATE, null, 2) : SELLER_CATALOG_CSV_TEMPLATE);
    setDraftTouched(true);
    setServerValidation(null);
    setCatalogEnrichmentSummary(null);
    setCompetitorMappingSummary(null);
  };

  const copyCatalogTemplate = async () => {
    const template = catalogImportMode === "json" ? JSON.stringify(SELLER_CATALOG_TEMPLATE, null, 2) : SELLER_CATALOG_CSV_TEMPLATE;
    await navigator.clipboard?.writeText(template);
    toast({
      title: "Catalog template copied",
      description: catalogImportMode === "json" ? "JSON sample copied for seller catalog import." : "CSV sample copied for seller catalog import.",
    });
  };

  const loadAmazonSellerPilotTemplate = () => {
    setCatalogImportMode("json");
    setCatalogDraft(JSON.stringify(AMAZON_SELLER_PILOT_TEMPLATE, null, 2));
    setDraftTouched(true);
    setServerValidation(null);
    setCatalogEnrichmentSummary(null);
    setCompetitorMappingSummary(null);
    setGeneratedProductPrompts([]);
    toast({
      title: "Amazon seller pilot sample loaded",
      description: "Review the sample SKUs, replace placeholders with real ASINs/URLs, then validate and save.",
    });
  };

  const copySellerPilotPlan = async () => {
    const products = catalogProductsForPrompts.length ? catalogProductsForPrompts : parsedCatalog.products;
    await navigator.clipboard?.writeText(buildSellerPilotPlan(brand?.name || "Brand", products || []));
    toast({
      title: "Seller pilot plan copied",
      description: "Share it with the catalog, content, and marketplace teams before launch.",
    });
  };

  const { data: readiness } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "readiness"],
    queryFn: () => api.getProductReadiness(brandId || ""),
    enabled,
  });
  const { data: visibility } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "visibility"],
    queryFn: () => api.getProductVisibility(brandId || ""),
    enabled,
  });
  const { data: actions } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "actions"],
    queryFn: () => api.getProductVisibilityActions(brandId || ""),
    enabled,
  });
  const { data: drafts } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "drafts"],
    queryFn: () => api.getProductVisibilityDrafts(brandId || ""),
    enabled,
  });
  const { data: publishQueue } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "publish-queue"],
    queryFn: () => api.getProductVisibilityPublishQueue(brandId || ""),
    enabled,
  });
  const { data: clientReport } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "client-report"],
    queryFn: () => api.getProductVisibilityClientReport(brandId || ""),
    enabled,
  });
  const { data: productCatalog } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "catalog"],
    queryFn: () => api.getProductCatalog(brandId || ""),
    enabled,
  });
  const { data: trackedPrompts = [] } = useQuery<any[]>({
    queryKey: ["product-cockpit", brandId, "prompts"],
    queryFn: () => api.getPrompts(brandId || ""),
    enabled,
  });
  const { data: samplingAutomation } = useQuery<any>({
    queryKey: ["product-cockpit", brandId, "sampling-automation"],
    queryFn: () => api.getProductSamplingAutomation(brandId || ""),
    enabled,
  });

  useEffect(() => {
    if (!draftTouched && catalogImportMode === "json" && productCatalog?.products?.length) {
      setCatalogDraft(JSON.stringify(productCatalog.products, null, 2));
    }
  }, [catalogImportMode, draftTouched, productCatalog]);

  const parsedCatalog = useMemo(() => {
    if (catalogImportMode === "csv") return { products: [], error: "" };
    try {
      const parsed = JSON.parse(catalogDraft);
      if (!Array.isArray(parsed)) return { products: [], error: "Catalog JSON must be an array of products." };
      return { products: parsed, error: "" };
    } catch (error: any) {
      return { products: [], error: error?.message || "Invalid JSON." };
    }
  }, [catalogDraft, catalogImportMode]);

  const localCatalogStats = useMemo(() => {
    if (serverValidation?.stats) return serverValidation.stats;
    if (catalogImportMode === "csv") {
      return {
        products: countCsvDataRows(catalogDraft),
        identifiers: 0,
        competitors: 0,
        claims: 0,
        objections: 0,
      };
    }
    const products = parsedCatalog.products || [];
    return {
      products: products.length,
      identifiers: products.filter((product: any) => product?.asin || product?.sku).length,
      competitors: products.filter((product: any) => Array.isArray(product?.competitors) && product.competitors.length > 0).length,
      claims: products.filter((product: any) => Array.isArray(product?.claims) && product.claims.length >= 2).length,
      objections: products.filter((product: any) => Array.isArray(product?.objections) && product.objections.length > 0).length,
    };
  }, [catalogDraft, catalogImportMode, parsedCatalog.products, serverValidation]);

  const validateCatalogMutation = useMutation({
    mutationFn: () => api.validateProductCatalogImport(brandId || "", { mode: catalogImportMode, input: catalogDraft }),
    onSuccess: (result: any) => {
      setServerValidation(result);
      toast({
        title: result?.valid ? "Catalog is ready to save" : "Catalog needs fixes",
        description: result?.valid
          ? `${result?.stats?.products || 0} SKU${result?.stats?.products === 1 ? "" : "s"} passed server validation.`
          : result?.errors?.[0],
        variant: result?.valid ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({ title: "Validation failed", description: error?.message, variant: "destructive" });
    },
  });

  const saveCatalogMutation = useMutation({
    mutationFn: () => {
      const products = catalogImportMode === "csv" ? serverValidation?.products || [] : parsedCatalog.products;
      return api.updateProductCatalog(brandId || "", products, catalogImportMode);
    },
    onSuccess: (result: any) => {
      setServerValidation(result?.validation || null);
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands", brandId, "product-catalog"] });
      toast({ title: "Product catalog saved", description: `${result?.count || 0} SKU${result?.count === 1 ? "" : "s"} are now tracked.` });
    },
    onError: (error: any) => {
      toast({ title: "Catalog save failed", description: error?.message, variant: "destructive" });
    },
  });

  const extractCatalogUrlsMutation = useMutation({
    mutationFn: () => {
      const urls = catalogUrlDraft.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
      return api.extractProductCatalogFromUrls(brandId || "", urls);
    },
    onSuccess: (result: any) => {
      setCatalogImportMode("json");
      setCatalogDraft(JSON.stringify(result?.products || [], null, 2));
      setDraftTouched(true);
      setServerValidation(result?.validation || null);
      setUrlExtractionSources(result?.sources || []);
      setUrlDiscoverySummary(null);
      setCatalogEnrichmentSummary(null);
      setCompetitorMappingSummary(null);
      setGeneratedProductPrompts([]);
      toast({
        title: "Product URLs extracted",
        description: `${result?.products?.length || 0} product row${result?.products?.length === 1 ? "" : "s"} ready to review.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "URL extraction failed", description: error?.message, variant: "destructive" });
    },
  });

  const discoverStorefrontMutation = useMutation({
    mutationFn: () => api.discoverProductCatalogFromStorefront(brandId || "", storefrontUrlDraft.trim(), 12),
    onSuccess: (result: any) => {
      setCatalogImportMode("json");
      setCatalogDraft(JSON.stringify(result?.products || [], null, 2));
      setDraftTouched(true);
      setServerValidation(result?.validation || null);
      setUrlExtractionSources(result?.sources || []);
      setUrlDiscoverySummary(result);
      setCatalogEnrichmentSummary(null);
      setCompetitorMappingSummary(null);
      setGeneratedProductPrompts([]);
      toast({
        title: "Storefront discovery completed",
        description: `${result?.discoveredUrls?.length || 0} URL${result?.discoveredUrls?.length === 1 ? "" : "s"} discovered, ${result?.products?.length || 0} product row${result?.products?.length === 1 ? "" : "s"} extracted.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Storefront discovery failed", description: error?.message, variant: "destructive" });
    },
  });

  const enrichCatalogMutation = useMutation({
    mutationFn: () => {
      const products = catalogImportMode === "csv" ? serverValidation?.products || [] : parsedCatalog.products;
      return api.enrichProductCatalog(brandId || "", products);
    },
    onSuccess: (result: any) => {
      setCatalogImportMode("json");
      setCatalogDraft(JSON.stringify(result?.products || [], null, 2));
      setDraftTouched(true);
      setServerValidation(result?.validation || null);
      setCatalogEnrichmentSummary(result?.summary || null);
      setCompetitorMappingSummary(null);
      setGeneratedProductPrompts([]);
      toast({
        title: "Catalog enriched",
        description: `${result?.summary?.claimsAdded || 0} claims, ${result?.summary?.objectionsAdded || 0} objections, ${result?.summary?.competitorsAdded || 0} competitor placeholders added.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Catalog enrichment failed", description: error?.message, variant: "destructive" });
    },
  });

  const mapCompetitorsMutation = useMutation({
    mutationFn: () => {
      const products = catalogImportMode === "csv" ? serverValidation?.products || [] : parsedCatalog.products;
      const competitorUrls = competitorUrlDraft.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
      return api.mapProductCatalogCompetitors(brandId || "", products, competitorUrls);
    },
    onSuccess: (result: any) => {
      setCatalogImportMode("json");
      setCatalogDraft(JSON.stringify(result?.products || [], null, 2));
      setDraftTouched(true);
      setServerValidation(result?.validation || null);
      setUrlExtractionSources(result?.sources || []);
      setCatalogEnrichmentSummary(null);
      setCompetitorMappingSummary(result?.summary || null);
      setGeneratedProductPrompts([]);
      toast({
        title: "Competitor products mapped",
        description: `${result?.summary?.competitorsAdded || 0} competitor product${result?.summary?.competitorsAdded === 1 ? "" : "s"} attached across ${result?.summary?.products || 0} SKU${result?.summary?.products === 1 ? "" : "s"}.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Competitor mapping failed", description: error?.message, variant: "destructive" });
    },
  });

  const catalogProductsForPrompts = useMemo(() => {
    if (serverValidation?.products?.length) return serverValidation.products;
    if (productCatalog?.products?.length) return productCatalog.products;
    if (catalogImportMode === "json") return parsedCatalog.products || [];
    return [];
  }, [catalogImportMode, parsedCatalog.products, productCatalog, serverValidation]);

  const promptPackMutation = useMutation({
    mutationFn: (prompts: string[]) => api.createPromptsBulk(brandId || "", prompts),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId, "prompts"] });
      queryClient.invalidateQueries({ queryKey: ['prompts', brandId] });
      queryClient.invalidateQueries({ queryKey: ['promptCoveragePlan', brandId] });
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId, "visibility"] });
      toast({
        title: "Product prompts added",
        description: `${result?.createdCount || 0} created, ${result?.skippedDuplicates || 0} skipped as duplicates.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Prompt creation failed", description: error?.message, variant: "destructive" });
    },
  });

  const activateProductPromptPackMutation = useMutation({
    mutationFn: () => api.activateProductPromptPack(brandId || "", {
      maxPrompts: 25,
      maxSamplingPrompts: 10,
    }),
    onSuccess: (result: any) => {
      setProductPromptPackSummary(result);
      setGeneratedProductPrompts(result?.prompts?.examples || []);
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId] });
      queryClient.invalidateQueries({ queryKey: ["prompts", brandId] });
      queryClient.invalidateQueries({ queryKey: ["promptCoveragePlan", brandId] });
      toast({
        title: "Product prompt pack activated",
        description: result?.message || "Product prompts and sampling jobs are now queued.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Activation failed", description: error?.message, variant: "destructive" });
    },
  });

  const pilotCheckTaskMutation = useMutation({
    mutationFn: (checkId: string) => api.createProductPilotCheckTask(brandId || "", checkId),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["action-workflow", brandId] });
      queryClient.invalidateQueries({ queryKey: ["command-center", brandId, "optimizations"] });
      toast({
        title: result?.duplicate ? "Pilot task already exists" : "Pilot task added",
        description: result?.check?.label ? `${result.check.label} is now tracked in Action Workflow.` : "The pilot blocker is now tracked in Action Workflow.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Task creation failed", description: error?.message, variant: "destructive" });
    },
  });

  const addQuickProductToDraft = () => {
    const asin = quickProductAsin.trim().toUpperCase();
    const sku = quickProductSku.trim();
    const name = quickProductName.trim() || asin || sku;
    if (!name) {
      toast({ title: "Add a product name, ASIN, or SKU first", variant: "destructive" });
      return;
    }

    const existingProducts = catalogImportMode === "csv"
      ? serverValidation?.products || productCatalog?.products || []
      : parsedCatalog.products || [];
    const productUrl = quickProductUrl.trim() || (asin ? `https://www.amazon.in/dp/${asin}` : "");
    const competitors = quickCompetitors
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [competitorName, competitorAsinOrUrl] = line.split("::").map((value) => value?.trim());
        const competitorAsin = competitorAsinOrUrl && /^B[0-9A-Z]{9}$/i.test(competitorAsinOrUrl) ? competitorAsinOrUrl.toUpperCase() : "";
        const competitorUrl = competitorAsinOrUrl && /^https?:\/\//i.test(competitorAsinOrUrl) ? competitorAsinOrUrl : (competitorAsin ? `https://www.amazon.in/dp/${competitorAsin}` : "");
        return {
          name: competitorName || competitorAsin || competitorAsinOrUrl || "Competitor product",
          asin: competitorAsin || null,
          url: competitorUrl || null,
        };
      });
    const claims = quickClaims.split(/\r?\n|\|/).map((item) => item.trim()).filter(Boolean);
    const objections = quickObjections.split(/\r?\n|\|/).map((item) => item.trim()).filter(Boolean);

    const product = {
      name,
      asin: asin || null,
      sku: sku || null,
      marketplace: asin || productUrl.includes("amazon.") ? "amazon" : "d2c",
      category: quickProductCategory.trim() || "Product",
      productUrl: productUrl || null,
      priceBand: "standard",
      priority: "high",
      competitors,
      claims,
      objections,
    };

    setCatalogImportMode("json");
    setCatalogDraft(JSON.stringify([...existingProducts, product], null, 2));
    setDraftTouched(true);
    setServerValidation(null);
    setCatalogEnrichmentSummary(null);
    setCompetitorMappingSummary(null);
    setGeneratedProductPrompts([]);
    setQuickProductName("");
    setQuickProductAsin("");
    setQuickProductSku("");
    setQuickProductCategory("");
    setQuickProductUrl("");
    setQuickCompetitors("");
    setQuickClaims("");
    setQuickObjections("");
    toast({ title: "SKU added to draft", description: "Validate and save the seller catalog when the draft looks right." });
  };

  const productSamplingPrompts = useMemo(() => {
    const products = catalogProductsForPrompts.length ? catalogProductsForPrompts : productCatalog?.products || [];
    if (!products.length) return [];
    return (trackedPrompts || [])
      .filter((prompt: any) => promptMatchesProduct(prompt.text || "", products))
      .map((prompt: any) => ({
        ...prompt,
        staleForProductSampling: isPromptStale(prompt),
      }))
      .sort((a: any, b: any) => Number(b.staleForProductSampling) - Number(a.staleForProductSampling));
  }, [catalogProductsForPrompts, productCatalog, trackedPrompts]);

  const promptsNeedingSampling = useMemo(
    () => productSamplingPrompts.filter((prompt: any) => prompt.staleForProductSampling),
    [productSamplingPrompts],
  );

  const productSamplingMutation = useMutation({
    mutationFn: async (prompts: any[]) => {
      const targets = prompts.slice(0, 5);
      const results = [];
      for (const prompt of targets) {
        results.push(await api.triggerLLMSampling(prompt.id));
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId, "prompts"] });
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId, "visibility"] });
      toast({ title: "Product sampling queued", description: `${results.length} prompt${results.length === 1 ? "" : "s"} sent to LLM sampling.` });
    },
    onError: (error: any) => {
      toast({ title: "Sampling failed", description: error?.message, variant: "destructive" });
    },
  });

  const samplingAutomationMutation = useMutation({
    mutationFn: (data: any) => api.updateProductSamplingAutomation(brandId || "", data),
    onSuccess: (automation: any) => {
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId, "sampling-automation"] });
      toast({
        title: automation?.enabled ? "Product sampling automation enabled" : "Product sampling automation updated",
        description: automation?.nextRunAt ? `Next run ${new Date(automation.nextRunAt).toLocaleString()}.` : "Manual sampling mode is active.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Automation update failed", description: error?.message, variant: "destructive" });
    },
  });

  const sellerPilotKitMutation = useMutation({
    mutationFn: () => {
      const products = catalogImportMode === "csv"
        ? serverValidation?.products || productCatalog?.products || []
        : (parsedCatalog.products.length ? parsedCatalog.products : productCatalog?.products || []);
      return api.launchProductSellerPilotKit(brandId || "", {
        products,
        enrich: true,
        createPrompts: true,
        queueSampling: true,
        maxPrompts: 25,
      });
    },
    onSuccess: (result: any) => {
      setSellerPilotKitSummary(result);
      if (result?.catalog?.validation?.products?.length) {
        setCatalogImportMode("json");
        setCatalogDraft(JSON.stringify(result.catalog.validation.products, null, 2));
        setServerValidation(result.catalog.validation);
      }
      queryClient.invalidateQueries({ queryKey: ["product-cockpit", brandId] });
      queryClient.invalidateQueries({ queryKey: ["prompts", brandId] });
      toast({
        title: "Seller pilot kit prepared",
        description: result?.message || "Catalog, prompts, sampling, and snapshot were prepared.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Pilot kit failed", description: error?.message, variant: "destructive" });
    },
  });

  const cockpit = useMemo(() => {
    const products = visibility?.products || [];
    const actionItems = actions?.actions || [];
    const draftItems = drafts?.drafts || [];
    const queueItems = publishQueue?.queue || [];
    const skuCoverage = numberValue(visibility?.samplingReadiness?.productPromptCoverage?.coveragePercent);
    const visibleProducts = numberValue(visibility?.metrics?.visibleProducts);
    const totalProducts = numberValue(visibility?.metrics?.products || readiness?.metrics?.catalogProducts);
    const highPriorityActions = actionItems.filter((item: any) => item.priority === "high").length;
    const approvedDrafts = draftItems.filter((item: any) => item.status === "approved").length;
    const queuedArtifacts = queueItems.filter((item: any) => item.status === "queued").length;
    const publishedArtifacts = queueItems.filter((item: any) => item.status === "published").length;
    const competitorShare = numberValue(visibility?.competitiveBenchmark?.competitorShare);
    const brandShare = numberValue(visibility?.competitiveBenchmark?.brandShare);
    const samplingScore = numberValue(visibility?.samplingReadiness?.coverageScore);
    const readinessScore = numberValue(readiness?.score);
    const pilotReadiness = clientReport?.pilotReadiness;
    const computedLaunchScore = Math.round(
      (readinessScore * 0.3) +
      (samplingScore * 0.2) +
      (skuCoverage * 0.2) +
      ((totalProducts ? (visibleProducts / totalProducts) * 100 : 0) * 0.2) +
      (Math.min(100, (approvedDrafts + publishedArtifacts) * 20) * 0.1),
    );
    const launchScore = numberValue(pilotReadiness?.score, computedLaunchScore);

    return {
      products,
      actionItems,
      draftItems,
      queueItems,
      skuCoverage,
      visibleProducts,
      totalProducts,
      highPriorityActions,
      approvedDrafts,
      queuedArtifacts,
      publishedArtifacts,
      competitorShare,
      brandShare,
      samplingScore,
      readinessScore,
      pilotReadiness,
      launchStatus: pilotReadiness?.status || (launchScore >= 75 ? "ready" : launchScore >= 45 ? "needs_review" : "blocked"),
      launchScore,
    };
  }, [actions, clientReport, drafts, publishQueue, readiness, visibility]);

  const gates = [
    {
      label: "Catalog depth",
      status: cockpit.totalProducts >= 3 ? "ready" : cockpit.totalProducts > 0 ? "partial" : "blocked",
      evidence: `${cockpit.totalProducts} SKUs imported`,
    },
    {
      label: "SKU prompt coverage",
      status: cockpit.skuCoverage >= 70 ? "ready" : cockpit.skuCoverage > 0 ? "partial" : "blocked",
      evidence: `${cockpit.skuCoverage}% product prompt coverage`,
    },
    {
      label: "Provider sampling",
      status: visibility?.samplingReadiness?.status || "blocked",
      evidence: `${cockpit.samplingScore}/100 sampling score`,
    },
    {
      label: "Competitive benchmark",
      status: visibility?.competitiveBenchmark?.setupRequired ? "blocked" : cockpit.competitorShare > cockpit.brandShare ? "partial" : "ready",
      evidence: `${cockpit.brandShare}% brand share vs ${cockpit.competitorShare}% competitor share`,
    },
    {
      label: "Publish workflow",
      status: cockpit.publishedArtifacts > 0 ? "ready" : cockpit.approvedDrafts + cockpit.queuedArtifacts > 0 ? "partial" : "blocked",
      evidence: `${cockpit.approvedDrafts} approved, ${cockpit.queuedArtifacts} queued, ${cockpit.publishedArtifacts} published`,
    },
  ];

  const nextMoves = [
    cockpit.totalProducts === 0 ? "Import 3-10 priority ASINs/SKUs with product URL, claims, objections, rating, and competitors." : "",
    cockpit.skuCoverage < 70 ? "Generate product-level prompts for buying, comparison, review, alternatives, objections, and problem use cases." : "",
    cockpit.competitorShare > cockpit.brandShare ? "Create battlecards for the SKUs where competitor products are ahead in AI answers." : "",
    cockpit.highPriorityActions > 0 ? "Move high-priority product visibility actions into draft review and publish queue." : "",
    cockpit.publishedArtifacts === 0 ? "Publish at least one Product schema, FAQ, AXP page, or CMS export and save a follow-up snapshot." : "",
  ].filter(Boolean);

  const skuLaunchMatrix = useMemo(() => {
    const visibilityByProduct = new Map<string, any>(
      (visibility?.products || []).map((product: any) => [String(product.productId || product.id || product.name), product]),
    );
    const promptTexts = trackedPrompts.map((prompt: any) => String(prompt.text || ""));
    const openActionsByProduct = new Map<string, any[]>();
    cockpit.actionItems.forEach((action: any) => {
      if (!action.productId || action.status === "done") return;
      const key = String(action.productId);
      openActionsByProduct.set(key, [...(openActionsByProduct.get(key) || []), action]);
    });

    const rows: Array<{
      id: string;
      name: string;
      asin: string;
      sku: string;
      category: string;
      score: number;
      status: string;
      evidence: {
        prompts: number;
        mentions: number;
        sources: number;
        competitors: number;
        claims: number;
        objections: number;
      };
      blockers: string[];
      nextAction: string;
    }> = (catalogProductsForPrompts.length ? catalogProductsForPrompts : productCatalog?.products || [])
      .slice(0, 12)
      .map((product: any) => {
        const productId = String(product.id || product.asin || product.sku || product.name || "");
        const visibilityProduct = visibilityByProduct.get(productId) || visibilityByProduct.get(String(product.name || ""));
        const promptMatches = numberValue(visibilityProduct?.promptMatches, promptTexts.filter((text) => promptMatchesProduct(text, [product])).length);
        const mentionMatches = numberValue(visibilityProduct?.mentionMatches);
        const sourceMatches = numberValue(visibilityProduct?.sourceMatches);
        const competitorProducts = Array.isArray(product.competitors) ? product.competitors.length : numberValue(visibilityProduct?.competitorProducts);
        const claims = Array.isArray(product.claims) ? product.claims.length : 0;
        const objections = Array.isArray(product.objections) ? product.objections.length : 0;
        const hasIdentifier = Boolean(product.asin || product.sku);
        const hasUrl = Boolean(product.productUrl || product.url);
        const openActions = openActionsByProduct.get(String(product.id || "")) || openActionsByProduct.get(productId) || [];
        const blockers = [
          !hasIdentifier ? "missing ASIN/SKU" : "",
          !hasUrl ? "missing product URL" : "",
          competitorProducts < 1 ? "no competitor product" : "",
          claims < 2 ? "needs claims" : "",
          objections < 1 ? "needs objection" : "",
          promptMatches < 3 ? "prompt gap" : "",
          mentionMatches < 1 ? "no AI mention" : "",
          sourceMatches < 1 ? "no source proof" : "",
          openActions.length > 0 ? `${openActions.length} open action${openActions.length === 1 ? "" : "s"}` : "",
        ].filter(Boolean);
        const readySignals = [
          hasIdentifier,
          hasUrl,
          competitorProducts >= 1,
          claims >= 2,
          objections >= 1,
          promptMatches >= 3,
          mentionMatches >= 1,
          sourceMatches >= 1,
          openActions.length === 0,
        ].filter(Boolean).length;
        const score = Math.round((readySignals / 9) * 100);
        const status = score >= 78 ? "ready" : score >= 45 ? "partial" : "blocked";
        return {
          id: productId || product.name,
          name: getProductLabel(product),
          asin: product.asin || "",
          sku: product.sku || "",
          category: product.category || product.marketplace || "uncategorized",
          score,
          status,
          evidence: {
            prompts: promptMatches,
            mentions: mentionMatches,
            sources: sourceMatches,
            competitors: competitorProducts,
            claims,
            objections,
          },
          blockers,
          nextAction: blockers[0]
            ? blockers[0].replace(/^no /, "add ").replace(/^missing /, "add ").replace(/^needs /, "add ")
            : "keep sampling and proof fresh",
        };
      });

    const ready = rows.filter((row: any) => row.status === "ready").length;
    const partial = rows.filter((row: any) => row.status === "partial").length;
    const blocked = rows.length - ready - partial;
    return { rows, ready, partial, blocked };
  }, [catalogProductsForPrompts, cockpit.actionItems, productCatalog, trackedPrompts, visibility]);

  const marketplaceListingMatrix = useMemo(() => {
    if (clientReport?.marketplaceListingMatrix?.rows) return clientReport.marketplaceListingMatrix;
    const visibilityPairs: Array<[string, any]> = [];
    (visibility?.products || []).forEach((product: any) => {
      [product.productId || product.id, product.name, product.asin, product.sku].forEach((key) => {
        const normalized = String(key || "");
        if (normalized) visibilityPairs.push([normalized, product]);
      });
    });
    const visibilityByProduct = new Map<string, any>(visibilityPairs);
    const rows = (catalogProductsForPrompts.length ? catalogProductsForPrompts : productCatalog?.products || [])
      .slice(0, 12)
      .map((product: any) => {
        const productId = String(product.id || product.asin || product.sku || product.name || "");
        const visibilityProduct = visibilityByProduct.get(productId) || visibilityByProduct.get(String(product.name || ""));
        const identifier = Boolean(product.asin || product.sku);
        const productUrl = Boolean(product.productUrl || product.url);
        const priceBand = Boolean(product.priceBand);
        const rating = numberValue(product.rating) > 0;
        const reviews = numberValue(product.reviewCount) > 0;
        const claims = Array.isArray(product.claims) ? product.claims.length : 0;
        const objections = Array.isArray(product.objections) ? product.objections.length : 0;
        const competitors = Array.isArray(product.competitors) ? product.competitors.length : numberValue(visibilityProduct?.competitorProducts);
        const sourceProof = numberValue(visibilityProduct?.sourceMatches);
        const blockers = [
          !identifier ? "missing ASIN/SKU" : "",
          !productUrl ? "missing product URL" : "",
          !priceBand ? "missing price band" : "",
          !rating ? "missing rating proof" : "",
          !reviews ? "missing review count" : "",
          claims < 2 ? "needs 2 claims" : "",
          objections < 1 ? "needs buyer objection" : "",
          competitors < 1 ? "needs competitor ASIN/product" : "",
          sourceProof < 1 ? "needs citable source proof" : "",
        ].filter(Boolean);
        const score = Math.min(100, Math.round(
          (identifier ? 12 : 0) +
          (productUrl ? 12 : 0) +
          (priceBand ? 10 : 0) +
          (rating ? 10 : 0) +
          (reviews ? 10 : 0) +
          Math.min(16, claims * 8) +
          (objections >= 1 ? 10 : 0) +
          Math.min(10, competitors * 5) +
          (sourceProof > 0 ? 10 : 0)
        ));
        const status = score >= 80 ? "ready" : score >= 50 ? "partial" : "blocked";
        return {
          productId,
          name: getProductLabel(product),
          asin: product.asin || "",
          sku: product.sku || "",
          marketplace: product.marketplace || "",
          score,
          status,
          signals: { identifier, productUrl, priceBand, rating, reviews, claims, objections, competitors, sourceProof },
          blockers,
          nextAction: blockers[0]
            ? blockers[0].replace(/^missing /, "add ").replace(/^needs /, "add ")
            : "keep marketplace proof fresh",
        };
      });
    const ready = rows.filter((row: any) => row.status === "ready").length;
    const partial = rows.filter((row: any) => row.status === "partial").length;
    const blocked = rows.length - ready - partial;
    const averageScore = rows.length ? Math.round(rows.reduce((sum: number, row: any) => sum + row.score, 0) / rows.length) : 0;
    return { rows, ready, partial, blocked, averageScore };
  }, [catalogProductsForPrompts, clientReport, productCatalog, visibility]);

  const saveDisabled = saveCatalogMutation.isPending
    || Boolean(parsedCatalog.error)
    || localCatalogStats.products === 0
    || !brandId
    || (catalogImportMode === "csv" && (!serverValidation?.valid || !serverValidation?.products?.length));

  const canEnrichCatalog = (catalogImportMode === "csv" ? (serverValidation?.products?.length || 0) : parsedCatalog.products.length) > 0 && !parsedCatalog.error;
  const canMapCompetitors = canEnrichCatalog && competitorUrlDraft.split(/\r?\n/).some((url) => url.trim());

  const canGenerateProductPrompts = catalogProductsForPrompts.length > 0;
  const samplingTargets = promptsNeedingSampling.length ? promptsNeedingSampling : productSamplingPrompts;
  const canLaunchSellerPilotKit = canEnrichCatalog || (productCatalog?.products?.length || 0) > 0;
  const productReadinessActive = Boolean(readiness?.relevant || cockpit.totalProducts > 0 || (productCatalog?.count || 0) > 0);
  const jumpToDeepProductReadiness = () => {
    document.getElementById("deep-product-readiness-tool")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!brandId) {
    return (
      <div className="space-y-6">
        <TopBar title="Product Readiness" />
        <p className="text-muted-foreground">Select a brand to view product readiness.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <TopBar title="Product Readiness" showExport />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight">
            {productReadinessActive ? "Marketplace Launch Cockpit" : "Product Readiness Setup"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {productReadinessActive
              ? `SKU-level AI readiness for ${brand?.name || "this brand"} across catalog depth, marketplace prompts, competitor pressure, listing assets, and publish verification.`
              : `${brand?.name || "This brand"} is not currently configured as an Amazon, D2C, Shopify, or product-led account. Import real SKUs/ASINs below to activate Product Readiness; otherwise use Agent Readiness and Query Fanouts for this brand.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={jumpToDeepProductReadiness} data-testid="button-jump-deep-product-readiness">
            <ClipboardList className="mr-2 h-4 w-4" />
            Deep checks
          </Button>
          <Badge variant="outline" className={cn("w-fit capitalize", statusClass(cockpit.launchStatus === "ready" ? "ready" : cockpit.launchStatus === "needs_review" ? "partial" : "blocked"))}>
            {productReadinessActive
              ? cockpit.launchStatus === "ready" ? "Seller pilot ready" : cockpit.launchStatus === "needs_review" ? "Needs launch hardening" : "Setup required"
              : "Not active for this brand"}
          </Badge>
        </div>
      </div>

      {productReadinessActive ? (
      <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Launch Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.launchScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <Progress value={cockpit.launchScore} className="mt-3 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Visible SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.visibleProducts}/{cockpit.totalProducts}</div>
            <p className="text-xs text-muted-foreground mt-2">{cockpit.skuCoverage}% prompt coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Competitor Pressure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.brandShare}:{cockpit.competitorShare}</div>
            <p className="text-xs text-muted-foreground mt-2">brand vs competitor product share</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Execution Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.highPriorityActions}</div>
            <p className="text-xs text-muted-foreground mt-2">high-priority product actions</p>
          </CardContent>
        </Card>
      </div>
      </>
      ) : (
        <Card data-testid="product-readiness-inactive-state">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-5 w-5 text-primary" />
              Product Readiness is inactive until product data exists
            </CardTitle>
            <CardDescription>{readiness?.summary || "This workspace has no saved seller catalog yet."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {[
              ["Current mode", "Agent/brand readiness", "Use Agent Readiness, Entity Intelligence, and Query Fanouts for non-product brands."],
              ["To activate", "Import SKUs or ASINs", "Add priority product URLs, competitor products, claims, objections, and categories."],
              ["After activation", "Run seller pilot kit", "Create product prompts, queue sampling, generate schema/FAQ assets, and measure SKU visibility."],
            ].map(([label, title, detail]) => (
              <div key={label} className="rounded-md border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="amazon-seller-pilot-onboarding">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-5 w-5 text-primary" />
                Amazon / D2C Seller Pilot Onboarding
              </CardTitle>
              <CardDescription>
                Use this path for Boat Airdopes-style catalogs, Amazon seller brands, Shopify stores, and product-led D2C teams.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", statusClass(productReadinessActive ? "ready" : "partial"))}>
              {productReadinessActive ? "Catalog active" : "Ready to activate"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Catalog", "Import 3-10 hero SKUs or ASINs with canonical product URLs."],
              ["Competitive Set", "Attach exact competing ASINs or product URLs for every priority SKU."],
              ["Buying Proof", "Add claims, ratings, review counts, warranty, objections, and citable proof."],
              ["Sampling", "Generate SKU prompts, run AI sampling, and verify product pilot checks."],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              For a wireless earbuds seller, start with hero earbuds, neckband, and speaker SKUs, then compare against Noise, Boult, Realme, JBL, or the actual products buyers mention in reviews.
            </p>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="sm" onClick={loadAmazonSellerPilotTemplate} data-testid="button-load-amazon-seller-pilot-template">
                <PackageCheck className="mr-2 h-4 w-4" />
                Load seller sample
              </Button>
              <Button variant="outline" size="sm" onClick={copySellerPilotPlan} data-testid="button-copy-seller-pilot-plan">
                <Copy className="mr-2 h-4 w-4" />
                Copy pilot plan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {productReadinessActive && cockpit.pilotReadiness ? (
        <Card data-testid="product-pilot-readiness">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Rocket className="h-5 w-5 text-primary" />
                  Product Pilot Readiness
                </CardTitle>
                <CardDescription>{cockpit.pilotReadiness.summary}</CardDescription>
              </div>
              <Badge
                variant="outline"
                className={cn("w-fit capitalize", statusClass(cockpit.pilotReadiness.status === "ready" ? "ready" : cockpit.pilotReadiness.status === "needs_review" ? "partial" : "blocked"))}
              >
                {String(cockpit.pilotReadiness.status).replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
              <div className="rounded-md border p-4">
                <p className="text-xs text-muted-foreground">Pilot score</p>
                <p className="mt-2 font-mono text-3xl font-bold">{cockpit.pilotReadiness.score}<span className="text-sm text-muted-foreground">/100</span></p>
                <Progress value={cockpit.pilotReadiness.score || 0} className="mt-3 h-2" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(cockpit.pilotReadiness.checks || []).slice(0, 8).map((check: any) => (
                  <div key={check.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{check.label}</p>
                      <Badge variant="outline" className={cn("uppercase", statusClass(check.status === "pass" ? "ready" : check.status === "warning" ? "partial" : "blocked"))}>
                        {check.status}
                      </Badge>
                    </div>
                    <p className="mt-2 font-mono text-lg font-semibold">{check.score}<span className="text-xs text-muted-foreground">/100</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">{check.evidence}</p>
                    {check.status !== "pass" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => pilotCheckTaskMutation.mutate(check.id)}
                        disabled={pilotCheckTaskMutation.isPending || !brandId}
                        data-testid={`button-create-pilot-task-${check.id}`}
                      >
                        {pilotCheckTaskMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
                        Add task
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {(cockpit.pilotReadiness.launchPlan || []).length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-3" data-testid="product-pilot-launch-plan">
                {(cockpit.pilotReadiness.launchPlan || []).map((phase: any) => (
                  <div key={phase.phase} className="rounded-md border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{phase.title}</p>
                      <Badge variant="outline" className="capitalize">{String(phase.owner).replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">{String(phase.phase).replace(/_/g, " ")}</p>
                    <div className="mt-3 space-y-2">
                      {(phase.actions || []).slice(0, 3).map((action: string) => (
                        <p key={action} className="flex gap-2 text-xs text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                          <span>{action}</span>
                        </p>
                      ))}
                    </div>
                    {(phase.exitCriteria || [])[0] ? (
                      <p className="mt-3 rounded-md border bg-background p-2 text-xs text-primary">{phase.exitCriteria[0]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {productReadinessActive ? (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-primary" />
              Seller Launch Gates
            </CardTitle>
            <CardDescription>What must be true before pitching this as a serious Amazon/D2C seller workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {gates.map((gate) => (
                <div key={gate.label} className="rounded-md border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{gate.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{gate.evidence}</p>
                    </div>
                    <Badge variant="outline" className={cn("capitalize", statusClass(gate.status))}>{gate.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-primary" />
              Next Seller Moves
            </CardTitle>
            <CardDescription>Highest impact tasks for product-led launch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(nextMoves.length ? nextMoves : ["Keep catalog, competitor products, sampling runs, and publish artifacts fresh before every client report."]).map((move) => (
              <div key={move} className="flex gap-3 rounded-md border p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{move}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      ) : null}

      {productReadinessActive && skuLaunchMatrix.rows.length ? (
        <Card data-testid="sku-launch-matrix">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageCheck className="h-5 w-5 text-primary" />
                  SKU Launch Matrix
                </CardTitle>
                <CardDescription>
                  Per-product seller readiness across identifiers, URLs, competitor products, claims, objections, prompts, AI mentions, source proof, and open actions.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  {skuLaunchMatrix.ready} ready
                </Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {skuLaunchMatrix.partial} partial
                </Badge>
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                  {skuLaunchMatrix.blocked} blocked
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[860px] rounded-md border">
                <div className="grid grid-cols-[1.25fr_0.75fr_0.55fr_1.2fr_1.25fr_0.8fr] gap-0 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>SKU</div>
                  <div>Category</div>
                  <div>Score</div>
                  <div>Evidence</div>
                  <div>Launch blockers</div>
                  <div>Next action</div>
                </div>
                {skuLaunchMatrix.rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.25fr_0.75fr_0.55fr_1.2fr_1.25fr_0.8fr] gap-0 border-b px-3 py-3 text-sm last:border-b-0"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {[row.asin, row.sku].filter(Boolean).join(" / ") || "No ASIN/SKU"}
                      </p>
                    </div>
                    <div className="pr-3 text-muted-foreground">{row.category}</div>
                    <div className="pr-3">
                      <Badge variant="outline" className={cn("capitalize", statusClass(row.status))}>
                        {row.score}/100
                      </Badge>
                    </div>
                    <div className="pr-3 text-xs text-muted-foreground">
                      <p>{row.evidence.prompts} prompts, {row.evidence.mentions} mentions, {row.evidence.sources} sources</p>
                      <p>{row.evidence.competitors} competitors, {row.evidence.claims} claims, {row.evidence.objections} objections</p>
                    </div>
                    <div className="pr-3">
                      {row.blockers.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.blockers.slice(0, 4).map((blocker) => (
                            <Badge key={blocker} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              {blocker}
                            </Badge>
                          ))}
                          {row.blockers.length > 4 ? (
                            <Badge variant="outline">+{row.blockers.length - 4}</Badge>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No launch blockers</span>
                      )}
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">{row.nextAction}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {productReadinessActive && marketplaceListingMatrix.rows.length ? (
        <Card data-testid="marketplace-listing-proof-matrix">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCheck2 className="h-5 w-5 text-primary" />
                  Marketplace Listing Proof Matrix
                </CardTitle>
                <CardDescription>
                  Seller-facing proof quality for Amazon/D2C listings: price, rating, reviews, claims, objections, competitor products, and citable sources.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn(statusClass(marketplaceListingMatrix.averageScore >= 80 ? "ready" : marketplaceListingMatrix.averageScore >= 50 ? "partial" : "blocked"))}>
                  {marketplaceListingMatrix.averageScore}/100 avg
                </Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{marketplaceListingMatrix.ready} ready</Badge>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{marketplaceListingMatrix.partial} partial</Badge>
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{marketplaceListingMatrix.blocked} blocked</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[920px] rounded-md border">
                <div className="grid grid-cols-[1.2fr_0.7fr_0.55fr_1.25fr_1.25fr_0.8fr] gap-0 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>Listing</div>
                  <div>Marketplace</div>
                  <div>Score</div>
                  <div>Buying proof</div>
                  <div>Proof blockers</div>
                  <div>Next action</div>
                </div>
                {marketplaceListingMatrix.rows.map((row: any) => (
                  <div
                    key={row.productId || row.name}
                    className="grid grid-cols-[1.2fr_0.7fr_0.55fr_1.25fr_1.25fr_0.8fr] gap-0 border-b px-3 py-3 text-sm last:border-b-0"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {[row.asin, row.sku].filter(Boolean).join(" / ") || "No ASIN/SKU"}
                      </p>
                    </div>
                    <div className="pr-3 text-muted-foreground">{row.marketplace || "not set"}</div>
                    <div className="pr-3">
                      <Badge variant="outline" className={cn("capitalize", statusClass(row.status))}>{row.score}/100</Badge>
                    </div>
                    <div className="pr-3 text-xs text-muted-foreground">
                      <p>URL {row.signals.productUrl ? "yes" : "no"}, price {row.signals.priceBand ? "yes" : "no"}, rating {row.signals.rating ? "yes" : "no"}, reviews {row.signals.reviews ? "yes" : "no"}</p>
                      <p>{row.signals.claims} claims, {row.signals.objections} objections, {row.signals.competitors} competitors, {row.signals.sourceProof} sources</p>
                    </div>
                    <div className="pr-3">
                      {row.blockers.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.blockers.slice(0, 4).map((blocker: string) => (
                            <Badge key={blocker} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              {blocker}
                            </Badge>
                          ))}
                          {row.blockers.length > 4 ? <Badge variant="outline">+{row.blockers.length - 4}</Badge> : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No listing proof blockers</span>
                      )}
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">{row.nextAction}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid="seller-catalog-setup">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UploadCloud className="h-5 w-5 text-primary" />
                Seller Catalog Setup
              </CardTitle>
              <CardDescription>
                Import priority ASIN/SKU products with competitors, claims, objections, and product URLs before running seller readiness.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", statusClass(productCatalog?.count > 0 ? "ready" : "blocked"))}>
              {productCatalog?.count || 0} saved SKU{productCatalog?.count === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]" data-testid="product-readiness-import-blueprint">
            <div className="rounded-md border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Use this when the brand has products to benchmark</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {PRODUCT_READINESS_FIT.map((item) => (
                  <div key={item.title} className="rounded-md border bg-background p-3">
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Minimum import checklist</p>
                  <p className="mt-1 text-xs text-muted-foreground">Without these inputs, Product Readiness is a setup score, not a market verdict.</p>
                </div>
                <Badge variant="outline" className={cn("shrink-0", statusClass(cockpit.totalProducts >= 3 ? "ready" : "blocked"))}>
                  {cockpit.totalProducts >= 3 ? "Benchmarkable" : "Needs catalog"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {SELLER_IMPORT_REQUIREMENTS.map((requirement) => (
                  <div key={requirement} className="flex gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{requirement}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => loadCatalogTemplate("json")} data-testid="button-load-json-catalog-template">
                  Load JSON sample
                </Button>
                <Button variant="outline" size="sm" onClick={loadAmazonSellerPilotTemplate} data-testid="button-load-amazon-seller-sample">
                  Load Amazon seller sample
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadCatalogTemplate("csv")} data-testid="button-load-csv-catalog-template">
                  Load CSV sample
                </Button>
                <Button variant="outline" size="sm" onClick={copyCatalogTemplate} data-testid="button-copy-catalog-template">
                  Copy sample
                </Button>
                <Button variant="outline" size="sm" onClick={copySellerPilotPlan} data-testid="button-copy-seller-pilot-plan-from-setup">
                  Copy pilot plan
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-3" data-testid="product-url-extractor">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-primary" />
                  Extract from product URLs
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste Amazon, Shopify, Flipkart, or product page URLs. AIRank reads Product schema/OpenGraph first and falls back to URL-derived rows.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => extractCatalogUrlsMutation.mutate()}
                disabled={extractCatalogUrlsMutation.isPending || !catalogUrlDraft.trim() || !brandId}
                data-testid="button-extract-product-urls"
              >
                {extractCatalogUrlsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Extract URLs
              </Button>
            </div>
            <Textarea
              value={catalogUrlDraft}
              onChange={(event) => setCatalogUrlDraft(event.target.value)}
              className="min-h-[86px] font-mono text-xs"
              spellCheck={false}
              data-testid="product-url-input"
            />
            <div className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid="storefront-url-discovery">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold">Discover from storefront</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paste a Shopify store, collection, or marketplace listing page to find product URLs in bulk.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => discoverStorefrontMutation.mutate()}
                  disabled={discoverStorefrontMutation.isPending || !storefrontUrlDraft.trim() || !brandId}
                  data-testid="button-discover-storefront-products"
                >
                  {discoverStorefrontMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Discover products
                </Button>
              </div>
              <Textarea
                value={storefrontUrlDraft}
                onChange={(event) => setStorefrontUrlDraft(event.target.value)}
                className="min-h-[52px] font-mono text-xs"
                spellCheck={false}
                data-testid="storefront-url-input"
              />
              {urlDiscoverySummary ? (
                <div className="rounded-md border bg-background p-3 text-xs" data-testid="storefront-discovery-summary">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{urlDiscoverySummary.discoveryMessage}</p>
                    <Badge variant="outline" className={cn("capitalize", statusClass(urlDiscoverySummary.discoveryStatus === "discovered" ? "ready" : urlDiscoverySummary.discoveryStatus === "fallback" ? "partial" : "blocked"))}>
                      {urlDiscoverySummary.discoveryStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {(urlDiscoverySummary.discoveredUrls || []).length} discovered URL{(urlDiscoverySummary.discoveredUrls || []).length === 1 ? "" : "s"}.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid="competitor-url-mapping">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Swords className="h-4 w-4 text-primary" />
                    Map competitor URLs
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste exact competing product URLs after adding your own SKUs. AIRank attaches extracted competitor ASINs/products to each catalog row.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => mapCompetitorsMutation.mutate()}
                  disabled={mapCompetitorsMutation.isPending || !canMapCompetitors || !brandId}
                  data-testid="button-map-competitor-urls"
                >
                  {mapCompetitorsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Map competitors
                </Button>
              </div>
              <Textarea
                value={competitorUrlDraft}
                onChange={(event) => setCompetitorUrlDraft(event.target.value)}
                className="min-h-[68px] font-mono text-xs"
                spellCheck={false}
                data-testid="competitor-url-input"
              />
              {competitorMappingSummary ? (
                <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground" data-testid="competitor-mapping-summary">
                  Attached {competitorMappingSummary.competitorsAdded || 0} competitor product{competitorMappingSummary.competitorsAdded === 1 ? "" : "s"} from {competitorMappingSummary.urlsProcessed || 0} URL{competitorMappingSummary.urlsProcessed === 1 ? "" : "s"} across {competitorMappingSummary.products || 0} SKU{competitorMappingSummary.products === 1 ? "" : "s"}.
                </div>
              ) : null}
            </div>
            {urlExtractionSources.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2" data-testid="product-url-extraction-results">
                {urlExtractionSources.slice(0, 4).map((source) => (
                  <div key={source.url} className="rounded-md border p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{source.url}</p>
                      <Badge variant="outline" className={cn("capitalize", statusClass(source.status === "extracted" ? "ready" : source.status === "fallback" ? "partial" : "blocked"))}>
                        {source.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{source.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border p-4 space-y-3" data-testid="seller-pilot-kit">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Rocket className="h-4 w-4 text-primary" />
                  Seller pilot kit
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Save and enrich the current catalog, create SKU-level prompt coverage, queue first sampling jobs, and save a visibility snapshot.
                </p>
              </div>
              <Button
                onClick={() => sellerPilotKitMutation.mutate()}
                disabled={sellerPilotKitMutation.isPending || !canLaunchSellerPilotKit || !brandId}
                data-testid="button-launch-seller-pilot-kit"
              >
                {sellerPilotKitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                Prepare pilot kit
              </Button>
            </div>
            {sellerPilotKitSummary ? (
              <div className="grid gap-2 md:grid-cols-4" data-testid="seller-pilot-kit-summary">
                {[
                  ["SKUs", sellerPilotKitSummary.catalog?.saved || 0],
                  ["Prompts", sellerPilotKitSummary.prompts?.created || 0],
                  ["Sampling jobs", sellerPilotKitSummary.sampling?.queued || 0],
                  ["Warnings", sellerPilotKitSummary.catalog?.validation?.warnings?.length || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-mono text-lg font-semibold">{value}</p>
                  </div>
                ))}
                {sellerPilotKitSummary.nextActions?.length ? (
                  <div className="md:col-span-4 rounded-md border bg-background p-3 text-xs">
                    <p className="font-medium">Next actions</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                      {sellerPilotKitSummary.nextActions.slice(0, 4).map((action: string) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border p-4 space-y-3" data-testid="seller-quick-sku-add">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  Quick add priority SKU
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add one Amazon/D2C product without editing JSON. Use this during seller onboarding calls, then validate and save.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={addQuickProductToDraft}
                data-testid="button-add-quick-sku"
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Add SKU to draft
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                value={quickProductName}
                onChange={(event) => setQuickProductName(event.target.value)}
                placeholder="Product name"
                data-testid="input-quick-product-name"
              />
              <Input
                value={quickProductAsin}
                onChange={(event) => setQuickProductAsin(event.target.value)}
                placeholder="ASIN"
                data-testid="input-quick-product-asin"
              />
              <Input
                value={quickProductSku}
                onChange={(event) => setQuickProductSku(event.target.value)}
                placeholder="SKU"
                data-testid="input-quick-product-sku"
              />
              <Input
                value={quickProductCategory}
                onChange={(event) => setQuickProductCategory(event.target.value)}
                placeholder="Category"
                data-testid="input-quick-product-category"
              />
            </div>
            <Input
              value={quickProductUrl}
              onChange={(event) => setQuickProductUrl(event.target.value)}
              placeholder="Product URL, optional if ASIN is provided"
              data-testid="input-quick-product-url"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Textarea
                value={quickCompetitors}
                onChange={(event) => setQuickCompetitors(event.target.value)}
                className="min-h-[84px] text-xs"
                placeholder="Competitors, one per line: Name::ASIN or Name::URL"
                data-testid="input-quick-product-competitors"
              />
              <Textarea
                value={quickClaims}
                onChange={(event) => setQuickClaims(event.target.value)}
                className="min-h-[84px] text-xs"
                placeholder="Claims, one per line"
                data-testid="input-quick-product-claims"
              />
              <Textarea
                value={quickObjections}
                onChange={(event) => setQuickObjections(event.target.value)}
                className="min-h-[84px] text-xs"
                placeholder="Buyer objections, one per line"
                data-testid="input-quick-product-objections"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={catalogImportMode}
              onValueChange={(value) => {
                loadCatalogTemplate(value as "json" | "csv");
              }}
            >
              <TabsList data-testid="seller-catalog-mode">
                <TabsTrigger value="json">JSON</TabsTrigger>
                <TabsTrigger value="csv">CSV</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              CSV competitors use <span className="font-mono">Name::ASIN</span>; claims and objections use <span className="font-mono">|</span> separators.
            </p>
          </div>
          <Textarea
            value={catalogDraft}
            onChange={(event) => {
              setCatalogDraft(event.target.value);
              setDraftTouched(true);
              setServerValidation(null);
              setCatalogEnrichmentSummary(null);
              setCompetitorMappingSummary(null);
            }}
            className="min-h-[220px] font-mono text-xs"
            spellCheck={false}
            data-testid="seller-catalog-input"
          />
          <div className="grid gap-2 md:grid-cols-5">
            {[
              ["Products", localCatalogStats.products],
              ["IDs", localCatalogStats.identifiers],
              ["Competitors", localCatalogStats.competitors],
              ["Claims", localCatalogStats.claims],
              ["Objections", localCatalogStats.objections],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-mono text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {(parsedCatalog.error || serverValidation?.errors?.length || serverValidation?.warnings?.length) ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {parsedCatalog.error ? <p>{parsedCatalog.error}</p> : null}
              {(serverValidation?.errors || []).slice(0, 3).map((error: string) => <p key={error}>{error}</p>)}
              {(serverValidation?.warnings || []).slice(0, 3).map((warning: string) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
          {catalogEnrichmentSummary ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="catalog-enrichment-summary">
              Enriched {catalogEnrichmentSummary.products || 0} products with {catalogEnrichmentSummary.claimsAdded || 0} claims, {catalogEnrichmentSummary.objectionsAdded || 0} objections, and {catalogEnrichmentSummary.competitorsAdded || 0} competitor placeholders.
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => enrichCatalogMutation.mutate()}
              disabled={enrichCatalogMutation.isPending || !canEnrichCatalog || !brandId}
              data-testid="button-enrich-seller-catalog"
            >
              {enrichCatalogMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Enrich catalog
            </Button>
            <Button
              variant="outline"
              onClick={() => validateCatalogMutation.mutate()}
              disabled={validateCatalogMutation.isPending || Boolean(parsedCatalog.error) || !brandId}
              data-testid="button-validate-seller-catalog"
            >
              {validateCatalogMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Validate catalog
            </Button>
            <Button
              onClick={() => saveCatalogMutation.mutate()}
              disabled={saveDisabled}
              data-testid="button-save-seller-catalog"
            >
              {saveCatalogMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save seller catalog
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="product-prompt-pack">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquarePlus className="h-5 w-5 text-primary" />
                Product Prompt Pack
              </CardTitle>
              <CardDescription>
                Generate buying, comparison, review, alternatives, and objection prompts from the seller catalog.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", statusClass(canGenerateProductPrompts ? "ready" : "blocked"))}>
              {catalogProductsForPrompts.length} SKU source{catalogProductsForPrompts.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                const prompts = buildProductPromptPack(catalogProductsForPrompts, brand?.name || "this brand");
                setGeneratedProductPrompts(prompts);
              }}
              disabled={!canGenerateProductPrompts}
              data-testid="button-generate-product-prompts"
            >
              Generate prompt pack
            </Button>
            <Button
              onClick={() => promptPackMutation.mutate(generatedProductPrompts)}
              disabled={promptPackMutation.isPending || generatedProductPrompts.length === 0 || !brandId}
              data-testid="button-create-product-prompts"
            >
              {promptPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add to prompt tracking
            </Button>
            <Button
              onClick={() => activateProductPromptPackMutation.mutate()}
              disabled={activateProductPromptPackMutation.isPending || (productCatalog?.count || 0) === 0 || !brandId}
              data-testid="button-activate-product-prompt-pack"
            >
              {activateProductPromptPackMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Create and sample
            </Button>
          </div>

          {productPromptPackSummary ? (
            <div className="grid gap-2 md:grid-cols-4" data-testid="product-prompt-pack-summary">
              {[
                ["Catalog SKUs", productPromptPackSummary.catalog?.products || 0],
                ["Created", productPromptPackSummary.prompts?.created || 0],
                ["Reused", productPromptPackSummary.prompts?.matchedExisting || 0],
                ["Queued", productPromptPackSummary.sampling?.queued || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-mono text-lg font-semibold">{value}</p>
                </div>
              ))}
              {productPromptPackSummary.nextActions?.length ? (
                <div className="rounded-md border bg-background p-3 text-xs md:col-span-4">
                  <p className="font-medium">Activation proof and next steps</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {productPromptPackSummary.nextActions.slice(0, 4).map((action: string) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {generatedProductPrompts.length > 0 ? (
            <div className="rounded-md border" data-testid="product-prompt-preview">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">{generatedProductPrompts.length} prompts ready</p>
                <p className="text-xs text-muted-foreground">These will be deduped and checked against the brand plan limit before saving.</p>
              </div>
              <div className="divide-y">
                {generatedProductPrompts.slice(0, 10).map((prompt) => (
                  <p key={prompt} className="px-4 py-3 text-sm">{prompt}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Save or validate a catalog first, then generate SKU-level prompts for AI visibility tracking.
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="product-sampling-launch">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlayCircle className="h-5 w-5 text-primary" />
                Product Sampling Launch
              </CardTitle>
              <CardDescription>
                Queue LLM sampling for tracked prompts that mention catalog SKUs, then use the results for SKU visibility and competitor pressure.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit", statusClass(productSamplingPrompts.length ? "ready" : "blocked"))}>
              {productSamplingPrompts.length} product prompt{productSamplingPrompts.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Tracked product prompts</p>
              <p className="font-mono text-lg font-semibold">{productSamplingPrompts.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Need sampling</p>
              <p className="font-mono text-lg font-semibold">{promptsNeedingSampling.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Queued per click</p>
              <p className="font-mono text-lg font-semibold">{Math.min(5, samplingTargets.length)}</p>
            </div>
          </div>

          {productSamplingPrompts.length > 0 ? (
            <div className="rounded-md border divide-y" data-testid="product-sampling-targets">
              {samplingTargets.slice(0, 5).map((prompt: any) => (
                <div key={prompt.id} className="flex flex-col gap-2 p-3 text-sm md:flex-row md:items-start md:justify-between">
                  <div>
                    <p>{prompt.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {prompt.runCount || 0} run{prompt.runCount === 1 ? "" : "s"}{prompt.lastChecked ? `, last checked ${new Date(prompt.lastChecked).toLocaleDateString()}` : ", never checked"}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("w-fit", statusClass(prompt.staleForProductSampling ? "partial" : "ready"))}>
                    {prompt.staleForProductSampling ? "needs sampling" : "fresh"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Add the generated product prompts to tracking first, then queue sampling to populate SKU visibility.
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => productSamplingMutation.mutate(samplingTargets)}
              disabled={productSamplingMutation.isPending || samplingTargets.length === 0 || !brandId}
              data-testid="button-sample-product-prompts"
            >
              {productSamplingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sample product prompts
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="product-sampling-automation">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TimerReset className="h-5 w-5 text-primary" />
                Sampling Automation
              </CardTitle>
              <CardDescription>
                Keep product prompts fresh with an automation contract for scheduled SKU sampling.
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn("w-fit capitalize", statusClass(samplingAutomation?.enabled ? "ready" : "partial"))}>
              {samplingAutomation?.enabled ? "enabled" : "manual"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Frequency</p>
              <p className="font-mono text-lg font-semibold capitalize">{samplingAutomation?.frequency || "weekly"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Max prompts/run</p>
              <p className="font-mono text-lg font-semibold">{samplingAutomation?.maxPromptsPerRun || 5}</p>
            </div>
            <div className="rounded-md border p-3 md:col-span-2">
              <p className="text-xs text-muted-foreground">Next run</p>
              <p className="font-mono text-sm font-semibold">
                {samplingAutomation?.nextRunAt ? new Date(samplingAutomation.nextRunAt).toLocaleString() : "Manual only"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Select
              value={samplingAutomation?.frequency || "weekly"}
              onValueChange={(frequency) => samplingAutomationMutation.mutate({
                enabled: samplingAutomation?.enabled ?? false,
                frequency,
                maxPromptsPerRun: samplingAutomation?.maxPromptsPerRun || 5,
              })}
              disabled={samplingAutomationMutation.isPending}
            >
              <SelectTrigger className="w-full md:w-[220px]" data-testid="select-product-sampling-frequency">
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => samplingAutomationMutation.mutate({
                enabled: !samplingAutomation?.enabled,
                frequency: samplingAutomation?.frequency || "weekly",
                maxPromptsPerRun: samplingAutomation?.maxPromptsPerRun || 5,
              })}
              disabled={samplingAutomationMutation.isPending}
              data-testid="button-toggle-product-sampling-automation"
            >
              {samplingAutomationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {samplingAutomation?.enabled ? "Disable automation" : "Enable automation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Swords className="h-5 w-5 text-primary" />
              Threats
            </CardTitle>
            <CardDescription>Top product competitors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(visibility?.competitiveBenchmark?.topThreats || []).slice(0, 3).map((threat: any) => (
              <div key={`${threat.name}-${threat.productName}`} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{threat.name}</p>
                <p className="text-xs text-muted-foreground">{threat.productName}</p>
                <Badge variant="outline" className={cn("mt-2 capitalize", statusClass(threat.threatLevel === "high" ? "blocked" : threat.threatLevel === "medium" ? "partial" : "ready"))}>
                  {threat.threatLevel}
                </Badge>
              </div>
            ))}
            {!(visibility?.competitiveBenchmark?.topThreats || []).length && (
              <p className="text-sm text-muted-foreground">Add competitor products to unlock battlecards.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-5 w-5 text-primary" />
              Drafts
            </CardTitle>
            <CardDescription>Listing assets under review.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.approvedDrafts}/{cockpit.draftItems.length}</div>
            <p className="text-xs text-muted-foreground mt-2">approved drafts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-5 w-5 text-primary" />
              Publishing
            </CardTitle>
            <CardDescription>Queued or published artifacts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.queuedArtifacts}/{cockpit.publishedArtifacts}</div>
            <p className="text-xs text-muted-foreground mt-2">queued / published</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="h-5 w-5 text-primary" />
              Readiness
            </CardTitle>
            <CardDescription>Product AI readiness score.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{cockpit.readinessScore}<span className="text-sm text-muted-foreground">/100</span></div>
            <p className="text-xs text-muted-foreground mt-2">{readiness?.grade || "ungraded"}</p>
          </CardContent>
        </Card>
      </div>

      <Card id="deep-product-readiness-tool" data-testid="deep-product-readiness-tool">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Deep Product Readiness Tool
          </CardTitle>
          <CardDescription>Catalog import, SKU visibility, drafts, publish queue, client report, and action exports.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <AgentReadiness productOnly hideTopBar />
        </CardContent>
      </Card>
    </div>
  );
}
