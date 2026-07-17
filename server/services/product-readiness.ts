import { storage } from '../storage';
import type { Brand } from '@shared/schema';

type CheckStatus = 'pass' | 'warning' | 'missing';

export interface ProductCatalogItem {
  id: string;
  name: string;
  asin?: string | null;
  sku?: string | null;
  marketplace?: string | null;
  category?: string | null;
  productUrl?: string | null;
  priceBand?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  priority?: 'high' | 'medium' | 'low';
  competitors?: Array<{ name: string; asin?: string | null; url?: string | null }>;
  claims?: string[];
  objections?: string[];
  updatedAt?: string;
}

export interface ProductReadinessCheck {
  id: string;
  label: string;
  status: CheckStatus;
  score: number;
  evidence: string;
  fix: string;
}

export interface ProductReadinessResult {
  relevant: boolean;
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  channel: string;
  summary: string;
  metrics: {
    prompts: number;
    productIntentPrompts: number;
    catalogProducts: number;
    detectedAsins: number;
    productsDetected: number;
    competitorProducts: number;
    marketplaceSources: number;
    reviewSignals: number;
  };
  checks: ProductReadinessCheck[];
  playbook: Array<{
    title: string;
    priority: 'high' | 'medium' | 'low';
    owner: 'brand' | 'geo_team';
    steps: string[];
  }>;
}

export interface ProductListingPlaybookItem {
  productId: string;
  name: string;
  asin?: string | null;
  sku?: string | null;
  marketplace?: string | null;
  category?: string | null;
  priority: 'high' | 'medium' | 'low';
  readinessScore: number;
  listingEdits: {
    title: string;
    bullets: string[];
    faq: Array<{ question: string; answer: string }>;
    schemaFields: Record<string, string>;
    claimsToProve: string[];
    objectionsToAddress: string[];
    promptCluster: string[];
  };
  competitorAngles: string[];
  sourceGaps: string[];
  exportMarkdown: string;
}

export interface ProductListingPlaybookResult {
  brandId: string;
  brandName: string;
  setupRequired: boolean;
  summary: string;
  products: ProductListingPlaybookItem[];
  importTemplate: ProductCatalogItem[];
  exportMarkdown: string;
}

export type ProductCatalogImportMode = 'json' | 'csv';

export interface ProductCatalogValidation {
  products: ProductCatalogItem[];
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    products: number;
    identifiers: number;
    competitors: number;
    claims: number;
    objections: number;
  };
}

export interface ProductCatalogUrlExtraction {
  products: ProductCatalogItem[];
  validation: ProductCatalogValidation;
  sources: Array<{
    url: string;
    status: 'extracted' | 'fallback' | 'failed';
    message: string;
    fields: string[];
  }>;
}

export interface ProductCatalogUrlDiscovery extends ProductCatalogUrlExtraction {
  storefrontUrl: string;
  discoveredUrls: string[];
  discoveryStatus: 'discovered' | 'empty' | 'fallback';
  discoveryMessage: string;
}

export interface ProductCatalogEnrichment {
  products: ProductCatalogItem[];
  validation: ProductCatalogValidation;
  changes: Array<{
    productId: string;
    name: string;
    addedClaims: number;
    addedObjections: number;
    addedCompetitors: number;
    notes: string[];
  }>;
  summary: {
    products: number;
    claimsAdded: number;
    objectionsAdded: number;
    competitorsAdded: number;
  };
}

export interface ProductCatalogCompetitorMapping {
  products: ProductCatalogItem[];
  validation: ProductCatalogValidation;
  sources: ProductCatalogUrlExtraction['sources'];
  mappedCompetitors: Array<{
    productId: string;
    productName: string;
    added: number;
    competitors: Array<{ name: string; asin?: string | null; url?: string | null }>;
  }>;
  summary: {
    products: number;
    urlsProcessed: number;
    competitorsAdded: number;
  };
}

export interface ProductCatalogImportHistoryItem {
  id: string;
  status: 'success' | 'failed';
  mode: ProductCatalogImportMode;
  source: 'ui' | 'api';
  createdAt: string;
  message: string;
  stats: ProductCatalogValidation['stats'];
  errors: string[];
  warnings: string[];
}

export interface ProductVisibilityItem {
  productId: string;
  name: string;
  asin?: string | null;
  sku?: string | null;
  priority: 'high' | 'medium' | 'low';
  visibilityScore: number;
  status: 'visible' | 'weak' | 'missing';
  promptMatches: number;
  mentionMatches: number;
  sourceMatches: number;
  competitorProducts: number;
  bestPosition: number | null;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  evidence: string[];
  gaps: string[];
}

export interface ProductVisibilityResult {
  brandId: string;
  brandName: string;
  setupRequired: boolean;
  summary: string;
  metrics: {
    products: number;
    visibleProducts: number;
    weakProducts: number;
    missingProducts: number;
    promptMatches: number;
    mentionMatches: number;
    sourceMatches: number;
    sampledProviders: number;
    notSampledProviders: number;
    staleProviders: number;
    competitorMentions: number;
    benchmarkedProducts: number;
  };
  providerFreshness: Array<{
    provider: string;
    status: 'fresh' | 'stale' | 'failed' | 'not_sampled';
    lastRunAt: string | null;
    lastAnswerAt: string | null;
    completedRuns: number;
    failedRuns: number;
    totalAnswers: number;
  }>;
  samplingReadiness: ProductVisibilitySamplingReadiness;
  products: ProductVisibilityItem[];
  competitiveBenchmark: ProductVisibilityBenchmark;
  externalBenchmarkReadiness: ProductVisibilityExternalBenchmarkReadiness;
}

export interface ProductVisibilitySamplingReadiness {
  status: 'blocked' | 'partial' | 'ready';
  coverageScore: number;
  summary: string;
  minimumFreshProviders: number;
  freshProviders: string[];
  missingProviders: string[];
  staleProviders: string[];
  failedProviders: string[];
  productPromptCoverage: {
    coveredProducts: number;
    totalProducts: number;
    coveragePercent: number;
  };
  evidence: string[];
  nextActions: string[];
}

export interface ProductVisibilityBenchmark {
  setupRequired: boolean;
  summary: string;
  brandShare: number;
  competitorShare: number;
  totalBrandSignals: number;
  totalCompetitorSignals: number;
  topThreats: Array<{
    name: string;
    asin?: string | null;
    productName: string;
    signalCount: number;
    promptMatches: number;
    mentionMatches: number;
    sourceMatches: number;
    threatLevel: 'high' | 'medium' | 'low';
  }>;
  products: Array<{
    productId: string;
    name: string;
    asin?: string | null;
    sku?: string | null;
    brandSignals: number;
    competitorSignals: number;
    benchmarkGap: number;
    pressure: 'high' | 'medium' | 'low';
    leadingCompetitor?: string;
    gaps: string[];
  }>;
}

export interface ProductVisibilityExternalBenchmarkReadiness {
  status: 'blocked' | 'partial' | 'ready';
  score: number;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: CheckStatus;
    score: number;
    evidence: string;
    fix: string;
  }>;
  missingInputs: string[];
  nextActions: string[];
}

export interface ProductVisibilitySnapshot {
  id: string;
  createdAt: string;
  metrics: ProductVisibilityResult['metrics'];
  providerSummary: {
    fresh: number;
    stale: number;
    failed: number;
    notSampled: number;
  };
  products: Array<{
    productId: string;
    name: string;
    asin?: string | null;
    sku?: string | null;
    visibilityScore: number;
    status: ProductVisibilityItem['status'];
    promptMatches: number;
    mentionMatches: number;
    sourceMatches: number;
  }>;
}

export interface ProductVisibilityTrend {
  hasComparison: boolean;
  latestSnapshotId: string | null;
  previousSnapshotId: string | null;
  summary: string;
  scoreDelta: number;
  visibleDelta: number;
  missingDelta: number;
  providerFreshDelta: number;
  providerNotSampledDelta: number;
  productDeltas: Array<{
    productId: string;
    name: string;
    asin?: string | null;
    sku?: string | null;
    currentScore: number | null;
    previousScore: number | null;
    scoreDelta: number;
    currentStatus: ProductVisibilityItem['status'] | 'removed' | null;
    previousStatus: ProductVisibilityItem['status'] | null;
    movement: 'improved' | 'declined' | 'flat' | 'new' | 'removed';
  }>;
}

export interface ProductVisibilityActionItem {
  id: string;
  productId?: string;
  productName?: string;
  priority: 'high' | 'medium' | 'low';
  owner: 'brand' | 'geo_team';
  trigger: 'missing_visibility' | 'declining_visibility' | 'provider_gap' | 'evidence_gap' | 'competitive_pressure';
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  updatedAt?: string;
  note?: string;
  title: string;
  evidence: string;
  expectedImpact: string;
  steps: string[];
}

export interface ProductVisibilityActionPlan {
  brandId: string;
  brandName: string;
  setupRequired: boolean;
  summary: string;
  metrics: {
    totalActions: number;
    highPriority: number;
    productActions: number;
    providerActions: number;
    inProgress: number;
    done: number;
    blocked: number;
  };
  actions: ProductVisibilityActionItem[];
}

export interface ProductVisibilityActionState {
  id: string;
  status: ProductVisibilityActionItem['status'];
  note?: string;
  updatedAt: string;
}

export interface ProductVisibilityActionExport {
  brandId: string;
  brandName: string;
  generatedAt: string;
  filenameBase: string;
  markdown: string;
  csv: string;
}

export interface ProductVisibilityDraftItem {
  actionId: string;
  productId?: string;
  productName?: string;
  title: string;
  draftType: 'prompt_cluster' | 'listing_content' | 'schema' | 'sampling_brief' | 'competitor_mapping';
  status: 'draft' | 'in_review' | 'approved' | 'rejected';
  version: number;
  updatedAt?: string;
  note?: string;
  reviewerId?: string;
  assignee?: string;
  edited: boolean;
  summary: string;
  markdown: string;
  history: ProductVisibilityDraftHistoryItem[];
}

export interface ProductVisibilityDraftPack {
  brandId: string;
  brandName: string;
  generatedAt: string;
  summary: string;
  drafts: ProductVisibilityDraftItem[];
  markdown: string;
}

export interface ProductVisibilityDraftState {
  actionId: string;
  status: ProductVisibilityDraftItem['status'];
  version: number;
  note?: string;
  reviewerId?: string;
  assignee?: string;
  markdown?: string;
  updatedAt: string;
  history?: ProductVisibilityDraftHistoryItem[];
}

export interface ProductVisibilityDraftHistoryItem {
  id: string;
  changedAt: string;
  reviewerId?: string;
  assignee?: string;
  fromStatus?: ProductVisibilityDraftItem['status'];
  toStatus: ProductVisibilityDraftItem['status'];
  fromVersion?: number;
  toVersion: number;
  note?: string;
  markdownChanged: boolean;
  addedLines: string[];
  removedLines: string[];
}

export type ProductVisibilityPublishChannel = 'schema' | 'faq' | 'cms_export' | 'axp';

export interface ProductVisibilityPublishItem {
  id: string;
  actionId: string;
  productId?: string;
  productName?: string;
  title: string;
  draftType: ProductVisibilityDraftItem['draftType'];
  draftVersion: number;
  channel: ProductVisibilityPublishChannel;
  status: 'queued' | 'published';
  queuedAt: string;
  publishedAt?: string;
  note?: string;
  reviewerId?: string;
  assignee?: string;
  queuedBy?: string;
  publishedBy?: string;
  markdownPreview: string;
  artifact?: {
    type: 'schema_template' | 'faq_entry' | 'axp_page' | 'cms_export';
    id: string;
    label: string;
    url?: string;
  };
  measurement?: ProductVisibilityMeasurementFollowUp;
}

export interface ProductVisibilityPublishQueue {
  brandId: string;
  brandName: string;
  count: number;
  queue: ProductVisibilityPublishItem[];
}

export interface ProductVisibilityMeasurementFollowUp {
  id: string;
  status: 'queued' | 'snapshot_only' | 'failed';
  createdAt: string;
  dueAt: string;
  snapshotId?: string;
  promptIds: string[];
  jobIds: string[];
  prompts: string[];
  summary: string;
  error?: string;
}

export interface ProductVisibilityClientReport {
  brandId: string;
  brandName: string;
  generatedAt: string;
  filenameBase: string;
  launchVerdict: 'blocked' | 'needs_review' | 'launch_ready';
  summary: string;
  metrics: {
    products: number;
    visibleProducts: number;
    weakProducts: number;
    missingProducts: number;
    sampledProviders: number;
    notSampledProviders: number;
    staleProviders: number;
    highPriorityActions: number;
    approvedDrafts: number;
    publishedArtifacts: number;
    queuedArtifacts: number;
    competitorShare: number;
    topThreats: number;
    postPublishJobs: number;
    postPublishPrompts: number;
  };
  samplingReadiness: ProductVisibilitySamplingReadiness;
  externalBenchmarkReadiness: ProductVisibilityExternalBenchmarkReadiness;
  pilotReadiness: ProductVisibilityPilotReadiness;
  skuLaunchMatrix: ProductVisibilitySkuLaunchMatrix;
  marketplaceListingMatrix: ProductVisibilityMarketplaceListingMatrix;
  opportunityMap: ProductVisibilityOpportunity[];
  brandIntelligence: ProductVisibilityBrandIntelligence;
  categoryIntelligence: ProductVisibilityCategoryIntelligence[];
  creativeBriefs: ProductVisibilityCreativeBrief[];
  competitorBattlecards: ProductVisibilityCompetitorBattlecard[];
  highlights: string[];
  risks: string[];
  nextActions: string[];
  artifacts: Array<{
    title: string;
    channel: ProductVisibilityPublishChannel;
    status: ProductVisibilityPublishItem['status'];
    label?: string;
    url?: string;
    reviewerId?: string;
    assignee?: string;
  }>;
  markdown: string;
  html: string;
}

export interface ProductVisibilitySkuLaunchMatrix {
  ready: number;
  partial: number;
  blocked: number;
  rows: Array<{
    productId: string;
    name: string;
    asin?: string | null;
    sku?: string | null;
    category: string;
    status: 'ready' | 'partial' | 'blocked';
    score: number;
    evidence: {
      prompts: number;
      mentions: number;
      sources: number;
      competitors: number;
      claims: number;
      objections: number;
      openActions: number;
    };
    blockers: string[];
    nextAction: string;
  }>;
}

export interface ProductVisibilityMarketplaceListingMatrix {
  ready: number;
  partial: number;
  blocked: number;
  averageScore: number;
  rows: Array<{
    productId: string;
    name: string;
    asin?: string | null;
    sku?: string | null;
    marketplace?: string | null;
    score: number;
    status: 'ready' | 'partial' | 'blocked';
    signals: {
      identifier: boolean;
      productUrl: boolean;
      priceBand: boolean;
      rating: boolean;
      reviews: boolean;
      claims: number;
      objections: number;
      competitors: number;
      sourceProof: number;
    };
    blockers: string[];
    nextAction: string;
  }>;
}

export interface ProductVisibilityPilotReadiness {
  status: 'blocked' | 'needs_review' | 'ready';
  score: number;
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    status: CheckStatus;
    score: number;
    evidence: string;
    fix: string;
  }>;
  blockers: string[];
  nextActions: string[];
  launchPlan: Array<{
    phase: 'now' | 'next_7_days' | 'pilot_ready';
    title: string;
    owner: 'geo_team' | 'brand' | 'joint';
    actions: string[];
    exitCriteria: string[];
  }>;
}

export interface ProductVisibilityOpportunity {
  id: string;
  productId: string;
  productName: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'visibility_gap' | 'competitor_pressure' | 'source_gap' | 'prompt_gap' | 'proof_asset';
  score: number;
  opportunity: string;
  evidence: string;
  recommendedAction: string;
  owner: 'geo_team' | 'brand' | 'joint';
  expectedImpact: string;
  proofPrompt: string;
}

export interface ProductVisibilityBrandIntelligence {
  marketPosition: 'blocked' | 'defensive' | 'contested' | 'emerging' | 'ready_to_scale';
  confidenceScore: number;
  summary: string;
  strategicThemes: Array<{
    id: string;
    label: string;
    severity: 'critical' | 'warning' | 'info';
    evidence: string;
    recommendation: string;
  }>;
  boardQuestions: string[];
  executiveActions: string[];
}

export interface ProductVisibilityCategoryIntelligence {
  id: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  products: string[];
  competitors: string[];
  buyerIntents: string[];
  proofGaps: string[];
  recommendedCampaign: string;
  firstAction: string;
}

export interface ProductVisibilityCreativeBrief {
  id: string;
  category: string;
  productName: string;
  format: 'brand_mockup' | 'video_ad';
  status: 'draft_ready' | 'needs_inputs';
  objective: string;
  audience: string;
  message: string;
  proofPoints: string[];
  visualDirection: string;
  scriptOutline: string[];
  requiredInputs: string[];
}

export interface ProductVisibilityCompetitorBattlecard {
  id: string;
  productName: string;
  category: string;
  competitorName: string;
  threatLevel: 'high' | 'medium' | 'low';
  comparisonAngle: string;
  ourProof: string[];
  objectionToAnswer: string;
  recommendedContent: string;
  testPrompt: string;
}

const PRODUCT_INTENTS = ['buying', 'comparison', 'review', 'pricing', 'problem', 'alternative', 'product'];
const MARKETPLACE_RE = /\b(amazon|asin|marketplace|seller|listing|a\+ content|buy box|flipkart|myntra|nykaa|shopify|sku|product)\b/i;
const ASIN_RE = /\bB0[A-Z0-9]{8}\b/g;
const MAJOR_LLM_PROVIDERS = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'deepseek'];
const PRIVATE_HOST_RE = /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)|(^0\.0\.0\.0$)|(^::1$)/i;

function slugId(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return slug || `product-${Date.now()}`;
}

function normalizeStringList(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value === 'string') {
    return value.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 20);
  }
  return [];
}

function uniqueStrings(values: string[], limit = 20): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, limit);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '));
}

function normalizeCatalogItem(item: any, index: number): ProductCatalogItem {
  const name = String(item?.name || item?.title || item?.productName || item?.asin || item?.sku || `Product ${index + 1}`).trim();
  const asin = item?.asin ? String(item.asin).trim().toUpperCase() : null;
  const sku = item?.sku ? String(item.sku).trim() : null;
  const id = String(item?.id || asin || sku || slugId(name));
  const competitorItems = Array.isArray(item?.competitors)
    ? item.competitors
    : typeof item?.competitors === 'string'
      ? parseCompetitors(item.competitors)
      : [];
  const competitors = competitorItems.map((competitor: any) => (
    typeof competitor === 'string'
      ? { name: competitor.trim(), asin: null, url: null }
      : {
        name: String(competitor?.name || competitor?.title || '').trim(),
        asin: competitor?.asin ? String(competitor.asin).trim().toUpperCase() : null,
        url: competitor?.url ? String(competitor.url).trim() : null,
      }
  )).filter((competitor: any) => competitor.name || competitor.asin || competitor.url);

  return {
    id,
    name,
    asin,
    sku,
    marketplace: item?.marketplace ? String(item.marketplace).trim() : asin ? 'amazon' : null,
    category: item?.category ? String(item.category).trim() : null,
    productUrl: item?.productUrl || item?.url ? String(item.productUrl || item.url).trim() : null,
    priceBand: item?.priceBand ? String(item.priceBand).trim() : null,
    rating: typeof item?.rating === 'number' ? item.rating : item?.rating ? Number(item.rating) || null : null,
    reviewCount: typeof item?.reviewCount === 'number' ? item.reviewCount : item?.reviewCount ? Number(item.reviewCount) || null : null,
    priority: ['high', 'medium', 'low'].includes(item?.priority) ? item.priority : 'medium',
    competitors,
    claims: normalizeStringList(item?.claims),
    objections: normalizeStringList(item?.objections),
    updatedAt: new Date().toISOString(),
  };
}

function readCatalog(productServices: any): ProductCatalogItem[] {
  if (!productServices) return [];
  if (Array.isArray(productServices.catalog)) {
    return productServices.catalog.map(normalizeCatalogItem);
  }
  if (Array.isArray(productServices.products)) {
    return productServices.products.map((product: any, index: number) => (
      typeof product === 'string' ? normalizeCatalogItem({ name: product }, index) : normalizeCatalogItem(product, index)
    ));
  }
  return [];
}

function productNeedles(product: ProductCatalogItem): string[] {
  return [
    product.name,
    product.asin,
    product.sku,
    product.category,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
}

function matchesProductText(product: ProductCatalogItem, text: string): boolean {
  const normalized = text.toLowerCase();
  return productNeedles(product).some((needle) => needle.length >= 3 && normalized.includes(needle));
}

function matchesAnyProductText(catalog: ProductCatalogItem[], text: string): boolean {
  return catalog.some((product) => matchesProductText(product, text));
}

function promptNeedsProductSampling(prompt: any, now = new Date()): boolean {
  if (!prompt?.runCount || !prompt?.lastChecked) return true;
  const lastChecked = new Date(prompt.lastChecked).getTime();
  if (!Number.isFinite(lastChecked)) return true;
  return now.getTime() - lastChecked > 14 * 24 * 60 * 60 * 1000;
}

function competitorNeedles(competitor: { name?: string | null; asin?: string | null; url?: string | null }): string[] {
  return [
    competitor.name,
    competitor.asin,
    competitor.url,
  ].filter(Boolean).map((value) => String(value).toLowerCase());
}

function matchesCompetitorText(competitor: { name?: string | null; asin?: string | null; url?: string | null }, text: string): boolean {
  const normalized = text.toLowerCase();
  return competitorNeedles(competitor).some((needle) => needle.length >= 3 && normalized.includes(needle));
}

function normalizeProvider(value: string | null | undefined): string {
  const provider = String(value || '').toLowerCase();
  if (/openai|gpt|chatgpt/.test(provider)) return 'chatgpt';
  if (/anthropic|claude/.test(provider)) return 'claude';
  if (/google|gemini/.test(provider)) return 'gemini';
  if (/perplexity/.test(provider)) return 'perplexity';
  if (/grok|xai/.test(provider)) return 'grok';
  if (/deepseek/.test(provider)) return 'deepseek';
  return provider || 'unknown';
}

function latestIso(dates: Array<Date | string | null | undefined>): string | null {
  const timestamps = dates
    .map((date) => date ? new Date(date).getTime() : 0)
    .filter((time) => Number.isFinite(time) && time > 0);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseDelimitedList(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function parseCompetitors(value: string): ProductCatalogItem['competitors'] {
  return value.split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const [name, asin] = item.split('::');
    return { name: (name || item).trim(), asin: asin?.trim().toUpperCase() || null };
  });
}

export function parseProductCatalogCsv(value: string): any[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] || '';
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
      rating: row.rating ? Number(row.rating) : null,
      reviewCount: row.reviewcount ? Number(row.reviewcount) : null,
      priority: ['high', 'medium', 'low'].includes(row.priority) ? row.priority : 'medium',
      competitors: parseCompetitors(row.competitors || ''),
      claims: parseDelimitedList(row.claims || ''),
      objections: parseDelimitedList(row.objections || ''),
    };
  });
}

export function validateProductCatalog(products: any[]): ProductCatalogValidation {
  const normalized = products.map(normalizeCatalogItem);
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  normalized.forEach((product, index) => {
    const raw = products[index] || {};
    const row = index + 1;
    const rawName = String(raw?.name || raw?.title || raw?.productName || '').trim();
    const name = product.name.trim();
    const asin = product.asin?.trim().toUpperCase() || '';
    const sku = product.sku?.trim() || '';
    const key = asin || sku || name.toLowerCase();

    if (!rawName) errors.push(`Row ${row}: product name is required.`);
    if (!asin && !sku) warnings.push(`Row ${row}: add ASIN or SKU for product-level tracking.`);
    if (asin && !/^B0[A-Z0-9]{8}$/.test(asin)) warnings.push(`Row ${row}: ASIN should look like B0XXXXXXXX.`);
    if (!product.productUrl) warnings.push(`Row ${row}: add product URL for citation checks.`);
    if (!Array.isArray(product.competitors) || product.competitors.length === 0) warnings.push(`Row ${row}: add at least one competing product.`);
    if (!Array.isArray(product.claims) || product.claims.length < 2) warnings.push(`Row ${row}: add 2 or more proof-backed claims.`);
    if (!Array.isArray(product.objections) || product.objections.length === 0) warnings.push(`Row ${row}: add buyer objections.`);
    if (key && seen.has(key)) errors.push(`Row ${row}: duplicate product identifier.`);
    if (key) seen.add(key);
  });

  return {
    products: normalized,
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      products: normalized.length,
      identifiers: normalized.filter((product) => product.asin || product.sku).length,
      competitors: normalized.filter((product) => (product.competitors?.length || 0) > 0).length,
      claims: normalized.filter((product) => (product.claims?.length || 0) >= 2).length,
      objections: normalized.filter((product) => (product.objections?.length || 0) > 0).length,
    },
  };
}

export function parseProductCatalogImport(input: unknown, mode: ProductCatalogImportMode): ProductCatalogValidation {
  if (mode === 'csv') {
    return validateProductCatalog(parseProductCatalogCsv(String(input || '')));
  }

  const products = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? JSON.parse(input)
      : [];
  if (!Array.isArray(products)) {
    throw new Error('Catalog JSON must be an array of products');
  }
  return validateProductCatalog(products);
}

function inferProductClaims(product: ProductCatalogItem): string[] {
  const name = product.name || 'This product';
  const category = product.category || (product.marketplace === 'amazon' ? 'marketplace buyers' : 'target buyers');
  const claims = [
    product.rating ? `${name} has a ${product.rating}/5 rating signal that should be cited with review context.` : '',
    product.reviewCount ? `${name} has ${product.reviewCount} review signals that can support buyer trust content.` : '',
    product.priceBand ? `${name} is positioned in the ${product.priceBand} price band for ${category}.` : '',
    `${name} should have clear buyer-fit, comparison, and objection-handling content for ${category}.`,
    product.asin ? `${name} is trackable at ASIN/SKU level using ${product.asin}.` : '',
  ];
  return uniqueStrings(claims, 5);
}

function inferProductObjections(product: ProductCatalogItem): string[] {
  const name = product.name || 'this product';
  const category = product.category || 'this category';
  return uniqueStrings([
    `Is ${name} worth the price compared with alternatives?`,
    `What are the common complaints, limitations, or fit issues for ${name}?`,
    `Which buyers should avoid ${name} in ${category}?`,
    product.marketplace === 'amazon' ? `Are reviews, warranty, returns, and seller authenticity clear for ${name}?` : '',
  ], 5);
}

function inferCompetitorPlaceholder(product: ProductCatalogItem): ProductCatalogItem['competitors'] {
  const category = product.category || (product.marketplace === 'amazon' ? 'Amazon' : 'category');
  return [
    {
      name: `${category} top alternative`,
      asin: null,
      url: null,
    },
  ];
}

export function enrichProductCatalog(products: any[]): ProductCatalogEnrichment {
  const normalized = products.map(normalizeCatalogItem);
  const changes: ProductCatalogEnrichment['changes'] = [];
  const enriched = normalized.map((product) => {
    const existingClaims = normalizeStringList(product.claims);
    const existingObjections = normalizeStringList(product.objections);
    const existingCompetitors = Array.isArray(product.competitors) ? product.competitors : [];
    const inferredClaims = inferProductClaims(product).filter((claim) => !existingClaims.includes(claim));
    const inferredObjections = inferProductObjections(product).filter((objection) => !existingObjections.includes(objection));
    const inferredCompetitors = existingCompetitors.length ? [] : (inferCompetitorPlaceholder(product) || []);
    const next = normalizeCatalogItem({
      ...product,
      claims: uniqueStrings([...existingClaims, ...inferredClaims], 8),
      objections: uniqueStrings([...existingObjections, ...inferredObjections], 8),
      competitors: [...existingCompetitors, ...inferredCompetitors],
    }, 0);

    const nextClaims = next.claims || [];
    const nextObjections = next.objections || [];
    const nextCompetitors = next.competitors || [];
    const addedClaims = Math.max(0, nextClaims.length - existingClaims.length);
    const addedObjections = Math.max(0, nextObjections.length - existingObjections.length);
    const addedCompetitors = Math.max(0, nextCompetitors.length - existingCompetitors.length);
    changes.push({
      productId: next.id,
      name: next.name,
      addedClaims,
      addedObjections,
      addedCompetitors,
      notes: [
        addedClaims ? `Added ${addedClaims} launch claims.` : '',
        addedObjections ? `Added ${addedObjections} buyer objections.` : '',
        addedCompetitors ? 'Added a competitor placeholder to replace with exact ASIN/product.' : '',
      ].filter(Boolean),
    });
    return next;
  });
  const validation = validateProductCatalog(enriched);
  return {
    products: validation.products,
    validation,
    changes,
    summary: {
      products: enriched.length,
      claimsAdded: changes.reduce((sum, change) => sum + change.addedClaims, 0),
      objectionsAdded: changes.reduce((sum, change) => sum + change.addedObjections, 0),
      competitorsAdded: changes.reduce((sum, change) => sum + change.addedCompetitors, 0),
    },
  };
}

function normalizeProductUrl(value: string): URL {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS product URLs are supported.');
  }
  if (PRIVATE_HOST_RE.test(url.hostname)) {
    throw new Error('Private or local product URLs are not supported.');
  }
  return url;
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

function absolutizeUrl(value: string, base: URL): string | null {
  try {
    return new URL(decodeHtmlEntities(value), base).toString();
  } catch {
    return null;
  }
}

function isLikelyProductUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return /\/(products?|dp|gp\/product|p)\//.test(path) || ASIN_RE.test(url.pathname.toUpperCase());
}

function extractProductLinksFromHtml(html: string, base: URL, limit: number): string[] {
  const links = new Set<string>();
  const anchorRe = /<a\b[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const absolute = absolutizeUrl(match[1], base);
    if (!absolute) continue;
    const url = new URL(absolute);
    if (url.hostname !== base.hostname) continue;
    if (!isLikelyProductUrl(url)) continue;
    url.hash = '';
    links.add(url.toString());
    if (links.size >= limit) break;
  }
  return Array.from(links);
}

async function discoverShopifyProductUrls(base: URL, limit: number): Promise<string[]> {
  const productsUrl = new URL('/products.json?limit=50', base);
  try {
    const response = await fetch(productsUrl.toString(), {
      headers: { 'User-Agent': 'AIRank/1.0 (product-url-discovery)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const json = await response.json();
    const products = Array.isArray(json?.products) ? json.products : [];
    return products
      .map((product: any) => product?.handle ? new URL(`/products/${product.handle}`, base).toString() : null)
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function flattenJsonLdProduct(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = flattenJsonLdProduct(item);
      if (found) return found;
    }
    return null;
  }
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
  if (/\bProduct\b/i.test(type)) return node;
  if (Array.isArray(node['@graph'])) return flattenJsonLdProduct(node['@graph']);
  if (node.mainEntity) return flattenJsonLdProduct(node.mainEntity);
  return null;
}

function extractJsonLdProduct(html: string): any | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(stripHtml(match[1]));
      const product = flattenJsonLdProduct(parsed);
      if (product) return product;
    } catch {
      // Ignore malformed JSON-LD blocks and fall back to other signals.
    }
  }
  return null;
}

function asinFromUrl(url: URL): string | null {
  const text = `${url.pathname} ${url.search}`.toUpperCase();
  const match = text.match(ASIN_RE);
  return match?.[0] || null;
}

function marketplaceFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host.includes('amazon.')) return 'amazon';
  if (host.includes('myshopify.com') || host.includes('shopify')) return 'shopify';
  if (host.includes('flipkart.')) return 'flipkart';
  if (host.includes('myntra.')) return 'myntra';
  if (host.includes('nykaa.')) return 'nykaa';
  return null;
}

function fallbackNameFromUrl(url: URL, asin: string | null): string {
  const parts = url.pathname.split('/').map((part) => decodeURIComponent(part)).filter(Boolean);
  const candidate = parts.find((part) => part.length > 4 && part.toUpperCase() !== asin && !/^(dp|gp|product|products|p)$/i.test(part));
  if (candidate) {
    return candidate.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return asin ? `Amazon product ${asin}` : url.hostname.replace(/^www\./, '');
}

function productFromHtml(url: URL, html: string): { product: any; fields: string[] } {
  const asin = asinFromUrl(url);
  const jsonLd = extractJsonLdProduct(html);
  const fields: string[] = [];
  const offers = Array.isArray(jsonLd?.offers) ? jsonLd?.offers?.[0] : jsonLd?.offers;
  const aggregateRating = jsonLd?.aggregateRating || {};
  const name = jsonLd?.name || extractMetaContent(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description = jsonLd?.description || extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description');

  if (jsonLd) fields.push('jsonld');
  if (name) fields.push('name');
  if (description) fields.push('description');
  if (offers?.price) fields.push('price');
  if (aggregateRating?.ratingValue) fields.push('rating');

  return {
    fields,
    product: {
      name: name ? stripHtml(String(name)).replace(/\s+[-|].*$/, '').slice(0, 180) : fallbackNameFromUrl(url, asin),
      asin,
      sku: jsonLd?.sku || jsonLd?.mpn || asin || null,
      marketplace: marketplaceFromUrl(url),
      category: jsonLd?.category || null,
      productUrl: url.toString(),
      priceBand: offers?.price ? String(offers.price) : null,
      rating: aggregateRating?.ratingValue ? Number(aggregateRating.ratingValue) : null,
      reviewCount: aggregateRating?.reviewCount || aggregateRating?.ratingCount ? Number(aggregateRating.reviewCount || aggregateRating.ratingCount) : null,
      priority: 'high',
      competitors: [],
      claims: description ? [stripHtml(String(description)).slice(0, 220)] : [],
      objections: [],
    },
  };
}

async function extractProductFromUrl(rawUrl: string): Promise<ProductCatalogUrlExtraction['sources'][number] & { product?: any }> {
  const url = normalizeProductUrl(rawUrl);
  const fallbackProduct = {
    name: fallbackNameFromUrl(url, asinFromUrl(url)),
    asin: asinFromUrl(url),
    sku: asinFromUrl(url),
    marketplace: marketplaceFromUrl(url),
    productUrl: url.toString(),
    priority: 'high',
    competitors: [],
    claims: [],
    objections: [],
  };

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'AIRank/1.0 (product-catalog-extractor)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    if (!response.ok || !html) {
      return { url: url.toString(), status: 'fallback', message: `Page returned HTTP ${response.status}; using URL-derived product row.`, fields: ['url'], product: fallbackProduct };
    }
    const extracted = productFromHtml(url, html);
    return {
      url: url.toString(),
      status: extracted.fields.length ? 'extracted' : 'fallback',
      message: extracted.fields.length ? 'Product metadata extracted from page signals.' : 'No product metadata found; using URL-derived product row.',
      fields: extracted.fields.length ? extracted.fields : ['url'],
      product: extracted.product,
    };
  } catch (error: any) {
    return { url: url.toString(), status: 'fallback', message: `Could not fetch page (${error?.message || 'request failed'}); using URL-derived product row.`, fields: ['url'], product: fallbackProduct };
  }
}

export async function extractProductCatalogFromUrls(urls: string[]): Promise<ProductCatalogUrlExtraction> {
  const uniqueUrls = Array.from(new Set(urls.map((url) => String(url || '').trim()).filter(Boolean))).slice(0, 20);
  if (uniqueUrls.length === 0) throw new Error('Add at least one product URL.');

  const sources: ProductCatalogUrlExtraction['sources'] = [];
  const products: any[] = [];
  for (const rawUrl of uniqueUrls) {
    try {
      const result = await extractProductFromUrl(rawUrl);
      sources.push({ url: result.url, status: result.status, message: result.message, fields: result.fields });
      if (result.product) products.push(result.product);
    } catch (error: any) {
      sources.push({ url: String(rawUrl), status: 'failed', message: error?.message || 'URL extraction failed.', fields: [] });
    }
  }

  const validation = validateProductCatalog(products);
  return {
    products: validation.products,
    validation,
    sources,
  };
}

function competitorKey(competitor: { name?: string | null; asin?: string | null; url?: string | null }): string {
  return String(competitor.asin || competitor.url || competitor.name || '').trim().toLowerCase();
}

function productCompetitorFromExtracted(product: ProductCatalogItem): { name: string; asin?: string | null; url?: string | null } {
  return {
    name: product.name,
    asin: product.asin || null,
    url: product.productUrl || null,
  };
}

function competitorFitsProduct(product: ProductCatalogItem, competitor: ProductCatalogItem): boolean {
  if (product.asin && competitor.asin && product.asin === competitor.asin) return false;
  if (product.productUrl && competitor.productUrl && product.productUrl === competitor.productUrl) return false;
  if (!product.category || !competitor.category) return true;
  return product.category.toLowerCase() === competitor.category.toLowerCase()
    || product.category.toLowerCase().split(/\s+/).some((part) => part.length >= 4 && competitor.category?.toLowerCase().includes(part));
}

export async function mapCompetitorUrlsToCatalog(products: any[], competitorUrls: string[]): Promise<ProductCatalogCompetitorMapping> {
  const normalized = products.map(normalizeCatalogItem);
  if (normalized.length === 0) throw new Error('Add at least one catalog product before mapping competitors.');

  const uniqueUrls = Array.from(new Set(competitorUrls.map((url) => String(url || '').trim()).filter(Boolean))).slice(0, 20);
  if (uniqueUrls.length === 0) throw new Error('Add at least one competitor product URL.');

  const sources: ProductCatalogUrlExtraction['sources'] = [];
  const competitorProducts: ProductCatalogItem[] = [];

  for (const rawUrl of uniqueUrls) {
    try {
      const result = await extractProductFromUrl(rawUrl);
      sources.push({ url: result.url, status: result.status, message: result.message, fields: result.fields });
      if (result.product) competitorProducts.push(normalizeCatalogItem(result.product, competitorProducts.length));
    } catch (error: any) {
      sources.push({ url: String(rawUrl), status: 'failed', message: error?.message || 'Competitor URL extraction failed.', fields: [] });
    }
  }

  const mappedCompetitors: ProductCatalogCompetitorMapping['mappedCompetitors'] = [];
  const productsWithCompetitors = normalized.map((product) => {
    const existing = Array.isArray(product.competitors) ? product.competitors : [];
    const existingKeys = new Set(existing.map(competitorKey).filter(Boolean));
    const additions = competitorProducts
      .filter((competitor) => competitorFitsProduct(product, competitor))
      .map(productCompetitorFromExtracted)
      .filter((competitor) => {
        const key = competitorKey(competitor);
        if (!key || existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      })
      .slice(0, Math.max(0, 5 - existing.length));

    if (additions.length) {
      mappedCompetitors.push({
        productId: product.id,
        productName: product.name,
        added: additions.length,
        competitors: additions,
      });
    }

    return normalizeCatalogItem({
      ...product,
      competitors: [...existing, ...additions],
    }, 0);
  });

  const validation = validateProductCatalog(productsWithCompetitors);
  return {
    products: validation.products,
    validation,
    sources,
    mappedCompetitors,
    summary: {
      products: normalized.length,
      urlsProcessed: uniqueUrls.length,
      competitorsAdded: mappedCompetitors.reduce((sum, item) => sum + item.added, 0),
    },
  };
}

export async function discoverProductCatalogFromStorefront(rawUrl: string, limit = 12): Promise<ProductCatalogUrlDiscovery> {
  const storefront = normalizeProductUrl(rawUrl);
  const cappedLimit = Math.max(1, Math.min(20, Math.round(limit || 12)));
  const shopifyUrls = await discoverShopifyProductUrls(storefront, cappedLimit);
  let discoveredUrls = shopifyUrls;
  let discoveryMessage = shopifyUrls.length ? `Found ${shopifyUrls.length} Shopify product URL${shopifyUrls.length === 1 ? '' : 's'}.` : '';

  if (discoveredUrls.length === 0) {
    try {
      const response = await fetch(storefront.toString(), {
        headers: {
          'User-Agent': 'AIRank/1.0 (product-url-discovery)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(12000),
      });
      const html = await response.text();
      if (response.ok && html) {
        discoveredUrls = extractProductLinksFromHtml(html, storefront, cappedLimit);
        discoveryMessage = discoveredUrls.length
          ? `Found ${discoveredUrls.length} product URL${discoveredUrls.length === 1 ? '' : 's'} on storefront page.`
          : 'No product links found on the storefront page.';
      } else {
        discoveryMessage = `Storefront returned HTTP ${response.status}.`;
      }
    } catch (error: any) {
      discoveryMessage = `Could not fetch storefront (${error?.message || 'request failed'}).`;
    }
  }

  const fallbackToInput = discoveredUrls.length === 0 && isLikelyProductUrl(storefront);
  const urlsToExtract = fallbackToInput ? [storefront.toString()] : discoveredUrls;
  const extraction = urlsToExtract.length
    ? await extractProductCatalogFromUrls(urlsToExtract)
    : { products: [], validation: validateProductCatalog([]), sources: [] };

  return {
    storefrontUrl: storefront.toString(),
    discoveredUrls,
    discoveryStatus: discoveredUrls.length ? 'discovered' : fallbackToInput ? 'fallback' : 'empty',
    discoveryMessage: fallbackToInput ? 'No storefront links found; extracted the supplied product URL instead.' : discoveryMessage,
    ...extraction,
  };
}

function readImportHistory(productServices: any): ProductCatalogImportHistoryItem[] {
  if (!productServices || !Array.isArray(productServices.catalogImportHistory)) return [];
  return productServices.catalogImportHistory.filter(Boolean).slice(0, 25);
}

function readProductVisibilityHistory(productServices: any): ProductVisibilitySnapshot[] {
  if (!productServices || !Array.isArray(productServices.productVisibilityHistory)) return [];
  return productServices.productVisibilityHistory.filter(Boolean).slice(0, 25);
}

function readProductVisibilityActionStates(productServices: any): Record<string, ProductVisibilityActionState> {
  const rawStates = productServices?.productVisibilityActionStates;
  if (!rawStates || typeof rawStates !== 'object' || Array.isArray(rawStates)) return {};
  return Object.entries(rawStates).reduce<Record<string, ProductVisibilityActionState>>((acc, [id, value]: [string, any]) => {
    if (!id || !['todo', 'in_progress', 'blocked', 'done'].includes(value?.status)) return acc;
    acc[id] = {
      id,
      status: value.status,
      note: value.note ? String(value.note).slice(0, 500) : undefined,
      updatedAt: value.updatedAt ? String(value.updatedAt) : new Date().toISOString(),
    };
    return acc;
  }, {});
}

function readProductVisibilityDraftStates(productServices: any): Record<string, ProductVisibilityDraftState> {
  const rawStates = productServices?.productVisibilityDraftStates;
  if (!rawStates || typeof rawStates !== 'object' || Array.isArray(rawStates)) return {};
  return Object.entries(rawStates).reduce<Record<string, ProductVisibilityDraftState>>((acc, [actionId, value]: [string, any]) => {
    if (!actionId || !['draft', 'in_review', 'approved', 'rejected'].includes(value?.status)) return acc;
    const history = Array.isArray(value.history)
      ? value.history.filter(Boolean).map((entry: any) => ({
        id: entry.id ? String(entry.id) : `draft-history-${Date.now()}`,
        changedAt: entry.changedAt ? String(entry.changedAt) : new Date().toISOString(),
        reviewerId: entry.reviewerId ? String(entry.reviewerId).slice(0, 120) : undefined,
        assignee: entry.assignee ? String(entry.assignee).slice(0, 120) : undefined,
        fromStatus: ['draft', 'in_review', 'approved', 'rejected'].includes(entry.fromStatus) ? entry.fromStatus : undefined,
        toStatus: ['draft', 'in_review', 'approved', 'rejected'].includes(entry.toStatus) ? entry.toStatus : value.status,
        fromVersion: entry.fromVersion ? Math.max(1, Number(entry.fromVersion) || 1) : undefined,
        toVersion: Math.max(1, Number(entry.toVersion) || Number(value.version) || 1),
        note: entry.note ? String(entry.note).slice(0, 500) : undefined,
        markdownChanged: Boolean(entry.markdownChanged),
        addedLines: Array.isArray(entry.addedLines) ? entry.addedLines.map((line: any) => String(line).slice(0, 500)).slice(0, 12) : [],
        removedLines: Array.isArray(entry.removedLines) ? entry.removedLines.map((line: any) => String(line).slice(0, 500)).slice(0, 12) : [],
      })).slice(0, 25)
      : [];
    acc[actionId] = {
      actionId,
      status: value.status,
      version: Math.max(1, Number(value.version) || 1),
      note: value.note ? String(value.note).slice(0, 500) : undefined,
      reviewerId: value.reviewerId ? String(value.reviewerId).slice(0, 120) : undefined,
      assignee: value.assignee ? String(value.assignee).slice(0, 120) : undefined,
      markdown: value.markdown ? String(value.markdown).slice(0, 20000) : undefined,
      updatedAt: value.updatedAt ? String(value.updatedAt) : new Date().toISOString(),
      history,
    };
    return acc;
  }, {});
}

function buildMarkdownLineDiff(previousMarkdown?: string, nextMarkdown?: string): Pick<ProductVisibilityDraftHistoryItem, 'markdownChanged' | 'addedLines' | 'removedLines'> {
  const previousLines = String(previousMarkdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nextLines = String(nextMarkdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const previousSet = new Set(previousLines);
  const nextSet = new Set(nextLines);
  const compactLines = (lines: string[]) => {
    if (lines.length <= 12) return lines;
    return [...lines.slice(0, 6), ...lines.slice(-6)];
  };
  const addedLines = compactLines(nextLines.filter((line) => !previousSet.has(line)));
  const removedLines = compactLines(previousLines.filter((line) => !nextSet.has(line)));
  return {
    markdownChanged: addedLines.length > 0 || removedLines.length > 0 || previousLines.length !== nextLines.length,
    addedLines,
    removedLines,
  };
}

function readProductVisibilityPublishQueue(productServices: any): ProductVisibilityPublishItem[] {
  if (!productServices || !Array.isArray(productServices.productVisibilityPublishQueue)) return [];
  return productServices.productVisibilityPublishQueue
    .filter((item: any) => item?.id && item?.actionId && ['schema', 'faq', 'cms_export', 'axp'].includes(item?.channel))
    .map((item: any) => ({
      id: String(item.id),
      actionId: String(item.actionId),
      productId: item.productId ? String(item.productId) : undefined,
      productName: item.productName ? String(item.productName) : undefined,
      title: String(item.title || 'Untitled draft'),
      draftType: ['prompt_cluster', 'listing_content', 'schema', 'sampling_brief', 'competitor_mapping'].includes(item.draftType)
        ? item.draftType
        : 'listing_content',
      draftVersion: Math.max(1, Number(item.draftVersion) || 1),
      channel: item.channel,
      status: item.status === 'published' ? 'published' : 'queued',
      queuedAt: item.queuedAt ? String(item.queuedAt) : new Date().toISOString(),
      publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
      note: item.note ? String(item.note).slice(0, 500) : undefined,
      reviewerId: item.reviewerId ? String(item.reviewerId).slice(0, 120) : undefined,
      assignee: item.assignee ? String(item.assignee).slice(0, 120) : undefined,
      queuedBy: item.queuedBy ? String(item.queuedBy).slice(0, 120) : undefined,
      publishedBy: item.publishedBy ? String(item.publishedBy).slice(0, 120) : undefined,
      markdownPreview: item.markdownPreview ? String(item.markdownPreview).slice(0, 2500) : '',
      artifact: item.artifact?.id && item.artifact?.type
        ? {
          type: item.artifact.type,
          id: String(item.artifact.id),
          label: String(item.artifact.label || item.title || 'Published artifact'),
          url: item.artifact.url ? String(item.artifact.url) : undefined,
        }
        : undefined,
      measurement: item.measurement?.id
        ? {
          id: String(item.measurement.id),
          status: ['queued', 'snapshot_only', 'failed'].includes(item.measurement.status) ? item.measurement.status : 'snapshot_only',
          createdAt: item.measurement.createdAt ? String(item.measurement.createdAt) : new Date().toISOString(),
          dueAt: item.measurement.dueAt ? String(item.measurement.dueAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          snapshotId: item.measurement.snapshotId ? String(item.measurement.snapshotId) : undefined,
          promptIds: Array.isArray(item.measurement.promptIds) ? item.measurement.promptIds.map((id: any) => String(id)).slice(0, 10) : [],
          jobIds: Array.isArray(item.measurement.jobIds) ? item.measurement.jobIds.map((id: any) => String(id)).slice(0, 10) : [],
          prompts: Array.isArray(item.measurement.prompts) ? item.measurement.prompts.map((prompt: any) => String(prompt)).slice(0, 10) : [],
          summary: item.measurement.summary ? String(item.measurement.summary).slice(0, 500) : 'Post-publish measurement follow-up captured.',
          error: item.measurement.error ? String(item.measurement.error).slice(0, 500) : undefined,
        }
        : undefined,
    }))
    .slice(0, 50);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToSimpleHtml(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('### ')) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (trimmed.startsWith('- ')) {
        const items = trimmed.split(/\n/).filter((line) => line.startsWith('- '));
        return `<ul>${items.map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function wrapProductVisibilityReportHtml(reportTitle: string, markdown: string): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(reportTitle)}</title>`,
    '<style>',
    'body{font-family:Inter,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a;line-height:1.55}',
    'main{max-width:920px;margin:0 auto;padding:40px 24px}',
    'h1{font-size:30px;line-height:1.2;margin:0 0 14px}',
    'h2{font-size:20px;margin:28px 0 10px;border-top:1px solid #e2e8f0;padding-top:20px}',
    'h3{font-size:16px;margin:18px 0 8px}',
    'p,li{font-size:14px}',
    'ul{padding-left:22px}',
    'a{color:#2563eb}',
    'code{background:#e2e8f0;border-radius:4px;padding:1px 4px}',
    '.meta{color:#64748b;font-size:12px;margin-bottom:24px}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    markdownToSimpleHtml(markdown),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

function extractJsonFence(markdown: string): any | null {
  const match = markdown.match(/```json\s*([\s\S]*?)```/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractPromptBullets(markdown: string): string[] {
  const promptSection = markdown.match(/### Prompt drafts\s*([\s\S]*?)(?:\n### |\n```|$)/i)
    || markdown.match(/### Sampling brief\s*([\s\S]*?)(?:\n### |\n```|$)/i);
  if (!promptSection?.[1]) return [];
  return promptSection[1]
    .split(/\n/)
    .map((line) => line.trim().replace(/^- /, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractSectionBullets(markdown: string, heading: string, limit = 6): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp('### ' + escaped + '\\s*([\\s\\S]*?)(?:\\n### |\\n```|$)', 'i'));
  if (!match?.[1]) return [];
  return match[1]
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildChannelSchemaDraft(draft: ProductVisibilityDraftItem, brand: Brand): Record<string, any> {
  const productName = draft.productName || brand.name;
  const existing = extractJsonFence(draft.markdown) || {};
  const claims = extractSectionBullets(draft.markdown, 'Listing/owned-site copy draft', 5)
    .map((line) => line.replace(/^Title:\s*/i, '').replace(/\.$/, ''));
  const prompts = extractPromptBullets(draft.markdown);
  const description = [
    existing.description,
    claims.length ? claims.join(' ') : draft.summary,
  ].filter(Boolean)[0] || `${productName} from ${brand.name}.`;

  return {
    '@context': 'https://schema.org',
    '@type': existing['@type'] || 'Product',
    name: existing.name || productName,
    brand: existing.brand || { '@type': 'Brand', name: brand.name },
    sku: existing.sku || '',
    asin: existing.asin || '',
    category: existing.category || '',
    url: existing.url || '',
    description,
    additionalProperty: [
      ...claims.slice(0, 4).map((claim) => ({
        '@type': 'PropertyValue',
        name: 'AI visibility proof point',
        value: claim,
      })),
      ...prompts.slice(0, 3).map((prompt) => ({
        '@type': 'PropertyValue',
        name: 'AI buying prompt',
        value: prompt,
      })),
    ],
  };
}

function buildChannelFaqDrafts(draft: ProductVisibilityDraftItem, brand: Brand): Array<{ question: string; answer: string; evidenceUrls: string[] }> {
  const productName = draft.productName || brand.name;
  const bullets = draft.markdown
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).replace(/^Objection to answer:\s*/i, '').replace(/\.$/, ''))
    .slice(0, 8);
  const proof = bullets.length ? bullets.join(' ') : draft.summary;
  const prompt = extractPromptBullets(draft.markdown)[0];
  return [
    {
      question: `What should buyers know about ${productName}?`,
      answer: `${productName} should be positioned with clear proof for AI assistants and shoppers: ${proof}`,
      evidenceUrls: [],
    },
    {
      question: prompt ? `How should ${productName} answer "${prompt}"?` : `When is ${productName} the right choice?`,
      answer: `${productName} should answer this buyer intent with proof-backed claims, direct competitor context, and clear fit criteria from ${brand.name}.`,
      evidenceUrls: [],
    },
    {
      question: `What objection should ${productName} handle first?`,
      answer: bullets.find((line) => /objection|price|concern|unclear|doubt/i.test(line)) || 'Address the highest-friction buyer objection with evidence, reviews, policies, and comparison language.',
      evidenceUrls: [],
    },
  ];
}

function buildChannelContentMarkdown(draft: ProductVisibilityDraftItem, brand: Brand, channel: ProductVisibilityPublishChannel): string {
  const productName = draft.productName || brand.name;
  const prompts = extractPromptBullets(draft.markdown);
  const claims = extractSectionBullets(draft.markdown, 'Listing/owned-site copy draft', 5);
  const competitors = extractSectionBullets(draft.markdown, 'Competitor mapping', 5);
  const title = channel === 'cms_export'
    ? `${productName} CMS Export Brief`
    : `${productName} AI Experience Page`;
  return [
    `# ${title}`,
    '',
    `Brand: ${brand.name}`,
    `Product: ${productName}`,
    `Channel: ${channel === 'cms_export' ? 'CMS export' : 'AXP'}`,
    '',
    '## AI Answer Positioning',
    draft.summary,
    '',
    '## Buyer Prompts To Win',
    ...(prompts.length ? prompts.map((prompt) => `- ${prompt}`) : ['- Add buying, comparison, review, and objection prompts for this product.']),
    '',
    '## Claim And Proof Blocks',
    ...(claims.length ? claims.map((claim) => `- ${claim}`) : ['- Add proof-backed claims from listing, reviews, policies, or owned content.']),
    '',
    '## Competitive Context',
    ...(competitors.length ? competitors.map((competitor) => `- ${competitor}`) : ['- Add direct competing products and explain when this product is the better fit.']),
    '',
    '## Publishing Checklist',
    '- Keep product name, SKU/ASIN, price band, availability, and return/warranty details current.',
    '- Add Product schema and FAQ schema where the CMS supports JSON-LD.',
    '- Re-sample post-publish prompts and compare benchmark share movement.',
    '',
    channel === 'cms_export' ? '## CMS Fields\n- meta_title\n- meta_description\n- faq_block\n- schema_json\n- internal_link_targets' : '## AXP Blocks\n- overview\n- prompt answers\n- objections\n- competitor comparison\n- proof sources',
  ].join('\n');
}

function inferDraftProductId(actionId: string, catalogById: Map<string, ProductCatalogItem>): string | undefined {
  if (catalogById.has(actionId)) return actionId;
  const suffixes = ['-prompts', '-mentions', '-sources', '-competitors', '-gap-1', '-gap-2', '-gap-3'];
  for (const suffix of suffixes) {
    if (!actionId.endsWith(suffix)) continue;
    const productId = actionId.slice(0, -suffix.length);
    if (catalogById.has(productId)) return productId;
  }
  return undefined;
}

function inferDraftType(actionId: string): ProductVisibilityDraftItem['draftType'] {
  if (actionId.endsWith('-prompts')) return 'prompt_cluster';
  if (actionId.endsWith('-sources')) return 'schema';
  if (actionId.endsWith('-competitors')) return 'competitor_mapping';
  if (actionId === 'provider-coverage') return 'sampling_brief';
  return 'listing_content';
}

function buildSavedDraftFromState(
  actionId: string,
  draftState: ProductVisibilityDraftState,
  brand: Brand,
  catalogById: Map<string, ProductCatalogItem>,
): ProductVisibilityDraftItem | null {
  if (!draftState.markdown) return null;
  const productId = inferDraftProductId(actionId, catalogById);
  const product = productId ? catalogById.get(productId) : undefined;
  const title = draftState.markdown.match(/^##\s+(.+)$/m)?.[1]?.trim()
    || (product ? `Product visibility remediation for ${product.name}` : `Product visibility remediation for ${brand.name}`);
  const markdownProductName = draftState.markdown.match(/^Product:\s+(.+)$/m)?.[1]?.trim();
  return {
    actionId,
    productId,
    productName: product?.name || markdownProductName,
    title,
    draftType: inferDraftType(actionId),
    status: draftState.status,
    version: draftState.version,
    updatedAt: draftState.updatedAt,
    note: draftState.note,
    reviewerId: draftState.reviewerId,
    assignee: draftState.assignee,
    edited: true,
    summary: 'Saved remediation draft preserved from review workflow.',
    markdown: draftState.markdown,
    history: draftState.history || [],
  };
}

function buildImportHistoryItem(
  validation: ProductCatalogValidation,
  options: {
    status: 'success' | 'failed';
    mode?: ProductCatalogImportMode;
    source?: 'ui' | 'api';
    message?: string;
  },
): ProductCatalogImportHistoryItem {
  const createdAt = new Date().toISOString();
  return {
    id: `catalog-import-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    status: options.status,
    mode: options.mode || 'json',
    source: options.source || 'api',
    createdAt,
    message: options.message || (options.status === 'success' ? 'Product catalog saved.' : validation.errors[0] || 'Product catalog import failed.'),
    stats: validation.stats,
    errors: validation.errors.slice(0, 20),
    warnings: validation.warnings.slice(0, 20),
  };
}

async function updateProductServices(
  brandId: string,
  updater: (productServices: Record<string, any>) => Record<string, any>,
): Promise<Record<string, any>> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  const existingProductServices = ((context as any)?.productServices && typeof (context as any).productServices === 'object')
    ? (context as any).productServices
    : {};
  const nextProductServices = updater(existingProductServices);

  if (context?.id) {
    await storage.updateBrandContext(context.id, { productServices: nextProductServices } as any);
  } else {
    await storage.createBrandContext({
      brandId,
      productServices: nextProductServices,
      lastEnriched: new Date(),
      dataQualityScore: 0,
      completenessScore: 0,
    } as any);
  }

  return nextProductServices;
}

export interface ProductSamplingAutomationSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'manual';
  maxPromptsPerRun: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  updatedAt: string | null;
  updatedBy?: string | null;
}

function normalizeProductSamplingAutomation(value: any): ProductSamplingAutomationSettings {
  const frequency = ['daily', 'weekly', 'manual'].includes(value?.frequency) ? value.frequency : 'weekly';
  const maxPromptsPerRun = Number(value?.maxPromptsPerRun);
  return {
    enabled: Boolean(value?.enabled),
    frequency,
    maxPromptsPerRun: Number.isFinite(maxPromptsPerRun) ? Math.max(1, Math.min(25, Math.round(maxPromptsPerRun))) : 5,
    nextRunAt: value?.nextRunAt ? String(value.nextRunAt) : null,
    lastRunAt: value?.lastRunAt ? String(value.lastRunAt) : null,
    updatedAt: value?.updatedAt ? String(value.updatedAt) : null,
    updatedBy: value?.updatedBy ? String(value.updatedBy) : null,
  };
}

function calculateNextSamplingRun(frequency: ProductSamplingAutomationSettings['frequency']): string | null {
  if (frequency === 'manual') return null;
  const next = new Date();
  next.setUTCHours(3, 30, 0, 0);
  next.setUTCDate(next.getUTCDate() + (frequency === 'daily' ? 1 : 7));
  return next.toISOString();
}

export async function getProductSamplingAutomation(brandId: string): Promise<ProductSamplingAutomationSettings> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  return normalizeProductSamplingAutomation((context as any)?.productServices?.productSamplingAutomation);
}

export async function updateProductSamplingAutomation(
  brandId: string,
  data: Partial<Pick<ProductSamplingAutomationSettings, 'enabled' | 'frequency' | 'maxPromptsPerRun'>>,
  userId?: string,
): Promise<ProductSamplingAutomationSettings> {
  const existing = await getProductSamplingAutomation(brandId);
  const frequency = data.frequency || existing.frequency;
  const enabled = typeof data.enabled === 'boolean' ? data.enabled : existing.enabled;
  const maxPromptsPerRun = typeof data.maxPromptsPerRun === 'number' ? data.maxPromptsPerRun : existing.maxPromptsPerRun;
  const next: ProductSamplingAutomationSettings = normalizeProductSamplingAutomation({
    ...existing,
    enabled,
    frequency,
    maxPromptsPerRun,
    nextRunAt: enabled ? calculateNextSamplingRun(frequency) : null,
    updatedAt: new Date().toISOString(),
    updatedBy: userId || existing.updatedBy || null,
  });

  await updateProductServices(brandId, (productServices) => ({
    ...productServices,
    productSamplingAutomation: next,
  }));

  return next;
}

export interface ProductSamplingAutomationRunSummary {
  checkedBrands: number;
  dueBrands: number;
  queuedJobs: number;
  skippedBrands: number;
  results: Array<{
    brandId: string;
    status: 'queued' | 'skipped' | 'failed';
    queuedJobs: number;
    reason?: string;
    nextRunAt?: string | null;
  }>;
}

export async function runDueProductSamplingAutomation(now = new Date()): Promise<ProductSamplingAutomationRunSummary> {
  const brands = await storage.getAllBrands();
  const results: ProductSamplingAutomationRunSummary['results'] = [];
  let dueBrands = 0;
  let queuedJobs = 0;
  let skippedBrands = 0;

  for (const brand of brands) {
    if ((brand as any).status !== 'active') continue;

    try {
      const context = await storage.getBrandContext(brand.id).catch(() => undefined);
      const productServices = (context as any)?.productServices;
      const automation = normalizeProductSamplingAutomation(productServices?.productSamplingAutomation);
      if (!automation.enabled || !automation.nextRunAt || automation.frequency === 'manual') continue;

      const nextRunAt = new Date(automation.nextRunAt).getTime();
      if (!Number.isFinite(nextRunAt) || nextRunAt > now.getTime()) continue;
      dueBrands += 1;

      const catalog = readCatalog(productServices);
      if (catalog.length === 0) {
        skippedBrands += 1;
        const next = await updateProductSamplingAutomation(brand.id, {
          enabled: automation.enabled,
          frequency: automation.frequency,
          maxPromptsPerRun: automation.maxPromptsPerRun,
        });
        results.push({ brandId: brand.id, status: 'skipped', queuedJobs: 0, reason: 'No product catalog', nextRunAt: next.nextRunAt });
        continue;
      }

      const prompts = await storage.getPromptsByBrand(brand.id);
      const targets = prompts
        .filter((prompt: any) => matchesAnyProductText(catalog, `${prompt.text || ''} ${prompt.intent || ''} ${prompt.category || ''}`))
        .filter((prompt: any) => promptNeedsProductSampling(prompt, now))
        .slice(0, automation.maxPromptsPerRun);

      if (targets.length === 0) {
        skippedBrands += 1;
        const next = await updateProductSamplingAutomation(brand.id, {
          enabled: automation.enabled,
          frequency: automation.frequency,
          maxPromptsPerRun: automation.maxPromptsPerRun,
        });
        results.push({ brandId: brand.id, status: 'skipped', queuedJobs: 0, reason: 'No stale product prompts', nextRunAt: next.nextRunAt });
        continue;
      }

      const { triggerLLMSampling } = await import('../jobs');
      for (const prompt of targets) {
        await triggerLLMSampling(brand.id, prompt.id, 6);
      }
      queuedJobs += targets.length;

      const existing = normalizeProductSamplingAutomation(productServices?.productSamplingAutomation);
      const nextState: ProductSamplingAutomationSettings = normalizeProductSamplingAutomation({
        ...existing,
        lastRunAt: now.toISOString(),
        nextRunAt: calculateNextSamplingRun(existing.frequency),
        updatedAt: now.toISOString(),
      });
      await updateProductServices(brand.id, (existingProductServices) => ({
        ...existingProductServices,
        productSamplingAutomation: nextState,
      }));

      results.push({ brandId: brand.id, status: 'queued', queuedJobs: targets.length, nextRunAt: nextState.nextRunAt });
    } catch (error: any) {
      skippedBrands += 1;
      results.push({ brandId: brand.id, status: 'failed', queuedJobs: 0, reason: error?.message || 'Automation failed' });
    }
  }

  return {
    checkedBrands: brands.length,
    dueBrands,
    queuedJobs,
    skippedBrands,
    results,
  };
}

export async function getProductCatalog(brandId: string): Promise<ProductCatalogItem[]> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  return readCatalog((context as any)?.productServices);
}

export async function getProductCatalogImportHistory(brandId: string): Promise<ProductCatalogImportHistoryItem[]> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  return readImportHistory((context as any)?.productServices);
}

export async function getProductVisibilityHistory(brandId: string): Promise<ProductVisibilitySnapshot[]> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  return readProductVisibilityHistory((context as any)?.productServices);
}

export async function getProductVisibilityPublishQueue(brand: Brand): Promise<ProductVisibilityPublishQueue> {
  const context = await storage.getBrandContext(brand.id).catch(() => undefined);
  const queue = readProductVisibilityPublishQueue((context as any)?.productServices);
  return {
    brandId: brand.id,
    brandName: brand.name,
    count: queue.length,
    queue,
  };
}

export async function updateProductVisibilityActionState(
  brandId: string,
  actionId: string,
  status: ProductVisibilityActionItem['status'],
  note?: string,
): Promise<ProductVisibilityActionState> {
  const updatedAt = new Date().toISOString();
  const nextState: ProductVisibilityActionState = {
    id: actionId,
    status,
    note: note ? String(note).trim().slice(0, 500) : undefined,
    updatedAt,
  };
  await updateProductServices(brandId, (existingProductServices) => {
    const states = readProductVisibilityActionStates(existingProductServices);
    return {
      ...existingProductServices,
      productVisibilityActionStates: {
        ...states,
        [actionId]: nextState,
      },
    };
  });
  return nextState;
}

export async function updateProductVisibilityDraftState(
  brandId: string,
  actionId: string,
  status: ProductVisibilityDraftItem['status'],
  note?: string,
  markdown?: string,
  options: { reviewerId?: string; assignee?: string } = {},
): Promise<ProductVisibilityDraftState> {
  const updatedAt = new Date().toISOString();
  let nextState: ProductVisibilityDraftState;
  await updateProductServices(brandId, (existingProductServices) => {
    const states = readProductVisibilityDraftStates(existingProductServices);
    const previous = states[actionId];
    const nextMarkdown = typeof markdown === 'string' ? markdown.slice(0, 20000) : previous?.markdown;
    const nextVersion = previous ? previous.version + 1 : 1;
    const diff = buildMarkdownLineDiff(previous?.markdown, nextMarkdown);
    const reviewerId = options.reviewerId ? String(options.reviewerId).slice(0, 120) : previous?.reviewerId;
    const assignee = options.assignee ? String(options.assignee).trim().slice(0, 120) : previous?.assignee;
    const nextNote = note ? String(note).trim().slice(0, 500) : previous?.note;
    const historyEntry: ProductVisibilityDraftHistoryItem = {
      id: `draft-history-${updatedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
      changedAt: updatedAt,
      reviewerId,
      assignee,
      fromStatus: previous?.status,
      toStatus: status,
      fromVersion: previous?.version,
      toVersion: nextVersion,
      note: nextNote,
      ...diff,
    };
    nextState = {
      actionId,
      status,
      version: nextVersion,
      note: nextNote,
      reviewerId,
      assignee,
      markdown: nextMarkdown,
      updatedAt,
      history: [historyEntry, ...(previous?.history || [])].slice(0, 25),
    };
    return {
      ...existingProductServices,
      productVisibilityDraftStates: {
        ...states,
        [actionId]: nextState,
      },
    };
  });
  return nextState!;
}

export async function queueProductVisibilityDraftPublish(
  brand: Brand,
  actionId: string,
  channel: ProductVisibilityPublishChannel,
  note?: string,
  queuedBy?: string,
): Promise<ProductVisibilityPublishQueue & { item: ProductVisibilityPublishItem }> {
  const draftPack = await buildProductVisibilityDraftPack(brand);
  const draft = draftPack.drafts.find((item) => item.actionId === actionId);
  if (!draft) {
    throw new Error('Draft not found for this action.');
  }
  if (draft.status !== 'approved') {
    throw new Error('Only approved drafts can be queued for publishing.');
  }

  const queuedAt = new Date().toISOString();
  const queuedItem: ProductVisibilityPublishItem = {
    id: `publish-${actionId}-${channel}`,
    actionId,
    productId: draft.productId,
    productName: draft.productName,
    title: draft.title,
    draftType: draft.draftType,
    draftVersion: draft.version,
    channel,
    status: 'queued',
    queuedAt,
    note: note ? String(note).trim().slice(0, 500) : draft.note,
    reviewerId: draft.reviewerId,
    assignee: draft.assignee,
    queuedBy: queuedBy ? String(queuedBy).slice(0, 120) : undefined,
    markdownPreview: draft.markdown.slice(0, 2500),
  };

  const updatedProductServices = await updateProductServices(brand.id, (existingProductServices) => {
    const queue = readProductVisibilityPublishQueue(existingProductServices)
      .filter((item) => !(item.actionId === actionId && item.channel === channel));
    return {
      ...existingProductServices,
      productVisibilityPublishQueue: [queuedItem, ...queue].slice(0, 50),
    };
  });

  const queue = readProductVisibilityPublishQueue(updatedProductServices);
  return {
    brandId: brand.id,
    brandName: brand.name,
    count: queue.length,
    queue,
    item: queuedItem,
  };
}

async function createPostPublishMeasurementFollowUp(
  brand: Brand,
  draft: ProductVisibilityDraftItem,
  artifact?: ProductVisibilityPublishItem['artifact'],
): Promise<ProductVisibilityMeasurementFollowUp> {
  const createdAt = new Date().toISOString();
  const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const promptCandidates = extractPromptBullets(draft.markdown);
  const prompts = (promptCandidates.length ? promptCandidates : [
    `${draft.productName || brand.name} product recommendation after ${draft.draftType.replace('_', ' ')} update`,
  ]).slice(0, 3);
  const followUp: ProductVisibilityMeasurementFollowUp = {
    id: `measurement-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'snapshot_only',
    createdAt,
    dueAt,
    promptIds: [],
    jobIds: [],
    prompts,
    summary: 'Post-publish snapshot captured. Sampling prompts are ready for impact verification.',
  };

  try {
    const snapshot = await saveProductVisibilitySnapshot(brand);
    followUp.snapshotId = snapshot.id;
  } catch (error: any) {
    followUp.status = 'failed';
    followUp.error = `Snapshot failed: ${error.message}`;
    followUp.summary = 'Post-publish measurement follow-up could not save a snapshot.';
    return followUp;
  }

  try {
    const { getJobQueue } = await import('../jobs/queue');
    const queue = getJobQueue();
    for (const promptText of prompts) {
      const prompt = await storage.createPrompt({
        brandId: brand.id,
        text: promptText,
        category: 'product_visibility_post_publish',
        intent: /vs|compare|alternative/i.test(promptText) ? 'comparison' : 'buying',
        priorityScore: 8,
        source: 'product_visibility_publish',
      } as any);
      followUp.promptIds.push(prompt.id);
      const jobId = await queue.addJob('llm_sampling', {
        brandId: brand.id,
        promptId: prompt.id,
        source: 'product_visibility_publish',
        artifactId: artifact?.id,
        artifactType: artifact?.type,
        measurementId: followUp.id,
      } as any, 7, 2);
      followUp.jobIds.push(jobId);
    }
    followUp.status = followUp.jobIds.length > 0 ? 'queued' : 'snapshot_only';
    followUp.summary = followUp.jobIds.length > 0
      ? `${followUp.jobIds.length} post-publish sampling job${followUp.jobIds.length === 1 ? '' : 's'} queued for impact verification.`
      : 'Post-publish snapshot captured; no sampling prompts were created.';
  } catch (error: any) {
    followUp.status = followUp.promptIds.length > 0 ? 'queued' : 'snapshot_only';
    followUp.error = `Sampling queue failed: ${error.message}`;
    followUp.summary = followUp.promptIds.length > 0
      ? `${followUp.promptIds.length} post-publish prompt${followUp.promptIds.length === 1 ? '' : 's'} created; sampling queue needs retry.`
      : 'Post-publish snapshot captured; sampling queue needs retry.';
  }

  return followUp;
}

export async function publishProductVisibilityQueueItem(
  brand: Brand,
  itemId: string,
  userId?: string,
): Promise<ProductVisibilityPublishQueue & { item: ProductVisibilityPublishItem }> {
  const [context, draftPack] = await Promise.all([
    storage.getBrandContext(brand.id).catch(() => undefined),
    buildProductVisibilityDraftPack(brand),
  ]);
  const existingQueue = readProductVisibilityPublishQueue((context as any)?.productServices);
  const queuedItem = existingQueue.find((item) => item.id === itemId);
  if (!queuedItem) {
    throw new Error('Publish queue item not found.');
  }
  if (queuedItem.status === 'published' && queuedItem.artifact) {
    return {
      brandId: brand.id,
      brandName: brand.name,
      count: existingQueue.length,
      queue: existingQueue,
      item: queuedItem,
    };
  }

  const draft = draftPack.drafts.find((item) => item.actionId === queuedItem.actionId);
  if (!draft) {
    throw new Error('Approved draft for this queue item no longer exists.');
  }
  if (draft.status !== 'approved') {
    throw new Error('Only approved drafts can be published.');
  }

  const publishedAt = new Date().toISOString();
  let artifact: ProductVisibilityPublishItem['artifact'];
  const productName = draft.productName || brand.name;

  if (queuedItem.channel === 'schema') {
    const schemaJson = buildChannelSchemaDraft(draft, brand);
    const template = await storage.createSchemaTemplate({
      brandId: brand.id,
      name: `${productName} AI Visibility Product Schema`,
      schemaType: String(schemaJson['@type'] || 'Product'),
      template: schemaJson,
      isGlobal: false,
      isActive: true,
      createdBy: userId,
    } as any);
    artifact = {
      type: 'schema_template',
      id: template.id,
      label: template.name,
      url: `/app/content-axp?tab=schema&artifact=${template.id}`,
    };
  } else if (queuedItem.channel === 'faq') {
    const faqDrafts = buildChannelFaqDrafts(draft, brand);
    const createdFaqs = [];
    for (const faqDraft of faqDrafts) {
      const faq = await storage.createFaqEntry({
        brandId: brand.id,
        question: faqDraft.question,
        answer: faqDraft.answer,
        category: 'product_visibility',
        evidenceUrls: faqDraft.evidenceUrls,
        publishMode: 'axp',
        displayOrder: createdFaqs.length,
        createdBy: userId,
      } as any);
      createdFaqs.push(faq);
    }
    const primaryFaq = createdFaqs[0];
    if (!primaryFaq) {
      throw new Error('FAQ publish failed: no FAQ entries were created.');
    }
    artifact = {
      type: 'faq_entry',
      id: primaryFaq.id,
      label: `${productName} FAQ pack (${createdFaqs.length})`,
      url: `/app/content-axp?tab=faq&artifact=${primaryFaq.id}`,
    };
  } else {
    const channelMarkdown = buildChannelContentMarkdown(draft, brand, queuedItem.channel);
    const channelHtml = markdownToSimpleHtml(channelMarkdown);
    const channelSchema = buildChannelSchemaDraft(draft, brand);
    const slug = slugId(`${productName}-${queuedItem.channel === 'cms_export' ? 'cms-export' : 'ai-experience'}`);
    const existingPage = await storage.getAxpPageBySlug(brand.id, slug).catch(() => undefined);
    const page = existingPage || await storage.createAxpPage({
      brandId: brand.id,
      title: queuedItem.channel === 'cms_export' ? `${productName} CMS Export Brief` : `${productName} AI Experience Page`,
      slug,
      description: draft.summary,
      status: queuedItem.channel === 'cms_export' ? 'draft' : 'published',
      targetPrompts: extractPromptBullets(draft.markdown),
      targetKeywords: [productName, brand.name, draft.draftType.replace('_', ' '), queuedItem.channel],
      createdBy: userId,
    } as any);
    const versions = await storage.getAxpVersionsByPage(page.id).catch(() => []);
    const nextVersionNumber = Math.max(0, ...versions.map((version: any) => Number(version.versionNumber) || 0)) + 1;
    const version = await storage.createAxpVersion({
      pageId: page.id,
      versionNumber: nextVersionNumber,
      content: channelMarkdown,
      contentHtml: channelHtml,
      schemaJson: channelSchema,
      changeDescription: queuedItem.channel === 'cms_export'
        ? 'Generated CMS export pack from product visibility queue.'
        : 'Published channel-specific AXP content from product visibility queue.',
      createdBy: userId,
    } as any);
    await storage.updateAxpPage(page.id, {
      currentVersionId: version.id,
      ...(queuedItem.channel === 'axp' ? { publishedVersionId: version.id, status: 'published' } : {}),
    } as any);
    artifact = {
      type: queuedItem.channel === 'cms_export' ? 'cms_export' : 'axp_page',
      id: page.id,
      label: page.title,
      url: `/app/content-axp?tab=axp&artifact=${page.id}`,
    };
  }

  const measurement = await createPostPublishMeasurementFollowUp(brand, draft, artifact);

  const publishedItem: ProductVisibilityPublishItem = {
    ...queuedItem,
    status: 'published',
    publishedAt,
    publishedBy: userId ? String(userId).slice(0, 120) : queuedItem.publishedBy,
    artifact,
    measurement,
    markdownPreview: draft.markdown.slice(0, 2500),
  };
  const updatedProductServices = await updateProductServices(brand.id, (existingProductServices) => {
    const queue = readProductVisibilityPublishQueue(existingProductServices)
      .map((item) => item.id === itemId ? publishedItem : item);
    return {
      ...existingProductServices,
      productVisibilityPublishQueue: queue,
    };
  });
  const queue = readProductVisibilityPublishQueue(updatedProductServices);
  return {
    brandId: brand.id,
    brandName: brand.name,
    count: queue.length,
    queue,
    item: publishedItem,
  };
}

export function buildProductVisibilityTrend(history: ProductVisibilitySnapshot[]): ProductVisibilityTrend {
  const [latest, previous] = history;
  if (!latest || !previous) {
    return {
      hasComparison: false,
      latestSnapshotId: latest?.id || null,
      previousSnapshotId: null,
      summary: latest ? 'Save one more snapshot to compare SKU visibility movement.' : 'Save snapshots to start trend tracking.',
      scoreDelta: 0,
      visibleDelta: 0,
      missingDelta: 0,
      providerFreshDelta: 0,
      providerNotSampledDelta: 0,
      productDeltas: [],
    };
  }

  const previousProducts = new Map(previous.products.map((product) => [product.productId, product]));
  const latestProducts = new Map(latest.products.map((product) => [product.productId, product]));
  const deltas: ProductVisibilityTrend['productDeltas'] = latest.products.map((product) => {
    const before = previousProducts.get(product.productId);
    const scoreDelta = before ? product.visibilityScore - before.visibilityScore : product.visibilityScore;
    const movement: ProductVisibilityTrend['productDeltas'][number]['movement'] = before
      ? (scoreDelta > 0 ? 'improved' : scoreDelta < 0 ? 'declined' : 'flat')
      : 'new';
    return {
      productId: product.productId,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      currentScore: product.visibilityScore,
      previousScore: before?.visibilityScore ?? null,
      scoreDelta,
      currentStatus: product.status,
      previousStatus: before?.status ?? null,
      movement,
    };
  });

  previous.products.forEach((product) => {
    if (!latestProducts.has(product.productId)) {
      deltas.push({
        productId: product.productId,
        name: product.name,
        asin: product.asin,
        sku: product.sku,
        currentScore: null,
        previousScore: product.visibilityScore,
        scoreDelta: -product.visibilityScore,
        currentStatus: 'removed',
        previousStatus: product.status,
        movement: 'removed',
      });
    }
  });

  const currentAverage = latest.products.length
    ? Math.round(latest.products.reduce((sum, product) => sum + product.visibilityScore, 0) / latest.products.length)
    : 0;
  const previousAverage = previous.products.length
    ? Math.round(previous.products.reduce((sum, product) => sum + product.visibilityScore, 0) / previous.products.length)
    : 0;
  const scoreDelta = currentAverage - previousAverage;
  const improved = deltas.filter((product) => product.movement === 'improved' || product.movement === 'new').length;
  const declined = deltas.filter((product) => product.movement === 'declined' || product.movement === 'removed').length;

  return {
    hasComparison: true,
    latestSnapshotId: latest.id,
    previousSnapshotId: previous.id,
    summary: scoreDelta === 0
      ? `${improved} SKU${improved === 1 ? '' : 's'} improved, ${declined} declined; average score is flat.`
      : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} average score movement; ${improved} improved, ${declined} declined.`,
    scoreDelta,
    visibleDelta: (latest.metrics.visibleProducts || 0) - (previous.metrics.visibleProducts || 0),
    missingDelta: (latest.metrics.missingProducts || 0) - (previous.metrics.missingProducts || 0),
    providerFreshDelta: (latest.providerSummary.fresh || 0) - (previous.providerSummary.fresh || 0),
    providerNotSampledDelta: (latest.providerSummary.notSampled || 0) - (previous.providerSummary.notSampled || 0),
    productDeltas: deltas.sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta)).slice(0, 10),
  };
}

export async function recordProductCatalogImportAttempt(
  brandId: string,
  validation: ProductCatalogValidation,
  options: {
    status: 'success' | 'failed';
    mode?: ProductCatalogImportMode;
    source?: 'ui' | 'api';
    message?: string;
  },
): Promise<ProductCatalogImportHistoryItem> {
  const item = buildImportHistoryItem(validation, options);
  await updateProductServices(brandId, (existingProductServices) => ({
    ...existingProductServices,
    catalogImportHistory: [item, ...readImportHistory(existingProductServices)].slice(0, 10),
  }));
  return item;
}

export async function saveProductCatalog(
  brandId: string,
  products: any[],
  options: { mode?: ProductCatalogImportMode; source?: 'ui' | 'api' } = {},
): Promise<ProductCatalogItem[]> {
  const context = await storage.getBrandContext(brandId).catch(() => undefined);
  const existingProductServices = ((context as any)?.productServices && typeof (context as any).productServices === 'object')
    ? (context as any).productServices
    : {};
  const validation = validateProductCatalog(products);
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Product catalog import failed validation.');
  }
  const catalog = validation.products;
  const historyItem = catalog.length > 0
    ? buildImportHistoryItem(validation, {
      status: 'success',
      mode: options.mode || 'json',
      source: options.source || 'api',
      message: `${catalog.length} product${catalog.length === 1 ? '' : 's'} saved.`,
    })
    : null;
  const { catalog: _existingCatalog, catalogUpdatedAt: _existingCatalogUpdatedAt, ...withoutCatalog } = existingProductServices;
  const nextProductServices = catalog.length > 0
    ? {
      ...existingProductServices,
      catalog,
      catalogUpdatedAt: new Date().toISOString(),
      catalogImportHistory: historyItem
        ? [historyItem, ...readImportHistory(existingProductServices)].slice(0, 10)
        : readImportHistory(existingProductServices),
    }
    : withoutCatalog;

  if (!context?.id && catalog.length === 0) {
    return [];
  }

  if (context?.id) {
    await storage.updateBrandContext(context.id, { productServices: nextProductServices } as any);
  } else {
    await storage.createBrandContext({
      brandId,
      productServices: nextProductServices,
      lastEnriched: new Date(),
      dataQualityScore: catalog.length > 0 ? 35 : 0,
      completenessScore: catalog.length > 0 ? 25 : 0,
    } as any);
  }

  return catalog;
}

export interface ProductSellerPilotKitResult {
  brandId: string;
  brandName: string;
  catalog: {
    saved: number;
    enriched: boolean;
    validation: ProductCatalogValidation;
  };
  prompts: {
    requested: number;
    created: number;
    skippedDuplicates: number;
    skippedPlanLimit: number;
    createdPromptIds: string[];
    examples: string[];
  };
  sampling: {
    queued: number;
    jobIds: string[];
  };
  snapshot?: ProductVisibilitySnapshot;
  nextActions: string[];
  message: string;
}

export interface ProductPromptPackActivationResult {
  brandId: string;
  brandName: string;
  catalog: {
    products: number;
    highPriorityProducts: number;
  };
  prompts: {
    requested: number;
    created: number;
    matchedExisting: number;
    skippedPlanLimit: number;
    createdPromptIds: string[];
    existingPromptIds: string[];
    examples: string[];
  };
  sampling: {
    queued: number;
    jobIds: string[];
    sampledPromptIds: string[];
  };
  snapshot?: ProductVisibilitySnapshot;
  nextActions: string[];
  message: string;
}

export async function launchProductSellerPilotKit(
  brand: Brand,
  options: {
    products?: any[];
    enrich?: boolean;
    createPrompts?: boolean;
    queueSampling?: boolean;
    maxPrompts?: number;
  } = {},
): Promise<ProductSellerPilotKitResult> {
  const shouldEnrich = options.enrich !== false;
  const shouldCreatePrompts = options.createPrompts !== false;
  const shouldQueueSampling = options.queueSampling !== false;
  const maxPrompts = Math.max(1, Math.min(40, Number(options.maxPrompts || 25)));
  const existingCatalog = await getProductCatalog(brand.id);
  const rawProducts = Array.isArray(options.products) && options.products.length ? options.products : existingCatalog;
  if (rawProducts.length === 0) {
    throw new Error('Add at least one product before launching a seller pilot kit.');
  }

  const enrichment = shouldEnrich ? enrichProductCatalog(rawProducts) : null;
  const products = enrichment?.products || validateProductCatalog(rawProducts).products;
  const validation = validateProductCatalog(products);
  if (!validation.valid) {
    await recordProductCatalogImportAttempt(brand.id, validation, {
      status: 'failed',
      mode: 'json',
      source: 'api',
      message: validation.errors[0],
    });
    throw new Error(validation.errors[0] || 'Product catalog import failed validation.');
  }

  const savedCatalog = await saveProductCatalog(brand.id, products, { mode: 'json', source: 'api' });
  const promptCandidates = shouldCreatePrompts
    ? uniqueStrings(savedCatalog.flatMap((product) => buildPromptCluster(product, brand)), maxPrompts)
    : [];
  const existingPrompts = await storage.getPromptsByBrand(brand.id);
  const existingSet = new Set(existingPrompts.map((prompt: any) => String(prompt.text || '').trim().toLowerCase()).filter(Boolean));
  const planId = String((brand as any).tier || 'free');
  const plan = await storage.getPlanCapability(planId).catch(() => undefined);
  const fallbackPromptLimits: Record<string, number> = { free: 6, starter: 50, growth: 200, enterprise: -1 };
  const planMaxPrompts = typeof plan?.maxPrompts === 'number'
    ? plan.maxPrompts
    : (fallbackPromptLimits[planId] ?? fallbackPromptLimits.free);
  const availableSlots = planMaxPrompts < 0 ? Number.POSITIVE_INFINITY : Math.max(0, planMaxPrompts - existingPrompts.length);

  const createdPromptIds: string[] = [];
  const createdPromptTexts: string[] = [];
  let skippedDuplicates = 0;
  let skippedPlanLimit = 0;

  for (const promptText of promptCandidates) {
    const key = promptText.toLowerCase();
    if (existingSet.has(key)) {
      skippedDuplicates++;
      continue;
    }
    if (createdPromptIds.length >= availableSlots) {
      skippedPlanLimit++;
      continue;
    }
    existingSet.add(key);
    const created = await storage.createPrompt({
      brandId: brand.id,
      text: promptText,
      category: 'product_visibility',
      intent: /vs|alternative|compare/i.test(promptText) ? 'comparison' : 'buying',
      priorityScore: 8,
      source: 'product_seller_pilot_kit',
      isActive: true,
    } as any);
    createdPromptIds.push(created.id);
    createdPromptTexts.push(created.text);
  }

  const samplingJobIds: string[] = [];
  if (shouldQueueSampling && createdPromptIds.length > 0) {
    const { getJobQueue } = await import('../jobs/queue');
    const queue = getJobQueue();
    for (const promptId of createdPromptIds.slice(0, 10)) {
      const jobId = await queue.addJob('llm_sampling', {
        brandId: brand.id,
        promptId,
        source: 'product_seller_pilot_kit',
      } as any, 7, 2);
      samplingJobIds.push(jobId);
    }
  }

  const snapshot = await saveProductVisibilitySnapshot(brand).catch(() => undefined);
  const nextActions = [
    validation.warnings.length ? `Fix catalog warnings: ${validation.warnings.slice(0, 2).join(' ')}` : '',
    skippedPlanLimit > 0 ? `Upgrade or remove stale prompts to add ${skippedPlanLimit} product prompt${skippedPlanLimit === 1 ? '' : 's'} blocked by the ${planId} plan limit.` : '',
    savedCatalog.some((product) => (product.competitors?.length || 0) === 0) ? 'Map exact competitor ASINs/products for every priority SKU.' : '',
    samplingJobIds.length === 0 && createdPromptIds.length > 0 ? 'Run product prompt sampling after prompts are created.' : '',
    'Review Product Visibility actions and approve the first schema/FAQ/CMS draft for publishing.',
  ].filter(Boolean);

  return {
    brandId: brand.id,
    brandName: brand.name,
    catalog: {
      saved: savedCatalog.length,
      enriched: shouldEnrich,
      validation,
    },
    prompts: {
      requested: promptCandidates.length,
      created: createdPromptIds.length,
      skippedDuplicates,
      skippedPlanLimit,
      createdPromptIds,
      examples: createdPromptTexts.slice(0, 6),
    },
    sampling: {
      queued: samplingJobIds.length,
      jobIds: samplingJobIds,
    },
    snapshot,
    nextActions,
    message: `Seller pilot kit prepared ${savedCatalog.length} SKU${savedCatalog.length === 1 ? '' : 's'}, created ${createdPromptIds.length} product prompt${createdPromptIds.length === 1 ? '' : 's'}, and queued ${samplingJobIds.length} sampling job${samplingJobIds.length === 1 ? '' : 's'}.`,
  };
}

export async function activateProductPromptPack(
  brand: Brand,
  options: {
    maxPrompts?: number;
    maxSamplingPrompts?: number;
  } = {},
): Promise<ProductPromptPackActivationResult> {
  const catalog = await getProductCatalog(brand.id);
  if (catalog.length === 0) {
    throw new Error('Save at least one product in the seller catalog before activating product prompts.');
  }

  const maxPrompts = Math.max(1, Math.min(40, Number(options.maxPrompts || 25)));
  const maxSamplingPrompts = Math.max(1, Math.min(15, Number(options.maxSamplingPrompts || 10)));
  const promptCandidates = uniqueStrings(catalog.flatMap((product) => buildPromptCluster(product, brand)), maxPrompts);
  const existingPrompts = await storage.getPromptsByBrand(brand.id);
  const existingByText = new Map(existingPrompts
    .map((prompt: any) => [String(prompt.text || '').trim().toLowerCase(), prompt] as const)
    .filter(([text]) => Boolean(text)));

  const planId = String((brand as any).tier || 'free');
  const plan = await storage.getPlanCapability(planId).catch(() => undefined);
  const fallbackPromptLimits: Record<string, number> = { free: 6, starter: 50, growth: 200, enterprise: -1 };
  const planMaxPrompts = typeof plan?.maxPrompts === 'number'
    ? plan.maxPrompts
    : (fallbackPromptLimits[planId] ?? fallbackPromptLimits.free);
  const availableSlots = planMaxPrompts < 0 ? Number.POSITIVE_INFINITY : Math.max(0, planMaxPrompts - existingPrompts.length);

  const createdPromptIds: string[] = [];
  const existingPromptIds: string[] = [];
  const createdPromptTexts: string[] = [];
  const activationTargets: any[] = [];
  let matchedExisting = 0;
  let skippedPlanLimit = 0;

  for (const promptText of promptCandidates) {
    const key = promptText.toLowerCase();
    const existing = existingByText.get(key);
    if (existing) {
      matchedExisting++;
      existingPromptIds.push(existing.id);
      activationTargets.push(existing);
      continue;
    }

    if (createdPromptIds.length >= availableSlots) {
      skippedPlanLimit++;
      continue;
    }

    const created = await storage.createPrompt({
      brandId: brand.id,
      text: promptText,
      category: 'product_visibility',
      intent: /vs|alternative|compare/i.test(promptText) ? 'comparison' : 'buying',
      priorityScore: 8,
      source: 'product_prompt_pack',
      isActive: true,
    } as any);
    existingByText.set(key, created);
    createdPromptIds.push(created.id);
    createdPromptTexts.push(created.text);
    activationTargets.push(created);
  }

  const sampledPromptIds: string[] = [];
  const samplingJobIds: string[] = [];
  const now = new Date();
  const uniqueTargets = Array.from(new Map(activationTargets
    .filter((prompt: any) => matchesAnyProductText(catalog, `${prompt.text || ''} ${prompt.intent || ''} ${prompt.category || ''}`))
    .map((prompt: any) => [prompt.id, prompt] as const)).values())
    .filter((prompt: any) => createdPromptIds.includes(prompt.id) || promptNeedsProductSampling(prompt, now))
    .slice(0, maxSamplingPrompts);

  if (uniqueTargets.length > 0) {
    const { triggerLLMSampling } = await import('../jobs');
    for (const prompt of uniqueTargets) {
      const jobId = await triggerLLMSampling(brand.id, prompt.id, 7);
      sampledPromptIds.push(prompt.id);
      samplingJobIds.push(jobId);
    }
  }

  const snapshot = await saveProductVisibilitySnapshot(brand).catch(() => undefined);
  const nextActions = [
    skippedPlanLimit > 0 ? `Upgrade or remove stale prompts to add ${skippedPlanLimit} product prompt${skippedPlanLimit === 1 ? '' : 's'} blocked by the ${planId} plan limit.` : '',
    samplingJobIds.length === 0 ? 'No stale product prompts were queued; add fresh SKUs or rerun after prompt results age.' : '',
    catalog.some((product) => (product.competitors?.length || 0) === 0) ? 'Map named competitor products for priority SKUs before using competitive benchmark claims in sales decks.' : '',
    'Review Product Visibility actions after sampling finishes and publish at least one schema, FAQ, or AXP proof asset.',
  ].filter(Boolean);

  return {
    brandId: brand.id,
    brandName: brand.name,
    catalog: {
      products: catalog.length,
      highPriorityProducts: catalog.filter((product) => product.priority === 'high').length,
    },
    prompts: {
      requested: promptCandidates.length,
      created: createdPromptIds.length,
      matchedExisting,
      skippedPlanLimit,
      createdPromptIds,
      existingPromptIds: Array.from(new Set(existingPromptIds)),
      examples: [...createdPromptTexts, ...promptCandidates].slice(0, 8),
    },
    sampling: {
      queued: samplingJobIds.length,
      jobIds: samplingJobIds,
      sampledPromptIds,
    },
    snapshot,
    nextActions,
    message: `Product prompt pack activated for ${catalog.length} SKU${catalog.length === 1 ? '' : 's'}: ${createdPromptIds.length} prompt${createdPromptIds.length === 1 ? '' : 's'} created, ${matchedExisting} existing prompt${matchedExisting === 1 ? '' : 's'} reused, and ${samplingJobIds.length} sampling job${samplingJobIds.length === 1 ? '' : 's'} queued.`,
  };
}

function sampleCatalogTemplate(): ProductCatalogItem[] {
  return [
    normalizeCatalogItem({
      name: 'Hero Product',
      asin: 'B0EXAMPLE1',
      marketplace: 'amazon.in',
      category: 'Category',
      priceBand: 'INR 999-1499',
      priority: 'high',
      competitors: [
        { name: 'Competitor Product', asin: 'B0EXAMPLE2' },
      ],
      claims: ['primary benefit', 'proof point', 'use case'],
      objections: ['price concern', 'comparison doubt'],
    }, 0),
  ];
}

function firstClaim(product: ProductCatalogItem): string {
  return product.claims?.[0] || `clear ${product.category || 'category'} value`;
}

function buildPromptCluster(product: ProductCatalogItem, brand: Brand): string[] {
  const productName = product.name;
  const brandName = brand.name;
  const brandedProductName = productName.toLowerCase().includes(brandName.toLowerCase())
    ? productName
    : `${brandName} ${productName}`;
  const category = product.category || 'product';
  return [
    `best ${category} like ${productName} in India`,
    `${productName} vs alternatives for ${category}`,
    `is ${brandedProductName} worth buying`,
    `${productName} reviews pros cons`,
    `${productName} problems and objections`,
    `${productName} price and value comparison`,
  ];
}

function buildProductMarkdown(product: ProductListingPlaybookItem): string {
  const lines = [
    `## ${product.name}`,
    '',
    `Priority: ${product.priority}`,
    `Readiness score: ${product.readinessScore}/100`,
    product.asin ? `ASIN: ${product.asin}` : '',
    product.sku ? `SKU: ${product.sku}` : '',
    '',
    '### Listing title',
    product.listingEdits.title,
    '',
    '### Bullets',
    ...product.listingEdits.bullets.map((bullet) => `- ${bullet}`),
    '',
    '### FAQ',
    ...product.listingEdits.faq.map((item) => `- Q: ${item.question}\n  A: ${item.answer}`),
    '',
    '### Prompt cluster',
    ...product.listingEdits.promptCluster.map((prompt) => `- ${prompt}`),
    '',
    '### Source gaps',
    ...product.sourceGaps.map((gap) => `- ${gap}`),
  ].filter(Boolean);
  return lines.join('\n');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildProductVisibilityActionsMarkdown(plan: ProductVisibilityActionPlan): string {
  const lines = [
    `# ${plan.brandName} Product Visibility Action Pack`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Summary: ${plan.summary}`,
    '',
    `Metrics: ${plan.metrics.totalActions} actions, ${plan.metrics.highPriority} high priority, ${plan.metrics.inProgress} in progress, ${plan.metrics.done} done, ${plan.metrics.blocked} blocked.`,
    '',
    '## Actions',
  ];

  plan.actions.forEach((action, index) => {
    lines.push(
      '',
      `### ${index + 1}. ${action.title}`,
      '',
      `- Priority: ${action.priority}`,
      `- Status: ${action.status.replace('_', ' ')}`,
      `- Owner: ${action.owner === 'geo_team' ? 'AIRank' : 'Brand'}`,
      `- Trigger: ${action.trigger.replace(/_/g, ' ')}`,
      action.productName ? `- Product: ${action.productName}` : '',
      action.updatedAt ? `- Updated: ${action.updatedAt}` : '',
      action.note ? `- Note: ${action.note}` : '',
      `- Evidence: ${action.evidence}`,
      `- Expected impact: ${action.expectedImpact}`,
      '',
      'Steps:',
      ...action.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
    );
  });

  return lines.filter((line) => line !== '').join('\n');
}

function buildProductVisibilityActionsCsv(plan: ProductVisibilityActionPlan): string {
  const header = [
    'id',
    'title',
    'product',
    'priority',
    'status',
    'owner',
    'trigger',
    'evidence',
    'expected_impact',
    'steps',
    'updated_at',
    'note',
  ];
  const rows = plan.actions.map((action) => [
    action.id,
    action.title,
    action.productName || '',
    action.priority,
    action.status,
    action.owner === 'geo_team' ? 'AIRank' : 'Brand',
    action.trigger,
    action.evidence,
    action.expectedImpact,
    action.steps.join(' | '),
    action.updatedAt || '',
    action.note || '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function buildProductVisibilityBenchmark(
  catalog: ProductCatalogItem[],
  visibilityProducts: ProductVisibilityItem[],
  prompts: any[],
  sources: any[],
  mentions: any[],
  llmAnswers: any[],
): ProductVisibilityBenchmark {
  if (catalog.length === 0) {
    return {
      setupRequired: true,
      summary: 'Import products and direct competitors to benchmark AI visibility pressure.',
      brandShare: 0,
      competitorShare: 0,
      totalBrandSignals: 0,
      totalCompetitorSignals: 0,
      topThreats: [],
      products: [],
    };
  }

  const productVisibilityById = new Map(visibilityProducts.map((product) => [product.productId, product]));
  const corpus = {
    prompts: prompts.map((prompt: any) => `${prompt.text || ''} ${prompt.intent || ''} ${prompt.category || ''}`),
    sources: sources.map((source: any) => `${source.domain || ''} ${source.url || ''} ${source.title || ''}`),
    mentions: mentions.map((mention: any) => `${mention.entityName || ''} ${mention.context || ''}`),
    answers: llmAnswers.map((answer: any) => `${answer.answer || ''} ${answer.response || ''} ${answer.content || ''} ${answer.rawResponse || ''}`),
  };
  const topThreatMap = new Map<string, ProductVisibilityBenchmark['topThreats'][number]>();

  const products = catalog.map<ProductVisibilityBenchmark['products'][number]>((product) => {
    const visibility = productVisibilityById.get(product.id);
    const brandSignals = (visibility?.promptMatches || 0) + (visibility?.mentionMatches || 0) + (visibility?.sourceMatches || 0);
    const competitorSignalsByName = (product.competitors || []).map((competitor) => {
      const promptMatches = corpus.prompts.filter((text) => matchesCompetitorText(competitor, text)).length;
      const sourceMatches = corpus.sources.filter((text) => matchesCompetitorText(competitor, text)).length;
      const mentionMatches = corpus.mentions.filter((text) => matchesCompetitorText(competitor, text)).length
        + corpus.answers.filter((text) => matchesCompetitorText(competitor, text)).length;
      const signalCount = promptMatches + sourceMatches + mentionMatches;
      const name = competitor.name || competitor.asin || 'Competitor product';
      if (signalCount > 0) {
        const key = `${name}:${competitor.asin || ''}`;
        const threatLevel: 'high' | 'medium' | 'low' = signalCount >= brandSignals + 3 ? 'high' : signalCount >= Math.max(2, brandSignals) ? 'medium' : 'low';
        topThreatMap.set(key, {
          name,
          asin: competitor.asin,
          productName: product.name,
          signalCount,
          promptMatches,
          mentionMatches,
          sourceMatches,
          threatLevel,
        });
      }
      return { name, signalCount };
    });
    const competitorSignals = competitorSignalsByName.reduce((sum, item) => sum + item.signalCount, 0);
    const leading = competitorSignalsByName.sort((a, b) => b.signalCount - a.signalCount)[0];
    const benchmarkGap = competitorSignals - brandSignals;
    const pressure: 'high' | 'medium' | 'low' = benchmarkGap >= 3 || (brandSignals === 0 && competitorSignals > 0)
      ? 'high'
      : benchmarkGap > 0 || competitorSignals > brandSignals * 0.6
        ? 'medium'
        : 'low';
    const gaps = [
      (product.competitors || []).length === 0 ? 'Add direct competing ASINs/products for benchmark tracking.' : '',
      competitorSignals > 0 && brandSignals === 0 ? 'Competitors appear in AI/product evidence while this product has no matching brand signals.' : '',
      benchmarkGap > 0 ? `Close ${benchmarkGap} competitor signal${benchmarkGap === 1 ? '' : 's'} with prompts, citations, and comparison content.` : '',
      leading?.signalCount ? `Watch ${leading.name}; it has ${leading.signalCount} detected benchmark signal${leading.signalCount === 1 ? '' : 's'}.` : '',
    ].filter(Boolean);

    return {
      productId: product.id,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      brandSignals,
      competitorSignals,
      benchmarkGap,
      pressure,
      leadingCompetitor: leading?.signalCount ? leading.name : undefined,
      gaps,
    };
  }).sort((a, b) => b.benchmarkGap - a.benchmarkGap || b.competitorSignals - a.competitorSignals);

  const totalBrandSignals = products.reduce((sum, product) => sum + product.brandSignals, 0);
  const totalCompetitorSignals = products.reduce((sum, product) => sum + product.competitorSignals, 0);
  const totalSignals = totalBrandSignals + totalCompetitorSignals;
  const brandShare = totalSignals ? Math.round((totalBrandSignals / totalSignals) * 100) : 0;
  const competitorShare = totalSignals ? 100 - brandShare : 0;
  const topThreats = Array.from(topThreatMap.values())
    .sort((a, b) => b.signalCount - a.signalCount)
    .slice(0, 8);
  const highPressure = products.filter((product) => product.pressure === 'high').length;

  return {
    setupRequired: catalog.every((product) => (product.competitors || []).length === 0),
    summary: totalSignals === 0
      ? 'No competitor product evidence found yet; add comparison prompts and sample AI answers to benchmark share-of-recommendation.'
      : `${competitorShare}% of detected product benchmark signals point to competitor products; ${highPressure} product${highPressure === 1 ? '' : 's'} ${highPressure === 1 ? 'has' : 'have'} high competitive pressure.`,
    brandShare,
    competitorShare,
    totalBrandSignals,
    totalCompetitorSignals,
    topThreats,
    products,
  };
}

function buildProductVisibilitySamplingReadiness(
  catalog: ProductCatalogItem[],
  visibilityProducts: ProductVisibilityItem[],
  providerFreshness: ProductVisibilityResult['providerFreshness'],
): ProductVisibilitySamplingReadiness {
  const freshProviders = providerFreshness.filter((provider) => provider.status === 'fresh').map((provider) => provider.provider);
  const missingProviders = providerFreshness.filter((provider) => provider.status === 'not_sampled').map((provider) => provider.provider);
  const staleProviders = providerFreshness.filter((provider) => provider.status === 'stale').map((provider) => provider.provider);
  const failedProviders = providerFreshness.filter((provider) => provider.status === 'failed').map((provider) => provider.provider);
  const minimumFreshProviders = Math.min(3, MAJOR_LLM_PROVIDERS.length);
  const coveredProducts = visibilityProducts.filter((product) => product.promptMatches > 0).length;
  const totalProducts = catalog.length;
  const promptCoveragePercent = totalProducts ? Math.round((coveredProducts / totalProducts) * 100) : 0;
  const providerCoveragePercent = Math.round((freshProviders.length / MAJOR_LLM_PROVIDERS.length) * 100);
  const coverageScore = totalProducts === 0
    ? 0
    : Math.min(100, Math.round(providerCoveragePercent * 0.7 + promptCoveragePercent * 0.3));
  const status: ProductVisibilitySamplingReadiness['status'] = totalProducts === 0 || freshProviders.length < 2 || promptCoveragePercent < 50
    ? 'blocked'
    : freshProviders.length >= minimumFreshProviders && promptCoveragePercent >= 80 && failedProviders.length === 0
      ? 'ready'
      : 'partial';
  const blockedProviders = [...missingProviders, ...staleProviders, ...failedProviders];

  const evidence = [
    `${freshProviders.length}/${MAJOR_LLM_PROVIDERS.length} major AI providers have fresh product sampling.`,
    `${coveredProducts}/${totalProducts} catalog products have product-specific prompt coverage.`,
    missingProviders.length ? `${missingProviders.length} providers have never been sampled: ${missingProviders.join(', ')}.` : '',
    staleProviders.length ? `${staleProviders.length} providers are stale: ${staleProviders.join(', ')}.` : '',
    failedProviders.length ? `${failedProviders.length} providers failed last sampling: ${failedProviders.join(', ')}.` : '',
  ].filter(Boolean);

  const nextActions = [
    totalProducts === 0 ? 'Import priority SKUs/ASINs before claiming product AI visibility coverage.' : '',
    freshProviders.length < minimumFreshProviders ? `Run product prompts on at least ${minimumFreshProviders - freshProviders.length} more major provider${minimumFreshProviders - freshProviders.length === 1 ? '' : 's'}.` : '',
    promptCoveragePercent < 80 ? 'Create and run buying, comparison, review, and objection prompts for every priority SKU.' : '',
    blockedProviders.length ? `Prioritize provider coverage for ${blockedProviders.slice(0, 4).join(', ')}${blockedProviders.length > 4 ? ', and remaining providers' : ''}.` : '',
    failedProviders.length ? 'Fix failed sampling credentials/queue jobs before sharing the visibility verdict with clients.' : '',
    status === 'ready' ? 'Save a product visibility snapshot and use it as the before/after baseline for launch reporting.' : '',
  ].filter(Boolean);

  return {
    status,
    coverageScore,
    summary: status === 'ready'
      ? `Sampling coverage is launch-ready: ${freshProviders.length} providers are fresh and ${promptCoveragePercent}% of products have prompt coverage.`
      : status === 'partial'
        ? `Sampling coverage is usable for diagnosis but not yet enterprise-grade: ${freshProviders.length} providers are fresh and ${promptCoveragePercent}% of products have prompt coverage.`
        : `Sampling coverage is blocked: ${freshProviders.length} providers are fresh and ${promptCoveragePercent}% of products have prompt coverage.`,
    minimumFreshProviders,
    freshProviders,
    missingProviders,
    staleProviders,
    failedProviders,
    productPromptCoverage: {
      coveredProducts,
      totalProducts,
      coveragePercent: promptCoveragePercent,
    },
    evidence,
    nextActions,
  };
}

function buildExternalBenchmarkReadiness(
  catalog: ProductCatalogItem[],
  visibilityProducts: ProductVisibilityItem[],
  benchmark: ProductVisibilityBenchmark,
  samplingReadiness: ProductVisibilitySamplingReadiness,
): ProductVisibilityExternalBenchmarkReadiness {
  const totalProducts = catalog.length;
  const productsWithIdentifiers = catalog.filter((product) => product.asin || product.sku || product.productUrl).length;
  const productsWithCompetitors = catalog.filter((product) => (product.competitors?.length || 0) > 0).length;
  const productsWithClaims = catalog.filter((product) => (product.claims?.length || 0) >= 2).length;
  const productsWithObjections = catalog.filter((product) => (product.objections?.length || 0) > 0).length;
  const productsWithSources = visibilityProducts.filter((product) => product.sourceMatches > 0).length;
  const productsWithSignals = benchmark.products.filter((product) => product.brandSignals > 0 || product.competitorSignals > 0).length;

  const percent = (count: number) => (totalProducts ? Math.round((count / totalProducts) * 100) : 0);
  const catalogCompleteness = totalProducts
    ? Math.round((percent(productsWithIdentifiers) + percent(productsWithClaims) + percent(productsWithObjections)) / 3)
    : 0;
  const competitorCoverage = percent(productsWithCompetitors);
  const citationCoverage = percent(productsWithSources);
  const signalCoverage = percent(productsWithSignals);

  const checks: ProductVisibilityExternalBenchmarkReadiness['checks'] = [
    {
      id: 'catalog_depth',
      label: 'Catalog depth',
      status: totalProducts >= 3 && catalogCompleteness >= 80 ? 'pass' : totalProducts >= 1 && catalogCompleteness >= 50 ? 'warning' : 'missing',
      score: Math.min(100, Math.round((Math.min(totalProducts, 3) / 3) * 45 + catalogCompleteness * 0.55)),
      evidence: `${totalProducts} product${totalProducts === 1 ? '' : 's'} imported; ${catalogCompleteness}% have identifiers, claims, and objections.`,
      fix: 'Import at least 3 priority SKUs/ASINs with URL, claims, objections, and identifiers.',
    },
    {
      id: 'competitor_mapping',
      label: 'Competitor product mapping',
      status: competitorCoverage >= 80 ? 'pass' : competitorCoverage >= 50 ? 'warning' : 'missing',
      score: competitorCoverage,
      evidence: `${productsWithCompetitors}/${totalProducts || 0} products have direct competitor products mapped.`,
      fix: 'Add 2-4 direct competing ASINs/products for every priority SKU.',
    },
    {
      id: 'provider_sampling',
      label: 'Provider sampling coverage',
      status: samplingReadiness.status === 'ready' ? 'pass' : samplingReadiness.status === 'partial' ? 'warning' : 'missing',
      score: samplingReadiness.coverageScore,
      evidence: samplingReadiness.summary,
      fix: 'Run product prompts across at least 3 major providers and reach 80% SKU prompt coverage.',
    },
    {
      id: 'citation_evidence',
      label: 'Citation/source evidence',
      status: citationCoverage >= 60 ? 'pass' : citationCoverage > 0 ? 'warning' : 'missing',
      score: citationCoverage,
      evidence: `${productsWithSources}/${totalProducts || 0} products have source citation matches.`,
      fix: 'Add marketplace, owned product, FAQ, review, and policy URLs as citable product sources.',
    },
    {
      id: 'benchmark_signals',
      label: 'Benchmark signal base',
      status: signalCoverage >= 80 && benchmark.totalBrandSignals + benchmark.totalCompetitorSignals >= 10 ? 'pass' : signalCoverage > 0 ? 'warning' : 'missing',
      score: Math.min(100, Math.round(signalCoverage * 0.7 + Math.min(benchmark.totalBrandSignals + benchmark.totalCompetitorSignals, 10) * 3)),
      evidence: `${productsWithSignals}/${totalProducts || 0} products have brand or competitor benchmark signals; ${benchmark.totalBrandSignals + benchmark.totalCompetitorSignals} total signals.`,
      fix: 'Create comparison prompts and sample answers until every priority SKU has brand and competitor signals.',
    },
  ];

  const averageScore = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  const missingInputs = checks
    .filter((check) => check.status !== 'pass')
    .map((check) => check.label);
  const status: ProductVisibilityExternalBenchmarkReadiness['status'] = checks.some((check) => check.status === 'missing')
    ? 'blocked'
    : checks.some((check) => check.status === 'warning') || averageScore < 85
      ? 'partial'
      : 'ready';
  const nextActions = checks
    .filter((check) => check.status !== 'pass')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((check) => check.fix);

  return {
    status,
    score: averageScore,
    summary: status === 'ready'
      ? `Ready for a real external brand benchmark: score ${averageScore}/100 with complete catalog, competitor, sampling, and signal coverage.`
      : status === 'partial'
        ? `Partially ready for external benchmarking: score ${averageScore}/100; tighten weak inputs before enterprise delivery.`
        : `Blocked for external benchmarking: score ${averageScore}/100; missing ${missingInputs.slice(0, 3).join(', ') || 'required benchmark inputs'}.`,
    checks,
    missingInputs,
    nextActions,
  };
}

function buildPilotReadiness(
  readiness: ProductReadinessResult,
  visibility: ProductVisibilityResult,
  trend: ProductVisibilityTrend,
  actionPlan: ProductVisibilityActionPlan,
  draftPack: ProductVisibilityDraftPack,
  publishQueue: ProductVisibilityPublishQueue,
): ProductVisibilityPilotReadiness {
  const approvedDrafts = draftPack.drafts.filter((draft) => draft.status === 'approved').length;
  const publishedArtifacts = publishQueue.queue.filter((item) => item.status === 'published').length;
  const measurementJobs = publishQueue.queue.reduce((sum, item) => sum + (item.measurement?.jobIds.length || 0), 0);
  const highPriorityOpen = actionPlan.actions.filter((action) => action.priority === 'high' && action.status !== 'done').length;
  const visibilityCoverage = visibility.metrics.products
    ? Math.round((visibility.metrics.visibleProducts / visibility.metrics.products) * 100)
    : 0;

  const checks: ProductVisibilityPilotReadiness['checks'] = [
    {
      id: 'product_setup',
      label: 'Product setup',
      status: readiness.score >= 80 && visibility.metrics.products >= 1 ? 'pass' : readiness.score >= 60 && visibility.metrics.products >= 1 ? 'warning' : 'missing',
      score: visibility.metrics.products ? readiness.score : 0,
      evidence: `${visibility.metrics.products} product${visibility.metrics.products === 1 ? '' : 's'} tracked; product AI-readiness is ${readiness.score}/100.`,
      fix: 'Import priority products with identifiers, competitor products, claims, objections, and citable URLs.',
    },
    {
      id: 'sampling_gate',
      label: 'Sampling gate',
      status: visibility.samplingReadiness.status === 'ready' ? 'pass' : visibility.samplingReadiness.status === 'partial' ? 'warning' : 'missing',
      score: visibility.samplingReadiness.coverageScore,
      evidence: visibility.samplingReadiness.summary,
      fix: 'Reach at least 3 fresh providers and 80% SKU prompt coverage before a seller-facing pilot.',
    },
    {
      id: 'benchmark_gate',
      label: 'Benchmark gate',
      status: visibility.externalBenchmarkReadiness.status === 'ready' ? 'pass' : visibility.externalBenchmarkReadiness.status === 'partial' ? 'warning' : 'missing',
      score: visibility.externalBenchmarkReadiness.score,
      evidence: visibility.externalBenchmarkReadiness.summary,
      fix: 'Complete external benchmark readiness inputs: catalog depth, competitors, sources, sampling, and signal base.',
    },
    {
      id: 'visibility_baseline',
      label: 'Visibility baseline',
      status: visibility.metrics.products > 0 && visibilityCoverage >= 70 && trend.hasComparison ? 'pass' : visibility.metrics.products > 0 && historyLikeTrendExists(trend) ? 'warning' : 'missing',
      score: Math.min(100, Math.round(visibilityCoverage * 0.65 + (trend.hasComparison ? 35 : 0))),
      evidence: `${visibility.metrics.visibleProducts}/${visibility.metrics.products} products are strongly visible; ${trend.hasComparison ? trend.summary : 'no before/after comparison yet'}.`,
      fix: 'Save at least two product visibility snapshots after sampling so the pilot has before/after proof.',
    },
    {
      id: 'execution_assets',
      label: 'Execution assets',
      status: publishedArtifacts >= 1 && approvedDrafts >= 1 ? 'pass' : approvedDrafts >= 1 || publishQueue.queue.length >= 1 ? 'warning' : 'missing',
      score: Math.min(100, publishedArtifacts * 45 + approvedDrafts * 25 + Math.min(publishQueue.queue.length, 2) * 15),
      evidence: `${approvedDrafts} approved draft${approvedDrafts === 1 ? '' : 's'}, ${publishedArtifacts} published artifact${publishedArtifacts === 1 ? '' : 's'}, ${publishQueue.queue.length} publish queue item${publishQueue.queue.length === 1 ? '' : 's'}.`,
      fix: 'Approve at least one remediation draft and publish one schema, FAQ, AXP, or CMS artifact.',
    },
    {
      id: 'measurement_loop',
      label: 'Measurement loop',
      status: measurementJobs >= 3 ? 'pass' : measurementJobs > 0 ? 'warning' : 'missing',
      score: Math.min(100, measurementJobs * 25),
      evidence: `${measurementJobs} post-publish sampling job${measurementJobs === 1 ? '' : 's'} queued.`,
      fix: 'Publish an approved artifact so post-publish prompts and sampling jobs are queued for impact measurement.',
    },
    {
      id: 'open_risks',
      label: 'Open launch risks',
      status: highPriorityOpen === 0 ? 'pass' : highPriorityOpen <= 2 ? 'warning' : 'missing',
      score: highPriorityOpen === 0 ? 100 : highPriorityOpen <= 2 ? 60 : 25,
      evidence: `${highPriorityOpen} high-priority action${highPriorityOpen === 1 ? '' : 's'} remain open.`,
      fix: 'Resolve or explicitly assign all high-priority launch actions before client delivery.',
    },
  ];

  const score = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  const blockers = checks.filter((check) => check.status === 'missing').map((check) => check.label);
  const status: ProductVisibilityPilotReadiness['status'] = blockers.length > 0
    ? 'blocked'
    : checks.some((check) => check.status === 'warning') || score < 85
      ? 'needs_review'
      : 'ready';
  const nextActions = checks
    .filter((check) => check.status !== 'pass')
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
    .map((check) => check.fix);
  const launchPlan = buildPilotLaunchPlan(checks, status);

  return {
    status,
    score,
    summary: status === 'ready'
      ? `Controlled pilot is launch-ready: ${score}/100 across setup, sampling, benchmarking, execution, and measurement.`
      : status === 'needs_review'
        ? `Controlled pilot needs review: ${score}/100 with weak checks that should be tightened before enterprise delivery.`
        : `Controlled pilot is blocked: ${score}/100; missing ${blockers.slice(0, 3).join(', ') || 'required launch gates'}.`,
    checks,
    blockers,
    nextActions,
    launchPlan,
  };
}

function historyLikeTrendExists(trend: ProductVisibilityTrend): boolean {
  return Boolean(trend.latestSnapshotId);
}

function buildPilotLaunchPlan(
  checks: ProductVisibilityPilotReadiness['checks'],
  status: ProductVisibilityPilotReadiness['status'],
): ProductVisibilityPilotReadiness['launchPlan'] {
  const failedChecks = checks.filter((check) => check.status !== 'pass');
  const byId = new Map(checks.map((check) => [check.id, check]));
  const needs = (id: string) => byId.get(id)?.status !== 'pass';
  const nowActions = [
    needs('product_setup') ? 'Complete priority SKU catalog fields: identifiers, claims, objections, competitor products, and citable URLs.' : '',
    needs('sampling_gate') ? 'Run product prompt clusters on missing/stale providers and confirm at least 3 fresh providers.' : '',
    needs('benchmark_gate') ? 'Add comparison prompts and direct competitor products until every priority SKU has benchmark signals.' : '',
    needs('open_risks') ? 'Assign or resolve high-priority launch actions with owners and due dates.' : '',
  ].filter(Boolean);
  const nextWeekActions = [
    needs('visibility_baseline') ? 'Save baseline and follow-up product visibility snapshots after sampling changes.' : '',
    needs('execution_assets') ? 'Approve remediation drafts and publish one schema, FAQ, AXP, or CMS artifact for the highest-priority SKU.' : '',
    needs('measurement_loop') ? 'Queue post-publish measurement prompts and verify jobs are created for impact tracking.' : '',
    failedChecks.length ? 'Re-run the client report and confirm all launch gates are warning or pass.' : '',
  ].filter(Boolean);
  const pilotActions = status === 'ready'
    ? ['Start a controlled pilot with weekly visibility snapshots and a published artifact review cadence.']
    : [
      'Share the pilot report only after blocked gates are cleared.',
      'Use the blocked gate list as the customer success implementation checklist.',
    ];

  return [
    {
      phase: 'now',
      title: status === 'ready' ? 'Lock pilot baseline' : 'Unblock pilot launch',
      owner: 'joint',
      actions: nowActions.length ? nowActions : ['Confirm current product catalog, provider coverage, and benchmark inputs remain fresh.'],
      exitCriteria: [
        'No missing product setup, sampling, benchmark, or high-risk checks.',
        'Every priority SKU has owner-approved remediation scope.',
      ],
    },
    {
      phase: 'next_7_days',
      title: 'Create proof assets and measurement',
      owner: 'geo_team',
      actions: nextWeekActions.length ? nextWeekActions : ['Publish at least one remediation artifact and queue post-publish measurement jobs.'],
      exitCriteria: [
        'At least one approved artifact is published or queued.',
        'Post-publish measurement jobs are queued for buyer/comparison prompts.',
      ],
    },
    {
      phase: 'pilot_ready',
      title: 'Pilot handoff',
      owner: 'joint',
      actions: pilotActions,
      exitCriteria: [
        'Pilot readiness status is ready or explicitly accepted as needs review.',
        'Client report, PDF, artifacts, and measurement plan are available for the brand team.',
      ],
    },
  ];
}

export async function buildProductListingPlaybook(brand: Brand): Promise<ProductListingPlaybookResult> {
  const [context, sources] = await Promise.all([
    storage.getBrandContext(brand.id).catch(() => undefined),
    storage.getSourcesByBrand(brand.id).catch(() => []),
  ]);
  const catalog = readCatalog((context as any)?.productServices);
  const sourceText = sources.map((source: any) => `${source.domain || ''} ${source.url || ''} ${source.title || ''}`).join(' ');
  const marketplaceSourceCount = sources.filter((source: any) => MARKETPLACE_RE.test(`${source.domain || ''} ${source.url || ''} ${source.title || ''}`)).length;
  const setupRequired = catalog.length === 0;

  const products = catalog.map((product) => {
    const claims = product.claims?.length ? product.claims : [firstClaim(product)];
    const objections = product.objections?.length ? product.objections : [
      'unclear differentiation versus alternatives',
      'missing review-backed proof',
    ];
    const hasIdentifier = Boolean(product.asin || product.sku);
    const hasCompetitors = (product.competitors?.length || 0) > 0;
    const hasClaims = (product.claims?.length || 0) >= 2;
    const hasObjections = (product.objections?.length || 0) > 0;
    const readinessScore = [
      hasIdentifier ? 25 : 0,
      product.productUrl ? 15 : 0,
      hasCompetitors ? 20 : 0,
      hasClaims ? 20 : 0,
      hasObjections ? 10 : 0,
      marketplaceSourceCount > 0 ? 10 : 0,
    ].reduce((sum, value) => sum + value, 0);
    const promptCluster = buildPromptCluster(product, brand);
    const brandedProductName = product.name.toLowerCase().includes(brand.name.toLowerCase())
      ? product.name
      : `${brand.name} ${product.name}`;
    const competitorAngles = (product.competitors || []).slice(0, 4).map((competitor) => (
      `${product.name} versus ${competitor.name || competitor.asin}: compare proof, price, rating, review objections, and use case fit.`
    ));
    const sourceGaps = [
      !hasIdentifier ? 'Add ASIN or internal SKU so AI visibility can be tracked per listing.' : '',
      !product.productUrl ? 'Add the Amazon/storefront URL for citation and crawler checks.' : '',
      !hasCompetitors ? 'Map 3-5 direct competing ASINs/products for comparison prompts.' : '',
      !hasClaims ? 'Add at least three proof-backed claims from reviews, specs, policies, or brand assets.' : '',
      !sourceText.includes(product.asin || product.sku || product.name) ? 'Add sources that mention this exact product name or identifier.' : '',
    ].filter(Boolean);
    const listingEdits = {
      title: `${brandedProductName}${product.category ? ` for ${product.category}` : ''} - ${claims.slice(0, 2).join(', ')}`,
      bullets: [
        `${claims[0]} with proof from owned content, reviews, or marketplace evidence.`,
        `Best-fit use case: ${product.category || 'priority customer problem'} buyers comparing alternatives.`,
        `Comparison angle: ${(product.competitors || [])[0]?.name || 'top competing product'} versus ${product.name}.`,
        `Objection answer: ${objections[0]}.`,
        `AI citation pack: keep price band, availability, warranty, return policy, and sameAs links current.`,
      ],
      faq: [
        {
          question: `Who should buy ${product.name}?`,
          answer: `Buyers looking for ${claims[0]} in ${product.category || 'this category'}, with clear proof and comparison evidence.`,
        },
        {
          question: `How is ${product.name} different from alternatives?`,
          answer: competitorAngles[0] || `It needs a direct competitor comparison backed by specs, reviews, and policy proof.`,
        },
        {
          question: `What concern should the listing answer first?`,
          answer: objections[0],
        },
      ],
      schemaFields: {
        '@type': 'Product',
        name: product.name,
        sku: product.sku || '',
        asin: product.asin || '',
        brand: brand.name,
        category: product.category || '',
        url: product.productUrl || '',
        priceRange: product.priceBand || '',
      },
      claimsToProve: claims,
      objectionsToAddress: objections,
      promptCluster,
    };
    const item: ProductListingPlaybookItem = {
      productId: product.id,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      marketplace: product.marketplace,
      category: product.category,
      priority: product.priority || 'medium',
      readinessScore,
      listingEdits,
      competitorAngles,
      sourceGaps,
      exportMarkdown: '',
    };
    item.exportMarkdown = buildProductMarkdown(item);
    return item;
  }).sort((a, b) => {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return priorityRank[a.priority] - priorityRank[b.priority] || a.readinessScore - b.readinessScore;
  });

  return {
    brandId: brand.id,
    brandName: brand.name,
    setupRequired,
    summary: setupRequired
      ? 'Import priority ASINs/SKUs to generate SKU-level listing edits, prompt clusters, schema fields, and objection handling.'
      : `${products.length} product listing playbook${products.length === 1 ? '' : 's'} ready for marketplace and owned-site execution.`,
    products,
    importTemplate: setupRequired ? sampleCatalogTemplate() : [],
    exportMarkdown: products.map((product) => product.exportMarkdown).join('\n\n---\n\n'),
  };
}

function gradeFor(score: number): ProductReadinessResult['grade'] {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  return 'poor';
}

function textFromJson(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  return Array.from(new Set(text.match(pattern) || []));
}

function scoreCheck(
  id: string,
  label: string,
  passed: boolean,
  partial: boolean,
  evidence: string,
  fix: string,
  weight: number,
): ProductReadinessCheck & { weight: number } {
  const status: CheckStatus = passed ? 'pass' : partial ? 'warning' : 'missing';
  return {
    id,
    label,
    status,
    score: passed ? weight : partial ? Math.round(weight * 0.5) : 0,
    weight,
    evidence,
    fix,
  };
}

export async function buildProductVisibility(brand: Brand): Promise<ProductVisibilityResult> {
  const [context, prompts, sources, mentions, promptRuns, llmAnswers] = await Promise.all([
    storage.getBrandContext(brand.id).catch(() => undefined),
    storage.getPromptsByBrand(brand.id).catch(() => []),
    storage.getSourcesByBrand(brand.id).catch(() => []),
    storage.getAllMentionsForBrand(brand.id, 3000).catch(() => []),
    storage.getPromptRunsByBrand(brand.id, 5000).catch(() => []),
    storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
  ]);

  const catalog = readCatalog((context as any)?.productServices);
  const freshnessCutoffMs = 14 * 24 * 60 * 60 * 1000;
  const providerFreshness = MAJOR_LLM_PROVIDERS.map((provider) => {
    const providerRuns = promptRuns.filter((run: any) => normalizeProvider(run.llmProvider) === provider);
    const providerAnswers = llmAnswers.filter((answer: any) => normalizeProvider(answer.llmProvider) === provider);
    const completedRuns = providerRuns.filter((run: any) => run.status === 'completed').length;
    const failedRuns = providerRuns.filter((run: any) => run.status === 'failed').length;
    const lastRunAt = latestIso(providerRuns.map((run: any) => run.completedAt || run.startedAt || run.createdAt));
    const lastAnswerAt = latestIso(providerAnswers.map((answer: any) => answer.createdAt));
    const newest = Math.max(
      lastRunAt ? new Date(lastRunAt).getTime() : 0,
      lastAnswerAt ? new Date(lastAnswerAt).getTime() : 0,
    );
    const status = newest === 0
      ? 'not_sampled'
      : Date.now() - newest <= freshnessCutoffMs
        ? 'fresh'
        : failedRuns > 0 && completedRuns === 0
          ? 'failed'
          : 'stale';
    return {
      provider,
      status: status as 'fresh' | 'stale' | 'failed' | 'not_sampled',
      lastRunAt,
      lastAnswerAt,
      completedRuns,
      failedRuns,
      totalAnswers: providerAnswers.length,
    };
  });

  const products = catalog.map((product) => {
    const promptMatches = prompts.filter((prompt: any) => matchesProductText(product, `${prompt.text || ''} ${prompt.intent || ''} ${prompt.category || ''}`));
    const sourceMatches = sources.filter((source: any) => matchesProductText(product, `${source.domain || ''} ${source.url || ''} ${source.title || ''}`));
    const mentionMatches = mentions.filter((mention: any) => matchesProductText(product, `${mention.entityName || ''} ${mention.context || ''}`));
    const positions = mentionMatches.map((mention: any) => mention.position).filter((position: any) => typeof position === 'number') as number[];
    const bestPosition = positions.length ? Math.min(...positions) : null;
    const sentiment = {
      positive: mentionMatches.filter((mention: any) => mention.sentiment === 'positive').length,
      neutral: mentionMatches.filter((mention: any) => mention.sentiment === 'neutral' || !mention.sentiment).length,
      negative: mentionMatches.filter((mention: any) => mention.sentiment === 'negative').length,
    };
    const competitorProducts = product.competitors?.length || 0;
    const score = Math.min(100, Math.round(
      Math.min(promptMatches.length, 6) * 7
      + Math.min(mentionMatches.length, 6) * 8
      + Math.min(sourceMatches.length, 4) * 6
      + Math.min(competitorProducts, 4) * 5
      + (bestPosition ? Math.max(0, 16 - bestPosition * 3) : 0)
      + ((product.claims?.length || 0) >= 2 ? 8 : 0)
      + ((product.objections?.length || 0) > 0 ? 5 : 0),
    ));
    const status: ProductVisibilityItem['status'] = score >= 65 ? 'visible' : score >= 35 ? 'weak' : 'missing';
    const evidence = [
      promptMatches.length ? `${promptMatches.length} product prompt${promptMatches.length === 1 ? '' : 's'} matched` : '',
      mentionMatches.length ? `${mentionMatches.length} AI mention${mentionMatches.length === 1 ? '' : 's'} matched` : '',
      sourceMatches.length ? `${sourceMatches.length} product/source citation${sourceMatches.length === 1 ? '' : 's'} matched` : '',
      bestPosition ? `best AI answer position ${bestPosition}` : '',
      competitorProducts ? `${competitorProducts} competing product${competitorProducts === 1 ? '' : 's'} mapped` : '',
    ].filter(Boolean);
    const gaps = [
      promptMatches.length === 0 ? 'Create product-specific prompts for buying, comparison, review, and objections.' : '',
      mentionMatches.length === 0 ? 'Run AI sampling and capture whether this exact product/ASIN is mentioned.' : '',
      sourceMatches.length === 0 ? 'Add product URL, marketplace page, owned page, or review sources as citations.' : '',
      competitorProducts === 0 ? 'Map direct competing ASINs/products for share-of-recommendation tracking.' : '',
      (product.claims?.length || 0) < 2 ? 'Add proof-backed claims that can be reused in AI answers.' : '',
      (product.objections?.length || 0) === 0 ? 'Add buyer objections from reviews or sales calls.' : '',
    ].filter(Boolean);

    return {
      productId: product.id,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      priority: product.priority || 'medium',
      visibilityScore: score,
      status,
      promptMatches: promptMatches.length,
      mentionMatches: mentionMatches.length,
      sourceMatches: sourceMatches.length,
      competitorProducts,
      bestPosition,
      sentiment,
      evidence,
      gaps,
    };
  }).sort((a, b) => {
    const statusRank = { missing: 0, weak: 1, visible: 2 };
    return statusRank[a.status] - statusRank[b.status] || a.visibilityScore - b.visibilityScore;
  });

  const visibleProducts = products.filter((product) => product.status === 'visible').length;
  const weakProducts = products.filter((product) => product.status === 'weak').length;
  const missingProducts = products.filter((product) => product.status === 'missing').length;
  const sampledProviders = providerFreshness.filter((provider) => provider.status === 'fresh').length;
  const notSampledProviders = providerFreshness.filter((provider) => provider.status === 'not_sampled').length;
  const staleProviders = providerFreshness.filter((provider) => provider.status === 'stale' || provider.status === 'failed').length;
  const competitiveBenchmark = buildProductVisibilityBenchmark(catalog, products, prompts, sources, mentions, llmAnswers);
  const samplingReadiness = buildProductVisibilitySamplingReadiness(catalog, products, providerFreshness);
  const externalBenchmarkReadiness = buildExternalBenchmarkReadiness(catalog, products, competitiveBenchmark, samplingReadiness);

  return {
    brandId: brand.id,
    brandName: brand.name,
    setupRequired: catalog.length === 0,
    summary: catalog.length === 0
      ? 'Import products to start per-SKU AI visibility tracking.'
      : `${visibleProducts}/${catalog.length} products have strong AI visibility evidence; ${missingProducts} are missing product-level visibility.`,
    metrics: {
      products: catalog.length,
      visibleProducts,
      weakProducts,
      missingProducts,
      promptMatches: products.reduce((sum, product) => sum + product.promptMatches, 0),
      mentionMatches: products.reduce((sum, product) => sum + product.mentionMatches, 0),
      sourceMatches: products.reduce((sum, product) => sum + product.sourceMatches, 0),
      sampledProviders,
      notSampledProviders,
      staleProviders,
      competitorMentions: competitiveBenchmark.totalCompetitorSignals,
      benchmarkedProducts: competitiveBenchmark.products.filter((product) => product.competitorSignals > 0 || product.brandSignals > 0).length,
    },
    providerFreshness,
    samplingReadiness,
    products,
    competitiveBenchmark,
    externalBenchmarkReadiness,
  };
}

export async function saveProductVisibilitySnapshot(brand: Brand): Promise<ProductVisibilitySnapshot> {
  const visibility = await buildProductVisibility(brand);
  const createdAt = new Date().toISOString();
  const snapshot: ProductVisibilitySnapshot = {
    id: `product-visibility-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    metrics: visibility.metrics,
    providerSummary: {
      fresh: visibility.providerFreshness.filter((provider) => provider.status === 'fresh').length,
      stale: visibility.providerFreshness.filter((provider) => provider.status === 'stale').length,
      failed: visibility.providerFreshness.filter((provider) => provider.status === 'failed').length,
      notSampled: visibility.providerFreshness.filter((provider) => provider.status === 'not_sampled').length,
    },
    products: visibility.products.map((product) => ({
      productId: product.productId,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      visibilityScore: product.visibilityScore,
      status: product.status,
      promptMatches: product.promptMatches,
      mentionMatches: product.mentionMatches,
      sourceMatches: product.sourceMatches,
    })),
  };

  await updateProductServices(brand.id, (existingProductServices) => ({
    ...existingProductServices,
    productVisibilityHistory: [snapshot, ...readProductVisibilityHistory(existingProductServices)].slice(0, 10),
  }));

  return snapshot;
}

export async function buildProductVisibilityActionPlan(brand: Brand): Promise<ProductVisibilityActionPlan> {
  const [visibility, history, context] = await Promise.all([
    buildProductVisibility(brand),
    getProductVisibilityHistory(brand.id),
    storage.getBrandContext(brand.id).catch(() => undefined),
  ]);
  const actionStates = readProductVisibilityActionStates((context as any)?.productServices);
  const trend = buildProductVisibilityTrend(history);
  const trendByProduct = new Map(trend.productDeltas.map((product) => [product.productId, product]));
  const benchmarkByProduct = new Map(visibility.competitiveBenchmark.products.map((product) => [product.productId, product]));
  const actions: ProductVisibilityActionItem[] = [];

  visibility.products.forEach((product) => {
    const trendDelta = trendByProduct.get(product.productId);
    const benchmark = benchmarkByProduct.get(product.productId);
    const productLabel = product.asin || product.sku || product.name;

    if (benchmark?.pressure === 'high') {
      actions.push({
        id: `${product.productId}-benchmark-pressure`,
        productId: product.productId,
        productName: product.name,
        priority: 'high',
        owner: 'geo_team',
        trigger: 'competitive_pressure',
        status: 'todo',
        title: `Recover AI recommendation share from ${benchmark.leadingCompetitor || 'competitor products'}`,
        evidence: `${product.name} has ${benchmark.brandSignals} brand benchmark signals versus ${benchmark.competitorSignals} competitor signals.`,
        expectedImpact: 'Turns raw competitor visibility into SKU-level share-of-recommendation work.',
        steps: [
          'Create comparison prompts and answer extraction rules for the leading competitor product.',
          'Publish objection-led FAQ and schema that states when this product is the better fit.',
          'Track before/after benchmark share after the next product sampling cycle.',
        ],
      });
    }

    if (trendDelta?.movement === 'declined') {
      actions.push({
        id: `${product.productId}-decline`,
        productId: product.productId,
        productName: product.name,
        priority: 'high',
        owner: 'geo_team',
        trigger: 'declining_visibility',
        status: 'todo',
        title: `Recover declining AI visibility for ${product.name}`,
        evidence: `${product.name} moved ${trendDelta.scoreDelta} points since the previous snapshot.`,
        expectedImpact: 'Stops SKU visibility decay before it becomes a sales-call risk.',
        steps: [
          'Compare the latest and previous AI answer samples for lost mentions or citations.',
          'Refresh product prompts across buying, comparison, alternatives, and objections.',
          'Publish updated product proof on marketplace and owned product pages.',
        ],
      });
    }

    if (product.promptMatches === 0) {
      actions.push({
        id: `${product.productId}-prompts`,
        productId: product.productId,
        productName: product.name,
        priority: product.status === 'missing' ? 'high' : 'medium',
        owner: 'geo_team',
        trigger: 'missing_visibility',
        status: 'todo',
        title: `Create product prompt cluster for ${product.name}`,
        evidence: `${productLabel} has 0 product-specific prompt matches.`,
        expectedImpact: 'Creates the measurement coverage needed to track share-of-recommendation.',
        steps: [
          'Add prompts for buying, comparison, alternative, review, and objection handling.',
          'Include the product name, ASIN/SKU, category, and top competitor product names.',
          'Run sampling across ChatGPT, Gemini, Claude, Perplexity, Grok, and DeepSeek.',
        ],
      });
    }

    if (product.mentionMatches === 0) {
      actions.push({
        id: `${product.productId}-mentions`,
        productId: product.productId,
        productName: product.name,
        priority: product.status === 'missing' ? 'high' : 'medium',
        owner: 'geo_team',
        trigger: 'missing_visibility',
        status: 'todo',
        title: `Capture exact AI mention evidence for ${product.name}`,
        evidence: `${productLabel} has 0 exact product/ASIN mentions in sampled AI answers.`,
        expectedImpact: 'Turns product visibility from inferred readiness into answer-level proof.',
        steps: [
          'Run product prompts and extract exact product, ASIN, and competitor mentions.',
          'Tag answer position, sentiment, and whether the product is recommended or only listed.',
          'Use missing-answer examples to create listing and owned-site remediation tasks.',
        ],
      });
    }

    if (product.sourceMatches === 0) {
      actions.push({
        id: `${product.productId}-sources`,
        productId: product.productId,
        productName: product.name,
        priority: 'medium',
        owner: 'brand',
        trigger: 'evidence_gap',
        status: 'todo',
        title: `Add citable product sources for ${product.name}`,
        evidence: `${productLabel} has 0 product/source citation matches.`,
        expectedImpact: 'Gives AI systems reliable pages to cite when recommending the product.',
        steps: [
          'Add or verify Amazon/marketplace URL, owned product page, FAQ, and review source URLs.',
          'Add Product schema with SKU, ASIN, brand, category, claims, and objections.',
          'Expose the same product facts on owned site, marketplace listing, and help content.',
        ],
      });
    }

    if (product.competitorProducts === 0) {
      actions.push({
        id: `${product.productId}-competitors`,
        productId: product.productId,
        productName: product.name,
        priority: 'medium',
        owner: 'brand',
        trigger: 'evidence_gap',
        status: 'todo',
        title: `Map competitor products for ${product.name}`,
        evidence: `${productLabel} has no direct competing products mapped.`,
        expectedImpact: 'Unlocks product-level share-of-recommendation and comparison gaps.',
        steps: [
          'Add 3-5 competing ASINs/products with product name, ASIN/SKU, marketplace, and URL.',
          'Track whether AI answers prefer competitor products and why.',
          'Use competitor angles to update bullets, FAQ, proof claims, and comparison content.',
        ],
      });
    }

    product.gaps.slice(0, 2).forEach((gap, index) => {
      if (actions.some((action) => action.productId === product.productId && action.evidence.includes(gap))) return;
      actions.push({
        id: `${product.productId}-gap-${index + 1}`,
        productId: product.productId,
        productName: product.name,
        priority: product.status === 'visible' ? 'low' : 'medium',
        owner: gap.includes('Run AI sampling') ? 'geo_team' : 'brand',
        trigger: 'evidence_gap',
        status: 'todo',
        title: gap.replace(/\.$/, ''),
        evidence: `${product.name}: ${gap}`,
        expectedImpact: 'Improves the evidence AI systems can use when deciding whether to recommend this SKU.',
        steps: [
          'Assign the gap to the product owner with source evidence.',
          'Update product catalog, listing, owned page, FAQ, or sampling configuration.',
          'Save a new visibility snapshot after the change to prove movement.',
        ],
      });
    });
  });

  const blockedProviders = visibility.providerFreshness.filter((provider) => provider.status === 'not_sampled' || provider.status === 'stale' || provider.status === 'failed');
  if (blockedProviders.length > 0) {
    actions.push({
      id: 'provider-coverage',
      priority: blockedProviders.some((provider) => provider.status === 'not_sampled') ? 'high' : 'medium',
      owner: 'geo_team',
      trigger: 'provider_gap',
      status: 'todo',
      title: `Restore product sampling across ${blockedProviders.length} provider${blockedProviders.length === 1 ? '' : 's'}`,
      evidence: blockedProviders.map((provider) => `${provider.provider}: ${provider.status.replace('_', ' ')}`).join('; '),
      expectedImpact: 'Prevents teams from mistaking unsampled providers for true product invisibility.',
      steps: [
        'Check provider credentials, queue health, and last successful product prompt run.',
        'Run product prompt clusters for not-sampled or stale providers.',
        'Save a visibility snapshot after sampling completes to update trend movement.',
      ],
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const withSavedState = actions.map((action) => {
    const state = actionStates[action.id];
    return state ? { ...action, status: state.status, note: state.note, updatedAt: state.updatedAt } : action;
  });
  const statusRank = { in_progress: 0, blocked: 1, todo: 2, done: 3 };
  const sortedActions = withSavedState
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 12);
  const highPriority = sortedActions.filter((action) => action.priority === 'high').length;
  const productActions = sortedActions.filter((action) => Boolean(action.productId)).length;
  const providerActions = sortedActions.filter((action) => action.trigger === 'provider_gap').length;
  const inProgress = sortedActions.filter((action) => action.status === 'in_progress').length;
  const done = sortedActions.filter((action) => action.status === 'done').length;
  const blocked = sortedActions.filter((action) => action.status === 'blocked').length;

  return {
    brandId: brand.id,
    brandName: brand.name,
    setupRequired: visibility.setupRequired,
    summary: visibility.setupRequired
      ? 'Import products to generate product visibility actions.'
      : `${sortedActions.length} product visibility action${sortedActions.length === 1 ? '' : 's'} ready; ${highPriority} high priority.`,
    metrics: {
      totalActions: sortedActions.length,
      highPriority,
      productActions,
      providerActions,
      inProgress,
      done,
      blocked,
    },
    actions: sortedActions,
  };
}

export async function buildProductVisibilityActionExport(brand: Brand): Promise<ProductVisibilityActionExport> {
  const plan = await buildProductVisibilityActionPlan(brand);
  const generatedAt = new Date().toISOString();
  const filenameBase = `${slugId(brand.name)}-product-visibility-actions-${generatedAt.slice(0, 10)}`;
  return {
    brandId: brand.id,
    brandName: brand.name,
    generatedAt,
    filenameBase,
    markdown: buildProductVisibilityActionsMarkdown(plan),
    csv: buildProductVisibilityActionsCsv(plan),
  };
}

export async function buildProductVisibilityDraftPack(brand: Brand): Promise<ProductVisibilityDraftPack> {
  const [plan, context] = await Promise.all([
    buildProductVisibilityActionPlan(brand),
    storage.getBrandContext(brand.id).catch(() => undefined),
  ]);
  const catalog = readCatalog((context as any)?.productServices);
  const draftStates = readProductVisibilityDraftStates((context as any)?.productServices);
  const catalogById = new Map(catalog.map((product) => [product.id, product]));
  const generatedDrafts = plan.actions.slice(0, 6).map<ProductVisibilityDraftItem>((action) => {
    const draftState = draftStates[action.id];
    const product = action.productId ? catalogById.get(action.productId) : undefined;
    const productName = product?.name || action.productName || brand.name;
    const prompts = product ? buildPromptCluster(product, brand) : [
      `${brand.name} product recommendations in India`,
      `${brand.name} alternatives and comparisons`,
      `${brand.name} reviews and objections`,
    ];
    const claims = product?.claims?.length ? product.claims : ['proof-backed benefit', 'clear category fit'];
    const objections = product?.objections?.length ? product.objections : ['price/value concern', 'unclear differentiation'];
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: productName,
      brand: brand.name,
      sku: product?.sku || '',
      asin: product?.asin || '',
      category: product?.category || '',
      url: product?.productUrl || '',
      description: `${productName} from ${brand.name}: ${claims.join(', ')}.`,
    };
    const competitorLines = (product?.competitors || []).map((competitor) => `- ${competitor.name || competitor.asin}: compare price, proof, reviews, objections, and use-case fit.`);

    if (action.trigger === 'provider_gap') {
      const generatedMarkdown = [
        `## ${action.title}`,
        '',
        '### Sampling brief',
        ...prompts.map((prompt) => `- ${prompt}`),
        '',
        '### Providers',
        '- ChatGPT',
        '- Claude',
        '- Gemini',
        '- Perplexity',
        '- Grok',
        '- DeepSeek',
        '',
        '### Extraction fields',
        '- product mentioned',
        '- ASIN/SKU mentioned',
        '- competitor mentioned',
        '- answer position',
        '- sentiment',
        '- cited sources',
      ].join('\n');
      return {
        actionId: action.id,
        productId: action.productId,
        productName: action.productName,
        title: action.title,
        draftType: 'sampling_brief',
        status: draftState?.status || 'draft',
        version: draftState?.version || 1,
        updatedAt: draftState?.updatedAt,
        note: draftState?.note,
        reviewerId: draftState?.reviewerId,
        assignee: draftState?.assignee,
        edited: Boolean(draftState?.markdown),
        summary: 'Provider sampling brief ready for queue/run configuration.',
        markdown: draftState?.markdown || generatedMarkdown,
        history: draftState?.history || [],
      };
    }

    const draftType: ProductVisibilityDraftItem['draftType'] = action.id.endsWith('-prompts')
      ? 'prompt_cluster'
      : action.id.endsWith('-sources')
        ? 'schema'
        : action.id.endsWith('-competitors')
          ? 'competitor_mapping'
          : 'listing_content';
    const generatedMarkdown = [
      `## ${action.title}`,
      '',
      `Product: ${productName}`,
      `Owner: ${action.owner === 'geo_team' ? 'AIRank' : 'Brand'}`,
      `Priority: ${action.priority}`,
      '',
      '### Prompt drafts',
      ...prompts.map((prompt) => `- ${prompt}`),
      '',
      '### Listing/owned-site copy draft',
      `Title: ${productName}${product?.category ? ` for ${product.category}` : ''} - ${claims.slice(0, 2).join(', ')}`,
      ...claims.slice(0, 4).map((claim) => `- ${claim} with review, listing, or owned-site proof.`),
      ...objections.slice(0, 3).map((objection) => `- Objection to answer: ${objection}.`),
      '',
      '### Product schema draft',
      '```json',
      JSON.stringify(schema, null, 2),
      '```',
      '',
      '### Competitor mapping',
      ...(competitorLines.length ? competitorLines : ['- Add 3-5 competing ASINs/products with URL, price, rating, review count, and positioning angle.']),
    ].join('\n');
    return {
      actionId: action.id,
      productId: action.productId,
      productName: action.productName,
      title: action.title,
      draftType,
      status: draftState?.status || 'draft',
      version: draftState?.version || 1,
      updatedAt: draftState?.updatedAt,
      note: draftState?.note,
      reviewerId: draftState?.reviewerId,
      assignee: draftState?.assignee,
      edited: Boolean(draftState?.markdown),
      summary: 'Draft content generated from catalog claims, objections, competitors, and visibility gaps.',
      markdown: draftState?.markdown || generatedMarkdown,
      history: draftState?.history || [],
    };
  });
  const generatedDraftIds = new Set(generatedDrafts.map((draft) => draft.actionId));
  const savedDrafts = Object.entries(draftStates)
    .filter(([actionId]) => !generatedDraftIds.has(actionId))
    .map(([actionId, draftState]) => buildSavedDraftFromState(actionId, draftState, brand, catalogById))
    .filter((draft): draft is ProductVisibilityDraftItem => Boolean(draft));
  const drafts = [...generatedDrafts, ...savedDrafts].slice(0, 12);
  const generatedAt = new Date().toISOString();
  return {
    brandId: brand.id,
    brandName: brand.name,
    generatedAt,
    summary: `${drafts.length} remediation draft${drafts.length === 1 ? '' : 's'} generated from product visibility actions.`,
    drafts,
    markdown: [`# ${brand.name} Product Visibility Remediation Drafts`, '', `Generated: ${generatedAt}`, '', ...drafts.map((draft) => draft.markdown)].join('\n\n'),
  };
}

function buildProductVisibilityOpportunityMap(
  visibility: ProductVisibilityResult,
  actionPlan: ProductVisibilityActionPlan,
): ProductVisibilityOpportunity[] {
  const actionsByProduct = new Map<string, ProductVisibilityActionItem[]>();
  actionPlan.actions
    .filter((action) => action.productId && action.status !== 'done')
    .forEach((action) => {
      const existing = actionsByProduct.get(action.productId as string) || [];
      existing.push(action);
      actionsByProduct.set(action.productId as string, existing);
    });

  const benchmarkByProduct = new Map(visibility.competitiveBenchmark.products.map((product) => [product.productId, product]));

  return visibility.products
    .map<ProductVisibilityOpportunity>((product) => {
      const productActions = actionsByProduct.get(product.productId) || [];
      const primaryAction = productActions.find((action) => action.priority === 'high') || productActions[0];
      const benchmark = benchmarkByProduct.get(product.productId);
      const competitorGap = benchmark ? Math.max(0, benchmark.competitorSignals - benchmark.brandSignals) : 0;
      const missingEvidence = product.status === 'missing' || product.sourceMatches === 0 || product.promptMatches === 0;
      const score = Math.min(100, Math.round(
        (100 - product.visibilityScore) * 0.45
        + Math.min(competitorGap, 10) * 5
        + (product.sourceMatches === 0 ? 18 : 0)
        + (product.promptMatches === 0 ? 14 : 0)
        + (product.mentionMatches === 0 ? 10 : 0),
      ));
      const type: ProductVisibilityOpportunity['type'] = benchmark?.pressure === 'high' || competitorGap >= 3
        ? 'competitor_pressure'
        : product.sourceMatches === 0
          ? 'source_gap'
          : product.promptMatches === 0
            ? 'prompt_gap'
            : missingEvidence
              ? 'visibility_gap'
              : 'proof_asset';
      const severity: ProductVisibilityOpportunity['severity'] = score >= 70
        ? 'critical'
        : score >= 40
          ? 'warning'
          : 'info';
      const productLabel = product.asin || product.sku || product.name;
      const proofPrompt = `Should I buy ${product.name} or ${benchmark?.leadingCompetitor || 'a competing product'}?`;

      return {
        id: `${product.productId}-${type}`,
        productId: product.productId,
        productName: product.name,
        severity,
        type,
        score,
        opportunity: type === 'competitor_pressure'
          ? `Recover recommendation share for ${productLabel} from ${benchmark?.leadingCompetitor || 'mapped competitors'}.`
          : type === 'source_gap'
            ? `Create citable product proof so AI engines can cite ${productLabel}.`
            : type === 'prompt_gap'
              ? `Add buyer, comparison, review, and objection prompts for ${productLabel}.`
              : type === 'visibility_gap'
                ? `Move ${productLabel} from missing or weak AI visibility into tracked recommendations.`
                : `Turn ${productLabel} into a proof asset for seller-facing pilot reporting.`,
        evidence: [
          `${product.visibilityScore}/100 visibility`,
          `${product.promptMatches} prompt matches`,
          `${product.mentionMatches} mentions`,
          `${product.sourceMatches} sources`,
          benchmark ? `${benchmark.brandSignals} brand vs ${benchmark.competitorSignals} competitor benchmark signals` : '',
        ].filter(Boolean).join('; '),
        recommendedAction: primaryAction?.title || product.gaps[0] || 'Create a product-level prompt, source, and competitor remediation action.',
        owner: primaryAction ? primaryAction.owner : type === 'source_gap' ? 'brand' : 'geo_team',
        expectedImpact: primaryAction?.expectedImpact || 'Converts raw visibility gaps into a measurable SKU-level AI recommendation test.',
        proofPrompt,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function buildProductVisibilityBrandIntelligence(
  brand: Brand,
  visibility: ProductVisibilityResult,
  pilotReadiness: ProductVisibilityPilotReadiness,
  opportunityMap: ProductVisibilityOpportunity[],
): ProductVisibilityBrandIntelligence {
  const opportunityWord = (count: number) => `opportunit${count === 1 ? 'y' : 'ies'}`;
  const criticalOpportunities = opportunityMap.filter((opportunity) => opportunity.severity === 'critical').length;
  const competitorOpportunities = opportunityMap.filter((opportunity) => opportunity.type === 'competitor_pressure').length;
  const sourceOpportunities = opportunityMap.filter((opportunity) => opportunity.type === 'source_gap').length;
  const promptOpportunities = opportunityMap.filter((opportunity) => opportunity.type === 'prompt_gap').length;
  const proofAssetOpportunities = opportunityMap.filter((opportunity) => opportunity.type === 'proof_asset').length;
  const benchmark = visibility.competitiveBenchmark;
  const confidenceScore = Math.max(0, Math.min(100, Math.round(
    pilotReadiness.score * 0.35
    + visibility.samplingReadiness.coverageScore * 0.25
    + visibility.externalBenchmarkReadiness.score * 0.25
    + Math.max(0, 100 - criticalOpportunities * 12) * 0.15,
  )));
  const marketPosition: ProductVisibilityBrandIntelligence['marketPosition'] = pilotReadiness.status === 'blocked'
    ? 'blocked'
    : benchmark.competitorShare >= 55 || competitorOpportunities > 0
      ? 'defensive'
      : criticalOpportunities > 0 || sourceOpportunities > 0
        ? 'contested'
        : visibility.metrics.visibleProducts >= Math.max(1, Math.ceil(visibility.metrics.products * 0.7))
          ? 'ready_to_scale'
          : 'emerging';

  const strategicThemes: ProductVisibilityBrandIntelligence['strategicThemes'] = [
    {
      id: 'recommendation-share',
      label: 'AI recommendation share',
      severity: competitorOpportunities > 0 || benchmark.competitorShare >= 55 ? 'critical' : benchmark.competitorShare > 0 ? 'warning' : 'info',
      evidence: `${benchmark.competitorShare}% competitor signal share; ${competitorOpportunities} ranked competitor-pressure ${opportunityWord(competitorOpportunities)}.`,
      recommendation: competitorOpportunities > 0 || benchmark.competitorShare >= 55
        ? 'Prioritize comparison prompts, objection-led content, and competitor-specific proof assets for high-pressure SKUs.'
        : 'Keep competitor mapping active so share-of-recommendation changes are caught before sales conversations.',
    },
    {
      id: 'citation-proof',
      label: 'Citation and proof base',
      severity: sourceOpportunities > 0 ? 'critical' : proofAssetOpportunities > 0 ? 'warning' : 'info',
      evidence: `${sourceOpportunities} source-gap ${opportunityWord(sourceOpportunities)} and ${visibility.metrics.sourceMatches} source matches across tracked SKUs.`,
      recommendation: sourceOpportunities > 0
        ? 'Publish citable product proof, FAQ, schema, reviews, and owned-site pages before promising enterprise-grade AI visibility.'
        : 'Package the strongest sources into client-facing proof assets and keep citation freshness monitored.',
    },
    {
      id: 'prompt-coverage',
      label: 'Prompt and intent coverage',
      severity: promptOpportunities > 0 || visibility.samplingReadiness.status === 'blocked' ? 'critical' : visibility.samplingReadiness.status === 'partial' ? 'warning' : 'info',
      evidence: `${visibility.samplingReadiness.productPromptCoverage.coveragePercent}% SKU prompt coverage; ${visibility.metrics.sampledProviders} fresh provider${visibility.metrics.sampledProviders === 1 ? '' : 's'}.`,
      recommendation: visibility.samplingReadiness.status !== 'ready'
        ? 'Run buyer, comparison, review, objection, and alternative prompts across at least three fresh AI providers.'
        : 'Expand into category and seasonal prompt clusters to defend recommendation share.',
    },
    {
      id: 'pilot-conversion',
      label: 'Pilot conversion confidence',
      severity: pilotReadiness.status === 'blocked' ? 'critical' : pilotReadiness.status === 'needs_review' ? 'warning' : 'info',
      evidence: `Pilot readiness is ${pilotReadiness.status} at ${pilotReadiness.score}/100; ${criticalOpportunities} critical SKU opportunit${criticalOpportunities === 1 ? 'y' : 'ies'} remain.`,
      recommendation: pilotReadiness.status === 'ready'
        ? 'Move to weekly executive reporting and paid pilot expansion.'
        : 'Clear the blocked launch gates, then use the top SKU opportunities as the first 7-day proof plan.',
    },
  ];

  const boardQuestions = [
    `Where is ${brand.name} losing AI recommendation share against named competitor products?`,
    `Which product proof assets must exist before ChatGPT, Gemini, Claude, and Perplexity can cite ${brand.name} confidently?`,
    'Which SKU gap can be improved and measured within the first 7 days of a brand pilot?',
    'What evidence would make the brand comfortable moving from controlled pilot to enterprise rollout?',
  ];
  const executiveActions = [
    opportunityMap[0] ? `Attack the top opportunity first: ${opportunityMap[0].recommendedAction}` : 'Import products and run provider sampling to create the first opportunity map.',
    sourceOpportunities > 0 ? 'Publish or queue citation-ready product proof for every source-gap SKU.' : 'Package current proof assets into a client-facing visibility story.',
    competitorOpportunities > 0 ? 'Create competitor battlecards from high-pressure benchmark gaps.' : 'Keep competitor mapping current for priority SKUs.',
    pilotReadiness.status === 'blocked' ? 'Do not pitch launch-ready status until pilot blockers are cleared or explicitly accepted as pilot risk.' : 'Use the readiness score and opportunity map as the weekly pilot operating rhythm.',
  ];

  return {
    marketPosition,
    confidenceScore,
    summary: `${brand.name} is ${marketPosition.replace(/_/g, ' ')} for AI visibility expansion with ${confidenceScore}/100 confidence; ${criticalOpportunities} critical SKU gap${criticalOpportunities === 1 ? '' : 's'} should be resolved first.`,
    strategicThemes,
    boardQuestions,
    executiveActions,
  };
}

function buildProductVisibilitySkuLaunchMatrix(
  catalog: ProductCatalogItem[],
  visibility: ProductVisibilityResult,
  actionPlan: ProductVisibilityActionPlan,
): ProductVisibilitySkuLaunchMatrix {
  const visibilityByProduct = new Map<string, ProductVisibilityItem>();
  for (const product of visibility.products) {
    visibilityByProduct.set(product.productId, product);
    visibilityByProduct.set(product.name, product);
    if (product.asin) visibilityByProduct.set(product.asin, product);
    if (product.sku) visibilityByProduct.set(product.sku, product);
  }
  const openActionsByProduct = new Map<string, ProductVisibilityActionItem[]>();
  for (const action of actionPlan.actions) {
    if (!action.productId || action.status === 'done') continue;
    openActionsByProduct.set(action.productId, [...(openActionsByProduct.get(action.productId) || []), action]);
  }

  const rows = catalog.slice(0, 24).map<ProductVisibilitySkuLaunchMatrix['rows'][number]>((product) => {
    const productId = product.id || product.asin || product.sku || product.name;
    const visibilityProduct = visibilityByProduct.get(product.id)
      || visibilityByProduct.get(productId)
      || visibilityByProduct.get(product.name);
    const promptMatches = visibilityProduct?.promptMatches || 0;
    const mentionMatches = visibilityProduct?.mentionMatches || 0;
    const sourceMatches = visibilityProduct?.sourceMatches || 0;
    const competitorProducts = product.competitors?.length || visibilityProduct?.competitorProducts || 0;
    const claims = product.claims?.length || 0;
    const objections = product.objections?.length || 0;
    const hasIdentifier = Boolean(product.asin || product.sku);
    const hasUrl = Boolean(product.productUrl);
    const openActions = openActionsByProduct.get(product.id) || openActionsByProduct.get(productId) || [];
    const blockers = [
      !hasIdentifier ? 'missing ASIN/SKU' : '',
      !hasUrl ? 'missing product URL' : '',
      competitorProducts < 1 ? 'no competitor product' : '',
      claims < 2 ? 'needs claims' : '',
      objections < 1 ? 'needs objection' : '',
      promptMatches < 3 ? 'prompt gap' : '',
      mentionMatches < 1 ? 'no AI mention' : '',
      sourceMatches < 1 ? 'no source proof' : '',
      openActions.length > 0 ? `${openActions.length} open action${openActions.length === 1 ? '' : 's'}` : '',
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
    const status: ProductVisibilitySkuLaunchMatrix['rows'][number]['status'] = score >= 78 ? 'ready' : score >= 45 ? 'partial' : 'blocked';
    const nextAction = blockers[0]
      ? blockers[0].replace(/^no /, 'add ').replace(/^missing /, 'add ').replace(/^needs /, 'add ')
      : 'keep sampling and proof fresh';

    return {
      productId,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      category: product.category || product.marketplace || 'uncategorized',
      status,
      score,
      evidence: {
        prompts: promptMatches,
        mentions: mentionMatches,
        sources: sourceMatches,
        competitors: competitorProducts,
        claims,
        objections,
        openActions: openActions.length,
      },
      blockers,
      nextAction,
    };
  });

  const ready = rows.filter((row) => row.status === 'ready').length;
  const partial = rows.filter((row) => row.status === 'partial').length;
  const blocked = rows.length - ready - partial;
  return { ready, partial, blocked, rows };
}

function buildProductVisibilityMarketplaceListingMatrix(
  catalog: ProductCatalogItem[],
  visibility: ProductVisibilityResult,
): ProductVisibilityMarketplaceListingMatrix {
  const visibilityByProduct = new Map<string, ProductVisibilityItem>();
  for (const product of visibility.products) {
    visibilityByProduct.set(product.productId, product);
    visibilityByProduct.set(product.name, product);
    if (product.asin) visibilityByProduct.set(product.asin, product);
    if (product.sku) visibilityByProduct.set(product.sku, product);
  }

  const rows = catalog.slice(0, 24).map<ProductVisibilityMarketplaceListingMatrix['rows'][number]>((product) => {
    const productId = product.id || product.asin || product.sku || product.name;
    const visibilityProduct = visibilityByProduct.get(product.id)
      || visibilityByProduct.get(productId)
      || visibilityByProduct.get(product.name);
    const identifier = Boolean(product.asin || product.sku);
    const productUrl = Boolean(product.productUrl);
    const priceBand = Boolean(product.priceBand);
    const rating = Number(product.rating || 0) > 0;
    const reviews = Number(product.reviewCount || 0) > 0;
    const claims = product.claims?.length || 0;
    const objections = product.objections?.length || 0;
    const competitors = product.competitors?.length || visibilityProduct?.competitorProducts || 0;
    const sourceProof = visibilityProduct?.sourceMatches || 0;
    const blockers = [
      !identifier ? 'missing ASIN/SKU' : '',
      !productUrl ? 'missing product URL' : '',
      !priceBand ? 'missing price band' : '',
      !rating ? 'missing rating proof' : '',
      !reviews ? 'missing review count' : '',
      claims < 2 ? 'needs 2 claims' : '',
      objections < 1 ? 'needs buyer objection' : '',
      competitors < 1 ? 'needs competitor ASIN/product' : '',
      sourceProof < 1 ? 'needs citable source proof' : '',
    ].filter(Boolean);
    const earned = [
      identifier ? 12 : 0,
      productUrl ? 12 : 0,
      priceBand ? 10 : 0,
      rating ? 10 : 0,
      reviews ? 10 : 0,
      Math.min(16, claims * 8),
      objections >= 1 ? 10 : 0,
      Math.min(10, competitors * 5),
      sourceProof > 0 ? 10 : 0,
    ].reduce((sum, value) => sum + value, 0);
    const score = Math.max(0, Math.min(100, Math.round(earned)));
    const status: ProductVisibilityMarketplaceListingMatrix['rows'][number]['status'] = score >= 80 ? 'ready' : score >= 50 ? 'partial' : 'blocked';
    const nextAction = blockers[0]
      ? blockers[0].replace(/^missing /, 'add ').replace(/^needs /, 'add ')
      : 'keep marketplace proof fresh';

    return {
      productId,
      name: product.name,
      asin: product.asin,
      sku: product.sku,
      marketplace: product.marketplace || null,
      score,
      status,
      signals: {
        identifier,
        productUrl,
        priceBand,
        rating,
        reviews,
        claims,
        objections,
        competitors,
        sourceProof,
      },
      blockers,
      nextAction,
    };
  });

  const ready = rows.filter((row) => row.status === 'ready').length;
  const partial = rows.filter((row) => row.status === 'partial').length;
  const blocked = rows.length - ready - partial;
  const averageScore = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
  return { ready, partial, blocked, averageScore, rows };
}

function buildProductVisibilityCategoryIntelligence(
  catalog: ProductCatalogItem[],
  opportunityMap: ProductVisibilityOpportunity[],
): ProductVisibilityCategoryIntelligence[] {
  const opportunitiesByProduct = new Map(opportunityMap.map((opportunity) => [opportunity.productId, opportunity]));
  const grouped = new Map<string, ProductCatalogItem[]>();
  catalog.forEach((product) => {
    const category = product.category || product.marketplace || 'uncategorized';
    grouped.set(category, [...(grouped.get(category) || []), product]);
  });

  return Array.from(grouped.entries()).map(([category, products]) => {
    const opportunities = products
      .map((product) => opportunitiesByProduct.get(product.id))
      .filter((opportunity): opportunity is ProductVisibilityOpportunity => Boolean(opportunity));
    const critical = opportunities.filter((opportunity) => opportunity.severity === 'critical').length;
    const warning = opportunities.filter((opportunity) => opportunity.severity === 'warning').length;
    const averageOpportunity = opportunities.length
      ? Math.round(opportunities.reduce((sum, opportunity) => sum + opportunity.score, 0) / opportunities.length)
      : 0;
    const priority: ProductVisibilityCategoryIntelligence['priority'] = critical > 0
      ? 'critical'
      : warning > 0 || averageOpportunity >= 55
        ? 'high'
        : averageOpportunity >= 35
          ? 'medium'
          : 'low';
    const competitors = Array.from(new Set(products.flatMap((product) => (product.competitors || [])
      .map((competitor) => competitor.name || competitor.asin || competitor.url || '')
      .filter(Boolean)))).slice(0, 8);
    const objections = Array.from(new Set(products.flatMap((product) => product.objections || []))).slice(0, 6);
    const claims = Array.from(new Set(products.flatMap((product) => product.claims || []))).slice(0, 6);
    const buyerIntents = Array.from(new Set([
      `best ${category} for Indian buyers`,
      `${category} comparison with alternatives`,
      `${category} reviews and objections`,
      `${category} price value and trust proof`,
      ...objections.map((objection) => `${category}: ${objection}`),
    ])).slice(0, 6);
    const proofGaps = [
      competitors.length < products.length ? 'Add named competitor products for every priority SKU.' : '',
      claims.length < products.length ? 'Add proof-backed product claims for every SKU.' : '',
      objections.length < products.length ? 'Add buyer objections and rebuttals for every SKU.' : '',
      opportunities.some((opportunity) => opportunity.type === 'source_gap') ? 'Publish citable owned-site proof and product schema for this category.' : '',
      opportunities.some((opportunity) => opportunity.type === 'prompt_gap') ? 'Run buyer, comparison, review, and objection prompts for this category.' : '',
    ].filter(Boolean);
    const topOpportunity = opportunities.sort((a, b) => b.score - a.score)[0];

    return {
      id: slugId(category),
      category,
      priority,
      score: averageOpportunity,
      products: products.map((product) => product.name).slice(0, 8),
      competitors,
      buyerIntents,
      proofGaps: proofGaps.length ? proofGaps : ['Keep category prompts, competitors, and proof assets fresh.'],
      recommendedCampaign: `Build a ${category} AI visibility campaign covering buyer prompts, competitor comparisons, citable proof, and post-publish measurement.`,
      firstAction: topOpportunity?.recommendedAction || `Create product prompts and proof assets for ${products[0]?.name || category}.`,
    };
  }).sort((a, b) => b.score - a.score || a.category.localeCompare(b.category)).slice(0, 6);
}

function buildProductVisibilityCreativeBriefs(
  catalog: ProductCatalogItem[],
  categoryIntelligence: ProductVisibilityCategoryIntelligence[],
): ProductVisibilityCreativeBrief[] {
  const catalogByName = new Map(catalog.map((product) => [product.name, product]));
  return categoryIntelligence.slice(0, 3).flatMap((category) => {
    const product = category.products.map((name) => catalogByName.get(name)).find(Boolean);
    const productName = product?.name || category.products[0] || category.category;
    const claims = product?.claims?.length ? product.claims : ['clear category benefit', 'trustworthy product proof'];
    const objections = product?.objections?.length ? product.objections : ['buyer trust concern', 'unclear comparison value'];
    const competitors = category.competitors.slice(0, 3);
    const proofPoints = [
      ...claims.slice(0, 3),
      product?.rating ? `${product.rating}/5 rating signal` : '',
      product?.reviewCount ? `${product.reviewCount} review signal` : '',
      product?.priceBand ? `${product.priceBand} price band` : '',
    ].filter(Boolean).slice(0, 5);
    const requiredInputs = [
      product?.productUrl ? '' : 'Product URL or PDP screenshot',
      claims.length >= 2 ? '' : 'At least two proof-backed claims',
      objections.length >= 1 ? '' : 'Primary buyer objection',
      competitors.length >= 2 ? '' : 'Two named competitor products',
      'Brand logo and product image pack',
    ].filter(Boolean);
    const status: ProductVisibilityCreativeBrief['status'] = requiredInputs.length <= 1 ? 'draft_ready' : 'needs_inputs';
    const audience = category.buyerIntents[0] || `Indian buyers comparing ${category.category}`;
    const message = `${productName} should be positioned around ${claims.slice(0, 2).join(' and ') || 'trusted category proof'} while answering ${objections[0] || 'the main buying objection'}.`;

    const mockupBrief: ProductVisibilityCreativeBrief = {
      id: `${category.id}-brand-mockup`,
      category: category.category,
      productName,
      format: 'brand_mockup',
      status,
      objective: `Create a product proof mockup for ${category.category} buyers that addresses the top AI visibility proof gap.`,
      audience,
      message,
      proofPoints,
      visualDirection: `Show ${productName} beside 2-3 proof badges, a short comparison cue, and one objection-answering headline.`,
      scriptOutline: [
        `Headline: why ${productName} belongs in ${category.category} recommendations.`,
        `Proof row: ${proofPoints.slice(0, 3).join(' | ') || 'claims, reviews, and trust proof'}.`,
        `Comparison cue: ${competitors.length ? `differentiate against ${competitors.join(', ')}` : 'compare against common alternatives'}.`,
      ],
      requiredInputs,
    };
    const videoBrief: ProductVisibilityCreativeBrief = {
      id: `${category.id}-video-ad`,
      category: category.category,
      productName,
      format: 'video_ad',
      status,
      objective: `Create a 15-second product video ad that answers the buyer intent: ${audience}.`,
      audience,
      message,
      proofPoints,
      visualDirection: `Fast product close-up, buyer problem text overlay, proof card, competitor-safe comparison frame, and final CTA.`,
      scriptOutline: [
        `0-3s: name the buyer problem in ${category.category}.`,
        `3-7s: show ${productName} and the strongest proof point.`,
        `7-12s: answer "${objections[0] || 'why trust this product'}" with evidence.`,
        '12-15s: CTA to product page or marketplace listing.',
      ],
      requiredInputs,
    };
    return [mockupBrief, videoBrief];
  }).slice(0, 6);
}

function buildProductVisibilityCompetitorBattlecards(
  catalog: ProductCatalogItem[],
  categoryIntelligence: ProductVisibilityCategoryIntelligence[],
): ProductVisibilityCompetitorBattlecard[] {
  const categoryByName = new Map(categoryIntelligence.map((category) => [category.category, category]));
  return catalog.flatMap((product) => {
    const category = product.category || product.marketplace || 'uncategorized';
    const categoryRollup = categoryByName.get(category);
    const claims = product.claims?.length ? product.claims : ['clear product benefit', 'trust proof'];
    const objections = product.objections?.length ? product.objections : ['buyer trust concern'];
    const threatLevel: ProductVisibilityCompetitorBattlecard['threatLevel'] = categoryRollup?.priority === 'critical'
      ? 'high'
      : categoryRollup?.priority === 'high'
        ? 'medium'
        : 'low';

    return (product.competitors || []).slice(0, 3).map<ProductVisibilityCompetitorBattlecard>((competitor) => {
      const competitorName = competitor.name || competitor.asin || competitor.url || 'Competing product';
      return {
        id: `${product.id}-${slugId(competitorName)}-battlecard`,
        productName: product.name,
        category,
        competitorName,
        threatLevel,
        comparisonAngle: `Position ${product.name} against ${competitorName} on ${claims.slice(0, 2).join(' and ') || 'proof-backed fit'}.`,
        ourProof: [
          ...claims.slice(0, 3),
          product.rating ? `${product.rating}/5 rating signal` : '',
          product.reviewCount ? `${product.reviewCount} review signal` : '',
          product.priceBand ? `${product.priceBand} price band` : '',
        ].filter(Boolean).slice(0, 5),
        objectionToAnswer: objections[0] || 'buyer trust concern',
        recommendedContent: `Create FAQ, comparison copy, schema, and source proof that explains when ${product.name} is a better fit than ${competitorName}.`,
        testPrompt: `Which should I buy in India: ${product.name} or ${competitorName}? Compare trust, price, reviews, and use-case fit.`,
      };
    });
  }).sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.threatLevel] - order[a.threatLevel] || a.category.localeCompare(b.category);
  }).slice(0, 10);
}

export async function buildProductVisibilityClientReport(brand: Brand): Promise<ProductVisibilityClientReport> {
  const [readiness, visibility, history, actionPlan, draftPack, publishQueue, catalog] = await Promise.all([
    buildProductReadiness(brand),
    buildProductVisibility(brand),
    getProductVisibilityHistory(brand.id),
    buildProductVisibilityActionPlan(brand),
    buildProductVisibilityDraftPack(brand),
    getProductVisibilityPublishQueue(brand),
    getProductCatalog(brand.id),
  ]);

  const generatedAt = new Date().toISOString();
  const trend = buildProductVisibilityTrend(history);
  const approvedDrafts = draftPack.drafts.filter((draft) => draft.status === 'approved').length;
  const publishedArtifacts = publishQueue.queue.filter((item) => item.status === 'published').length;
  const queuedArtifacts = publishQueue.queue.filter((item) => item.status === 'queued').length;
  const postPublishJobs = publishQueue.queue.reduce((sum, item) => sum + (item.measurement?.jobIds.length || 0), 0);
  const postPublishPrompts = publishQueue.queue.reduce((sum, item) => sum + (item.measurement?.promptIds.length || 0), 0);
  const highPriorityActions = actionPlan.actions.filter((action) => action.priority === 'high' && action.status !== 'done').length;
  const benchmark = visibility.competitiveBenchmark;
  const samplingReadiness = visibility.samplingReadiness;
  const externalBenchmarkReadiness = visibility.externalBenchmarkReadiness;
  const pilotReadiness = buildPilotReadiness(readiness, visibility, trend, actionPlan, draftPack, publishQueue);
  const opportunityMap = buildProductVisibilityOpportunityMap(visibility, actionPlan);
  const skuLaunchMatrix = buildProductVisibilitySkuLaunchMatrix(catalog, visibility, actionPlan);
  const marketplaceListingMatrix = buildProductVisibilityMarketplaceListingMatrix(catalog, visibility);
  const brandIntelligence = buildProductVisibilityBrandIntelligence(brand, visibility, pilotReadiness, opportunityMap);
  const categoryIntelligence = buildProductVisibilityCategoryIntelligence(catalog, opportunityMap);
  const creativeBriefs = buildProductVisibilityCreativeBriefs(catalog, categoryIntelligence);
  const competitorBattlecards = buildProductVisibilityCompetitorBattlecards(catalog, categoryIntelligence);
  const launchVerdict: ProductVisibilityClientReport['launchVerdict'] = pilotReadiness.status === 'blocked'
    ? 'blocked'
    : pilotReadiness.status === 'needs_review' || visibility.metrics.missingProducts > 0 || highPriorityActions > 0 || approvedDrafts === 0 || benchmark.competitorShare >= 55 || marketplaceListingMatrix.blocked > 0
      ? 'needs_review'
      : 'launch_ready';
  const verdictCopy = launchVerdict === 'launch_ready'
    ? 'Launch-ready for a controlled brand/seller pilot with weekly visibility snapshots.'
    : launchVerdict === 'needs_review'
      ? 'Needs review before seller-facing launch: product gaps are measurable, but remediation and artifact proof are not complete.'
      : 'Blocked for launch: product catalog or provider sampling coverage is not sufficient for a seller-facing promise.';

  const highlights = [
    `${visibility.metrics.visibleProducts}/${visibility.metrics.products} products have strong AI visibility evidence.`,
    `${visibility.metrics.sampledProviders} provider${visibility.metrics.sampledProviders === 1 ? '' : 's'} are fresh; ${visibility.metrics.notSampledProviders} are not sampled.`,
    `Brand intelligence: ${brandIntelligence.marketPosition.replace(/_/g, ' ')} (${brandIntelligence.confidenceScore}/100). ${brandIntelligence.summary}`,
    categoryIntelligence.length ? `Top category campaign: ${categoryIntelligence[0].category} (${categoryIntelligence[0].priority}, ${categoryIntelligence[0].score}/100). ${categoryIntelligence[0].firstAction}` : 'No category campaign map is available until products are imported.',
    creativeBriefs.length ? `${creativeBriefs.length} creative brief${creativeBriefs.length === 1 ? '' : 's'} are ready for mockup/video generation planning.` : 'No creative briefs are available until category campaigns are generated.',
    competitorBattlecards.length ? `${competitorBattlecards.length} competitor battlecard${competitorBattlecards.length === 1 ? '' : 's'} are ready for comparison prompts and proof planning.` : 'No competitor battlecards are available until competitor products are mapped.',
    `Pilot readiness: ${pilotReadiness.status} (${pilotReadiness.score}/100). ${pilotReadiness.summary}`,
    `Marketplace listing proof: ${marketplaceListingMatrix.averageScore}/100 average with ${marketplaceListingMatrix.ready} ready, ${marketplaceListingMatrix.partial} partial, and ${marketplaceListingMatrix.blocked} blocked SKU listing${marketplaceListingMatrix.blocked === 1 ? '' : 's'}.`,
    opportunityMap.length ? `Top AI visibility opportunity: ${opportunityMap[0].opportunity}` : 'No SKU-level opportunity map is available until products are imported.',
    `Sampling readiness: ${samplingReadiness.status} (${samplingReadiness.coverageScore}/100). ${samplingReadiness.summary}`,
    `External benchmark readiness: ${externalBenchmarkReadiness.status} (${externalBenchmarkReadiness.score}/100). ${externalBenchmarkReadiness.summary}`,
    benchmark.summary,
    trend.hasComparison ? trend.summary : 'No before/after trend yet; save at least two product visibility snapshots.',
    postPublishJobs > 0 ? `${postPublishJobs} post-publish sampling job${postPublishJobs === 1 ? '' : 's'} queued for proof of impact.` : 'No post-publish sampling jobs are queued yet.',
    `${publishedArtifacts} published artifact${publishedArtifacts === 1 ? '' : 's'} and ${queuedArtifacts} queued artifact${queuedArtifacts === 1 ? '' : 's'} are attached to the remediation workflow.`,
  ];
  const risks = [
    visibility.metrics.missingProducts > 0 ? `${visibility.metrics.missingProducts} product${visibility.metrics.missingProducts === 1 ? '' : 's'} are missing exact AI visibility evidence.` : '',
    pilotReadiness.status !== 'ready' ? pilotReadiness.summary : '',
    visibility.metrics.notSampledProviders > 0 ? `${visibility.metrics.notSampledProviders} major AI provider${visibility.metrics.notSampledProviders === 1 ? '' : 's'} have not been sampled for product prompts.` : '',
    samplingReadiness.status !== 'ready' ? samplingReadiness.summary : '',
    externalBenchmarkReadiness.status !== 'ready' ? externalBenchmarkReadiness.summary : '',
    highPriorityActions > 0 ? `${highPriorityActions} high-priority product action${highPriorityActions === 1 ? '' : 's'} remain open.` : '',
    benchmark.competitorShare >= 55 ? `Competitor products own ${benchmark.competitorShare}% of detected benchmark signals.` : '',
    marketplaceListingMatrix.blocked > 0 ? `${marketplaceListingMatrix.blocked} SKU listing${marketplaceListingMatrix.blocked === 1 ? '' : 's'} lack marketplace proof such as price, rating, reviews, objections, competitors, or source evidence.` : '',
    approvedDrafts === 0 ? 'No remediation draft has been approved for client delivery.' : '',
  ].filter(Boolean);
  const nextActions = actionPlan.actions
    .filter((action) => action.status !== 'done')
    .slice(0, 5)
    .map((action) => `${action.priority.toUpperCase()}: ${action.title} (${action.owner === 'geo_team' ? 'AIRank' : 'Brand'})`);
  const reportNextActions = [...pilotReadiness.nextActions, ...externalBenchmarkReadiness.nextActions, ...samplingReadiness.nextActions, ...nextActions].slice(0, 10);
  const opportunityActions = opportunityMap
    .slice(0, 3)
    .map((opportunity) => `${opportunity.severity.toUpperCase()}: ${opportunity.productName} - ${opportunity.recommendedAction}`);
  const prioritizedNextActions = [...opportunityActions, ...reportNextActions].slice(0, 10);
  const artifacts = publishQueue.queue.map((item) => ({
    title: item.title,
    channel: item.channel,
    status: item.status,
    label: item.artifact?.label,
    url: item.artifact?.url,
    reviewerId: item.reviewerId,
    assignee: item.assignee,
  }));

  const metrics = {
    products: visibility.metrics.products,
    visibleProducts: visibility.metrics.visibleProducts,
    weakProducts: visibility.metrics.weakProducts,
    missingProducts: visibility.metrics.missingProducts,
    sampledProviders: visibility.metrics.sampledProviders,
    notSampledProviders: visibility.metrics.notSampledProviders,
    staleProviders: visibility.metrics.staleProviders,
    highPriorityActions,
    approvedDrafts,
    publishedArtifacts,
    queuedArtifacts,
    competitorShare: benchmark.competitorShare,
    topThreats: benchmark.topThreats.length,
    postPublishJobs,
    postPublishPrompts,
    marketplaceListingAverageScore: marketplaceListingMatrix.averageScore,
    marketplaceListingReady: marketplaceListingMatrix.ready,
    marketplaceListingPartial: marketplaceListingMatrix.partial,
    marketplaceListingBlocked: marketplaceListingMatrix.blocked,
  };
  const filenameBase = `${slugId(brand.name)}-product-visibility-client-report-${generatedAt.slice(0, 10)}`;
  const markdown = [
    `# ${brand.name} Product Visibility Client Report`,
    '',
    `Generated: ${generatedAt}`,
    `Verdict: ${launchVerdict.replace('_', ' ')}`,
    '',
    `## Executive summary`,
    '',
    verdictCopy,
    '',
    readiness.summary,
    '',
    `## Scorecard`,
    '',
    `- Products tracked: ${metrics.products}`,
    `- Strong visibility: ${metrics.visibleProducts}`,
    `- Weak visibility: ${metrics.weakProducts}`,
    `- Missing visibility: ${metrics.missingProducts}`,
    `- Fresh AI providers: ${metrics.sampledProviders}`,
    `- Not sampled providers: ${metrics.notSampledProviders}`,
    `- Stale or failed providers: ${metrics.staleProviders}`,
    `- Pilot readiness: ${pilotReadiness.status} (${pilotReadiness.score}/100)`,
    `- SKU launch matrix: ${skuLaunchMatrix.ready} ready, ${skuLaunchMatrix.partial} partial, ${skuLaunchMatrix.blocked} blocked`,
    `- Marketplace listing proof: ${marketplaceListingMatrix.averageScore}/100 average, ${marketplaceListingMatrix.ready} ready, ${marketplaceListingMatrix.partial} partial, ${marketplaceListingMatrix.blocked} blocked`,
    `- Sampling readiness: ${samplingReadiness.status} (${samplingReadiness.coverageScore}/100)`,
    `- External benchmark readiness: ${externalBenchmarkReadiness.status} (${externalBenchmarkReadiness.score}/100)`,
    `- High priority open actions: ${metrics.highPriorityActions}`,
    `- Approved drafts: ${metrics.approvedDrafts}`,
    `- Published artifacts: ${metrics.publishedArtifacts}`,
    `- Competitor signal share: ${metrics.competitorShare}%`,
    `- Top competitor product threats: ${metrics.topThreats}`,
    `- Post-publish sampling jobs: ${metrics.postPublishJobs}`,
    `- Post-publish prompts: ${metrics.postPublishPrompts}`,
    '',
    `## Highlights`,
    '',
    ...highlights.map((highlight) => `- ${highlight}`),
    '',
    `## Launch risks`,
    '',
    ...(risks.length ? risks.map((risk) => `- ${risk}`) : ['- No blocking product visibility risks detected in the current local dataset.']),
    '',
    `## Brand intelligence`,
    '',
    brandIntelligence.summary,
    '',
    `- Market position: ${brandIntelligence.marketPosition.replace(/_/g, ' ')}`,
    `- Confidence score: ${brandIntelligence.confidenceScore}/100`,
    '',
    `### Strategic themes`,
    '',
    ...brandIntelligence.strategicThemes.flatMap((theme) => [
      `- ${theme.severity.toUpperCase()}: ${theme.label} - ${theme.evidence}`,
      `  Recommendation: ${theme.recommendation}`,
    ]),
    '',
    `### Board questions`,
    '',
    ...brandIntelligence.boardQuestions.map((question) => `- ${question}`),
    '',
    `### Executive actions`,
    '',
    ...brandIntelligence.executiveActions.map((action) => `- ${action}`),
    '',
    `## SKU launch matrix`,
    '',
    ...(skuLaunchMatrix.rows.length
      ? skuLaunchMatrix.rows.slice(0, 12).flatMap((row) => [
        `### ${row.name}`,
        '',
        `- Status: ${row.status} (${row.score}/100)`,
        `- Identifier: ${[row.asin, row.sku].filter(Boolean).join(' / ') || 'missing ASIN/SKU'}`,
        `- Category: ${row.category}`,
        `- Evidence: ${row.evidence.prompts} prompts, ${row.evidence.mentions} mentions, ${row.evidence.sources} sources, ${row.evidence.competitors} competitor products, ${row.evidence.claims} claims, ${row.evidence.objections} objections, ${row.evidence.openActions} open actions`,
        `- Blockers: ${row.blockers.length ? row.blockers.join(', ') : 'none'}`,
        `- Next action: ${row.nextAction}`,
        '',
      ])
      : ['- Import priority SKUs/ASINs to generate the seller launch matrix.', '']),
    `## Marketplace listing proof matrix`,
    '',
    ...(marketplaceListingMatrix.rows.length
      ? marketplaceListingMatrix.rows.slice(0, 12).flatMap((row) => [
        `### ${row.name}`,
        '',
        `- Status: ${row.status} (${row.score}/100)`,
        `- Marketplace: ${row.marketplace || 'not set'}`,
        `- Identifier: ${[row.asin, row.sku].filter(Boolean).join(' / ') || 'missing ASIN/SKU'}`,
        `- Listing signals: URL ${row.signals.productUrl ? 'yes' : 'no'}, price ${row.signals.priceBand ? 'yes' : 'no'}, rating ${row.signals.rating ? 'yes' : 'no'}, reviews ${row.signals.reviews ? 'yes' : 'no'}, claims ${row.signals.claims}, objections ${row.signals.objections}, competitors ${row.signals.competitors}, sources ${row.signals.sourceProof}`,
        `- Blockers: ${row.blockers.length ? row.blockers.join(', ') : 'none'}`,
        `- Next action: ${row.nextAction}`,
        '',
      ])
      : ['- Import priority SKUs/ASINs to score marketplace listing proof.', '']),
    `## Category intelligence`,
    '',
    ...(categoryIntelligence.length
      ? categoryIntelligence.flatMap((category) => [
        `### ${category.category}`,
        '',
        `- Priority: ${category.priority}`,
        `- Opportunity score: ${category.score}/100`,
        `- Products: ${category.products.join(', ') || 'No products mapped'}`,
        `- Competitors: ${category.competitors.join(', ') || 'No competitors mapped'}`,
        `- Recommended campaign: ${category.recommendedCampaign}`,
        `- First action: ${category.firstAction}`,
        '',
        'Buyer intents:',
        ...category.buyerIntents.map((intent) => `- ${intent}`),
        '',
        'Proof gaps:',
        ...category.proofGaps.map((gap) => `- ${gap}`),
        '',
      ])
      : ['- Import products with categories, competitors, claims, and objections to create category-level AI visibility campaigns.', '']),
    `## Creative briefs`,
    '',
    ...(creativeBriefs.length
      ? creativeBriefs.flatMap((brief) => [
        `### ${brief.productName} - ${brief.format.replace(/_/g, ' ')}`,
        '',
        `- Category: ${brief.category}`,
        `- Status: ${brief.status.replace(/_/g, ' ')}`,
        `- Objective: ${brief.objective}`,
        `- Audience: ${brief.audience}`,
        `- Message: ${brief.message}`,
        `- Visual direction: ${brief.visualDirection}`,
        '',
        'Proof points:',
        ...(brief.proofPoints.length ? brief.proofPoints.map((proof) => `- ${proof}`) : ['- Add proof points before generation.']),
        '',
        'Script outline:',
        ...brief.scriptOutline.map((step) => `- ${step}`),
        '',
        'Required inputs:',
        ...(brief.requiredInputs.length ? brief.requiredInputs.map((input) => `- ${input}`) : ['- No additional required inputs detected for a first draft.']),
        '',
      ])
      : ['- Generate category campaigns before creating brand mockup or video ad briefs.', '']),
    `## Competitor battlecards`,
    '',
    ...(competitorBattlecards.length
      ? competitorBattlecards.flatMap((battlecard) => [
        `### ${battlecard.productName} vs ${battlecard.competitorName}`,
        '',
        `- Category: ${battlecard.category}`,
        `- Threat level: ${battlecard.threatLevel}`,
        `- Comparison angle: ${battlecard.comparisonAngle}`,
        `- Objection to answer: ${battlecard.objectionToAnswer}`,
        `- Recommended content: ${battlecard.recommendedContent}`,
        `- Test prompt: ${battlecard.testPrompt}`,
        '',
        'Our proof:',
        ...(battlecard.ourProof.length ? battlecard.ourProof.map((proof) => `- ${proof}`) : ['- Add product proof before battlecard use.']),
        '',
      ])
      : ['- Add competitor products to the catalog to create comparison battlecards.', '']),
    `## AI visibility opportunity map`,
    '',
    ...(opportunityMap.length
      ? opportunityMap.slice(0, 8).flatMap((opportunity, index) => [
        `### ${index + 1}. ${opportunity.productName}`,
        '',
        `- Severity: ${opportunity.severity}`,
        `- Type: ${opportunity.type.replace(/_/g, ' ')}`,
        `- Opportunity score: ${opportunity.score}/100`,
        `- Opportunity: ${opportunity.opportunity}`,
        `- Evidence: ${opportunity.evidence}`,
        `- Recommended action: ${opportunity.recommendedAction}`,
        `- Owner: ${opportunity.owner.replace('_', ' ')}`,
        `- Expected impact: ${opportunity.expectedImpact}`,
        `- Proof prompt: ${opportunity.proofPrompt}`,
        '',
      ])
      : ['- Import products and run provider sampling to generate ranked SKU-level AI visibility opportunities.', '']),
    `## Pilot launch readiness`,
    '',
    pilotReadiness.summary,
    '',
    ...pilotReadiness.checks.map((check) => `- ${check.status.toUpperCase()}: ${check.label} (${check.score}/100) - ${check.evidence}`),
    '',
    `## Pilot launch plan`,
    '',
    ...pilotReadiness.launchPlan.flatMap((phase) => [
      `### ${phase.title}`,
      '',
      `- Phase: ${phase.phase.replace(/_/g, ' ')}`,
      `- Owner: ${phase.owner.replace('_', ' ')}`,
      ...phase.actions.map((action) => `- Action: ${action}`),
      ...phase.exitCriteria.map((criterion) => `- Exit: ${criterion}`),
      '',
    ]),
    `## Sampling readiness`,
    '',
    samplingReadiness.summary,
    '',
    ...samplingReadiness.evidence.map((item) => `- ${item}`),
    '',
    `## External benchmark readiness`,
    '',
    externalBenchmarkReadiness.summary,
    '',
    ...externalBenchmarkReadiness.checks.map((check) => `- ${check.status.toUpperCase()}: ${check.label} (${check.score}/100) - ${check.evidence}`),
    '',
    `## Next actions`,
    '',
    ...(prioritizedNextActions.length ? prioritizedNextActions.map((action) => `- ${action}`) : ['- Keep weekly product visibility snapshots running and monitor competitor movement.']),
    '',
    `## Competitive benchmark`,
    '',
    benchmark.summary,
    '',
    ...(benchmark.topThreats.length
      ? benchmark.topThreats.slice(0, 5).map((threat) => `- ${threat.threatLevel.toUpperCase()}: ${threat.name}${threat.asin ? ` (${threat.asin})` : ''} against ${threat.productName}; ${threat.signalCount} signal${threat.signalCount === 1 ? '' : 's'}`)
      : ['- No competitor product threats detected in the current local dataset.']),
    '',
    `## Published and queued artifacts`,
    '',
    ...(artifacts.length
      ? artifacts.map((artifact) => `- ${artifact.status.toUpperCase()} ${artifact.channel.replace('_', ' ')}: ${artifact.label || artifact.title}${artifact.url ? ` (${artifact.url})` : ''}${artifact.assignee ? ` | Assignee: ${artifact.assignee}` : ''}${artifact.reviewerId ? ` | Reviewer: ${artifact.reviewerId}` : ''}`)
      : ['- No approved draft artifacts have been queued or published yet.']),
    '',
    `## Post-publish measurement`,
    '',
    ...(publishQueue.queue.some((item) => item.measurement)
      ? publishQueue.queue.filter((item) => item.measurement).map((item) => `- ${item.title}: ${item.measurement?.summary || 'Measurement follow-up captured.'}${item.measurement?.snapshotId ? ` Snapshot: ${item.measurement.snapshotId}.` : ''}${item.measurement?.jobIds.length ? ` Jobs: ${item.measurement.jobIds.join(', ')}.` : ''}`)
      : ['- No post-publish measurement follow-ups are queued yet.']),
    '',
    `## Product-level visibility`,
    '',
    ...visibility.products.slice(0, 8).map((product) => `- ${product.name}: ${product.visibilityScore}/100, ${product.status}, prompts ${product.promptMatches}, mentions ${product.mentionMatches}, sources ${product.sourceMatches}`),
  ].join('\n');

  return {
    brandId: brand.id,
    brandName: brand.name,
    generatedAt,
    filenameBase,
    launchVerdict,
    summary: verdictCopy,
    metrics,
    samplingReadiness,
    externalBenchmarkReadiness,
    pilotReadiness,
    skuLaunchMatrix,
    marketplaceListingMatrix,
    opportunityMap,
    brandIntelligence,
    categoryIntelligence,
    creativeBriefs,
    competitorBattlecards,
    highlights,
    risks,
    nextActions: prioritizedNextActions,
    artifacts,
    markdown,
    html: wrapProductVisibilityReportHtml(`${brand.name} Product Visibility Client Report`, markdown),
  };
}

export async function buildProductReadiness(brand: Brand): Promise<ProductReadinessResult> {
  const [context, prompts, competitors, sources, mentions] = await Promise.all([
    storage.getBrandContext(brand.id).catch(() => undefined),
    storage.getPromptsByBrand(brand.id).catch(() => []),
    storage.getCompetitorsByBrand(brand.id).catch(() => []),
    storage.getSourcesByBrand(brand.id).catch(() => []),
    storage.getAllMentionsForBrand(brand.id, 2000).catch(() => []),
  ]);

  const contextText = [
    textFromJson((context as any)?.productServices),
    textFromJson((context as any)?.differentiators),
    textFromJson((context as any)?.targetCustomers),
    brand.description || '',
    brand.domain || '',
  ].join(' ');
  const promptText = prompts.map((prompt: any) => `${prompt.text} ${prompt.intent || ''} ${prompt.category || ''}`).join(' ');
  const sourceText = sources.map((source: any) => `${source.domain || ''} ${source.url || ''} ${source.sourceType || ''}`).join(' ');
  const allText = `${contextText} ${promptText} ${sourceText}`;
  const catalog = readCatalog((context as any)?.productServices);
  const catalogText = catalog.map((item) => [
    item.name,
    item.asin,
    item.sku,
    item.marketplace,
    item.category,
    item.productUrl,
    ...(item.claims || []),
    ...(item.objections || []),
    ...(item.competitors || []).map((competitor) => `${competitor.name} ${competitor.asin || ''} ${competitor.url || ''}`),
  ].join(' ')).join(' ');

  const channel = brand.businessChannel || 'website';
  const relevant = channel.includes('amazon') || channel.includes('shopify') || MARKETPLACE_RE.test(`${allText} ${catalogText}`) || catalog.length > 0;
  const asins = uniqueMatches(`${allText} ${catalogText}`.toUpperCase(), ASIN_RE);
  const productWords = uniqueMatches(contextText.toLowerCase(), /\b[a-z0-9][a-z0-9+\-.]*(?:\s+[a-z0-9][a-z0-9+\-.]*){0,3}\b/g)
    .filter((term) => /hosting|school|course|software|tool|plan|product|service|sku|asin|store|listing/.test(term))
    .slice(0, 12);
  const productIntentPrompts = prompts.filter((prompt: any) => {
    const text = `${prompt.text} ${prompt.intent || ''} ${prompt.category || ''}`.toLowerCase();
    return PRODUCT_INTENTS.some((intent) => text.includes(intent)) || MARKETPLACE_RE.test(text);
  });
  const catalogCompetitorProducts = catalog.reduce((sum, product) => sum + (product.competitors?.length || 0), 0);
  const competitorProducts = competitors.filter((competitor: any) => MARKETPLACE_RE.test(`${competitor.name} ${competitor.domain} ${competitor.description || ''}`)).length + catalogCompetitorProducts;
  const marketplaceSources = sources.filter((source: any) => MARKETPLACE_RE.test(`${source.domain || ''} ${source.url || ''} ${source.title || ''}`)).length;
  const reviewSignals = mentions.filter((mention: any) => /review|rating|stars|pros|cons|complaint|objection/i.test(`${mention.context || ''} ${mention.sentiment || ''}`)).length;

  const checks = [
    scoreCheck(
      'catalog_identifiers',
      'ASIN/SKU catalog identifiers',
      catalog.length >= 3 || asins.length >= 3,
      catalog.length > 0 || asins.length > 0 || productWords.length >= 3,
      catalog.length ? `${catalog.length} catalog products saved` : asins.length ? `${asins.length} ASIN-like IDs detected` : `${productWords.length} product/service terms detected`,
      'Import priority ASINs/SKUs with product title, category, price range, rating, and storefront URL.',
      18,
    ),
    scoreCheck(
      'product_prompt_coverage',
      'Product-level prompt coverage',
      productIntentPrompts.length >= Math.min(8, Math.max(catalog.length * 2, 4)),
      productIntentPrompts.length >= 3 || (catalog.length > 0 && productIntentPrompts.length > 0),
      `${productIntentPrompts.length}/${prompts.length} prompts include product, marketplace, buying, comparison, review, pricing, or problem intent`,
      'Create prompt clusters per hero product: buying, alternatives, comparison, review, objection, and problem-solving prompts.',
      18,
    ),
    scoreCheck(
      'competitor_products',
      'Competitor product tracking',
      competitorProducts >= Math.min(3, Math.max(catalog.length, 1)),
      competitors.length >= 3,
      `${competitors.length} competitors tracked; ${competitorProducts} look marketplace/product-specific`,
      'Track competing ASINs/products, not only competitor domains. Add price/rating/review-position evidence.',
      16,
    ),
    scoreCheck(
      'marketplace_sources',
      'Marketplace and review citations',
      marketplaceSources >= 5,
      marketplaceSources > 0,
      `${marketplaceSources} marketplace/review/source URLs detected`,
      'Add Amazon, Flipkart, Shopify, review-site, and owned-site citations that AI models can reuse.',
      16,
    ),
    scoreCheck(
      'review_intelligence',
      'Review and objection intelligence',
      reviewSignals >= 10,
      reviewSignals > 0,
      `${reviewSignals} mention contexts include review, rating, sentiment, or objection language`,
      'Extract recurring review themes, objections, claims, and feature language into listing FAQ and comparison content.',
      14,
    ),
    scoreCheck(
      'owned_product_facts',
      'Owned product facts for AI agents',
      textFromJson((context as any)?.productServices).length >= 300 || catalog.some((product) => (product.claims?.length || 0) >= 3),
      textFromJson((context as any)?.productServices).length > 50 || catalog.length > 0,
      `${textFromJson((context as any)?.productServices).length} product/service context characters available; ${catalog.length} catalog products`,
      'Maintain a structured product fact pack: features, use cases, pricing, availability, policies, proof, and sameAs links.',
      18,
    ),
  ];

  const earned = checks.reduce((sum, check) => sum + check.score, 0);
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = total ? Math.round((earned / total) * 100) : 0;

  const missing = checks.filter((check) => check.status !== 'pass');
  const playbook = [
    {
      title: 'Build product intelligence import',
      priority: 'high' as const,
      owner: 'brand' as const,
      steps: [
        'Upload priority ASINs/SKUs with title, category, price band, rating, review count, and storefront URL.',
        'Map each product to 3-5 competing products or ASINs.',
        'Tag hero products by margin, seasonality, and launch priority.',
      ],
    },
    {
      title: 'Generate product-level AI prompt clusters',
      priority: 'high' as const,
      owner: 'geo_team' as const,
      steps: [
        'Create buying, comparison, review, alternative, objection, and problem prompts per hero product.',
        'Sample ChatGPT, Claude, Gemini, Perplexity, and Google AI Overview where configured.',
        'Separate “not sampled” from “sampled but not recommended” in reporting.',
      ],
    },
    {
      title: 'Convert gaps into listing and owned-site assets',
      priority: 'medium' as const,
      owner: 'geo_team' as const,
      steps: [
        'Generate listing FAQ, A+ content claims, comparison snippets, and Organization/Product schema.',
        'Use review themes and objections as the source of language.',
        'Export a change log that a marketplace operator can apply SKU by SKU.',
      ],
    },
  ];

  return {
    relevant,
    score,
    grade: gradeFor(score),
    channel,
    summary: relevant
      ? `${brand.name} has ${score}/100 product AI-readiness. ${missing.length} product launch gap${missing.length === 1 ? '' : 's'} need work before seller-facing launch.`
      : `${brand.name} is not configured as a marketplace/product-seller account, but product readiness can be enabled when ASIN/SKU tracking is added.`,
    metrics: {
      prompts: prompts.length,
      productIntentPrompts: productIntentPrompts.length,
      catalogProducts: catalog.length,
      detectedAsins: asins.length,
      productsDetected: productWords.length,
      competitorProducts,
      marketplaceSources,
      reviewSignals,
    },
    checks: checks.map(({ weight, ...check }) => check),
    playbook,
  };
}
