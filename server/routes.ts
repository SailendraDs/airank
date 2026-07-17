import type { Express, Request, Response } from "express";
import { type Server } from "http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { requireAuth, requireAdmin } from "./auth-middleware";
import { requireApiKey, generateApiKey, getApiAccessibleBrands } from "./middleware/api-key";
import authRoutes from "./auth-routes";
import { registerAgencyRoutes } from "./routes/agency-routes";
import { registerAdminOpsRoutes } from "./routes/admin-ops-routes";
import { registerAgentReadinessRoutes } from "./routes/agent-readiness-routes";
import { registerIntegrationOAuthRoutes } from "./routes/integration-oauth";
import { entityRouter } from "./routes/entity";
import { storage, reportActivationStage } from "./storage";
import { db } from "./db";
import {
  visibilityScores,
  brands as brandsTable,
  topics as topicsTable,
  competitors as competitorsTable,
  prompts as promptsTable,
  invoices as invoicesTable,
  subscriptions as subscriptionsTable,
  planCapabilities as planCapabilitiesTable,
  userSessions as userSessionsTable,
  apiLogs as apiLogsTable,
} from "@shared/schema";
import { sql, eq, avg, and, desc, inArray, gt } from "drizzle-orm";
import { CORE_SCAN_PROVIDERS, PLAN_PROVIDERS, PROVIDER_MODELS, configuredProviderMap, getProviderEnvHint } from "./lib/plan-providers";
import type { LLMProviderName } from "./integrations/llm";
import { brandEnrichmentWorker } from "./jobs/workers/brand-enrichment";
import { llmSamplingWorker } from "./jobs/workers/llm-sampling";
import { citationExtractionWorker } from "./jobs/workers/citation-extraction";
import { visibilityScoringWorker, INTENT_WEIGHT_TABLE } from "./jobs/workers/visibility-scoring";
import { gapAnalysisWorker } from "./jobs/workers/gap-analysis";
import { recommendationWorker } from "./jobs/workers/recommendation";
import { z } from "zod";
import {
  apiLimiter,
  authLimiter,
  webhookLimiter,
  adminLimiter,
  jobLimiter,
  exportLimiter
} from "./middleware/rate-limit";
import { enforceFeatureAccess, enforcePlanLimit, FEATURE_KEYS, resolveFeatureAccess, resolveFeatureAccessBatch } from "./middleware/plan-enforcement";
import { logAudit, logger } from "./lib/logger";
import { getMonitoringDashboard } from './services/monitoring';
import { getErrorTracker } from './services/error-tracker';
import { getJobRetryService } from './services/job-retry';
import { getRateLimitService } from './services/rate-limiter';
import { buildQueryFanoutIntelligence } from './services/query-fanout-intelligence';
import { buildLaunchTrendSnapshot } from './services/launch-trend';
import { getProviderReliabilitySummary } from './services/provider-reliability-summary';
import { sendOnboardingComplete, sendAnalysisReady, sendAdminBroadcast, sendTeamInviteCredentials } from "./services/email";
import { resolvePromptTemplateByName } from "./services/prompt-template-runtime";
import { 
  insertBrandSchema, 
  insertCompetitorSchema, 
  insertTopicSchema,
  insertPromptSchema,
  insertSourceSchema,
  insertIntegrationSchema,
  insertPlanCapabilitySchema,
  insertPromptTemplateSchema,
  insertTeamMemberSchema,
  insertJobSchema,
  insertAnalysisScheduleSchema,
  insertAxpContentSchema,
  insertUserAnalyticsEventSchema,
  insertAlertRuleSchema,
  users as usersTable,
  userAnalyticsEvents as userAnalyticsEventsTable,
  accountLockouts as accountLockoutsTable,
  promptRuns as promptRunsTable,
  teamMembers as teamMembersTable,
  domainRegistry as domainRegistryTable,
  integrations as integrationsTable,
  type OptimizationLog,
} from "@shared/schema";

// Score label helper
function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Weak';
  return 'Critical';
}

function redactProviderError(message: unknown): string {
  return String(message || 'Provider returned no detail')
    .replace(/api_key:[A-Za-z0-9_\-]+/g, 'api_key:[redacted]')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[redacted-google-api-key]')
    .replace(/sk-ant-[A-Za-z0-9_\-]{20,}/g, '[redacted-anthropic-key]')
    .replace(/sk-or-[A-Za-z0-9_\-]{20,}/g, '[redacted-openrouter-key]')
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, '[redacted-api-key]')
    .replace(/pplx-[A-Za-z0-9_\-]{20,}/g, '[redacted-perplexity-key]')
    .replace(/xai-[A-Za-z0-9_\-]{20,}/g, '[redacted-grok-key]');
}

// Helper to create audit log
async function createAuditLog(req: Request, action: string, entityType: string, entityId: string, oldValue?: any, newValue?: any) {
  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ipAddress = req.ip || (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || null;
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
    const userId = (req as any).userId || (req as any).user?.id || null;
    const brandId = typeof req.params.brandId === 'string' ? req.params.brandId : null;

    await storage.createAuditLog({
      userId,
      brandId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress,
      userAgent,
    });

    // Also log to Winston for monitoring
    logAudit(action, (req as any).userId, {
      entityType,
      entityId,
      brandId,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

const PERSONA_SEGMENTS = [
  {
    id: 'buyer_comparison',
    label: 'Buyer and comparison searches',
    benchmark: 'Peec competitor benchmarking, Profound real-world prompts',
    keywords: ['best', 'compare', 'comparison', 'alternative', 'alternatives', 'review', 'pricing', 'price', 'cost', 'buy', 'vendor', 'agency', 'tool', 'platform', 'software', 'solution'],
    intents: ['comparison', 'review', 'pricing', 'buying'],
    action: 'Add high-intent comparison, pricing, review, and alternative prompts for the buyer persona.',
  },
  {
    id: 'trust_evaluator',
    label: 'Trust and proof evaluators',
    benchmark: 'Athena brand integrity, Profound content AEO',
    keywords: ['trust', 'legit', 'credible', 'case study', 'proof', 'testimonial', 'guarantee', 'safe', 'reliable', 'reviews', 'rating', 'authority'],
    intents: ['trust', 'review', 'negative'],
    action: 'Create proof-led prompts and pages around credibility, reviews, outcomes, guarantees, and sourceable claims.',
  },
  {
    id: 'technical_implementation',
    label: 'Technical and implementation users',
    benchmark: 'Profound audience personas',
    keywords: ['how to', 'setup', 'set up', 'integrate', 'api', 'developer', 'implementation', 'install', 'migration', 'workflow', 'automation', 'technical'],
    intents: ['howto', 'migrate', 'problem'],
    action: 'Track implementation prompts and publish how-to or integration content that AI engines can cite.',
  },
  {
    id: 'india_local_market',
    label: 'India and local-market demand',
    benchmark: 'Peec global/local tracking',
    keywords: ['india', 'indian', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'near me', 'local', 'inr', 'rupees'],
    intents: ['local'],
    action: 'Add location-aware prompts for India-specific buyer language, cities, and regional proof points.',
  },
  {
    id: 'support_objection',
    label: 'Support and objection handling',
    benchmark: 'Answer-engine sentiment and objection monitoring',
    keywords: ['support', 'complaint', 'problem', 'issue', 'refund', 'warranty', 'customer service', 'pros and cons', 'disadvantage', 'risk'],
    intents: ['support', 'problem', 'negative'],
    action: 'Track objection and support prompts, then turn weak/negative answers into corrective content and proof tasks.',
  },
];

function buildPersonaPromptTemplates(segmentId: string, brandName: string, industry: string, topCompetitor: string) {
  const category = industry || 'the category';
  const competitor = topCompetitor || 'top competitors';
  const templates: Record<string, Array<{ text: string; category: string; intent: string; priorityScore: number }>> = {
    buyer_comparison: [
      { text: `Which ${category} option should a buyer shortlist: ${brandName}, ${competitor}, or another competitor?`, category: 'comparison', intent: 'comparison', priorityScore: 92 },
      { text: `Best ${category} brands for Indian buyers comparing price, trust, and support`, category: 'recommendation', intent: 'recommendation', priorityScore: 90 },
      { text: `${brandName} vs ${competitor}: which is better for first-time buyers?`, category: 'comparison', intent: 'comparison', priorityScore: 88 },
    ],
    trust_evaluator: [
      { text: `Is ${brandName} a trustworthy ${category} brand and what proof supports that?`, category: 'trust', intent: 'trust', priorityScore: 88 },
      { text: `What certifications, reviews, case studies, or sources make ${brandName} credible?`, category: 'trust', intent: 'trust', priorityScore: 86 },
      { text: `Can buyers rely on ${brandName} compared with established ${category} brands?`, category: 'trust', intent: 'review', priorityScore: 84 },
    ],
    technical_implementation: [
      { text: `How should a team implement or get started with ${brandName}?`, category: 'how-to', intent: 'howto', priorityScore: 82 },
      { text: `What setup steps, integrations, or workflows does ${brandName} require?`, category: 'how-to', intent: 'howto', priorityScore: 80 },
      { text: `Common implementation mistakes when choosing ${brandName} for ${category}`, category: 'how-to', intent: 'problem', priorityScore: 78 },
    ],
    india_local_market: [
      { text: `Is ${brandName} a good ${category} choice for Indian buyers?`, category: 'local', intent: 'local', priorityScore: 86 },
      { text: `Best ${category} brands in India for value, service, and trust`, category: 'local', intent: 'local', priorityScore: 84 },
      { text: `${brandName} pricing, availability, and support for customers in India`, category: 'pricing', intent: 'local', priorityScore: 82 },
    ],
    support_objection: [
      { text: `${brandName} complaints, support issues, pros and cons buyers should know`, category: 'reviews', intent: 'negative', priorityScore: 86 },
      { text: `What are the biggest risks or disadvantages of choosing ${brandName}?`, category: 'reviews', intent: 'negative', priorityScore: 84 },
      { text: `How good is ${brandName} customer support, warranty, refund, or after-sales service?`, category: 'support', intent: 'support', priorityScore: 82 },
    ],
  };
  return templates[segmentId] || [];
}

async function buildAudiencePersonaIntelligence(brand: any) {
  const brandId = brand.id;
  const [prompts, answers, competitors] = await Promise.all([
    storage.getPromptsByBrand(brandId).catch(() => []),
    storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
    storage.getCompetitorsByBrand(brandId).catch(() => []),
  ]);
  const answerIds = (answers as any[]).map((answer: any) => answer.id).filter(Boolean);
  const mentions = answerIds.length ? await storage.getAnswerMentionsByAnswerIds(answerIds).catch(() => []) : [];
  const mentionsByAnswer = new Map<string, any[]>();
  for (const mention of mentions as any[]) {
    const answerId = String(mention.llmAnswerId || '');
    if (!answerId) continue;
    if (!mentionsByAnswer.has(answerId)) mentionsByAnswer.set(answerId, []);
    mentionsByAnswer.get(answerId)!.push(mention);
  }
  const brandName = String(brand.name || '').toLowerCase();
  const competitorNames = (competitors as any[]).map((competitor: any) => String(competitor.name || '').toLowerCase()).filter(Boolean);
  const sentimentValue = (value: string | null | undefined) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'positive') return 100;
    if (normalized === 'negative') return 0;
    return 55;
  };
  const promptMatchesSegment = (prompt: any, segment: typeof PERSONA_SEGMENTS[number]) => {
    const text = `${prompt.text || ''} ${prompt.category || ''} ${prompt.intent || ''}`.toLowerCase();
    const intent = String(prompt.intent || '').toLowerCase();
    return segment.intents.includes(intent) || segment.keywords.some((keyword) => text.includes(keyword));
  };

  const personas = PERSONA_SEGMENTS.map((segment) => {
    const segmentPrompts = (prompts as any[]).filter((prompt) => promptMatchesSegment(prompt, segment));
    const segmentPromptIds = new Set(segmentPrompts.map((prompt: any) => prompt.id));
    const segmentAnswers = (answers as any[]).filter((answer: any) => segmentPromptIds.has(answer.promptId));
    const providerSet = new Set(segmentAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').toLowerCase()).filter(Boolean));
    const brandAnswerIds = new Set<string>();
    let brandMentionCount = 0;
    let competitorMentionCount = 0;
    const sentimentScores: number[] = [];

    for (const answer of segmentAnswers) {
      const raw = String(answer.rawResponse || answer.response || '').toLowerCase();
      const answerMentions = mentionsByAnswer.get(answer.id) || [];
      const hasBrandMention = answerMentions.some((mention: any) => !mention.isCompetitor && !mention.competitorId) || (brandName && raw.includes(brandName));
      const hasCompetitorMention = answerMentions.some((mention: any) => mention.isCompetitor || mention.competitorId) || competitorNames.some((name) => raw.includes(name));
      if (hasBrandMention) {
        brandAnswerIds.add(answer.id);
        brandMentionCount++;
      }
      if (hasCompetitorMention) competitorMentionCount++;
      for (const mention of answerMentions) {
        if (!mention.isCompetitor && !mention.competitorId) sentimentScores.push(sentimentValue(mention.sentiment));
      }
    }

    const mentionRate = segmentAnswers.length ? Math.round((brandAnswerIds.size / segmentAnswers.length) * 100) : 0;
    const providerCoverageScore = Math.min(100, Math.round((providerSet.size / 4) * 100));
    const promptCoverageScore = Math.min(100, Math.round((segmentPrompts.length / 5) * 100));
    const sentimentScore = sentimentScores.length ? Math.round(sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length) : 50;
    const visibilityScore = Math.round((mentionRate * 0.45) + (providerCoverageScore * 0.2) + (promptCoverageScore * 0.2) + (sentimentScore * 0.15));
    const status = segmentPrompts.length >= 5 && providerSet.size >= 3 && mentionRate >= 40 ? 'ready' : segmentPrompts.length > 0 || segmentAnswers.length > 0 ? 'partial' : 'missing';
    const gaps = [
      segmentPrompts.length < 5 ? 'Needs at least 5 tracked prompts for this persona.' : '',
      providerSet.size < 3 ? 'Needs answer evidence across at least 3 providers.' : '',
      segmentAnswers.length > 0 && mentionRate < 40 ? 'Brand is under-mentioned for this audience segment.' : '',
      competitorMentionCount > brandMentionCount ? 'Competitors appear more often than the brand in this persona.' : '',
    ].filter(Boolean);

    return {
      id: segment.id,
      label: segment.label,
      benchmark: segment.benchmark,
      status,
      score: visibilityScore,
      promptCount: segmentPrompts.length,
      answerCount: segmentAnswers.length,
      providerCount: providerSet.size,
      mentionRate,
      brandMentions: brandMentionCount,
      competitorMentions: competitorMentionCount,
      sentimentScore,
      evidence: `${segmentPrompts.length} prompts, ${segmentAnswers.length} answers, ${mentionRate}% mention rate, ${providerSet.size} providers`,
      gap: gaps[0] || 'Persona coverage is credible; keep refreshing evidence and add deeper intent variants.',
      action: gaps.length ? segment.action : 'Keep this persona in the weekly monitoring and reporting rotation.',
      samplePrompts: segmentPrompts.slice(0, 3).map((prompt: any) => ({ id: prompt.id, text: prompt.text, intent: prompt.intent || prompt.category || 'discovery' })),
    };
  });

  const ready = personas.filter((persona) => persona.status === 'ready').length;
  const partial = personas.filter((persona) => persona.status === 'partial').length;
  const missing = personas.filter((persona) => persona.status === 'missing').length;
  const score = personas.length ? Math.round(personas.reduce((sum, persona) => sum + persona.score, 0) / personas.length) : 0;

  return {
    brandId,
    brandName: brand.name,
    score,
    verdict: score >= 75 && missing === 0 ? 'Persona-ready for enterprise demos' : score >= 50 ? 'Persona coverage exists with gaps' : 'Persona intelligence is under-built',
    summary: {
      personas: personas.length,
      ready,
      partial,
      missing,
      totalPrompts: (prompts as any[]).length,
      totalAnswers: (answers as any[]).length,
      competitors: (competitors as any[]).length,
    },
    personas,
    nextActions: personas
      .filter((persona) => persona.status !== 'ready')
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((persona) => ({
        id: persona.id,
        title: persona.label,
        evidence: persona.evidence,
        action: persona.action,
        href: '/app/prompts',
      })),
    generatedAt: new Date().toISOString(),
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const getUserId = (req: any): string => req.userId;
  const qstr = (v: unknown): string => Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');

  const normalizeDomain = (input: string): string =>
    input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .split("#")[0];

  // POC uplift: whitelist specific domains during private evaluations.
  const POC_SCRIPT_UPLIFT_POINTS = 4;
  const POC_SCRIPT_UPLIFT_DOMAINS: readonly string[] = [];

  const normalizeDomainForPoc = (input?: string | null): string =>
    normalizeDomain(input || "").replace(/:\d+$/, "");

  const isPocScriptUpliftEligible = (brand: any): boolean => {
    if (POC_SCRIPT_UPLIFT_DOMAINS.length === 0) return false;
    const normalizedDomain = normalizeDomainForPoc(brand?.domain);
    const domainMatch = POC_SCRIPT_UPLIFT_DOMAINS.some(
      (candidate) => normalizedDomain === candidate || normalizedDomain.endsWith(`.${candidate}`),
    );
    return Boolean(domainMatch && brand?.scriptInstalled && brand?.scriptVerifiedAt);
  };

  const getPocUpliftPoints = (brand: any): number =>
    isPocScriptUpliftEligible(brand) ? POC_SCRIPT_UPLIFT_POINTS : 0;

  const applyPocUpliftScore = (score: number, points: number): number => {
    const numeric = Number.isFinite(score) ? score : 0;
    const boosted = numeric + points;
    return Math.max(0, Math.min(100, Math.round(boosted * 10) / 10));
  };

  const getSiteBrandingSettings = async () => {
    const [logoUrlRaw, faviconUrlRaw, assetVersionRaw] = await Promise.all([
      storage.getSystemSetting("site_logo_url"),
      storage.getSystemSetting("site_favicon_url"),
      storage.getSystemSetting("site_asset_version"),
    ]);

    const logoUrl = (logoUrlRaw || "/logo.png").trim() || "/logo.png";
    const faviconUrl = (faviconUrlRaw || "/favicon.png").trim() || "/favicon.png";
    const assetVersion = (assetVersionRaw || "20260322").trim() || "20260322";

    return { logoUrl, faviconUrl, assetVersion };
  };

  const parseImageDataUrl = (input: unknown): { mimeType: string; buffer: Buffer } | null => {
    if (typeof input !== "string") return null;
    const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    try {
      return { mimeType, buffer: Buffer.from(base64, "base64") };
    } catch {
      return null;
    }
  };

  const writeSiteAsset = async (filename: "logo.png" | "favicon.png", buffer: Buffer) => {
    const roots = [
      path.resolve(process.cwd(), "client/public"),
      path.resolve(process.cwd(), "dist/public"),
    ];

    for (const root of roots) {
      try {
        await fs.promises.mkdir(root, { recursive: true });
        await fs.promises.writeFile(path.join(root, filename), buffer);
      } catch (error) {
        logger.warn("[BrandingAssets] Failed to write asset", { filename, root, error: String(error) });
      }
    }
  };


  const reconcileInvoicesFromPayments = async (brandId?: string, razorpayPaymentId?: string): Promise<{ created: number; linked: number; scannedPayments: number }> => {
    let created = 0;
    let linked = 0;
    let scannedPayments = 0;

    const singleBrand = brandId ? await storage.getBrand(brandId) : null;
    const targetBrands = singleBrand
      ? [singleBrand]
      : await storage.getAllBrands(1000, 0);

    for (const brand of targetBrands) {
      if (!brand) continue;

      const subscription = await storage.getSubscriptionByBrand(brand.id);
      const payments = await storage.getPaymentsByBrand(brand.id, 500);

      for (const payment of payments as any[]) {
        scannedPayments += 1;

        if (razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) continue;
        if (!['succeeded', 'refunded'].includes(String(payment.status || ''))) continue;

        const metadataInvoiceId = payment?.metadata?.invoice_id || payment?.metadata?.invoiceId || null;

        let invoice = payment.invoiceId ? await storage.getInvoice(payment.invoiceId) : undefined;

        if (!invoice && metadataInvoiceId) {
          invoice = await storage.getInvoiceByRazorpayId(String(metadataInvoiceId));
        }

        if (!invoice) {
          const existingInvoices = await storage.getInvoicesByBrand(brand.id, 200);
          invoice = existingInvoices.find((inv: any) => inv.razorpayPaymentId && payment.razorpayPaymentId && inv.razorpayPaymentId === payment.razorpayPaymentId);
        }

        if (!invoice) {
          invoice = await storage.createInvoice({
            brandId: brand.id,
            subscriptionId: subscription?.id,
            amount: payment.amount,
            currency: payment.currency || 'INR',
            status: payment.status === 'refunded' ? 'refunded' : 'paid',
            invoiceNumber: 'RZP-' + (metadataInvoiceId || payment.razorpayPaymentId || payment.id),
            razorpayInvoiceId: metadataInvoiceId || null,
            razorpayPaymentId: payment.razorpayPaymentId || null,
            paidAt: payment.createdAt || new Date(),
            metadata: { source: 'payment_backfill', payment_id: payment.id },
          } as any);
          created += 1;
        }

        if (payment.invoiceId !== invoice.id) {
          await storage.updatePayment(payment.id, { invoiceId: invoice.id } as any);
          linked += 1;
        }
      }
    }

    return { created, linked, scannedPayments };
  };

  // ============= AUTH ROUTES =============
  app.use('/api/auth', authRoutes);

  // ============= AGENCY ROUTES =============
  registerAgencyRoutes(app);
  registerAdminOpsRoutes(app);

  const featureGateRules = [
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/competitive-parity(?:\/report)?$/, feature: 'competitive_parity' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/production-readiness-audit$/, feature: 'production_audit' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/launch-readiness(?:\/report)?$/, feature: 'launch_blocker_pack' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/product-readiness$/, feature: 'product_readiness' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/product-playbook$/, feature: 'product_readiness' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/product-visibility(?:\/(?:history|actions|actions-export|client-report(?:\/pdf)?|drafts|publish-queue))?$/, feature: 'product_readiness' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/product-pilot-checks\/[^/]+\/task$/, feature: 'verification_workflow' },
    { method: 'PATCH', pattern: /^\/api\/brands\/([^/]+)\/product-visibility\/actions\/[^/]+$/, feature: 'verification_workflow' },
    { method: 'PATCH', pattern: /^\/api\/brands\/([^/]+)\/product-visibility\/drafts\/[^/]+$/, feature: 'product_readiness' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/product-visibility\/(?:drafts\/[^/]+\/publish|publish-queue\/[^/]+\/publish|snapshot)$/, feature: 'product_sampling' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/product-catalog(?:\/import-history)?$/, feature: 'product_catalog_import' },
    { method: 'PUT', pattern: /^\/api\/brands\/([^/]+)\/product-catalog$/, feature: 'product_catalog_import' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/product-catalog\/(validate|extract|discover|enrich|map-competitors)$/, feature: 'product_catalog_import' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/product-prompt-pack\/activate$/, feature: 'product_sampling' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/product-sampling-automation$/, feature: 'product_sampling' },
    { method: 'PATCH', pattern: /^\/api\/brands\/([^/]+)\/product-sampling-automation$/, feature: 'product_sampling' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/product-seller-pilot-kit$/, feature: 'product_sampling' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/axp-pages$/, feature: 'axp_drafts' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/optimizations\/[^/]+\/query-fanout-draft$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/axp-pages$/, feature: 'axp_drafts' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/axp-pages\/[^/]+\/publish$/, feature: 'axp_publish' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/agent-readiness\/scan$/, feature: 'agent_readiness_full' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/agent-readiness\/schema-fix-pack$/, feature: 'schema_fix_pack' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/agent-readiness\/issues\/[^/]+\/task$/, feature: 'verification_workflow' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/answer-intelligence$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/audience-personas$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/answer-intelligence\/risks\/[^/]+\/task$/, feature: 'verification_workflow' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/audience-personas\/[^/]+\/task$/, feature: 'verification_workflow' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/verification-evidence\/report$/, feature: 'verification_workflow' },
    { method: 'PATCH', pattern: /^\/api\/brands\/([^/]+)\/verification-tasks\/[^/]+$/, feature: 'verification_workflow' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/verification-tasks\/[^/]+\/check-[a-z0-9-]+$/, feature: 'verification_workflow' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/crawler-token(?:\/rotate)?$/, feature: 'agent_analytics' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/crawler-test-hit$/, feature: 'agent_analytics' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/crawler-analytics$/, feature: 'agent_analytics' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/crawler-stats$/, feature: 'agent_analytics' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/crawler-visit$/, feature: 'agent_analytics' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/attribution$/, feature: 'agent_analytics' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/attribution\/history$/, feature: 'manual_attribution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/integrations\/manual-evidence$/, feature: 'manual_attribution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/manual-attribution-evidence$/, feature: 'manual_attribution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/attribution\/manual-evidence$/, feature: 'manual_attribution' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/ai-search-opportunity-brief$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/prompt-fanouts\/[^/]+\/task$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/market-opportunities$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/market-opportunities\/report$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/market-opportunities\/[^/]+\/task$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/citation-opportunities$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/citation-opportunities\/[^/]+\/task$/, feature: 'query_fanout' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/browser-sampling$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/browser-samples$/, feature: 'query_fanout' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/report\/(?:pdf|preview)$/, feature: 'scheduled_reports' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/provider-preflight$/, feature: 'production_audit' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/alert-summary$/, feature: 'alerts' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/scan-health$/, feature: 'scheduled_reports' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/scan-health\/report$/, feature: 'scheduled_reports' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/scan-operations\/run$/, feature: 'scheduled_reports' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/scan-operations\/history$/, feature: 'scheduled_reports' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/cms-connections$/, feature: 'admin_assisted_execution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/cms-connections$/, feature: 'admin_assisted_execution' },
    { method: 'DELETE', pattern: /^\/api\/brands\/([^/]+)\/cms-connections\/[^/]+$/, feature: 'admin_assisted_execution' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/agent-tasks$/, feature: 'admin_assisted_execution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/agent-tasks(?:\/[^/]+\/(?:approve|execute))?$/, feature: 'admin_assisted_execution' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/fact-claims\/[^/]+\/correction$/, feature: 'admin_assisted_execution' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/report-schedules$/, feature: 'scheduled_reports' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/report-schedules(?:\/defaults)?$/, feature: 'scheduled_reports' },
    { method: 'PUT', pattern: /^\/api\/brands\/([^/]+)\/report-schedules\/[^/]+$/, feature: 'scheduled_reports' },
    { method: 'DELETE', pattern: /^\/api\/brands\/([^/]+)\/report-schedules\/[^/]+$/, feature: 'scheduled_reports' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/report-schedules\/[^/]+\/trigger$/, feature: 'scheduled_reports' },
    { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/alert-rules$/, feature: 'alerts' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/alert-rules(?:\/defaults)?$/, feature: 'alerts' },
    { method: 'PATCH', pattern: /^\/api\/brands\/([^/]+)\/alert-rules\/[^/]+$/, feature: 'alerts' },
    { method: 'DELETE', pattern: /^\/api\/brands\/([^/]+)\/alert-rules\/[^/]+$/, feature: 'alerts' },
    { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/alert-rules\/test$/, feature: 'alerts' },
  ];

  app.use((req, res, next) => {
    const rule = featureGateRules.find((candidate) => candidate.method === req.method && candidate.pattern.test(req.path));
    if (!rule) return next();
    const match = req.path.match(rule.pattern);
    req.params.brandId = match?.[1] || req.params.brandId;
    return requireAuth(req as any, res, (authError?: any) => {
      if (authError) return next(authError);
      return enforceFeatureAccess(rule.feature)(req as any, res, next);
    });
  });

  registerAgentReadinessRoutes(app);
  app.use('/api/brands', entityRouter);

  // ============= INTEGRATION OAUTH ROUTES =============
  registerIntegrationOAuthRoutes(app);

  // Compatibility route: support legacy Google callback path used in some OAuth console configs
  app.get("/auth/google/callback", (req, res) => {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.redirect("/api/auth/google/callback" + query);
  });

  app.get("/api/site-branding", async (_req, res) => {
    try {
      const branding = await getSiteBrandingSettings();
      res.json(branding);
    } catch (error: any) {
      res.json({ logoUrl: "/logo.png", faviconUrl: "/favicon.png", assetVersion: "20260322" });
    }
  });

  // ============= USER ROUTES =============

  // Apply general API rate limiting to all /api routes
  app.use('/api', apiLimiter);

  app.post("/api/users/sync", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { firstName, lastName, profileImageUrl } = req.body;
      
      const existingUser = await storage.getUser(userId);
      
      if (existingUser) {
        const updated = await storage.updateUser(userId, {
          firstName,
          lastName,
          profileImageUrl,
        });
        return res.json(updated);
      }
      
      return res.status(404).json({ message: "User not found" });
    } catch (error: any) {
      console.error("User sync error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/me", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/users/me", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const updated = await storage.updateUser(userId, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= SESSION MANAGEMENT ROUTES =============

  app.get("/api/sessions", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const sessions = await storage.getUserSessions(userId);

      // Get current session token from cookie
      const currentSessionToken = req.cookies?.session_token;

      // Parse user agent and format sessions for frontend
      const formattedSessions = sessions.map(session => {
        const deviceInfo = session.deviceInfo as any || {};
        const userAgent = session.userAgent || '';

        // Simple user agent parsing
        let browser = 'Unknown Browser';
        let os = 'Unknown OS';
        let deviceType = 'desktop';

        if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Edge')) browser = 'Edge';

        if (userAgent.includes('Windows')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'macOS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        else if (userAgent.includes('Android')) { os = 'Android'; deviceType = 'mobile'; }
        else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
          os = 'iOS';
          deviceType = 'mobile';
        }

        // Format last activity
        const lastActivity = session.lastActivity;
        const now = new Date();
        const diffMs = now.getTime() - lastActivity.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let lastActiveText = 'Just now';
        if (diffMins < 5) lastActiveText = 'Just now';
        else if (diffMins < 60) lastActiveText = `${diffMins} minutes ago`;
        else if (diffHours < 24) lastActiveText = `${diffHours} hours ago`;
        else lastActiveText = `${diffDays} days ago`;

        const isCurrent = session.sessionToken === currentSessionToken;
        if (isCurrent) lastActiveText = 'Current session';

        return {
          id: session.sessionToken,
          name: `${browser} on ${os}`,
          browser,
          os,
          deviceType,
          ip: session.ipAddress || 'Unknown',
          lastActive: lastActiveText,
          lastActivityDate: lastActivity,
          current: isCurrent,
          sessionToken: session.sessionToken,
        };
      });

      // Sort: current session first, then by last activity
      formattedSessions.sort((a, b) => {
        if (a.current) return -1;
        if (b.current) return 1;
        return b.lastActivityDate.getTime() - a.lastActivityDate.getTime();
      });

      res.json(formattedSessions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/sessions/:sessionToken", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { sessionToken } = req.params;

      // Verify the session belongs to the user
      const session = await storage.getSession(sessionToken);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Session not found" });
      }

      // Don't allow revoking current session via this endpoint
      const currentSessionToken = req.cookies?.session_token;
      if (sessionToken === currentSessionToken) {
        return res.status(400).json({ message: "Cannot revoke current session. Use logout instead." });
      }

      await storage.revokeSession(sessionToken, 'User revoked from settings');
      await createAuditLog(req, 'revoke', 'session', sessionToken);

      res.json({ message: "Session revoked successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= PLAN CAPABILITIES ROUTES =============
  
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await storage.getAllPlanCapabilities();
      const usdToInrRate = Number(process.env.USD_TO_INR_RATE || 94);
      const normalized = plans.map((plan: any) => ({
        ...plan,
        monthlyPrice: typeof plan.monthlyPrice === "number"
          ? Math.round(plan.monthlyPrice * usdToInrRate)
          : plan.monthlyPrice,
        currency: "INR",
        baseCurrency: "USD",
      }));
      res.json(normalized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/plans/:planId", async (req, res) => {
    try {
      const plan = await storage.getPlanCapability(req.params.planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const usdToInrRate = Number(process.env.USD_TO_INR_RATE || 94);
      const normalizedPlan = {
        ...plan,
        monthlyPrice: typeof (plan as any).monthlyPrice === "number"
          ? Math.round((plan as any).monthlyPrice * usdToInrRate)
          : (plan as any).monthlyPrice,
        currency: "INR",
        baseCurrency: "USD",
      };

      res.json(normalizedPlan);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= BRAND ROUTES =============

  // GET /api/brands/current — must be BEFORE /:brandId to avoid conflict
  app.get("/api/brands/current", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const ownedBrand = await storage.getBrandByUserId(userId);
      if (ownedBrand) {
        return res.json(ownedBrand);
      }

      const [teamBrand] = await db
        .select({ brand: brandsTable })
        .from(teamMembersTable)
        .innerJoin(brandsTable, eq(teamMembersTable.brandId, brandsTable.id))
        .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.status, "active")))
        .orderBy(desc(teamMembersTable.acceptedAt))
        .limit(1);

      res.json(teamBrand?.brand ?? null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const ownedBrands = await storage.getBrandsByUserId(userId);
      const teamBrands = await db
        .select({ brand: brandsTable })
        .from(teamMembersTable)
        .innerJoin(brandsTable, eq(teamMembersTable.brandId, brandsTable.id))
        .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.status, "active")));

      const byId = new Map<string, any>();
      for (const brand of ownedBrands) byId.set(brand.id, brand);
      for (const row of teamBrands) byId.set(row.brand.id, row.brand);

      res.json(Array.from(byId.values()));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/features", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      const currentUser = await storage.getUser(userId).catch(() => undefined);

      if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const features = await resolveFeatureAccessBatch(brand.id, FEATURE_KEYS);
      res.json({
        brandId: brand.id,
        tier: brand.tier,
        features: Object.fromEntries(features.map((feature) => [feature.featureKey, feature])),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      
      res.json(brand);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const configBrandId = `gs-${crypto.randomBytes(6).toString('hex')}`;
      const data = insertBrandSchema.parse({ ...req.body, userId, configBrandId });
      const brand = await storage.createBrand(data);
      await createAuditLog(req, "create", "brand", brand.id, null, brand);
      res.json(brand);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/brands/:brandId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const oldBrand = await storage.getBrand(req.params.brandId);
      
      if (!oldBrand || oldBrand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { scriptInstalled, scriptVerifiedAt, configBrandId, userId: _u, id: _id, ...safeBody } = req.body;
      const updated = await storage.updateBrand(req.params.brandId, safeBody);
      await createAuditLog(req, "update", "brand", req.params.brandId, oldBrand, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= BRAND LOOKUP (Firecrawl + OpenRouter) =============

  app.post("/api/brand-lookup", requireAuth, async (req: any, res) => {
    try {
      const rawDomain = String(req.body?.domain || "");
      const domain = normalizeDomain(rawDomain);

      if (!domain) {
        return res.status(400).json({ message: "Domain is required" });
      }

      const { lookupBrandByDomain } = await import('./services/brand-lookup-service');
      const result = await lookupBrandByDomain(domain);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brand-lookup/competitors", requireAuth, async (req: any, res) => {
    try {
      const domain = normalizeDomain(String(req.body?.domain || ""));
      if (!domain) {
        return res.status(400).json({ message: "Domain is required" });
      }

      const { suggestCompetitorsForDomain } = await import('./services/brand-lookup-service');
      const competitors = await suggestCompetitorsForDomain({
        domain,
        brandName: String(req.body?.brandName || ""),
        industry: String(req.body?.industry || ""),
      });

      res.json({ domain, competitors });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= PUBLIC AI REPORT CARD (Epic N — lead magnet) =============

  // POST /api/public/report-card - Run a free, rate-limited teaser analysis for a domain
  app.post("/api/public/report-card", async (req: any, res) => {
    try {
      const { getRateLimitService } = await import('./services/rate-limiter');
      const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket?.remoteAddress || 'unknown').toString().trim();
      const limiter = getRateLimitService();
      const rl = limiter.check(`report-card:${ip}`, { requestsPerMinute: 3, requestsPerHour: 10, requestsPerDay: 20, burstLimit: 3 });
      if (!rl.allowed) {
        return res.status(429).json({ message: 'Too many requests. Please try again later.', resetAt: rl.resetAt });
      }

      const { generateReportCard, toTeaser, normalizeDomainInput } = await import('./services/report-card');
      const result = await generateReportCard(String(req.body?.domain || ''));

      const { createHash } = await import('crypto');
      const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
      await storage.createReportCardLead({
        domain: normalizeDomainInput(String(req.body?.domain || '')),
        brandName: result.brandName,
        teaserScore: result.teaserScore,
        fullReport: result as any,
        unlocked: false,
        ipHash,
        userAgent: (req.headers['user-agent'] || '').toString().slice(0, 500),
      } as any);

      res.json(toTeaser(result));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // POST /api/public/report-card/unlock - Email-gate the full report
  app.post("/api/public/report-card/unlock", async (req: any, res) => {
    try {
      const { getRateLimitService } = await import('./services/rate-limiter');
      const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket?.remoteAddress || 'unknown').toString().trim();
      const rl = getRateLimitService().check(`report-card-unlock:${ip}`, { requestsPerMinute: 3, requestsPerHour: 15, requestsPerDay: 30, burstLimit: 3 });
      if (!rl.allowed) {
        return res.status(429).json({ message: 'Too many requests. Please try again later.', resetAt: rl.resetAt });
      }

      const email = String(req.body?.email || '').trim().toLowerCase();
      const domainRaw = String(req.body?.domain || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid email is required.' });
      }

      const { generateReportCard, normalizeDomainInput } = await import('./services/report-card');
      const result = await generateReportCard(domainRaw);
      const domain = normalizeDomainInput(domainRaw);

      const lead = await storage.createReportCardLead({
        domain,
        email,
        brandName: result.brandName,
        teaserScore: result.teaserScore,
        fullReport: result as any,
        unlocked: true,
        unlockedAt: new Date(),
      } as any);

      // Best-effort: email the full report link/summary.
      try {
        const { sendEmail } = await import('./services/email');
        const recList = result.recommendations?.map(r => `<li>${r}</li>`).join('') || '';
        await sendEmail(
          email,
          `Your AI Report Card for ${result.brandName}`,
          `<h2>${result.brandName} — AI Visibility Report Card</h2>
           <p>AI Visibility Score: <strong>${result.teaserScore}/100</strong> across ${result.modelsCovered.length} model(s).</p>
           <p>${result.highlights.join('<br/>')}</p>
           <h3>Top recommendations</h3><ul>${recList}</ul>
           <p>Want continuous monitoring and competitor benchmarking? <a href="${process.env.APP_URL || 'https://airank.io'}/auth/sign-up">Start your free AIRank account</a>.</p>`,
        );
      } catch (e: any) {
        console.warn('[ReportCard] Email send failed:', e?.message);
      }

      res.json({ success: true, leadId: lead.id, report: result });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= BRAND ENRICHMENT (Background) =============

  app.post("/api/brands/:brandId/enrich", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      // Check if enrichment is needed (missing fields)
      const needsEnrichment = !brand.industry || !brand.description || !brand.logo ||
                              !brand.city || !brand.state || !brand.country;

      if (!needsEnrichment) {
        return res.json({
          message: "Brand already has complete information",
          brand
        });
      }

      // Trigger Firecrawl enrichment for missing fields
      try {
        const { lookupBrandByDomain } = await import('./services/brand-lookup-service');
        const enriched = await lookupBrandByDomain(normalizeDomain(brand.domain));

        if (enriched.enrichmentStatus === 'ok') {
          const updates: any = {};
          if (!brand.description && enriched.description) updates.description = enriched.description;
          if (!brand.slogan && enriched.slogan) updates.slogan = enriched.slogan;
          if (!brand.logo && enriched.logo) updates.logo = enriched.logo;
          if (!brand.industry && enriched.industry) updates.industry = enriched.industry;
          if (!brand.subindustry && enriched.subindustry) updates.subindustry = enriched.subindustry;
          if (!brand.city && enriched.city) updates.city = enriched.city;
          if (!brand.state && enriched.state) updates.state = enriched.state;
          if (!brand.country && enriched.country) updates.country = enriched.country;
          if (!brand.linkedinUrl && enriched.linkedinUrl) updates.linkedinUrl = enriched.linkedinUrl;
          if (!brand.brandDevData && enriched.brandDevData) updates.brandDevData = enriched.brandDevData;

          if (Object.keys(updates).length > 0) {
            const enrichedBrand = await storage.updateBrand(brand.id, updates);
            return res.json({
              message: "Brand enriched successfully",
              brand: enrichedBrand,
              fieldsUpdated: Object.keys(updates),
            });
          }
        } else if (enriched.enrichmentError) {
          return res.status(500).json({ message: "Brand enrichment failed: " + enriched.enrichmentError });
        }
      } catch (err: any) {
        console.error("Brand enrichment failed:", err.message);
        return res.status(500).json({ message: "Brand enrichment failed: " + err.message });
      }

      res.json({ message: "No enrichment data available", brand });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= AI TOPIC GENERATION (OpenRouter) =============

  app.post("/api/brands/:brandId/generate-topics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { competitors } = req.body;
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "OpenRouter API key not configured" });
      }

      const competitorNames = (competitors || []).map((c: any) => c.name || c.domain).join(", ");

      const fallbackPrompt = `You are an enterprise AI visibility strategist designing an onboarding baseline for brand visibility measurement across ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews, and agentic search.

Brand: {{brand_name}}
Domain: {{domain}}
Industry: {{industry}}
Description: {{description}}
Competitors: {{competitors}}

Generate exactly 10 topic clusters that a revenue, marketing, or buying committee would use to evaluate this brand's visibility.

Requirements:
- Cover these intents across the set: category discovery, vendor comparison, use-case fit, implementation/problem solving, trust/proof, pricing/value, alternatives, local/market context when relevant, product/service capability, and category education.
- Include topics where the brand should appear even if the user does not mention the brand by name.
- Be specific to the provided industry, description, domain signals, and competitors.
- Avoid generic buckets like "Digital Marketing", "AI Tools", "Technology", or "Reviews" unless they include a concrete category/use case.
- Each topic must be 2-7 words, buyer-readable, and suitable for grouping many AI-assistant prompts.

Return ONLY a JSON array of strings, no other text. Example: ["Enterprise AI Solutions", "Cloud Security", "API Management"]`;

      const prompt = await resolvePromptTemplateByName(
        "Topic Generation (Route)",
        fallbackPrompt,
        {
          brand_name: brand.name,
          domain: brand.domain,
          industry: brand.industry || "Technology",
          description: brand.description || "",
          competitors: competitorNames || "N/A",
        },
      );

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://airank.com',
          'X-Title': 'AIRank',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${err.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "[]";

      let topics: string[];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        topics = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        topics = content.split('\n').filter((l: string) => l.trim()).map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, '').trim()).filter((l: string) => l.length > 0 && l.length < 60).slice(0, 10);
      }

      res.json({ topics: topics.slice(0, 10) });
    } catch (error: any) {
      console.error("Topic generation error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= AI QUERY GENERATION (OpenRouter) =============

  app.post("/api/brands/:brandId/generate-queries", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { competitors, topics } = req.body;
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "OpenRouter API key not configured" });
      }

      const competitorNames = (competitors || []).map((c: any) => c.name || c.domain).join(", ");
      const topicList = (topics || []).join(", ");

      const fallbackPrompt = `You are an enterprise AI visibility strategist creating a first-run prompt panel to evaluate whether AI assistants recommend, cite, compare, and correctly understand a brand.

Brand: {{brand_name}}
Domain: {{domain}}
Industry: {{industry}}
Description: {{description}}
Competitors: {{competitors}}
Selected Topics: {{topics}}

Generate exactly 15 realistic prompts that people would ask ChatGPT, Claude, Gemini, Perplexity, or Google AI Overviews.

The set must include:
- Unbranded category discovery prompts where the brand should be eligible to appear.
- Direct competitor comparison prompts using provided competitors where available.
- Alternatives prompts ("alternatives to X", "best X for Y") tied to selected topics.
- Buyer evaluation prompts involving proof, pricing/value, implementation risk, and ideal customer fit.
- Problem/use-case prompts that reveal whether the brand is cited as a solution.
- At least 3 prompts that do not mention {{brand_name}}, at least 3 that mention {{brand_name}}, and at least 3 that mention a competitor when competitors are provided.

Quality rules:
- Write natural full questions or commands, not keywords.
- Do not invent competitors beyond the provided list.
- Avoid vague prompts like "Tell me about {{brand_name}}" unless adding a specific buying context.
- Keep each prompt under 180 characters.

Return ONLY a JSON array of strings, no other text. Example: ["Best enterprise AI platforms 2025", "How to choose a cloud provider"]`;

      const prompt = await resolvePromptTemplateByName(
        "Query Generation (Route)",
        fallbackPrompt,
        {
          brand_name: brand.name,
          domain: brand.domain,
          industry: brand.industry || "Technology",
          description: brand.description || "",
          competitors: competitorNames || "N/A",
          topics: topicList || "N/A",
        },
      );

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://airank.com',
          'X-Title': 'AIRank',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8,
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${err.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "[]";

      let queries: string[];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        queries = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        queries = content.split('\n').filter((l: string) => l.trim()).map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, '').trim()).filter((l: string) => l.length > 0 && l.length < 120).slice(0, 15);
      }

      const promptSuggestions = queries.slice(0, 15);
      res.json({ queries: promptSuggestions, prompts: promptSuggestions });
    } catch (error: any) {
      console.error("Query generation error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= TEAM MEMBER ROUTES =============

  app.get("/api/brands/:brandId/team", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const members = await storage.getTeamMembersByBrand(req.params.brandId);
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/team", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const email = String(req.body?.email || "").trim().toLowerCase();
      const role = String(req.body?.role || "viewer");
      const tempPassword = String(req.body?.tempPassword || "").trim();
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!tempPassword || tempPassword.length < 8) {
        return res.status(400).json({ message: "Temporary password must be at least 8 characters" });
      }
      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const existing = (await storage.getTeamMembersByBrand(req.params.brandId)).find((m: any) => String(m.email || "").toLowerCase() === email);
      if (existing) {
        return res.status(400).json({ message: "Member already invited" });
      }

      let linkedUser = await storage.getUserByEmail(email);
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      let credentialsSent = false;

      if (!linkedUser) {
        const newUserId = crypto.randomUUID();

        await db.insert(usersTable).values({
          id: newUserId,
          email,
          firstName: email.split("@")[0],
          lastName: "",
          passwordHash,
          emailVerified: true,
          onboardingCompleted: true,
          onboardingStep: 3,
          authProvider: "email",
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          requirePasswordChange: true,
        });

        linkedUser = await storage.getUserByEmail(email);
        if (!linkedUser) {
          return res.status(500).json({ message: "Failed to create user account" });
        }
      } else {
        await storage.updateUser(linkedUser.id, {
          passwordHash,
          emailVerified: true,
          onboardingCompleted: true,
          onboardingStep: 3,
          requirePasswordChange: true,
          passwordChangedAt: new Date(),
        } as any);
      }

      const data = insertTeamMemberSchema.parse({
        brandId: req.params.brandId,
        userId: linkedUser?.id || null,
        email,
        role,
        status: "active",
        invitedBy: userId,
        acceptedAt: new Date(),
      });

      const member = await storage.createTeamMember(data);
      try {
        const inviter = await storage.getUser(userId);
        const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ").trim();
        await sendTeamInviteCredentials(email, inviterName, brand.name, tempPassword);
        credentialsSent = true;
      } catch (emailError: any) {
        logger.warn("[TeamInvite] Failed to send invite email", {
          brandId: brand.id,
          email,
          error: String(emailError?.message || emailError),
        });
      }

      await createAuditLog(req, "create", "team_member", member.id, null, member);
      res.json({ ...member, credentialsSent });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/team/:memberId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const targetMember = await storage.getTeamMember(qstr(req.params.memberId));
      if (!targetMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      const [brand, currentUser] = await Promise.all([
        storage.getBrand(targetMember.brandId),
        storage.getUser(userId).catch(() => undefined),
      ]);
      if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
        return res.status(404).json({ message: "Team member not found" });
      }
      req.params.brandId = brand.id;

      const updates = {
        role: req.body?.role || targetMember.role,
        status: req.body?.status || targetMember.status,
      };

      const updated = await storage.updateTeamMember(targetMember.id, updates as any);
      await createAuditLog(req, "update", "team_member", updated.id, targetMember, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team/:memberId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const targetMember = await storage.getTeamMember(qstr(req.params.memberId));
      if (!targetMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      const [brand, currentUser] = await Promise.all([
        storage.getBrand(targetMember.brandId),
        storage.getUser(userId).catch(() => undefined),
      ]);
      if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
        return res.status(404).json({ message: "Team member not found" });
      }
      req.params.brandId = brand.id;

      await storage.deleteTeamMember(targetMember.id);
      await createAuditLog(req, "delete", "team_member", targetMember.id, targetMember, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= COMPETITOR ROUTES =============
  
  app.get("/api/brands/:brandId/competitors", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const competitors = await storage.getCompetitorsByBrand(req.params.brandId);
      res.json(competitors);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/competitors", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = insertCompetitorSchema.parse({ ...req.body, brandId: req.params.brandId });
      const competitor = await storage.createCompetitor(data);
      await createAuditLog(req, "create", "competitor", competitor.id, null, competitor);
      res.json(competitor);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/competitors/:competitorId", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateCompetitor(qstr(req.params.competitorId), req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/brands/:brandId/competitors/:competitorId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      await storage.deleteCompetitor(req.params.competitorId);
      await createAuditLog(req, "delete", "competitor", req.params.competitorId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Competitors Matrix
  app.get("/api/brands/:brandId/competitors/matrix", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const competitors = await storage.getCompetitorsByBrand(req.params.brandId);
      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, 5000);
      const allMentions = await storage.getAllMentionsForBrand(req.params.brandId, 5000);

      const brandOnlyMentions = allMentions.filter(m => !m.competitorId);

      const matrix = competitors.map((competitor) => {
        const competitorMentions = allMentions.filter(m => m.competitorId === competitor.id);

        const sharedPrompts = new Set<string>();
        const brandWins = new Set<string>();
        const competitorWins = new Set<string>();

        answers.forEach(answer => {
          const brandMention = brandOnlyMentions.find(m => m.llmAnswerId === answer.id);
          const compMention = competitorMentions.find(m => m.llmAnswerId === answer.id);

          if (brandMention || compMention) {
            sharedPrompts.add(answer.promptId);

            if (brandMention && !compMention) {
              brandWins.add(answer.promptId);
            } else if (compMention && !brandMention) {
              competitorWins.add(answer.promptId);
            } else if (brandMention && compMention) {
              if ((brandMention.position || 999) < (compMention.position || 999)) {
                brandWins.add(answer.promptId);
              } else {
                competitorWins.add(answer.promptId);
              }
            }
          }
        });

        const headToHeadScore = sharedPrompts.size > 0
          ? (brandWins.size / sharedPrompts.size) * 100
          : 0;

        const totalMentions = brandOnlyMentions.length + competitorMentions.length;
        const marketShare = totalMentions > 0
          ? (brandOnlyMentions.length / totalMentions) * 100
          : 0;

        const compVisScore = competitorMentions.length > 0
          ? Math.round((new Set(competitorMentions.map(m => m.llmAnswerId)).size / Math.max(answers.length, 1)) * 100)
          : 0;

        const compPositions = competitorMentions.filter(m => m.position).map(m => m.position!);
        const compAvgRank = compPositions.length > 0
          ? Math.round((compPositions.reduce((a, b) => a + b, 0) / compPositions.length) * 10) / 10
          : 0;

        const threatScore = Math.min(100, Math.round(
          (competitorMentions.length / Math.max(brandOnlyMentions.length, 1)) * 50 +
          (headToHeadScore > 50 ? 0 : (50 - headToHeadScore))
        ));

        // Apply admin competitor override if set
        const overrides = (brand as any).competitorOverrides as Record<string, number> | null;
        const overrideVisScore = overrides?.[competitor.id] ?? null;

        return {
          competitorId: competitor.id,
          competitorName: competitor.name,
          competitorDomain: competitor.domain,
          sharedPrompts: sharedPrompts.size,
          brandWins: brandWins.size,
          competitorWins: competitorWins.size,
          headToHeadScore: Math.round(headToHeadScore * 10) / 10,
          marketShare: Math.round(marketShare * 10) / 10,
          brandMentionCount: brandOnlyMentions.length,
          competitorMentionCount: competitorMentions.length,
          competitorVisScore: overrideVisScore ?? compVisScore,
          competitorAvgRank: compAvgRank,
          threatScore,
          hasOverride: overrideVisScore != null,
        };
      });

      res.json(matrix);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Competitor Comparison
  app.get("/api/brands/:brandId/competitors/:competitorId/comparison", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const competitors = await storage.getCompetitorsByBrand(req.params.brandId);
      const competitor = competitors.find(c => c.id === req.params.competitorId);

      if (!competitor) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, 1000);
      const brandMentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 1000);

      // For now, return basic comparison structure
      // TODO: Implement competitor mention tracking in database
      const brandScore = answers.length > 0
        ? (brandMentions.length / answers.length) * 100
        : 0;

      res.json({
        competitor: {
          id: competitor.id,
          name: competitor.name,
          domain: competitor.domain,
        },
        overall: {
          brandScore: Math.round(brandScore * 10) / 10,
          competitorScore: 0, // TODO: Track competitor mentions
          gap: 0,
        },
        perModel: [],
        brandMentions: brandMentions.length,
        competitorMentions: 0,
        note: "Competitor mention tracking will be implemented in future update",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= TOPIC ROUTES =============
  
  app.get("/api/brands/:brandId/topics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [topics, prompts, answers, mentions] = await Promise.all([
        storage.getTopicsByBrand(brandId),
        storage.getPromptsByBrand(brandId),
        storage.getLlmAnswersByBrand(brandId, 5000),
        storage.getAnswerMentionsByBrand(brandId, 5000),
      ]);

      const enrichedTopics = topics.map((topic: any) => {
        const topicPrompts = prompts.filter((p: any) => p.topicId === topic.id);

        // Keep topics with zero prompts visible as "not tracked".
        if (topicPrompts.length === 0) {
          return {
            ...topic,
            promptCount: 0,
            visibilityScore: 0,
            brandMentionCount: 0,
            trend7d: 0,
            tracked: false,
          };
        }

        const promptIds = new Set(topicPrompts.map((p: any) => p.id));
        const topicAnswers = answers.filter((a: any) => promptIds.has(a.promptId));
        const answerIds = new Set(topicAnswers.map((a: any) => a.id));
        const topicMentions = mentions.filter((m: any) => answerIds.has(m.llmAnswerId) && !m.competitorId);

        // Visibility: average of topic prompts visibilityPct
        const promptVisibilityValues = topicPrompts
          .map((p: any) => Number(p.visibilityPct))
          .filter((v: number) => Number.isFinite(v));
        const visibilityScore = promptVisibilityValues.length > 0
          ? Math.round(promptVisibilityValues.reduce((sum: number, v: number) => sum + v, 0) / promptVisibilityValues.length)
          : 0;

        // Brand mentions: number of prompts in this topic where brand was present
        const brandMentionCount = topicPrompts.filter((p: any) => Boolean(p.isBrandPresent)).length;

        // Trend 7d: compare brand-mention rate in last 7d vs previous 7d
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

        const currentAnswers = topicAnswers.filter((a: any) => {
          const ts = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          return ts >= sevenDaysAgo;
        });
        const previousAnswers = topicAnswers.filter((a: any) => {
          const ts = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          return ts >= fourteenDaysAgo && ts < sevenDaysAgo;
        });

        const currentAnswerIds = new Set(currentAnswers.map((a: any) => a.id));
        const previousAnswerIds = new Set(previousAnswers.map((a: any) => a.id));

        const currentMentioned = new Set(
          topicMentions.filter((m: any) => currentAnswerIds.has(m.llmAnswerId)).map((m: any) => m.llmAnswerId)
        ).size;
        const previousMentioned = new Set(
          topicMentions.filter((m: any) => previousAnswerIds.has(m.llmAnswerId)).map((m: any) => m.llmAnswerId)
        ).size;

        const currentPct = currentAnswers.length > 0 ? (currentMentioned / currentAnswers.length) * 100 : 0;
        const previousPct = previousAnswers.length > 0 ? (previousMentioned / previousAnswers.length) * 100 : 0;
        const trend7d = Math.round((currentPct - previousPct) * 10) / 10;

        return {
          ...topic,
          promptCount: topicPrompts.length,
          visibilityScore,
          brandMentionCount,
          trend7d,
          tracked: true,
        };
      });

      res.json(enrichedTopics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/dashboard-analytics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [answers, mentions, competitors, allMentions] = await Promise.all([
        storage.getLlmAnswersByBrand(brandId, 5000),
        storage.getAnswerMentionsByBrand(brandId, 5000),
        storage.getCompetitorsByBrand(brandId),
        storage.getAllMentionsForBrand(brandId, 5000),
      ]);

      const brandMentions = allMentions.filter((m: any) => !m.competitorId);

      const providerMap: Record<string, { total: number; brandMentioned: number; positions: number[] }> = {};
      answers.forEach((a: any) => {
        const provider = a.llmProvider || 'unknown';
        if (!providerMap[provider]) providerMap[provider] = { total: 0, brandMentioned: 0, positions: [] };
        providerMap[provider].total++;
        const bm = brandMentions.filter((m: any) => m.llmAnswerId === a.id);
        if (bm.length > 0) {
          providerMap[provider].brandMentioned++;
          bm.forEach((m: any) => { if (m.position) providerMap[provider].positions.push(m.position); });
        }
      });

      const modelPerformance = Object.entries(providerMap).map(([provider, data]) => ({
        provider,
        displayName: provider === 'openai' ? 'ChatGPT' : provider === 'anthropic' ? 'Claude' : provider === 'google' ? 'Gemini' : provider === 'perplexity' ? 'Perplexity' : provider === 'grok' ? 'Grok' : provider === 'deepseek' ? 'DeepSeek' : provider,
        totalAnswers: data.total,
        brandMentioned: data.brandMentioned,
        score: data.total > 0 ? Math.round((data.brandMentioned / data.total) * 100) : 0,
        avgRank: data.positions.length > 0 ? Math.round((data.positions.reduce((a, b) => a + b, 0) / data.positions.length) * 10) / 10 : 0,
      }));

      const brandTotalMentions = brandMentions.length;
      const competitorShares = competitors.map((comp: any) => {
        const compMentions = allMentions.filter((m: any) => m.competitorId === comp.id);
        return { id: comp.id, name: comp.name, mentions: compMentions.length };
      });
      const allEntitiesMentions = brandTotalMentions + competitorShares.reduce((s: number, c: any) => s + c.mentions, 0);

      const rawVisibility = [
        { name: brand.name || 'Your Brand', mentions: brandTotalMentions, isBrand: true },
        ...competitorShares.map((c: any) => ({ name: c.name, mentions: c.mentions, isBrand: false })),
      ];
      let assignedShare = 0;
      const competitiveVisibility = rawVisibility.map((entry, idx) => {
        const rawShare = allEntitiesMentions > 0 ? (entry.mentions / allEntitiesMentions) * 100 : 0;
        const share = idx === rawVisibility.length - 1 && allEntitiesMentions > 0
          ? Math.max(0, 100 - assignedShare)
          : Math.round(rawShare);
        assignedShare += share;
        return { ...entry, share };
      });

      const getCTR = (position: number | null | undefined): number => {
        if (!position || position < 1) return 0.03;
        if (position === 1) return 0.30;
        if (position === 2) return 0.15;
        if (position === 3) return 0.08;
        return 0.03;
      };

      const computeTraffic = (entityMentions: any[]): number => {
        return entityMentions.reduce((sum: number, m: any) => sum + getCTR(m.position), 0);
      };

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const computeChangePercent = (entityMentions: any[]): number => {
        const recent = entityMentions.filter((m: any) => m.createdAt && new Date(m.createdAt) >= sevenDaysAgo).length;
        const previous = entityMentions.filter((m: any) => m.createdAt && new Date(m.createdAt) >= fourteenDaysAgo && new Date(m.createdAt) < sevenDaysAgo).length;
        if (previous === 0) return recent > 0 ? 100 : 0;
        return Math.round(((recent - previous) / previous) * 100);
      };

      const brandTraffic = Math.round(computeTraffic(brandMentions) * 30);
      const brandChangePercent = computeChangePercent(brandMentions);

      const competitorTrafficData = competitors.map((comp: any) => {
        const compMentions = allMentions.filter((m: any) => m.competitorId === comp.id);
        return {
          name: comp.name,
          traffic: Math.round(computeTraffic(compMentions) * 30),
          changePercent: computeChangePercent(compMentions),
        };
      }).sort((a: any, b: any) => b.traffic - a.traffic);

      const topCompetitor = competitorTrafficData.length > 0 ? competitorTrafficData[0] : null;
      const otherCompetitors = competitorTrafficData.slice(1);

      const totalTraffic = brandTraffic + competitorTrafficData.reduce((s: number, c: any) => s + c.traffic, 0);
      const trafficValue = totalTraffic >= 500 ? "High" : totalTraffic >= 100 ? "Moderate" : "Low to moderate";

      const trafficEstimates = {
        brand: { name: brand.name || 'Your Brand', traffic: brandTraffic, changePercent: brandChangePercent },
        topCompetitor,
        otherCompetitors,
        trafficValue,
      };

      const computeSentiment = (entityMentions: any[]): { sentiment: string; confidence: number } => {
        let positive = 0, neutral = 0, negative = 0;
        entityMentions.forEach((m: any) => {
          const s = (m.sentiment || '').toLowerCase();
          if (s === 'positive') positive++;
          else if (s === 'negative') negative++;
          else neutral++;
        });
        const total = positive + neutral + negative;
        if (total === 0) return { sentiment: 'Neutral', confidence: 0 };
        const max = Math.max(positive, neutral, negative);
        const confidence = Math.round((max / total) * 100);
        const sentiment = max === positive ? 'Positive' : max === negative ? 'Negative' : 'Neutral';
        return { sentiment, confidence };
      };

      const brandSentimentData = computeSentiment(brandMentions);
      const brandSentimentDescription = brandSentimentData.sentiment === 'Positive'
        ? "AI models portray your brand favorably in their responses, which helps build trust and increases likelihood of recommendations."
        : brandSentimentData.sentiment === 'Negative'
        ? "AI models tend to portray your brand less favorably. Consider improving content signals to shift AI perception."
        : "AI models present your brand in a balanced, neutral manner across their responses.";

      const sentimentAnalysis = {
        brand: {
          name: brand.name || 'Your Brand',
          sentiment: brandSentimentData.sentiment,
          confidence: brandSentimentData.confidence,
          description: brandSentimentDescription,
        },
        competitors: competitors.map((comp: any) => {
          const compMentions = allMentions.filter((m: any) => m.competitorId === comp.id);
          const s = computeSentiment(compMentions);
          return { name: comp.name, sentiment: s.sentiment, confidence: s.confidence };
        }),
      };

      res.json({ modelPerformance, competitiveVisibility, trafficEstimates, sentimentAnalysis });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tier S4 — "Score by Intent" widget. Returns visibility score broken down by
  // prompt intent (buying/comparison/problem/etc.). Each intent carries its own
  // weight in INTENT_WEIGHT_TABLE; a brand can have a great score on discovery
  // (low weight) and still fail the high-weight intents that drive decisions.
  // GET /api/brands/:brandId/answer-intelligence - Sentiment, position, and perception analysis
  app.get("/api/brands/:brandId/answer-intelligence", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [answers, prompts, competitors, allMentions] = await Promise.all([
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
      ]);

      const answerById = new Map((answers as any[]).map((answer: any) => [answer.id, answer]));
      const promptById = new Map((prompts as any[]).map((prompt: any) => [prompt.id, prompt]));
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId);
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId);

      const sentimentValue = (sentiment: string | null | undefined) => {
        const normalized = String(sentiment || '').toLowerCase();
        if (normalized === 'positive') return 1;
        if (normalized === 'negative') return -1;
        return 0;
      };
      const sentimentCounts = (mentions: any[]) => mentions.reduce((acc: any, mention: any) => {
        const normalized = String(mention.sentiment || '').toLowerCase();
        const key = ['positive', 'negative', 'neutral'].includes(normalized) ? normalized : 'neutral';
        acc[key] += 1;
        return acc;
      }, { positive: 0, neutral: 0, negative: 0 });
      const sentimentScore = (mentions: any[]) => {
        if (mentions.length === 0) return 0;
        const raw = mentions.reduce((sum: number, mention: any) => sum + sentimentValue(mention.sentiment), 0) / mentions.length;
        return Math.round(raw * 100);
      };
      const avgPosition = (mentions: any[]) => {
        const positions = mentions.map((mention: any) => Number(mention.position)).filter((position: number) => Number.isFinite(position) && position > 0);
        if (positions.length === 0) return null;
        return Math.round((positions.reduce((sum: number, position: number) => sum + position, 0) / positions.length) * 10) / 10;
      };
      const topPosition = (mentions: any[]) => {
        const positions = mentions.map((mention: any) => Number(mention.position)).filter((position: number) => Number.isFinite(position) && position > 0);
        return positions.length ? Math.min(...positions) : null;
      };

      const totalEntityMentions = brandMentions.length + competitorMentions.length;
      const brandShare = totalEntityMentions > 0 ? Math.round((brandMentions.length / totalEntityMentions) * 100) : 0;
      const competitorShare = totalEntityMentions > 0 ? Math.max(0, 100 - brandShare) : 0;
      const brandMentionedAnswers = new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size;
      const mentionRate = (answers as any[]).length > 0 ? Math.round((brandMentionedAnswers / (answers as any[]).length) * 100) : 0;
      const brandSentimentScore = sentimentScore(brandMentions);
      const brandAvgPosition = avgPosition(brandMentions);

      const providerMap = new Map<string, { provider: string; answers: number; brandMentions: any[]; competitorMentions: any[] }>();
      (answers as any[]).forEach((answer: any) => {
        const provider = String(answer.llmProvider || answer.provider || answer.llmModel || 'unknown');
        if (!providerMap.has(provider)) providerMap.set(provider, { provider, answers: 0, brandMentions: [], competitorMentions: [] });
        providerMap.get(provider)!.answers += 1;
      });
      (allMentions as any[]).forEach((mention: any) => {
        const answer = answerById.get(mention.llmAnswerId);
        const provider = String(answer?.llmProvider || answer?.provider || answer?.llmModel || 'unknown');
        if (!providerMap.has(provider)) providerMap.set(provider, { provider, answers: 0, brandMentions: [], competitorMentions: [] });
        if (mention.competitorId) providerMap.get(provider)!.competitorMentions.push(mention);
        else providerMap.get(provider)!.brandMentions.push(mention);
      });

      const byProvider = Array.from(providerMap.values()).map((provider) => {
        const providerTotal = provider.brandMentions.length + provider.competitorMentions.length;
        return {
          provider: provider.provider,
          answers: provider.answers,
          brandMentions: provider.brandMentions.length,
          competitorMentions: provider.competitorMentions.length,
          shareOfVoice: providerTotal > 0 ? Math.round((provider.brandMentions.length / providerTotal) * 100) : 0,
          avgPosition: avgPosition(provider.brandMentions),
          sentimentScore: sentimentScore(provider.brandMentions),
        };
      }).sort((a, b) => b.answers - a.answers);

      const competitorRows = (competitors as any[]).map((competitor: any) => {
        const mentions = competitorMentions.filter((mention: any) => mention.competitorId === competitor.id);
        return {
          id: competitor.id,
          name: competitor.name,
          mentions: mentions.length,
          share: totalEntityMentions > 0 ? Math.round((mentions.length / totalEntityMentions) * 100) : 0,
          avgPosition: avgPosition(mentions),
          topPosition: topPosition(mentions),
          sentimentScore: sentimentScore(mentions),
          sentiment: sentimentCounts(mentions),
        };
      }).sort((a: any, b: any) => b.mentions - a.mentions);

      const promptRisks = (answers as any[]).map((answer: any) => {
        const prompt = promptById.get(answer.promptId);
        const mentionsForAnswer = (allMentions as any[]).filter((mention: any) => mention.llmAnswerId === answer.id);
        const brandInAnswer = mentionsForAnswer.filter((mention: any) => !mention.competitorId);
        const competitorsInAnswer = mentionsForAnswer.filter((mention: any) => mention.competitorId);
        const negativeSentiment = brandInAnswer.some((mention: any) => String(mention.sentiment || '').toLowerCase() === 'negative');
        const averagePosition = avgPosition(brandInAnswer);
        const missingBrand = brandInAnswer.length === 0;
        const lowPosition = averagePosition != null && averagePosition > 3;
        const competitorPressure = competitorsInAnswer.length > brandInAnswer.length;
        const severity = missingBrand || negativeSentiment ? 'high' : lowPosition || competitorPressure ? 'medium' : 'low';
        return {
          answerId: answer.id,
          promptId: answer.promptId,
          prompt: prompt?.text || answer.promptText || 'Tracked prompt',
          category: prompt?.category || prompt?.intent || 'general',
          provider: answer.llmProvider || answer.llmModel || 'unknown',
          severity,
          missingBrand,
          lowPosition,
          negativeSentiment,
          competitorPressure,
          brandMentions: brandInAnswer.length,
          competitorMentions: competitorsInAnswer.length,
          avgPosition: averagePosition,
          action: missingBrand
            ? 'Create or strengthen content that directly answers this buyer prompt and names the brand clearly.'
            : negativeSentiment
            ? 'Add proof, reviews, guarantees, comparisons, or support content that corrects negative AI perception.'
            : lowPosition
            ? 'Improve authority and answer specificity so the brand appears in the top three recommendations.'
            : competitorPressure
            ? 'Build comparison content and proof assets against the competitors appearing in this answer.'
            : 'Monitor this prompt for drift.',
        };
      })
      .filter((item: any) => item.severity !== 'low')
      .sort((a: any, b: any) => {
        const severityRank: Record<string, number> = { high: 2, medium: 1, low: 0 };
        return severityRank[b.severity] - severityRank[a.severity];
      })
      .slice(0, 12);

      const positionScore = brandAvgPosition == null ? 0 : brandAvgPosition <= 3 ? 100 : 55;
      const score = Math.round(
        (mentionRate * 0.35) +
        (Math.max(0, brandSentimentScore + 100) / 2 * 0.25) +
        (brandShare * 0.25) +
        (positionScore * 0.15)
      );

      const nextActions = [
        brandShare < 50 ? 'Increase share of voice by targeting prompts where competitors are mentioned and the brand is absent.' : '',
        brandSentimentScore < 20 ? 'Improve sentiment with evidence pages, reviews, guarantees, case studies, and corrective comparison content.' : '',
        (brandAvgPosition || 99) > 3 ? 'Move brand mentions into top-three recommendation positions with stronger category authority and answer-ready content.' : '',
        promptRisks.length > 0 ? 'Convert the highest-risk prompts into Action Workflow tasks and verify with a rescan.' : '',
      ].filter(Boolean);

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict: score >= 80 ? 'Strong AI perception' : score >= 60 ? 'Mixed perception with fixable gaps' : 'Weak AI perception',
        summary: {
          answers: (answers as any[]).length,
          totalEntityMentions,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          mentionRate,
          brandShare,
          competitorShare,
          avgPosition: brandAvgPosition,
          topPosition: topPosition(brandMentions),
          sentimentScore: brandSentimentScore,
          sentiment: sentimentCounts(brandMentions),
        },
        byProvider,
        competitors: competitorRows,
        promptRisks,
        nextActions,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[AnswerIntelligence] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/score-by-intent", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const rows = await storage.getMentionsByIntent(brandId, 5000);

      // Group by intent. Within each intent, compute the share of brand mentions
      // (not competitor mentions) and a weighted score using the same formula as
      // visibility-scoring.ts but at the per-intent level.
      type Bucket = {
        intent: string;
        weight: number;
        totalAnswers: number;
        brandMentions: number;
        competitorMentions: number;
        positions: number[];
        sentiments: string[];
        score: number;
        mentionRate: number;
        topProvider: string;
        byProvider: Record<string, { answers: number; brandMentioned: number; score: number }>;
      };

      const buckets: Record<string, Bucket> = {};
      for (const row of rows) {
        const intent = row.intent || 'discovery';
        if (!buckets[intent]) {
          buckets[intent] = {
            intent,
            weight: INTENT_WEIGHT_TABLE[intent] ?? 0.7,
            totalAnswers: 0,
            brandMentions: 0,
            competitorMentions: 0,
            positions: [],
            sentiments: [],
            score: 0,
            mentionRate: 0,
            topProvider: '—',
            byProvider: {},
          };
        }
        const b = buckets[intent];
        b.totalAnswers++;
        if (!b.byProvider[row.provider]) {
          b.byProvider[row.provider] = { answers: 0, brandMentioned: 0, score: 0 };
        }
        b.byProvider[row.provider].answers++;
        if (!row.isBrandMention) {
          b.brandMentions++;
          b.byProvider[row.provider].brandMentioned++;
          if (row.position != null) b.positions.push(row.position);
          if (row.sentiment) b.sentiments.push(row.sentiment);
        } else {
          b.competitorMentions++;
        }
      }

      // Compute per-intent score: scaled mention-rate (0-100) weighted by position + sentiment
      const computeIntentScore = (b: Bucket): number => {
        if (b.brandMentions === 0 && b.totalAnswers === 0) return 0;
        // Per-provider mention rates
        const providerRates: number[] = [];
        for (const p of Object.values(b.byProvider)) {
          if (p.answers > 0) providerRates.push((p.brandMentioned / p.answers) * 100);
        }
        const mentionRate = providerRates.length > 0
          ? providerRates.reduce((a, b) => a + b, 0) / providerRates.length
          : 0;
        b.mentionRate = Math.round(mentionRate * 10) / 10;

        // Position score
        const pos = b.positions;
        const posScore = pos.length > 0
          ? pos.reduce((acc, p) => {
              if (p === 1) return acc + 100;
              if (p <= 3) return acc + 70;
              if (p <= 5) return acc + 40;
              return acc + 10;
            }, 0) / pos.length
          : 0;
        // Sentiment score
        const sentMap: Record<string, number> = { positive: 100, neutral: 50, negative: 0 };
        const sentScore = b.sentiments.length > 0
          ? b.sentiments.reduce((a, s) => a + (sentMap[s] ?? 50), 0) / b.sentiments.length
          : 50;
        // Composite: mention 50% + position 30% + sentiment 20%
        const composite = mentionRate * 0.5 + posScore * 0.3 + sentScore * 0.2;
        return Math.round(composite);
      };

      for (const b of Object.values(buckets)) {
        b.score = computeIntentScore(b);
        // top provider by score
        let best: { name: string; score: number } = { name: '—', score: -1 };
        for (const [name, p] of Object.entries(b.byProvider)) {
          p.score = p.answers > 0 ? Math.round((p.brandMentioned / p.answers) * 100) : 0;
          if (p.score > best.score) best = { name, score: p.score };
        }
        b.topProvider = best.name;
      }

      // Sort intents by their weight (high-stakes first), then by score
      const intentOrder: string[] = Object.keys(INTENT_WEIGHT_TABLE);
      const sortedIntents = Object.values(buckets).sort((a, b) => {
        const ai = intentOrder.indexOf(a.intent);
        const bi = intentOrder.indexOf(b.intent);
        const aw = ai === -1 ? 99 : ai;
        const bw = bi === -1 ? 99 : bi;
        if (aw !== bw) return aw - bw;
        return b.score - a.score;
      });

      // Summary stats
      const totalIntents = sortedIntents.length;
      const strongIntents = sortedIntents.filter(b => b.score >= 60).length;
      const weakIntents = sortedIntents.filter(b => b.score < 30).length;
      const highWeightIntents = sortedIntents.filter(b => b.weight >= 1.3);
      const highWeightAvg = highWeightIntents.length > 0
        ? Math.round(highWeightIntents.reduce((s, b) => s + b.score, 0) / highWeightIntents.length)
        : 0;

      res.json({
        brandId,
        brandName: brand.name,
        intents: sortedIntents,
        summary: {
          totalIntents,
          strongIntents,
          weakIntents,
          highWeightAvg,
          // The headline number: how well is the brand doing on the prompts that
          // actually drive purchase decisions (high-weight intents)?
          decisionScore: highWeightAvg,
        },
        weightTable: INTENT_WEIGHT_TABLE,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tier S5 — "AI Recommendation Share" share-card endpoint.
  // Aggregates recommendation_ranks into a sharable shape: overall share %,
  // per-provider breakdown, top peer brands the LLM keeps recommending instead.
  app.get("/api/brands/:brandId/recommendation-share", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const brandId = req.params.brandId;

      const rows = await storage.getRecommendationShareStats(brandId);
      if (rows.length === 0) {
        return res.json({
          brandId,
          sharePct: 0,
          totalRuns: 0,
          recommended: 0,
          byProvider: [],
          byIntent: [],
          topCompetitors: [],
          trend: [],
          generatedAt: new Date().toISOString(),
        });
      }

      // Overall share
      const totalRuns = rows.length;
      const recommended = rows.filter(r => r.isRecommended).length;
      const sharePct = Math.round((recommended / totalRuns) * 100);

      // Per-provider
      const byProviderMap: Record<string, { runs: number; recommended: number; sharePct: number }> = {};
      for (const r of rows) {
        byProviderMap[r.llmProvider] = byProviderMap[r.llmProvider] ?? { runs: 0, recommended: 0, sharePct: 0 };
        byProviderMap[r.llmProvider].runs++;
        if (r.isRecommended) byProviderMap[r.llmProvider].recommended++;
      }
      const byProvider = Object.entries(byProviderMap)
        .map(([p, v]) => ({ provider: p, runs: v.runs, recommended: v.recommended, sharePct: Math.round((v.recommended / v.runs) * 100) }))
        .sort((a, b) => b.sharePct - a.sharePct);

      // By intent
      const byIntentMap: Record<string, { runs: number; recommended: number }> = {};
      for (const r of rows) {
        const intent = (r as any).intent ?? 'unknown';
        byIntentMap[intent] = byIntentMap[intent] ?? { runs: 0, recommended: 0 };
        byIntentMap[intent].runs++;
        if (r.isRecommended) byIntentMap[intent].recommended++;
      }
      const byIntent = Object.entries(byIntentMap)
        .map(([i, v]) => ({ intent: i, runs: v.runs, recommended: v.recommended, sharePct: Math.round((v.recommended / v.runs) * 100) }))
        .sort((a, b) => b.sharePct - a.sharePct);

      // Top peer brands the LLM keeps recommending instead of us
      const peerCounts: Record<string, number> = {};
      for (const r of rows) {
        if (r.isRecommended) continue; // skip rows where we *were* recommended
        for (const peer of (r.topBrands ?? []) as string[]) {
          const key = peer.toLowerCase();
          if (key === brand.name.toLowerCase()) continue;
          peerCounts[peer] = (peerCounts[peer] ?? 0) + 1;
        }
      }
      const topCompetitors = Object.entries(peerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Trend: bucket by day for the last 14 days
      const now = new Date();
      const buckets: Record<string, { runs: number; recommended: number }> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = { runs: 0, recommended: 0 };
      }
      for (const r of rows) {
        const key = (r.runAt instanceof Date ? r.runAt : new Date(r.runAt)).toISOString().slice(0, 10);
        if (!buckets[key]) continue;
        buckets[key].runs++;
        if (r.isRecommended) buckets[key].recommended++;
      }
      const trend = Object.entries(buckets).map(([date, v]) => ({
        date,
        sharePct: v.runs ? Math.round((v.recommended / v.runs) * 100) : 0,
        runs: v.runs,
      }));

      res.json({
        brandId,
        sharePct,
        totalRuns,
        recommended,
        byProvider,
        byIntent,
        topCompetitors,
        trend,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Trigger a new simulation run (used by the "Re-run" button on the share card).
  app.post("/api/brands/:brandId/recommendation-share/simulate", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const { getJobQueue } = await import('./jobs/queue');
      const q = getJobQueue();
      const jobId = await q.addJob('recommendation_simulation', {
        brandId: req.params.brandId,
        maxPrompts: 6,
        maxProviders: 4,
        forceRun: true,
      } as any, 5);
      res.json({ jobId, status: 'queued' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/topics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = insertTopicSchema.parse({ ...req.body, brandId: req.params.brandId });
      if (!data.category) data.category = "general";
      const topic = await storage.createTopic(data);
      res.json(topic);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= CONTENT OPTIMIZATION ROUTES =============

  // GET /api/brands/:brandId/optimize/topic/:topicId - Analyze topic and get suggestions
  app.get("/api/brands/:brandId/optimize/topic/:topicId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getContentOptimizer } = await import('./services/content-optimizer');
      const optimizer = getContentOptimizer();
      const analysis = await optimizer.analyzeForTopic(req.params.brandId, req.params.topicId);

      res.json(analysis);
    } catch (error: any) {
      console.error('[ContentOptimizer] Analysis failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/optimize/topic/:topicId/apply - Apply a suggestion
  app.post("/api/brands/:brandId/optimize/topic/:topicId/apply", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { suggestionId } = req.body;
      if (!suggestionId) {
        return res.status(400).json({ message: "suggestionId is required" });
      }

      const { getContentOptimizer } = await import('./services/content-optimizer');
      const optimizer = getContentOptimizer();
      await optimizer.applyOptimization(req.params.brandId, req.params.topicId, suggestionId);

      res.json({ success: true, message: "Optimization logged" });
    } catch (error: any) {
      console.error('[ContentOptimizer] Apply failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/optimizations - Get optimization history
  app.get("/api/brands/:brandId/optimizations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getOptimizationLogsByBrand(req.params.brandId, limit);

      res.json(logs);
    } catch (error: any) {
      console.error('[OptimizationLogs] History fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  function buildVerificationTask(input: {
    sourceType: string;
    sourceId: string;
    title: string;
    artifactUrl?: string | null;
    verificationMethod?: string;
    status?: string;
  }) {
    const id = `${input.sourceType}:${input.sourceId}`;
    return {
      id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      artifactUrl: input.artifactUrl || null,
      verificationMethod: input.verificationMethod || 'rerun_visibility_scan',
      status: input.status || 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: input.status === 'verified' ? new Date().toISOString() : null,
    };
  }

  function verificationMethodForAction(actionTypeValue: unknown) {
    const actionType = String(actionTypeValue || '');
    if (actionType.startsWith('agent_readiness:')) return 'agent_readiness_scan';
    if (actionType.startsWith('answer_intelligence:')) return 'answer_intelligence_scan';
    if (actionType.startsWith('citation_opportunity:')) return 'citation_opportunity_scan';
    if (actionType.startsWith('market_opportunity:')) return 'market_opportunity_check';
    if (actionType.startsWith('product_pilot:')) return 'product_pilot_check';
    if (actionType.startsWith('provider_recovery:')) return 'provider_recovery_check';
    if (actionType.startsWith('production_hardening:')) return 'production_hardening_check';
    if (actionType.startsWith('integration_setup:')) return 'integration_setup_check';
    if (actionType.startsWith('competitive_parity:')) return 'competitive_parity_check';
    return 'rerun_visibility_scan';
  }

  function slugId(value: string): string {
    const slug = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 56);
    return slug || `draft-${Date.now()}`;
  }

  function escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function markdownToSimpleHtml(markdown: string): string {
    const blocks: string[] = [];
    let listItems: string[] = [];
    const flushList = () => {
      if (!listItems.length) return;
      blocks.push(`<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
      listItems = [];
    };

    String(markdown || '').split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }
      if (trimmed.startsWith('- ')) {
        listItems.push(trimmed.slice(2));
        return;
      }
      flushList();
      if (trimmed.startsWith('# ')) blocks.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
      else if (trimmed.startsWith('## ')) blocks.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      else if (trimmed.startsWith('### ')) blocks.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
      else blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
    });
    flushList();
    return blocks.join('\n');
  }

  function parseQueryFanoutAction(description: string) {
    const text = String(description || '');
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const prompt = lines.find((line) => /^Query Fanout:/i.test(line))?.replace(/^Query Fanout:\s*/i, '') || 'AI search fanout opportunity';
    const evidence = lines.find((line) => /^Evidence:/i.test(line))?.replace(/^Evidence:\s*/i, '') || 'Fanout evidence available from prompt sampling.';
    const intent = lines.find((line) => /^Intent:/i.test(line))?.replace(/^Intent:\s*/i, '') || 'discovery';
    const fanoutStart = lines.findIndex((line) => /^Build briefs from these fanout queries:/i.test(line));
    const fanoutQueries: string[] = [];
    if (fanoutStart >= 0) {
      for (let index = fanoutStart + 1; index < lines.length; index += 1) {
        if (/^[A-Z][A-Za-z\s]+:/i.test(lines[index])) break;
        const query = lines[index].replace(/^\d+\.\s*/, '').trim();
        if (query) fanoutQueries.push(query);
      }
    }
    return { prompt, evidence, intent, fanoutQueries };
  }

  function buildQueryFanoutDraftMarkdown(brand: any, optimization: any) {
    const parsed = parseQueryFanoutAction(optimization.actionDescription);
    const brandName = String(brand.name || 'Brand');
    const queries = parsed.fanoutQueries.length ? parsed.fanoutQueries : [parsed.prompt];
    return [
      `# ${brandName} AI Search Brief: ${parsed.prompt}`,
      '',
      `## Audience Intent`,
      `- Primary prompt: ${parsed.prompt}`,
      `- Intent: ${parsed.intent}`,
      `- Evidence: ${parsed.evidence}`,
      '',
      `## Answer Target`,
      `${brandName} should be named clearly as a relevant option, with proof blocks that help ChatGPT, Gemini, Perplexity, Claude, and AI search engines cite the page confidently.`,
      '',
      `## Fanout Questions To Answer`,
      ...queries.map((query) => `- ${query}`),
      '',
      `## Recommended Page Structure`,
      `- Direct answer summary that names ${brandName} in the first paragraph`,
      `- Comparison block explaining when ${brandName} is a strong fit`,
      `- Proof block with outcomes, reviews, certifications, founder proof, demos, or customer evidence`,
      `- Objection handling section for price, trust, support, outcomes, and alternatives`,
      `- FAQ section using the fanout questions above`,
      `- Internal links to the most relevant product, service, case study, and contact pages`,
      '',
      `## Schema Plan`,
      `- FAQPage schema for the fanout questions`,
      `- Article or WebPage schema for the explainer page`,
      `- Organization schema reference with sameAs, logo, domain, and contact details`,
      '',
      `## Verification Plan`,
      `Publish this draft, rerun the original prompt and fanout questions, then verify new AI mentions, citations, answer position, or visibility movement before marking the Action Workflow task verified.`,
    ].join('\n');
  }

  async function upsertBrandVerificationTask(brand: any, task: any) {
    const current = (brand.brandDevData && typeof brand.brandDevData === 'object') ? brand.brandDevData : {};
    const tasks = Array.isArray((current as any).verificationTasks) ? (current as any).verificationTasks : [];
    const nextTasks = [task, ...tasks.filter((item: any) => item.id !== task.id)].slice(0, 100);
    await storage.updateBrand(brand.id, {
      brandDevData: {
        ...current,
        verificationTasks: nextTasks,
      },
    } as any);
    return nextTasks;
  }

  // GET /api/brands/:brandId/verification-tasks - Follow-up tasks that prove applied work changed AI-visible signals
  app.get("/api/brands/:brandId/verification-tasks", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = (brand as any).brandDevData || {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const optimizations = await storage.getOptimizationLogsByBrand(brand.id, 500).catch(() => []);
      const optimizationById = new Map((optimizations as any[]).map((log: any) => [String(log.id), log]));
      const enrichedTasks = tasks.map((task: any) => {
        const optimization = optimizationById.get(String(task.sourceId || ''));
        const actionType = String(optimization?.actionType || '');
        const inferredMethod = verificationMethodForAction(actionType);
        const verificationMethod = inferredMethod !== 'rerun_visibility_scan'
          ? inferredMethod
          : task.verificationMethod || 'rerun_visibility_scan';
        return {
          ...task,
          verificationMethod,
          sourceOptimization: optimization ? {
            id: optimization.id,
            actionType: optimization.actionType,
            status: optimization.status,
            estimatedImpact: optimization.estimatedImpact,
          } : null,
        };
      });
      const summary = {
        total: enrichedTasks.length,
        pending: enrichedTasks.filter((task: any) => task.status === 'pending').length,
        verified: enrichedTasks.filter((task: any) => task.status === 'verified').length,
      };
      res.json({ tasks: enrichedTasks, summary });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/verification-evidence/report - Shareable proof report for applied and verified work
  app.get("/api/brands/:brandId/verification-evidence/report", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const optimizations = await storage.getOptimizationLogsByBrand(brand.id, 500).catch(() => []);
      const optimizationById = new Map((optimizations as any[]).map((log: any) => [String(log.id), log]));
      const sourceLabel = (actionType: string) => {
        if (actionType.startsWith('agent_readiness:')) return 'Agent Readiness';
        if (actionType.startsWith('answer_intelligence:')) return 'Answer Intelligence';
        if (actionType.startsWith('audience_persona:')) return 'Audience Persona';
        if (actionType.startsWith('query_fanout:')) return 'Query Fanout';
        if (actionType.startsWith('citation_opportunity:')) return 'Citation Opportunity';
        if (actionType.startsWith('market_opportunity:')) return 'Market Opportunity';
        if (actionType.startsWith('gap_opportunity:')) return 'Gap Opportunity';
        if (actionType.startsWith('product_pilot:')) return 'Product Readiness';
        if (actionType.startsWith('provider_recovery:')) return 'Provider Recovery';
        if (actionType.startsWith('production_hardening:')) return 'Production Hardening';
        if (actionType.startsWith('integration_setup:')) return 'Integration Setup';
        if (actionType.startsWith('competitive_parity:')) return 'Competitive Parity';
        return 'Action Workflow';
      };
      const titleFromDescription = (description: string) => {
        const firstLine = String(description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || 'Verify published change';
        return firstLine
          .replace(/^Market Opportunity:\s*/i, '')
          .replace(/^Agent Readiness:\s*/i, '')
          .replace(/^Audience Persona:\s*/i, '')
          .replace(/^Query Fanout:\s*/i, '')
          .replace(/^Product Pilot:\s*/i, '')
          .replace(/^Provider Recovery:\s*/i, '');
      };
      const rows = tasks.map((task: any) => {
        const optimization = optimizationById.get(String(task.sourceId || ''));
        const actionType = String(optimization?.actionType || task.sourceType || 'verification');
        const effectiveVerificationMethod = verificationMethodForAction(actionType) !== 'rerun_visibility_scan'
          ? verificationMethodForAction(actionType)
          : task.verificationMethod || 'manual';
        const evidence = task.evidence || {};
        const evidenceSummary = String(task.verificationNote || evidence.message || (
          evidence.label
            ? `${evidence.label}: ${evidence.passed === true ? 'passed' : evidence.passed === false ? 'still failing' : 'latest evidence pending'}`
            : 'No scan evidence stored yet'
        ));
        return {
          id: task.id,
          title: titleFromDescription(optimization?.actionDescription || task.title || ''),
          source: sourceLabel(actionType),
          actionType,
          status: task.status || 'pending',
          verificationMethod: effectiveVerificationMethod,
          evidenceStatus: task.status === 'verified' || evidence.passed === true ? 'passed' : evidence.passed === false ? 'failed' : 'unknown',
          evidenceSummary,
          evidence,
          createdAt: task.createdAt || null,
          lastCheckedAt: task.lastCheckedAt || null,
          verifiedAt: task.verifiedAt || null,
          estimatedImpact: Number(optimization?.estimatedImpact || 0),
          actualImpact: Number(optimization?.actualImpact || 0),
          sourceOptimization: optimization ? {
            id: optimization.id,
            actionType: optimization.actionType,
            status: optimization.status,
          } : null,
        };
      }).sort((a: any, b: any) => {
        const statusOrder: Record<string, number> = { failed: 0, unknown: 1, passed: 2 };
        return (statusOrder[a.evidenceStatus] ?? 1) - (statusOrder[b.evidenceStatus] ?? 1)
          || new Date(b.lastCheckedAt || b.createdAt || 0).getTime() - new Date(a.lastCheckedAt || a.createdAt || 0).getTime();
      });
      const proofStarters = (optimizations as any[])
        .filter((log: any) => !['applied', 'verified'].includes(String(log.status || '').toLowerCase()))
        .sort((a: any, b: any) => Number(b.estimatedImpact || 0) - Number(a.estimatedImpact || 0))
        .slice(0, 8)
        .map((log: any) => ({
          id: log.id,
          title: titleFromDescription(log.actionDescription || log.title || ''),
          source: sourceLabel(String(log.actionType || '')),
          status: log.status || 'pending',
          estimatedImpact: Number(log.estimatedImpact || 0),
          nextAction: 'Mark this action applied after the fix is live, then run the matching proof check from Action Workflow.',
        }));
      const summary = {
        total: rows.length,
        verified: rows.filter((row: any) => row.status === 'verified').length,
        pending: rows.filter((row: any) => row.status !== 'verified').length,
        failedEvidence: rows.filter((row: any) => row.evidenceStatus === 'failed').length,
        unknownEvidence: rows.filter((row: any) => row.evidenceStatus === 'unknown').length,
        passedEvidence: rows.filter((row: any) => row.evidenceStatus === 'passed').length,
      };
      const workflowActions = (optimizations as any[]).filter((log: any) => ['pending', 'applied', 'verified'].includes(String(log.status || '').toLowerCase()));
      const plannedActions = workflowActions.length;
      const appliedActions = workflowActions.filter((log: any) => ['applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const verifiedActions = workflowActions.filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const totalEstimatedImpact = workflowActions.reduce((sum: number, log: any) => sum + Number(log.estimatedImpact || 0), 0);
      const verifiedImpact = workflowActions
        .filter((log: any) => String(log.status || '').toLowerCase() === 'verified')
        .reduce((sum: number, log: any) => sum + Number(log.actualImpact || log.estimatedImpact || 0), 0);
      const proofConversionRate = appliedActions > 0 ? Math.round((verifiedActions / appliedActions) * 100) : 0;
      const impactConversionRate = totalEstimatedImpact > 0 ? Math.round((verifiedImpact / totalEstimatedImpact) * 100) : 0;
      const proofValue = {
        score: Math.min(100, Math.round(
          (plannedActions > 0 ? 15 : 0) +
          (appliedActions > 0 ? 20 : 0) +
          (verifiedActions > 0 ? 25 : 0) +
          (summary.pending === 0 && verifiedActions > 0 ? 20 : summary.pending > 0 ? 8 : 0) +
          (verifiedImpact > 0 ? 20 : impactConversionRate > 0 ? 10 : 0)
        )),
        plannedActions,
        appliedActions,
        verifiedActions,
        proofConversionRate,
        totalEstimatedImpact,
        verifiedImpact,
        impactConversionRate,
        pendingProofTasks: summary.pending,
        failedEvidence: summary.failedEvidence,
        unknownEvidence: summary.unknownEvidence,
        rows: [
          ['Workflow coverage', `${plannedActions} planned / ${appliedActions} applied / ${verifiedActions} verified`, plannedActions > 0 && appliedActions > 0 ? 'active' : plannedActions > 0 ? 'planned' : 'gap', plannedActions > 0 ? 'Keep moving priority work into applied proof checks.' : 'Create priority actions from readiness gaps.'],
          ['Applied-to-verified conversion', `${proofConversionRate}%`, proofConversionRate >= 50 ? 'healthy' : proofConversionRate > 0 ? 'early' : 'gap', proofConversionRate > 0 ? 'Raise conversion by clearing pending proof checks.' : 'Mark one live fix applied and verify it.'],
          ['Verified impact', `${verifiedImpact}/${totalEstimatedImpact || 0}`, verifiedImpact > 0 ? 'proven' : totalEstimatedImpact > 0 ? 'unproven' : 'gap', verifiedImpact > 0 ? 'Use verified impact in stakeholder reporting.' : 'Verify impact before claiming ROI.'],
          ['Evidence freshness', `${summary.pending} pending`, summary.pending === 0 && verifiedActions > 0 ? 'clear' : summary.pending > 0 ? 'debt' : 'missing', summary.pending === 0 && verifiedActions > 0 ? 'Keep evidence fresh with weekly scans.' : 'Run specialist proof checks after fresh scans.'],
          ['Failed evidence', `${summary.failedEvidence} failing / ${summary.unknownEvidence} waiting`, summary.failedEvidence === 0 ? 'controlled' : 'blocked', summary.failedEvidence === 0 ? 'Resolve waiting evidence next.' : 'Fix failing applied changes before reporting wins.'],
        ],
      };
      const score = summary.total ? Math.round((summary.passedEvidence / summary.total) * 100) : 0;
      const verdict = summary.total === 0
        ? 'No proof tasks yet'
        : summary.pending === 0
          ? 'All proof tasks verified'
          : summary.failedEvidence > 0
            ? 'Proof still failing for applied work'
            : 'Proof tasks need fresh evidence';
      const generatedAt = new Date().toISOString();
      const topRows = rows.slice(0, 20);
      const markdown = [
        `# Verification Evidence Report: ${brand.name}`,
        '',
        `Domain: ${brand.domain || ''}`,
        `Generated: ${generatedAt}`,
        `Proof score: ${score}/100`,
        `Verdict: ${verdict}`,
        '',
        '## Executive Summary',
        `${brand.name} has ${summary.total} proof task${summary.total === 1 ? '' : 's'}: ${summary.verified} verified, ${summary.pending} pending, ${summary.failedEvidence} with failing scan evidence, and ${summary.unknownEvidence} waiting for fresh evidence.`,
        '',
        '## Proof Value Matrix',
        `Proof value score: ${proofValue.score}/100`,
        `Proof conversion: ${proofValue.proofConversionRate}%`,
        `Verified impact: ${proofValue.verifiedImpact}/${proofValue.totalEstimatedImpact || 0}`,
        ...(proofValue.rows.map((row: any, index: number) => `${index + 1}. ${row[0]} - ${row[1]} - ${String(row[2]).toUpperCase()}. Next: ${row[3]}`)),
        '',
        '## Proof Queue',
        ...(topRows.length ? topRows.map((row: any, index: number) => `${index + 1}. ${row.title} - ${row.source} - ${String(row.status).toUpperCase()} - ${row.evidenceSummary}`) : ['No verification evidence tasks exist yet. Mark applied actions and run proof checks before sending client reporting.']),
        '',
        '## Proof Starter Queue',
        ...(proofStarters.length ? proofStarters.map((row: any, index: number) => `${index + 1}. ${row.title} - ${row.source} - ${String(row.status).toUpperCase()} - impact ${row.estimatedImpact}. Next: ${row.nextAction}`) : ['No pending workflow actions are available to turn into proof yet. Create one from Agent Readiness, Query Fanouts, Market Opportunities, Product Readiness, or provider recovery.']),
        '',
        '## Operating Metrics',
        `- Total proof tasks: ${summary.total}`,
        `- Verified proof tasks: ${summary.verified}`,
        `- Pending proof tasks: ${summary.pending}`,
        `- Failing scan evidence: ${summary.failedEvidence}`,
        `- Unknown evidence: ${summary.unknownEvidence}`,
        `- Passed evidence: ${summary.passedEvidence}`,
      ].join('\n');

      const escapeHtml = (value: string) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const starterHtml = proofStarters.length
        ? proofStarters.map((row: any, index: number) => `<div class="item unknown"><strong>${index + 1}. ${escapeHtml(row.title)}</strong><div class="small">${escapeHtml(row.source)} - ${escapeHtml(String(row.status).toUpperCase())} - impact ${escapeHtml(String(row.estimatedImpact))}</div><p>${escapeHtml(row.nextAction)}</p></div>`).join('')
        : '<p>No pending workflow actions are available to turn into proof yet. Create one from Agent Readiness, Query Fanouts, Market Opportunities, Product Readiness, or provider recovery.</p>';
      const proofValueHtml = `<h2>Proof Value Matrix</h2><p class="score">${proofValue.score}/100 value proof</p><table>${proofValue.rows.map((row: any) => `<tr><td>${escapeHtml(row[0])}<br><span class="small">${escapeHtml(row[1])}</span></td><td>${escapeHtml(String(row[2]).toUpperCase())}<br><span class="small">${escapeHtml(row[3])}</span></td></tr>`).join('')}</table>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brand.name)} Verification Evidence Report</title><style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.item{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.passed{border-color:#86efac}.failed{border-color:#fcd34d}.unknown{border-color:#bfdbfe}.small{color:#4b5563;font-size:14px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e5e7eb;padding:10px 4px}td:last-child{text-align:right;font-weight:700}</style></head><body><h1>Verification Evidence Report: ${escapeHtml(brand.name)}</h1><p class="meta">Domain: ${escapeHtml(String(brand.domain || ''))}<br>Generated: ${escapeHtml(generatedAt)}</p><p class="score">${score}/100 - ${escapeHtml(verdict)}</p><h2>Executive Summary</h2><p>${escapeHtml(`${brand.name} has ${summary.total} proof task${summary.total === 1 ? '' : 's'}: ${summary.verified} verified, ${summary.pending} pending, ${summary.failedEvidence} with failing scan evidence, and ${summary.unknownEvidence} waiting for fresh evidence.`)}</p>${proofValueHtml}<h2>Proof Queue</h2>${topRows.length ? topRows.map((row: any, index: number) => `<div class="item ${escapeHtml(row.evidenceStatus)}"><strong>${index + 1}. ${escapeHtml(row.title)}</strong><div class="small">${escapeHtml(row.source)} - ${escapeHtml(String(row.status).toUpperCase())} - ${escapeHtml(row.verificationMethod)}</div><p>${escapeHtml(row.evidenceSummary)}</p></div>`).join('') : '<p>No verification evidence tasks exist yet. Mark applied actions and run proof checks before sending client reporting.</p>'}<h2>Proof Starter Queue</h2>${starterHtml}<h2>Operating Metrics</h2>${Object.entries(summary).map(([key, value]) => `<p>${escapeHtml(key)}: ${escapeHtml(String(value))}</p>`).join('')}</body></html>`;

      res.json({
        brandId: brand.id,
        brandName: brand.name,
        score,
        verdict,
        summary,
        proofValue,
        evidence: rows,
        proofStarters,
        markdown,
        html,
        filenameBase: `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-verification-evidence`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[VerificationEvidenceReport] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/audience-personas - Profound-style audience segment visibility
  app.get("/api/brands/:brandId/audience-personas", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      res.json(await buildAudiencePersonaIntelligence(brand));
    } catch (error: any) {
      console.error('[AudiencePersonas] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/audience-personas/:personaId/task - Convert a weak persona segment into Action Workflow
  app.post("/api/brands/:brandId/audience-personas/:personaId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const personaId = decodeURIComponent(req.params.personaId);
      const segment = PERSONA_SEGMENTS.find((item) => item.id === personaId);
      if (!segment) {
        return res.status(404).json({ message: "Audience persona segment not found." });
      }

      const [personaIntelligence, existingLogs, competitors] = await Promise.all([
        buildAudiencePersonaIntelligence(brand),
        storage.getOptimizationLogsByBrand(brand.id, 300).catch(() => []),
        storage.getCompetitorsByBrand(brand.id).catch(() => []),
      ]);
      const persona = (personaIntelligence.personas || []).find((item: any) => item.id === personaId);
      if (!persona) {
        return res.status(404).json({ message: "Audience persona evidence was not found." });
      }

      const actionType = `audience_persona:${personaId}`;
      const duplicate = (existingLogs as any[]).find((log: any) => log.actionType === actionType);
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This audience persona gap is already in Action Workflow." });
      }

      const brandName = String(brand.name || 'this brand');
      const industry = String(brand.industry || brand.businessChannel || 'category');
      const topCompetitor = (competitors as any[]).map((competitor: any) => String(competitor.name || '').trim()).filter(Boolean)[0] || 'top competitors';
      const promptTemplates = buildPersonaPromptTemplates(personaId, brandName, industry, topCompetitor);
      const promptLines = promptTemplates.slice(0, 3).map((prompt, index) => `${index + 1}. ${prompt.text}`).join('\n');
      const needsMentions = Number(persona.mentionRate || 0) < 40;
      const needsProviders = Number(persona.providerCount || 0) < 3;
      const needsPrompts = Number(persona.promptCount || 0) < 5;
      const actionDescription = [
        `Audience Persona: ${persona.label}`,
        `Evidence: ${persona.evidence}`,
        `Gap: ${persona.gap}`,
        `Plan: ${segment.action}`,
        needsPrompts ? `Add prompts:\n${promptLines}` : '',
        needsMentions ? `Publish or strengthen persona-specific proof content that names ${brandName} clearly and answers this audience's objections.` : '',
        needsProviders ? 'Re-run the persona prompt set across at least three answer engines before marking the work verified.' : '',
        'Verification: after publishing and rescanning, use Action Workflow proof evidence to confirm fresh AI answers, mentions, sources, or visibility movement.',
      ].filter(Boolean).join('\n');
      const estimatedImpact = Math.max(35, Math.min(95, 100 - Number(persona.score || 0)));

      const task = await storage.createOptimizationLog({
        brandId: brand.id,
        topicId: null,
        actionType,
        actionDescription,
        estimatedImpact,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: `${persona.label} added to Action Workflow.`,
        persona: {
          id: persona.id,
          label: persona.label,
          score: persona.score,
          status: persona.status,
          evidence: persona.evidence,
          mentionRate: persona.mentionRate,
          providerCount: persona.providerCount,
          promptCount: persona.promptCount,
        },
        suggestedPrompts: promptTemplates,
      });
    } catch (error: any) {
      console.error('[AudiencePersonas] Task create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/competitive-parity - Athena/Peec/Profound-style product parity audit
  app.get("/api/brands/:brandId/competitive-parity", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        prompts,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        answers,
        providerSummary,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLatestAgentReadinessReport(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 100).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        getProviderReliabilitySummary(brandId).catch(() => null),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brandId);
      } catch {
        crawlerStats = null;
      }
      const personaIntelligence = await buildAudiencePersonaIntelligence(brand).catch(() => null);

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];

      const promptCount = (prompts as any[]).length;
      const providerSet = new Set(
        (answers as any[])
          .map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || answer.model || '').toLowerCase())
          .filter(Boolean)
      );
      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId).length;
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId).length;
      const mentionsWithPosition = (allMentions as any[]).filter((mention: any) => Number(mention.position) > 0).length;
      const sentimentMentions = (allMentions as any[]).filter((mention: any) => ['positive', 'neutral', 'negative'].includes(String(mention.sentiment || '').toLowerCase())).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActions = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActions.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brandId).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const fanoutDraftCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((draftedFanoutActions / highOpportunityFanouts) * 100)) : 0;
      const fanoutPublishCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((publishedFanoutArtifacts / highOpportunityFanouts) * 100)) : 0;
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const agentScore = Number((agentReport as any)?.score || 0);
      const productScore = Number(productReadiness?.score || 0);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const verifiedProofTasks = verificationTasks.filter((task: any) => task.status === 'verified').length;
      const pendingVerification = verificationTasks.filter((task: any) => task.status === 'pending').length;
      const productRelevant = Boolean(productReadiness?.relevant);

      const capability = (input: {
        id: string;
        label: string;
        benchmark: string;
        status: 'ready' | 'partial' | 'missing';
        score: number;
        evidence: string;
        gap: string;
        action: string;
        href: string;
      }) => input;

      const providerCount = providerSet.size;
      const freshEnterpriseProviderCount = freshEnterpriseProviders.length;
      const failedEnterpriseProviderCount = failedEnterpriseProviders.length;
      const capabilities = [
        capability({
          id: 'multi_model_visibility',
          label: 'Cross-model visibility monitoring',
          benchmark: 'AthenaHQ, Peec, Profound',
          status: promptCount >= 25 && freshEnterpriseProviderCount >= 4 && failedEnterpriseProviderCount === 0 ? 'ready' : promptCount > 0 || freshEnterpriseProviderCount > 0 ? 'partial' : 'missing',
          score: promptCount >= 25 && freshEnterpriseProviderCount >= 4 && failedEnterpriseProviderCount === 0 ? 100 : promptCount > 0 || freshEnterpriseProviderCount > 0 ? 45 : 0,
          evidence: `${promptCount} prompts, ${freshEnterpriseProviderCount}/${CORE_SCAN_PROVIDERS.length} fresh enterprise providers, ${failedEnterpriseProviderCount} provider failures`,
          gap: freshEnterpriseProviderCount < 4 || failedEnterpriseProviderCount > 0 ? 'Needs fresh, successful coverage across at least four answer engines before enterprise claims.' : 'Prompt portfolio needs broader buyer-intent coverage.',
          action: 'Fix provider recovery blockers, rerun Enterprise pilot sweep, then track buyer, competitor, product, trust, support, and comparison prompts across ChatGPT, Perplexity, Gemini, Claude, Grok, and DeepSeek-style surfaces.',
          href: '/app/prompts',
        }),
        capability({
          id: 'query_fanout_intelligence',
          label: 'Query fanout intelligence',
          benchmark: 'Peec ChatGPT query fanouts',
          status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'missing',
          score: fanoutQueryCount >= 100 && publishedFanoutArtifacts >= highOpportunityFanouts && highOpportunityFanouts > 0 ? 100 : fanoutPublishCoverage >= 80 ? 85 : fanoutDraftCoverage >= 80 ? 75 : fanoutQueryCount > 0 ? 55 : 0,
          evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP artifacts, ${averageFanoutMentionRate}% average mention rate`,
          gap: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Most fanout briefs are published; rerun prompts and citation extraction to prove AI answer movement.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Fanout briefs are drafted but still need publication, schema deployment, and post-publish proof.' : highOpportunityFanouts > 0 ? 'High-opportunity fanouts need to become content briefs, comparison pages, proof blocks, and schema-backed FAQs.' : 'Needs prompt sampling before fanout intelligence can guide content work.',
          action: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Rerun prompts, extract citations, and verify whether published fanout artifacts move mentions, sources, or visibility.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Publish the drafted AXP briefs, add proof/comparison/schema blocks, then rerun prompts and citation extraction to verify movement.' : 'Turn fanout queries into answer-ready content briefs, source targets, comparison sections, proof blocks, and FAQ/Product schema tasks.',
          href: '/app/prompts',
        }),
        capability({
          id: 'citation_intelligence',
          label: 'Citation and source intelligence',
          benchmark: 'Peec citation analysis, Athena citation source analysis',
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'missing',
          score: sourceDomains >= 10 && citedUrls >= 10 ? 100 : sourceDomains > 0 || citedUrls > 0 ? 55 : 0,
          evidence: `${sourceDomains} source domains, ${citedUrls} cited URLs`,
          gap: 'Needs stronger URL-level cited-source depth and source acquisition recommendations.',
          action: 'Prioritize cited domains where competitors appear, then create content, PR, marketplace, and profile updates that can become citation-worthy.',
          href: '/app/sources',
        }),
        capability({
          id: 'competitive_sov',
          label: 'Competitive share of voice',
          benchmark: 'AthenaHQ/Profound competitive intelligence',
          status: competitors.length > 0 && competitorMentions > 0 ? 'ready' : competitors.length > 0 ? 'partial' : 'missing',
          score: competitors.length > 0 && competitorMentions > 0 ? 100 : competitors.length > 0 ? 55 : 0,
          evidence: `${competitors.length} competitors, ${brandMentions} brand mentions, ${competitorMentions} competitor mentions`,
          gap: competitorMentions === 0 ? 'Competitors exist but sampled answer evidence is not deep enough yet.' : 'Competitive pressure must be converted into prompt and content actions.',
          action: 'Run comparison prompts, identify winner pages, and build battlecards for categories where competitors are recommended first.',
          href: '/app/competitors',
        }),
        capability({
          id: 'sentiment_position_intelligence',
          label: 'Sentiment and position intelligence',
          benchmark: 'Peec sentiment/position, Profound visibility metrics',
          status: sentimentMentions >= 20 && mentionsWithPosition >= 20 ? 'ready' : sentimentMentions > 0 || mentionsWithPosition > 0 ? 'partial' : 'missing',
          score: sentimentMentions >= 20 && mentionsWithPosition >= 20 ? 100 : sentimentMentions > 0 || mentionsWithPosition > 0 ? 55 : 0,
          evidence: `${sentimentMentions} sentiment-tagged mentions, ${mentionsWithPosition} positioned mentions`,
          gap: 'Needs a visible AI perception layer that explains whether answers are positive, neutral, negative, and where the brand ranks.',
          action: 'Review Answer Intelligence, prioritize negative or low-position prompts, and turn them into corrective content or proof tasks.',
          href: '/app/ai-command-center',
        }),
        capability({
          id: 'audience_persona_intelligence',
          label: 'Audience persona intelligence',
          benchmark: 'Profound Personas, Peec prompt segmentation',
          status: Number(personaIntelligence?.summary?.ready || 0) >= 3 ? 'ready' : Number(personaIntelligence?.summary?.partial || 0) > 0 ? 'partial' : 'missing',
          score: Number(personaIntelligence?.score || 0),
          evidence: personaIntelligence ? `${personaIntelligence.summary.ready} ready, ${personaIntelligence.summary.partial} partial, ${personaIntelligence.summary.missing} missing personas` : 'No persona intelligence available',
          gap: personaIntelligence?.nextActions?.[0]?.evidence || 'Needs audience-segment prompt coverage and answer evidence.',
          action: personaIntelligence?.nextActions?.[0]?.action || 'Add persona-tagged prompts for buyers, trust evaluators, technical users, local-market demand, and objections.',
          href: '/app/ai-command-center',
        }),
        capability({
          id: 'action_workflow',
          label: 'Verified action workflow',
          benchmark: 'Profound Actions, Athena workflow management',
          status: verifiedActions > 0 && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 ? 'partial' : 'missing',
          score: verifiedActions > 0 && pendingVerification === 0 ? 100 : appliedActions > 0 || pendingVerification > 0 ? 65 : plannedActions > 0 ? 45 : 0,
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified, ${pendingVerification} pending proof tasks`,
          gap: 'Findings need more closed-loop proof before they are credible for enterprise reporting.',
          action: pendingVerification > 0
            ? 'Run verification checks for pending proof tasks, then report only fixes with fresh scan evidence.'
            : appliedActions > 0
              ? 'Create or run proof tasks for applied work before reporting impact.'
              : 'Move a priority finding into implementation, then mark it applied so AIRank creates the proof task automatically.',
          href: '/app/action-plan',
        }),
        capability({
          id: 'agent_brand_readiness',
          label: 'Agent and brand integrity readiness',
          benchmark: 'Athena brand integrity, Profound content AEO',
          status: agentScore >= 75 ? 'ready' : agentScore > 0 ? 'partial' : 'missing',
          score: agentScore >= 75 ? 100 : agentScore > 0 ? 55 : 0,
          evidence: `${agentScore}/100 agent readiness`,
          gap: 'Schema, entity, llms.txt, crawlability, and trust signals must become actionable implementation tasks.',
          action: 'Fix structured data, organization/entity clarity, AI crawler access, and content proof gaps, then rerun Agent Readiness.',
          href: '/app/agent-readiness',
        }),
        capability({
          id: 'shopping_readiness',
          label: 'Shopping and product readiness',
          benchmark: 'Profound Shopping, Athena ecommerce',
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'missing',
          score: !productRelevant ? 100 : productScore >= 70 ? 100 : productScore > 0 ? 55 : 0,
          evidence: productRelevant ? `${productScore}/100 product readiness` : 'Not required for this non-product-led brand workflow',
          gap: productRelevant ? 'Needs SKU feed depth, competitor product mapping, Product schema, prompt packs, and listing recommendations.' : 'Product workflows are intentionally separate for non-product brands.',
          action: productRelevant ? 'Import priority SKUs/ASINs, map competing product URLs, generate prompt packs, and export product visibility actions.' : 'Keep Product Readiness for D2C, ecommerce, and Amazon seller-led accounts.',
          href: '/app/product-readiness',
        }),
        capability({
          id: 'monitoring_alerts',
          label: 'Launch monitoring and alerts',
          benchmark: 'Semrush projects, Profound monitoring',
          status: visibilityScore > 0 && promptCount >= 25 ? 'ready' : visibilityScore > 0 || promptCount > 0 ? 'partial' : 'missing',
          score: visibilityScore > 0 && promptCount >= 25 ? 100 : visibilityScore > 0 || promptCount > 0 ? 55 : 0,
          evidence: `${visibilityScore}/100 visibility score, ${promptCount} tracked prompts`,
          gap: 'Needs scheduled scans, alert thresholds, and historical trend confidence before launch claims.',
          action: 'Set recurring scans, watch visibility drops, competitor overtakes, citation losses, and verification debt.',
          href: '/app/alerts',
        }),
        capability({
          id: 'agent_analytics',
          label: 'Agent analytics and attribution',
          benchmark: 'Profound Agent Analytics',
          status: crawlerVisits > 0 ? 'ready' : 'missing',
          score: crawlerVisits > 0 ? 100 : 0,
          evidence: `${crawlerVisits} AI crawler visits tracked`,
          gap: 'Needs live crawler-log installation and attribution events to prove AI-agent traffic impact.',
          action: 'Install agent analytics tracking, capture crawler identity, visited pages, AI referrals, and conversion attribution.',
          href: '/app/agent-analytics',
        }),
        capability({
          id: 'executive_reporting',
          label: 'Executive and client reporting',
          benchmark: 'Peec/Profound reporting, Semrush exports',
          status: visibilityScore > 0 && plannedActions > 0 ? 'ready' : visibilityScore > 0 ? 'partial' : 'missing',
          score: visibilityScore > 0 && plannedActions > 0 ? 100 : visibilityScore > 0 ? 55 : 0,
          evidence: `${visibilityScore}/100 visibility baseline, ${plannedActions} workflow actions`,
          gap: 'Reports need to connect score movement, fixes, source wins, and verified proof into a buyer-ready launch narrative.',
          action: 'Export Launch Readiness and product/client reports after converting blockers into action workflow items.',
          href: '/app/reports',
        }),
      ];

      const score = Math.round(capabilities.reduce((sum, item) => sum + item.score, 0) / capabilities.length);
      const missing = capabilities.filter((item) => item.status === 'missing');
      const partial = capabilities.filter((item) => item.status === 'partial');

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict: score >= 85 && missing.length === 0 ? 'Comparable enterprise platform experience' : score >= 65 ? 'Competitive pilot with visible gaps' : 'Not yet competitor-comparable',
        capabilities,
        blockers: missing,
        nextActions: [...missing, ...partial].slice(0, 6).map((item) => ({
          id: item.id,
          title: item.label,
          action: item.action,
          href: item.href,
          evidence: item.evidence,
          benchmark: item.benchmark,
        })),
        benchmarks: [
          { name: 'AthenaHQ', signals: ['GEO workflow management', 'multi-LLM visibility', 'citation/source analysis', 'content optimization', 'ecommerce'] },
          { name: 'Peec.ai', signals: ['AI visibility analytics', 'competitor benchmarking', 'citation analysis', 'sentiment/position', 'query fanouts', 'simple action-oriented reporting'] },
          { name: 'Profound', signals: ['answer-engine coverage', 'AI visibility metrics', 'prompt recommendations', 'Actions workflow', 'agent analytics and shopping'] },
        ],
        metrics: {
          promptCount,
          providerCount,
          freshEnterpriseProviderCount,
          failedEnterpriseProviderCount,
          sourceDomains,
          citedUrls,
          brandMentions,
          competitorMentions,
          visibilityScore,
          agentScore,
          productScore,
          plannedActions,
          appliedActions,
          verifiedActions,
          pendingVerification,
          crawlerVisits,
          fanoutQueryCount,
          highOpportunityFanouts,
          averageFanoutMentionRate,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CompetitiveParity] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/competitive-parity/report - Shareable Athena/Peec/Profound parity report
  app.get("/api/brands/:brandId/competitive-parity/report", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        prompts,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        answers,
        providerSummary,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLatestAgentReadinessReport(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 100).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        getProviderReliabilitySummary(brandId).catch(() => null),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brandId);
      } catch {
        crawlerStats = null;
      }
      const personaIntelligence = await buildAudiencePersonaIntelligence(brand).catch(() => null);

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const promptCount = (prompts as any[]).length;
      const providerSet = new Set(
        (answers as any[])
          .map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || answer.model || '').toLowerCase())
          .filter(Boolean)
      );
      const providerCount = providerSet.size;
      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const freshEnterpriseProviderCount = freshEnterpriseProviders.length;
      const failedEnterpriseProviderCount = failedEnterpriseProviders.length;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId).length;
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId).length;
      const mentionsWithPosition = (allMentions as any[]).filter((mention: any) => Number(mention.position) > 0).length;
      const sentimentMentions = (allMentions as any[]).filter((mention: any) => ['positive', 'neutral', 'negative'].includes(String(mention.sentiment || '').toLowerCase())).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActions = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActions.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brandId).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const fanoutDraftCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((draftedFanoutActions / highOpportunityFanouts) * 100)) : 0;
      const fanoutPublishCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((publishedFanoutArtifacts / highOpportunityFanouts) * 100)) : 0;
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const agentScore = Number((agentReport as any)?.score || 0);
      const productScore = Number(productReadiness?.score || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const verifiedProofTasks = verificationTasks.filter((task: any) => task.status === 'verified').length;
      const pendingVerification = verificationTasks.filter((task: any) => task.status === 'pending').length;

      const capabilities = [
        {
          id: 'multi_model_visibility',
          label: 'Cross-model visibility monitoring',
          benchmark: 'AthenaHQ, Peec, Profound',
          status: promptCount >= 25 && freshEnterpriseProviderCount >= 4 && failedEnterpriseProviderCount === 0 ? 'ready' : promptCount > 0 || freshEnterpriseProviderCount > 0 ? 'partial' : 'missing',
          score: promptCount >= 25 && freshEnterpriseProviderCount >= 4 && failedEnterpriseProviderCount === 0 ? 100 : promptCount > 0 || freshEnterpriseProviderCount > 0 ? 45 : 0,
          evidence: `${promptCount} prompts, ${freshEnterpriseProviderCount}/${CORE_SCAN_PROVIDERS.length} fresh enterprise providers, ${failedEnterpriseProviderCount} provider failures`,
          gap: freshEnterpriseProviderCount < 4 || failedEnterpriseProviderCount > 0 ? 'Needs fresh, successful coverage across at least four answer engines before enterprise claims.' : 'Prompt portfolio needs broader buyer-intent coverage.',
          action: 'Fix provider recovery blockers, rerun Enterprise pilot sweep, then track buyer, competitor, product, trust, support, and comparison prompts across ChatGPT, Perplexity, Gemini, Claude, Grok, and DeepSeek-style surfaces.',
          href: '/app/prompts',
        },
        {
          id: 'query_fanout_intelligence',
          label: 'Query fanout intelligence',
          benchmark: 'Peec ChatGPT query fanouts',
          status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'missing',
          score: fanoutQueryCount >= 100 && publishedFanoutArtifacts >= highOpportunityFanouts && highOpportunityFanouts > 0 ? 100 : fanoutPublishCoverage >= 80 ? 85 : fanoutDraftCoverage >= 80 ? 75 : fanoutQueryCount > 0 ? 55 : 0,
          evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP artifacts, ${averageFanoutMentionRate}% average mention rate`,
          gap: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Most fanout briefs are published; rerun prompts and citation extraction to prove AI answer movement.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Fanout briefs are drafted but still need publication, schema deployment, and post-publish proof.' : highOpportunityFanouts > 0 ? 'High-opportunity fanouts need to become content briefs, comparison pages, proof blocks, and schema-backed FAQs.' : 'Needs prompt sampling before fanout intelligence can guide content work.',
          action: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Rerun prompts, extract citations, and verify whether published fanout artifacts move mentions, sources, or visibility.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Publish the drafted AXP briefs, add proof/comparison/schema blocks, then rerun prompts and citation extraction to verify movement.' : 'Turn fanout queries into answer-ready content briefs, source targets, comparison sections, proof blocks, and FAQ/Product schema tasks.',
          href: '/app/prompts',
        },
        {
          id: 'citation_intelligence',
          label: 'Citation and source intelligence',
          benchmark: 'Peec citation analysis, Athena citation source analysis',
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'missing',
          score: sourceDomains >= 10 && citedUrls >= 10 ? 100 : sourceDomains > 0 || citedUrls > 0 ? 55 : 0,
          evidence: `${sourceDomains} source domains, ${citedUrls} cited URLs`,
          gap: 'Needs stronger URL-level cited-source depth and source acquisition recommendations.',
          action: 'Prioritize cited domains where competitors appear, then create content, PR, marketplace, and profile updates that can become citation-worthy.',
          href: '/app/sources',
        },
        {
          id: 'competitive_sov',
          label: 'Competitive share of voice',
          benchmark: 'AthenaHQ and Profound competitive intelligence',
          status: (competitors as any[]).length > 0 && competitorMentions > 0 ? 'ready' : (competitors as any[]).length > 0 ? 'partial' : 'missing',
          score: (competitors as any[]).length > 0 && competitorMentions > 0 ? 100 : (competitors as any[]).length > 0 ? 55 : 0,
          evidence: `${(competitors as any[]).length} competitors, ${brandMentions} brand mentions, ${competitorMentions} competitor mentions`,
          gap: competitorMentions === 0 ? 'Competitors exist but sampled answer evidence is not deep enough yet.' : 'Competitive pressure must be converted into prompt and content actions.',
          action: 'Run comparison prompts, identify winner pages, and build battlecards for categories where competitors are recommended first.',
          href: '/app/competitors',
        },
        {
          id: 'sentiment_position_intelligence',
          label: 'Sentiment and position intelligence',
          benchmark: 'Peec sentiment and position, Profound visibility metrics',
          status: sentimentMentions >= 20 && mentionsWithPosition >= 20 ? 'ready' : sentimentMentions > 0 || mentionsWithPosition > 0 ? 'partial' : 'missing',
          score: sentimentMentions >= 20 && mentionsWithPosition >= 20 ? 100 : sentimentMentions > 0 || mentionsWithPosition > 0 ? 55 : 0,
          evidence: `${sentimentMentions} sentiment-tagged mentions, ${mentionsWithPosition} positioned mentions`,
          gap: 'Needs a visible AI perception layer that explains whether answers are positive, neutral, negative, and where the brand ranks.',
          action: 'Review Answer Intelligence, prioritize negative or low-position prompts, and turn them into corrective content or proof tasks.',
          href: '/app/ai-command-center',
        },
        {
          id: 'audience_persona_intelligence',
          label: 'Audience persona intelligence',
          benchmark: 'Profound Personas, Peec prompt segmentation',
          status: Number(personaIntelligence?.summary?.ready || 0) >= 3 ? 'ready' : Number(personaIntelligence?.summary?.partial || 0) > 0 ? 'partial' : 'missing',
          score: Number(personaIntelligence?.score || 0),
          evidence: personaIntelligence ? `${personaIntelligence.summary.ready} ready, ${personaIntelligence.summary.partial} partial, ${personaIntelligence.summary.missing} missing personas` : 'No persona intelligence available',
          gap: personaIntelligence?.nextActions?.[0]?.evidence || 'Needs audience-segment prompt coverage and answer evidence.',
          action: personaIntelligence?.nextActions?.[0]?.action || 'Add persona-tagged prompts for buyers, trust evaluators, technical users, local-market demand, and objections.',
          href: '/app/ai-command-center',
        },
        {
          id: 'action_workflow',
          label: 'Verified action workflow',
          benchmark: 'Profound Actions, Athena workflow management',
          status: verifiedActions > 0 && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 ? 'partial' : 'missing',
          score: verifiedActions > 0 && pendingVerification === 0 ? 100 : appliedActions > 0 || pendingVerification > 0 ? 65 : plannedActions > 0 ? 45 : 0,
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified, ${pendingVerification} pending proof tasks`,
          gap: 'Findings need more closed-loop proof before they are credible for enterprise reporting.',
          action: pendingVerification > 0
            ? 'Run verification checks for pending proof tasks, then report only fixes with fresh scan evidence.'
            : appliedActions > 0
              ? 'Create or run proof tasks for applied work before reporting impact.'
              : 'Move a priority finding into implementation, then mark it applied so AIRank creates the proof task automatically.',
          href: '/app/action-plan',
        },
        {
          id: 'agent_brand_readiness',
          label: 'Agent and brand integrity readiness',
          benchmark: 'Athena brand integrity, Profound content AEO',
          status: agentScore >= 75 ? 'ready' : agentScore > 0 ? 'partial' : 'missing',
          score: agentScore >= 75 ? 100 : agentScore > 0 ? 55 : 0,
          evidence: `${agentScore}/100 agent readiness`,
          gap: 'Schema, entity, llms.txt, crawlability, and trust signals must become actionable implementation tasks.',
          action: 'Fix structured data, organization/entity clarity, AI crawler access, and content proof gaps, then rerun Agent Readiness.',
          href: '/app/agent-readiness',
        },
        {
          id: 'shopping_readiness',
          label: 'Shopping and product readiness',
          benchmark: 'Profound Shopping, Athena ecommerce',
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'missing',
          score: !productRelevant ? 100 : productScore >= 70 ? 100 : productScore > 0 ? 55 : 0,
          evidence: productRelevant ? `${productScore}/100 product readiness` : 'Not required for this non-product-led brand workflow',
          gap: productRelevant ? 'Needs SKU feed depth, competitor product mapping, Product schema, prompt packs, and listing recommendations.' : 'Product workflows are intentionally separate for non-product brands.',
          action: productRelevant ? 'Import priority SKUs or ASINs, map competing product URLs, generate prompt packs, and export product visibility actions.' : 'Keep Product Readiness for D2C, ecommerce, and Amazon seller-led accounts.',
          href: '/app/product-readiness',
        },
        {
          id: 'monitoring_alerts',
          label: 'Launch monitoring and alerts',
          benchmark: 'Semrush projects, Profound monitoring',
          status: visibilityScore > 0 && promptCount >= 25 ? 'ready' : visibilityScore > 0 || promptCount > 0 ? 'partial' : 'missing',
          score: visibilityScore > 0 && promptCount >= 25 ? 100 : visibilityScore > 0 || promptCount > 0 ? 55 : 0,
          evidence: `${visibilityScore}/100 visibility score, ${promptCount} tracked prompts`,
          gap: 'Needs scheduled scans, alert thresholds, and historical trend confidence before launch claims.',
          action: 'Set recurring scans, watch visibility drops, competitor overtakes, citation losses, crawler anomalies, and verification debt.',
          href: '/app/alerts',
        },
        {
          id: 'agent_analytics',
          label: 'Agent analytics and attribution',
          benchmark: 'Profound Agent Analytics',
          status: crawlerVisits > 0 ? 'ready' : 'missing',
          score: crawlerVisits > 0 ? 100 : 0,
          evidence: `${crawlerVisits} AI crawler visits tracked`,
          gap: 'Needs live crawler-log installation and attribution events to prove AI-agent traffic impact.',
          action: 'Install agent analytics tracking, capture crawler identity, visited pages, AI referrals, and conversion attribution.',
          href: '/app/agent-analytics',
        },
        {
          id: 'executive_reporting',
          label: 'Executive and client reporting',
          benchmark: 'Peec/Profound reporting, Semrush exports',
          status: visibilityScore > 0 && plannedActions > 0 ? 'ready' : visibilityScore > 0 ? 'partial' : 'missing',
          score: visibilityScore > 0 && plannedActions > 0 ? 100 : visibilityScore > 0 ? 55 : 0,
          evidence: `${visibilityScore}/100 visibility baseline, ${plannedActions} workflow actions`,
          gap: 'Reports need to connect score movement, fixes, source wins, and verified proof into a buyer-ready launch narrative.',
          action: 'Export Launch Readiness and Competitive Parity reports after converting blockers into action workflow items.',
          href: '/app/reports',
        },
      ];

      const score = Math.round(capabilities.reduce((sum, item) => sum + item.score, 0) / Math.max(capabilities.length, 1));
      const missing = capabilities.filter((item) => item.status === 'missing');
      const partial = capabilities.filter((item) => item.status === 'partial');
      const verdict = score >= 85 && missing.length === 0 ? 'Comparable enterprise platform experience' : score >= 65 ? 'Competitive pilot with visible gaps' : 'Not yet competitor-comparable';
      const nextActions = [...missing, ...partial].slice(0, 6).map((item) => ({
        id: item.id,
        title: item.label,
        action: item.action,
        href: item.href,
        evidence: item.evidence,
        benchmark: item.benchmark,
      }));
      const benchmarks = [
        { name: 'AthenaHQ', signals: ['GEO workflow management', 'multi-LLM visibility', 'citation/source analysis', 'content optimization', 'ecommerce'] },
        { name: 'Peec.ai', signals: ['AI visibility analytics', 'competitor benchmarking', 'citation analysis', 'sentiment/position', 'query fanouts', 'simple action-oriented reporting'] },
        { name: 'Profound', signals: ['answer-engine coverage', 'AI visibility metrics', 'prompt recommendations', 'Actions workflow', 'agent analytics and shopping'] },
        { name: 'Semrush-like maturity', signals: ['projects', 'historical monitoring', 'alerts', 'exports', 'stakeholder reporting'] },
      ];
      const metrics = {
        promptCount,
        providerCount,
        freshEnterpriseProviderCount,
        failedEnterpriseProviderCount,
        sourceDomains,
        citedUrls,
        brandMentions,
        competitorMentions,
        visibilityScore,
        agentScore,
        productScore,
        plannedActions,
        appliedActions,
        verifiedActions,
        pendingVerification,
        crawlerVisits,
        fanoutQueryCount,
        highOpportunityFanouts,
        publishedFanoutArtifacts,
        averageFanoutMentionRate,
      };
      const generatedAt = new Date().toISOString();
      const productReadinessMetric = productRelevant
        ? `${productScore}/100`
        : 'Not applicable - Product Readiness is inactive for this non-product-led brand';
      const markdown = [
        `# Competitive Parity Report: ${brand.name}`,
        '',
        `Domain: ${brand.domain}`,
        `Generated: ${generatedAt}`,
        `Verdict: ${verdict}`,
        `Competitive parity score: ${score}/100`,
        '',
        '## Executive Summary',
        `${brand.name} is currently ${verdict.toLowerCase()} against AthenaHQ, Peec.ai, Profound, and Semrush-style enterprise expectations. ${missing.length} capabilities are missing and ${partial.length} are partial, so the launch story should focus on closing the first six blockers before enterprise sales demos.`,
        '',
        '## Benchmark Expectations',
        ...benchmarks.map((benchmark) => `- ${benchmark.name}: ${benchmark.signals.join(', ')}`),
        '',
        '## Capability Scorecard',
        ...capabilities.map((item) => `- ${item.label}: ${String(item.status).toUpperCase()} (${item.score}/100) - ${item.evidence}. Gap: ${item.gap}`),
        '',
        '## Priority Next Actions',
        ...(nextActions.length ? nextActions.map((item, index) => `${index + 1}. ${item.action} (${item.title}: ${item.evidence})`) : ['All parity capabilities are ready. Keep weekly scan, reporting, and verification cadence active.']),
        '',
        '## Metrics',
        `- Prompts tracked: ${promptCount}`,
        `- Answer providers: ${providerCount}`,
        `- Fresh enterprise providers: ${freshEnterpriseProviderCount}/${CORE_SCAN_PROVIDERS.length}`,
        `- Failed enterprise providers: ${failedEnterpriseProviderCount}`,
        `- Source domains / cited URLs: ${sourceDomains} / ${citedUrls}`,
        `- Brand vs competitor mentions: ${brandMentions}:${competitorMentions}`,
        `- Visibility score: ${visibilityScore}/100`,
        `- Agent readiness: ${agentScore}/100`,
        `- Product readiness: ${productReadinessMetric}`,
        `- Planned / applied / verified actions: ${plannedActions} / ${appliedActions} / ${verifiedActions}`,
        `- Pending verification tasks: ${pendingVerification}`,
        `- AI crawler visits: ${crawlerVisits}`,
        `- Query fanouts: ${fanoutQueryCount}`,
        `- High-opportunity fanouts: ${highOpportunityFanouts}`,
        `- Published fanout AXP artifacts: ${publishedFanoutArtifacts}`,
        `- Fanout average mention rate: ${averageFanoutMentionRate}%`,
      ].join('\n');

      const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const statusClass = (value: string) => ['ready', 'partial', 'missing'].includes(value) ? value : 'partial';
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brand.name)} Competitive Parity Report</title><style>body{font-family:Inter,Arial,sans-serif;max-width:980px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:30px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.capability{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.ready{border-color:#86efac}.partial{border-color:#fcd34d}.missing{border-color:#fca5a5}.small{color:#4b5563;font-size:14px}</style></head><body><h1>Competitive Parity Report: ${escapeHtml(brand.name)}</h1><p class="meta">Domain: ${escapeHtml(String(brand.domain || ''))}<br>Generated: ${escapeHtml(generatedAt)}</p><p class="score">${score}/100 - ${escapeHtml(verdict)}</p><h2>Executive Summary</h2><p>${escapeHtml(`${brand.name} is currently ${verdict.toLowerCase()} against AthenaHQ, Peec.ai, Profound, and Semrush-style enterprise expectations. ${missing.length} capabilities are missing and ${partial.length} are partial.`)}</p><h2>Benchmark Expectations</h2>${benchmarks.map((benchmark) => `<p><strong>${escapeHtml(benchmark.name)}</strong>: ${escapeHtml(benchmark.signals.join(', '))}</p>`).join('')}<h2>Capability Scorecard</h2>${capabilities.map((item) => `<div class="capability ${statusClass(item.status)}"><strong>${escapeHtml(item.label)}</strong><div class="small">${escapeHtml(String(item.status).toUpperCase())} - ${item.score}/100 - ${escapeHtml(item.evidence)}</div><p>${escapeHtml(item.gap)}</p><p><strong>Next:</strong> ${escapeHtml(item.action)}</p></div>`).join('')}<h2>Priority Next Actions</h2>${nextActions.length ? nextActions.map((item, index) => `<p>${index + 1}. ${escapeHtml(item.action)} <span class="small">(${escapeHtml(item.title)}: ${escapeHtml(item.evidence)})</span></p>`).join('') : '<p>All parity capabilities are ready. Keep weekly scan, reporting, and verification cadence active.</p>'}<h2>Metrics</h2>${Object.entries(metrics).map(([key, value]) => `<p>${escapeHtml(key)}: ${escapeHtml(String(value))}</p>`).join('')}</body></html>`;

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict,
        capabilities,
        blockers: missing,
        nextActions,
        benchmarks,
        metrics,
        markdown,
        html,
        filenameBase: `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-competitive-parity`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[CompetitiveParityReport] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/launch-readiness - Authoritative launch gate scorecard
  app.get("/api/brands/:brandId/launch-readiness", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        prompts,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        answers,
        providerSummary,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLatestAgentReadinessReport(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 100).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        getProviderReliabilitySummary(brandId).catch(() => null),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brandId);
      } catch {
        crawlerStats = null;
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const promptCount = (prompts as any[]).length;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId).length;
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActions = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActions.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brandId).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const fanoutDraftCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((draftedFanoutActions / highOpportunityFanouts) * 100)) : 0;
      const fanoutPublishCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((publishedFanoutArtifacts / highOpportunityFanouts) * 100)) : 0;
      const agentScore = Number((agentReport as any)?.score || 0);
      const productScore = Number(productReadiness?.score || 0);
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const verifiedProofTasks = verificationTasks.filter((task: any) => task.status === 'verified').length;
      const pendingVerification = verificationTasks.filter((task: any) => task.status === 'pending').length;
      const failedAgentChecks = Array.isArray((agentReport as any)?.checks)
        ? (agentReport as any).checks.filter((check: any) => !check.passed).length
        : Number((agentReport as any)?.topIssues?.length || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const enterpriseProviderStatus: 'ready' | 'partial' | 'blocked' =
        freshEnterpriseProviders.length >= 4 && failedEnterpriseProviders.length === 0 ? 'ready' :
        freshEnterpriseProviders.length > 0 ? 'partial' :
        'blocked';

      const gate = (input: {
        id: string;
        label: string;
        weight: number;
        status: 'ready' | 'partial' | 'blocked';
        evidence: string;
        action: string;
        href: string;
      }) => input;

      const gates = [
        gate({
          id: 'enterprise_provider_coverage',
          label: 'Enterprise provider coverage',
          weight: 14,
          status: enterpriseProviderStatus,
          evidence: `${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh; ${failedEnterpriseProviders.length} provider${failedEnterpriseProviders.length === 1 ? '' : 's'} failing`,
          action: 'Fix provider billing, key, quota, or plan access, rerun Enterprise pilot sweep, and confirm at least four providers have fresh successful answers.',
          href: '/app/ai-command-center',
        }),
        gate({
          id: 'prompt_coverage',
          label: 'Prompt coverage',
          weight: 14,
          status: promptCount >= 25 ? 'ready' : promptCount > 0 ? 'partial' : 'blocked',
          evidence: `${promptCount} tracked prompts`,
          action: 'Track at least 25 prompts across buyer, competitor, product, trust, and support intents.',
          href: '/app/prompts',
        }),
        gate({
          id: 'visibility_baseline',
          label: 'Visibility baseline',
          weight: 12,
          status: visibilityScore >= 60 ? 'ready' : visibilityScore > 0 ? 'partial' : 'blocked',
          evidence: `${visibilityScore}/100 latest visibility score`,
          action: 'Run fresh model sampling and establish a baseline score before launch reporting.',
          href: '/app/dashboard',
        }),
        gate({
          id: 'source_depth',
          label: 'Source and citation depth',
          weight: 12,
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'blocked',
          evidence: `${sourceDomains} source domains and ${citedUrls} cited URLs`,
          action: 'Build URL-level cited-source coverage and pursue sources already cited for the category.',
          href: '/app/sources',
        }),
        gate({
          id: 'query_fanout_readiness',
          label: 'Query fanout readiness',
          weight: 8,
          status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'blocked',
          evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP artifacts, ${averageFanoutMentionRate}% average mention rate`,
          action: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Rerun prompts, extract citations, and verify whether published fanout artifacts move mentions, sources, or visibility.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Publish drafted AXP briefs, deploy FAQ/schema blocks, then rerun prompts and citation extraction for proof.' : 'Turn high-opportunity fanouts into content briefs, proof blocks, comparison sections, FAQ/schema, and cited-source targets before launch reporting.',
          href: '/app/prompts',
        }),
        gate({
          id: 'competitive_pressure',
          label: 'Competitive share of voice',
          weight: 10,
          status: competitors.length > 0 && competitorMentions > 0 ? 'ready' : competitors.length > 0 ? 'partial' : 'blocked',
          evidence: `${brandMentions} brand mentions vs ${competitorMentions} competitor mentions`,
          action: 'Add real competitors and sample comparison prompts where they win.',
          href: '/app/competitors',
        }),
        gate({
          id: 'agent_readiness',
          label: 'Agent readiness',
          weight: 14,
          status: agentScore >= 75 && failedAgentChecks === 0 ? 'ready' : agentScore > 0 ? 'partial' : 'blocked',
          evidence: `${agentScore}/100 agent score, ${failedAgentChecks} failed checks`,
          action: 'Fix schema, llms.txt, entity, crawlability, and content issues, then rerun Agent Readiness.',
          href: '/app/agent-readiness',
        }),
        gate({
          id: 'product_readiness',
          label: 'Product readiness',
          weight: productRelevant ? 12 : 0,
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'blocked',
          evidence: productRelevant ? `${productScore}/100 product score` : 'Not required for this non-product-led brand workflow',
          action: productRelevant ? 'Import priority SKUs, map competitor products, generate product prompts, and verify Product schema.' : 'Keep Product Readiness separate unless this brand is D2C, ecommerce, or Amazon seller-led.',
          href: '/app/product-readiness',
        }),
        gate({
          id: 'verified_workflow',
          label: 'Verified action workflow',
          weight: 12,
          status: verifiedActions > 0 && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 ? 'partial' : 'blocked',
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified, ${pendingVerification} pending proof tasks`,
          action: pendingVerification > 0
            ? 'Run verification checks for pending proof tasks before reporting impact.'
            : appliedActions > 0
              ? 'Create or run proof tasks for applied work before reporting impact.'
              : 'Move a priority finding into implementation, then mark it applied so AIRank creates the proof task automatically.',
          href: '/app/action-plan',
        }),
        gate({
          id: 'crawler_attribution',
          label: 'Agent analytics attribution',
          weight: 8,
          status: crawlerVisits > 0 ? 'ready' : 'blocked',
          evidence: `${crawlerVisits} AI crawler visits tracked`,
          action: 'Install crawler-log tracking to tie agent visits to pages and actions.',
          href: '/app/agent-analytics',
        }),
        gate({
          id: 'launch_monitoring',
          label: 'Launch monitoring',
          weight: 6,
          status: pendingVerification === 0 && promptCount >= 25 ? 'ready' : 'partial',
          evidence: `${pendingVerification} pending verification tasks`,
          action: 'Keep alerts active for score drops, competitor overtakes, source gaps, crawler anomalies, and verification debt.',
          href: '/app/alerts',
        }),
      ];

      const totalWeight = gates.reduce((sum, item) => sum + item.weight, 0);
      const earnedWeight = gates.reduce((sum, item) => {
        if (item.status === 'ready') return sum + item.weight;
        if (item.status === 'partial') return sum + Math.round(item.weight * 0.55);
        return sum;
      }, 0);
      const score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      const blockers = gates.filter((item) => item.status === 'blocked');
      const partials = gates.filter((item) => item.status === 'partial');

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict: score >= 80 && blockers.length === 0 ? 'Enterprise pilot ready' : score >= 60 ? 'Pilot ready with gaps' : 'Needs launch hardening',
        status: score >= 80 && blockers.length === 0 ? 'ready' : score >= 60 ? 'partial' : 'blocked',
        gates,
        blockers,
        nextActions: [...blockers, ...partials].slice(0, 6).map((item) => ({
          id: item.id,
          title: item.label,
          action: item.action,
          href: item.href,
          evidence: item.evidence,
        })),
        metrics: {
          promptCount,
          visibilityScore,
          sourceDomains,
          citedUrls,
          brandMentions,
          competitorMentions,
          agentScore,
          productRelevant,
          productScore,
          plannedActions,
          appliedActions,
          verifiedActions,
          pendingVerification,
          crawlerVisits,
          enterpriseFreshProviders: freshEnterpriseProviders.length,
          enterpriseFailedProviders: failedEnterpriseProviders.length,
          fanoutQueryCount,
          highOpportunityFanouts,
          averageFanoutMentionRate,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[LaunchReadiness] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/production-readiness-audit - Hard production launch verdict across ops, proof, integrations, reports, and parity
  app.get("/api/brands/:brandId/production-readiness-audit", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      const currentUser = await storage.getUser(userId).catch(() => undefined);

      if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        prompts,
        answers,
        providerSummary,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        integrations,
        alertRules,
        reportSchedules,
        analysisSchedule,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        getProviderReliabilitySummary(brandId).catch(() => null),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLatestAgentReadinessReport(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
        storage.getIntegrationsByBrand(brandId).catch(() => []),
        storage.getAlertRulesByBrand(brandId).catch(() => []),
        storage.getReportSchedulesByBrand(brandId).catch(() => []),
        storage.getAnalysisSchedule(brandId).catch(() => undefined),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brandId);
      } catch {
        crawlerStats = null;
      }

      let attribution: any = null;
      try {
        const { computeAttribution } = await import('./services/attribution');
        attribution = await computeAttribution(brandId, 30, true);
      } catch (error: any) {
        attribution = {
          dataComplete: false,
          aiReferralSessions: 0,
          aiReferralConversions: 0,
          aiAttributedRevenue: 0,
          message: error?.message || 'Attribution could not be computed.',
        };
      }

      const launchTrend = await buildLaunchTrendSnapshot(brand).catch(() => null);
      const brandDevData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(brandDevData.verificationTasks) ? brandDevData.verificationTasks : [];
      const providerPreflightRuns = Array.isArray(brandDevData.providerPreflightRuns) ? brandDevData.providerPreflightRuns : [];
      const latestProviderPreflight = providerPreflightRuns[0] || null;
      const latestPreflightByProvider = new Map<string, any>();
      for (const run of providerPreflightRuns) {
        for (const result of (Array.isArray(run?.results) ? run.results : [])) {
          const provider = String(result?.provider || '').toLowerCase();
          if (provider && !latestPreflightByProvider.has(provider)) {
            latestPreflightByProvider.set(provider, result);
          }
        }
      }
      const latestPreflightResults = Array.from(latestPreflightByProvider.values());

      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const preflightBlocked = latestProviderPreflight ? latestPreflightResults.filter((result: any) => !result.ok).length : null;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const promptCount = (prompts as any[]).length;
      const competitorCount = (competitors as any[]).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActions = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActions.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brandId).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const fanoutDraftCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((draftedFanoutActions / highOpportunityFanouts) * 100)) : 0;
      const fanoutPublishCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((publishedFanoutArtifacts / highOpportunityFanouts) * 100)) : 0;
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const agentScore = Number((agentReport as any)?.score || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const productScore = Number(productReadiness?.score || 0);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const aiReferralSessions = Number(attribution?.aiReferralSessions || attribution?.totalReferrals || 0);
      const aiReferralConversions = Number(attribution?.aiReferralConversions || attribution?.totalConversions || 0);
      const aiAttributedRevenue = Number(attribution?.aiAttributedRevenue || attribution?.attributedRevenue || 0);
      const attributionComplete = Boolean(attribution?.dataComplete);
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => ['applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const verifiedProofTasks = verificationTasks.filter((task: any) => task.status === 'verified').length;
      const pendingVerification = verificationTasks.filter((task: any) => task.status !== 'verified').length;
      const integrationPlatform = (integration: any) => String(integration.platform || integration.type || integration.config?.platform || '').toLowerCase();
      const integrationStatus = (integration: any) => String(integration.status || integration.syncStatus || integration.sync_status || integration.config?.status || (integration.isActive ? 'connected' : '')).toLowerCase();
      const connectedIntegrationPlatforms = new Set((integrations as any[])
        .filter((integration: any) => integrationStatus(integration) === 'connected')
        .map(integrationPlatform));
      const hasGsc = connectedIntegrationPlatforms.has('google_search_console') || connectedIntegrationPlatforms.has('gsc');
      const hasGa4 = connectedIntegrationPlatforms.has('google_analytics') || connectedIntegrationPlatforms.has('ga4');
      const activeAlertRules = (alertRules as any[]).filter((rule: any) => rule.isEnabled !== false && rule.isActive !== false).length;
      const activeReportSchedules = (reportSchedules as any[]).filter((schedule: any) => schedule.isActive !== false).length;
      const hasAnalysisSchedule = Boolean((analysisSchedule as any)?.isEnabled || (brand as any).analysisEnabled);

      const gates = [
        {
          id: 'provider_reliability',
          label: 'Enterprise provider reliability',
          weight: 14,
          status: freshEnterpriseProviders.length >= 4 && failedEnterpriseProviders.length === 0 && preflightBlocked === 0 ? 'ready' : freshEnterpriseProviders.length > 0 ? 'partial' : 'blocked',
          evidence: `${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh; ${failedEnterpriseProviders.length} failed providers; ${preflightBlocked == null ? 'no preflight' : `${preflightBlocked} preflight blocker${preflightBlocked === 1 ? '' : 's'}`}`,
          action: 'Run provider preflight, resolve billing/key/quota blockers, and rerun an enterprise pilot sweep.',
          href: '/app/ai-command-center',
        },
        {
          id: 'demand_coverage',
          label: 'Prompt and competitor coverage',
          weight: 10,
          status: promptCount >= 25 && competitorCount >= 3 ? 'ready' : promptCount > 0 || competitorCount > 0 ? 'partial' : 'blocked',
          evidence: `${promptCount} prompts, ${competitorCount} competitors`,
          action: 'Track at least 25 buyer, trust, comparison, support, local, and product prompts with 3+ competitors.',
          href: '/app/prompts',
        },
        {
          id: 'source_depth',
          label: 'Citation/source depth',
          weight: 9,
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'blocked',
          evidence: `${sourceDomains} source domains, ${citedUrls} cited URLs`,
          action: 'Build URL-level source coverage and source-acquisition actions for competitor-cited domains.',
          href: '/app/sources',
        },
        {
          id: 'query_fanout_readiness',
          label: 'Query fanout readiness',
          weight: 8,
          status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'blocked',
          evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP artifacts, ${averageFanoutMentionRate}% average mention rate`,
          action: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80
            ? 'Rerun prompts, extract citations, and verify whether published fanout artifacts move mentions, sources, or visibility.'
            : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80
              ? 'Publish drafted AXP briefs, deploy FAQ/schema blocks, then rerun prompts and citation extraction for proof.'
              : 'Turn high-opportunity fanouts into content briefs, proof blocks, comparison sections, FAQ/schema, and cited-source targets before launch reporting.',
          href: '/app/prompts',
        },
        {
          id: 'agent_readiness',
          label: 'Agent readiness',
          weight: 10,
          status: agentScore >= 75 ? 'ready' : agentScore > 0 ? 'partial' : 'blocked',
          evidence: `${agentScore}/100 agent readiness`,
          action: 'Fix schema, entity, llms.txt, crawlability, and trust gaps, then rerun Agent Readiness.',
          href: '/app/agent-readiness',
        },
        {
          id: 'product_readiness',
          label: 'Product/seller readiness',
          weight: productRelevant ? 8 : 4,
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'blocked',
          evidence: productRelevant ? `${productScore}/100 product readiness` : 'Inactive for this non-product-led brand',
          action: productRelevant ? 'Complete SKU/ASIN catalog, competitor product mapping, listing proof, prompts, and Product schema.' : 'Keep Product Readiness separate until SKU/ASIN data is imported.',
          href: '/app/product-readiness',
        },
        {
          id: 'workflow_proof',
          label: 'Verified action proof',
          weight: 12,
          status: (verifiedActions > 0 || verifiedProofTasks > 0) && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 || verifiedProofTasks > 0 ? 'partial' : 'blocked',
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified actions, ${verifiedProofTasks} verified proof tasks, ${pendingVerification} pending proof tasks`,
          action: 'Convert priority findings into applied tasks and verify them only after fresh scan/source/product evidence exists.',
          href: '/app/action-plan',
        },
        {
          id: 'attribution',
          label: 'AI attribution proof',
          weight: 9,
          status: attributionComplete && (aiReferralSessions > 0 || aiReferralConversions > 0 || aiAttributedRevenue > 0) ? 'ready' : crawlerVisits > 0 || attributionComplete ? 'partial' : 'blocked',
          evidence: `${crawlerVisits} crawler visits, ${aiReferralSessions} AI referrals, ${aiReferralConversions} conversions, $${Math.round(aiAttributedRevenue).toLocaleString()} revenue`,
          action: attributionComplete && (aiReferralSessions > 0 || aiReferralConversions > 0 || aiAttributedRevenue > 0)
            ? 'Use attribution proof in executive reporting and connect automated GA4/ecommerce credentials to keep it fresh.'
            : 'Install Agent Analytics and connect GA4/ecommerce revenue before claiming business impact.',
          href: '/app/agent-analytics',
        },
        {
          id: 'integrations',
          label: 'Production integrations',
          weight: 8,
          status: hasGsc && hasGa4 ? 'ready' : hasGsc || hasGa4 || connectedIntegrationPlatforms.size > 0 ? 'partial' : 'blocked',
          evidence: `${Array.from(connectedIntegrationPlatforms).join(', ') || 'no'} connected integration${connectedIntegrationPlatforms.size === 1 ? '' : 's'}`,
          action: 'Connect GA4 and Google Search Console for attribution, branded search, reporting, and source validation.',
          href: '/app/integrations',
        },
        {
          id: 'monitoring',
          label: 'Monitoring and alerts',
          weight: 9,
          status: hasAnalysisSchedule && activeAlertRules >= 3 ? 'ready' : hasAnalysisSchedule || activeAlertRules > 0 ? 'partial' : 'blocked',
          evidence: `${activeAlertRules} active alert rule${activeAlertRules === 1 ? '' : 's'}; scheduled analysis ${hasAnalysisSchedule ? 'enabled' : 'missing'}`,
          action: 'Enable recurring scans and alerts for score drops, competitor overtakes, source gaps, crawler anomalies, and verification debt.',
          href: '/app/alerts',
        },
        {
          id: 'reporting',
          label: 'Boardroom reporting cadence',
          weight: 8,
          status: activeReportSchedules > 0 && visibilityScore > 0 ? 'ready' : activeReportSchedules > 0 || visibilityScore > 0 ? 'partial' : 'blocked',
          evidence: `${activeReportSchedules} active report schedule${activeReportSchedules === 1 ? '' : 's'}; visibility baseline ${visibilityScore}/100`,
          action: 'Create scheduled launch, verification, parity, and product visibility reports after clearing proof gaps.',
          href: '/app/reports',
        },
        {
          id: 'historical_trend',
          label: 'Historical launch confidence',
          weight: 7,
          status: Number(launchTrend?.historicalConfidence?.score || 0) >= 70 ? 'ready' : launchTrend ? 'partial' : 'blocked',
          evidence: launchTrend?.historicalConfidence?.evidence || 'No launch trend snapshot available',
          action: 'Maintain weekly snapshots, provider preflight, and proof checks until trend confidence is stable.',
          href: '/app/ai-command-center',
        },
      ];

      const totalWeight = gates.reduce((sum, gate) => sum + Number(gate.weight || 0), 0);
      const earnedWeight = gates.reduce((sum, gate) => {
        if (gate.status === 'ready') return sum + Number(gate.weight || 0);
        if (gate.status === 'partial') return sum + Math.round(Number(gate.weight || 0) * 0.55);
        return sum;
      }, 0);
      const score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      const blocked = gates.filter((gate) => gate.status === 'blocked');
      const partial = gates.filter((gate) => gate.status === 'partial');
      const nonReadyGates = [...blocked, ...partial];
      const externalBlockers = nonReadyGates.filter((gate) => ['provider_reliability', 'agent_readiness'].includes(gate.id));
      const proofBlockers = nonReadyGates.filter((gate) => ['workflow_proof', 'query_fanout_readiness', 'attribution'].includes(gate.id));
      const internalReadyGates = gates.filter((gate) => gate.status === 'ready');
      const fullyEnterpriseReady = score >= 85 && blocked.length === 0 && partial.length === 0;
      const pilotLaunchReady = score >= 85 && blocked.length === 0;
      const launchBlockerPack = {
        headline: nonReadyGates.length === 0
          ? 'Enterprise launch proof is complete.'
          : `${nonReadyGates.length} gate${nonReadyGates.length === 1 ? '' : 's'} still need proof before Semrush-level positioning.`,
        salesPositioning: nonReadyGates.length === 0
          ? 'Sell as an enterprise-comparable AI visibility operating system with active monitoring and proof reporting.'
          : 'Sell as a pilot-ready AI visibility operating system with explicit implementation and proof work remaining before enterprise replacement claims.',
        internalReady: internalReadyGates.map((gate) => ({
          id: gate.id,
          title: gate.label,
          evidence: gate.evidence,
        })),
        externalBlockers: externalBlockers.map((gate) => ({
          id: gate.id,
          title: gate.label,
          evidence: gate.evidence,
          action: gate.action,
          href: gate.href,
          clearCondition: gate.id === 'provider_reliability'
            ? 'At least four enterprise providers fresh, zero failed providers, and zero preflight blockers.'
            : gate.id === 'agent_readiness'
              ? 'Agent Readiness score 75+ after the live homepage schema/entity/crawlability fixes pass.'
              : 'Gate is ready in a fresh production audit.',
          clearanceSteps: gate.id === 'provider_reliability'
            ? [
                'Open AI Command Center and run provider preflight.',
                'Resolve billing, credential, quota, or plan-lock errors for Anthropic, Google/Gemini, Perplexity, Grok, DeepSeek, and OpenAI as applicable.',
                'Queue an enterprise pilot sweep after preflight passes.',
                'Verify at least four providers have fresh successful answers and no failed prompt runs.',
              ]
            : gate.id === 'agent_readiness'
              ? [
                  'Deploy the generated JSON-LD @graph on the live homepage head.',
                  'Validate Organization, WebSite, and WebPage nodes in Schema Markup Validator.',
                  'Confirm robots.txt and llms.txt do not block desired AI/search crawlers.',
                  'Rerun Agent Readiness and use Check latest scan to verify schema checks pass.',
                ]
              : ['Rerun the production audit after the gate action is complete.'],
        })),
        proofDebt: proofBlockers.map((gate) => ({
          id: gate.id,
          title: gate.label,
          evidence: gate.evidence,
          action: gate.action,
          href: gate.href,
          clearCondition: gate.id === 'workflow_proof'
            ? 'All pending verification tasks pass with specialist evidence.'
            : gate.id === 'query_fanout_readiness'
              ? 'Published fanout artifacts are followed by prompt reruns, citation extraction, and movement evidence.'
              : 'Attribution evidence remains fresh through automated analytics or verified manual snapshots.',
          clearanceSteps: gate.id === 'workflow_proof'
            ? [
                'Open Action Workflow and run specialist checks for the two pending tasks.',
                'For provider coverage, verify after provider preflight and enterprise sweep pass.',
                'For schema, verify after the live homepage schema deploy and Agent Readiness rescan pass.',
              ]
            : [
                'Run the proof check shown for this gate after fresh evidence exists.',
              ],
        })),
        buyerSafeClaims: [
          `${score}/100 production audit with ${internalReadyGates.length}/${gates.length} launch gates ready; current status is ${fullyEnterpriseReady ? 'enterprise production ready' : 'pilot launch ready with proof gaps'}.`,
          `${publishedFanoutArtifacts} published AXP fanout artifacts from ${highOpportunityFanouts} high-opportunity prompts.`,
          `${verifiedProofTasks} verified proof tasks and ${pendingVerification} pending verification task${pendingVerification === 1 ? '' : 's'}.`,
          productRelevant ? `${productScore}/100 product readiness for SKU/seller workflow.` : 'Product Readiness is separated and inactive for this non-product-led brand until SKU/ASIN data is imported.',
        ],
        doNotClaimYet: [
          freshEnterpriseProviders.length < 4 || failedEnterpriseProviders.length > 0 || preflightBlocked !== 0
            ? 'Do not claim stable enterprise multi-model coverage until provider preflight and fresh answer coverage pass.'
            : '',
          agentScore < 75 ? 'Do not claim full agent-readiness until homepage schema/entity/crawlability fixes are live and rescanned.' : '',
          pendingVerification > 0 ? 'Do not claim every recommendation is verified until pending proof tasks clear.' : '',
        ].filter(Boolean),
      };
      const verdict = fullyEnterpriseReady
        ? 'Enterprise production ready'
        : pilotLaunchReady
          ? 'Pilot launch ready with proof gaps'
          : score >= 65
            ? 'Pilot ready with production gaps'
            : 'Not production ready';

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict,
        status: fullyEnterpriseReady ? 'ready' : score >= 65 ? 'needs_hardening' : 'blocked',
        gates,
        blocked,
        partial,
        launchBlockerPack,
        nextActions: [...blocked, ...partial].slice(0, 7).map((gate) => ({
          id: gate.id,
          title: gate.label,
          evidence: gate.evidence,
          action: gate.action,
          href: gate.href,
        })),
        metrics: {
          promptCount,
          competitorCount,
          visibilityScore,
          agentScore,
          productRelevant,
          productScore,
          freshEnterpriseProviders: freshEnterpriseProviders.length,
          failedEnterpriseProviders: failedEnterpriseProviders.length,
          preflightBlocked,
          sourceDomains,
          citedUrls,
          fanoutQueryCount,
          highOpportunityFanouts,
          draftedFanoutActions,
          publishedFanoutArtifacts,
          averageFanoutMentionRate,
          plannedActions,
          appliedActions,
          verifiedActions,
          pendingVerification,
          crawlerVisits,
          aiReferralSessions,
          aiReferralConversions,
          aiAttributedRevenue,
          attributionComplete,
          connectedIntegrations: Array.from(connectedIntegrationPlatforms),
          activeAlertRules,
          activeReportSchedules,
          historicalConfidence: launchTrend?.historicalConfidence || null,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ProductionReadinessAudit] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/alert-summary - Operational alerts for launch monitoring
  app.get("/api/brands/:brandId/alert-summary", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        scoreHistory,
        prompts,
        answers,
        allMentions,
        competitors,
        sources,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId),
        storage.getVisibilityScoresByBrand(brandId, undefined, 8).catch(() => []),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
      ]);

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const pendingVerification = verificationTasks.filter((task: any) => task.status === 'pending').length;
      const currentScore = Number((latestScore as any)?.overallScore || 0);
      const previousScore = Number((latestScore as any)?.previousScore ?? (scoreHistory as any[])[1]?.overallScore ?? currentScore);
      const scoreDelta = Math.round((currentScore - previousScore) * 10) / 10;

      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId);
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId);
      const competitorPressure = competitorMentions.length - brandMentions.length;
      const topCompetitor = (competitors as any[])
        .map((competitor: any) => ({
          id: competitor.id,
          name: competitor.name,
          mentions: competitorMentions.filter((mention: any) => mention.competitorId === competitor.id).length,
        }))
        .sort((a, b) => b.mentions - a.mentions)[0] || null;

      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean));
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const sourceOpportunities = (sources as any[]).filter((source: any) => source.isBrandAbsent || source.citationType === 'competitor').length;

      let crawlerVisits = 0;
      let crawlerModels = 0;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        const crawlerStats: any = await getCrawlerTracker().getCrawlerStats(brandId);
        crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
        crawlerModels = Number(crawlerStats?.uniqueBots || crawlerStats?.summary?.uniqueBots || crawlerStats?.bots?.length || 0);
      } catch {
        crawlerVisits = 0;
        crawlerModels = 0;
      }

      const alerts: any[] = [];
      const addAlert = (alert: any) => alerts.push({
        id: alert.id,
        metric: alert.metric,
        severity: alert.severity || 'info',
        title: alert.title,
        message: alert.message,
        value: alert.value,
        previousValue: alert.previousValue,
        threshold: alert.threshold,
        route: alert.route,
        recommendedAction: alert.recommendedAction,
        createdAt: new Date().toISOString(),
      });

      if (currentScore > 0 && scoreDelta <= -5) {
        addAlert({
          id: 'visibility-score-drop',
          metric: 'score_drop',
          severity: scoreDelta <= -10 ? 'critical' : 'warning',
          title: 'Visibility score dropped',
          message: `AI visibility moved from ${previousScore} to ${currentScore}.`,
          value: currentScore,
          previousValue: previousScore,
          threshold: -5,
          route: '/app/prompts',
          recommendedAction: 'Review prompts with lost brand mentions and queue fixes in Action Workflow.',
        });
      }

      if (competitorMentions.length > brandMentions.length && competitorMentions.length > 0) {
        addAlert({
          id: 'competitor-pressure',
          metric: 'competitor_overtake',
          severity: competitorPressure >= 10 ? 'critical' : 'warning',
          title: 'Competitors are winning more AI mentions',
          message: `${topCompetitor?.name || 'A competitor'} leads the sampled answer set with ${topCompetitor?.mentions || 0} mentions.`,
          value: competitorMentions.length,
          previousValue: brandMentions.length,
          threshold: brandMentions.length,
          route: '/app/competitors',
          recommendedAction: 'Open competitor gaps, identify prompts where they win, and publish proof pages for those intents.',
        });
      }

      if (sources.length === 0 || citedUrls < 5 || sourceOpportunities >= 5) {
        addAlert({
          id: 'source-depth-gap',
          metric: 'source_depth',
          severity: sources.length === 0 ? 'critical' : 'warning',
          title: 'Source citation depth is weak',
          message: `${sourceDomains.size} cited domains, ${citedUrls} cited URLs, and ${sourceOpportunities} source opportunities are currently visible.`,
          value: citedUrls,
          previousValue: sourceDomains.size,
          threshold: 5,
          route: '/app/sources',
          recommendedAction: 'Build owned citation pages and pursue third-party pages that AI systems already cite for this category.',
        });
      }

      if (pendingVerification > 0) {
        addAlert({
          id: 'verification-debt',
          metric: 'verification_debt',
          severity: pendingVerification >= 5 ? 'critical' : 'warning',
          title: 'Applied work still needs verification',
          message: `${pendingVerification} applied action${pendingVerification === 1 ? '' : 's'} need a rescan or manual proof step.`,
          value: pendingVerification,
          threshold: 0,
          route: '/app/action-plan',
          recommendedAction: 'Run verification scans and mark actions verified only when prompt, source, or crawler signals improve.',
        });
      }

      if ((answers as any[]).length > 0 && crawlerVisits === 0) {
        addAlert({
          id: 'crawler-attribution-missing',
          metric: 'crawler_anomaly',
          severity: 'info',
          title: 'Crawler attribution is not active yet',
          message: 'AI answer tracking exists, but no AI crawler visits are recorded for this brand.',
          value: crawlerVisits,
          threshold: 1,
          route: '/app/integrations',
          recommendedAction: 'Install crawler-log ingestion on the site so AI crawler visits can be tied back to pages and actions.',
        });
      }

      if ((prompts as any[]).length < 25) {
        addAlert({
          id: 'prompt-coverage-low',
          metric: 'prompt_coverage',
          severity: 'info',
          title: 'Prompt coverage is too thin for enterprise reporting',
          message: `${(prompts as any[]).length} prompts are tracked. Enterprise pilots need broader buyer, comparison, product, and support prompt coverage.`,
          value: (prompts as any[]).length,
          threshold: 25,
          route: '/app/prompts',
          recommendedAction: 'Add high-intent buyer prompts across category, competitor, Amazon/product, trust, and post-purchase intents.',
        });
      }

      const severityRank: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      alerts.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

      res.json({
        alerts,
        summary: {
          total: alerts.length,
          critical: alerts.filter((alert) => alert.severity === 'critical').length,
          warning: alerts.filter((alert) => alert.severity === 'warning').length,
          info: alerts.filter((alert) => alert.severity === 'info').length,
          visibilityScore: currentScore,
          scoreDelta,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          sourceDomains: sourceDomains.size,
          citedUrls,
          sourceOpportunities,
          pendingVerification,
          crawlerVisits,
          crawlerModels,
          promptCount: (prompts as any[]).length,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error('[AlertSummary] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/brands/:brandId/verification-tasks/:taskId - Mark a verification task as pending/verified
  app.patch("/api/brands/:brandId/verification-tasks/:taskId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const status = String(req.body?.status || '').toLowerCase();
      if (!['pending', 'verified'].includes(status)) {
        return res.status(400).json({ message: "status must be pending or verified" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const updatedTasks = tasks.map((task: any) => task.id === taskId ? {
        ...task,
        status,
        verifiedAt: status === 'verified' ? new Date().toISOString() : null,
        verificationNote: typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : task.verificationNote,
      } : task);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      res.json({
        tasks: updatedTasks,
        task: updatedTasks.find((task: any) => task.id === taskId) || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-agent-readiness - Verify against latest Agent Readiness scan evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-agent-readiness", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 100);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('agent_readiness:')) {
        return res.status(400).json({ message: "This verification task is not linked to an Agent Readiness issue." });
      }

      const issueId = actionType.replace(/^agent_readiness:/, '');
      const latestReport = await storage.getLatestAgentReadinessReport(brand.id);
      const checks = Array.isArray((latestReport as any)?.checks) ? (latestReport as any).checks : [];
      if (issueId === 'schema_fix_pack') {
        const requiredIds = ['json_ld_present', 'organization_schema', 'website_schema'];
        const schemaChecks = requiredIds.map((id) => checks.find((item: any) => item?.id === id)).filter(Boolean);
        if (!latestReport || schemaChecks.length < requiredIds.length) {
          return res.json({
            verified: false,
            issueId,
            message: "No complete latest Agent Readiness schema evidence found. Rerun Agent Readiness after publishing the homepage JSON-LD.",
          });
        }

        const failedChecks = schemaChecks.filter((item: any) => !item.passed);
        const scannedEvidence = {
          type: 'agent_readiness_schema_fix_pack_scan',
          reportId: latestReport.id,
          issueId,
          requiredIds,
          passed: failedChecks.length === 0,
          checks: schemaChecks.map((item: any) => ({
            id: item.id,
            label: item.label,
            passed: Boolean(item.passed),
            severity: item.severity || null,
            message: item.message || null,
          })),
          scannedAt: latestReport.createdAt,
        };

        const note = failedChecks.length === 0
          ? `Homepage schema fix pack verified in Agent Readiness scan ${latestReport.id}. JSON-LD, Organization schema, and WebSite schema all pass.`
          : `Homepage schema fix pack still pending in Agent Readiness scan ${latestReport.id}: ${failedChecks.map((item: any) => item.label || item.id).join(', ')} still failing.`;
        const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
          ...item,
          status: failedChecks.length === 0 ? 'verified' : 'pending',
          verifiedAt: failedChecks.length === 0 ? new Date().toISOString() : null,
          verificationNote: note,
          evidence: scannedEvidence,
          lastCheckedAt: new Date().toISOString(),
        } : item);

        await storage.updateBrand(brand.id, {
          brandDevData: {
            ...data,
            verificationTasks: updatedTasks,
          },
        } as any);

        let updatedOptimization: any = null;
        if (failedChecks.length === 0) {
          updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
            status: 'verified',
            actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
            verifiedAt: new Date(),
          } as any);
        }

        return res.json({
          verified: failedChecks.length === 0,
          message: note,
          evidence: scannedEvidence,
          task: updatedTasks.find((item: any) => item.id === taskId),
          optimization: updatedOptimization,
        });
      }

      const check = checks.find((item: any) => item?.id === issueId);
      if (!latestReport || !check) {
        return res.json({
          verified: false,
          issueId,
          message: "No latest Agent Readiness scan evidence found for this issue. Run a scan first.",
        });
      }

      const scannedEvidence = {
        type: 'agent_readiness_scan',
        reportId: latestReport.id,
        issueId,
        label: check.label,
        passed: Boolean(check.passed),
        severity: check.severity || null,
        message: check.message || null,
        fixHint: check.fixHint || null,
        scannedAt: latestReport.createdAt,
      };

      if (!check.passed) {
        const note = `${check.label || issueId} is still failing in Agent Readiness scan ${latestReport.id}.`;
        const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
          ...item,
          status: 'pending',
          verifiedAt: null,
          verificationNote: note,
          evidence: scannedEvidence,
          lastCheckedAt: new Date().toISOString(),
        } : item);

        await storage.updateBrand(brand.id, {
          brandDevData: {
            ...data,
            verificationTasks: updatedTasks,
          },
        } as any);

        return res.json({
          verified: false,
          issueId,
          label: check.label,
          scannedAt: latestReport.createdAt,
          evidence: scannedEvidence,
          task: updatedTasks.find((item: any) => item.id === taskId),
          message: note,
        });
      }

      const note = `${check.label || issueId} passed in Agent Readiness scan ${latestReport.id}.`;
      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        verificationNote: note,
        evidence: scannedEvidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      const updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
        status: 'verified',
        actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
        verifiedAt: new Date(),
      } as any);

      res.json({
        verified: true,
        message: note,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-answer-intelligence - Verify against latest answer evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-answer-intelligence", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 200);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('answer_intelligence:')) {
        return res.status(400).json({ message: "This verification task is not linked to an Answer Intelligence risk." });
      }

      const sourceAnswerId = actionType.replace(/^answer_intelligence:/, '');
      const answers = await storage.getLlmAnswersByBrand(brand.id, 5000);
      const sourceAnswer = (answers as any[]).find((answer: any) => answer.id === sourceAnswerId);
      if (!sourceAnswer) {
        return res.status(404).json({ message: "Source answer evidence was not found." });
      }

      const appliedAt = (optimization as any).appliedAt ? new Date((optimization as any).appliedAt).getTime() : 0;
      const sourceCreatedAt = sourceAnswer.createdAt ? new Date(sourceAnswer.createdAt).getTime() : 0;
      const minEvidenceTime = Math.max(appliedAt, sourceCreatedAt);
      const latestCandidate = (answers as any[])
        .filter((answer: any) => answer.promptId === sourceAnswer.promptId)
        .filter((answer: any) => String(answer.llmProvider || answer.llmModel || '') === String(sourceAnswer.llmProvider || sourceAnswer.llmModel || ''))
        .filter((answer: any) => answer.id !== sourceAnswerId)
        .filter((answer: any) => answer.createdAt && new Date(answer.createdAt).getTime() >= minEvidenceTime)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (!latestCandidate) {
        return res.status(409).json({
          verified: false,
          message: "No newer answer evidence found for this prompt/provider. Re-run the prompt after applying the fix.",
        });
      }

      const allMentions = await storage.getAllMentionsForBrand(brand.id, 5000);
      const mentionsForAnswer = (answerId: string) => (allMentions as any[]).filter((mention: any) => mention.llmAnswerId === answerId);
      const summarizeRisk = (answerId: string) => {
        const mentions = mentionsForAnswer(answerId);
        const brandMentions = mentions.filter((mention: any) => !mention.competitorId);
        const competitorMentions = mentions.filter((mention: any) => mention.competitorId);
        const positions = brandMentions.map((mention: any) => Number(mention.position)).filter((position: number) => Number.isFinite(position) && position > 0);
        const avgPosition = positions.length ? Math.round((positions.reduce((sum: number, position: number) => sum + position, 0) / positions.length) * 10) / 10 : null;
        return {
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          avgPosition,
          missingBrand: brandMentions.length === 0,
          negativeSentiment: brandMentions.some((mention: any) => String(mention.sentiment || '').toLowerCase() === 'negative'),
          lowPosition: avgPosition != null && avgPosition > 3,
          competitorPressure: competitorMentions.length > brandMentions.length,
        };
      };

      const before = summarizeRisk(sourceAnswerId);
      const after = summarizeRisk(latestCandidate.id);
      const verified = !after.missingBrand && !after.negativeSentiment && !after.lowPosition && !after.competitorPressure;

      if (!verified) {
        return res.status(409).json({
          verified: false,
          sourceAnswerId,
          latestAnswerId: latestCandidate.id,
          message: "Latest answer evidence still shows an Answer Intelligence risk.",
          before,
          after,
        });
      }

      const note = `Answer Intelligence risk resolved in newer ${latestCandidate.llmProvider || latestCandidate.llmModel || 'AI'} answer ${latestCandidate.id}.`;
      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        verificationNote: note,
        evidence: {
          type: 'answer_intelligence_scan',
          sourceAnswerId,
          latestAnswerId: latestCandidate.id,
          promptId: sourceAnswer.promptId,
          provider: latestCandidate.llmProvider || latestCandidate.llmModel || 'unknown',
          before,
          after,
          checkedAt: new Date().toISOString(),
        },
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      const updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
        status: 'verified',
        actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
        verifiedAt: new Date(),
      } as any);

      res.json({
        verified: true,
        message: note,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-citation-opportunity - Verify source evidence after citation work
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-citation-opportunity", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 200);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('citation_opportunity:')) {
        return res.status(400).json({ message: "This verification task is not linked to a Citation Opportunity." });
      }

      const sourceId = actionType.replace(/^citation_opportunity:/, '');
      const sources = await storage.getSourcesByBrand(brand.id);
      const source = (sources as any[]).find((item: any) => item.id === sourceId);
      if (!source) {
        return res.status(404).json({ message: "Citation source was not found." });
      }

      const appliedAt = (optimization as any).appliedAt ? new Date((optimization as any).appliedAt).getTime() : 0;
      const lastSeenAt = source.lastSeen ? new Date(source.lastSeen).getTime() : 0;
      const updatedAt = source.updatedAt ? new Date(source.updatedAt).getTime() : 0;
      const evidenceTime = Math.max(lastSeenAt, updatedAt);
      const citations = Number(source.mentions || 0);
      const models = Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : [];
      const hasFreshEvidence = appliedAt > 0 ? evidenceTime >= appliedAt : citations > 0;
      const hasCitationEvidence = citations > 0 || models.length > 0;

      if (!hasFreshEvidence || !hasCitationEvidence) {
        return res.status(409).json({
          verified: false,
          sourceId,
          message: appliedAt > 0
            ? "No fresh citation evidence found after this task was applied. Re-run source/citation extraction after the source work goes live."
            : "No citation evidence found for this source yet.",
          evidence: {
            citations,
            models,
            lastSeen: source.lastSeen || null,
            updatedAt: source.updatedAt || null,
            appliedAt: (optimization as any).appliedAt || null,
          },
        });
      }

      const note = `Citation opportunity verified: ${source.domain || source.url} has ${citations} citation${citations === 1 ? '' : 's'} across ${models.length || 1} model surface${models.length === 1 ? '' : 's'}.`;
      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        verificationNote: note,
        evidence: {
          type: 'citation_opportunity_scan',
          sourceId,
          domain: source.domain,
          url: source.url,
          citations,
          models,
          lastSeen: source.lastSeen || null,
          checkedAt: new Date().toISOString(),
        },
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      const updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
        status: 'verified',
        actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
        verifiedAt: new Date(),
      } as any);

      res.json({
        verified: true,
        message: note,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-product-pilot - Verify product pilot gate evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-product-pilot", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 200);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('product_pilot:')) {
        return res.status(400).json({ message: "This verification task is not linked to a Product Pilot gate." });
      }

      const checkId = actionType.replace(/^product_pilot:/, '');
      const { buildProductVisibilityClientReport } = await import('./services/product-readiness');
      const report = await buildProductVisibilityClientReport(brand as any);
      const check = (report.pilotReadiness?.checks || []).find((item: any) => item.id === checkId);
      if (!check) {
        return res.status(404).json({ message: "Product Pilot gate evidence was not found." });
      }

      const evidence = {
        type: 'product_pilot_check',
        checkId,
        label: check.label,
        status: check.status,
        passed: check.status === 'pass',
        score: Number(check.score || 0),
        evidence: check.evidence,
        fix: check.fix,
        pilotStatus: report.pilotReadiness.status,
        pilotScore: report.pilotReadiness.score,
        checkedAt: new Date().toISOString(),
      };

      if (check.status !== 'pass') {
        const note = `${check.label || checkId} is still ${check.status} in Product Pilot Readiness (${check.score}/100).`;
        const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
          ...item,
          status: 'pending',
          verifiedAt: null,
          verificationNote: note,
          evidence,
          lastCheckedAt: new Date().toISOString(),
        } : item);

        await storage.updateBrand(brand.id, {
          brandDevData: {
            ...data,
            verificationTasks: updatedTasks,
          },
        } as any);

        return res.json({
          verified: false,
          checkId,
          label: check.label,
          evidence,
          task: updatedTasks.find((item: any) => item.id === taskId),
          message: note,
        });
      }

      const note = `${check.label || checkId} passed in Product Pilot Readiness (${check.score}/100).`;
      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      const updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
        status: 'verified',
        actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
        verifiedAt: new Date(),
      } as any);

      res.json({
        verified: true,
        message: note,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-market-opportunity - Verify market opportunity evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-market-opportunity", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('market_opportunity:')) {
        return res.status(400).json({ message: "This verification task is not linked to a Market Opportunity." });
      }

      const opportunityId = actionType.replace(/^market_opportunity:/, '');
      let verified = false;
      let note = '';
      let evidence: any = {
        type: 'market_opportunity_check',
        opportunityId,
        checkedAt: new Date().toISOString(),
      };

      if (opportunityId.startsWith('prompt:')) {
        const promptId = opportunityId.replace(/^prompt:/, '');
        const [prompts, answers, allMentions, competitors] = await Promise.all([
          storage.getPromptsByBrand(brand.id).catch(() => []),
          storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
          storage.getAllMentionsForBrand(brand.id, 5000).catch(() => []),
          storage.getCompetitorsByBrand(brand.id).catch(() => []),
        ]);
        const prompt = (prompts as any[]).find((item: any) => item.id === promptId);
        if (!prompt) return res.status(404).json({ message: "Prompt opportunity source was not found." });

        const competitorNames = new Set((competitors as any[]).map((competitor: any) => String(competitor.name || '').toLowerCase()).filter(Boolean));
        const promptAnswers = (answers as any[]).filter((answer: any) => answer.promptId === promptId);
        const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
        const mentions = (allMentions as any[]).filter((mention: any) => answerIds.has(mention.llmAnswerId));
        const brandMentions = mentions.filter((mention: any) => !mention.competitorId && !competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const competitorMentions = mentions.filter((mention: any) => mention.competitorId || competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const providers = new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean));
        const mentionRate = promptAnswers.length ? Math.round((new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size / promptAnswers.length) * 100) : 0;
        const competitorPressure = competitorMentions.length > brandMentions.length;
        const score = Math.max(0, Math.min(100, Math.round(
          (promptAnswers.length === 0 ? 35 : (100 - mentionRate) * 0.5)
          + (competitorPressure ? 25 : 0)
          + (providers.size < 3 ? 15 : 0)
          + (String(prompt.category || '').match(/comparison|product|pricing|review/i) ? 10 : 0)
        )));

        verified = promptAnswers.length > 0 && providers.size >= 3 && mentionRate >= 60 && !competitorPressure && score < 35;
        evidence = {
          ...evidence,
          promptId,
          prompt: prompt.text,
          score,
          mentionRate,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          providers: providers.size,
        };
        note = verified
          ? `Market prompt opportunity resolved: ${mentionRate}% mention rate across ${providers.size} providers with no competitor pressure.`
          : `Market prompt opportunity still open: ${mentionRate}% mention rate, ${brandMentions.length} brand mentions, ${competitorMentions.length} competitor mentions, ${providers.size} providers, opportunity score ${score}/100.`;
      } else if (opportunityId === 'launch:prompt_coverage') {
        const prompts = await storage.getPromptsByBrand(brand.id).catch(() => []);
        const promptCount = (prompts as any[]).length;
        verified = promptCount >= 25;
        evidence = { ...evidence, promptCount, target: 25 };
        note = verified
          ? `Prompt coverage gate passed with ${promptCount}/25 tracked prompts.`
          : `Prompt coverage gate still open with ${promptCount}/25 tracked prompts.`;
      } else if (opportunityId === 'launch:verification_debt') {
        const otherPending = tasks.filter((item: any) => item.id !== taskId && item.status !== 'verified').length;
        verified = otherPending === 0;
        evidence = { ...evidence, otherPendingVerificationTasks: otherPending };
        note = verified
          ? 'Verification debt cleared; no other pending proof tasks remain.'
          : `Verification debt remains: ${otherPending} other proof task${otherPending === 1 ? '' : 's'} still pending.`;
      } else if (opportunityId === 'product:readiness') {
        const { buildProductReadiness } = await import('./services/product-readiness');
        const readiness = await buildProductReadiness(brand as any);
        const score = Number(readiness.score || 0);
        verified = score >= 70;
        evidence = { ...evidence, productReadinessScore: score, relevant: Boolean(readiness.relevant) };
        note = verified
          ? `Product readiness opportunity resolved at ${score}/100.`
          : `Product readiness is still ${score}/100; target is 70/100.`;
      } else {
        return res.status(400).json({ message: "This Market Opportunity type does not have an automatic checker yet." });
      }

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence: { ...evidence, passed: verified },
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-provider-recovery - Verify provider recovery after preflight/sampling
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-provider-recovery", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('provider_recovery:')) {
        return res.status(400).json({ message: "This verification task is not linked to Provider Recovery." });
      }

      const provider = actionType.replace(/^provider_recovery:/, '').toLowerCase();
      const normalizeProvider = (value: unknown) => {
        const text = String(value || '').toLowerCase();
        if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
        if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
        if (text.includes('google') || text.includes('gemini')) return 'google';
        if (text.includes('perplexity')) return 'perplexity';
        if (text.includes('deepseek')) return 'deepseek';
        if (text.includes('grok')) return 'grok';
        return text || 'unknown';
      };
      const toTime = (value: any) => {
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
      };
      const minEvidenceTime = Math.max(
        toTime((optimization as any).appliedAt),
        toTime(task.createdAt),
        toTime((optimization as any).createdAt),
      );

      const [answers, runs] = await Promise.all([
        storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
        storage.getPromptRunsByBrand(brand.id, 2000).catch(() => []),
      ]);
      const providerAnswers = (answers as any[])
        .filter((answer: any) => normalizeProvider(answer.llmProvider || answer.provider || answer.llmModel || answer.model) === provider)
        .filter((answer: any) => toTime(answer.createdAt) >= minEvidenceTime);
      const providerRuns = (runs as any[])
        .filter((run: any) => normalizeProvider(run.llmProvider || run.provider || run.llmModel || run.model) === provider)
        .filter((run: any) => Math.max(toTime(run.completedAt), toTime(run.startedAt), toTime(run.createdAt)) >= minEvidenceTime);
      const completedRuns = providerRuns.filter((run: any) => String(run.status || '').toLowerCase() === 'completed').length;
      const failedRuns = providerRuns.filter((run: any) => String(run.status || '').toLowerCase() === 'failed').length;

      const preflightRuns = Array.isArray((data as any).providerPreflightRuns) ? (data as any).providerPreflightRuns : [];
      const latestProviderPreflight = preflightRuns
        .map((preflight: any) => ({
          ...preflight,
          result: (preflight.results || []).find((result: any) => normalizeProvider(result.provider) === provider),
        }))
        .filter((preflight: any) => preflight.result)
        .sort((a: any, b: any) => toTime(b.finishedAt || b.startedAt) - toTime(a.finishedAt || a.startedAt))[0] || null;
      const preflightOk = Boolean(latestProviderPreflight?.result?.ok);
      const verified = providerAnswers.length > 0 && completedRuns > 0 && failedRuns === 0 && preflightOk;
      const note = verified
        ? `${provider} provider recovery verified with ${providerAnswers.length} fresh answer${providerAnswers.length === 1 ? '' : 's'} and ${completedRuns} completed run${completedRuns === 1 ? '' : 's'} after application.`
        : `${provider} provider recovery still pending: ${providerAnswers.length} fresh answers, ${completedRuns} completed runs, ${failedRuns} failed runs${latestProviderPreflight?.result ? `, latest preflight ${latestProviderPreflight.result.status || (preflightOk ? 'ok' : 'failed')}` : ', no passing provider preflight result'}.`;
      const evidence = {
        type: 'provider_recovery_check',
        provider,
        passed: verified,
        freshAnswers: providerAnswers.length,
        completedRuns,
        failedRuns,
        latestPreflight: latestProviderPreflight ? {
          id: latestProviderPreflight.id,
          finishedAt: latestProviderPreflight.finishedAt || null,
          status: latestProviderPreflight.result?.status || null,
          ok: Boolean(latestProviderPreflight.result?.ok),
          message: latestProviderPreflight.result?.message || null,
          envHint: latestProviderPreflight.result?.envHint || null,
        } : null,
        checkedAt: new Date().toISOString(),
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationMethod: 'provider_recovery_check',
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-production-hardening - Verify a production gate by rerunning current gate evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-production-hardening", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('production_hardening:')) {
        return res.status(400).json({ message: "This verification task is not linked to a Production Hardening gate." });
      }

      const gateId = actionType.replace(/^production_hardening:/, '').toLowerCase();
      const normalizeProvider = (value: unknown) => {
        const text = String(value || '').toLowerCase();
        if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
        if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
        if (text.includes('google') || text.includes('gemini')) return 'google';
        if (text.includes('perplexity')) return 'perplexity';
        if (text.includes('deepseek')) return 'deepseek';
        if (text.includes('grok')) return 'grok';
        return text || 'unknown';
      };

      const [
        latestScore,
        prompts,
        answers,
        promptRuns,
        sources,
        competitors,
        agentReport,
        optimizations,
        integrations,
        alertRules,
        reportSchedules,
        analysisSchedule,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brand.id).catch(() => undefined),
        storage.getPromptsByBrand(brand.id).catch(() => []),
        storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
        storage.getPromptRunsByBrand(brand.id, 2000).catch(() => []),
        storage.getSourcesByBrand(brand.id).catch(() => []),
        storage.getCompetitorsByBrand(brand.id).catch(() => []),
        storage.getLatestAgentReadinessReport(brand.id).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brand.id, 500).catch(() => []),
        storage.getIntegrationsByBrand(brand.id).catch(() => []),
        storage.getAlertRulesByBrand(brand.id).catch(() => []),
        storage.getReportSchedulesByBrand(brand.id).catch(() => []),
        storage.getAnalysisSchedule(brand.id).catch(() => undefined),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brand.id);
      } catch {
        crawlerStats = null;
      }

      let attribution: any = null;
      try {
        const { computeAttribution } = await import('./services/attribution');
        attribution = await computeAttribution(brand.id, 30, true);
      } catch {
        attribution = { dataComplete: false, aiReferralSessions: 0, aiReferralConversions: 0, aiAttributedRevenue: 0 };
      }

      const launchTrend = await buildLaunchTrendSnapshot(brand).catch(() => null);
      const providerPreflightRuns = Array.isArray(data.providerPreflightRuns) ? data.providerPreflightRuns : [];
      const latestProviderPreflight = providerPreflightRuns[0] || null;
      const freshEnterpriseProviders = CORE_SCAN_PROVIDERS.filter((provider) =>
        (answers as any[]).some((answer: any) => {
          if (normalizeProvider(answer.llmProvider || answer.provider || answer.llmModel || answer.model) !== provider) return false;
          const created = answer.createdAt ? new Date(answer.createdAt) : null;
          return created && !Number.isNaN(created.getTime()) && Date.now() - created.getTime() <= 72 * 60 * 60 * 1000;
        })
      );
      const failedEnterpriseProviders = CORE_SCAN_PROVIDERS.filter((provider) =>
        (promptRuns as any[]).some((run: any) => normalizeProvider(run.llmProvider) === provider && String(run.status || '').toLowerCase() === 'failed')
      );
      const preflightBlocked = latestProviderPreflight ? (latestProviderPreflight.results || []).filter((result: any) => !result.ok).length : null;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const promptCount = (prompts as any[]).length;
      const competitorCount = (competitors as any[]).length;
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const agentScore = Number((agentReport as any)?.score || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const productScore = Number(productReadiness?.score || 0);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const aiReferralSessions = Number(attribution?.aiReferralSessions || attribution?.totalReferrals || 0);
      const aiReferralConversions = Number(attribution?.aiReferralConversions || attribution?.totalConversions || 0);
      const aiAttributedRevenue = Number(attribution?.aiAttributedRevenue || attribution?.attributedRevenue || 0);
      const attributionComplete = Boolean(attribution?.dataComplete);
      const currentVerificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => ['applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const pendingVerification = currentVerificationTasks.filter((item: any) => item.id !== taskId && item.status !== 'verified').length;
      const integrationPlatform = (integration: any) => String(integration.platform || integration.type || integration.config?.platform || '').toLowerCase();
      const integrationStatus = (integration: any) => String(integration.status || integration.syncStatus || integration.sync_status || integration.config?.status || (integration.isActive ? 'connected' : '')).toLowerCase();
      const connectedIntegrationPlatforms = new Set((integrations as any[])
        .filter((integration: any) => integrationStatus(integration) === 'connected')
        .map(integrationPlatform));
      const hasGsc = connectedIntegrationPlatforms.has('google_search_console') || connectedIntegrationPlatforms.has('gsc');
      const hasGa4 = connectedIntegrationPlatforms.has('google_analytics') || connectedIntegrationPlatforms.has('ga4');
      const activeAlertRules = (alertRules as any[]).filter((rule: any) => rule.isEnabled !== false && rule.isActive !== false).length;
      const activeReportSchedules = (reportSchedules as any[]).filter((schedule: any) => schedule.isActive !== false).length;
      const hasAnalysisSchedule = Boolean((analysisSchedule as any)?.isEnabled || (brand as any).analysisEnabled);

      const gateChecks: Record<string, { label: string; status: 'ready' | 'partial' | 'blocked'; evidence: string; target: string }> = {
        provider_reliability: {
          label: 'Enterprise provider reliability',
          status: freshEnterpriseProviders.length >= 4 && failedEnterpriseProviders.length === 0 && preflightBlocked === 0 ? 'ready' : freshEnterpriseProviders.length > 0 ? 'partial' : 'blocked',
          evidence: `${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh; ${failedEnterpriseProviders.length} failed providers; ${preflightBlocked == null ? 'no preflight' : `${preflightBlocked} preflight blockers`}`,
          target: '4+ fresh enterprise providers, no failed providers, and zero preflight blockers',
        },
        demand_coverage: {
          label: 'Prompt and competitor coverage',
          status: promptCount >= 25 && competitorCount >= 3 ? 'ready' : promptCount > 0 || competitorCount > 0 ? 'partial' : 'blocked',
          evidence: `${promptCount} prompts, ${competitorCount} competitors`,
          target: '25+ prompts and 3+ competitors',
        },
        source_depth: {
          label: 'Citation/source depth',
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'blocked',
          evidence: `${sourceDomains} source domains, ${citedUrls} cited URLs`,
          target: '10+ source domains and 10+ cited URLs',
        },
        agent_readiness: {
          label: 'Agent readiness',
          status: agentScore >= 75 ? 'ready' : agentScore > 0 ? 'partial' : 'blocked',
          evidence: `${agentScore}/100 agent readiness`,
          target: '75+ Agent Readiness score',
        },
        product_readiness: {
          label: 'Product/seller readiness',
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'blocked',
          evidence: productRelevant ? `${productScore}/100 product readiness` : 'Inactive for this non-product-led brand',
          target: '70+ Product Readiness score when product workflows apply',
        },
        workflow_proof: {
          label: 'Verified action proof',
          status: verifiedActions > 0 && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 ? 'partial' : 'blocked',
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified, ${pendingVerification} pending proof tasks excluding this check`,
          target: 'at least one verified action and no remaining pending proof tasks',
        },
        attribution: {
          label: 'AI attribution proof',
          status: attributionComplete && (aiReferralSessions > 0 || aiReferralConversions > 0 || aiAttributedRevenue > 0) ? 'ready' : crawlerVisits > 0 || attributionComplete ? 'partial' : 'blocked',
          evidence: `${crawlerVisits} crawler visits, ${aiReferralSessions} AI referrals, ${aiReferralConversions} conversions, $${Math.round(aiAttributedRevenue).toLocaleString()} revenue`,
          target: 'complete attribution with AI referrals, conversions, or revenue',
        },
        integrations: {
          label: 'Production integrations',
          status: hasGsc && hasGa4 ? 'ready' : hasGsc || hasGa4 || connectedIntegrationPlatforms.size > 0 ? 'partial' : 'blocked',
          evidence: `${Array.from(connectedIntegrationPlatforms).join(', ') || 'no'} connected integrations`,
          target: 'GA4 and Google Search Console connected',
        },
        monitoring: {
          label: 'Monitoring and alerts',
          status: hasAnalysisSchedule && activeAlertRules >= 3 ? 'ready' : hasAnalysisSchedule || activeAlertRules > 0 ? 'partial' : 'blocked',
          evidence: `${activeAlertRules} active alert rules; scheduled analysis ${hasAnalysisSchedule ? 'enabled' : 'missing'}`,
          target: 'scheduled analysis plus 3+ active alert rules',
        },
        reporting: {
          label: 'Boardroom reporting cadence',
          status: activeReportSchedules > 0 && visibilityScore > 0 ? 'ready' : activeReportSchedules > 0 || visibilityScore > 0 ? 'partial' : 'blocked',
          evidence: `${activeReportSchedules} active report schedules; visibility baseline ${visibilityScore}/100`,
          target: 'active report schedule and visibility baseline',
        },
        historical_trend: {
          label: 'Historical launch confidence',
          status: Number(launchTrend?.historicalConfidence?.score || 0) >= 70 ? 'ready' : launchTrend ? 'partial' : 'blocked',
          evidence: launchTrend?.historicalConfidence?.evidence || 'No launch trend snapshot available',
          target: '70+ historical confidence score',
        },
      };

      const gate = gateChecks[gateId];
      if (!gate) {
        return res.status(400).json({ message: `Unknown Production Hardening gate: ${gateId}` });
      }

      const verified = gate.status === 'ready';
      const note = verified
        ? `${gate.label} production gate verified: ${gate.evidence}.`
        : `${gate.label} production gate still ${gate.status}: ${gate.evidence}. Target: ${gate.target}.`;
      const evidence = {
        type: 'production_hardening_check',
        gateId,
        label: gate.label,
        status: gate.status,
        passed: verified,
        evidence: gate.evidence,
        target: gate.target,
        checkedAt: new Date().toISOString(),
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-integration-setup - Verify launch integrations and attribution setup
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-integration-setup", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('integration_setup:')) {
        return res.status(400).json({ message: "This verification task is not linked to Integration Setup." });
      }

      const setupId = actionType.replace(/^integration_setup:/, '').toLowerCase();
      const integrations = await storage.getIntegrationsByBrand(brand.id).catch(() => []);
      const integrationPlatform = (integration: any) => String(integration.platform || integration.type || integration.config?.platform || '').toLowerCase();
      const integrationStatus = (integration: any) => String(integration.status || integration.syncStatus || integration.sync_status || integration.config?.status || (integration.isActive ? 'connected' : '')).toLowerCase();
      const connected = new Set((integrations as any[])
        .filter((integration: any) => integrationStatus(integration) === 'connected')
        .map(integrationPlatform));
      let verified = false;
      let label = setupId;
      let detail = '';
      let target = '';
      let crawlerStats: any = null;

      if (setupId === 'gsc') {
        label = 'Google Search Console';
        verified = connected.has('google_search_console') || connected.has('gsc');
        detail = verified ? 'Google Search Console is connected.' : 'Google Search Console is not connected yet.';
        target = 'Connected Google Search Console integration';
      } else if (setupId === 'ga4') {
        label = 'GA4 conversion data';
        verified = connected.has('google_analytics') || connected.has('ga4');
        detail = verified ? 'Google Analytics is connected.' : 'Google Analytics is not connected yet.';
        target = 'Connected GA4/Google Analytics integration';
      } else if (setupId === 'agent_analytics') {
        label = 'Agent Analytics snippet';
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brand.id, 30);
        const totalVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
        verified = totalVisits > 0;
        detail = verified
          ? `Agent Analytics has ${totalVisits} crawler/test visit${totalVisits === 1 ? '' : 's'} in the last 30 days.`
          : 'Agent Analytics has no crawler or test visits yet.';
        target = 'At least one ingested Agent Analytics crawler or test visit';
      } else {
        return res.status(400).json({ message: `Unknown Integration Setup check: ${setupId}` });
      }

      const note = verified
        ? `${label} setup verified. ${detail}`
        : `${label} setup still pending. ${detail} Target: ${target}.`;
      const evidence = {
        type: 'integration_setup_check',
        setupId,
        label,
        passed: verified,
        connectedIntegrations: Array.from(connected),
        crawlerVisits: crawlerStats ? Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0) : null,
        target,
        checkedAt: new Date().toISOString(),
        message: note,
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-competitive-parity - Verify Athena/Peec/Profound parity blockers
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-competitive-parity", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      if (!actionType.startsWith('competitive_parity:')) {
        return res.status(400).json({ message: "This verification task is not linked to Competitive Parity." });
      }

      const capabilityId = actionType.replace(/^competitive_parity:/, '').toLowerCase();
      const [
        latestScore,
        prompts,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        answers,
        providerSummary,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brand.id).catch(() => undefined),
        storage.getPromptsByBrand(brand.id).catch(() => []),
        storage.getSourcesByBrand(brand.id).catch(() => []),
        storage.getAllMentionsForBrand(brand.id, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brand.id).catch(() => []),
        storage.getLatestAgentReadinessReport(brand.id).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brand.id, 500).catch(() => []),
        storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
        getProviderReliabilitySummary(brand.id).catch(() => null),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brand.id);
      } catch {
        crawlerStats = null;
      }

      const personaIntelligence = await buildAudiencePersonaIntelligence(brand).catch(() => null);
      const promptCount = (prompts as any[]).length;
      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId).length;
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId).length;
      const mentionsWithPosition = (allMentions as any[]).filter((mention: any) => Number(mention.position) > 0).length;
      const sentimentMentions = (allMentions as any[]).filter((mention: any) => ['positive', 'neutral', 'negative'].includes(String(mention.sentiment || '').toLowerCase())).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActions = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActions.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brand.id).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const agentScore = Number((agentReport as any)?.score || 0);
      const productScore = Number(productReadiness?.score || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const currentVerificationTasks = tasks.filter((item: any) => item.id !== taskId);
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const pendingVerification = currentVerificationTasks.filter((item: any) => item.status === 'pending').length;

      const capabilityChecks: Record<string, { label: string; status: 'ready' | 'partial' | 'missing'; evidence: string; target: string }> = {
        multi_model_visibility: {
          label: 'Cross-model visibility monitoring',
          status: promptCount >= 25 && freshEnterpriseProviders.length >= 4 && failedEnterpriseProviders.length === 0 ? 'ready' : promptCount > 0 || freshEnterpriseProviders.length > 0 ? 'partial' : 'missing',
          evidence: `${promptCount} prompts, ${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} fresh enterprise providers, ${failedEnterpriseProviders.length} provider failures`,
          target: '25+ prompts, 4+ fresh enterprise providers, and no provider failures',
        },
        query_fanout_intelligence: {
          label: 'Query fanout intelligence',
          status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'missing',
          evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP fanout artifacts, ${averageFanoutMentionRate}% average mention rate`,
          target: highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'Rerun prompts to prove AI answer movement after publication' : '100+ fanout queries and published AXP briefs for all high-opportunity fanouts',
        },
        citation_intelligence: {
          label: 'Citation and source intelligence',
          status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'missing',
          evidence: `${sourceDomains} source domains, ${citedUrls} cited URLs`,
          target: '10+ cited source domains and 10+ cited URLs',
        },
        competitive_sov: {
          label: 'Competitive share of voice',
          status: (competitors as any[]).length > 0 && competitorMentions > 0 ? 'ready' : (competitors as any[]).length > 0 ? 'partial' : 'missing',
          evidence: `${(competitors as any[]).length} competitors, ${brandMentions} brand mentions, ${competitorMentions} competitor mentions`,
          target: 'Competitors with sampled answer evidence',
        },
        sentiment_position_intelligence: {
          label: 'Sentiment and position intelligence',
          status: sentimentMentions >= 20 && mentionsWithPosition >= 20 ? 'ready' : sentimentMentions > 0 || mentionsWithPosition > 0 ? 'partial' : 'missing',
          evidence: `${sentimentMentions} sentiment-tagged mentions, ${mentionsWithPosition} positioned mentions`,
          target: '20+ sentiment-tagged and 20+ positioned mentions',
        },
        audience_persona_intelligence: {
          label: 'Audience persona intelligence',
          status: Number(personaIntelligence?.summary?.ready || 0) >= 3 ? 'ready' : Number(personaIntelligence?.summary?.partial || 0) > 0 ? 'partial' : 'missing',
          evidence: personaIntelligence ? `${personaIntelligence.summary.ready} ready, ${personaIntelligence.summary.partial} partial, ${personaIntelligence.summary.missing} missing personas` : 'No persona intelligence available',
          target: '3+ ready audience personas',
        },
        action_workflow: {
          label: 'Verified action workflow',
          status: verifiedActions > 0 && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 ? 'partial' : 'missing',
          evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified, ${pendingVerification} pending proof tasks excluding this check`,
          target: 'At least one verified action and no remaining pending proof tasks',
        },
        agent_brand_readiness: {
          label: 'Agent and brand integrity readiness',
          status: agentScore >= 75 ? 'ready' : agentScore > 0 ? 'partial' : 'missing',
          evidence: `${agentScore}/100 agent readiness`,
          target: '75+ Agent Readiness score',
        },
        shopping_readiness: {
          label: 'Shopping and product readiness',
          status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'missing',
          evidence: productRelevant ? `${productScore}/100 product readiness` : 'Not required for this non-product-led brand workflow',
          target: '70+ Product Readiness score when product workflows apply',
        },
        monitoring_alerts: {
          label: 'Launch monitoring and alerts',
          status: visibilityScore > 0 && promptCount >= 25 ? 'ready' : visibilityScore > 0 || promptCount > 0 ? 'partial' : 'missing',
          evidence: `${visibilityScore}/100 visibility score, ${promptCount} tracked prompts`,
          target: 'Visibility baseline and 25+ tracked prompts',
        },
        agent_analytics: {
          label: 'Agent analytics and attribution',
          status: crawlerVisits > 0 ? 'ready' : 'missing',
          evidence: `${crawlerVisits} AI crawler visits tracked`,
          target: 'At least one AI crawler or test visit',
        },
        executive_reporting: {
          label: 'Executive and client reporting',
          status: visibilityScore > 0 && plannedActions > 0 ? 'ready' : visibilityScore > 0 ? 'partial' : 'missing',
          evidence: `${visibilityScore}/100 visibility baseline, ${plannedActions} workflow actions`,
          target: 'Visibility baseline and active workflow actions',
        },
      };

      const capability = capabilityChecks[capabilityId];
      if (!capability) {
        return res.status(400).json({ message: `Unknown Competitive Parity capability: ${capabilityId}` });
      }

      const verified = capability.status === 'ready';
      const note = verified
        ? `${capability.label} parity verified: ${capability.evidence}.`
        : `${capability.label} parity still ${capability.status}: ${capability.evidence}. Target: ${capability.target}.`;
      const evidence = {
        type: 'competitive_parity_check',
        capabilityId,
        label: capability.label,
        status: capability.status,
        passed: verified,
        evidence: capability.evidence,
        target: capability.target,
        checkedAt: new Date().toISOString(),
        message: note,
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-generic-proof - Verify generic applied work against fresh AI/source/visibility evidence
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-generic-proof", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'optimization' || !task.sourceId) {
        return res.status(400).json({ message: "Only optimization-backed verification tasks can be checked automatically." });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = logs.find((log: any) => log.id === task.sourceId);
      if (!optimization) {
        return res.status(404).json({ message: "Source optimization was not found." });
      }

      const actionType = String((optimization as any).actionType || '');
      const specialistPrefixes = ['agent_readiness:', 'answer_intelligence:', 'citation_opportunity:', 'market_opportunity:', 'product_pilot:', 'provider_recovery:', 'production_hardening:', 'integration_setup:', 'competitive_parity:'];
      if (specialistPrefixes.some((prefix) => actionType.startsWith(prefix))) {
        return res.status(400).json({ message: "This verification task has a specialist proof checker. Use the dedicated check instead." });
      }

      const toTime = (value: any) => {
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
      };
      const minEvidenceTime = Math.max(
        toTime((optimization as any).appliedAt),
        toTime(task.createdAt),
        toTime((optimization as any).createdAt),
      );

      const [answers, mentions, sources, latestScore] = await Promise.all([
        storage.getLlmAnswersByBrand(brand.id, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brand.id, 5000).catch(() => []),
        storage.getSourcesByBrand(brand.id).catch(() => []),
        storage.getLatestVisibilityScore(brand.id).catch(() => undefined),
      ]);

      const freshAnswers = (answers as any[]).filter((answer: any) => toTime(answer.createdAt) >= minEvidenceTime);
      const freshAnswerIds = new Set(freshAnswers.map((answer: any) => answer.id));
      const freshMentions = (mentions as any[]).filter((mention: any) => freshAnswerIds.has(mention.llmAnswerId));
      const freshBrandMentions = freshMentions.filter((mention: any) => !mention.competitorId);
      const freshSourceEvidence = (sources as any[]).filter((source: any) => {
        const sourceTime = Math.max(toTime(source.lastSeen), toTime(source.updatedAt), toTime(source.createdAt));
        const citations = Number(source.mentions || 0);
        const models = Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : [];
        return sourceTime >= minEvidenceTime && (citations > 0 || models.length > 0);
      });
      const latestScoreTime = Math.max(toTime((latestScore as any)?.periodStart), toTime((latestScore as any)?.createdAt));
      const freshVisibilityScore = latestScoreTime >= minEvidenceTime ? latestScore : null;
      let publishedFanoutArtifact: any = null;
      if (actionType.startsWith('query_fanout:')) {
        const parsedFanout = parseQueryFanoutAction(String((optimization as any).actionDescription || ''));
        const prompt = parsedFanout.prompt.trim().toLowerCase();
        const pages = await storage.getAxpPagesByBrand(brand.id).catch(() => []);
        const matchingPage = (pages as any[]).find((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const targets = Array.isArray(page.targetPrompts) ? page.targetPrompts.map((item: any) => String(item || '').toLowerCase()) : [];
          return String(page.status || '').toLowerCase() === 'published'
            && prompt
            && (title.includes(prompt) || targets.some((target: string) => target === prompt || target.includes(prompt)));
        });
        if (matchingPage) {
          const versions = await storage.getAxpVersionsByPage(matchingPage.id).catch(() => []);
          const publishedVersion = (versions as any[]).find((version: any) => version.id === matchingPage.publishedVersionId)
            || (versions as any[]).find((version: any) => version.id === matchingPage.currentVersionId)
            || (versions as any[])[0];
          if (publishedVersion?.contentHtml || publishedVersion?.content) {
            publishedFanoutArtifact = {
              pageId: matchingPage.id,
              title: matchingPage.title,
              slug: matchingPage.slug,
              publishedVersionId: matchingPage.publishedVersionId || publishedVersion.id,
              artifactUrl: `/api/axp-pages/${matchingPage.id}/html`,
            };
          }
        }
      }

      const visibilitySignals = freshVisibilityScore ? {
        overallScore: Number((freshVisibilityScore as any).overallScore || 0),
        mentionCount: Number((freshVisibilityScore as any).mentionCount || (freshVisibilityScore as any).totalMentions || 0),
        coverageRate: Number((freshVisibilityScore as any).coverageRate || 0),
        citationCount: Number((freshVisibilityScore as any).citationCount || 0),
        periodStart: (freshVisibilityScore as any).periodStart || null,
      } : null;
      const hasVisibilitySignal = Boolean(visibilitySignals && (
        visibilitySignals.mentionCount > 0 ||
        visibilitySignals.coverageRate > 0 ||
        visibilitySignals.citationCount > 0 ||
        visibilitySignals.overallScore > 0
      ));
      const verified = freshBrandMentions.length > 0 || freshSourceEvidence.length > 0 || hasVisibilitySignal || Boolean(publishedFanoutArtifact);
      const note = verified
        ? publishedFanoutArtifact && freshBrandMentions.length === 0 && freshSourceEvidence.length === 0 && !hasVisibilitySignal
          ? `Query fanout implementation proof verified: published AXP artifact "${publishedFanoutArtifact.title}" is live. Rerun prompts later to prove AI answer, mention, citation, or visibility movement.`
          : `Generic proof verified with fresh evidence after application: ${freshAnswers.length} AI answer${freshAnswers.length === 1 ? '' : 's'}, ${freshBrandMentions.length} brand mention${freshBrandMentions.length === 1 ? '' : 's'}, ${freshSourceEvidence.length} cited source${freshSourceEvidence.length === 1 ? '' : 's'}${visibilitySignals ? `, visibility score ${visibilitySignals.overallScore}/100` : ''}.`
        : `Generic proof still pending: no fresh AI answer, source, or visibility evidence was found after this action was applied. Re-run the relevant prompts, citation extraction, and visibility scoring after the brand change is live.`;

      const evidence = {
        type: 'generic_proof_check',
        passed: verified,
        actionType,
        minEvidenceAt: minEvidenceTime ? new Date(minEvidenceTime).toISOString() : null,
        freshAnswers: freshAnswers.length,
        freshBrandMentions: freshBrandMentions.length,
        freshSourceEvidence: freshSourceEvidence.length,
        providers: Array.from(new Set(freshAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean))),
        visibilitySignals,
        publishedFanoutArtifact,
        checkedAt: new Date().toISOString(),
        message: note,
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      let updatedOptimization: any = null;
      if (verified) {
        updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
          status: 'verified',
          actualImpact: (optimization as any).actualImpact ?? (optimization as any).estimatedImpact ?? 10,
          verifiedAt: new Date(),
        } as any);
      }

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
        optimization: updatedOptimization,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/verification-tasks/:taskId/check-axp-publication - Verify published AXP artifact availability
  app.post("/api/brands/:brandId/verification-tasks/:taskId/check-axp-publication", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const taskId = decodeURIComponent(req.params.taskId);
      const task = tasks.find((item: any) => item.id === taskId);
      if (!task) {
        return res.status(404).json({ message: "Verification task not found" });
      }
      if (task.sourceType !== 'axp_page' || !task.sourceId) {
        return res.status(400).json({ message: "Only AXP page verification tasks can use this checker." });
      }

      const page = await storage.getAxpPage(String(task.sourceId));
      const versions = page ? await storage.getAxpVersionsByPage(page.id).catch(() => []) : [];
      const publishedVersion = page ? versions.find((version: any) => version.id === page.publishedVersionId) : null;
      const verified = Boolean(
        page
        && page.brandId === brand.id
        && String(page.status || '').toLowerCase() === 'published'
        && page.publishedVersionId
        && publishedVersion
        && (String((publishedVersion as any).contentHtml || '').trim() || String((publishedVersion as any).content || '').trim())
      );
      const artifactUrl = `/api/axp-pages/${task.sourceId}/html`;
      const note = verified
        ? `AXP publication verified: ${page?.title || 'published page'} is published with version ${publishedVersion?.versionNumber || 1} and a live HTML artifact.`
        : `AXP publication still pending: page, published status, published version, or HTML content is missing.`;
      const evidence = {
        type: 'axp_publication_check',
        passed: verified,
        pageId: task.sourceId,
        pageTitle: page?.title || null,
        pageStatus: page?.status || null,
        publishedVersionId: page?.publishedVersionId || null,
        artifactUrl,
        checkedAt: new Date().toISOString(),
        message: note,
      };

      const updatedTasks = tasks.map((item: any) => item.id === taskId ? {
        ...item,
        artifactUrl: item.artifactUrl || artifactUrl,
        status: verified ? 'verified' : 'pending',
        verifiedAt: verified ? new Date().toISOString() : null,
        verificationNote: note,
        evidence,
        lastCheckedAt: new Date().toISOString(),
      } : item);

      await storage.updateBrand(brand.id, {
        brandDevData: {
          ...data,
          verificationTasks: updatedTasks,
        },
      } as any);

      res.json({
        verified,
        message: note,
        evidence,
        task: updatedTasks.find((item: any) => item.id === taskId),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/answer-intelligence/risks/:answerId/task - Convert an answer risk into Action Workflow
  app.post("/api/brands/:brandId/answer-intelligence/risks/:answerId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const answerId = req.params.answerId;
      const [answers, prompts, allMentions, existingLogs] = await Promise.all([
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getOptimizationLogsByBrand(brandId, 200).catch(() => []),
      ]);

      const answer = (answers as any[]).find((item: any) => item.id === answerId);
      if (!answer) {
        return res.status(404).json({ message: "Answer risk not found for this brand." });
      }

      const actionType = `answer_intelligence:${answerId}`;
      const duplicate = (existingLogs as any[]).find((log: any) => log.actionType === actionType);
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This Answer Intelligence risk is already in Action Workflow." });
      }

      const prompt = (prompts as any[]).find((item: any) => item.id === answer.promptId);
      const mentionsForAnswer = (allMentions as any[]).filter((mention: any) => mention.llmAnswerId === answerId);
      const brandMentions = mentionsForAnswer.filter((mention: any) => !mention.competitorId);
      const competitorMentions = mentionsForAnswer.filter((mention: any) => mention.competitorId);
      const positions = brandMentions.map((mention: any) => Number(mention.position)).filter((position: number) => Number.isFinite(position) && position > 0);
      const avgPosition = positions.length ? Math.round((positions.reduce((sum: number, position: number) => sum + position, 0) / positions.length) * 10) / 10 : null;
      const negativeSentiment = brandMentions.some((mention: any) => String(mention.sentiment || '').toLowerCase() === 'negative');
      const missingBrand = brandMentions.length === 0;
      const lowPosition = avgPosition != null && avgPosition > 3;
      const competitorPressure = competitorMentions.length > brandMentions.length;

      const reason = missingBrand
        ? 'brand is absent'
        : negativeSentiment
        ? 'brand sentiment is negative'
        : lowPosition
        ? `brand average position is ${avgPosition}`
        : competitorPressure
        ? 'competitors are mentioned more often'
        : 'answer needs monitoring';
      const promptText = prompt?.text || 'Tracked AI answer';
      const actionDescription = `Answer Intelligence fix: ${promptText} (${reason}). ${missingBrand
        ? 'Create or strengthen content that answers this prompt and names the brand clearly.'
        : negativeSentiment
        ? 'Add proof, reviews, comparisons, guarantees, or support content to correct negative AI perception.'
        : lowPosition
        ? 'Improve authority and answer specificity so the brand appears in the top three recommendations.'
        : competitorPressure
        ? 'Build comparison content and proof assets against the competitors appearing in this answer.'
        : 'Monitor this answer for drift and rescan after content changes.'}`;
      const estimatedImpact = missingBrand || negativeSentiment ? 85 : lowPosition || competitorPressure ? 65 : 35;

      const task = await storage.createOptimizationLog({
        brandId,
        topicId: null,
        actionType,
        actionDescription,
        estimatedImpact,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: "Answer Intelligence risk added to Action Workflow.",
        risk: {
          answerId,
          promptId: answer.promptId,
          prompt: promptText,
          provider: answer.llmProvider || answer.llmModel || 'unknown',
          missingBrand,
          negativeSentiment,
          lowPosition,
          competitorPressure,
          avgPosition,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
        },
      });
    } catch (error: any) {
      console.error('[AnswerIntelligence] Task create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/optimizations - Create optimization log entry
  app.post("/api/brands/:brandId/optimizations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { topicId, actionType, actionDescription, estimatedImpact } = req.body;

      const log = await storage.createOptimizationLog({
        brandId: req.params.brandId,
        topicId: topicId || null,
        actionType: actionType || 'unknown',
        actionDescription: actionDescription || '',
        estimatedImpact: estimatedImpact || 0,
        status: 'pending',
      });

      res.json(log);
    } catch (error: any) {
      console.error('[OptimizationLogs] Create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/brands/:brandId/optimizations/:logId - Update optimization log
  app.patch("/api/brands/:brandId/optimizations/:logId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { status, actualImpact } = req.body;
      const updates: Partial<OptimizationLog> = {};

      if (status) {
        updates.status = status;
        if (status === 'applied') {
          updates.appliedAt = new Date();
        } else if (status === 'verified') {
          updates.verifiedAt = new Date();
        }
      }

      if (actualImpact !== undefined) {
        updates.actualImpact = actualImpact;
      }

      const updated = await storage.updateOptimizationLog(req.params.logId, updates);

      const refreshedBrand = await storage.getBrand(req.params.brandId);
      if (refreshedBrand && status === 'applied') {
        const verificationMethod = verificationMethodForAction(updated.actionType);
        await upsertBrandVerificationTask(refreshedBrand, buildVerificationTask({
          sourceType: 'optimization',
          sourceId: updated.id,
          title: updated.actionDescription || 'Verify applied optimization',
          verificationMethod,
          status: 'pending',
        }));
      } else if (refreshedBrand && status === 'verified') {
        const verificationMethod = verificationMethodForAction(updated.actionType);
        await upsertBrandVerificationTask(refreshedBrand, buildVerificationTask({
          sourceType: 'optimization',
          sourceId: updated.id,
          title: updated.actionDescription || 'Verified optimization',
          verificationMethod,
          status: 'verified',
        }));
      }

      res.json(updated);
    } catch (error: any) {
      console.error('[OptimizationLogs] Update failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= GAP-TO-ACTION ROUTES =============

  // GET /api/brands/:brandId/gaps - Get gap analysis with action recommendations
  app.get("/api/brands/:brandId/gaps", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getGapActionMapper } = await import('./services/gap-action-mapper');
      const mapper = getGapActionMapper();
      const gaps = await mapper.analyzeGaps(req.params.brandId);
      const actions = gaps.map(gap => mapper.mapGapToAction(gap));

      res.json({ gaps, actions });
    } catch (error: any) {
      console.error('[GapActionMapper] Analysis failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/actions - Get prioritized action list
  app.get("/api/brands/:brandId/actions", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 5;
      const { getGapActionMapper } = await import('./services/gap-action-mapper');
      const mapper = getGapActionMapper();
      const actions = await mapper.getPrioritizedActions(req.params.brandId, limit);
      const estimatedImprovement = mapper.estimateScoreImprovement(actions);

      res.json({ actions, estimatedImprovement });
    } catch (error: any) {
      console.error('[GapActionMapper] Actions fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= CITATION GAP ROUTES =============

  // GET /api/brands/:brandId/citation-gaps - Get citation gap analysis
  app.get("/api/brands/:brandId/citation-gaps", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getCitationGapAnalyzer } = await import('./services/citation-gap');
      const analyzer = getCitationGapAnalyzer();
      const analysis = await analyzer.analyzeCitationGaps(req.params.brandId);

      res.json(analysis);
    } catch (error: any) {
      console.error('[CitationGapAnalyzer] Analysis failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/citation-summary - Quick summary for dashboard
  app.get("/api/brands/:brandId/citation-summary", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getCitationGapAnalyzer } = await import('./services/citation-gap');
      const analyzer = getCitationGapAnalyzer();
      const summary = await analyzer.getCitationSummary(req.params.brandId);

      res.json(summary);
    } catch (error: any) {
      console.error('[CitationGapAnalyzer] Summary failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/topics/:topicId", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateTopic(qstr(req.params.topicId), req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/topics/:topicId", requireAuth, async (req, res) => {
    try {
      await storage.deleteTopic(qstr(req.params.topicId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= PROMPT ROUTES =============
  
  app.get("/api/brands/:brandId/prompts", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const prompts = await storage.getPromptsByBrand(req.params.brandId);
      res.json(prompts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/prompts", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = insertPromptSchema.parse({
        ...req.body,
        text: req.body?.text || req.body?.query || "",
        brandId: req.params.brandId,
      });
      const prompt = await storage.createPrompt(data);
      res.json(prompt);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/prompts/bulk", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const promptCandidates = Array.isArray(req.body?.prompts)
        ? req.body.prompts
        : Array.isArray(req.body?.queries)
          ? req.body.queries
          : [];

      const normalizedPrompts = promptCandidates
        .map((value: unknown) => String(value || "").trim())
        .filter((value: string) => value.length > 0);

      if (normalizedPrompts.length === 0) {
        return res.status(400).json({
          message: "Please select at least one prompt",
          code: "PROMPTS_REQUIRED",
        });
      }

      const planId = String((brand as any).tier || "free");
      const plan = await storage.getPlanCapability(planId);
      const fallbackPromptLimits: Record<string, number> = { free: 6, starter: 50, growth: 200, enterprise: -1 };
      const maxPrompts = typeof plan?.maxPrompts === "number"
        ? plan.maxPrompts
        : (fallbackPromptLimits[planId] ?? fallbackPromptLimits.free);

      const existingPrompts = await storage.getPromptsByBrand(req.params.brandId);
      const existingSet = new Set(existingPrompts.map((p) => String(p.text || "").trim().toLowerCase()).filter(Boolean));

      const uniqueNewPrompts: string[] = [];
      for (const promptText of normalizedPrompts) {
        const key = promptText.toLowerCase();
        if (existingSet.has(key)) continue;
        existingSet.add(key);
        uniqueNewPrompts.push(promptText);
      }

      if (maxPrompts >= 0 && existingPrompts.length + uniqueNewPrompts.length > maxPrompts) {
        return res.status(400).json({
          message: "Prompt limit reached for " + planId + " plan (" + maxPrompts + " max).",
          code: "PLAN_PROMPT_LIMIT",
          planId,
          maxPrompts,
          existingCount: existingPrompts.length,
          requestedCount: uniqueNewPrompts.length,
        });
      }

      const created = [];
      for (const promptText of uniqueNewPrompts) {
        const data = insertPromptSchema.parse({
          text: promptText,
          brandId: req.params.brandId,
          category: "general",
          isActive: true,
        });
        const prompt = await storage.createPrompt(data);
        created.push(prompt);
      }

      res.json({
        created,
        createdCount: created.length,
        skippedDuplicates: normalizedPrompts.length - created.length,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/prompt-coverage-plan", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const [prompts, competitors, context] = await Promise.all([
        storage.getPromptsByBrand(req.params.brandId),
        storage.getCompetitorsByBrand(req.params.brandId).catch(() => []),
        storage.getBrandContext(req.params.brandId).catch(() => undefined),
      ]);

      const productServices = (context as any)?.productServices;
      const catalog = Array.isArray(productServices?.catalog) ? productServices.catalog : [];
      const brandName = brand.name || 'this brand';
      const industry = brand.industry || brand.businessChannel || 'the category';
      const competitorNames = competitors.map((competitor: any) => competitor.name).filter(Boolean).slice(0, 3);
      const topCompetitor = competitorNames[0] || 'top competitors';
      const productNames = catalog.map((product: any) => product.name || product.title || product.asin || product.sku).filter(Boolean).slice(0, 3);
      const heroProduct = productNames[0] || `${brandName} product`;

      const classifyPromptIntent = (text: string, category?: string | null) => {
        const haystack = `${text} ${category || ''}`.toLowerCase();
        if (/\b(compare|vs|versus|alternative|alternatives)\b/.test(haystack)) return 'comparison';
        if (/\b(best|top|recommend|which|shortlist)\b/.test(haystack)) return 'recommendation';
        if (/\b(price|pricing|cost|buy|purchase|plan|budget)\b/.test(haystack)) return 'commercial';
        if (/\b(review|reviews|pros|cons|rating|complaint|feedback)\b/.test(haystack)) return 'review';
        if (/\b(product|sku|asin|amazon|marketplace|listing)\b/.test(haystack)) return 'product';
        if (/\b(trust|safe|legit|reliable|proof|case study|customer)\b/.test(haystack)) return 'trust';
        if (/\b(how|guide|steps|examples|learn|course|support)\b/.test(haystack)) return 'education';
        return 'discovery';
      };

      const existingTexts = new Set(prompts.map((prompt: any) => String(prompt.text || '').trim().toLowerCase()));
      const counts: Record<string, number> = {};
      prompts.forEach((prompt: any) => {
        const intent = classifyPromptIntent(prompt.text || '', prompt.category);
        counts[intent] = (counts[intent] || 0) + 1;
      });

      const intentTargets = [
        {
          intent: 'recommendation',
          label: 'Recommendation / best-of',
          target: 5,
          weight: 1,
          category: 'recommendation',
          templates: [
            `What are the best ${industry} options for Indian buyers and where does ${brandName} fit?`,
            `Which ${industry} brands would you recommend for a first-time buyer?`,
            `Top ${industry} providers for value, trust, and long-term support`,
          ],
        },
        {
          intent: 'comparison',
          label: 'Competitor comparison',
          target: 5,
          weight: 1,
          category: 'comparison',
          templates: [
            `Compare ${brandName} vs ${topCompetitor} for ${industry}`,
            `${brandName} alternatives: when should buyers choose ${topCompetitor} instead?`,
            `Which is better for ${industry}: ${brandName} or ${topCompetitor}?`,
          ],
        },
        {
          intent: 'commercial',
          label: 'Pricing / buying',
          target: 4,
          weight: 0.9,
          category: 'pricing',
          templates: [
            `Is ${brandName} worth the price for ${industry} buyers?`,
            `How much should I budget for ${industry}, and is ${brandName} good value?`,
            `Where can buyers purchase ${brandName} and what should they check before buying?`,
          ],
        },
        {
          intent: 'product',
          label: 'Product / SKU',
          target: productNames.length ? 5 : 3,
          weight: 0.9,
          category: 'product',
          templates: [
            `Is ${heroProduct} a good choice compared with competing products?`,
            `What problems does ${heroProduct} solve and who is it best for?`,
            `Best alternatives to ${heroProduct} on Amazon or D2C stores`,
          ],
        },
        {
          intent: 'review',
          label: 'Reviews / objections',
          target: 4,
          weight: 0.8,
          category: 'reviews',
          templates: [
            `${brandName} reviews: pros, cons, and common buyer complaints`,
            `What do customers like and dislike about ${brandName}?`,
            `Is ${brandName} reliable based on reviews and buyer feedback?`,
          ],
        },
        {
          intent: 'trust',
          label: 'Trust / proof',
          target: 4,
          weight: 0.8,
          category: 'trust',
          templates: [
            `Is ${brandName} a trustworthy brand in ${industry}?`,
            `What proof, certifications, case studies, or sources support ${brandName}?`,
            `Can ${brandName} be trusted compared with established ${industry} brands?`,
          ],
        },
        {
          intent: 'education',
          label: 'Education / support',
          target: 3,
          weight: 0.6,
          category: 'how-to',
          templates: [
            `How should someone choose the right ${industry} option?`,
            `What should buyers know before choosing ${brandName}?`,
            `Common mistakes buyers make when evaluating ${industry}`,
          ],
        },
      ];

      const intentCoverage = intentTargets.map((target) => {
        const current = counts[target.intent] || 0;
        const gap = Math.max(0, target.target - current);
        const suggestions = target.templates
          .filter((text) => !existingTexts.has(text.toLowerCase()))
          .slice(0, gap || 1)
          .map((text) => ({
            text,
            intent: target.intent,
            category: target.category,
            priorityScore: Math.min(100, Math.round(55 + (target.weight * 25) + (gap * 4))),
            reason: `${target.label} coverage is ${current}/${target.target}.`,
          }));
        return {
          intent: target.intent,
          label: target.label,
          target: target.target,
          current,
          gap,
          status: current >= target.target ? 'covered' : current > 0 ? 'partial' : 'missing',
          suggestions,
        };
      });

      const personaIntelligence = await buildAudiencePersonaIntelligence(brand).catch(() => null);
      const personaSuggestions = (personaIntelligence?.personas || [])
        .filter((persona: any) => persona.status !== 'ready')
        .flatMap((persona: any) => buildPersonaPromptTemplates(persona.id, brandName, industry, topCompetitor).map((template) => ({
          ...template,
          personaId: persona.id,
          personaLabel: persona.label,
          reason: `${persona.label} is ${persona.status}: ${persona.evidence}.`,
        })))
        .filter((suggestion: any) => !existingTexts.has(suggestion.text.toLowerCase()));

      const intentSuggestions = intentCoverage
        .flatMap((intent) => intent.suggestions)
        .filter((suggestion, index, list) => list.findIndex((item) => item.text === suggestion.text) === index)
        .slice(0, 18);
      const suggestions = [...personaSuggestions, ...intentSuggestions]
        .filter((suggestion, index, list) => list.findIndex((item: any) => item.text === (suggestion as any).text) === index)
        .slice(0, 18);
      const totalTarget = intentTargets.reduce((sum, item) => sum + item.target, 0);
      const coveredTarget = intentCoverage.reduce((sum, item) => sum + Math.min(item.current, item.target), 0);
      const coverageScore = totalTarget ? Math.round((coveredTarget / totalTarget) * 100) : 0;

      res.json({
        brandId: brand.id,
        brandName,
        promptCount: prompts.length,
        minimumRecommended: Math.max(25, totalTarget),
        coverageScore,
        status: coverageScore >= 80 && prompts.length >= 25 ? 'ready' : coverageScore >= 45 ? 'partial' : 'thin',
        intentCoverage,
        personaCoverage: personaIntelligence ? {
          score: personaIntelligence.score,
          verdict: personaIntelligence.verdict,
          summary: personaIntelligence.summary,
          personas: personaIntelligence.personas.map((persona: any) => ({
            id: persona.id,
            label: persona.label,
            status: persona.status,
            score: persona.score,
            promptCount: persona.promptCount,
            answerCount: persona.answerCount,
            mentionRate: persona.mentionRate,
            providerCount: persona.providerCount,
            gap: persona.gap,
            action: persona.action,
          })),
        } : null,
        suggestions,
        personaSuggestions: personaSuggestions.slice(0, 12),
        summary: prompts.length >= 25
          ? `${brandName} has ${prompts.length} prompts tracked; intent balance is ${coverageScore}/100.`
          : `${brandName} has ${prompts.length} prompts tracked. Add ${Math.max(0, 25 - prompts.length)} more prompts to reach enterprise-grade coverage.`,
      });
    } catch (error: any) {
      console.error('[PromptCoveragePlan] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/prompt-coverage/backfill", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [prompts, competitors, context] = await Promise.all([
        storage.getPromptsByBrand(brandId),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getBrandContext(brandId).catch(() => undefined),
      ]);

      const targetCount = Math.max(25, Math.min(100, Math.round(Number(req.body?.targetCount || 25))));
      const maxCreate = Math.max(0, Math.min(25, Math.round(Number(req.body?.maxCreate || targetCount - prompts.length))));
      if (prompts.length >= targetCount || maxCreate <= 0) {
        return res.json({
          created: [],
          createdCount: 0,
          skippedDuplicates: 0,
          promptCount: prompts.length,
          targetCount,
          message: `${brand.name || 'This brand'} already meets the ${targetCount}-prompt launch floor.`,
        });
      }

      const planId = String((brand as any).tier || "free");
      const plan = await storage.getPlanCapability(planId);
      const fallbackPromptLimits: Record<string, number> = { free: 6, starter: 50, growth: 200, enterprise: -1 };
      const maxPrompts = typeof plan?.maxPrompts === "number"
        ? plan.maxPrompts
        : (fallbackPromptLimits[planId] ?? fallbackPromptLimits.free);

      const productServices = (context as any)?.productServices;
      const catalog = Array.isArray(productServices?.catalog) ? productServices.catalog : [];
      const brandName = brand.name || 'this brand';
      const industry = brand.industry || brand.businessChannel || 'the category';
      const competitorNames = (competitors as any[]).map((competitor: any) => competitor.name).filter(Boolean).slice(0, 3);
      const topCompetitor = competitorNames[0] || 'top competitors';
      const productNames = catalog.map((product: any) => product.name || product.title || product.asin || product.sku).filter(Boolean).slice(0, 3);
      const heroProduct = productNames[0] || `${brandName} product`;
      const existingTexts = new Set((prompts as any[]).map((prompt: any) => String(prompt.text || '').trim().toLowerCase()).filter(Boolean));
      const classifyPromptIntent = (text: string, category?: string | null) => {
        const haystack = `${text} ${category || ''}`.toLowerCase();
        if (/\b(compare|vs|versus|alternative|alternatives)\b/.test(haystack)) return 'comparison';
        if (/\b(best|top|recommend|which|shortlist)\b/.test(haystack)) return 'recommendation';
        if (/\b(price|pricing|cost|buy|purchase|plan|budget)\b/.test(haystack)) return 'commercial';
        if (/\b(review|reviews|pros|cons|rating|complaint|feedback)\b/.test(haystack)) return 'review';
        if (/\b(product|sku|asin|amazon|marketplace|listing)\b/.test(haystack)) return 'product';
        if (/\b(trust|safe|legit|reliable|proof|case study|customer)\b/.test(haystack)) return 'trust';
        if (/\b(how|guide|steps|examples|learn|course|support)\b/.test(haystack)) return 'education';
        return 'discovery';
      };
      const counts: Record<string, number> = {};
      (prompts as any[]).forEach((prompt: any) => {
        const intent = classifyPromptIntent(prompt.text || '', prompt.category);
        counts[intent] = (counts[intent] || 0) + 1;
      });
      const personaIntelligence = await buildAudiencePersonaIntelligence(brand).catch(() => null);
      const personaCandidates = (personaIntelligence?.personas || [])
        .filter((persona: any) => persona.status !== 'ready')
        .flatMap((persona: any) => buildPersonaPromptTemplates(persona.id, brandName, industry, topCompetitor).map((template) => ({
          ...template,
          reason: `${persona.label} is ${persona.status}: ${persona.evidence}.`,
        })))
        .filter((candidate: any) => !existingTexts.has(candidate.text.toLowerCase()));

      const intentTemplates = [
        {
          intent: 'recommendation',
          category: 'recommendation',
          target: 5,
          templates: [
            `What are the best ${industry} options for Indian buyers and where does ${brandName} fit?`,
            `Which ${industry} brands would you recommend for a first-time buyer?`,
            `Top ${industry} providers for value, trust, and long-term support`,
          ],
        },
        {
          intent: 'comparison',
          category: 'comparison',
          target: 5,
          templates: [
            `Compare ${brandName} vs ${topCompetitor} for ${industry}`,
            `${brandName} alternatives: when should buyers choose ${topCompetitor} instead?`,
            `Which is better for ${industry}: ${brandName} or ${topCompetitor}?`,
          ],
        },
        {
          intent: 'commercial',
          category: 'pricing',
          target: 4,
          templates: [
            `Is ${brandName} worth the price for ${industry} buyers?`,
            `How much should I budget for ${industry}, and is ${brandName} good value?`,
            `Where can buyers purchase ${brandName} and what should they check before buying?`,
          ],
        },
        {
          intent: 'product',
          category: 'product',
          target: productNames.length ? 5 : 3,
          templates: [
            `Is ${heroProduct} a good choice compared with competing products?`,
            `What problems does ${heroProduct} solve and who is it best for?`,
            `Best alternatives to ${heroProduct} on Amazon or D2C stores`,
          ],
        },
        {
          intent: 'review',
          category: 'reviews',
          target: 4,
          templates: [
            `${brandName} reviews: pros, cons, and common buyer complaints`,
            `What do customers like and dislike about ${brandName}?`,
            `Is ${brandName} reliable based on reviews and buyer feedback?`,
          ],
        },
        {
          intent: 'trust',
          category: 'trust',
          target: 4,
          templates: [
            `Is ${brandName} a trustworthy brand in ${industry}?`,
            `What proof, certifications, case studies, or sources support ${brandName}?`,
            `Can ${brandName} be trusted compared with established ${industry} brands?`,
          ],
        },
        {
          intent: 'education',
          category: 'how-to',
          target: 3,
          templates: [
            `How should someone choose the right ${industry} option?`,
            `What should buyers know before choosing ${brandName}?`,
            `Common mistakes buyers make when evaluating ${industry}`,
          ],
        },
      ];

      const intentCandidates = intentTemplates
        .sort((a, b) => ((counts[a.intent] || 0) / a.target) - ((counts[b.intent] || 0) / b.target))
        .flatMap((intent) => intent.templates.map((text) => ({
          text,
          category: intent.category,
          intent: intent.intent,
          priorityScore: Math.min(100, 70 + Math.max(0, intent.target - (counts[intent.intent] || 0)) * 5),
        })))
        .filter((candidate, index, list) => list.findIndex((item) => item.text === candidate.text) === index)
        .filter((candidate) => !existingTexts.has(candidate.text.toLowerCase()));
      const candidates = [...personaCandidates, ...intentCandidates]
        .filter((candidate, index, list) => list.findIndex((item: any) => item.text === (candidate as any).text) === index);

      const needed = Math.min(maxCreate, targetCount - prompts.length, candidates.length);
      if (maxPrompts >= 0 && prompts.length + needed > maxPrompts) {
        return res.status(400).json({
          message: `Prompt limit reached for ${planId} plan (${maxPrompts} max).`,
          code: "PLAN_PROMPT_LIMIT",
          planId,
          maxPrompts,
          existingCount: prompts.length,
          requestedCount: needed,
        });
      }

      const created = [];
      for (const candidate of candidates.slice(0, needed)) {
        const data = insertPromptSchema.parse({
          text: candidate.text,
          brandId,
          category: candidate.category,
          intent: candidate.intent,
          priorityScore: candidate.priorityScore,
          source: 'coverage_backfill',
          isActive: true,
        });
        created.push(await storage.createPrompt(data));
      }

      res.json({
        created,
        createdCount: created.length,
        skippedDuplicates: candidates.length - created.length,
        promptCountBefore: prompts.length,
        promptCountAfter: prompts.length + created.length,
        targetCount,
        message: created.length
          ? `Added ${created.length} launch coverage prompt${created.length === 1 ? '' : 's'}; ${brandName} now has ${prompts.length + created.length}/${targetCount}.`
          : `No unique launch coverage prompts were available to add.`,
      });
    } catch (error: any) {
      console.error('[PromptCoverageBackfill] Create failed:', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/prompt-analytics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [prompts, answers, mentions, competitors] = await Promise.all([
        storage.getPromptsByBrand(brandId),
        storage.getLlmAnswersByBrand(brandId, 5000),
        storage.getAnswerMentionsByBrand(brandId, 5000),
        storage.getCompetitorsByBrand(brandId),
      ]);

      const competitorNames = competitors.map((c: any) => c.name);

      const estimatePromptVolume = (prompt: any) => {
        const text = String(prompt.text || '').toLowerCase();
        const storedPriority = Number(prompt.priorityScore || 0);
        const intentBoost =
          /\b(best|top|compare|vs|alternative|review|pricing|price|near me|buy|cost|recommend|which)\b/.test(text) ? 20 :
          /\b(how|what|why|guide|examples|ideas)\b/.test(text) ? 10 :
          0;
        const categoryBoost =
          /comparison|competitive|recommendation|pricing|reviews|product/i.test(String(prompt.category || '')) ? 15 :
          /citation|how-to|features/i.test(String(prompt.category || '')) ? 8 :
          0;
        const lengthPenalty = text.split(/\s+/).length > 18 ? 8 : 0;
        const score = Math.max(5, Math.min(100, Math.round(storedPriority || 35) + intentBoost + categoryBoost - lengthPenalty));
        const estimatedMonthlySearches = Math.max(10, Math.round((score * score) / 2));
        let intent = 'research';
        if (/\b(compare|vs|alternative|alternatives)\b/.test(text)) intent = 'comparison';
        else if (/\b(best|top|recommend|which)\b/.test(text)) intent = 'recommendation';
        else if (/\b(price|pricing|cost|buy)\b/.test(text)) intent = 'commercial';
        else if (/\b(review|reviews|pros|cons)\b/.test(text)) intent = 'review';
        else if (/\bhow|guide|steps|examples\b/.test(text)) intent = 'education';
        return { score, estimatedMonthlySearches, intent };
      };

      const analytics = prompts.map((prompt: any) => {
        const promptAnswers = answers.filter((a: any) => a.promptId === prompt.id);
        const answerIds = promptAnswers.map((a: any) => a.id);
        const promptMentions = mentions.filter((m: any) => answerIds.includes(m.llmAnswerId));

        const brandMentions = promptMentions.filter((m: any) => m.brandId && !m.competitorId);
        const competitorMentions = promptMentions.filter((m: any) => m.competitorId);

        const totalResponses = promptAnswers.length;
        const responsesWithBrand = new Set(brandMentions.map((m: any) => m.llmAnswerId)).size;
        const visibilityPct = totalResponses > 0 ? Math.round((responsesWithBrand / totalResponses) * 100) : 0;

        const brandPositions = brandMentions.filter((m: any) => m.position).map((m: any) => m.position);
        const avgBrandPosition = brandPositions.length > 0
          ? Math.round((brandPositions.reduce((a: number, b: number) => a + b, 0) / brandPositions.length) * 10) / 10
          : 0;

        let brandRank = 0;
        let priorityScore = 0;
        let status = "Poor";

        if (totalResponses > 0) {
          const entityCounts: Record<string, number> = {};
          promptMentions.forEach((m: any) => {
            entityCounts[m.entityName] = (entityCounts[m.entityName] || 0) + 1;
          });
          const sortedEntities = Object.entries(entityCounts).sort(([, a], [, b]) => (b as number) - (a as number));
          const foundIndex = sortedEntities.findIndex(([name]) => name === brand.name);
          brandRank = foundIndex >= 0 ? foundIndex + 1 : (sortedEntities.length + 1);

          const totalMentionCount = brandMentions.length + competitorMentions.length;
          const brandShare = totalMentionCount > 0 ? (brandMentions.length / totalMentionCount) * 100 : 0;
          priorityScore = Math.min(100, Math.round(brandShare + (visibilityPct * 0.3)));

          if (visibilityPct >= 80 && brandRank <= 2 && priorityScore >= 70) status = "Excellent";
          else if (visibilityPct >= 70 && brandRank <= 3 && priorityScore >= 60) status = "Very High";
          else if (visibilityPct >= 60 && brandRank <= 4 && priorityScore >= 50) status = "High";
          else if (visibilityPct >= 40 && brandRank <= 5 && priorityScore >= 35) status = "Medium";
          else if (visibilityPct >= 25 && brandRank <= 7) status = "Low";
          else if (visibilityPct >= 10) status = "Very Low";
        }

        const models = Array.from(new Set(promptAnswers.map((a: any) => a.llmModel)));

        const mentionShares: Record<string, number> = {};
        promptMentions.forEach((m: any) => {
          mentionShares[m.entityName] = (mentionShares[m.entityName] || 0) + 1;
        });
        const totalEntityMentions = Object.values(mentionShares).reduce((sum, count) => sum + (count as number), 0);
        const proportionalVisibility = Object.entries(mentionShares)
          .map(([name, count]) => ({
            entity: name,
            count: count as number,
            share: totalEntityMentions > 0 ? Math.round(((count as number) / totalEntityMentions) * 100) : 0,
            isBrand: !competitorNames.some((cn: string) => cn.toLowerCase() === name.toLowerCase()),
          }))
          .sort((a, b) => b.count - a.count);

        const volume = estimatePromptVolume(prompt);
        const competitorPressure = competitorMentions.length > brandMentions.length ? 12 : 0;
        const opportunityScore = Math.max(0, Math.min(100, Math.round((volume.score * (100 - visibilityPct)) / 100 + competitorPressure)));

        return {
          id: prompt.id,
          text: prompt.text || "Untitled Prompt",
          category: prompt.category || "other",
          intent: volume.intent,
          promptVolumeScore: volume.score,
          estimatedMonthlySearches: volume.estimatedMonthlySearches,
          opportunityScore,
          visibilityPct,
          avgRank: brandRank,
          avgPosition: avgBrandPosition,
          priorityScore,
          status,
          models,
          totalResponses,
          brandMentionCount: brandMentions.length,
          competitorMentionCount: competitorMentions.length,
          proportionalVisibility,
        };
      });

      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/ai-search-opportunity-brief - Board/client-ready demand, SOV, citation, and action brief
  app.get("/api/brands/:brandId/ai-search-opportunity-brief", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [prompts, answers, mentions, competitors, sources, latestScore, optimizations] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 100).catch(() => []),
      ]);

      const brandName = String(brand.name || 'this brand');
      const industry = String(brand.industry || brand.businessChannel || 'category');
      const competitorNames = (competitors as any[]).map((competitor: any) => String(competitor.name || '').trim()).filter(Boolean);
      const competitorNameSet = new Set(competitorNames.map((name) => name.toLowerCase()));
      const toTime = (value: any) => {
        const time = value ? new Date(value).getTime() : 0;
        return Number.isFinite(time) ? time : 0;
      };
      const estimatePromptVolume = (prompt: any) => {
        const text = String(prompt.text || '').toLowerCase();
        const storedPriority = Number(prompt.priorityScore || 0);
        const intentBoost =
          /\b(best|top|compare|vs|alternative|review|pricing|price|near me|buy|cost|recommend|which)\b/.test(text) ? 20 :
          /\b(how|what|why|guide|examples|ideas)\b/.test(text) ? 10 :
          0;
        const categoryBoost =
          /comparison|competitive|recommendation|pricing|reviews|product/i.test(String(prompt.category || prompt.intent || '')) ? 15 :
          /citation|how-to|features/i.test(String(prompt.category || prompt.intent || '')) ? 8 :
          0;
        const lengthPenalty = text.split(/\s+/).length > 18 ? 8 : 0;
        const score = Math.max(5, Math.min(100, Math.round(storedPriority || 35) + intentBoost + categoryBoost - lengthPenalty));
        const estimatedMonthlySearches = Math.max(10, Math.round((score * score) / 2));
        let intent = String(prompt.intent || '').toLowerCase() || 'research';
        if (!intent || intent === 'general') {
          if (/\b(compare|vs|alternative|alternatives)\b/.test(text)) intent = 'comparison';
          else if (/\b(best|top|recommend|which)\b/.test(text)) intent = 'recommendation';
          else if (/\b(price|pricing|cost|buy)\b/.test(text)) intent = 'commercial';
          else if (/\b(review|reviews|pros|cons|complaint)\b/.test(text)) intent = 'review';
          else if (/\b(product|sku|asin|amazon|marketplace|listing)\b/.test(text)) intent = 'product';
          else if (/\b(trust|safe|legit|proof|case study)\b/.test(text)) intent = 'trust';
          else if (/\bhow|guide|steps|examples\b/.test(text)) intent = 'education';
        }
        return { score, estimatedMonthlySearches, intent };
      };

      const promptRows = (prompts as any[]).map((prompt: any) => {
        const promptAnswers = (answers as any[]).filter((answer: any) => answer.promptId === prompt.id);
        const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
        const promptMentions = (mentions as any[]).filter((mention: any) => answerIds.has(mention.llmAnswerId));
        const brandMentions = promptMentions.filter((mention: any) => !mention.competitorId && !competitorNameSet.has(String(mention.entityName || '').toLowerCase()));
        const competitorMentions = promptMentions.filter((mention: any) => mention.competitorId || competitorNameSet.has(String(mention.entityName || '').toLowerCase()));
        const responsesWithBrand = new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size;
        const visibilityPct = promptAnswers.length ? Math.round((responsesWithBrand / promptAnswers.length) * 100) : 0;
        const positions = brandMentions.map((mention: any) => Number(mention.position)).filter((position: number) => Number.isFinite(position) && position > 0);
        const avgPosition = positions.length ? Math.round((positions.reduce((sum: number, position: number) => sum + position, 0) / positions.length) * 10) / 10 : null;
        const providers = Array.from(new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean)));
        const volume = estimatePromptVolume(prompt);
        const competitorPressure = competitorMentions.length > brandMentions.length;
        const opportunityScore = Math.max(0, Math.min(100, Math.round((volume.score * (100 - visibilityPct)) / 100 + (competitorPressure ? 15 : 0) + (providers.length < 3 ? 8 : 0))));
        const topCompetitors = Array.from(new Set(competitorMentions.map((mention: any) => String(mention.entityName || '').trim()).filter(Boolean))).slice(0, 4);
        return {
          id: prompt.id,
          prompt: prompt.text || 'Tracked prompt',
          intent: volume.intent || prompt.category || 'research',
          category: prompt.category || volume.intent || 'general',
          promptVolumeScore: volume.score,
          estimatedMonthlySearches: volume.estimatedMonthlySearches,
          opportunityScore,
          visibilityPct,
          avgPosition,
          providers,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          competitorPressure,
          topCompetitors,
          status: opportunityScore >= 70 ? 'high' : opportunityScore >= 40 ? 'medium' : 'low',
          recommendedAction: visibilityPct === 0
            ? 'Create or strengthen a source page that directly answers this prompt and names the brand clearly.'
            : competitorPressure
              ? 'Publish comparison proof, reviews, and third-party citations to counter the competitors winning this answer.'
              : providers.length < 3
                ? 'Re-run this prompt across more providers before making a launch claim.'
                : 'Keep monitoring and add supporting citations to protect the current visibility.',
        };
      }).sort((a: any, b: any) => b.opportunityScore - a.opportunityScore || b.estimatedMonthlySearches - a.estimatedMonthlySearches);

      const totalEstimatedDemand = promptRows.reduce((sum: number, row: any) => sum + Number(row.estimatedMonthlySearches || 0), 0);
      const opportunityDemand = promptRows.filter((row: any) => row.opportunityScore >= 40).reduce((sum: number, row: any) => sum + Number(row.estimatedMonthlySearches || 0), 0);
      const highOpportunity = promptRows.filter((row: any) => row.opportunityScore >= 70).length;
      const providerSet = new Set((answers as any[]).map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean));
      const sourceDomains = new Set((sources as any[]).map((source: any) => String(source.domain || '').trim()).filter(Boolean));
      const citedSources = (sources as any[]).filter((source: any) => Number(source.mentions || 0) > 0 || (Array.isArray(source.modelsCited) && source.modelsCited.length > 0));
      const freshAnswers = (answers as any[]).filter((answer: any) => Date.now() - toTime(answer.createdAt) <= 14 * 24 * 60 * 60 * 1000);
      const workflowActions = (optimizations as any[])
        .filter((log: any) => ['pending', 'applied', 'verified'].includes(String(log.status || '').toLowerCase()))
        .slice(0, 8)
        .map((log: any) => ({
          id: log.id,
          status: log.status || 'pending',
          impact: Number(log.actualImpact ?? log.estimatedImpact ?? 0),
          actionType: log.actionType || 'optimization',
          title: String(log.actionDescription || 'Visibility action').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || 'Visibility action',
        }));

      const score = Math.max(0, Math.min(100, Math.round(
        (promptRows.length >= 25 ? 20 : Math.min(20, promptRows.length)) +
        (providerSet.size >= 4 ? 20 : providerSet.size * 5) +
        (sourceDomains.size >= 10 ? 15 : Math.min(15, sourceDomains.size)) +
        (freshAnswers.length >= promptRows.length ? 15 : promptRows.length ? Math.round((freshAnswers.length / promptRows.length) * 15) : 0) +
        (workflowActions.length > 0 ? 15 : 0) +
        (Number((latestScore as any)?.overallScore || 0) > 0 ? 15 : 0)
      )));
      const verdict = score >= 80
        ? 'Enterprise opportunity brief ready'
        : score >= 60
          ? 'Sales-ready with evidence gaps'
          : 'Needs stronger demand and proof evidence';
      const generatedAt = new Date().toISOString();
      const summary = {
        score,
        verdict,
        promptsTracked: promptRows.length,
        answerProviders: providerSet.size,
        estimatedMonthlyDemand: totalEstimatedDemand,
        opportunityDemand,
        highOpportunity,
        sourceDomains: sourceDomains.size,
        citedSources: citedSources.length,
        freshAnswers: freshAnswers.length,
        visibilityScore: Number((latestScore as any)?.overallScore || 0),
        workflowActions: workflowActions.length,
      };
      const topRows = promptRows.slice(0, 12);
      const topSources = citedSources
        .sort((a: any, b: any) => Number(b.mentions || 0) - Number(a.mentions || 0))
        .slice(0, 10)
        .map((source: any) => ({
          domain: source.domain || source.url || 'source',
          url: source.url || null,
          mentions: Number(source.mentions || 0),
          models: Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : [],
        }));

      const markdown = [
        `# AI Search Opportunity Brief: ${brandName}`,
        '',
        `Domain: ${brand.domain || ''}`,
        `Industry: ${industry}`,
        `Generated: ${generatedAt}`,
        `Opportunity score: ${score}/100`,
        `Verdict: ${verdict}`,
        '',
        '## Executive Summary',
        `${brandName} has ${summary.promptsTracked} tracked prompts representing an estimated ${summary.estimatedMonthlyDemand} monthly AI-search demand signals. ${summary.opportunityDemand} estimated monthly searches sit in medium/high opportunity prompts, with ${summary.highOpportunity} high-priority gaps.`,
        '',
        '## Priority Prompt Opportunities',
        ...(topRows.length ? topRows.map((row: any, index: number) => `${index + 1}. ${row.prompt} - ${row.intent} - ${row.opportunityScore}/100 opportunity - ${row.visibilityPct}% visibility - ${row.estimatedMonthlySearches} est. searches. Next: ${row.recommendedAction}`) : ['No prompt opportunities available yet. Add buyer, comparison, product, trust, and support prompts before sending this brief.']),
        '',
        '## Citation And Source Signals',
        ...(topSources.length ? topSources.map((source: any, index: number) => `${index + 1}. ${source.domain} - ${source.mentions} citation signal${source.mentions === 1 ? '' : 's'}${source.models.length ? ` across ${source.models.join(', ')}` : ''}`) : ['No cited source evidence found yet. Run citation extraction after fresh prompt scans.']),
        '',
        '## Active Action Workflow',
        ...(workflowActions.length ? workflowActions.map((action: any, index: number) => `${index + 1}. ${action.title} - ${action.status} - impact ${action.impact}`) : ['No active workflow actions yet. Convert the top prompt opportunities into Action Workflow tasks.']),
      ].join('\n');

      const escapeHtml = (value: string) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brandName)} AI Search Opportunity Brief</title><style>body{font-family:Inter,Arial,sans-serif;max-width:1040px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:30px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.metric,.item{border:1px solid #e5e7eb;border-radius:8px;padding:12px}.high{border-color:#fca5a5}.medium{border-color:#fcd34d}.low{border-color:#bfdbfe}.small{color:#4b5563;font-size:14px}</style></head><body><h1>AI Search Opportunity Brief: ${escapeHtml(brandName)}</h1><p class="meta">Domain: ${escapeHtml(String(brand.domain || ''))}<br>Industry: ${escapeHtml(industry)}<br>Generated: ${escapeHtml(generatedAt)}</p><p class="score">${score}/100 - ${escapeHtml(verdict)}</p><h2>Executive Summary</h2><p>${escapeHtml(`${brandName} has ${summary.promptsTracked} tracked prompts representing an estimated ${summary.estimatedMonthlyDemand} monthly AI-search demand signals. ${summary.opportunityDemand} estimated monthly searches sit in medium/high opportunity prompts, with ${summary.highOpportunity} high-priority gaps.`)}</p><div class="grid">${Object.entries(summary).map(([key, value]) => `<div class="metric"><div class="small">${escapeHtml(key)}</div><strong>${escapeHtml(String(value))}</strong></div>`).join('')}</div><h2>Priority Prompt Opportunities</h2>${topRows.length ? topRows.map((row: any, index: number) => `<div class="item ${escapeHtml(row.status)}"><strong>${index + 1}. ${escapeHtml(row.prompt)}</strong><div class="small">${escapeHtml(row.intent)} - ${row.opportunityScore}/100 opportunity - ${row.visibilityPct}% visibility - ${row.estimatedMonthlySearches} est. searches</div><p>${escapeHtml(row.recommendedAction)}</p>${row.topCompetitors.length ? `<p class="small">Competitor pressure: ${escapeHtml(row.topCompetitors.join(', '))}</p>` : ''}</div>`).join('') : '<p>No prompt opportunities available yet. Add buyer, comparison, product, trust, and support prompts before sending this brief.</p>'}<h2>Citation And Source Signals</h2>${topSources.length ? topSources.map((source: any, index: number) => `<p>${index + 1}. <strong>${escapeHtml(source.domain)}</strong> - ${source.mentions} citation signal${source.mentions === 1 ? '' : 's'}${source.models.length ? ` across ${escapeHtml(source.models.join(', '))}` : ''}</p>`).join('') : '<p>No cited source evidence found yet. Run citation extraction after fresh prompt scans.</p>'}<h2>Active Action Workflow</h2>${workflowActions.length ? workflowActions.map((action: any, index: number) => `<p>${index + 1}. ${escapeHtml(action.title)} <span class="small">(${escapeHtml(action.status)} - impact ${escapeHtml(String(action.impact))})</span></p>`).join('') : '<p>No active workflow actions yet. Convert the top prompt opportunities into Action Workflow tasks.</p>'}</body></html>`;

      res.json({
        brandId: brand.id,
        brandName,
        score,
        verdict,
        summary,
        promptOpportunities: topRows,
        citationSignals: topSources,
        workflowActions,
        markdown,
        html,
        filenameBase: `${brandName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-ai-search-opportunity-brief`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[AISearchOpportunityBrief] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/prompt-fanouts - Query fanout intelligence for content teams
  app.get("/api/brands/:brandId/prompt-fanouts", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [prompts, answers, allMentions, competitors, sources] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
      ]);

      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      res.json({
        brandId,
        brandName: brand.name || 'this brand',
        ...fanoutIntelligence,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[PromptFanouts] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/prompt-fanouts/:promptId/task - Convert fanout opportunity into Action Workflow
  app.post("/api/brands/:brandId/prompt-fanouts/:promptId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const promptId = decodeURIComponent(req.params.promptId);
      const [prompts, answers, allMentions, competitors, sources, existingLogs] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
      ]);

      const prompt = (prompts as any[]).find((item: any) => item.id === promptId);
      if (!prompt) {
        return res.status(404).json({ message: "Prompt fanout was not found." });
      }

      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanout = (fanoutIntelligence.fanouts || []).find((item: any) => item.promptId === promptId);
      if (!fanout) {
        return res.status(404).json({ message: "Fanout evidence was not available for this prompt." });
      }

      const actionType = `query_fanout:${promptId}`;
      const duplicate = (existingLogs as any[]).find((log: any) => log.actionType === actionType);
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This query fanout is already in Action Workflow." });
      }

      const fanoutLines = (fanout.fanoutQueries || []).slice(0, 5).map((query: string, index: number) => `${index + 1}. ${query}`).join('\n');
      const actionDescription = [
        `Query Fanout: ${fanout.prompt}`,
        `Evidence: ${fanout.opportunityScore}/100 opportunity, ${fanout.mentionRate}% brand mention rate, ${(fanout.providers || []).length} provider${(fanout.providers || []).length === 1 ? '' : 's'} sampled.`,
        `Intent: ${fanout.intent || 'discovery'}`,
        fanoutLines ? `Build briefs from these fanout queries:\n${fanoutLines}` : '',
        `Plan: Create or strengthen answer-ready content that directly addresses the fanout queries, names ${brand.name}, adds comparison/proof blocks, and includes FAQ/schema where relevant.`,
        'Verification: mark applied after publishing, then run generic proof check after fresh sampling/citation extraction confirms new AI answers, brand mentions, source citations, or visibility movement.',
      ].filter(Boolean).join('\n');
      const estimatedImpact = Math.max(25, Math.min(95, Number(fanout.opportunityScore || 0)));

      const task = await storage.createOptimizationLog({
        brandId,
        topicId: null,
        actionType,
        actionDescription,
        estimatedImpact,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: "Query fanout added to Action Workflow.",
        fanout: {
          promptId: fanout.promptId,
          prompt: fanout.prompt,
          opportunityScore: fanout.opportunityScore,
          mentionRate: fanout.mentionRate,
          fanoutQueries: fanout.fanoutQueries,
          status: fanout.status,
        },
      });
    } catch (error: any) {
      console.error('[PromptFanouts] Task create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/optimizations/:logId/query-fanout-draft - Convert a fanout task into an AXP draft
  app.post("/api/brands/:brandId/optimizations/:logId/query-fanout-draft", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const logs = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const optimization = (logs as any[]).find((log: any) => log.id === req.params.logId);
      if (!optimization) {
        return res.status(404).json({ message: "Action Workflow task not found." });
      }
      if (!String(optimization.actionType || '').startsWith('query_fanout:')) {
        return res.status(400).json({ message: "Only Query Fanout tasks can create fanout content drafts." });
      }

      const parsed = parseQueryFanoutAction(optimization.actionDescription);
      const slug = slugId(`${brand.name}-${parsed.prompt}-ai-search-brief`);
      const markdown = buildQueryFanoutDraftMarkdown(brand, optimization);
      const html = markdownToSimpleHtml(markdown);
      const questions = parsed.fanoutQueries.length ? parsed.fanoutQueries : [parsed.prompt];
      const schemaJson = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: `${brand.name} AI Search Brief: ${parsed.prompt}`,
            description: `Answer-ready AI search page for ${brand.name} covering ${parsed.intent} intent and query fanouts.`,
          },
          {
            '@type': 'FAQPage',
            mainEntity: questions.slice(0, 6).map((question) => ({
              '@type': 'Question',
              name: question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `${brand.name} should answer this query with direct proof, comparison context, and source-worthy details before publishing.`,
              },
            })),
          },
        ],
      };

      const existingPage = await storage.getAxpPageBySlug(brand.id, slug).catch(() => undefined);
      const page = existingPage || await storage.createAxpPage({
        brandId: brand.id,
        title: `${brand.name} AI Search Brief: ${parsed.prompt}`.slice(0, 220),
        slug,
        description: `Draft created from Query Fanout evidence: ${parsed.evidence}`.slice(0, 500),
        status: 'draft',
        targetPrompts: questions,
        targetKeywords: [brand.name, parsed.intent, 'AI search', 'query fanout', 'answer engine optimization'],
        createdBy: userId,
      } as any);

      const versions = await storage.getAxpVersionsByPage(page.id).catch(() => []);
      const nextVersionNumber = Math.max(0, ...versions.map((version: any) => Number(version.versionNumber) || 0)) + 1;
      const version = await storage.createAxpVersion({
        pageId: page.id,
        versionNumber: nextVersionNumber,
        content: markdown,
        contentHtml: html,
        schemaJson,
        changeDescription: 'Generated answer-ready AXP draft from Query Fanout task.',
        createdBy: userId,
      } as any);

      const updatedPage = await storage.updateAxpPage(page.id, {
        currentVersionId: version.id,
        status: 'draft',
      } as any);

      const existingFaqs = await storage.getFaqEntriesByPage(page.id).catch(() => []);
      const existingQuestions = new Set((existingFaqs as any[]).map((faq: any) => String(faq.question || '').toLowerCase()));
      const createdFaqs = [];
      for (const [index, question] of questions.slice(0, 5).entries()) {
        if (existingQuestions.has(String(question).toLowerCase())) continue;
        const faq = await storage.createFaqEntry({
          brandId: brand.id,
          axpPageId: page.id,
          question,
          answer: `${brand.name} should answer this with specific proof, comparison context, and source-worthy details before the page is published.`,
          category: 'query_fanout',
          evidenceUrls: [],
          publishMode: 'hidden',
          displayOrder: index,
          createdBy: userId,
        } as any);
        createdFaqs.push(faq);
      }

      const updatedOptimization = await storage.updateOptimizationLog(optimization.id, {
        status: 'draft',
      } as any);

      await createAuditLog(req, "create", "query_fanout_axp_draft", updatedPage.id, optimization, {
        page: updatedPage,
        version,
        faqCount: createdFaqs.length,
      });

      res.json({
        page: updatedPage,
        version,
        createdFaqs,
        optimization: updatedOptimization,
        artifactUrl: `/app/content-axp?tab=axp&artifact=${updatedPage.id}`,
        message: createdFaqs.length
          ? `AXP draft created with ${createdFaqs.length} FAQ seed${createdFaqs.length === 1 ? '' : 's'}.`
          : 'AXP draft updated with a new version.',
      });
    } catch (error: any) {
      console.error('[PromptFanouts] Draft creation failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/market-opportunities - Unified opportunity queue across prompts, answers, sources, product, and launch gates
  app.get("/api/brands/:brandId/market-opportunities", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        prompts,
        answers,
        allMentions,
        sources,
        competitors,
        optimizations,
      ] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
      ]);

      const inWorkflow = new Set((optimizations as any[]).map((log: any) => String(log.actionType || '')));
      const opportunities: any[] = [];
      const brandName = brand.name || 'this brand';
      const competitorNames = new Set((competitors as any[]).map((competitor: any) => String(competitor.name || '').toLowerCase()).filter(Boolean));
      const cleanDomain = (value: string) => String(value || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#\s]/)[0]
        .toLowerCase();

      for (const prompt of prompts as any[]) {
        const promptAnswers = (answers as any[]).filter((answer: any) => answer.promptId === prompt.id);
        const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
        const mentions = (allMentions as any[]).filter((mention: any) => answerIds.has(mention.llmAnswerId));
        const brandMentions = mentions.filter((mention: any) => !mention.competitorId && !competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const competitorMentions = mentions.filter((mention: any) => mention.competitorId || competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const providers = new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean));
        const mentionRate = promptAnswers.length ? Math.round((new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size / promptAnswers.length) * 100) : 0;
        const competitorPressure = competitorMentions.length > brandMentions.length;
        const isUnsampled = promptAnswers.length === 0;
        const score = Math.max(0, Math.min(100, Math.round(
          (isUnsampled ? 35 : (100 - mentionRate) * 0.5)
          + (competitorPressure ? 25 : 0)
          + (providers.size < 3 ? 15 : 0)
          + (String(prompt.category || '').match(/comparison|product|pricing|review/i) ? 10 : 0)
        )));
        if (score >= 35) {
          const actionType = `market_opportunity:prompt:${prompt.id}`;
          opportunities.push({
            id: `prompt:${prompt.id}`,
            type: isUnsampled ? 'sampling_gap' : competitorPressure ? 'competitive_prompt' : 'visibility_prompt',
            title: isUnsampled ? 'Sample an untested high-intent prompt' : competitorPressure ? 'Recover competitor-led prompt' : 'Improve low-visibility prompt',
            target: prompt.text || 'Tracked prompt',
            score,
            priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
            evidence: `${mentionRate}% mention rate, ${brandMentions.length} brand mentions, ${competitorMentions.length} competitor mentions, ${providers.size} providers.`,
            recommendedAction: isUnsampled
              ? 'Run this prompt across core answer engines, then create content from the first answer gaps.'
              : competitorPressure
                ? 'Create comparison and proof content that directly counters the competitor currently winning the answer.'
                : `Strengthen answer-ready content so ${brandName} is named earlier and cited more often.`,
            href: '/app/prompts',
            status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
          });
        }
      }

      for (const source of sources as any[]) {
        const citations = Number(source.mentions || source.citationCount || 0);
        const models = Array.isArray(source.modelsCited) ? source.modelsCited : (source.llmProvider ? [source.llmProvider] : []);
        const authority = Number(source.authority || source.domainAuthority || 0);
        const domain = source.domain || cleanDomain(source.url || '');
        const sourceGap = Boolean(source.isBrandAbsent || source.citationType === 'competitor');
        const score = Math.max(0, Math.min(100, Math.round((authority * 0.35) + (citations * 8) + (models.length * 9) + (sourceGap ? 25 : 0))));
        if (score >= 35) {
          const actionType = `citation_opportunity:${source.id}`;
          opportunities.push({
            id: `source:${source.id}`,
            type: sourceGap ? 'citation_gap' : 'source_depth',
            title: sourceGap ? 'Win a competitor-cited source' : 'Expand citation depth',
            target: source.title || source.url || domain || 'Cited source',
            score,
            priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
            evidence: `${citations} citations across ${models.length || 1} model surface${models.length === 1 ? '' : 's'}${domain ? ` from ${domain}` : ''}.`,
            recommendedAction: sourceGap
              ? 'Pitch inclusion, update the cited marketplace/profile/review page, or publish supporting proof that makes the brand citable.'
              : 'Replicate the cited proof pattern across owned pages, FAQs, schema, reviews, and third-party profiles.',
            href: '/app/sources',
            status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
          });
        }
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const pendingVerification = verificationTasks.filter((task: any) => task.status !== 'verified').length;
      if ((prompts as any[]).length < 25) {
        opportunities.push({
          id: 'launch:prompt_coverage',
          type: 'launch_gate',
          title: 'Reach enterprise prompt coverage floor',
          target: 'Prompt portfolio',
          score: Math.min(100, 90 - (prompts as any[]).length),
          priority: (prompts as any[]).length < 10 ? 'high' : 'medium',
          evidence: `${(prompts as any[]).length}/25 tracked prompts.`,
          recommendedAction: 'Add buyer, competitor, product, trust, support, and review prompts before using launch-ready language.',
          href: '/app/prompts',
          status: 'open',
        });
      }
      if (pendingVerification > 0) {
        opportunities.push({
          id: 'launch:verification_debt',
          type: 'launch_gate',
          title: 'Clear verification debt',
          target: 'Action Workflow proof',
          score: Math.min(100, 50 + pendingVerification * 10),
          priority: pendingVerification >= 3 ? 'high' : 'medium',
          evidence: `${pendingVerification} pending verification task${pendingVerification === 1 ? '' : 's'}.`,
          recommendedAction: 'Apply the fixes, run verification checks, and only report impact after fresh evidence exists.',
          href: '/app/action-plan',
          status: 'open',
        });
      }

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }
      if (productReadiness?.relevant && Number(productReadiness.score || 0) < 70) {
        opportunities.push({
          id: 'product:readiness',
          type: 'product_launch',
          title: 'Harden product and seller readiness',
          target: 'Product Readiness',
          score: Math.max(40, 100 - Number(productReadiness.score || 0)),
          priority: Number(productReadiness.score || 0) < 35 ? 'high' : 'medium',
          evidence: `${Number(productReadiness.score || 0)}/100 product readiness with ${productReadiness.metrics?.catalogProducts || 0} catalog SKUs.`,
          recommendedAction: 'Import priority SKUs, map competitor products, create product prompts, and prepare seller pilot kit.',
          href: '/app/product-readiness',
          status: 'open',
        });
      }

      const sourceHeavyTypes = new Set(['citation_gap', 'source_depth']);
      const sortedRaw = opportunities.sort((a, b) => b.score - a.score);
      const sourceItems = sortedRaw.filter((item) => sourceHeavyTypes.has(item.type)).slice(0, 18);
      const nonSourceItems = sortedRaw.filter((item) => !sourceHeavyTypes.has(item.type)).slice(0, 32);
      const sorted = [...nonSourceItems, ...sourceItems]
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
      res.json({
        brandId,
        brandName,
        score: sorted.length ? Math.round(sorted.reduce((sum, item) => sum + item.score, 0) / sorted.length) : 0,
        summary: {
          total: sorted.length,
          high: sorted.filter((item) => item.priority === 'high').length,
          inWorkflow: sorted.filter((item) => item.status === 'in_workflow').length,
          prompt: sorted.filter((item) => String(item.type).includes('prompt') || item.type === 'sampling_gap').length,
          source: sorted.filter((item) => String(item.type).includes('source') || String(item.type).includes('citation')).length,
          launch: sorted.filter((item) => item.type === 'launch_gate').length,
          product: sorted.filter((item) => item.type === 'product_launch').length,
        },
        opportunities: sorted,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[MarketOpportunities] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/market-opportunities/report - Shareable operating report for launch and growth opportunities
  app.get("/api/brands/:brandId/market-opportunities/report", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        prompts,
        answers,
        allMentions,
        sources,
        competitors,
        optimizations,
      ] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
      ]);

      const inWorkflow = new Set((optimizations as any[]).map((log: any) => String(log.actionType || '')));
      const competitorNames = new Set((competitors as any[]).map((competitor: any) => String(competitor.name || '').toLowerCase()).filter(Boolean));
      const cleanDomain = (value: string) => String(value || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#\s]/)[0]
        .toLowerCase();
      const opportunities: any[] = [];
      const brandName = brand.name || 'this brand';

      for (const prompt of prompts as any[]) {
        const promptAnswers = (answers as any[]).filter((answer: any) => answer.promptId === prompt.id);
        const answerIds = new Set(promptAnswers.map((answer: any) => answer.id));
        const mentions = (allMentions as any[]).filter((mention: any) => answerIds.has(mention.llmAnswerId));
        const brandMentions = mentions.filter((mention: any) => !mention.competitorId && !competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const competitorMentions = mentions.filter((mention: any) => mention.competitorId || competitorNames.has(String(mention.entityName || '').toLowerCase()));
        const providers = new Set(promptAnswers.map((answer: any) => String(answer.llmProvider || answer.provider || answer.llmModel || '').trim()).filter(Boolean));
        const mentionRate = promptAnswers.length ? Math.round((new Set(brandMentions.map((mention: any) => mention.llmAnswerId)).size / promptAnswers.length) * 100) : 0;
        const competitorPressure = competitorMentions.length > brandMentions.length;
        const isUnsampled = promptAnswers.length === 0;
        const score = Math.max(0, Math.min(100, Math.round(
          (isUnsampled ? 35 : (100 - mentionRate) * 0.5)
          + (competitorPressure ? 25 : 0)
          + (providers.size < 3 ? 15 : 0)
          + (String(prompt.category || '').match(/comparison|product|pricing|review/i) ? 10 : 0)
        )));
        if (score >= 35) {
          const actionType = `market_opportunity:prompt:${prompt.id}`;
          opportunities.push({
            id: `prompt:${prompt.id}`,
            type: isUnsampled ? 'sampling_gap' : competitorPressure ? 'competitive_prompt' : 'visibility_prompt',
            title: isUnsampled ? 'Sample an untested high-intent prompt' : competitorPressure ? 'Recover competitor-led prompt' : 'Improve low-visibility prompt',
            target: prompt.text || 'Tracked prompt',
            score,
            priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
            evidence: `${mentionRate}% mention rate, ${brandMentions.length} brand mentions, ${competitorMentions.length} competitor mentions, ${providers.size} providers.`,
            recommendedAction: isUnsampled
              ? 'Run this prompt across core answer engines, then create content from the first answer gaps.'
              : competitorPressure
                ? 'Create comparison and proof content that directly counters the competitor currently winning the answer.'
                : `Strengthen answer-ready content so ${brandName} is named earlier and cited more often.`,
            status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
          });
        }
      }

      for (const source of sources as any[]) {
        const citations = Number(source.mentions || source.citationCount || 0);
        const models = Array.isArray(source.modelsCited) ? source.modelsCited : (source.llmProvider ? [source.llmProvider] : []);
        const authority = Number(source.authority || source.domainAuthority || 0);
        const domain = source.domain || cleanDomain(source.url || '');
        const sourceGap = Boolean(source.isBrandAbsent || source.citationType === 'competitor');
        const score = Math.max(0, Math.min(100, Math.round((authority * 0.35) + (citations * 8) + (models.length * 9) + (sourceGap ? 25 : 0))));
        if (score >= 35) {
          const actionType = `citation_opportunity:${source.id}`;
          opportunities.push({
            id: `source:${source.id}`,
            type: sourceGap ? 'citation_gap' : 'source_depth',
            title: sourceGap ? 'Win a competitor-cited source' : 'Expand citation depth',
            target: source.title || source.url || domain || 'Cited source',
            score,
            priority: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low',
            evidence: `${citations} citations across ${models.length || 1} model surface${models.length === 1 ? '' : 's'}${domain ? ` from ${domain}` : ''}.`,
            recommendedAction: sourceGap
              ? 'Pitch inclusion, update the cited marketplace/profile/review page, or publish supporting proof that makes the brand citable.'
              : 'Replicate the cited proof pattern across owned pages, FAQs, schema, reviews, and third-party profiles.',
            status: inWorkflow.has(actionType) ? 'in_workflow' : 'open',
          });
        }
      }

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const pendingVerification = verificationTasks.filter((task: any) => task.status !== 'verified').length;
      if ((prompts as any[]).length < 25) {
        opportunities.push({
          id: 'launch:prompt_coverage',
          type: 'launch_gate',
          title: 'Reach enterprise prompt coverage floor',
          target: 'Prompt portfolio',
          score: Math.min(100, 90 - (prompts as any[]).length),
          priority: (prompts as any[]).length < 10 ? 'high' : 'medium',
          evidence: `${(prompts as any[]).length}/25 tracked prompts.`,
          recommendedAction: 'Add buyer, competitor, product, trust, support, and review prompts before using launch-ready language.',
          status: 'open',
        });
      }
      if (pendingVerification > 0) {
        opportunities.push({
          id: 'launch:verification_debt',
          type: 'launch_gate',
          title: 'Clear verification debt',
          target: 'Action Workflow proof',
          score: Math.min(100, 50 + pendingVerification * 10),
          priority: pendingVerification >= 3 ? 'high' : 'medium',
          evidence: `${pendingVerification} pending verification task${pendingVerification === 1 ? '' : 's'}.`,
          recommendedAction: 'Apply fixes, run verification checks, and only report impact after fresh evidence exists.',
          status: 'open',
        });
      }

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }
      if (productReadiness?.relevant && Number(productReadiness.score || 0) < 70) {
        opportunities.push({
          id: 'product:readiness',
          type: 'product_launch',
          title: 'Harden product and seller readiness',
          target: 'Product Readiness',
          score: Math.max(40, 100 - Number(productReadiness.score || 0)),
          priority: Number(productReadiness.score || 0) < 35 ? 'high' : 'medium',
          evidence: `${Number(productReadiness.score || 0)}/100 product readiness with ${productReadiness.metrics?.catalogProducts || 0} catalog SKUs.`,
          recommendedAction: 'Import priority SKUs, map competitor products, create product prompts, and prepare seller pilot kit.',
          status: 'open',
        });
      }

      const sourceHeavyTypes = new Set(['citation_gap', 'source_depth']);
      const sortedRaw = opportunities.sort((a, b) => b.score - a.score);
      const sourceItems = sortedRaw.filter((item) => sourceHeavyTypes.has(item.type)).slice(0, 18);
      const nonSourceItems = sortedRaw.filter((item) => !sourceHeavyTypes.has(item.type)).slice(0, 32);
      const sorted = [...nonSourceItems, ...sourceItems].sort((a, b) => b.score - a.score).slice(0, 50);
      const summary = {
        total: sorted.length,
        high: sorted.filter((item) => item.priority === 'high').length,
        inWorkflow: sorted.filter((item) => item.status === 'in_workflow').length,
        prompt: sorted.filter((item) => String(item.type).includes('prompt') || item.type === 'sampling_gap').length,
        source: sorted.filter((item) => String(item.type).includes('source') || String(item.type).includes('citation')).length,
        launch: sorted.filter((item) => item.type === 'launch_gate').length,
        product: sorted.filter((item) => item.type === 'product_launch').length,
      };
      const score = sorted.length ? Math.round(sorted.reduce((sum, item) => sum + item.score, 0) / sorted.length) : 0;
      const verdict = summary.high >= 10 ? 'High-opportunity queue needs execution' : summary.total > 0 ? 'Opportunity queue ready for weekly execution' : 'No major market opportunities detected';
      const generatedAt = new Date().toISOString();
      const topActions = sorted.slice(0, 12);
      const markdown = [
        `# Market Opportunity Report: ${brand.name}`,
        '',
        `Domain: ${brand.domain || ''}`,
        `Generated: ${generatedAt}`,
        `Opportunity pressure score: ${score}/100`,
        `Verdict: ${verdict}`,
        '',
        '## Executive Summary',
        `${brand.name} has ${summary.total} prioritized AI-search opportunities: ${summary.prompt} prompt/answer gaps, ${summary.source} citation/source opportunities, ${summary.launch} launch gates, and ${summary.product} product readiness items. ${summary.inWorkflow} are already in Action Workflow.`,
        '',
        '## Priority Actions',
        ...(topActions.length ? topActions.map((item: any, index: number) => `${index + 1}. ${item.title} - ${item.target} (${item.priority}, ${item.score}/100). ${item.recommendedAction}`) : ['No open market opportunities need action right now.']),
        '',
        '## Evidence',
        ...(topActions.length ? topActions.map((item: any) => `- ${item.title}: ${item.evidence}`) : ['- No evidence rows available.']),
        '',
        '## Operating Metrics',
        `- Total opportunities: ${summary.total}`,
        `- High-priority opportunities: ${summary.high}`,
        `- Already in workflow: ${summary.inWorkflow}`,
        `- Prompt opportunities: ${summary.prompt}`,
        `- Source opportunities: ${summary.source}`,
        `- Launch gates: ${summary.launch}`,
        `- Product readiness items: ${summary.product}`,
      ].join('\n');

      const escapeHtml = (value: string) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brand.name)} Market Opportunity Report</title><style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.item{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.high{border-color:#fca5a5}.medium{border-color:#fcd34d}.low{border-color:#bfdbfe}.small{color:#4b5563;font-size:14px}</style></head><body><h1>Market Opportunity Report: ${escapeHtml(brand.name)}</h1><p class="meta">Domain: ${escapeHtml(String(brand.domain || ''))}<br>Generated: ${escapeHtml(generatedAt)}</p><p class="score">${score}/100 - ${escapeHtml(verdict)}</p><h2>Executive Summary</h2><p>${escapeHtml(`${brand.name} has ${summary.total} prioritized AI-search opportunities: ${summary.prompt} prompt/answer gaps, ${summary.source} citation/source opportunities, ${summary.launch} launch gates, and ${summary.product} product readiness items. ${summary.inWorkflow} are already in Action Workflow.`)}</p><h2>Priority Actions</h2>${topActions.length ? topActions.map((item: any, index: number) => `<div class="item ${escapeHtml(item.priority)}"><strong>${index + 1}. ${escapeHtml(item.title)}</strong><div class="small">${escapeHtml(item.type)} - ${escapeHtml(item.priority)} - ${item.score}/100</div><p>${escapeHtml(item.target)}</p><p>${escapeHtml(item.evidence)}</p><p><strong>Next:</strong> ${escapeHtml(item.recommendedAction)}</p></div>`).join('') : '<p>No open market opportunities need action right now.</p>'}<h2>Operating Metrics</h2>${Object.entries(summary).map(([key, value]) => `<p>${escapeHtml(key)}: ${escapeHtml(String(value))}</p>`).join('')}</body></html>`;

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict,
        summary,
        opportunities: sorted,
        topActions,
        markdown,
        html,
        filenameBase: `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-market-opportunities`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[MarketOpportunityReport] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/market-opportunities/:opportunityId/task - Convert a ranked market opportunity into Action Workflow
  app.post("/api/brands/:brandId/market-opportunities/:opportunityId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const opportunityId = decodeURIComponent(req.params.opportunityId || '');
      const payload = req.body || {};
      const type = String(payload.type || 'market_opportunity').slice(0, 80);
      const title = String(payload.title || 'Market opportunity').slice(0, 180);
      const target = String(payload.target || 'Target').slice(0, 500);
      const evidence = String(payload.evidence || '').slice(0, 1000);
      const recommendedAction = String(payload.recommendedAction || 'Prioritize this opportunity in the launch workflow.').slice(0, 1200);
      const score = Math.max(1, Math.min(100, Math.round(Number(payload.score || 50))));
      const href = String(payload.href || '/app/ai-command-center').slice(0, 200);

      const sourceMatch = opportunityId.match(/^source:(.+)$/);
      const actionType = sourceMatch
        ? `citation_opportunity:${sourceMatch[1]}`
        : `market_opportunity:${opportunityId.replace(/[^a-zA-Z0-9:_-]/g, '-')}`;

      const existing = await storage.getOptimizationLogsByBrand(brand.id, 500);
      const duplicate = (existing as any[]).find((log: any) => String(log.actionType || '') === actionType && String(log.status || '').toLowerCase() !== 'verified');
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This market opportunity is already in Action Workflow." });
      }

      const actionDescription = [
        `Market Opportunity: ${title}`,
        `Target: ${target}`,
        `Type: ${type}`,
        evidence ? `Evidence: ${evidence}` : '',
        `Recommended action: ${recommendedAction}`,
        `Source page: ${href}`,
      ].filter(Boolean).join('\n');

      const task = await storage.createOptimizationLog({
        brandId: brand.id,
        topicId: null,
        actionType,
        actionDescription,
        estimatedImpact: score,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: "Market opportunity added to Action Workflow.",
        opportunity: {
          id: opportunityId,
          type,
          title,
          target,
          score,
          href,
        },
      });
    } catch (error: any) {
      console.error('[MarketOpportunities] Task create failed:', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/prompts/:promptId", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updatePrompt(qstr(req.params.promptId), req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/prompts/:promptId", requireAuth, async (req, res) => {
    try {
      await storage.deletePrompt(qstr(req.params.promptId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Prompt Results
  app.get("/api/brands/:brandId/prompts/:promptId/results", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const answers = await storage.getLlmAnswersByPrompt(req.params.promptId, 100);
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 1000);

      const results = answers.map(answer => {
        const mention = mentions.find(m => m.llmAnswerId === answer.id);
        return {
          ...answer,
          mention: mention || null,
        };
      });

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Run Prompt
  app.post("/api/brands/:brandId/prompts/:promptId/run", requireAuth, enforcePlanLimit('promptsPerMonth'), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerLLMSampling } = await import('./jobs');
      const jobId = await triggerLLMSampling(req.params.brandId, req.params.promptId);

      await createAuditLog(req, "run_prompt", "prompt", req.params.promptId);

      res.json({
        jobId,
        message: "Prompt execution job queued",
        status: "pending"
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Prompts Performance
  app.get("/api/brands/:brandId/prompts/performance", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const prompts = await storage.getPromptsByBrand(req.params.brandId);
      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, 1000);
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 1000);

      const performance = prompts.map(prompt => {
        const promptAnswers = answers.filter(a => a.promptId === prompt.id);
        const promptMentions = mentions.filter(m =>
          promptAnswers.some(a => a.id === m.llmAnswerId)
        );

        const mentionRate = promptAnswers.length > 0
          ? (promptMentions.length / promptAnswers.length) * 100
          : 0;

        const avgPosition = promptMentions.length > 0
          ? promptMentions.reduce((sum, m) => sum + (m.position || 0), 0) / promptMentions.length
          : 0;

        const sentimentScore = promptMentions.length > 0
          ? (promptMentions.filter(m => m.sentiment === 'positive').length -
             promptMentions.filter(m => m.sentiment === 'negative').length) / promptMentions.length
          : 0;

        return {
          promptId: prompt.id,
          promptText: prompt.text,
          category: prompt.category,
          totalResponses: promptAnswers.length,
          mentions: promptMentions.length,
          mentionRate: Math.round(mentionRate * 10) / 10,
          avgPosition: Math.round(avgPosition * 10) / 10,
          sentimentScore: Math.round(sentimentScore * 100) / 100,
        };
      });

      res.json(performance);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= SOURCE ROUTES =============
  
  app.get("/api/brands/:brandId/sources", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const sources = await storage.getSourcesByBrand(req.params.brandId);
      const brandDomain = brand?.domain?.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '') || '';
      
      const enrichedSources = sources.map(s => ({
        ...s,
        authority: s.domainAuthority ?? null,
        isBrandAbsent: !s.domain?.includes(brandDomain) && (s.mentions || 0) < 2,
        citationCount: s.mentions || 0,
      }));
      
      enrichedSources.sort((a, b) => (b.mentions || 0) - (a.mentions || 0));
      res.json(enrichedSources);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/citation-opportunities - Prioritized source acquisition moves
  app.get("/api/brands/:brandId/citation-opportunities", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandDomain = String(brand.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      const [sources, allMentions, optimizations] = await Promise.all([
        storage.getSourcesByBrand(req.params.brandId).catch(() => []),
        storage.getAllMentionsForBrand(req.params.brandId, 5000).catch(() => []),
        storage.getOptimizationLogsByBrand(req.params.brandId, 200).catch(() => []),
      ]);
      const brandMentionAnswerIds = new Set((allMentions as any[]).filter((mention: any) => !mention.competitorId).map((mention: any) => mention.llmAnswerId));

      const opportunities = (sources as any[]).map((source: any) => {
        const domain = String(source.domain || '').toLowerCase();
        const citations = Number(source.mentions || 0);
        const authority = Number(source.domainAuthority || 0);
        const models = Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : [];
        const owned = Boolean(brandDomain && domain.includes(brandDomain));
        const competitorSource = String(source.citationType || '').toLowerCase() === 'competitor';
        const weakOwned = owned && citations < 3;
        const missingBrand = !owned && (competitorSource || citations >= 2);
        const actionType = weakOwned
          ? 'strengthen_owned_source'
          : missingBrand
          ? 'earn_third_party_inclusion'
          : citations <= 1
          ? 'build_citation_depth'
          : 'monitor_source';
        const score = Math.min(100, Math.round(
          (citations * 9) +
          (authority * 0.45) +
          (models.length * 8) +
          (competitorSource ? 18 : 0) +
          (owned ? 8 : 16)
        ));
        const status = (optimizations as any[]).some((log: any) => String(log.actionType || '') === `citation_opportunity:${source.id}`)
          ? 'in_workflow'
          : 'open';
        return {
          id: source.id,
          domain: source.domain,
          url: source.url,
          title: source.title,
          citations,
          authority,
          models,
          citationType: source.citationType || (owned ? 'owned' : competitorSource ? 'competitor' : 'earned'),
          sourceType: source.sourceType || 'unknown',
          opportunityScore: score,
          priority: score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low',
          actionType,
          status,
          reason: weakOwned
            ? 'Owned source is cited, but citation depth is thin. Improve this page so AI systems keep using it as proof.'
            : missingBrand
            ? 'AI systems already cite this third-party source for the category. Pursue inclusion, profile updates, PR, reviews, or comparison coverage.'
            : citations <= 1
            ? 'This source has early citation evidence. Build related proof and internal references to deepen citation coverage.'
            : 'Source is already useful. Monitor for citation drift and competitor displacement.',
          recommendedAction: weakOwned
            ? 'Refresh the page with stronger claims, schema, FAQs, proof points, and links from relevant content.'
            : missingBrand
            ? 'Create an outreach or listing update task for this source, then verify after new AI answers cite the page with brand context.'
            : citations <= 1
            ? 'Create supporting content that makes this source easier for AI answers to cite.'
            : 'Keep monitoring this source for model coverage and citation changes.',
          hasBrandAnswerEvidence: brandMentionAnswerIds.size > 0,
        };
      })
      .filter((item: any) => item.actionType !== 'monitor_source')
      .sort((a: any, b: any) => b.opportunityScore - a.opportunityScore)
      .slice(0, 30);

      const summary = {
        total: opportunities.length,
        high: opportunities.filter((item: any) => item.priority === 'high').length,
        inWorkflow: opportunities.filter((item: any) => item.status === 'in_workflow').length,
        domains: new Set(opportunities.map((item: any) => item.domain).filter(Boolean)).size,
        citedUrls: opportunities.filter((item: any) => item.url).length,
      };

      res.json({
        brandId: req.params.brandId,
        brandName: brand.name,
        summary,
        opportunities,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[CitationOpportunities] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/citation-opportunities/:sourceId/task - Convert citation opportunity into Action Workflow
  app.post("/api/brands/:brandId/citation-opportunities/:sourceId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const sourceId = req.params.sourceId;
      const [sources, existingLogs] = await Promise.all([
        storage.getSourcesByBrand(req.params.brandId).catch(() => []),
        storage.getOptimizationLogsByBrand(req.params.brandId, 200).catch(() => []),
      ]);
      const source = (sources as any[]).find((item: any) => item.id === sourceId);
      if (!source) {
        return res.status(404).json({ message: "Citation opportunity not found for this brand." });
      }

      const actionType = `citation_opportunity:${sourceId}`;
      const duplicate = (existingLogs as any[]).find((log: any) => log.actionType === actionType);
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This citation opportunity is already in Action Workflow." });
      }

      const citations = Number(source.mentions || 0);
      const models = Array.isArray(source.modelsCited) ? source.modelsCited.filter(Boolean) : [];
      const description = `Citation opportunity: ${source.title || source.url || source.domain}. ${citations} citation${citations === 1 ? '' : 's'} across ${models.length || 1} model surface${models.length === 1 ? '' : 's'}. Action: pursue inclusion, update the cited source, or create supporting proof content so AI answers cite the brand with stronger context.`;
      const estimatedImpact = Math.min(100, Math.round((citations * 9) + (Number(source.domainAuthority || 0) * 0.45) + (models.length * 8) + 20));
      const task = await storage.createOptimizationLog({
        brandId: req.params.brandId,
        topicId: null,
        actionType,
        actionDescription: description,
        estimatedImpact,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: "Citation opportunity added to Action Workflow.",
        source: {
          id: source.id,
          domain: source.domain,
          url: source.url,
          title: source.title,
          citations,
          models,
        },
      });
    } catch (error: any) {
      console.error('[CitationOpportunities] Task create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get aggregated domain statistics
  app.get("/api/brands/:brandId/sources/domains", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const sources = await storage.getSourcesByBrand(req.params.brandId);
      
      // Aggregate sources by domain
      const domainMap = new Map<string, {
        domain: string;
        totalCitations: number;
        uniquePages: Set<string>;
        models: Set<string>;
        lastSeen: Date;
      }>();
      
      sources.forEach((source) => {
        const domain = source.domain || '';
        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain,
            totalCitations: 0,
            uniquePages: new Set(),
            models: new Set(),
            lastSeen: new Date(0),
          });
        }
        const entry = domainMap.get(domain)!;
        entry.totalCitations += source.mentions || 1;
        if (source.url) entry.uniquePages.add(source.url);
        if (source.modelsCited) (source.modelsCited as string[]).forEach(m => entry.models.add(m));
        if (source.lastSeen && new Date(source.lastSeen) > entry.lastSeen) {
          entry.lastSeen = new Date(source.lastSeen);
        }
      });
      
      const domains = Array.from(domainMap.values()).map(d => ({
        domain: d.domain,
        totalCitations: d.totalCitations,
        uniquePages: d.uniquePages.size,
        models: Array.from(d.models),
        lastSeen: d.lastSeen,
      })).sort((a, b) => b.totalCitations - a.totalCitations);
      
      res.json(domains);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get source recommendations
  app.get("/api/brands/:brandId/sources/recommendations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const sources = await storage.getSourcesByBrand(req.params.brandId);
      const brandMentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 500);
      
      // Analyze sources to generate recommendations
      const recommendations: {
        domain: string;
        actionability: string;
        reason: string;
        priority: 'high' | 'medium' | 'low';
        impactScore: number;
      }[] = [];
      
      // Group by domain and analyze
      const domainStats = new Map<string, { citations: number; hasBrandMention: boolean }>();
      
      sources.forEach((source) => {
        const domain = source.domain || '';
        if (!domainStats.has(domain)) {
          domainStats.set(domain, { citations: 0, hasBrandMention: false });
        }
        const stat = domainStats.get(domain)!;
        stat.citations += source.mentions || 1;
      });
      
      // Check brand mentions in sources
      brandMentions.forEach((mention) => {
        const domain = (mention as any).sourceUrl ? new URL((mention as any).sourceUrl).hostname : '';
        if (domainStats.has(domain)) {
          domainStats.get(domain)!.hasBrandMention = true;
        }
      });
      
      // Generate recommendations
      domainStats.forEach((stat, domain) => {
        if (stat.citations >= 5 && !stat.hasBrandMention) {
          recommendations.push({
            domain,
            actionability: 'acquire_backlink',
            reason: `High citation source (${stat.citations} citations) where your brand is not mentioned`,
            priority: stat.citations >= 20 ? 'high' : stat.citations >= 10 ? 'medium' : 'low',
            impactScore: Math.min(100, stat.citations * 5),
          });
        }
      });
      
      res.json(recommendations.sort((a, b) => b.impactScore - a.impactScore).slice(0, 20));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get source mentions for a specific source/domain
  app.get("/api/brands/:brandId/sources/:sourceId/mentions", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 100);
      const filteredMentions = mentions.filter(m => 
        (m as any).sourceUrl?.includes(req.params.sourceId)
      );
      
      res.json(filteredMentions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= INTEGRATION ROUTES =============
  
  app.get("/api/brands/:brandId/integrations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const integrations = await storage.getIntegrationsByBrand(req.params.brandId);
      res.json(integrations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/integrations/manual-evidence", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const platform = String(req.body?.platform || '').toLowerCase();
      const allowed = new Set(['google_search_console', 'gsc', 'google_analytics', 'ga4']);
      if (!allowed.has(platform)) {
        return res.status(400).json({ message: "Manual evidence is supported for GSC and GA4 only." });
      }

      const canonicalPlatform = platform === 'gsc' ? 'google_search_console'
        : platform === 'ga4' ? 'google_analytics'
          : platform;
      const accountName = String(req.body?.accountName || req.body?.propertyName || (canonicalPlatform === 'google_search_console' ? 'Manual GSC evidence' : 'Manual GA4 evidence')).slice(0, 160);
      const proofUrl = req.body?.proofUrl ? String(req.body.proofUrl).slice(0, 500) : null;
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 1000) : null;

      await db.execute(sql`
        DELETE FROM integrations
        WHERE brand_id = ${brand.id}
          AND (type = ${canonicalPlatform} OR platform = ${canonicalPlatform})
      `);

      const manualCredentials = {
        mode: 'manual_evidence',
        proofUrl,
        notes,
        recordedBy: userId,
        recordedAt: new Date().toISOString(),
      };
      await db.execute(sql`
        INSERT INTO integrations (brand_id, type, name, config, credentials, is_active, last_sync, sync_status, platform, status, account_id, account_name)
        VALUES (
          ${brand.id},
          ${canonicalPlatform},
          ${accountName},
          ${JSON.stringify({ platform: canonicalPlatform, status: 'connected', accountName })}::jsonb,
          ${JSON.stringify(manualCredentials)}::jsonb,
          TRUE,
          NOW(),
          'connected',
          ${canonicalPlatform},
          'connected',
          ${`manual-${canonicalPlatform}-${Date.now()}`},
          ${accountName}
        )
      `);
      const [integration] = await db
        .select()
        .from(integrationsTable)
        .where(eq(integrationsTable.brandId, brand.id))
        .orderBy(desc(integrationsTable.updatedAt as any))
        .limit(1);

      await createAuditLog(req, "manual_connect", "integration", integration.id, null, integration);
      res.json({
        integration,
        message: `${canonicalPlatform === 'google_search_console' ? 'Google Search Console' : 'Google Analytics'} manual evidence recorded.`,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ANALYSIS SCHEDULE ROUTES =============

  app.get("/api/brands/:brandId/schedule", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const schedule = await storage.getAnalysisSchedule(req.params.brandId);
      res.json(schedule || { isEnabled: false, frequency: "daily" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/schedule", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const existing = await storage.getAnalysisSchedule(req.params.brandId);
      if (existing) {
        const updated = await storage.updateAnalysisSchedule(existing.id, req.body);
        return res.json(updated);
      }

      const data = insertAnalysisScheduleSchema.parse({ ...req.body, brandId: req.params.brandId });
      const schedule = await storage.createAnalysisSchedule(data);
      res.json(schedule);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= JOB ROUTES =============
  // Note: GET /api/brands/:brandId/jobs is defined later in the file (line ~2318)
  // using the job queue instead of storage for real-time job status

  app.post("/api/brands/:brandId/jobs", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = insertJobSchema.parse({ 
        ...req.body, 
        brandId: qstr(req.params.brandId),
        createdBy: userId 
      });
      const job = await storage.createJob(data);
      await createAuditLog(req, "create", "job", job.id, null, job);
      res.json(job);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= AXP CONTENT ROUTES =============

  app.get("/api/brands/:brandId/axp", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const content = await storage.getAxpContentByBrand(req.params.brandId);
      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/axp", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const data = insertAxpContentSchema.parse({ 
        ...req.body, 
        brandId: qstr(req.params.brandId),
        createdBy: userId 
      });
      const content = await storage.createAxpContent(data);
      res.json(content);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Render AXP page as HTML
  app.get("/api/brands/:brandId/axp/:pageId/html", async (req: any, res) => {
    try {
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const allContent = await storage.getAxpContentByBrand(req.params.brandId);
      const page = allContent.find(c => c.id === req.params.pageId);
      
      if (!page) {
        return res.status(404).json({ message: "AXP page not found" });
      }

      // Generate structured JSON-LD based on content type
      const generateJsonLd = (content: any, brandData: any) => {
        const baseSchema: any = {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": content.title,
          "url": `https://${brandData.domain}/${content.slug}`,
          "description": content.content?.substring(0, 160) || '',
          "publisher": {
            "@type": "Organization",
            "name": brandData.name,
            "url": `https://${brandData.domain}`,
          },
        };

        return JSON.stringify(baseSchema, null, 2);
      };

      const jsonLd = generateJsonLd(page, brand);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title || brand.name} | AXP</title>
  <link rel="canonical" href="https://${brand.domain}/${page.slug}">
  <meta name="robots" content="noindex, follow">
  <meta name="description" content="${page.content?.substring(0, 160) || ''}">
  
  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
${jsonLd}
  </script>
  
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { color: #1a1a1a; }
    .content { color: #333; }
    .meta { color: #666; font-size: 0.875rem; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }
  </style>
</head>
<body>
  <header>
    <h1>${page.title || 'Untitled'}</h1>
  </header>
  <main class="content">
    ${page.contentHtml || page.content || '<p>No content available.</p>'}
  </main>
  <footer class="meta">
    <p>Published by ${brand.name}</p>
    <p>Last updated: ${new Date(page.updatedAt || page.createdAt || 0).toLocaleDateString()}</p>
  </footer>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // =============================================
  // ADMIN ROUTES
  // =============================================

  // Apply admin rate limiting to all /api/admin routes
  app.use('/api/admin', adminLimiter);

  // ============= ADMIN: DASHBOARD STATS =============

  app.get("/api/admin/dashboard-stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [
        totalBrandsRow,
        planDistributionRows,
        brandsOverTimeRows,
        totalPlansRow,
        totalUsersRow,
        totalTopicsRow,
        totalCompetitorsRow,
        totalPromptsRow,
        promptsPerBrandRows,
        invoiceSummaryRows,
        recentInvoicesRows,
        apiVolumeRows,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(brandsTable),
        db.select({
          plan: brandsTable.tier,
          count: sql<number>`count(*)`,
        })
          .from(brandsTable)
          .groupBy(brandsTable.tier)
          .orderBy(desc(sql`count(*)`)),
        db.select({
          date: sql<string>`to_char(${brandsTable.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)`,
        })
          .from(brandsTable)
          .where(sql`${brandsTable.createdAt} is not null`)
          .groupBy(sql`to_char(${brandsTable.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${brandsTable.createdAt}, 'YYYY-MM-DD')`),
        db.select({ count: sql<number>`count(*)` }).from(planCapabilitiesTable),
        db.select({ count: sql<number>`count(*)` }).from(usersTable),
        db.select({ count: sql<number>`count(*)` }).from(topicsTable),
        db.select({ count: sql<number>`count(*)` }).from(competitorsTable),
        db.select({ count: sql<number>`count(*)` }).from(promptsTable),
        db.select({
          brandName: brandsTable.name,
          count: sql<number>`count(${promptsTable.id})`,
        })
          .from(promptsTable)
          .innerJoin(brandsTable, eq(promptsTable.brandId, brandsTable.id))
          .groupBy(brandsTable.id, brandsTable.name)
          .orderBy(desc(sql`count(${promptsTable.id})`))
          .limit(15),
        db.select({
          totalInvoices: sql<number>`count(*)`,
          totalRevenue: sql<number>`coalesce(sum(case when ${invoicesTable.status} = 'paid' then ${invoicesTable.amount} else 0 end), 0)`,
          mrr: sql<number>`coalesce(sum(case when ${invoicesTable.status} = 'paid' and ${invoicesTable.paidAt} >= now() - interval '30 days' then ${invoicesTable.amount} else 0 end), 0)`,
          recentPaymentsCount: sql<number>`count(*) filter (where ${invoicesTable.status} = 'paid' and ${invoicesTable.paidAt} >= now() - interval '30 days')`,
        }).from(invoicesTable),
        db.select({
          id: invoicesTable.id,
          invoiceNumber: invoicesTable.invoiceNumber,
          brandName: brandsTable.name,
          amount: invoicesTable.amount,
          currency: invoicesTable.currency,
          status: invoicesTable.status,
          createdAt: invoicesTable.createdAt,
          paidAt: invoicesTable.paidAt,
        })
          .from(invoicesTable)
          .leftJoin(brandsTable, eq(invoicesTable.brandId, brandsTable.id))
          .orderBy(desc(invoicesTable.createdAt))
          .limit(10),
        db.select({
          date: sql<string>`to_char(${apiLogsTable.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)`,
        })
          .from(apiLogsTable)
          .where(sql`${apiLogsTable.createdAt} is not null`)
          .groupBy(sql`to_char(${apiLogsTable.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${apiLogsTable.createdAt}, 'YYYY-MM-DD')`),
      ]);

      const totalBrands = Number(totalBrandsRow[0]?.count || 0);
      const totalPlans = Number(totalPlansRow[0]?.count || 0);
      const totalUsers = Number(totalUsersRow[0]?.count || 0);
      const totalTopics = Number(totalTopicsRow[0]?.count || 0);
      const totalCompetitors = Number(totalCompetitorsRow[0]?.count || 0);
      const totalPrompts = Number(totalPromptsRow[0]?.count || 0);
      const invoiceSummary = invoiceSummaryRows[0] || {};
      const totalInvoices = Number((invoiceSummary as any).totalInvoices || 0);
      const totalRevenue = Number((invoiceSummary as any).totalRevenue || 0);
      const mrr = Number((invoiceSummary as any).mrr || 0);
      const recentPaymentsCount = Number((invoiceSummary as any).recentPaymentsCount || 0);
      const promptsPerBrand: { brandName: string; count: number }[] = promptsPerBrandRows.map((row: any) => ({
        brandName: row.brandName || 'Unknown',
        count: Number(row.count || 0),
      }));

      const planDistribution: { plan: string; count: number }[] = planDistributionRows.map((row: any) => ({
        plan: row.plan || "unknown",
        count: Number(row.count || 0),
      }));

      const brandsOverTime: { date: string; count: number }[] = [];
      let cumulative = 0;
      brandsOverTimeRows.forEach((row: any) => {
        cumulative += Number(row.count || 0);
        const date = String(row.date || "");
        if (!date) return;
        brandsOverTime.push({ date, count: cumulative });
      });

      const llmUsageRows = await db
        .select({
          provider: promptRunsTable.llmProvider,
          count: sql<number>`count(*)`,
        })
        .from(promptRunsTable)
        .groupBy(promptRunsTable.llmProvider)
        .orderBy(desc(sql`count(*)`));

      const llmUsage: { provider: string; count: number }[] = llmUsageRows.map((row) => ({
        provider: row.provider || "unknown",
        count: Number(row.count) || 0,
      }));

      const apiVolume = apiVolumeRows.map((row: any) => ({
        date: String(row.date || ""),
        count: Number(row.count || 0),
      })).filter((row) => row.date);

      const recentInvoices = recentInvoicesRows.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        brandName: inv.brandName || 'Unknown',
        amount: inv.amount,
        currency: inv.currency,
        status: inv.status,
        createdAt: inv.createdAt,
        paidAt: inv.paidAt,
      }));

      res.json({
        counters: {
          totalBrands,
          totalTopics,
          totalCompetitors,
          totalPlans,
          totalPrompts,
          totalUsers,
          totalRevenue,
          mrr,
          totalInvoices,
          recentPaymentsCount,
        },
        brandsOverTime,
        promptsPerBrand,
        llmUsage,
        apiVolume,
        planDistribution,
        recentInvoices,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: USERS =============

  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const users = await storage.getAllUsers(limit, offset);

      const userIds = users.map((user: any) => String(user.id)).filter(Boolean);
      const brandByUser = new Map<string, any>();
      const latestSessionByUser = new Map<string, any>();
      if (userIds.length) {
        const [brandRows, sessionRows] = await Promise.all([
          db.select({
            id: brandsTable.id,
            userId: brandsTable.userId,
            name: brandsTable.name,
            domain: brandsTable.domain,
            tier: brandsTable.tier,
            createdAt: brandsTable.createdAt,
          })
            .from(brandsTable)
            .where(inArray(brandsTable.userId, userIds))
            .orderBy(desc(brandsTable.createdAt)),
          db.select({
            userId: userSessionsTable.userId,
            ipAddress: userSessionsTable.ipAddress,
            userAgent: userSessionsTable.userAgent,
            deviceInfo: userSessionsTable.deviceInfo,
            lastActivity: userSessionsTable.lastActivity,
          })
            .from(userSessionsTable)
            .where(and(
              inArray(userSessionsTable.userId, userIds),
              eq(userSessionsTable.isActive, true),
              gt(userSessionsTable.expiresAt, new Date())
            ))
            .orderBy(desc(userSessionsTable.lastActivity)),
        ]);
        for (const brand of brandRows) {
          if (!brandByUser.has(brand.userId)) brandByUser.set(brand.userId, brand);
        }
        for (const session of sessionRows) {
          if (!latestSessionByUser.has(session.userId)) latestSessionByUser.set(session.userId, session);
        }
      }

      const enrichedUsers = users.map((user: any) => {
        const brand = brandByUser.get(user.id);
        const latestSession = latestSessionByUser.get(user.id) || null;
        return {
          ...user,
          brandName: brand?.name || null,
          brandId: brand?.id || null,
          brandDomain: brand?.domain || null,
          brandTier: brand?.tier || null,
          deviceInfo: latestSession?.deviceInfo || null,
          lastIp: latestSession?.ipAddress || null,
          lastUserAgent: latestSession?.userAgent || null,
          lastActivity: latestSession?.lastActivity || null,
        };
      });
      
      res.json({ users: enrichedUsers, total: enrichedUsers.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:userId/unlock", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userIdParam = req.params.userId;
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
      if (!userId) {
        return res.status(400).json({ message: "Invalid user id" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const now = new Date();
      const wasLocked = Boolean(
        user.accountLocked || (user.lockedUntil && new Date(user.lockedUntil) > now),
      );

      await Promise.all([
        storage.updateUser(userId, {
          accountLocked: false,
          lockedUntil: null,
          failedLoginAttempts: 0,
          lastFailedLogin: null,
        } as any),
        db
          .update(accountLockoutsTable)
          .set({ lockedUntil: now })
          .where(
            and(
              eq(accountLockoutsTable.userId, userId),
              sql`${accountLockoutsTable.lockedUntil} > NOW()`,
            ),
          ),
      ]);

      const userAgentHeader = req.headers["user-agent"];
      const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
      await storage.createSecurityEvent({
        userId,
        eventType: "account_unlocked_by_admin",
        severity: "info",
        ipAddress: req.ip || null,
        userAgent: userAgent || null,
        metadata: {
          adminUserId: (req as any).userId || null,
          previousLockedUntil: user.lockedUntil || null,
        },
      });

      await createAuditLog(
        req,
        "admin_unlock",
        "user",
        userId,
        {
          accountLocked: user.accountLocked,
          lockedUntil: user.lockedUntil,
          failedLoginAttempts: user.failedLoginAttempts,
        },
        {
          accountLocked: false,
          lockedUntil: null,
          failedLoginAttempts: 0,
        },
      );

      return res.json({
        message: wasLocked
          ? "Account unlocked successfully"
          : "Account was not actively locked. Lock state reset successfully.",
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/users/:userId/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = qstr(req.params.userId);
      const days = parseInt(req.query.days as string) || 30;
      const fromQuery = req.query.from as string | undefined;
      const toQuery = req.query.to as string | undefined;
      const since = fromQuery ? new Date(fromQuery) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const until = toQuery ? new Date(toQuery) : new Date();

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const requestedBrandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
      const requestedEventType = typeof req.query.eventType === "string" ? req.query.eventType : undefined;
      const requestedSessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const requestedPage = typeof req.query.page === "string" ? req.query.page.toLowerCase() : undefined;

      const events = await storage.getUserAnalyticsEvents({
        userId,
        brandId: requestedBrandId,
        eventType: requestedEventType,
        sessionId: requestedSessionId && requestedSessionId !== "no_session" ? requestedSessionId : undefined,
        pageContains: requestedPage,
        since,
        until,
        limit: 100000,
        offset: 0,
      });

      events.sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime());

      const sessionsMap = new Map<string, any>();
      const pagesMap = new Map<string, { page: string; views: number; clicks: number; totalDuration: number; durationCount: number; sessionIds: Set<string>; lastSeenAt: Date | null }>();
      const eventTypeCounts: Record<string, number> = {};

      for (const event of events) {
        const createdAt = event.createdAt ? new Date(event.createdAt) : null;
        const sessionId = event.sessionId || "no_session";

        if (!sessionsMap.has(sessionId)) {
          sessionsMap.set(sessionId, {
            sessionId,
            startedAt: createdAt,
            endedAt: createdAt,
            eventCount: 0,
            pageViews: 0,
            clicks: 0,
            uniquePages: new Set<string>(),
            referrer: event.referrer || null,
            userAgent: event.userAgent || null,
            lastPage: event.pagePath || null,
          });
        }

        const session = sessionsMap.get(sessionId);
        session.eventCount += 1;
        if (createdAt && (!session.startedAt || createdAt < session.startedAt)) session.startedAt = createdAt;
        if (createdAt && (!session.endedAt || createdAt > session.endedAt)) session.endedAt = createdAt;
        if (event.pagePath) {
          session.uniquePages.add(event.pagePath);
          session.lastPage = event.pagePath;
        }
        if (event.eventType === "page_view") session.pageViews += 1;
        if (event.eventType === "click") session.clicks += 1;

        eventTypeCounts[event.eventType] = (eventTypeCounts[event.eventType] || 0) + 1;

        if (event.pagePath) {
          if (!pagesMap.has(event.pagePath)) {
            pagesMap.set(event.pagePath, {
              page: event.pagePath,
              views: 0,
              clicks: 0,
              totalDuration: 0,
              durationCount: 0,
              sessionIds: new Set<string>(),
              lastSeenAt: null,
            });
          }

          const page = pagesMap.get(event.pagePath)!;
          page.sessionIds.add(sessionId);
          if (createdAt && (!page.lastSeenAt || createdAt > page.lastSeenAt)) page.lastSeenAt = createdAt;
          if (event.eventType === "page_view") page.views += 1;
          if (event.eventType === "click") page.clicks += 1;
          if (typeof event.duration === "number" && event.duration > 0) {
            page.totalDuration += event.duration;
            page.durationCount += 1;
          }
        }
      }

      const sessions = Array.from(sessionsMap.values())
        .map((session) => {
          const startedAt = session.startedAt ? new Date(session.startedAt) : null;
          const endedAt = session.endedAt ? new Date(session.endedAt) : null;
          const durationSeconds = startedAt && endedAt
            ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
            : 0;
          return {
            sessionId: session.sessionId,
            startedAt,
            endedAt,
            durationSeconds,
            eventCount: session.eventCount,
            pageViews: session.pageViews,
            clicks: session.clicks,
            uniquePages: session.uniquePages.size,
            referrer: session.referrer,
            userAgent: session.userAgent,
            lastPage: session.lastPage,
          };
        })
        .sort((a, b) => new Date(b.endedAt as any).getTime() - new Date(a.endedAt as any).getTime());

      const pages = Array.from(pagesMap.values())
        .map((page) => ({
          page: page.page,
          views: page.views,
          clicks: page.clicks,
          uniqueSessions: page.sessionIds.size,
          avgDuration: page.durationCount > 0 ? Math.round(page.totalDuration / page.durationCount) : 0,
          lastSeenAt: page.lastSeenAt,
        }))
        .sort((a, b) => b.views - a.views);

      const selectedSessionId = requestedSessionId || sessions[0]?.sessionId || null;
      const timeline = selectedSessionId
        ? events
            .filter((event) => (event.sessionId || "no_session") === selectedSessionId)
            .slice(-500)
            .map((event) => ({
              id: event.id,
              createdAt: event.createdAt,
              eventType: event.eventType,
              pagePath: event.pagePath,
              pageTitle: event.pageTitle,
              elementId: event.elementId,
              elementType: event.elementType,
              elementText: event.elementText,
              duration: event.duration,
              referrer: event.referrer,
              metadata: event.metadata,
            }))
        : [];

      const sessionDurationAvg = sessions.length
        ? Math.round(sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / sessions.length)
        : 0;

      const totalPageViews = eventTypeCounts.page_view || 0;
      const totalClicks = eventTypeCounts.click || 0;

      res.json({
        user: {
          id: user.id,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          email: user.email,
        },
        range: { since, until, days },
        overview: {
          totalEvents: events.length,
          totalSessions: sessions.length,
          totalPageViews,
          totalClicks,
          avgSessionDuration: sessionDurationAvg,
        },
        eventTypeDistribution: Object.entries(eventTypeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        sessions,
        pages,
        selectedSessionId,
        timeline,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: PLANS =============

  app.get("/api/admin/plans", requireAuth, requireAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlanCapabilities();
      res.json(plans);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/plans", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const data = insertPlanCapabilitySchema.parse(req.body);
      const plan = await storage.createPlanCapability(data);
      await createAuditLog(req, "create", "plan", plan.id, null, plan);
      res.json(plan);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/plans/:planId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const allowedFields = [
        "name",
        "displayName",
        "monthlyPrice",
        "maxCompetitors",
        "maxTopics",
        "maxPrompts",
        "maxTeamMembers",
        "allowedLlmProviders",
        "allowedIntegrations",
        "refreshFrequency",
        "exportEnabled",
        "apiAccessEnabled",
        "whitelabelEnabled",
        "prioritySupport",
        "customBranding",
        "ssoEnabled",
        "auditLogsEnabled",
        "dailyQueryLimit",
        "isActive",
      ] as const;
      const updates = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => allowedFields.includes(key as any)),
      );

      const oldPlan = await storage.getPlanCapability(req.params.planId);
      const updated = await storage.updatePlanCapability(req.params.planId, updates as any);
      await createAuditLog(req, "update", "plan", req.params.planId, oldPlan, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/plans/:planId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const plan = await storage.getPlanCapability(req.params.planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }
      await storage.deletePlanCapability(req.params.planId);
      await createAuditLog(req, "delete", "plan", req.params.planId, plan, null);
      res.json({ message: "Plan deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= ADMIN: PROMPT TEMPLATES =============

  app.get("/api/admin/prompt-templates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getPromptTemplates({
        category: req.query.category as string,
        llmProvider: req.query.llmProvider as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      });
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/prompt-templates/:templateId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const template = await storage.getPromptTemplate(qstr(req.params.templateId));
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/prompt-templates", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const data = insertPromptTemplateSchema.parse({ 
        ...req.body, 
        createdBy: getUserId(req) 
      });
      const template = await storage.createPromptTemplate(data);
      await createAuditLog(req, "create", "prompt_template", template.id, null, template);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/prompt-templates/:templateId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const oldTemplate = await storage.getPromptTemplate(req.params.templateId);
      const updated = await storage.updatePromptTemplate(req.params.templateId, req.body);
      await createAuditLog(req, "update", "prompt_template", req.params.templateId, oldTemplate, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= ADMIN: PROMPT MINING =============

  /**
   * Mine real user prompts for a brand
   */
  app.post("/api/admin/prompt-mining/mine", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { brandId, sources, limit } = req.body;

      if (!brandId) {
        return res.status(400).json({ message: "brandId is required" });
      }

      const brand = await storage.getBrand(brandId);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const competitors = await storage.getCompetitorsByBrand(brandId);
      const competitorNames = competitors.map((c: any) => c.name);

      // Import mining functions dynamically to avoid circular dependencies
      const { mineSearchPrompts, mineRedditPrompts, mineForumPrompts } = await import("./services/prompt-intelligence");

      const searchPrompts = sources?.includes('search') !== false
        ? await mineSearchPrompts({ name: brand.name, industry: brand.industry, competitors: competitorNames }, limit || 30)
        : [];
      const redditPrompts = sources?.includes('reddit')
        ? await mineRedditPrompts({ name: brand.name, industry: brand.industry, competitors: competitorNames }, limit || 20)
        : [];
      const forumPrompts = sources?.includes('forum')
        ? await mineForumPrompts({ name: brand.name, industry: brand.industry, competitors: competitorNames }, limit || 15)
        : [];

      const allPrompts = [...searchPrompts, ...redditPrompts, ...forumPrompts];
      let stored = 0;
      const errors: string[] = [];

      for (const prompt of allPrompts.slice(0, limit || 50)) {
        try {
          await storage.createPromptTemplate({
            name: `Mined: ${prompt.query.slice(0, 50)}`,
            description: `Real user query from ${prompt.source}: ${prompt.query}`,
            category: 'query_generation',
            llmProvider: 'all',
            template: prompt.query,
            source: prompt.source,
            intentType: prompt.intentType,
            promptTemplates: [prompt.query],
            miningStatus: 'completed',
            lastMinedAt: new Date(),
          } as any);
          stored++;
        } catch (e: any) {
          if (!e.message?.includes('duplicate') && e.code !== '23505') {
            errors.push(`Failed to store: ${prompt.query}`);
          }
        }
      }

      res.json({
        success: true,
        brandId,
        brandName: brand.name,
        mined: allPrompts.length,
        stored,
        errors: errors.slice(0, 5),
        bySource: {
          search: searchPrompts.length,
          reddit: redditPrompts.length,
          forum: forumPrompts.length,
        },
      });
    } catch (error: any) {
      logger.error('Prompt mining failed', { error: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get mining statistics
   */
  app.get("/api/admin/prompt-mining/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getPromptTemplates({ isActive: true });

      const stats = {
        total: templates.length,
        bySource: { reddit: 0, search: 0, forum: 0, manual: 0 },
        byIntentType: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        recentlyMined: 0,
        minedTemplates: 0,
      };

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const template of templates) {
        const source = template.source || 'manual';
        if (source in stats.bySource) {
          stats.bySource[source as keyof typeof stats.bySource]++;
        }

        if (template.intentType) {
          stats.byIntentType[template.intentType] = (stats.byIntentType[template.intentType] || 0) + 1;
        }

        stats.byCategory[template.category] = (stats.byCategory[template.category] || 0) + 1;

        if (template.lastMinedAt) {
          const minedAt = new Date(template.lastMinedAt);
          if (minedAt > oneWeekAgo) {
            stats.recentlyMined++;
          }
        }

        if (source !== 'manual') {
          stats.minedTemplates++;
        }
      }

      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Get real user prompt patterns for a topic
   */
  app.get("/api/topics/:topicId/prompt-patterns", requireAuth, async (req: any, res) => {
    try {
      const topic = await storage.getTopic(req.params.topicId);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const brand = await storage.getBrand(topic.brandId);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const competitors = await storage.getCompetitorsByBrand(brand.id);
      const competitorNames = competitors.map((c: any) => c.name);

      // Get mined templates for this topic
      const templates = await storage.getPromptTemplates({
        category: 'query_generation',
        isActive: true,
      });

      // Generate intent-based patterns
      const { mineSearchPrompts } = await import("./services/prompt-intelligence");
      const patterns = await mineSearchPrompts(
        { name: brand.name, industry: brand.industry, competitors: competitorNames },
        20
      );

      const patternsByIntent: Record<string, { count: number; examples: string[] }> = {};
      for (const pattern of patterns) {
        const intent = pattern.intentType;
        if (!patternsByIntent[intent]) {
          patternsByIntent[intent] = { count: 0, examples: [] };
        }
        if (patternsByIntent[intent].examples.length < 3) {
          patternsByIntent[intent].examples.push(pattern.query);
        }
        patternsByIntent[intent].count++;
      }

      res.json({
        topicId: topic.id,
        topicName: topic.name,
        patterns: Object.entries(patternsByIntent).map(([intentType, data]) => ({
          intentType,
          count: data.count,
          examples: data.examples,
        })),
        totalMinedTemplates: templates.filter(t => t.source !== 'manual').length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: BRANDS =============

  app.get("/api/admin/brands", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const brands = await storage.getAllBrands(limit, offset);
      const total = await storage.countBrands();
      res.json({ brands, total });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brand = await storage.getBrand(qstr(req.params.brandId));
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      
      const [competitors, prompts, topics, sources, jobs] = await Promise.all([
        storage.getCompetitorsByBrand(qstr(req.params.brandId)),
        storage.getPromptsByBrand(qstr(req.params.brandId)),
        storage.getTopicsByBrand(qstr(req.params.brandId)),
        storage.getSourcesByBrand(qstr(req.params.brandId)),
        storage.getJobsByBrand(qstr(req.params.brandId), 10),
      ]);
      
      res.json({ brand, competitors, prompts, topics, sources, jobs });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/brands/:brandId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const oldBrand = await storage.getBrand(req.params.brandId);
      const updated = await storage.updateBrand(req.params.brandId, req.body);
      await createAuditLog(req, "admin_update", "brand", req.params.brandId, oldBrand, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/brands/:brandId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const brand = await storage.getBrand(req.params.brandId);
      await storage.deleteBrand(req.params.brandId);
      await createAuditLog(req, "delete", "brand", req.params.brandId, brand, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Trigger job for brand
  app.post("/api/admin/brands/:brandId/run-job", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const job = await storage.createJob({
        brandId: qstr(req.params.brandId),
        type: req.body.type || "full_analysis",
        status: "pending",
        priority: 10,
        payload: req.body.payload,
        createdBy: getUserId(req),
      });

      await createAuditLog(req, "admin_trigger_job", "job", job.id, null, job);
      res.json(job);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= ADMIN: BRAND DETAIL ENDPOINTS =============

  app.get("/api/admin/brands/:brandId/competitors/:competitorId/mentions", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { brandId, competitorId } = req.params;
      const competitor = await storage.getCompetitor(qstr(competitorId));
      if (!competitor || competitor.brandId !== brandId) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const answers = await storage.getLlmAnswersByBrand(brandId, 200);
      const answerIds = answers.map(a => a.id);
      const allMentions = answerIds.length > 0 ? await storage.getAnswerMentionsByAnswerIds(answerIds) : [];
      const competitorMentions = allMentions.filter(m => 
        m.entityName?.toLowerCase() === competitor.name?.toLowerCase() ||
        m.competitorId === competitorId
      );

      const brand = await storage.getBrand(brandId);
      const brandMentions = allMentions.filter(m =>
        m.entityName?.toLowerCase() === brand?.name?.toLowerCase() ||
        m.isCompetitor === false
      );

      const prompts = await storage.getPromptsByBrand(brandId);
      const promptMap = new Map(prompts.map(p => [p.id, p]));

      const mentionsByModel = new Map<string, { competitor: number; brand: number }>();
      for (const mention of competitorMentions) {
        const answer = answers.find(a => a.id === mention.llmAnswerId);
        if (answer) {
          const model = answer.llmProvider;
          if (!mentionsByModel.has(model)) mentionsByModel.set(model, { competitor: 0, brand: 0 });
          mentionsByModel.get(model)!.competitor++;
        }
      }
      for (const mention of brandMentions) {
        const answer = answers.find(a => a.id === mention.llmAnswerId);
        if (answer) {
          const model = answer.llmProvider;
          if (!mentionsByModel.has(model)) mentionsByModel.set(model, { competitor: 0, brand: 0 });
          mentionsByModel.get(model)!.brand++;
        }
      }

      const mentionDetails = competitorMentions.map(m => {
        const answer = answers.find(a => a.id === m.llmAnswerId);
        const prompt = answer ? promptMap.get(answer.promptId) : null;
        return {
          mentionId: m.id,
          promptText: prompt?.text || 'Unknown prompt',
          promptId: answer?.promptId,
          model: answer?.llmProvider || 'unknown',
          context: m.context || '',
          sentiment: m.sentiment,
          position: m.position,
          createdAt: m.createdAt,
        };
      });

      const mentionsByModelArray = Array.from(mentionsByModel.entries()).map(([model, counts]) => ({
        model,
        competitorCount: counts.competitor,
        brandCount: counts.brand,
      }));

      res.json({
        competitor,
        totalMentions: competitorMentions.length,
        brandTotalMentions: brandMentions.length,
        mentionsByModel: mentionsByModelArray,
        mentionDetails,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId/topics/:topicId/analysis", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { brandId, topicId } = req.params;
      const topic = await storage.getTopic(qstr(topicId));
      if (!topic || topic.brandId !== brandId) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const prompts = await storage.getPromptsByBrand(brandId);
      const topicPrompts = prompts.filter(p => p.topicId === topicId);
      const answers = await storage.getLlmAnswersByBrand(brandId, 200);
      const answerIds = answers.map(a => a.id);
      const allMentions = answerIds.length > 0 ? await storage.getAnswerMentionsByAnswerIds(answerIds) : [];

      const brand = await storage.getBrand(brandId);

      const promptAnalysis = topicPrompts.map(prompt => {
        const promptAnswers = answers.filter(a => a.promptId === prompt.id);
        const promptAnswerIds = promptAnswers.map(a => a.id);
        const promptMentions = allMentions.filter(m => promptAnswerIds.includes(m.llmAnswerId));
        const brandMentioned = promptMentions.filter(m =>
          m.entityName?.toLowerCase() === brand?.name?.toLowerCase() || m.isCompetitor === false
        );

        const modelBreakdown: Record<string, { mentioned: boolean; sentiment: string | null }> = {};
        for (const answer of promptAnswers) {
          const answerMentions = promptMentions.filter(m => m.llmAnswerId === answer.id);
          const hasBrand = answerMentions.some(m =>
            m.entityName?.toLowerCase() === brand?.name?.toLowerCase() || m.isCompetitor === false
          );
          modelBreakdown[answer.llmProvider] = {
            mentioned: hasBrand,
            sentiment: answerMentions[0]?.sentiment || null,
          };
        }

        return {
          promptId: prompt.id,
          promptText: prompt.text,
          category: prompt.category,
          totalResponses: promptAnswers.length,
          brandMentionRate: promptAnswers.length > 0 ? Math.round((brandMentioned.length / promptAnswers.length) * 100) : 0,
          avgSentiment: brandMentioned.length > 0 ? brandMentioned.reduce((sum, m) => sum + (m.sentiment === 'positive' ? 1 : m.sentiment === 'negative' ? -1 : 0), 0) / brandMentioned.length : 0,
          modelBreakdown,
        };
      });

      res.json({
        topic,
        promptCount: topicPrompts.length,
        avgBrandMentionRate: promptAnalysis.length > 0 ? Math.round(promptAnalysis.reduce((s, p) => s + p.brandMentionRate, 0) / promptAnalysis.length) : 0,
        promptAnalysis,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId/prompts/:promptId/responses", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { brandId, promptId } = req.params;
      const prompt = await storage.getPrompt(qstr(promptId));
      if (!prompt || prompt.brandId !== brandId) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      const answers = await storage.getLlmAnswersByBrand(brandId, 200);
      const promptAnswers = answers.filter(a => a.promptId === promptId);
      const answerIds = promptAnswers.map(a => a.id);
      const allMentions = answerIds.length > 0 ? await storage.getAnswerMentionsByAnswerIds(answerIds) : [];
      const allCitations = answerIds.length > 0 ? await storage.getAnswerCitationsByAnswerIds(answerIds) : [];

      const brand = await storage.getBrand(brandId);
      const competitors = await storage.getCompetitorsByBrand(brandId);

      const responses = promptAnswers.map(answer => {
        const mentions = allMentions.filter(m => m.llmAnswerId === answer.id);
        const citations = allCitations.filter(c => c.llmAnswerId === answer.id);

        const brandMentioned = mentions.some(m =>
          m.entityName?.toLowerCase() === brand?.name?.toLowerCase() || m.isCompetitor === false
        );

        const competitorMentions = competitors.map(comp => ({
          name: comp.name,
          mentioned: mentions.some(m => m.entityName?.toLowerCase() === comp.name?.toLowerCase()),
          count: mentions.filter(m => m.entityName?.toLowerCase() === comp.name?.toLowerCase()).length,
        }));

        const sentimentMentions = mentions.filter(m => m.sentiment);
        const avgSentiment = sentimentMentions.length > 0 
          ? sentimentMentions.reduce((s, m) => s + (m.sentiment === 'positive' ? 1 : m.sentiment === 'negative' ? -1 : 0), 0) / sentimentMentions.length
          : 0;

        return {
          answerId: answer.id,
          model: answer.llmProvider,
          llmModel: answer.llmModel,
          responseSnippet: answer.rawResponse?.substring(0, 300) || '',
          fullResponse: answer.rawResponse || '',
          brandMentioned,
          competitorMentions,
          sentiment: avgSentiment > 0.3 ? 'positive' : avgSentiment < -0.3 ? 'negative' : 'neutral',
          citationsCount: citations.length,
          citations: citations.map(c => ({ url: c.url, domain: c.domain, title: c.title })),
          createdAt: answer.createdAt,
        };
      });

      res.json({
        prompt,
        totalResponses: responses.length,
        brandMentionRate: responses.length > 0 ? Math.round((responses.filter(r => r.brandMentioned).length / responses.length) * 100) : 0,
        responses,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: AUDIT LOGS =============

  app.get("/api/admin/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAuditLogs({
        brandId: req.query.brandId as string,
        userId: req.query.userId as string,
        limit: parseInt(req.query.limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: API LOGS =============

  app.get("/api/admin/api-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const level = req.query.level as string;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const [logs, total] = await Promise.all([
        storage.getApiLogs({ level, limit, offset }),
        storage.getApiLogsCount({ level }),
      ]);
      res.json({ logs, total });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: ENVIRONMENT STATUS =============

  app.get("/api/admin/env-status", requireAuth, requireAdmin, async (req, res) => {
    const envVars = [
      // Core
      { key: "DATABASE_URL", category: "core", required: true },
      { key: "SESSION_SECRET", category: "core", required: true },
      { key: "NODE_ENV", category: "core", required: false },
      { key: "PORT", category: "core", required: false },
      { key: "ALLOWED_ORIGINS", category: "core", required: false },
      // LLM Providers
      { key: "OPENAI_API_KEY", category: "llm", required: false },
      { key: "ANTHROPIC_API_KEY", category: "llm", required: false },
      { key: "GOOGLE_API_KEY", category: "llm", required: false },
      { key: "GOOGLE_AI_API_KEY", category: "llm", required: false },
      { key: "PERPLEXITY_API_KEY", category: "llm", required: false },
      { key: "GROK_API_KEY", category: "llm", required: false },
      { key: "DEEPSEEK_API_KEY", category: "llm", required: false },
      { key: "OPENROUTER_API_KEY", category: "llm", required: false },
      // Payments
      { key: "RAZORPAY_KEY_ID", category: "payments", required: false },
      { key: "RAZORPAY_KEY_SECRET", category: "payments", required: false },
      { key: "RAZORPAY_WEBHOOK_SECRET", category: "payments", required: false },
      // Integrations
      { key: "FIRECRAWL_API_KEY", category: "integrations", required: false },
      { key: "GOOGLE_KG_API_KEY", category: "integrations", required: false },
      { key: "SERPAPI_API_KEY", category: "integrations", required: false },
      { key: "DATAFORSEO_KEY", category: "integrations", required: false },
      { key: "SOCIAL_API_KEY", category: "integrations", required: false },
      // OAuth / Email
      { key: "GOOGLE_CLIENT_ID", category: "oauth", required: false },
      { key: "GOOGLE_CLIENT_SECRET", category: "oauth", required: false },
      { key: "GOOGLE_CALLBACK_URL", category: "oauth", required: false },
      { key: "SMTP_HOST", category: "email", required: false },
      { key: "SMTP_PORT", category: "email", required: false },
      { key: "SMTP_USER", category: "email", required: false },
      { key: "SMTP_PASS", category: "email", required: false },
      { key: "SMTP_FROM", category: "email", required: false },
    ];

    const settings = await storage.getAllSystemSettings();
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const safeToReveal = new Set(["NODE_ENV", "PORT", "ALLOWED_ORIGINS", "SMTP_FROM", "GOOGLE_CALLBACK_URL"]);
    const maskValue = (value: string | undefined, key: string) => {
      if (!value) return null;
      if (safeToReveal.has(key)) return value;
      if (value.length <= 8) return "••••••••";
      return `${value.slice(0, 4)}••••${value.slice(-2)}`;
    };

    const result = envVars.map(v => {
      const envValue = process.env[v.key];
      const dbValue = settingsMap.get(v.key.toLowerCase()) || undefined;
      const effectiveValue = envValue ?? dbValue;
      return {
        key: v.key,
        category: v.category,
        required: v.required,
        configured: !!effectiveValue,
        status: effectiveValue ? "connected" : "failed",
        statusLabel: effectiveValue ? "Connected" : "Failed",
        statusMessage: effectiveValue
          ? `Loaded from ${envValue ? (dbValue ? "environment and database" : "environment") : "database settings"}`
          : "No environment variable or database setting is configured.",
        maskedValue: maskValue(effectiveValue, v.key),
        value: effectiveValue ?? null,
        source: envValue ? (dbValue ? "env+db" : "env") : (dbValue ? "db" : "none"),
      };
    });

    res.json(result);
  });

  // ============= ADMIN: OPENROUTER MODEL CONFIG =============

  // GET /api/admin/openrouter/models - Fetch available models from OpenRouter
  app.get("/api/admin/openrouter/models", requireAuth, requireAdmin, async (req, res) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: "OpenRouter API key not configured" });
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/openrouter/model-config - Get current model routing config
  app.get("/api/admin/openrouter/model-config", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [simpleModel, mediumModel, complexModel] = await Promise.all([
        storage.getSystemSetting('openrouter_model_simple'),
        storage.getSystemSetting('openrouter_model_medium'),
        storage.getSystemSetting('openrouter_model_complex'),
      ]);

      res.json({
        simple: simpleModel || 'qwen/qwen-2.5-7b-instruct',
        medium: mediumModel || 'qwen/qwen-2.5-32b-instruct',
        complex: complexModel || 'openai/gpt-4o',
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/admin/openrouter/model-config - Save model routing config
  app.put("/api/admin/openrouter/model-config", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { simple, medium, complex } = req.body;

      const results: Record<string, string> = {};

      if (simple) {
        const setting = await storage.setSystemSetting('openrouter_model_simple', simple, userId);
        results.simple = setting.value;
      }
      if (medium) {
        const setting = await storage.setSystemSetting('openrouter_model_medium', medium, userId);
        results.medium = setting.value;
      }
      if (complex) {
        const setting = await storage.setSystemSetting('openrouter_model_complex', complex, userId);
        results.complex = setting.value;
      }

      // Invalidate model router cache so new settings take effect immediately
      try {
        const { invalidateModelRouterCache } = await import('./services/model-router');
        invalidateModelRouterCache();
      } catch {
        // Non-blocking - cache will expire naturally
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: SYSTEM SETTINGS =============

  app.get("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllSystemSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of settings) {
        settingsMap[s.key] = s.value;
      }
      res.json(settingsMap);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/settings", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const updates = req.body as Record<string, string>;
      const userId = req.user?.id;
      const results: Record<string, string> = {};
      for (const [key, value] of Object.entries(updates)) {
        const valueStr = String(value ?? "");
        const setting = await storage.setSystemSetting(key, valueStr, userId);
        results[setting.key] = setting.value;

        // Apply setting to runtime env immediately so workers/integrations pick up changes without restart.
        const envKey = key.toUpperCase();
        if (valueStr) {
          process.env[envKey] = valueStr;
        } else {
          delete process.env[envKey];
        }

        // Keep Google key aliases in sync because some code paths use GOOGLE_API_KEY and others GOOGLE_AI_API_KEY.
        if (envKey === 'GOOGLE_API_KEY' && !process.env.GOOGLE_AI_API_KEY && valueStr) {
          process.env.GOOGLE_AI_API_KEY = valueStr;
        }
        if (envKey === 'GOOGLE_AI_API_KEY' && !process.env.GOOGLE_API_KEY && valueStr) {
          process.env.GOOGLE_API_KEY = valueStr;
        }
      }
      // Do not fail settings save if audit logging encounters a shape/type issue.
      try {
        await createAuditLog(req, 'update', 'system_settings', 'settings', undefined, updates);
      } catch (auditErr: any) {
        logger.warn('Failed to write settings audit log', { error: auditErr?.message });
      }
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/settings/branding", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const logoData = parseImageDataUrl(req.body?.logoDataUrl);
      const faviconData = parseImageDataUrl(req.body?.faviconDataUrl);

      if (!logoData && !faviconData) {
        return res.status(400).json({ message: "Provide logoDataUrl and/or faviconDataUrl" });
      }

      if (logoData && logoData.mimeType !== "image/png") {
        return res.status(400).json({ message: "Logo must be a PNG image" });
      }

      if (faviconData && faviconData.mimeType !== "image/png") {
        return res.status(400).json({ message: "Favicon must be a PNG image" });
      }

      if (logoData) {
        await writeSiteAsset("logo.png", logoData.buffer);
      }

      if (faviconData) {
        await writeSiteAsset("favicon.png", faviconData.buffer);
      }

      const nextVersion = String(Date.now());
      await storage.setSystemSetting("site_logo_url", "/logo.png", userId);
      await storage.setSystemSetting("site_favicon_url", "/favicon.png", userId);
      await storage.setSystemSetting("site_asset_version", nextVersion, userId);

      await createAuditLog(req, "update", "site_branding", "site_assets", undefined, {
        logoUpdated: Boolean(logoData),
        faviconUpdated: Boolean(faviconData),
        site_asset_version: nextVersion,
      });

      res.json({
        logoUrl: "/logo.png",
        faviconUrl: "/favicon.png",
        assetVersion: nextVersion,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: EMAIL CAMPAIGNS =============

  app.post("/api/admin/email/send", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { subject, body, recipientMode, specificEmails, planFilter, attachedPlan } = req.body as {
        subject: string;
        body: string;
        recipientMode: "all" | "specific" | "plan";
        specificEmails?: string[];
        planFilter?: string;
        attachedPlan?: { name: string; price: number; features: string[] };
      };

      if (!subject?.trim() || !body?.trim()) {
        return res.status(400).json({ error: "Subject and body are required" });
      }

      let recipients: { email: string; firstName: string }[] = [];

      if (recipientMode === "specific" && specificEmails?.length) {
        recipients = specificEmails.map((email) => ({ email, firstName: "" }));
      } else {
        const allUsers = await storage.getAllUsers(10000, 0);
        const filtered = planFilter
          ? allUsers.filter((u) => {
              // plan filter is best-effort; subscription lookup would be heavy
              return true; // include all for now — frontend shows plan info
            })
          : allUsers;
        recipients = filtered
          .filter((u) => u.email && u.emailVerified)
          .map((u) => ({ email: u.email!, firstName: u.firstName || "" }));
      }

      if (!recipients.length) {
        return res.status(400).json({ error: "No valid recipients found" });
      }

      let sent = 0;
      let failed = 0;
      for (const { email, firstName } of recipients) {
        try {
          await sendAdminBroadcast(email, subject, body, attachedPlan);
          sent++;
        } catch {
          failed++;
        }
      }

      await createAuditLog(req, "email_campaign_sent", "email", "broadcast", undefined, { subject, recipientMode, sent, failed });

      res.json({ sent, failed, total: recipients.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: PROMPT-TOPIC MATCHING =============

  app.post("/api/admin/brands/:brandId/match-prompts-to-topics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { matchPromptsToTopics } = await import('./services/prompt-topic-matcher');
      const result = await matchPromptsToTopics(qstr(req.params.brandId));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: USER ANALYTICS =============

  app.get("/api/admin/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        overviewRows,
        mostVisitedPageRows,
        topClickRows,
        eventsByDateRows,
        actionDistributionRows,
        brandAnalyticsRows,
      ] = await Promise.all([
        db.select({
          totalEvents: sql<number>`count(*)`,
          uniqueUsers: sql<number>`count(distinct ${userAnalyticsEventsTable.userId}) filter (where ${userAnalyticsEventsTable.userId} is not null)`,
          dailyActiveUsers: sql<number>`count(distinct ${userAnalyticsEventsTable.userId}) filter (where ${userAnalyticsEventsTable.userId} is not null and ${userAnalyticsEventsTable.createdAt} >= current_date)`,
        })
          .from(userAnalyticsEventsTable)
          .where(sql`${userAnalyticsEventsTable.createdAt} >= ${since}`),
        db.select({
          page: userAnalyticsEventsTable.pagePath,
          views: sql<number>`count(*)`,
          avgDuration: sql<number>`coalesce(round(avg(${userAnalyticsEventsTable.duration}) filter (where ${userAnalyticsEventsTable.duration} > 0)), 0)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            eq(userAnalyticsEventsTable.eventType, "page_view"),
            sql`${userAnalyticsEventsTable.pagePath} is not null`,
          ))
          .groupBy(userAnalyticsEventsTable.pagePath)
          .orderBy(desc(sql`count(*)`))
          .limit(20),
        db.select({
          element: sql<string>`coalesce(nullif(${userAnalyticsEventsTable.elementText}, ''), ${userAnalyticsEventsTable.elementId})`,
          clicks: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            eq(userAnalyticsEventsTable.eventType, "click"),
            sql`${userAnalyticsEventsTable.elementId} is not null`,
          ))
          .groupBy(sql`coalesce(nullif(${userAnalyticsEventsTable.elementText}, ''), ${userAnalyticsEventsTable.elementId})`)
          .orderBy(desc(sql`count(*)`))
          .limit(20),
        db.select({
          date: sql<string>`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(sql`${userAnalyticsEventsTable.createdAt} >= ${since}`)
          .groupBy(sql`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`),
        db.select({
          type: userAnalyticsEventsTable.eventType,
          count: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(sql`${userAnalyticsEventsTable.createdAt} >= ${since}`)
          .groupBy(userAnalyticsEventsTable.eventType)
          .orderBy(desc(sql`count(*)`)),
        db.select({
          brandId: userAnalyticsEventsTable.brandId,
          brandName: brandsTable.name,
          events: sql<number>`count(*)`,
          pageViews: sql<number>`count(*) filter (where ${userAnalyticsEventsTable.eventType} = 'page_view')`,
          clicks: sql<number>`count(*) filter (where ${userAnalyticsEventsTable.eventType} = 'click')`,
        })
          .from(userAnalyticsEventsTable)
          .leftJoin(brandsTable, eq(userAnalyticsEventsTable.brandId, brandsTable.id))
          .where(and(
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            sql`${userAnalyticsEventsTable.brandId} is not null`,
          ))
          .groupBy(userAnalyticsEventsTable.brandId, brandsTable.name)
          .orderBy(desc(sql`count(*)`)),
      ]);

      const overview = overviewRows[0] || {};
      const totalEvents = Number((overview as any).totalEvents || 0);
      const uniqueUsers = Number((overview as any).uniqueUsers || 0);
      const dailyActiveUsers = Number((overview as any).dailyActiveUsers || 0);

      const mostVisitedPages = mostVisitedPageRows.map((row: any) => ({
        page: row.page || "",
        views: Number(row.views || 0),
        avgDuration: Number(row.avgDuration || 0),
      }));

      const topClicks = topClickRows.map((row: any) => ({
        element: row.element || "",
        clicks: Number(row.clicks || 0),
      })).filter((row) => row.element);

      const pageViewsOverTime = eventsByDateRows.map((row: any) => ({
        date: String(row.date || ""),
        count: Number(row.count || 0),
      })).filter((row) => row.date);

      const actionDistribution = actionDistributionRows.map((row: any) => ({
        type: row.type || "unknown",
        count: Number(row.count || 0),
      }));

      const brandAnalytics = brandAnalyticsRows.map((row: any) => ({
        brandId: row.brandId,
        brandName: row.brandName || "",
        events: Number(row.events || 0),
        pageViews: Number(row.pageViews || 0),
        clicks: Number(row.clicks || 0),
      }));

      res.json({
        overview: {
          totalEvents,
          uniqueUsers,
          dailyActiveUsers,
          monthlyActiveUsers: uniqueUsers,
        },
        mostVisitedPages,
        topClicks,
        pageViewsOverTime,
        actionDistribution,
        brandAnalytics,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/analytics/brands/:brandId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = qstr(req.params.brandId);
      const days = parseInt(req.query.days as string) || 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        brand,
        overviewRows,
        sessionRows,
        mostVisitedPageRows,
        topClickRows,
        activityRows,
        actionRows,
        featureRows,
        journeyRows,
      ] = await Promise.all([
        storage.getBrand(brandId),
        db.select({ totalEvents: sql<number>`count(*)` })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
          )),
        db.select({
          sessionId: userAnalyticsEventsTable.sessionId,
          startedAt: sql<Date>`min(${userAnalyticsEventsTable.createdAt})`,
          endedAt: sql<Date>`max(${userAnalyticsEventsTable.createdAt})`,
          uniquePages: sql<number>`count(distinct ${userAnalyticsEventsTable.pagePath}) filter (where ${userAnalyticsEventsTable.pagePath} is not null)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            sql`${userAnalyticsEventsTable.sessionId} is not null`,
          ))
          .groupBy(userAnalyticsEventsTable.sessionId),
        db.select({
          page: userAnalyticsEventsTable.pagePath,
          views: sql<number>`count(*)`,
          avgDuration: sql<number>`coalesce(round(avg(${userAnalyticsEventsTable.duration}) filter (where ${userAnalyticsEventsTable.duration} > 0)), 0)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            eq(userAnalyticsEventsTable.eventType, "page_view"),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            sql`${userAnalyticsEventsTable.pagePath} is not null`,
          ))
          .groupBy(userAnalyticsEventsTable.pagePath)
          .orderBy(desc(sql`count(*)`)),
        db.select({
          element: sql<string>`coalesce(nullif(${userAnalyticsEventsTable.elementText}, ''), ${userAnalyticsEventsTable.elementId})`,
          clicks: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            eq(userAnalyticsEventsTable.eventType, "click"),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            sql`${userAnalyticsEventsTable.elementId} is not null`,
          ))
          .groupBy(sql`coalesce(nullif(${userAnalyticsEventsTable.elementText}, ''), ${userAnalyticsEventsTable.elementId})`)
          .orderBy(desc(sql`count(*)`))
          .limit(20),
        db.select({
          date: sql<string>`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
          ))
          .groupBy(sql`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${userAnalyticsEventsTable.createdAt}, 'YYYY-MM-DD')`),
        db.select({
          type: userAnalyticsEventsTable.eventType,
          count: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
          ))
          .groupBy(userAnalyticsEventsTable.eventType)
          .orderBy(desc(sql`count(*)`)),
        db.select({
          feature: sql<string>`coalesce(nullif(split_part(${userAnalyticsEventsTable.pagePath}, '/', 3), ''), 'other')`,
          visits: sql<number>`count(*)`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            eq(userAnalyticsEventsTable.eventType, "page_view"),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
            sql`${userAnalyticsEventsTable.pagePath} is not null`,
          ))
          .groupBy(sql`coalesce(nullif(split_part(${userAnalyticsEventsTable.pagePath}, '/', 3), ''), 'other')`)
          .orderBy(desc(sql`count(*)`)),
        db.select({
          path: userAnalyticsEventsTable.pagePath,
          timestamp: userAnalyticsEventsTable.createdAt,
          eventType: userAnalyticsEventsTable.eventType,
          details: sql<string>`coalesce(${userAnalyticsEventsTable.elementText}, ${userAnalyticsEventsTable.elementId}, '')`,
        })
          .from(userAnalyticsEventsTable)
          .where(and(
            eq(userAnalyticsEventsTable.brandId, brandId),
            sql`${userAnalyticsEventsTable.createdAt} >= ${since}`,
          ))
          .orderBy(desc(userAnalyticsEventsTable.createdAt))
          .limit(100),
      ]);

      const totalEvents = Number((overviewRows[0] as any)?.totalEvents || 0);
      const avgSessionDuration = sessionRows.length > 0
        ? Math.round(sessionRows.reduce((sum: number, row: any) => {
            const startedAt = row.startedAt ? new Date(row.startedAt) : null;
            const endedAt = row.endedAt ? new Date(row.endedAt) : null;
            return sum + (startedAt && endedAt ? (endedAt.getTime() - startedAt.getTime()) / 1000 : 0);
          }, 0) / sessionRows.length)
        : 0;
      const avgPagesPerSession = sessionRows.length > 0
        ? Math.round((sessionRows.reduce((sum: number, row: any) => sum + Number(row.uniquePages || 0), 0) / sessionRows.length) * 10) / 10
        : 0;

      const mostVisitedPages = mostVisitedPageRows.map((row: any) => ({
        page: row.page || "",
        views: Number(row.views || 0),
        avgDuration: Number(row.avgDuration || 0),
      }));

      const topClicks = topClickRows.map((row: any) => ({
        element: row.element || "",
        clicks: Number(row.clicks || 0),
      })).filter((row) => row.element);

      const activityOverTime = activityRows.map((row: any) => ({
        date: String(row.date || ""),
        count: Number(row.count || 0),
      })).filter((row) => row.date);

      const featureAdoption = featureRows.map((row: any) => ({
        feature: row.feature || "other",
        visits: Number(row.visits || 0),
      }));

      const userJourney = journeyRows.map((row: any) => ({
        path: row.path || "",
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : "",
        eventType: row.eventType,
        details: row.details || "",
      }));

      res.json({
        brand: brand ? { id: brand.id, name: brand.name, tier: brand.tier } : null,
        overview: {
          totalEvents,
          totalSessions: sessionRows.length,
          avgSessionDuration,
          avgPagesPerSession,
        },
        mostVisitedPages,
        topClicks,
        activityOverTime,
        actionDistribution: actionRows.map((row: any) => ({ type: row.type || "unknown", count: Number(row.count || 0) })),
        featureAdoption,
        recentJourney: userJourney,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: INVOICES =============

  app.get("/api/admin/invoices", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const getEnrichedInvoices = async () => db
        .select({
          invoice: invoicesTable,
          brandName: brandsTable.name,
          brandDomain: brandsTable.domain,
          userFirstName: usersTable.firstName,
          userLastName: usersTable.lastName,
          userEmail: usersTable.email,
          userPhone: usersTable.phone,
        })
        .from(invoicesTable)
        .leftJoin(brandsTable, eq(invoicesTable.brandId, brandsTable.id))
        .leftJoin(usersTable, eq(brandsTable.userId, usersTable.id))
        .orderBy(desc(invoicesTable.createdAt))
        .limit(limit)
        .offset(offset);

      let allInvoices = await getEnrichedInvoices();

      // If invoice table is empty, sync from Razorpay first, then backfill from local payments.
      if (allInvoices.length === 0) {
        try {
          const { syncSubscriptionStatus } = await import("./services/subscription");
          const brands = await storage.getAllBrands(1000, 0);
          for (const brand of brands) {
            try {
              await syncSubscriptionStatus(brand.id);
            } catch (err) {
              logger.warn("[AdminInvoices] Failed syncSubscriptionStatus for brand", {
                brandId: brand.id,
                error: String(err),
              });
            }
          }
        } catch (err) {
          logger.warn("[AdminInvoices] Razorpay sync skipped before invoice reconcile", {
            error: String(err),
          });
        }

        await reconcileInvoicesFromPayments();
        allInvoices = await getEnrichedInvoices();
      }

      const enriched = allInvoices.map(({ invoice, brandName, brandDomain, userFirstName, userLastName, userEmail, userPhone }) => {
        return {
          ...invoice,
          brandName: brandName || null,
          brandDomain: brandDomain || null,
          userName: [userFirstName, userLastName].filter(Boolean).join(" ") || null,
          userEmail: userEmail || null,
          userPhone: userPhone || null,
        };
      });

      res.json({ invoices: enriched, total: enriched.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/invoices/reconcile", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandIdInput = typeof req.body?.brandId === 'string' ? req.body.brandId : undefined;
      const paymentId = typeof req.body?.paymentId === 'string' ? req.body.paymentId : undefined;
      let brandId = brandIdInput;

      // If only payment ID is provided, recover brand from Razorpay payment/invoice/subscription metadata.
      if (!brandId && paymentId) {
        try {
          const { getRazorpayClient } = await import("./services/subscription");
          const razorpay = getRazorpayClient();
          const payment: any = await razorpay.payments.fetch(paymentId);
          brandId = payment?.notes?.brand_id;

          if (!brandId && payment?.invoice_id) {
            const invoice: any = await (razorpay as any).invoices.fetch(payment.invoice_id);
            if (invoice?.subscription_id) {
              const subscription: any = await razorpay.subscriptions.fetch(invoice.subscription_id);
              brandId = subscription?.notes?.brand_id;
            }
          }
        } catch (err) {
          logger.warn("[AdminInvoices] Failed to derive brand from paymentId", {
            paymentId,
            error: String(err),
          });
        }
      }

      if (brandId) {
        try {
          const { syncSubscriptionStatus } = await import("./services/subscription");
          await syncSubscriptionStatus(brandId);
        } catch (err) {
          logger.warn("[AdminInvoices] syncSubscriptionStatus failed in reconcile", {
            brandId,
            paymentId,
            error: String(err),
          });
        }
      }

      const result = await reconcileInvoicesFromPayments(brandId, paymentId);
      res.json({ success: true, brandId: brandId || null, ...result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/invoices/:invoiceId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const invoiceId = qstr(req.params.invoiceId);
      const [detail] = await db
        .select({
          invoice: invoicesTable,
          brand: brandsTable,
          userFirstName: usersTable.firstName,
          userLastName: usersTable.lastName,
          userEmail: usersTable.email,
          userPhone: usersTable.phone,
          subscription: subscriptionsTable,
        })
        .from(invoicesTable)
        .leftJoin(brandsTable, eq(invoicesTable.brandId, brandsTable.id))
        .leftJoin(usersTable, eq(brandsTable.userId, usersTable.id))
        .leftJoin(subscriptionsTable, eq(invoicesTable.subscriptionId, subscriptionsTable.id))
        .where(eq(invoicesTable.id, invoiceId))
        .limit(1);
      const invoice = detail?.invoice;
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const payments = await storage.getPaymentsByInvoice(invoice.id);

      res.json({
        invoice,
        brand: detail.brand,
        user: detail.userEmail ? {
          firstName: detail.userFirstName,
          lastName: detail.userLastName,
          email: detail.userEmail,
          phone: detail.userPhone,
        } : null,
        subscription: detail.subscription,
        payments,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/invoices/:invoiceId/pdf", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { generateInvoicePDF } = await import('./services/invoice-generator');
      const pdfBuffer = await generateInvoicePDF(qstr(req.params.invoiceId));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.invoiceId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= BRAND REPORT PDF ROUTES (Phase 3.1) =============

  // GET /api/brands/:brandId/report/pdf - Generate brand report PDF
  app.get("/api/brands/:brandId/report/pdf", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const {
        type = 'executive',
        timeframe = 'monthly',
        includeScores = 'true',
        includeCompetitors = 'true',
        includeGaps = 'true',
        includeActions = 'true',
      } = req.query as Record<string, string>;

      const { getPDFReportGenerator } = await import('./services/pdf-generator');
      const { getWhiteLabelService } = await import('./services/whitelabel');
      const generator = getPDFReportGenerator();

      const whiteLabelAccess = await resolveFeatureAccess(req.params.brandId, 'white_label_reports');
      // Resolve agency branding only when the brand is entitled to white-label reports.
      const wlConfig = whiteLabelAccess.allowed
        ? await getWhiteLabelService().getAgencyForBrand(req.params.brandId)
        : null;
      const agencyConfig = wlConfig ? {
        agencyName: wlConfig.agencyName,
        agencyLogoUrl: wlConfig.agencyLogoUrl,
        primaryColor: wlConfig.primaryColor,
        secondaryColor: wlConfig.secondaryColor,
        websiteUrl: wlConfig.websiteUrl,
      } : undefined;

      const pdfBuffer = await generator.generateBrandReport({
        type: type as 'executive' | 'full' | 'action',
        brandId: req.params.brandId,
        timeframe: timeframe as 'weekly' | 'monthly' | 'quarterly',
        includeScores: includeScores === 'true',
        includeCompetitors: includeCompetitors === 'true',
        includeGaps: includeGaps === 'true',
        includeActions: includeActions === 'true',
        agencyConfig,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${brand.name}-report-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('[PDFGenerator] Report generation failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/launch-readiness/report - Shareable launch readiness report artifact
  app.get("/api/brands/:brandId/launch-readiness/report", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [
        latestScore,
        prompts,
        sources,
        allMentions,
        competitors,
        agentReport,
        optimizations,
        answers,
        providerSummary,
      ] = await Promise.all([
        storage.getLatestVisibilityScore(brandId).catch(() => undefined),
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        storage.getAllMentionsForBrand(brandId, 5000).catch(() => []),
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLatestAgentReadinessReport(brandId).catch(() => undefined),
        storage.getOptimizationLogsByBrand(brandId, 100).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 5000).catch(() => []),
        getProviderReliabilitySummary(brandId).catch(() => null),
      ]);

      let productReadiness: any = null;
      try {
        const productService = await import('./services/product-readiness');
        productReadiness = await productService.buildProductReadiness(brand as any);
      } catch {
        productReadiness = null;
      }

      let crawlerStats: any = null;
      try {
        const { getCrawlerTracker } = await import('./services/crawler-tracker');
        crawlerStats = await getCrawlerTracker().getCrawlerStats(brandId);
      } catch {
        crawlerStats = null;
      }
      let attribution: any = null;
      try {
        const { computeAttribution } = await import('./services/attribution');
        attribution = await computeAttribution(brandId, 30, true);
      } catch (error: any) {
        attribution = {
          dataComplete: false,
          aiReferralSessions: 0,
          aiReferralConversions: 0,
          aiAttributedRevenue: 0,
          message: error?.message || 'Attribution could not be computed.',
        };
      }
      const launchTrend = await buildLaunchTrendSnapshot(brand);

      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const promptCount = (prompts as any[]).length;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean)).size;
      const citedUrls = (sources as any[]).filter((source: any) => source.url).length;
      const brandMentions = (allMentions as any[]).filter((mention: any) => !mention.competitorId).length;
      const competitorMentions = (allMentions as any[]).filter((mention: any) => mention.competitorId).length;
      const fanoutIntelligence = buildQueryFanoutIntelligence({
        brand,
        prompts: prompts as any[],
        answers: answers as any[],
        allMentions: allMentions as any[],
        competitors: competitors as any[],
        sources: sources as any[],
      });
      const fanoutQueryCount = Number(fanoutIntelligence.summary.queryCount || 0);
      const highOpportunityFanouts = Number(fanoutIntelligence.summary.highOpportunity || 0);
      const averageFanoutMentionRate = Number(fanoutIntelligence.summary.averageMentionRate || 0);
      const queryFanoutActionsForLaunchReport = (optimizations as any[]).filter((log: any) => String(log.actionType || '').startsWith('query_fanout:'));
      const draftedFanoutActions = queryFanoutActionsForLaunchReport.filter((log: any) => ['draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const publishedFanoutArtifacts = (await storage.getAxpPagesByBrand(brandId).catch(() => []))
        .filter((page: any) => String(page.status || '').toLowerCase() === 'published')
        .filter((page: any) => {
          const title = String(page.title || '').toLowerCase();
          const keywords = Array.isArray(page.targetKeywords) ? page.targetKeywords.map((keyword: any) => String(keyword || '').toLowerCase()) : [];
          return title.includes('ai search brief') || keywords.includes('query fanout');
        }).length;
      const fanoutDraftCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((draftedFanoutActions / highOpportunityFanouts) * 100)) : 0;
      const fanoutPublishCoverage = highOpportunityFanouts > 0 ? Math.min(100, Math.round((publishedFanoutArtifacts / highOpportunityFanouts) * 100)) : 0;
      const agentScore = Number((agentReport as any)?.score || 0);
      const productScore = Number(productReadiness?.score || 0);
      const visibilityScore = Number((latestScore as any)?.overallScore || 0);
      const crawlerVisits = Number(crawlerStats?.totalVisits || crawlerStats?.summary?.totalVisits || 0);
      const aiReferralSessions = Number(attribution?.aiReferralSessions || attribution?.totalReferrals || 0);
      const aiReferralConversions = Number(attribution?.aiReferralConversions || attribution?.totalConversions || 0);
      const aiAttributedRevenue = Number(attribution?.aiAttributedRevenue || attribution?.attributedRevenue || 0);
      const attributionDataComplete = Boolean(attribution?.dataComplete);
      const attributionStatus =
        attributionDataComplete && (aiReferralSessions > 0 || aiReferralConversions > 0 || aiAttributedRevenue > 0) ? 'ready' :
        crawlerVisits > 0 || attributionDataComplete ? 'partial' :
        'blocked';
      const attributionEvidence = `${crawlerVisits} crawler visits, ${aiReferralSessions} AI referrals, ${aiReferralConversions} conversions, $${Math.round(aiAttributedRevenue).toLocaleString()} attributed revenue${attributionDataComplete ? '' : '; GA4/ecommerce data incomplete'}`;
      const plannedActions = (optimizations as any[]).filter((log: any) => ['pending', 'draft', 'applied', 'verified'].includes(String(log.status || '').toLowerCase())).length;
      const appliedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'applied').length;
      const verifiedActions = (optimizations as any[]).filter((log: any) => String(log.status || '').toLowerCase() === 'verified').length;
      const verifiedProofTasks = verificationTasks.filter((task: any) => task.status === 'verified').length;
      const pendingVerification = verificationTasks.filter((task: any) => task.status === 'pending').length;
      const failedAgentChecks = Array.isArray((agentReport as any)?.checks)
        ? (agentReport as any).checks.filter((check: any) => !check.passed).length
        : Number((agentReport as any)?.topIssues?.length || 0);
      const productRelevant = Boolean(productReadiness?.relevant);
      const freshEnterpriseProviders = providerSummary?.freshEnterpriseProviders || [];
      const failedEnterpriseProviders = providerSummary?.failedEnterpriseProviders || [];
      const enterpriseProviderStatus =
        freshEnterpriseProviders.length >= 4 && failedEnterpriseProviders.length === 0 ? 'ready' :
        freshEnterpriseProviders.length > 0 ? 'partial' :
        'blocked';

      const gates = [
        { label: 'Enterprise provider coverage', weight: 14, status: enterpriseProviderStatus, evidence: `${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh; ${failedEnterpriseProviders.length} provider${failedEnterpriseProviders.length === 1 ? '' : 's'} failing`, action: 'Fix provider billing, key, quota, or plan access, rerun Enterprise pilot sweep, and confirm at least four providers have fresh successful answers.' },
        { label: 'Prompt coverage', weight: 14, status: promptCount >= 25 ? 'ready' : promptCount > 0 ? 'partial' : 'blocked', evidence: `${promptCount} tracked prompts`, action: 'Track at least 25 prompts across buyer, competitor, product, trust, and support intents.' },
        { label: 'Visibility baseline', weight: 12, status: visibilityScore >= 60 ? 'ready' : visibilityScore > 0 ? 'partial' : 'blocked', evidence: `${visibilityScore}/100 latest visibility score`, action: 'Run fresh model sampling and establish a baseline score before launch reporting.' },
        { label: 'Source and citation depth', weight: 12, status: sourceDomains >= 10 && citedUrls >= 10 ? 'ready' : sourceDomains > 0 || citedUrls > 0 ? 'partial' : 'blocked', evidence: `${sourceDomains} source domains and ${citedUrls} cited URLs`, action: 'Build URL-level cited-source coverage and pursue sources already cited for the category.' },
        { label: 'Query fanout readiness', weight: 8, status: fanoutQueryCount >= 100 && highOpportunityFanouts > 0 && publishedFanoutArtifacts >= highOpportunityFanouts ? 'ready' : fanoutQueryCount > 0 ? 'partial' : 'blocked', evidence: `${fanoutQueryCount} fanout queries, ${highOpportunityFanouts} high-opportunity prompts, ${draftedFanoutActions} fanout drafts, ${publishedFanoutArtifacts} published AXP artifacts, ${averageFanoutMentionRate}% average mention rate`, action: highOpportunityFanouts > 0 && fanoutPublishCoverage >= 80 ? 'Rerun prompts, extract citations, and verify whether published fanout artifacts move mentions, sources, or visibility.' : highOpportunityFanouts > 0 && fanoutDraftCoverage >= 80 ? 'Publish drafted AXP briefs, deploy FAQ/schema blocks, then rerun prompts and citation extraction for proof.' : 'Turn high-opportunity fanouts into content briefs, proof blocks, comparison sections, FAQ/schema, and cited-source targets before launch reporting.' },
        { label: 'Competitive share of voice', weight: 10, status: competitors.length > 0 && competitorMentions > 0 ? 'ready' : competitors.length > 0 ? 'partial' : 'blocked', evidence: `${brandMentions} brand mentions vs ${competitorMentions} competitor mentions`, action: 'Add real competitors and sample comparison prompts where they win.' },
        { label: 'Agent readiness', weight: 14, status: agentScore >= 75 && failedAgentChecks === 0 ? 'ready' : agentScore > 0 ? 'partial' : 'blocked', evidence: `${agentScore}/100 agent score, ${failedAgentChecks} failed checks`, action: 'Fix schema, llms.txt, entity, crawlability, and content issues, then rerun Agent Readiness.' },
        { label: 'Product readiness', weight: productRelevant ? 12 : 0, status: !productRelevant ? 'ready' : productScore >= 70 ? 'ready' : productScore > 0 ? 'partial' : 'blocked', evidence: productRelevant ? `${productScore}/100 product score` : 'Not required for this non-product-led brand workflow', action: productRelevant ? 'Import priority SKUs, map competitor products, generate product prompts, and verify Product schema.' : 'Keep Product Readiness separate unless this brand is D2C, ecommerce, or Amazon seller-led.' },
        { label: 'Verified action workflow', weight: 12, status: (verifiedActions > 0 || verifiedProofTasks > 0) && pendingVerification === 0 ? 'ready' : plannedActions > 0 || appliedActions > 0 || pendingVerification > 0 || verifiedProofTasks > 0 ? 'partial' : 'blocked', evidence: `${plannedActions} planned, ${appliedActions} applied, ${verifiedActions} verified actions, ${verifiedProofTasks} verified proof tasks, ${pendingVerification} pending proof tasks`, action: pendingVerification > 0 ? 'Run verification checks for pending proof tasks before reporting impact.' : appliedActions > 0 ? 'Create or run proof tasks for applied work before reporting impact.' : 'Move a priority finding into implementation, then mark it applied so AIRank creates the proof task automatically.' },
        { label: 'AI attribution proof', weight: 8, status: attributionStatus, evidence: attributionEvidence, action: attributionStatus === 'ready' ? 'Use attribution proof in stakeholder reporting and keep GA4/ecommerce snapshots fresh.' : crawlerVisits > 0 ? 'Connect GA4/ecommerce conversion data so crawler and referral signals become revenue proof.' : 'Install Agent Analytics tracking and connect GA4/ecommerce revenue before claiming business impact.' },
        { label: 'Launch monitoring', weight: 6, status: pendingVerification === 0 && promptCount >= 25 ? 'ready' : 'partial', evidence: `${pendingVerification} pending verification tasks`, action: 'Keep alerts active for score drops, competitor overtakes, source gaps, crawler anomalies, and verification debt.' },
      ];
      const totalWeight = gates.reduce((sum, gate: any) => sum + Number(gate.weight || 0), 0);
      const earnedWeight = gates.reduce((sum, gate: any) => {
        if (gate.status === 'ready') return sum + Number(gate.weight || 0);
        if (gate.status === 'partial') return sum + Math.round(Number(gate.weight || 0) * 0.55);
        return sum;
      }, 0);
      const score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      const verdict = score >= 80 && enterpriseProviderStatus === 'ready' && gates.every((gate: any) => gate.status !== 'blocked') ? 'Enterprise pilot ready' : score >= 60 ? 'Pilot ready with gaps' : 'Needs launch hardening';
      const nextActions = gates.filter((gate: any) => gate.status !== 'ready').slice(0, 6);
      const generatedAt = new Date().toISOString();
      const productReadinessMetric = productRelevant
        ? `${productScore}/100`
        : 'Not applicable - Product Readiness is inactive for this non-product-led brand';
      const markdown = [
        `# Launch Readiness Report: ${brand.name}`,
        '',
        `Domain: ${brand.domain}`,
        `Generated: ${generatedAt}`,
        `Verdict: ${verdict}`,
        `Launch readiness score: ${score}/100`,
        '',
        '## Executive Summary',
        `${brand.name} is currently ${verdict.toLowerCase()} with ${gates.filter((gate: any) => gate.status === 'blocked').length} blocked launch gates and ${nextActions.length} priority next actions.`,
        '',
        '## Gate Scorecard',
        ...gates.map((gate: any) => `- ${gate.label}: ${String(gate.status).toUpperCase()} - ${gate.evidence}`),
        '',
        '## Priority Next Actions',
        ...(nextActions.length ? nextActions.map((gate: any, index: number) => `${index + 1}. ${gate.action} (${gate.label}: ${gate.evidence})`) : ['All launch gates are ready. Keep weekly monitoring active.']),
        '',
        '## Launch Trend Monitor',
        `Verdict: ${launchTrend.verdict}`,
        `Visibility movement: ${launchTrend.currentScore}/100 now vs ${launchTrend.previousScore}/100 previous (${launchTrend.scoreDelta >= 0 ? '+' : ''}${launchTrend.scoreDelta}, ${launchTrend.scoreDirection})`,
        `Enterprise provider trend: ${launchTrend.providerTrend.freshEnterpriseProviders}/${launchTrend.providerTrend.enterpriseTargetProviders} fresh, ${launchTrend.providerTrend.failedEnterpriseProviders} failing`,
        `Proof workflow: ${launchTrend.workflowTrend.plannedActions} planned, ${launchTrend.workflowTrend.appliedActions} applied, ${launchTrend.workflowTrend.verifiedActions} verified, ${launchTrend.workflowTrend.pendingProofTasks} pending proof tasks`,
        `Scan reliability: ${launchTrend.scanTrend.completedJobs}/${launchTrend.scanTrend.scanJobs} completed, ${launchTrend.scanTrend.failedJobs} failed, ${launchTrend.scanTrend.failureRate}% failure rate`,
        `Historical confidence: ${launchTrend.historicalConfidence.score}/100 (${launchTrend.historicalConfidence.status}) - ${launchTrend.historicalConfidence.evidence}`,
        `Trend blockers: ${launchTrend.blockers.length ? launchTrend.blockers.join('; ') : 'None'}`,
        '',
        '## Launch Trend Next Actions',
        ...(launchTrend.nextActions.length ? launchTrend.nextActions.map((action: string, index: number) => `${index + 1}. ${action}`) : ['Trend is healthy. Keep weekly sampling, proof checks, and provider monitoring active.']),
        '',
        '## AI Attribution Proof',
        `Status: ${String(attributionStatus).toUpperCase()}`,
        `Crawler visits: ${crawlerVisits}`,
        `AI referral sessions: ${aiReferralSessions}`,
        `AI referral conversions: ${aiReferralConversions}`,
        `AI attributed revenue: $${Math.round(aiAttributedRevenue).toLocaleString()}`,
        `Data completeness: ${attributionDataComplete ? 'complete' : 'incomplete'}`,
        `Next action: ${attributionStatus === 'ready' ? 'Use attribution proof in stakeholder reporting and keep snapshots fresh.' : attribution?.message || 'Connect Agent Analytics, GA4, and ecommerce revenue before claiming AI-search business impact.'}`,
        '',
        '## Metrics',
        `- Prompts tracked: ${promptCount}`,
        `- Fresh enterprise providers: ${freshEnterpriseProviders.length}/${CORE_SCAN_PROVIDERS.length}`,
        `- Failed enterprise providers: ${failedEnterpriseProviders.length}`,
        `- Latest visibility score: ${visibilityScore}/100`,
        `- Source domains / cited URLs: ${sourceDomains} / ${citedUrls}`,
        `- Query fanouts: ${fanoutQueryCount}`,
        `- High-opportunity fanouts: ${highOpportunityFanouts}`,
        `- Fanout average mention rate: ${averageFanoutMentionRate}%`,
        `- Brand vs competitor mentions: ${brandMentions}:${competitorMentions}`,
        `- Agent readiness: ${agentScore}/100`,
        `- Product readiness: ${productReadinessMetric}`,
        `- Verified actions: ${verifiedActions}`,
        `- Pending verification tasks: ${pendingVerification}`,
        `- AI crawler visits: ${crawlerVisits}`,
        `- AI referral sessions: ${aiReferralSessions}`,
        `- AI referral conversions: ${aiReferralConversions}`,
        `- AI attributed revenue: $${Math.round(aiAttributedRevenue).toLocaleString()}`,
      ].join('\n');

      const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brand.name)} Launch Readiness Report</title><style>body{font-family:Inter,Arial,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.gate{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.ready{border-color:#86efac}.partial{border-color:#fcd34d}.blocked{border-color:#fca5a5}</style></head><body>${markdown.split('\n').map((line) => {
        if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
        if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
        if (line.startsWith('- ')) return `<p>${escapeHtml(line)}</p>`;
        if (/^\d+\./.test(line)) return `<p>${escapeHtml(line)}</p>`;
        return line ? `<p>${escapeHtml(line)}</p>` : '';
      }).join('\n')}</body></html>`;

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict,
        gates,
        nextActions,
        metrics: {
          promptCount,
          visibilityScore,
          sourceDomains,
          citedUrls,
          brandMentions,
          competitorMentions,
          agentScore,
          productRelevant,
          productScore,
          productReadinessMetric,
          appliedActions,
          verifiedActions,
          pendingVerification,
          crawlerVisits,
          aiReferralSessions,
          aiReferralConversions,
          aiAttributedRevenue,
          attributionDataComplete,
          attributionStatus,
          attributionMessage: attribution?.message || null,
          enterpriseFreshProviders: freshEnterpriseProviders.length,
          enterpriseFailedProviders: failedEnterpriseProviders.length,
          fanoutQueryCount,
          highOpportunityFanouts,
          averageFanoutMentionRate,
          launchTrend,
        },
        markdown,
        html,
        filenameBase: `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-launch-readiness`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[LaunchReadinessReport] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/report/preview - Preview report data without generating PDF
  app.get("/api/brands/:brandId/report/preview", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const visibilityScore = await storage.getLatestVisibilityScore(req.params.brandId);
      const topics = await storage.getTopicsByBrand(req.params.brandId);
      const competitors = await storage.getCompetitors(req.params.brandId);

      res.json({
        brandName: brand.name,
        domain: brand.domain,
        overallScore: visibilityScore?.overallScore || 0,
        previousScore: visibilityScore?.previousScore || 0,
        scoreDelta: (visibilityScore?.overallScore || 0) - (visibilityScore?.previousScore || 0),
        competitorCount: competitors.length,
        topicCount: topics.length,
        totalMentions: visibilityScore?.totalMentions || 0,
        topTopics: (topics as any[]).slice(0, 5).map(t => ({
        name: t.name,
        score: t.visibilityScore || 0,
        position: t.position || 10,
      })),
      competitors: (competitors as any[]).slice(0, 5).map(c => ({
        name: c.name,
        score: c.score || 0,
      })),
    });
    } catch (error: any) {
      console.error('[PDFGenerator] Preview failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= WHITE-LABEL ROUTES (Phase 3.2) =============

  // GET /api/admin/whitelabel/config - Get white-label configuration
  app.get("/api/admin/whitelabel/config", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { getWhiteLabelService } = await import('./services/whitelabel');
      const service = getWhiteLabelService();
      const config = await service.getAgencyConfig('');

      const isEnabled = await service.isWhiteLabelEnabled();

      res.json({
        enabled: isEnabled,
        config: config || {
          agencyName: '',
          primaryColor: '#2563EB',
          secondaryColor: '#1E40AF',
        },
      });
    } catch (error: any) {
      console.error('[WhiteLabel] Config fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/admin/whitelabel/config - Update white-label configuration
  app.put("/api/admin/whitelabel/config", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { enabled, ...config } = req.body;

      const { getWhiteLabelService } = await import('./services/whitelabel');
      const service = getWhiteLabelService();

      if (enabled !== undefined) {
        await service.toggleWhiteLabel(enabled, userId);
      }

      if (config.agencyName) {
        await service.setAgencyConfig(config, userId);
      }

      const updatedConfig = await service.getAgencyConfig('');

      res.json({ success: true, config: updatedConfig, enabled });
    } catch (error: any) {
      console.error('[WhiteLabel] Config update failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/whitelabel/theme - Get theme for white-label branding
  app.get("/api/brands/:brandId/whitelabel/theme", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const whiteLabelAccess = await resolveFeatureAccess(req.params.brandId, 'white_label_reports');
      if (!whiteLabelAccess.allowed) {
        return res.json({
          isWhiteLabel: false,
          theme: null,
          locked: true,
          upgradeRequired: true,
          feature: 'white_label_reports',
        });
      }

      const { getWhiteLabelService } = await import('./services/whitelabel');
      const service = getWhiteLabelService();
      const config = await service.getAgencyConfig(userId);

      if (!config) {
        return res.json({ isWhiteLabel: false, theme: null });
      }

      const theme = service.getThemeColors(config);

      res.json({
        isWhiteLabel: true,
        theme: {
          primary: theme.primary,
          secondary: theme.secondary,
          logoUrl: config.agencyLogoUrl,
          agencyName: config.agencyName,
          websiteUrl: config.websiteUrl,
        },
      });
    } catch (error: any) {
      console.error('[WhiteLabel] Theme fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= GEO vs SEO DUAL SCORING (Phase 3.3) =============

  // GET /api/brands/:brandId/seo-score - Calculate SEO score for brand
  app.get("/api/brands/:brandId/seo-score", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getSEOScorer } = await import('./services/seo-scorer');
      const scorer = getSEOScorer();
      const seoScore = await scorer.getBrandSEOScore(req.params.brandId);

      res.json(seoScore);
    } catch (error: any) {
      console.error('[SEOScorer] Score calculation failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/geo-seo-comparison - Compare GEO vs SEO scores
  app.get("/api/brands/:brandId/geo-seo-comparison", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const [visibilityScore, seoScoreResult] = await Promise.all([
        storage.getLatestVisibilityScore(req.params.brandId),
        (async () => {
          const { getSEOScorer } = await import('./services/seo-scorer');
          const scorer = getSEOScorer();
          return scorer.getBrandSEOScore(req.params.brandId);
        })(),
      ]);

      const { getSEOScorer } = await import('./services/seo-scorer');
      const scorer = getSEOScorer();
      const comparison = scorer.compareGEOSEO(
        visibilityScore?.overallScore || 0,
        seoScoreResult.score
      );

      res.json({
        ...comparison,
        seoBreakdown: seoScoreResult.breakdown,
        seoRecommendations: seoScoreResult.recommendations,
        seoGrade: seoScoreResult.grade,
      });
    } catch (error: any) {
      console.error('[SEOScorer] Comparison failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= CRAWLER TRACKING (Phase 3.4) =============

  // GET /api/brands/:brandId/crawler-stats - Get crawler statistics
  app.get("/api/brands/:brandId/crawler-stats", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getCrawlerTracker } = await import('./services/crawler-tracker');
      const tracker = getCrawlerTracker();
      const stats = await tracker.getCrawlerStats(req.params.brandId);

      res.json(stats);
    } catch (error: any) {
      console.error('[CrawlerTracker] Stats fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/attribution - Get attribution report
  app.get("/api/brands/:brandId/attribution", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const periodDays = parseInt(req.query.period as string) || 30;

      const { getCrawlerTracker } = await import('./services/crawler-tracker');
      const tracker = getCrawlerTracker();
      const report = await tracker.analyzeAttribution(req.params.brandId, periodDays);

      res.json(report);
    } catch (error: any) {
      console.error('[CrawlerTracker] Attribution analysis failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/attribution/manual-evidence", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const sessions = Math.max(0, Math.round(Number(req.body?.aiReferralSessions || req.body?.sessions || 0)));
      const conversions = Math.max(0, Math.round(Number(req.body?.aiReferralConversions || req.body?.conversions || 0)));
      const revenue = Math.max(0, Math.round(Number(req.body?.aiAttributedRevenue || req.body?.revenue || 0) * 100) / 100);
      const brandedImpressions = Math.max(0, Math.round(Number(req.body?.brandedImpressions || 0)));
      const brandedClicks = Math.max(0, Math.round(Number(req.body?.brandedClicks || 0)));
      const proofUrl = req.body?.proofUrl ? String(req.body.proofUrl).slice(0, 500) : null;
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 1000) : null;
      const landingPage = req.body?.landingPage ? String(req.body.landingPage).slice(0, 500) : '/';
      const sourceEngine = String(req.body?.sourceEngine || 'manual').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'manual';

      if (sessions === 0 && conversions === 0 && revenue === 0 && brandedImpressions === 0 && brandedClicks === 0) {
        return res.status(400).json({ message: "Record at least one attribution metric before saving evidence." });
      }

      const end = req.body?.periodEnd ? new Date(req.body.periodEnd) : new Date();
      const periodDays = Math.max(1, Math.min(365, Math.round(Number(req.body?.periodDays || 30))));
      const start = new Date(end);
      start.setDate(start.getDate() - periodDays);

      const byEngine = {
        [sourceEngine]: { sessions, conversions, revenue },
      };
      const topLandingPages = [{
        page: landingPage,
        sessions,
        conversions,
        proofUrl,
        notes,
        recordedBy: userId,
        recordedAt: new Date().toISOString(),
      }];

      const snapshot = await storage.createAttributionSnapshot({
        brandId: brand.id,
        periodStart: start,
        periodEnd: end,
        source: 'manual_evidence',
        aiReferralSessions: sessions,
        aiReferralConversions: conversions,
        aiAttributedRevenue: revenue,
        brandedImpressions,
        brandedClicks,
        byEngine: byEngine as any,
        topLandingPages: topLandingPages as any,
        dataComplete: true,
      } as any);

      await createAuditLog(req, "manual_attribution_evidence", "brand", brand.id, null, {
        sessions,
        conversions,
        revenue,
        brandedImpressions,
        brandedClicks,
        proofUrl,
      });

      res.json({
        snapshot,
        message: "Manual attribution evidence recorded. Production readiness will use it until automated GA4 attribution is available.",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= CRAWLER ANALYTICS INGEST (Epic B) =============

  // POST /api/ingest/crawler/:token - Public batched crawler-hit ingest (per-brand token)
  app.post("/api/ingest/crawler/:token", async (req: any, res) => {
    try {
      const { getRateLimitService } = await import('./services/rate-limiter');
      const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown').toString().trim();
      const rl = getRateLimitService().check(`crawler-ingest:${ip}`, { requestsPerMinute: 120, requestsPerHour: 3000, requestsPerDay: 50000, burstLimit: 60 });
      if (!rl.allowed) return res.status(429).json({ message: 'Rate limit exceeded' });

      const brand = await storage.getBrandByCrawlerToken(qstr(req.params.token));
      if (!brand) return res.status(401).json({ message: 'Invalid ingest token' });

      const hits = Array.isArray(req.body?.hits) ? req.body.hits : (Array.isArray(req.body) ? req.body : []);
      if (hits.length === 0) return res.status(400).json({ message: 'No hits provided' });
      if (hits.length > 1000) return res.status(413).json({ message: 'Batch too large (max 1000 hits)' });

      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('crawler_log_ingest', { brandId: brand.id, hits } as any, 3);
      res.json({ accepted: hits.length, jobId });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // GET /api/ingest/crawler/:token/pixel.gif - Public 1x1 crawler tracking pixel
  app.get("/api/ingest/crawler/:token/pixel.gif", async (req: any, res) => {
    const transparentGif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
    const sendPixel = () => {
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).send(transparentGif);
    };

    try {
      const { getRateLimitService } = await import('./services/rate-limiter');
      const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown').toString().trim();
      const rl = getRateLimitService().check(`crawler-pixel:${ip}`, { requestsPerMinute: 300, requestsPerHour: 5000, requestsPerDay: 100000, burstLimit: 120 });
      if (!rl.allowed) return sendPixel();

      const brand = await storage.getBrandByCrawlerToken(qstr(req.params.token));
      if (!brand) return sendPixel();

      const { detectBot, verifyBotIp } = await import('./services/bot-detection');
      const userAgent = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : String(req.headers['user-agent'] || '');
      const detection = detectBot(userAgent);
      if (detection) {
        const forwardedProto = Array.isArray(req.headers['x-forwarded-proto']) ? req.headers['x-forwarded-proto'][0] : String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
        const forwardedHost = Array.isArray(req.headers['x-forwarded-host']) ? req.headers['x-forwarded-host'][0] : String(req.headers['x-forwarded-host'] || req.headers.host || '');
        const rawPath = qstr(req.query.p || req.query.path || '/');
        const rawUrl = qstr(req.query.u || req.query.url || '');
        const pathValue = rawPath || (rawUrl ? (() => {
          try { return new URL(rawUrl).pathname || '/'; } catch { return '/'; }
        })() : '/');
        const verified = await verifyBotIp(ip, detection.botName).catch(() => false);
        await storage.createCrawlerLog({
          brandId: brand.id,
          botName: detection.botName,
          botCategory: detection.category,
          engine: detection.engine,
          verified,
          ipAddress: ip,
          userAgent,
          path: pathValue.slice(0, 2048),
          statusCode: 200,
          method: 'GET',
          referrer: qstr(req.query.r || req.headers.referer || '').slice(0, 2048),
          visitedAt: req.query.t ? new Date(qstr(req.query.t)) : new Date(),
        } as any);
        logger.info(`[CrawlerPixel] brand=${brand.id} bot=${detection.botName} verified=${verified} path=${pathValue} host=${forwardedProto}://${forwardedHost}`);
      }

      return sendPixel();
    } catch (error: any) {
      logger.warn(`[CrawlerPixel] Failed to record pixel hit: ${error?.message || error}`);
      return sendPixel();
    }
  });

  // POST /api/brands/:brandId/crawler-token - Generate/rotate the ingest token
  app.post("/api/brands/:brandId/crawler-token", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const { randomBytes } = await import('crypto');
      const token = `gsc_${randomBytes(24).toString('hex')}`;
      await storage.updateBrand(req.params.brandId, { crawlerIngestToken: token } as any);
      await createAuditLog(req, "rotate", "crawler_ingest_token", req.params.brandId);
      const base = process.env.APP_URL || '';
      res.json({
        token,
        ingestUrl: `${base}/api/ingest/crawler/${token}`,
        pixelUrl: `${base}/api/ingest/crawler/${token}/pixel.gif`,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/crawler-test-hit - Verify Agent Analytics ingestion pipeline
  app.post("/api/brands/:brandId/crawler-test-hit", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const path = '/__airank-agent-test';
      const userAgent = 'GPTBot/1.0 (+https://openai.com/gptbot; AIRank install verification)';
      await storage.createCrawlerLog({
        brandId: req.params.brandId,
        botName: 'GPTBot',
        botCategory: 'search',
        engine: 'chatgpt',
        verified: false,
        ipAddress: req.ip || null,
        userAgent,
        path,
        statusCode: 200,
        method: 'GET',
        referrer: 'airank-install-test',
        visitedAt: new Date(),
      } as any);

      const { getCrawlerTracker } = await import('./services/crawler-tracker');
      const stats = await getCrawlerTracker().getCrawlerStats(req.params.brandId, 30);
      await createAuditLog(req, "verify", "crawler_ingest_pipeline", req.params.brandId);
      res.json({
        success: true,
        message: "Agent Analytics test hit recorded. Real crawler visits will appear after installing the snippet on the site.",
        testHit: { botName: 'GPTBot', engine: 'chatgpt', path, verified: false },
        stats,
      });
    } catch (error: any) {
      console.error('[CrawlerTracker] Test hit failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/crawler-analytics - Verified AI-crawler stats (Epic B)
  app.get("/api/brands/:brandId/crawler-analytics", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const sinceDays = req.query.period ? parseInt(qstr(req.query.period), 10) : 30;
      const { getCrawlerTracker } = await import('./services/crawler-tracker');
      const stats = await getCrawlerTracker().getCrawlerStats(req.params.brandId, sinceDays);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/agent-benchmark - Profound-style agent/citation benchmark
  app.get("/api/brands/:brandId/agent-benchmark", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const brandId = req.params.brandId;
      const periodDays = req.query.period ? parseInt(qstr(req.query.period), 10) : 30;
      const [
        competitors,
        answers,
        mentions,
        sources,
        crawlerStats,
        attribution,
      ] = await Promise.all([
        storage.getCompetitorsByBrand(brandId).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 1000).catch(() => []),
        storage.getAnswerMentionsByBrand(brandId, 2000).catch(() => []),
        storage.getSourcesByBrand(brandId).catch(() => []),
        (async () => {
          const { getCrawlerTracker } = await import('./services/crawler-tracker');
          return getCrawlerTracker().getCrawlerStats(brandId, periodDays);
        })(),
        (async () => {
          const { getCrawlerTracker } = await import('./services/crawler-tracker');
          return getCrawlerTracker().analyzeAttribution(brandId, periodDays);
        })(),
      ]);

      const answerIds = new Set((answers as any[]).map((answer: any) => answer.id));
      const scopedMentions = (mentions as any[]).filter((mention: any) => answerIds.size === 0 || answerIds.has(mention.llmAnswerId));
      const competitorIds = new Set((competitors as any[]).map((competitor: any) => competitor.id));
      const brandMentions = scopedMentions.filter((mention: any) => !mention.isCompetitor && !mention.competitorId);
      const competitorMentions = scopedMentions.filter((mention: any) => mention.isCompetitor || competitorIds.has(mention.competitorId));
      const totalEntityMentions = brandMentions.length + competitorMentions.length;
      const brandMentionShare = totalEntityMentions ? Math.round((brandMentions.length / totalEntityMentions) * 100) : 0;
      const competitorMentionShare = totalEntityMentions ? Math.round((competitorMentions.length / totalEntityMentions) * 100) : 0;

      const competitorRowsByName = new Map<string, { id: string; name: string; mentions: number; share: number }>();
      (competitors as any[]).forEach((competitor: any) => {
        const count = scopedMentions.filter((mention: any) =>
          mention.competitorId === competitor.id ||
          String(mention.entityName || '').toLowerCase() === String(competitor.name || '').toLowerCase()
        ).length;
        const nameKey = String(competitor.name || competitor.id).trim().toLowerCase();
        const current = competitorRowsByName.get(nameKey);
        const row = {
          id: competitor.id,
          name: competitor.name,
          mentions: count,
          share: totalEntityMentions ? Math.round((count / totalEntityMentions) * 100) : 0,
        };
        if (!current || row.mentions > current.mentions) competitorRowsByName.set(nameKey, row);
      });
      const competitorRows = Array.from(competitorRowsByName.values()).sort((a, b) => b.mentions - a.mentions);

      const topCompetitor = competitorRows[0] || null;
      const sourceDomains = new Set((sources as any[]).map((source: any) => source.domain).filter(Boolean));
      const citedUrls = new Set((sources as any[]).map((source: any) => source.url).filter(Boolean));
      const brandDomain = (brand.website || brand.url || '').replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
      const ownedSources = (sources as any[]).filter((source: any) => brandDomain && String(source.domain || '').includes(brandDomain));
      const thirdPartySources = (sources as any[]).filter((source: any) => !brandDomain || !String(source.domain || '').includes(brandDomain));
      const totalCitations = (sources as any[]).reduce((sum: number, source: any) => sum + Number(source.mentions || 1), 0);
      const ownedCitationShare = totalCitations
        ? Math.round((ownedSources.reduce((sum: number, source: any) => sum + Number(source.mentions || 1), 0) / totalCitations) * 100)
        : 0;
      const averageCitationAuthority = (sources as any[]).length
        ? Math.round((sources as any[]).reduce((sum: number, source: any) => sum + Number(source.domainAuthority || 0), 0) / (sources as any[]).length)
        : 0;

      const crawlerVisits = Number((crawlerStats as any)?.totalVisits || 0);
      const verifiedVisits = Number((crawlerStats as any)?.verifiedVisits || 0);
      const activeBots = Object.values((crawlerStats as any)?.byBot || {}).filter((count: any) => Number(count) > 0).length;
      const attributionReady = Boolean((attribution as any)?.dataComplete);
      const attributionRevenue = Number((attribution as any)?.attributedRevenue || 0);
      const attributionConversions = Number((attribution as any)?.totalConversions || 0);

      const crawlerScore = Math.min(100, Math.round(
        (crawlerVisits > 0 ? 35 : 0) +
        (verifiedVisits > 0 ? 25 : 0) +
        (activeBots >= 2 ? 15 : activeBots > 0 ? 8 : 0) +
        (attributionReady ? 25 : 0)
      ));
      const citationScore = Math.min(100, Math.round(
        Math.min(sourceDomains.size, 10) * 5 +
        Math.min(citedUrls.size, 20) * 1.5 +
        Math.min(averageCitationAuthority, 80) * 0.25
      ));
      const shareScore = Math.min(100, Math.round(
        brandMentionShare * 0.8 +
        (topCompetitor ? Math.max(0, 20 - Math.max(0, topCompetitor.share - brandMentionShare)) : 20)
      ));
      const benchmarkScore = Math.round((crawlerScore * 0.35) + (citationScore * 0.3) + (shareScore * 0.35));

      const actions = [
        crawlerVisits === 0 ? {
          priority: 'high',
          title: 'Install AI crawler ingestion',
          detail: 'Add the Agent Analytics snippet to the site so ChatGPT, Claude, Perplexity, Gemini, and other AI bot visits become measurable.',
          route: '/app/agent-analytics',
        } : null,
        verifiedVisits === 0 && crawlerVisits > 0 ? {
          priority: 'medium',
          title: 'Verify bot identity',
          detail: 'Enable reverse-DNS or signature verification so crawler reports separate real AI agents from generic traffic.',
          route: '/app/agent-analytics',
        } : null,
        !attributionReady ? {
          priority: 'high',
          title: 'Connect conversion attribution',
          detail: 'Connect GA4/GSC so AI referrals, conversions, and revenue can be tied back to visibility work.',
          route: '/app/integrations',
        } : null,
        sourceDomains.size < 10 ? {
          priority: 'medium',
          title: 'Expand cited source footprint',
          detail: `Only ${sourceDomains.size} cited domains are tracked. Build citations on third-party articles, reviews, listings, and comparison pages.`,
          route: '/app/sources',
        } : null,
        brandMentionShare < 40 ? {
          priority: 'high',
          title: 'Improve brand mention share',
          detail: `${brand.name} holds ${brandMentionShare}% of tracked entity mentions. Prioritize prompts and content where competitors are mentioned instead.`,
          route: '/app/action-plan',
        } : null,
      ].filter(Boolean);

      res.json({
        brandId,
        brandName: brand.name,
        periodDays,
        benchmarkScore,
        status: benchmarkScore >= 75 ? 'strong' : benchmarkScore >= 45 ? 'developing' : 'setup_required',
        crawler: {
          score: crawlerScore,
          visits: crawlerVisits,
          verifiedVisits,
          activeBots,
          lastVisit: (crawlerStats as any)?.lastVisit || null,
        },
        citations: {
          score: citationScore,
          domains: sourceDomains.size,
          citedUrls: citedUrls.size,
          totalCitations,
          ownedCitationShare,
          thirdPartySources: thirdPartySources.length,
          averageAuthority: averageCitationAuthority,
        },
        shareOfVoice: {
          score: shareScore,
          brandMentions: brandMentions.length,
          competitorMentions: competitorMentions.length,
          brandShare: brandMentionShare,
          competitorShare: competitorMentionShare,
          topCompetitor,
          competitors: competitorRows.slice(0, 5),
        },
        attribution: {
          ready: attributionReady,
          conversions: attributionConversions,
          revenue: attributionRevenue,
          message: (attribution as any)?.message || null,
        },
        actions,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= PROMPT INTELLIGENCE (Epic C1) =============

  // POST /api/brands/:brandId/mine-prompts - Mine & score real prompts from public sources
  app.post("/api/brands/:brandId/mine-prompts", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const { mineAndScorePrompts } = await import('./services/prompt-miner-real');
      const summary = await mineAndScorePrompts(req.params.brandId, qstr(req.body?.locale) || undefined);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/mined-prompts - List mined prompts (highest priority first)
  app.get("/api/brands/:brandId/mined-prompts", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const limit = req.query.limit ? parseInt(qstr(req.query.limit), 10) : 200;
      const prompts = await storage.getMinedPromptsByBrand(req.params.brandId, limit);
      res.json(prompts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/mined-prompts/:minedId/promote - Promote a mined prompt to a tracked prompt
  app.post("/api/brands/:brandId/mined-prompts/:minedId/promote", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const mined = await storage.getMinedPrompt(qstr(req.params.minedId));
      if (!mined || mined.brandId !== req.params.brandId) return res.status(404).json({ message: "Mined prompt not found" });

      const prompt = await storage.createPrompt({
        brandId: req.params.brandId,
        text: mined.query,
        category: mined.intentType,
        priorityScore: Math.round(mined.priorityScore),
      } as any);
      await storage.updateMinedPrompt(mined.id, { status: 'promoted', promotedPromptId: prompt.id } as any);
      await createAuditLog(req, "promote", "mined_prompt", mined.id, null, { promptId: prompt.id });
      res.json({ success: true, prompt });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/mined-prompts/:minedId/dismiss - Dismiss a mined prompt
  app.post("/api/brands/:brandId/mined-prompts/:minedId/dismiss", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      await storage.updateMinedPrompt(qstr(req.params.minedId), { status: 'dismissed' } as any);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= SOCIAL CITATIONS (Epic G) =============

  // GET /api/brands/:brandId/social-citations - List Reddit/YouTube citations
  app.get("/api/brands/:brandId/social-citations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const platform = req.query.platform ? qstr(req.query.platform) : undefined;
      const limit = req.query.limit ? parseInt(qstr(req.query.limit), 10) : 200;
      const citations = await storage.getSocialCitationsByBrand(req.params.brandId, platform, limit);
      res.json(citations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/social-citations/refresh - Discover new citations now
  app.post("/api/brands/:brandId/social-citations/refresh", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('social_citation_enrich', { brandId: req.params.brandId } as any, 5);
      res.json({ success: true, jobId });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= MULTI-LANGUAGE / REGION (Epic F) =============

  // GET /api/brands/:brandId/locales - List tracked locales
  app.get("/api/brands/:brandId/locales", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const locales = await storage.getBrandLocales(req.params.brandId);
      res.json(locales);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/locales - Add a locale (gated by plan maxLocales)
  app.post("/api/brands/:brandId/locales", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const { locale, language, region, label, isPrimary } = req.body || {};
      if (!locale || !language) return res.status(400).json({ message: "locale and language are required" });

      const existing = await storage.getBrandLocales(req.params.brandId);
      const plan = brand.tier ? await storage.getPlanCapability(brand.tier) : undefined;
      const maxLocales = (plan as any)?.maxLocales ?? 1;
      if (maxLocales !== -1 && existing.length >= maxLocales) {
        return res.status(403).json({ message: `Your plan allows up to ${maxLocales} locale(s). Upgrade to track more regions.` });
      }
      if (existing.some((l) => l.locale === locale)) {
        return res.status(409).json({ message: "Locale already tracked" });
      }

      const created = await storage.createBrandLocale({
        brandId: req.params.brandId,
        locale,
        language,
        region: region || null,
        label: label || null,
        isPrimary: !!isPrimary || existing.length === 0,
        isActive: true,
      } as any);
      await createAuditLog(req, "create", "brand_locale", created.id, null, created);
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // DELETE /api/brands/:brandId/locales/:localeId - Remove a locale
  app.delete("/api/brands/:brandId/locales/:localeId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      await storage.deleteBrandLocale(qstr(req.params.localeId));
      await createAuditLog(req, "delete", "brand_locale", req.params.localeId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= AGENCY / WHITE-LABEL (Epic J) =============

  // Returns true if the user has any brand on a plan with white-label/custom-branding enabled.
  async function userHasWhitelabel(userId: string): Promise<boolean> {
    const userBrands = await storage.getBrandsByUserId(userId);
    const tiers = Array.from(new Set(userBrands.map((b) => b.tier).filter(Boolean))) as string[];
    for (const tier of tiers) {
      const plan = await storage.getPlanCapability(tier);
      if (plan && ((plan as any).whitelabelEnabled || (plan as any).customBranding)) return true;
    }
    return false;
  }

  // GET /api/agency - Get the current user's agency (white-label settings + clients)
  app.get("/api/agency", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const agency = await storage.getAgencyByOwner(userId);
      if (!agency) return res.json(null);
      const clients = await storage.getAgencyClients(agency.id);
      res.json({ ...agency, clients });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/agency - Create or update the current user's agency white-label settings
  app.post("/api/agency", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!(await userHasWhitelabel(userId))) {
        return res.status(403).json({ message: "White-label/agency features require a plan with white-label enabled." });
      }
      const fields = {
        name: req.body?.name,
        slug: req.body?.slug ?? null,
        logoUrl: req.body?.logoUrl ?? null,
        faviconUrl: req.body?.faviconUrl ?? null,
        primaryColor: req.body?.primaryColor ?? null,
        secondaryColor: req.body?.secondaryColor ?? null,
        customDomain: req.body?.customDomain ?? null,
        supportEmail: req.body?.supportEmail ?? null,
        emailFromName: req.body?.emailFromName ?? null,
        hidePoweredBy: !!req.body?.hidePoweredBy,
      };
      const existing = await storage.getAgencyByOwner(userId);
      let agency: any;
      if (existing) {
        agency = await storage.updateAgency(existing.id, fields as any);
      } else {
        if (!fields.name) return res.status(400).json({ message: "name is required" });
        agency = await storage.createAgency({ ownerUserId: userId, ...fields } as any);
      }
      await createAuditLog(req, existing ? "update" : "create", "agency", agency.id, null, agency);
      res.json(agency);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // GET /api/agency/clients - List linked client brands
  app.get("/api/agency/clients", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const agency = await storage.getAgencyByOwner(userId);
      if (!agency) return res.json([]);
      const clients = await storage.getAgencyClients(agency.id);
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/agency/clients - Link a brand as an agency client
  app.post("/api/agency/clients", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const agency = await storage.getAgencyByOwner(userId);
      if (!agency) return res.status(400).json({ message: "Create your agency profile first." });

      const { brandId, clientName, clientContactEmail } = req.body || {};
      if (!brandId) return res.status(400).json({ message: "brandId is required" });
      const brand = await storage.getBrand(brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const existing = await storage.getAgencyClients(agency.id);
      if (existing.some((c) => c.brandId === brandId)) {
        return res.status(409).json({ message: "Brand already linked" });
      }
      const client = await storage.addAgencyClient({
        agencyId: agency.id,
        brandId,
        clientName: clientName || brand.name,
        clientContactEmail: clientContactEmail || null,
      } as any);
      await createAuditLog(req, "create", "agency_client", client.id, null, client);
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // DELETE /api/agency/clients/:clientId - Unlink a client brand
  app.delete("/api/agency/clients/:clientId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const agency = await storage.getAgencyByOwner(userId);
      if (!agency) return res.status(404).json({ message: "Agency not found" });
      const client = await storage.getAgencyClient(qstr(req.params.clientId));
      if (!client || client.agencyId !== agency.id) return res.status(404).json({ message: "Client not found" });
      await storage.removeAgencyClient(client.id);
      await createAuditLog(req, "delete", "agency_client", client.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // GET /api/whitelabel/resolve?domain=... - Public branding lookup for white-label domains
  app.get("/api/whitelabel/resolve", async (req: any, res) => {
    try {
      const domain = req.query.domain ? qstr(req.query.domain) : '';
      if (!domain) return res.json(null);
      const agency = await storage.getAgencyByDomain(domain);
      if (!agency) return res.json(null);
      res.json({
        name: agency.name,
        logoUrl: agency.logoUrl,
        faviconUrl: agency.faviconUrl,
        primaryColor: agency.primaryColor,
        secondaryColor: agency.secondaryColor,
        hidePoweredBy: agency.hidePoweredBy,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= BROWSER SAMPLING (Epic A) =============

  // POST /api/brands/:brandId/browser-sampling - Sample top-N prompts via real browser sessions
  app.post("/api/brands/:brandId/browser-sampling", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const topN = req.body?.topN ? parseInt(String(req.body.topN), 10) : 5;
      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('browser_sampling', { brandId: req.params.brandId, topN } as any, 5);
      res.json({ success: true, jobId });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/browser-samples - List recent browser samples
  app.get("/api/brands/:brandId/browser-samples", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const limit = req.query.limit ? parseInt(qstr(req.query.limit), 10) : 100;
      const samples = await storage.getBrowserSamplesByBrand(req.params.brandId, limit);
      res.json(samples);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= EXECUTION AGENTS + CMS (Epic D) =============

  async function brandExecutionEnabled(brand: any): Promise<boolean> {
    if (!brand?.id) return false;
    const access = await resolveFeatureAccess(brand.id, 'admin_assisted_execution');
    return access.allowed;
  }

  // CMS connections
  app.get("/api/brands/:brandId/cms-connections", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const conns = await storage.getCmsConnectionsByBrand(req.params.brandId);
      // Never leak raw credentials back to the client.
      res.json(conns.map((c) => ({ id: c.id, platform: c.platform, name: c.name, status: c.status, lastError: c.lastError, createdAt: c.createdAt })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/cms-connections", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });

      const { platform, name, config } = req.body || {};
      if (!['wordpress', 'webflow', 'shopify'].includes(platform)) {
        return res.status(400).json({ message: "platform must be wordpress, webflow, or shopify" });
      }
      if (!config || typeof config !== 'object') return res.status(400).json({ message: "config object is required" });

      const conn = await storage.createCmsConnection({ brandId: req.params.brandId, platform, name: name || platform, config, status: 'active' } as any);
      await createAuditLog(req, "create", "cms_connection", conn.id, null, { platform });
      res.json({ id: conn.id, platform: conn.platform, name: conn.name, status: conn.status });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/brands/:brandId/cms-connections/:connId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const conn = await storage.getCmsConnection(qstr(req.params.connId));
      if (!conn || conn.brandId !== req.params.brandId) return res.status(404).json({ message: "Connection not found" });
      await storage.deleteCmsConnection(conn.id);
      await createAuditLog(req, "delete", "cms_connection", conn.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Agent tasks
  app.get("/api/brands/:brandId/agent-tasks", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const tasks = await storage.getAgentTasksByBrand(req.params.brandId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create a task and generate its draft artifact synchronously
  app.post("/api/brands/:brandId/agent-tasks", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      if (!(await brandExecutionEnabled(brand))) {
        return res.status(403).json({ message: "Execution agents are not enabled on this plan." });
      }

      const { agentType, title, input, targetConnectionId } = req.body || {};
      if (!['content', 'schema', 'outreach'].includes(agentType)) {
        return res.status(400).json({ message: "agentType must be content, schema, or outreach" });
      }

      let task = await storage.createAgentTask({
        brandId: req.params.brandId,
        agentType,
        title: title || null,
        status: 'draft',
        input: input || {},
        targetConnectionId: targetConnectionId || null,
        createdBy: userId,
      } as any);

      try {
        const { generateAgentOutput } = await import('./services/execution-agents');
        const output = await generateAgentOutput(task);
        task = await storage.updateAgentTask(task.id, { output, title: task.title || (output as any).title || null } as any);
      } catch (genErr: any) {
        task = await storage.updateAgentTask(task.id, { status: 'failed', error: genErr.message } as any);
      }
      await createAuditLog(req, "create", "agent_task", task.id, null, { agentType });
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/agent-tasks/:taskId/approve", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const task = await storage.getAgentTask(qstr(req.params.taskId));
      if (!task || task.brandId !== req.params.brandId) return res.status(404).json({ message: "Task not found" });
      const updated = await storage.updateAgentTask(task.id, { status: 'approved', approvedBy: userId } as any);
      await createAuditLog(req, "approve", "agent_task", task.id);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Execute an approved task (publishes content/schema to CMS when targeted)
  app.post("/api/brands/:brandId/agent-tasks/:taskId/execute", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      if (!(await brandExecutionEnabled(brand))) {
        return res.status(403).json({ message: "Execution agents are not enabled on this plan." });
      }
      const task = await storage.getAgentTask(qstr(req.params.taskId));
      if (!task || task.brandId !== req.params.brandId) return res.status(404).json({ message: "Task not found" });
      if (task.status !== 'approved') return res.status(400).json({ message: "Task must be approved before execution" });

      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('agent_execution', { taskId: task.id } as any, 3);
      await createAuditLog(req, "execute", "agent_task", task.id);
      res.json({ success: true, jobId });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= HALLUCINATION / ACCURACY CORRECTION (Epic H) =============

  // GET /api/brands/:brandId/fact-claims - List detected/flagged claims
  app.get("/api/brands/:brandId/fact-claims", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const status = req.query.status ? qstr(req.query.status) : undefined;
      const claims = await storage.getFactClaimsByBrand(req.params.brandId, status);
      res.json(claims);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/fact-claims/detect - Run LLM fact-check over recent answers
  app.post("/api/brands/:brandId/fact-claims/detect", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const { detectHallucinations } = await import('./services/hallucination-detector');
      const limit = req.body?.answerLimit ? parseInt(String(req.body.answerLimit), 10) : 15;
      const summary = await detectHallucinations(req.params.brandId, limit);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/fact-claims - Manually flag a claim
  app.post("/api/brands/:brandId/fact-claims", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const { claim, engine, severity, correctValue, explanation } = req.body || {};
      if (!claim) return res.status(400).json({ message: "claim is required" });
      const created = await storage.createFactClaim({
        brandId: req.params.brandId,
        claim,
        engine: engine || null,
        accuracy: 'inaccurate',
        severity: ['low', 'medium', 'high'].includes(severity) ? severity : 'medium',
        correctValue: correctValue || null,
        explanation: explanation || null,
        status: 'open',
      } as any);
      await createAuditLog(req, "create", "fact_claim", created.id, null, { claim });
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // PATCH /api/brands/:brandId/fact-claims/:claimId - Update status/correction
  app.patch("/api/brands/:brandId/fact-claims/:claimId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const claim = await storage.getFactClaim(qstr(req.params.claimId));
      if (!claim || claim.brandId !== req.params.brandId) return res.status(404).json({ message: "Claim not found" });

      const updates: any = {};
      for (const f of ['accuracy', 'severity', 'correctValue', 'explanation', 'status']) {
        if (req.body?.[f] !== undefined) updates[f] = req.body[f];
      }
      if (updates.status === 'resolved') updates.resolvedAt = new Date();
      const updated = await storage.updateFactClaim(claim.id, updates);
      await createAuditLog(req, "update", "fact_claim", claim.id, claim, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/fact-claims/:claimId/correction - Spin up a correction content task
  app.post("/api/brands/:brandId/fact-claims/:claimId/correction", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const claim = await storage.getFactClaim(qstr(req.params.claimId));
      if (!claim || claim.brandId !== req.params.brandId) return res.status(404).json({ message: "Claim not found" });

      const task = await storage.createAgentTask({
        brandId: req.params.brandId,
        agentType: 'content',
        title: `Correction: ${claim.claim.slice(0, 80)}`,
        status: 'draft',
        input: {
          topic: `Set the record straight: ${claim.claim}`,
          correctValue: claim.correctValue,
          context: claim.explanation,
        },
        createdBy: userId,
      } as any);
      const updated = await storage.updateFactClaim(claim.id, { status: 'correcting', correctionTaskId: task.id } as any);
      await createAuditLog(req, "create", "fact_claim_correction", claim.id, null, { taskId: task.id });
      res.json({ claim: updated, task });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= PROMPT VOLUME SCORING (Epic C2) =============

  // POST /api/brands/:brandId/prompt-volume/score - Score prompt volumes from demand signals
  app.post("/api/brands/:brandId/prompt-volume/score", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const { scorePromptVolumes } = await import('./services/prompt-volume');
      const result = await scorePromptVolumes(req.params.brandId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= AGGREGATE DATASET (Epic O) =============

  // PUT /api/brands/:brandId/aggregate-optin - Toggle aggregate dataset contribution
  app.put("/api/brands/:brandId/aggregate-optin", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const optIn = !!req.body?.optIn;
      const updated = await storage.updateBrand(req.params.brandId, { contributesToAggregate: optIn } as any);
      await createAuditLog(req, "update", "brand_aggregate_optin", req.params.brandId, { optIn: brand.contributesToAggregate }, { optIn });
      res.json({ success: true, contributesToAggregate: (updated as any).contributesToAggregate });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // GET /api/aggregate-dataset - k-anonymized aggregate market dataset (opt-in contributors)
  app.get("/api/aggregate-dataset", requireAuth, async (req: any, res) => {
    try {
      const minContributors = req.query.k ? parseInt(qstr(req.query.k), 10) : 5;
      const dataset = await storage.getAggregateDataset(Math.max(5, minContributors));
      res.json(dataset);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/admin/aggregate-dataset/rebuild - Rebuild the aggregate dataset (admin)
  app.post("/api/admin/aggregate-dataset/rebuild", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { rebuildAggregateDataset } = await import('./services/prompt-volume');
      const result = await rebuildAggregateDataset(qstr(req.body?.region) || 'IN');
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= PUBLIC API KEY MANAGEMENT (Epic L) =============

  // GET /api/api-keys - List the current user's API keys (no secrets)
  app.get("/api/api-keys", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const keys = await storage.getApiKeysByUser(userId);
      res.json(keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, status: k.status, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/api-keys - Create a new API key (secret returned once)
  app.post("/api/api-keys", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name, scopes } = req.body || {};
      if (!name) return res.status(400).json({ message: "name is required" });
      const apiBrands = await getApiAccessibleBrands(userId);
      if (!apiBrands.length) {
        return res.status(403).json({
          message: "API access is not available on your current plan.",
          feature: "api_access",
          upgradeRequired: true,
        });
      }
      const { raw, prefix, keyHash } = generateApiKey();
      const created = await storage.createApiKey({
        userId,
        name,
        prefix,
        keyHash,
        scopes: Array.isArray(scopes) ? scopes : ['read:brands', 'read:visibility'],
        status: 'active',
      } as any);
      await createAuditLog(req, "create", "api_key", created.id, null, { name });
      // The raw secret is only ever returned here.
      res.json({ id: created.id, name: created.name, prefix: created.prefix, key: raw });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // DELETE /api/api-keys/:id - Revoke an API key
  app.delete("/api/api-keys/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const key = await storage.getApiKey(qstr(req.params.id));
      if (!key || key.userId !== userId) return res.status(404).json({ message: "API key not found" });
      await storage.revokeApiKey(key.id);
      await createAuditLog(req, "revoke", "api_key", key.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= WEBHOOK SUBSCRIPTIONS (Epic L — Zapier/Make REST hooks) =============

  // GET /api/v1/me - Verify API key (Zapier/Make authentication test)
  app.get("/api/v1/me", requireApiKey, async (req: any, res) => {
    res.json({ id: req.apiUser.id, email: req.apiUser.email, name: req.apiUser.name ?? null });
  });

  // GET /api/v1/brands - List brands accessible to the API key owner
  app.get("/api/v1/brands", requireApiKey, async (req: any, res) => {
    try {
      const brandsForUser = Array.isArray(req.apiBrands) ? req.apiBrands : await getApiAccessibleBrands(req.apiUserId);
      res.json(brandsForUser.map((b: any) => ({ id: b.id, name: b.name, domain: b.domain, industry: b.industry, visibilityScore: b.visibilityScore })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/brands/:brandId/visibility - Latest + historical visibility
  app.get("/api/v1/brands/:brandId/visibility", requireApiKey, async (req: any, res) => {
    try {
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== req.apiUserId) return res.status(404).json({ error: "Brand not found" });
      const access = await resolveFeatureAccess(brand.id, 'api_access');
      if (!access.allowed) return res.status(403).json({ error: "API access is not enabled for this brand" });
      const latest = await storage.getLatestVisibilityScore(req.params.brandId);
      const history = await storage.getVisibilityScoresByBrand(req.params.brandId, undefined, 30);
      res.json({ brandId: brand.id, latest, history });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/triggers/visibility - Polling trigger feed for Zapier/Make
  app.get("/api/v1/triggers/visibility", requireApiKey, async (req: any, res) => {
    try {
      const brandsForUser = Array.isArray(req.apiBrands) ? req.apiBrands : await getApiAccessibleBrands(req.apiUserId);
      const out: any[] = [];
      for (const b of brandsForUser.slice(0, 25)) {
        const latest = await storage.getLatestVisibilityScore(b.id);
        if (latest) out.push({ id: `${b.id}:${latest.id}`, brandId: b.id, brandName: b.name, score: latest.overallScore, period: latest.period, createdAt: latest.createdAt });
      }
      res.json(out);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/hooks - Subscribe a webhook (Zapier/Make REST Hook subscribe)
  app.post("/api/v1/hooks", requireApiKey, async (req: any, res) => {
    try {
      const { targetUrl, event, brandId, source, secret } = req.body || {};
      const url = targetUrl || req.body?.hookUrl; // Zapier sends hookUrl
      if (!url) return res.status(400).json({ error: "targetUrl (or hookUrl) is required" });
      const ev = event || 'alert.triggered';
      if (!['alert.triggered', 'visibility.updated', 'citation.discovered'].includes(ev)) {
        return res.status(400).json({ error: "Unsupported event" });
      }
      if (brandId) {
        const brand = await storage.getBrand(brandId);
        if (!brand || brand.userId !== req.apiUserId) return res.status(404).json({ error: "Brand not found" });
        const access = await resolveFeatureAccess(brand.id, 'api_access');
        if (!access.allowed) return res.status(403).json({ error: "API access is not enabled for this brand" });
      }
      const sub = await storage.createWebhookSubscription({
        userId: req.apiUserId,
        brandId: brandId || null,
        event: ev,
        targetUrl: url,
        source: source || 'zapier',
        secret: secret || null,
        isActive: true,
      } as any);
      res.json({ id: sub.id, event: sub.event, targetUrl: sub.targetUrl });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // DELETE /api/v1/hooks/:id - Unsubscribe a webhook
  app.delete("/api/v1/hooks/:id", requireApiKey, async (req: any, res) => {
    try {
      const sub = await storage.getWebhookSubscription(qstr(req.params.id));
      if (!sub || sub.userId !== req.apiUserId) return res.status(404).json({ error: "Subscription not found" });
      await storage.deleteWebhookSubscription(sub.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/v1/hooks - List the API key owner's webhook subscriptions
  app.get("/api/v1/hooks", requireApiKey, async (req: any, res) => {
    try {
      const subs = await storage.getWebhookSubscriptionsByUser(req.apiUserId);
      res.json(subs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/brands/:brandId/attribution/history - Persisted attribution snapshots (Epic E)
  app.get("/api/brands/:brandId/attribution/history", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const limit = req.query.limit ? parseInt(qstr(req.query.limit), 10) : 30;
      const snapshots = await storage.getAttributionSnapshotsByBrand(req.params.brandId, limit);
      res.json(snapshots);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/crawler-visit - Log a crawler visit
  app.post("/api/brands/:brandId/crawler-visit", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { crawlerType, pagesCrawled, dataShared } = req.body;

      const { getCrawlerTracker } = await import('./services/crawler-tracker');
      const tracker = getCrawlerTracker();

      await tracker.trackVisit({
        brandId: req.params.brandId,
        crawlerType: crawlerType || 'other',
        timestamp: new Date(),
        pagesCrawled: pagesCrawled || [],
        dataShared: dataShared || [],
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[CrawlerTracker] Track visit failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= REPORT SCHEDULER (Phase 3.5) =============

  // GET /api/brands/:brandId/report-schedules - List report schedules
  app.get("/api/brands/:brandId/report-schedules", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();
      const schedules = await scheduler.getSchedules(req.params.brandId);

      res.json(schedules);
    } catch (error: any) {
      console.error('[ReportScheduler] List failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/report-schedules - Create report schedule
  app.post("/api/brands/:brandId/report-schedules", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { frequency, dayOfWeek, dayOfMonth, time, reportType, recipients } = req.body;

      if (!frequency || !time || !reportType || !recipients?.length) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const allowedReportTypes = new Set(['executive', 'full', 'action', 'ai_search_opportunity', 'launch_readiness', 'competitive_parity', 'market_opportunity', 'verification_evidence', 'scan_operations', 'production_readiness', 'product_visibility']);
      if (!allowedReportTypes.has(String(reportType))) {
        return res.status(400).json({ message: "Unsupported report type" });
      }

      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();

      const schedule = await scheduler.createSchedule({
        brandId: req.params.brandId,
        frequency,
        dayOfWeek,
        dayOfMonth,
        time,
        reportType,
        recipients,
        isActive: true,
      });

      res.json(schedule);
    } catch (error: any) {
      console.error('[ReportScheduler] Create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/report-schedules/defaults - Create launch-ready reporting cadence with dedupe
  app.post("/api/brands/:brandId/report-schedules/defaults", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const user = await storage.getUser(userId).catch(() => undefined);
      const recipients = Array.isArray(req.body?.recipients)
        ? req.body.recipients.map((item: any) => String(item || '').trim()).filter(Boolean)
        : String(req.body?.recipients || '')
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean);
      const finalRecipients = recipients.length ? recipients : [String((user as any)?.email || '').trim()].filter(Boolean);
      if (!finalRecipients.length) {
        return res.status(400).json({ message: "At least one recipient email is required." });
      }

      const time = String(req.body?.time || '09:00');
      const defaults = [
        { reportType: 'production_readiness', frequency: 'weekly', dayOfWeek: 1, time },
        { reportType: 'verification_evidence', frequency: 'weekly', dayOfWeek: 3, time },
        { reportType: 'competitive_parity', frequency: 'monthly', dayOfMonth: 1, time },
      ];
      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();
      const existing = await scheduler.getSchedules(req.params.brandId);
      const existingTypes = new Set((existing as any[])
        .filter((schedule: any) => schedule.isActive !== false)
        .map((schedule: any) => String(schedule.reportType || '')));

      const created = [];
      const reused = [];
      for (const schedule of defaults) {
        if (existingTypes.has(schedule.reportType)) {
          reused.push(schedule.reportType);
          continue;
        }
        const createdSchedule = await scheduler.createSchedule({
          brandId: req.params.brandId,
          frequency: schedule.frequency as 'weekly' | 'monthly',
          dayOfWeek: schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth,
          time: schedule.time,
          reportType: schedule.reportType as any,
          recipients: finalRecipients,
          isActive: true,
        });
        created.push(createdSchedule);
        existingTypes.add(schedule.reportType);
      }

      res.json({
        created,
        reused,
        recipients: finalRecipients,
        message: created.length
          ? `${created.length} default launch report schedule${created.length === 1 ? '' : 's'} created.`
          : 'Default launch report schedules already exist.',
      });
    } catch (error: any) {
      console.error('[ReportScheduler] Defaults create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/brands/:brandId/report-schedules/:scheduleId - Update schedule
  app.put("/api/brands/:brandId/report-schedules/:scheduleId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();

      const updated = await scheduler.updateSchedule(req.params.scheduleId, req.body);

      if (!updated) {
        return res.status(404).json({ message: "Schedule not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error('[ReportScheduler] Update failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/brands/:brandId/report-schedules/:scheduleId - Delete schedule
  app.delete("/api/brands/:brandId/report-schedules/:scheduleId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();

      await scheduler.deleteSchedule(req.params.scheduleId);

      res.json({ success: true });
    } catch (error: any) {
      console.error('[ReportScheduler] Delete failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/report-schedules/:scheduleId/trigger - Manually trigger schedule
  app.post("/api/brands/:brandId/report-schedules/:scheduleId/trigger", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getReportScheduler } = await import('./services/scheduler');
      const scheduler = getReportScheduler();

      await scheduler.executeSchedule(req.params.scheduleId);

      res.json({ success: true, message: "Report sent successfully" });
    } catch (error: any) {
      console.error('[ReportScheduler] Trigger failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ALERT RULES (Epic K) =============

  // GET /api/brands/:brandId/alert-rules - List alert rules
  app.get("/api/brands/:brandId/alert-rules", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const rules = await storage.getAlertRulesByBrand(req.params.brandId);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/alert-rules - Create alert rule
  app.post("/api/brands/:brandId/alert-rules", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const data = insertAlertRuleSchema.parse({ ...req.body, brandId: req.params.brandId });
      const rule = await storage.createAlertRule(data);
      await createAuditLog(req, "create", "alert_rule", rule.id, null, rule);
      res.json(rule);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/alert-rules/defaults - Create launch monitoring defaults
  app.post("/api/brands/:brandId/alert-rules/defaults", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const destination = String(req.body?.destination || (brand as any).contactEmail || '').trim();
      const channel = String(req.body?.channel || 'email').trim() || 'email';
      if (!destination) {
        return res.status(400).json({ message: "Alert destination is required" });
      }

      const defaultRules = [
        {
          name: "Visibility score drops by 5 points",
          metric: "score_drop",
          comparator: "drop",
          threshold: 5,
          cooldownMinutes: 360,
          metadata: { launchDefault: true, category: "visibility", route: "/app/prompts" },
        },
        {
          name: "Competitor overtakes share of voice",
          metric: "competitor_overtake",
          comparator: "gt",
          threshold: 0,
          cooldownMinutes: 360,
          metadata: { launchDefault: true, category: "competitive", route: "/app/competitors" },
        },
        {
          name: "Citation/source depth falls below launch floor",
          metric: "source_depth",
          comparator: "lt",
          threshold: 5,
          cooldownMinutes: 720,
          metadata: { launchDefault: true, category: "citation", route: "/app/sources" },
        },
        {
          name: "AI crawler anomaly detected",
          metric: "crawler_anomaly",
          comparator: "any",
          threshold: 1,
          cooldownMinutes: 720,
          metadata: { launchDefault: true, category: "agent_analytics", route: "/app/agent-analytics" },
        },
        {
          name: "Verification debt is pending",
          metric: "verification_debt",
          comparator: "gt",
          threshold: 0,
          cooldownMinutes: 360,
          metadata: { launchDefault: true, category: "workflow", route: "/app/action-plan" },
        },
        {
          name: "Prompt coverage below enterprise floor",
          metric: "prompt_coverage",
          comparator: "lt",
          threshold: 25,
          cooldownMinutes: 720,
          metadata: { launchDefault: true, category: "prompt_intelligence", route: "/app/prompts" },
        },
      ];

      const existingRules = await storage.getAlertRulesByBrand(req.params.brandId);
      const existingMetrics = new Set(existingRules.map((rule: any) => String(rule.metric || '')));
      const created = [];

      for (const rule of defaultRules) {
        if (existingMetrics.has(rule.metric)) continue;
        const data = insertAlertRuleSchema.parse({
          ...rule,
          brandId: req.params.brandId,
          channel,
          destination,
          isActive: true,
        });
        created.push(await storage.createAlertRule(data));
        existingMetrics.add(rule.metric);
      }

      await createAuditLog(req, "create_defaults", "alert_rule", req.params.brandId, null, { created: created.length });
      res.json({
        created,
        createdCount: created.length,
        existingCount: defaultRules.length - created.length,
        requiredMetrics: defaultRules.map((rule) => rule.metric),
        message: created.length ? "Launch monitoring default rules created." : "Launch monitoring defaults already exist.",
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // PATCH /api/brands/:brandId/alert-rules/:ruleId - Update alert rule
  app.patch("/api/brands/:brandId/alert-rules/:ruleId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const rule = await storage.getAlertRule(req.params.ruleId);
      if (!rule || rule.brandId !== req.params.brandId) {
        return res.status(404).json({ message: "Alert rule not found" });
      }
      const updated = await storage.updateAlertRule(req.params.ruleId, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // DELETE /api/brands/:brandId/alert-rules/:ruleId - Delete alert rule
  app.delete("/api/brands/:brandId/alert-rules/:ruleId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const rule = await storage.getAlertRule(req.params.ruleId);
      if (!rule || rule.brandId !== req.params.brandId) {
        return res.status(404).json({ message: "Alert rule not found" });
      }
      await storage.deleteAlertRule(req.params.ruleId);
      await createAuditLog(req, "delete", "alert_rule", req.params.ruleId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/alert-events - Recent alert events
  app.get("/api/brands/:brandId/alert-events", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const limit = req.query.limit ? parseInt(qstr(req.query.limit), 10) : 50;
      const events = await storage.getAlertEventsByBrand(req.params.brandId, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/alert-rules/:ruleId/test - Evaluate rules now
  app.post("/api/brands/:brandId/alert-rules/test", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('alert_evaluation', { brandId: req.params.brandId } as any, 6);
      res.json({ success: true, jobId });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/admin/invoices/:invoiceId/refund — issue Razorpay refund
  app.post("/api/admin/invoices/:invoiceId/refund", requireAuth, requireAdmin, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(qstr(req.params.invoiceId));
      if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
      if (invoice.status === 'refunded') return res.status(400).json({ message: 'Already refunded' });

      // Find the associated payment with a Razorpay payment ID
      const pmts = await storage.getPaymentsByBrand(invoice.brandId);
      const payment = pmts.find(p => p.invoiceId === invoice.id && p.razorpayPaymentId);
      if (!payment?.razorpayPaymentId) return res.status(400).json({ message: 'No Razorpay payment found for this invoice' });

      const { getRazorpayClient } = await import('./services/subscription');
      const razorpay = getRazorpayClient();
      const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: invoice.amount,
        notes: { reason: req.body.reason || 'admin_refund', invoice_id: invoice.id },
      });

      await storage.refundPayment(payment.razorpayPaymentId, refund.id);
      await storage.updateInvoice(invoice.id, { status: 'refunded' });

      res.json({ success: true, refundId: refund.id });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/admin/brands/:brandId/score-override — set or clear manual score
  app.patch("/api/admin/brands/:brandId/score-override", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { scoreOverride, competitorOverrides } = req.body as {
        scoreOverride: number | null;
        competitorOverrides: Record<string, number> | null;
      };
      await storage.setScoreOverride(qstr(req.params.brandId), scoreOverride ?? null, competitorOverrides ?? null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: BRAND CONTEXT =============

  app.get("/api/admin/brands/:brandId/context", requireAuth, requireAdmin, async (req, res) => {
    try {
      const context = await storage.getBrandContext(qstr(req.params.brandId));
      res.json(context ?? null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/brands/:brandId/context", requireAuth, requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getBrandContext(qstr(req.params.brandId));
      if (existing) {
        const updated = await storage.updateBrandContext(existing.id, req.body);
        res.json(updated);
      } else {
        const created = await storage.createBrandContext({ brandId: qstr(req.params.brandId), ...req.body });
        res.json(created);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: FAQ MANAGEMENT =============

  app.get("/api/admin/brands/:brandId/faqs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const faqs = await storage.getFaqEntriesByBrand(qstr(req.params.brandId));
      res.json(faqs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/brands/:brandId/faqs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const faq = await storage.createFaqEntry({ brandId: qstr(req.params.brandId), ...req.body });
      res.status(201).json(faq);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/faqs/:faqId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const faq = await storage.updateFaqEntry(qstr(req.params.faqId), req.body);
      res.json(faq);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/faqs/:faqId", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteFaqEntry(qstr(req.params.faqId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: SCHEMA TEMPLATE MANAGEMENT =============

  app.get("/api/admin/brands/:brandId/schema-templates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getSchemaTemplatesByBrand(qstr(req.params.brandId));
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/brands/:brandId/schema-templates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const template = await storage.createSchemaTemplate({ brandId: qstr(req.params.brandId), ...req.body });
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/schema-templates/:templateId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const template = await storage.updateSchemaTemplate(qstr(req.params.templateId), req.body);
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/schema-templates/:templateId", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteSchemaTemplate(qstr(req.params.templateId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: PROMPT RUNS WITH OUTPUTS =============

  app.get("/api/admin/brands/:brandId/prompt-runs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 200;
      const answers = await storage.getLlmAnswersByBrand(qstr(req.params.brandId), limit);
      const answerIds = answers.map(a => a.id);
      const mentions = answerIds.length > 0 ? await storage.getAnswerMentionsByAnswerIds(answerIds) : [];
      const citations = answerIds.length > 0 ? await storage.getAnswerCitationsByAnswerIds(answerIds) : [];
      const prompts = await storage.getPromptsByBrand(qstr(req.params.brandId));
      const promptMap = new Map(prompts.map(p => [p.id, p]));

      // Group answers by date (YYYY-MM-DD) as a proxy for "run"
      const groups: Record<string, {
        date: string;
        answers: Array<{
          answerId: string;
          promptText: string;
          llmProvider: string;
          llmModel: string;
          rawResponse: string;
          createdAt: string;
          mentions: Array<{ entityName: string | null; position: number | null; sentiment: string | null; isCompetitor: boolean }>;
          citationCount: number;
        }>;
      }> = {};

      for (const answer of answers) {
        const date = (answer.createdAt ?? new Date()).toISOString().slice(0, 10);
        if (!groups[date]) groups[date] = { date, answers: [] };
        const answerMentions = mentions
          .filter(m => m.llmAnswerId === answer.id)
          .map(m => ({
            entityName: m.entityName,
            position: m.position,
            sentiment: m.sentiment,
            isCompetitor: (m as any).isCompetitor ?? false,
          }));
        const citationCount = citations.filter(c => c.llmAnswerId === answer.id).length;
        const prompt = promptMap.get(answer.promptId);
        groups[date].answers.push({
          answerId: answer.id,
          promptText: prompt?.text ?? answer.promptId,
          llmProvider: answer.llmProvider,
          llmModel: answer.llmModel,
          rawResponse: answer.rawResponse,
          createdAt: (answer.createdAt ?? new Date()).toISOString(),
          mentions: answerMentions,
          citationCount,
        });
      }

      const result = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: TRIGGER GAP ANALYSIS =============

  app.post("/api/admin/brands/:brandId/trigger-gap-analysis", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { getJobQueue } = await import('./jobs');
      await getJobQueue().addJob('gap_analysis', { brandId: qstr(req.params.brandId) }, 1);
      res.json({ success: true, message: 'Gap analysis job queued' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= ADMIN: AXP MANAGEMENT =============

  app.get("/api/admin/axp", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = req.query.brandId as string;
      if (brandId) {
        const content = await storage.getAxpContentByBrand(brandId);
        return res.json(content);
      }
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/axp/:axpId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const oldContent = await storage.getAxpContent(req.params.axpId);
      const updated = await storage.updateAxpContent(req.params.axpId, req.body);
      await createAuditLog(req, "admin_update", "axp_content", req.params.axpId, oldContent, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/axp/:axpId/publish", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const oldContent = await storage.getAxpContent(req.params.axpId);
      const updated = await storage.updateAxpContent(req.params.axpId, {
        status: "published",
        publishedAt: new Date(),
        publishedBy: getUserId(req),
        version: (oldContent?.version || 0) + 1,
      });
      await createAuditLog(req, "publish", "axp_content", req.params.axpId, oldContent, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/admin/axp/:axpId/rollback", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const oldContent = await storage.getAxpContent(req.params.axpId);
      const updated = await storage.updateAxpContent(req.params.axpId, {
        status: "draft",
        publishedAt: null,
      });
      await createAuditLog(req, "rollback", "axp_content", req.params.axpId, oldContent, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= ADMIN: JOBS =============

  app.get("/api/admin/jobs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobs = await storage.getPendingJobs(100);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/jobs/:jobId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const updated = await storage.updateJob(req.params.jobId, req.body);
      await createAuditLog(req, "admin_update", "job", req.params.jobId, null, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= BRAND CONTEXT ROUTES =============

  app.get("/api/brands/:brandId/context", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const context = await storage.getBrandContext(req.params.brandId);
      res.json(context || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/context", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const existing = await storage.getBrandContext(req.params.brandId);
      if (existing) {
        const updated = await storage.updateBrandContext(existing.id, req.body);
        return res.json(updated);
      }

      const context = await storage.createBrandContext({
        ...req.body,
        brandId: req.params.brandId,
      });
      await createAuditLog(req, "create", "brand_context", context.id, null, context);
      res.json(context);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/brands/:brandId/context", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const context = await storage.getBrandContext(req.params.brandId);
      if (!context) {
        return res.status(404).json({ message: "Brand context not found" });
      }

      const updated = await storage.updateBrandContext(context.id, req.body);
      await createAuditLog(req, "update", "brand_context", context.id, context, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============= ANALYTICS ROUTES =============

  // LLM Answers
  app.get("/api/brands/:brandId/llm-answers", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, limit);
      res.json(answers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/prompts/:promptId/llm-answers", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const answers = await storage.getLlmAnswersByPrompt(qstr(req.params.promptId), limit);
      res.json(answers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Prompt Runs
  app.get("/api/brands/:brandId/prompt-runs", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const runs = await storage.getPromptRunsByBrand(req.params.brandId, limit);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Scan Operations Health
  app.get("/api/brands/:brandId/scan-health", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const planName = String((brand as any).tier || 'free');
      const expectedProviders = (PLAN_PROVIDERS[planName] || PLAN_PROVIDERS.free)
        .filter((provider) => provider !== 'openrouter');
      const [prompts, runs, answers, jobs, schedule, alertRules, alertEvents] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getPromptRunsByBrand(brandId, 2000).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 2000).catch(() => []),
        storage.getJobsByBrand(brandId, 100).catch(() => []),
        storage.getAnalysisSchedule(brandId).catch(() => undefined),
        storage.getAlertRulesByBrand(brandId).catch(() => []),
        storage.getAlertEventsByBrand(brandId, 50).catch(() => []),
      ]);

      const normalizeProvider = (value: unknown) => {
        const text = String(value || '').toLowerCase();
        if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
        if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
        if (text.includes('google') || text.includes('gemini')) return 'google';
        if (text.includes('perplexity')) return 'perplexity';
        if (text.includes('deepseek')) return 'deepseek';
        if (text.includes('grok')) return 'grok';
        if (text.includes('openrouter')) return 'openrouter';
        return text || 'unknown';
      };
      const newestDate = (items: any[], fields: string[]) => {
        let newest: Date | null = null;
        for (const item of items) {
          for (const field of fields) {
            const raw = item?.[field];
            if (!raw) continue;
            const date = new Date(raw);
            if (!Number.isNaN(date.getTime()) && (!newest || date > newest)) newest = date;
          }
        }
        return newest;
      };
      const ageHours = (date: Date | null) => date ? Math.round(((Date.now() - date.getTime()) / 36e5) * 10) / 10 : null;
      const statusFromAge = (hours: number | null, failedRuns: number, completedRuns: number, answerCount = 0) => {
        if (failedRuns > 0 && completedRuns === 0) return 'failed';
        if (completedRuns > 0 && answerCount === 0) return 'failed';
        if (hours == null) return 'not_sampled';
        if (hours <= 72) return 'fresh';
        if (hours <= 168) return 'stale';
        return 'expired';
      };
      const providerRecovery = (input: {
        provider: string;
        status: string;
        latestError?: string | null;
        failedRuns: number;
        answerlessCompletedRuns: number;
        runningRuns: number;
      }) => {
        const display = input.provider === 'openai' ? 'OpenAI'
          : input.provider === 'anthropic' ? 'Anthropic'
          : input.provider === 'google' ? 'Google'
          : input.provider === 'perplexity' ? 'Perplexity'
          : input.provider;
        const envHint = getProviderEnvHint(input.provider);
        const errorText = String(input.latestError || '').toLowerCase();
        const suspended = /suspended|disabled|permission denied|forbidden|unauthorized|invalid api|api key|quota|billing/.test(errorText);
        if (input.status === 'fresh') {
          return {
            severity: 'ok',
            cause: `${display} has fresh answer evidence.`,
            action: 'No recovery needed. Keep this provider in the scheduled scan rotation.',
            canRetry: false,
            envHint,
          };
        }
        if (input.runningRuns > 0) {
          return {
            severity: 'watch',
            cause: `${display} has ${input.runningRuns} queued or running scan job${input.runningRuns === 1 ? '' : 's'}.`,
            action: 'Wait for the current jobs to finish before queueing another provider sweep.',
            canRetry: false,
            envHint,
          };
        }
        if (input.status === 'failed' && suspended) {
          return {
            severity: 'blocked',
            cause: `${display} credential or account access is failing.`,
            action: `Renew or replace ${envHint || 'the provider API key'}, confirm billing/quota/API enablement, restart the worker, then queue a provider sweep.`,
            canRetry: false,
            envHint,
          };
        }
        if (input.status === 'failed' && input.answerlessCompletedRuns > 0) {
          return {
            severity: 'blocked',
            cause: `${display} completed runs without persisted answers.`,
            action: 'Inspect the sampling worker response parsing and persistence logs, then force a single-provider prompt run before the next full scan.',
            canRetry: true,
            envHint,
          };
        }
        if (input.status === 'failed') {
          return {
            severity: 'blocked',
            cause: `${display} scan jobs are failing.`,
            action: `Check ${envHint || 'provider credentials'}, rate limits, model name, and the latest redacted worker error before client reporting.`,
            canRetry: !input.latestError,
            envHint,
          };
        }
        if (input.status === 'not_sampled') {
          return {
            severity: 'missing',
            cause: `${display} has no answer evidence yet.`,
            action: 'Queue a provider sweep for high-intent prompts and confirm at least one answer is persisted.',
            canRetry: true,
            envHint,
          };
        }
        if (input.status === 'stale' || input.status === 'expired') {
          return {
            severity: input.status === 'expired' ? 'blocked' : 'watch',
            cause: `${display} evidence is ${input.status}.`,
            action: 'Queue a fresh provider sweep before exporting launch or competitive reports.',
            canRetry: true,
            envHint,
          };
        }
        return {
          severity: 'watch',
          cause: `${display} provider status needs review.`,
          action: 'Inspect recent scan runs and queue a provider-specific test if no fresh answer evidence appears.',
          canRetry: true,
          envHint,
        };
      };

      const buildProviderHealth = (provider: string) => {
        const providerRuns = runs.filter((run: any) => normalizeProvider(run.llmProvider) === provider);
        const providerAnswers = answers.filter((answer: any) => normalizeProvider(answer.llmProvider) === provider);
        const completedRuns = providerRuns.filter((run: any) => run.status === 'completed').length;
        const failedRuns = providerRuns.filter((run: any) => run.status === 'failed').length;
        const runningRuns = providerRuns.filter((run: any) => run.status === 'running' || run.status === 'pending').length;
        const latestError = providerRuns
          .filter((run: any) => run.error)
          .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())[0]?.error || null;
        const lastRunAt = newestDate(providerRuns, ['completedAt', 'startedAt', 'createdAt']);
        const lastAnswerAt = newestDate(providerAnswers, ['createdAt']);
        const hours = ageHours(lastAnswerAt);
        const status = statusFromAge(hours, failedRuns, completedRuns, providerAnswers.length);
        const answerlessCompletedRuns = completedRuns > 0 && providerAnswers.length === 0 ? completedRuns : 0;
        return {
          provider,
          status,
          lastRunAt: lastRunAt?.toISOString() || null,
          lastAnswerAt: lastAnswerAt?.toISOString() || null,
          ageHours: hours,
          completedRuns,
          failedRuns,
          runningRuns,
          totalAnswers: providerAnswers.length,
          answerlessCompletedRuns,
          latestError,
          recovery: providerRecovery({ provider, status, latestError, failedRuns, answerlessCompletedRuns, runningRuns }),
        };
      };

      const providerHealth = expectedProviders.map(buildProviderHealth);
      const enterpriseProviderHealth = CORE_SCAN_PROVIDERS.map(buildProviderHealth);

      const promptIdsWithRuns = new Set(runs.map((run: any) => run.promptId).filter(Boolean));
      const promptIdsWithFreshAnswers = new Set(
        answers
          .filter((answer: any) => {
            const created = answer.createdAt ? new Date(answer.createdAt) : null;
            return created && !Number.isNaN(created.getTime()) && (Date.now() - created.getTime()) <= 7 * 24 * 60 * 60 * 1000;
          })
          .map((answer: any) => answer.promptId)
          .filter(Boolean),
      );
      const totalPrompts = prompts.length;
      const promptsEverSampled = promptIdsWithRuns.size;
      const freshPromptCoverage = promptIdsWithFreshAnswers.size;
      const promptCoveragePct = totalPrompts ? Math.round((promptsEverSampled / totalPrompts) * 100) : 0;
      const freshCoveragePct = totalPrompts ? Math.round((freshPromptCoverage / totalPrompts) * 100) : 0;

      const jobSummary = {
        total: jobs.length,
        pending: jobs.filter((job: any) => job.status === 'pending').length,
        running: jobs.filter((job: any) => job.status === 'running').length,
        completed: jobs.filter((job: any) => job.status === 'completed').length,
        failed: jobs.filter((job: any) => job.status === 'failed').length,
        recent: jobs.slice(0, 10).map((job: any) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt,
          scheduledFor: job.scheduledFor,
          completedAt: job.completedAt,
          error: job.error,
        })),
      };

      let queueStats: any = null;
      try {
        const { getJobQueue } = await import('./jobs');
        queueStats = getJobQueue().getStats();
      } catch {
        queueStats = null;
      }

      const activeSchedule = Boolean(schedule?.isEnabled || brand.analysisEnabled);
      const lastScheduleRun = schedule?.lastRun || brand.lastAnalysis || null;
      const nextScheduleRun = schedule?.nextRun || brand.nextScheduledAnalysis || null;
      const nextRunAt = nextScheduleRun ? new Date(nextScheduleRun as any) : null;
      const overdueHours = nextRunAt && nextRunAt.getTime() < Date.now()
        ? Math.round(((Date.now() - nextRunAt.getTime()) / 36e5) * 10) / 10
        : 0;
      const freshProviders = providerHealth.filter((provider) => provider.status === 'fresh').length;
      const blockedProviders = providerHealth.filter((provider) => ['failed', 'not_sampled', 'expired'].includes(provider.status)).length;
      const configuredProviders = configuredProviderMap();
      const configuredCoreProviders = CORE_SCAN_PROVIDERS.filter((provider) => configuredProviders[provider]);
      const configuredButPlanLocked = configuredCoreProviders.filter((provider) => !expectedProviders.includes(provider));
      const missingForEnterprise = CORE_SCAN_PROVIDERS.filter((provider) => !configuredProviders[provider]);
      const enterpriseFreshProviders = enterpriseProviderHealth.filter((provider) => provider.status === 'fresh').map((provider) => provider.provider);
      const enterpriseBlockedProviders = enterpriseProviderHealth
        .filter((provider) => ['failed', 'not_sampled', 'expired'].includes(provider.status))
        .map((provider) => provider.provider);
      const enterpriseRecoveryPlan = enterpriseProviderHealth
        .filter((provider: any) => provider.recovery?.severity !== 'ok')
        .map((provider: any) => ({
          provider: provider.provider,
          status: provider.status,
          severity: provider.recovery.severity,
          cause: provider.recovery.cause,
          action: provider.recovery.action,
          canRetry: provider.recovery.canRetry,
          envHint: provider.recovery.envHint,
          latestError: provider.latestError,
          planLocked: !expectedProviders.includes(provider.provider),
        }));
      const brandDevData = (brand as any).brandDevData && typeof (brand as any).brandDevData === 'object'
        ? (brand as any).brandDevData
        : {};
      const providerPreflightRuns = Array.isArray((brandDevData as any).providerPreflightRuns)
        ? (brandDevData as any).providerPreflightRuns
        : [];
      const latestProviderPreflight = providerPreflightRuns[0] || null;
      const providerPreflight = latestProviderPreflight ? {
        id: latestProviderPreflight.id || null,
        startedAt: latestProviderPreflight.startedAt || null,
        finishedAt: latestProviderPreflight.finishedAt || null,
        ok: Boolean(latestProviderPreflight.ok),
        providers: Array.isArray(latestProviderPreflight.providers) ? latestProviderPreflight.providers : [],
        passed: Array.isArray(latestProviderPreflight.results)
          ? latestProviderPreflight.results.filter((result: any) => result?.ok).length
          : 0,
        failed: Array.isArray(latestProviderPreflight.results)
          ? latestProviderPreflight.results.filter((result: any) => !result?.ok).length
          : 0,
        results: Array.isArray(latestProviderPreflight.results)
          ? latestProviderPreflight.results.slice(0, 6).map((result: any) => ({
            provider: result?.provider || 'unknown',
            ok: Boolean(result?.ok),
            status: result?.status || (result?.ok ? 'ok' : 'failed'),
            message: result?.message || null,
            envHint: result?.envHint || null,
          }))
          : [],
      } : null;
      const schedulePenalty = !activeSchedule ? 30 : overdueHours > 24 ? 20 : overdueHours > 0 ? 10 : 0;
      const queuePenalty = jobSummary.failed > 0 ? Math.min(20, jobSummary.failed * 5) : 0;
      const score = Math.max(0, Math.min(100, Math.round(
        (freshProviders / expectedProviders.length) * 35 +
        freshCoveragePct * 0.35 +
        promptCoveragePct * 0.2 +
        (blockedProviders === 0 ? 10 : 0) -
        schedulePenalty -
        queuePenalty,
      )));

      const nextActions = [
        !activeSchedule ? 'Enable scheduled analysis for this brand.' : '',
        overdueHours > 0 ? `Scheduled analysis is overdue by ${overdueHours} hours; queue a full pipeline run.` : '',
        enterpriseFreshProviders.length < CORE_SCAN_PROVIDERS.length ? `Restore enterprise provider coverage: ${enterpriseFreshProviders.length}/${CORE_SCAN_PROVIDERS.length} providers are fresh and ${enterpriseBlockedProviders.length} need recovery.` : '',
        providerPreflight && !providerPreflight.ok ? `Resolve latest provider preflight blockers: ${providerPreflight.failed} provider${providerPreflight.failed === 1 ? '' : 's'} failed credential, billing, quota, or access checks.` : '',
        !providerPreflight ? 'Run provider preflight before claiming enterprise multi-engine report readiness.' : '',
        configuredButPlanLocked.length > 0 ? `Upgrade plan access or remove locked engines before enterprise reporting: ${configuredButPlanLocked.join(', ')}.` : '',
        missingForEnterprise.length > 0 ? `Add missing enterprise provider credentials: ${missingForEnterprise.join(', ')}.` : '',
        providerHealth.some((provider) => provider.status === 'not_sampled') ? 'Sample every core provider before presenting cross-model visibility.' : '',
        providerHealth.some((provider) => provider.status === 'failed') ? 'Fix failed provider credentials or worker errors before client reporting.' : '',
        freshCoveragePct < 70 ? 'Run fresh scans for high-intent prompts so reports are not built on stale answer data.' : '',
        totalPrompts < 25 ? 'Expand prompt inventory to at least 25 buyer, comparison, product, and support prompts.' : '',
      ].filter(Boolean);
      const recoveryPlan = providerHealth
        .filter((provider: any) => provider.recovery?.severity !== 'ok')
        .map((provider: any) => ({
          provider: provider.provider,
          status: provider.status,
          severity: provider.recovery.severity,
          cause: provider.recovery.cause,
          action: provider.recovery.action,
          canRetry: provider.recovery.canRetry,
          envHint: provider.recovery.envHint,
          latestError: provider.latestError,
        }));

      res.json({
        brandId,
        score,
        status: score >= 80 ? 'healthy' : score >= 55 ? 'degraded' : 'at_risk',
        generatedAt: new Date().toISOString(),
        schedule: {
          enabled: activeSchedule,
          frequency: schedule?.frequency || null,
          lastRun: lastScheduleRun,
          nextRun: nextScheduleRun,
          overdueHours,
          runCount: schedule?.runCount || 0,
          failCount: schedule?.failCount || 0,
        },
        prompts: {
          total: totalPrompts,
          everSampled: promptsEverSampled,
          freshCoverage: freshPromptCoverage,
          coveragePct: promptCoveragePct,
          freshCoveragePct,
        },
        providers: providerHealth,
        providerCoverage: {
          plan: planName,
          expectedProviders,
          enterpriseTargetProviders: CORE_SCAN_PROVIDERS,
          configuredProviders: configuredCoreProviders,
          configuredButPlanLocked,
          missingForEnterprise,
          enterpriseFreshProviders,
          enterpriseBlockedProviders,
          enterpriseRecoveryPlan,
          latestPreflight: providerPreflight,
          enterpriseFreshCount: enterpriseFreshProviders.length,
          enterpriseTargetCount: CORE_SCAN_PROVIDERS.length,
          readyForEnterprise: enterpriseFreshProviders.length >= 4 && enterpriseBlockedProviders.length === 0,
        },
        providerPreflight,
        recoveryPlan,
        jobs: jobSummary,
        queue: queueStats,
        nextActions,
      });
    } catch (error: any) {
      console.error('[ScanHealth] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/provider-preflight - Low-token provider credential/billing test
  app.post("/api/brands/:brandId/provider-preflight", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const configuredProviders = configuredProviderMap();
      const requestedProviders: string[] = Array.isArray(req.body?.providers)
        ? req.body.providers.map((provider: unknown) => String(provider || '').toLowerCase()).filter(Boolean)
        : [];
      const defaultTargets: string[] = CORE_SCAN_PROVIDERS.filter((provider: string) => configuredProviders[provider]);
      const preflightTargets: string[] = requestedProviders.length ? requestedProviders : defaultTargets;
      const providers: string[] = Array.from(new Set(preflightTargets
        .filter((provider: string) => (CORE_SCAN_PROVIDERS as readonly string[]).includes(provider))
        .slice(0, 6)));

      if (providers.length === 0) {
        return res.status(400).json({ message: "No configured enterprise providers are available for preflight." });
      }

      const { getIntegrations } = await import('./integrations');
      const integrations = getIntegrations();
      if (!integrations.llm) {
        return res.status(503).json({ message: "LLM integrations are not initialized." });
      }

      const startedAt = new Date();
      const results = [];
      for (const provider of providers) {
        if (!configuredProviders[provider]) {
          results.push({
            provider,
            status: 'not_configured',
            ok: false,
            message: `${provider} is not configured.`,
            envHint: getProviderEnvHint(provider),
          });
          continue;
        }
        try {
          const response = await integrations.llm.chat(provider as LLMProviderName, [
            { role: 'system', content: 'You are a provider health check. Reply briefly.' },
            { role: 'user', content: 'Reply with OK.' },
          ], {
            model: PROVIDER_MODELS[provider],
            temperature: 0,
            maxTokens: 8,
          });
          results.push({
            provider,
            status: 'ok',
            ok: true,
            model: response.model,
            message: 'Provider preflight succeeded.',
            tokens: response.usage?.totalTokens || 0,
            cost: response.cost || 0,
            envHint: getProviderEnvHint(provider),
          });
        } catch (error: any) {
          const safeError = redactProviderError(error?.message || error);
          const lowered = safeError.toLowerCase();
          const status = /credit|balance|billing|quota|limit/.test(lowered)
            ? 'billing_or_quota_blocked'
            : /unauthorized|forbidden|permission denied|invalid api|api key|suspended|disabled/.test(lowered)
              ? 'credential_blocked'
              : 'failed';
          results.push({
            provider,
            status,
            ok: false,
            message: safeError,
            envHint: getProviderEnvHint(provider),
          });
        }
      }

      const finishedAt = new Date();
      const currentData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const currentRuns = Array.isArray((currentData as any).providerPreflightRuns) ? (currentData as any).providerPreflightRuns : [];
      const preflight = {
        id: `provider_preflight_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        providers,
        ok: results.every((result: any) => result.ok),
        results,
      };
      await storage.updateBrand(req.params.brandId, {
        brandDevData: {
          ...currentData,
          providerPreflightRuns: [preflight, ...currentRuns].slice(0, 25),
        },
      } as any).catch(() => undefined);

      await createAuditLog(req, "provider_preflight", "brand", req.params.brandId, null, {
        providers,
        ok: preflight.ok,
        statuses: results.map((result: any) => ({ provider: result.provider, status: result.status })),
      });

      res.json({
        ...preflight,
        message: preflight.ok
          ? `Provider preflight passed for ${providers.length} provider${providers.length === 1 ? '' : 's'}.`
          : `Provider preflight found ${results.filter((result: any) => !result.ok).length} blocker${results.filter((result: any) => !result.ok).length === 1 ? '' : 's'}.`,
      });
    } catch (error: any) {
      console.error('[ProviderPreflight] Failed:', error);
      res.status(500).json({ message: redactProviderError(error.message) });
    }
  });

  // GET /api/brands/:brandId/scan-health/report - Shareable monitoring cadence and freshness report
  app.get("/api/brands/:brandId/scan-health/report", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const expectedProviders = (PLAN_PROVIDERS[String((brand as any).tier || 'free')] || PLAN_PROVIDERS.free)
        .filter((provider) => provider !== 'openrouter');
      const brandDevData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const providerPreflightRuns = Array.isArray((brandDevData as any).providerPreflightRuns)
        ? (brandDevData as any).providerPreflightRuns
        : [];
      const latestProviderPreflight = providerPreflightRuns[0] || null;
      const [prompts, runs, answers, jobs, schedule, alertRules, alertEvents] = await Promise.all([
        storage.getPromptsByBrand(brandId).catch(() => []),
        storage.getPromptRunsByBrand(brandId, 2000).catch(() => []),
        storage.getLlmAnswersByBrand(brandId, 2000).catch(() => []),
        storage.getJobsByBrand(brandId, 100).catch(() => []),
        storage.getAnalysisSchedule(brandId).catch(() => undefined),
        storage.getAlertRulesByBrand(brandId).catch(() => []),
        storage.getAlertEventsByBrand(brandId, 50).catch(() => []),
      ]);

      const normalizeProvider = (value: unknown) => {
        const text = String(value || '').toLowerCase();
        if (text.includes('openai') || text.includes('chatgpt') || text.includes('gpt')) return 'openai';
        if (text.includes('anthropic') || text.includes('claude')) return 'anthropic';
        if (text.includes('google') || text.includes('gemini')) return 'google';
        if (text.includes('perplexity')) return 'perplexity';
        if (text.includes('deepseek')) return 'deepseek';
        if (text.includes('grok')) return 'grok';
        if (text.includes('openrouter')) return 'openrouter';
        return text || 'unknown';
      };
      const newestDate = (items: any[], fields: string[]) => {
        let newest: Date | null = null;
        for (const item of items) {
          for (const field of fields) {
            const raw = item?.[field];
            if (!raw) continue;
            const date = new Date(raw);
            if (!Number.isNaN(date.getTime()) && (!newest || date > newest)) newest = date;
          }
        }
        return newest;
      };
      const ageHours = (date: Date | null) => date ? Math.round(((Date.now() - date.getTime()) / 36e5) * 10) / 10 : null;
      const statusFromAge = (hours: number | null, failedRuns: number, completedRuns: number, answerCount = 0) => {
        if (failedRuns > 0 && completedRuns === 0) return 'failed';
        if (completedRuns > 0 && answerCount === 0) return 'failed';
        if (hours == null) return 'not_sampled';
        if (hours <= 72) return 'fresh';
        if (hours <= 168) return 'stale';
        return 'expired';
      };

      const providers = expectedProviders.map((provider) => {
        const providerRuns = (runs as any[]).filter((run: any) => normalizeProvider(run.llmProvider) === provider);
        const providerAnswers = (answers as any[]).filter((answer: any) => normalizeProvider(answer.llmProvider) === provider);
        const completedRuns = providerRuns.filter((run: any) => run.status === 'completed').length;
        const failedRuns = providerRuns.filter((run: any) => run.status === 'failed').length;
        const runningRuns = providerRuns.filter((run: any) => run.status === 'running' || run.status === 'pending').length;
        const latestError = providerRuns
          .filter((run: any) => run.error)
          .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())[0]?.error || null;
        const lastRunAt = newestDate(providerRuns, ['completedAt', 'startedAt', 'createdAt']);
        const lastAnswerAt = newestDate(providerAnswers, ['createdAt']);
        const hours = ageHours(lastAnswerAt);
        return {
          provider,
          status: statusFromAge(hours, failedRuns, completedRuns, providerAnswers.length),
          lastRunAt: lastRunAt?.toISOString() || null,
          lastAnswerAt: lastAnswerAt?.toISOString() || null,
          ageHours: hours,
          completedRuns,
          failedRuns,
          runningRuns,
          totalAnswers: providerAnswers.length,
          answerlessCompletedRuns: completedRuns > 0 && providerAnswers.length === 0 ? completedRuns : 0,
          latestError,
        };
      });
      const configuredProviders = configuredProviderMap();
      const enterpriseProviders = CORE_SCAN_PROVIDERS.map((provider) => {
        const providerRuns = (runs as any[]).filter((run: any) => normalizeProvider(run.llmProvider) === provider);
        const providerAnswers = (answers as any[]).filter((answer: any) => normalizeProvider(answer.llmProvider) === provider);
        const completedRuns = providerRuns.filter((run: any) => run.status === 'completed').length;
        const failedRuns = providerRuns.filter((run: any) => run.status === 'failed').length;
        const latestError = providerRuns
          .filter((run: any) => run.error)
          .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())[0]?.error || null;
        const lastAnswerAt = newestDate(providerAnswers, ['createdAt']);
        const hours = ageHours(lastAnswerAt);
        const status = statusFromAge(hours, failedRuns, completedRuns, providerAnswers.length);
        const planLocked = !expectedProviders.includes(provider);
        return {
          provider,
          status,
          planLocked,
          configured: Boolean((configuredProviders as any)[provider]),
          envHint: getProviderEnvHint(provider as any),
          latestError,
          ageHours: hours,
          totalAnswers: providerAnswers.length,
          failedRuns,
        };
      });
      const enterpriseFreshProviders = enterpriseProviders.filter((provider) => provider.status === 'fresh');
      const enterpriseRecoveryPlan = enterpriseProviders
        .filter((provider) => provider.status !== 'fresh' || provider.planLocked || !provider.configured)
        .map((provider) => ({
          provider: provider.provider,
          status: provider.status,
          severity: provider.latestError ? 'blocked' : provider.planLocked ? 'plan_locked' : provider.configured ? 'missing' : 'missing_credentials',
          cause: provider.latestError
            ? `${provider.provider} credential, billing, quota, or account access is failing.`
            : provider.planLocked
              ? `${provider.provider} is configured or targeted for Enterprise but locked by the current plan.`
              : provider.configured
                ? `${provider.provider} has no fresh answer evidence yet.`
                : `${provider.provider} is missing configured credentials.`,
          action: provider.latestError
            ? `Fix ${provider.envHint}, confirm billing/quota/API access, restart workers, then rerun preflight and enterprise pilot sweep.`
            : provider.planLocked
              ? 'Upgrade this brand to Enterprise before claiming full multi-engine coverage.'
              : provider.configured
                ? 'Queue an enterprise pilot sweep after plan and credential blockers are resolved.'
                : `Add ${provider.envHint}, restart workers, run provider preflight, then queue sampling.`,
          envHint: provider.envHint,
          latestError: provider.latestError,
        }));

      const promptIdsWithRuns = new Set((runs as any[]).map((run: any) => run.promptId).filter(Boolean));
      const promptIdsWithFreshAnswers = new Set(
        (answers as any[])
          .filter((answer: any) => {
            const created = answer.createdAt ? new Date(answer.createdAt) : null;
            return created && !Number.isNaN(created.getTime()) && (Date.now() - created.getTime()) <= 7 * 24 * 60 * 60 * 1000;
          })
          .map((answer: any) => answer.promptId)
          .filter(Boolean),
      );
      const totalPrompts = (prompts as any[]).length;
      const promptsEverSampled = promptIdsWithRuns.size;
      const freshPromptCoverage = promptIdsWithFreshAnswers.size;
      const promptCoveragePct = totalPrompts ? Math.round((promptsEverSampled / totalPrompts) * 100) : 0;
      const freshCoveragePct = totalPrompts ? Math.round((freshPromptCoverage / totalPrompts) * 100) : 0;
      const jobSummary = {
        total: (jobs as any[]).length,
        pending: (jobs as any[]).filter((job: any) => job.status === 'pending').length,
        running: (jobs as any[]).filter((job: any) => job.status === 'running').length,
        completed: (jobs as any[]).filter((job: any) => job.status === 'completed').length,
        failed: (jobs as any[]).filter((job: any) => job.status === 'failed').length,
      };
      const activeSchedule = Boolean(schedule?.isEnabled || brand.analysisEnabled);
      const lastScheduleRun = schedule?.lastRun || brand.lastAnalysis || null;
      const nextScheduleRun = schedule?.nextRun || brand.nextScheduledAnalysis || null;
      const nextRunAt = nextScheduleRun ? new Date(nextScheduleRun as any) : null;
      const overdueHours = nextRunAt && nextRunAt.getTime() < Date.now()
        ? Math.round(((Date.now() - nextRunAt.getTime()) / 36e5) * 10) / 10
        : 0;
      const freshProviders = providers.filter((provider) => provider.status === 'fresh').length;
      const blockedProviders = providers.filter((provider) => ['failed', 'not_sampled', 'expired'].includes(provider.status)).length;
      const schedulePenalty = !activeSchedule ? 30 : overdueHours > 24 ? 20 : overdueHours > 0 ? 10 : 0;
      const queuePenalty = jobSummary.failed > 0 ? Math.min(20, jobSummary.failed * 5) : 0;
      const score = Math.max(0, Math.min(100, Math.round(
        (freshProviders / expectedProviders.length) * 35 +
        freshCoveragePct * 0.35 +
        promptCoveragePct * 0.2 +
        (blockedProviders === 0 ? 10 : 0) -
        schedulePenalty -
        queuePenalty,
      )));
      const nextActions = [
        !activeSchedule ? 'Enable scheduled analysis for this brand.' : '',
        overdueHours > 0 ? `Scheduled analysis is overdue by ${overdueHours} hours; queue a full pipeline run.` : '',
        providers.some((provider) => provider.status === 'not_sampled') ? 'Sample every core provider before presenting cross-model visibility.' : '',
        providers.some((provider) => provider.status === 'failed') ? 'Fix failed provider credentials or worker errors before client reporting.' : '',
        enterpriseFreshProviders.length < CORE_SCAN_PROVIDERS.length ? `Enterprise launch coverage is ${enterpriseFreshProviders.length}/${CORE_SCAN_PROVIDERS.length}; resolve blocked, plan-locked, and unsampled providers before enterprise reporting.` : '',
        freshCoveragePct < 70 ? 'Run fresh scans for high-intent prompts so reports are not built on stale answer data.' : '',
        totalPrompts < 25 ? 'Expand prompt inventory to at least 25 buyer, comparison, product, and support prompts.' : '',
      ].filter(Boolean);
      const verdict = score >= 80 ? 'Monitoring cadence healthy' : score >= 55 ? 'Monitoring cadence degraded' : 'Monitoring cadence at risk';
      const generatedAt = new Date().toISOString();
      const scheduleSummary = {
        enabled: activeSchedule,
        frequency: schedule?.frequency || null,
        lastRun: lastScheduleRun,
        nextRun: nextScheduleRun,
        overdueHours,
        runCount: schedule?.runCount || 0,
        failCount: schedule?.failCount || 0,
      };
      const requiredAlertMetrics = ['score_drop', 'competitor_overtake', 'source_depth', 'crawler_anomaly', 'verification_debt', 'prompt_coverage'];
      const activeAlertRules = (alertRules as any[]).filter((rule: any) => rule.isActive);
      const activeAlertMetrics = new Set(activeAlertRules.map((rule: any) => String(rule.metric || '')));
      const configuredAlertDestinations = activeAlertRules.filter((rule: any) => Boolean(rule.destination)).length;
      const coveredAlertMetrics = requiredAlertMetrics.filter((metric) => activeAlertMetrics.has(metric));
      const latestAlertEventAt = newestDate(alertEvents as any[], ['createdAt']);
      const latestAlertEventAgeHours = ageHours(latestAlertEventAt);
      const failedAlertDeliveries = (alertEvents as any[]).filter((event: any) => String(event.deliveryStatus || '').toLowerCase() === 'failed').length;
      const sentAlertDeliveries = (alertEvents as any[]).filter((event: any) => String(event.deliveryStatus || '').toLowerCase() === 'sent').length;
      const monitoringIntegrityRows = [
        {
          label: 'Launch rule coverage',
          status: coveredAlertMetrics.length === requiredAlertMetrics.length ? 'ready' : coveredAlertMetrics.length >= 4 ? 'partial' : 'blocked',
          evidence: `${coveredAlertMetrics.length}/${requiredAlertMetrics.length} required launch alert rules active`,
          action: coveredAlertMetrics.length === requiredAlertMetrics.length ? 'Keep launch defaults active.' : 'Add missing launch monitoring defaults.',
        },
        {
          label: 'Notification destinations',
          status: activeAlertRules.length > 0 && configuredAlertDestinations === activeAlertRules.length ? 'ready' : configuredAlertDestinations > 0 ? 'partial' : 'blocked',
          evidence: `${configuredAlertDestinations}/${activeAlertRules.length} active rules have destinations`,
          action: activeAlertRules.length > 0 && configuredAlertDestinations === activeAlertRules.length ? 'Keep destinations current.' : 'Add email or webhook destinations to active rules.',
        },
        {
          label: 'Recent alert evaluation',
          status: latestAlertEventAgeHours != null && latestAlertEventAgeHours <= 168 ? 'ready' : latestAlertEventAgeHours != null ? 'partial' : 'blocked',
          evidence: latestAlertEventAgeHours == null ? 'No alert event recorded' : `Latest alert event ${latestAlertEventAgeHours}h old`,
          action: latestAlertEventAgeHours != null && latestAlertEventAgeHours <= 168 ? 'Keep scheduled evaluations running.' : 'Test rules or queue alert evaluation.',
        },
        {
          label: 'Delivery health',
          status: failedAlertDeliveries === 0 && sentAlertDeliveries > 0 ? 'ready' : failedAlertDeliveries === 0 ? 'partial' : 'blocked',
          evidence: `${sentAlertDeliveries} sent, ${failedAlertDeliveries} failed alert deliveries`,
          action: failedAlertDeliveries === 0 ? 'Confirm first delivery before launch.' : 'Fix failed alert destination or channel.',
        },
      ];
      const monitoringReady = monitoringIntegrityRows.filter((row) => row.status === 'ready').length;
      const monitoringPartial = monitoringIntegrityRows.filter((row) => row.status === 'partial').length;
      const monitoringIntegrityScore = Math.round(((monitoringReady + monitoringPartial * 0.5) / monitoringIntegrityRows.length) * 100);
      const monitoringIntegrity = {
        score: monitoringIntegrityScore,
        ready: monitoringReady,
        partial: monitoringPartial,
        blocked: monitoringIntegrityRows.length - monitoringReady - monitoringPartial,
        rows: monitoringIntegrityRows,
        requiredMetrics: requiredAlertMetrics,
        coveredMetrics: coveredAlertMetrics,
        latestAlertEventAt: latestAlertEventAt?.toISOString() || null,
        failedDeliveries: failedAlertDeliveries,
        sentDeliveries: sentAlertDeliveries,
      };
      const markdown = [
        `# Scan Operations Report: ${brand.name}`,
        '',
        `Domain: ${brand.domain || ''}`,
        `Generated: ${generatedAt}`,
        `Scan health score: ${score}/100`,
        `Verdict: ${verdict}`,
        '',
        '## Executive Summary',
        `${brand.name} has ${freshProviders}/${expectedProviders.length} fresh providers, ${freshCoveragePct}% fresh prompt coverage, ${promptCoveragePct}% sampled prompt coverage, ${jobSummary.failed} failed jobs, and ${overdueHours} overdue schedule hours.`,
        '',
        '## Provider Freshness',
        ...providers.map((provider) => `- ${provider.provider}: ${String(provider.status).toUpperCase()} - ${provider.ageHours == null ? 'no signal yet' : `${provider.ageHours}h old`} - ${provider.totalAnswers} answers - ${provider.failedRuns} failed runs`),
        '',
        '## Enterprise Provider Coverage',
        `- Fresh enterprise providers: ${enterpriseFreshProviders.length}/${CORE_SCAN_PROVIDERS.length}`,
        ...enterpriseRecoveryPlan.map((item: any) => `- ${item.provider}: ${String(item.severity).toUpperCase()} - ${item.cause} Next: ${item.action}`),
        '',
        '## Latest Provider Preflight',
        ...(latestProviderPreflight
          ? [
              `- Finished: ${latestProviderPreflight.finishedAt || 'in progress'}`,
              `- Result: ${latestProviderPreflight.ok ? 'passed' : 'blockers found'}`,
              `- Passed / blocked: ${(latestProviderPreflight.results || []).filter((result: any) => result.ok).length} / ${(latestProviderPreflight.results || []).filter((result: any) => !result.ok).length}`,
              ...(latestProviderPreflight.results || []).map((result: any) => `- ${result.provider}: ${String(result.status || (result.ok ? 'ok' : 'failed')).toUpperCase()}${result.envHint ? ` - ${result.envHint}` : ''}${result.message ? ` - ${result.message}` : ''}`),
            ]
          : ['No provider preflight has been run yet. Run provider preflight before claiming multi-engine report readiness.']),
        '',
        '## Schedule',
        `- Enabled: ${scheduleSummary.enabled ? 'yes' : 'no'}`,
        `- Frequency: ${scheduleSummary.frequency || 'not configured'}`,
        `- Last run: ${scheduleSummary.lastRun || 'none'}`,
        `- Next run: ${scheduleSummary.nextRun || 'none'}`,
        `- Overdue hours: ${scheduleSummary.overdueHours}`,
        '',
        '## Monitoring Integrity',
        `- Integrity score: ${monitoringIntegrity.score}/100`,
        `- Required launch rules active: ${coveredAlertMetrics.length}/${requiredAlertMetrics.length}`,
        `- Active rules with destinations: ${configuredAlertDestinations}/${activeAlertRules.length}`,
        `- Latest alert event: ${monitoringIntegrity.latestAlertEventAt || 'none'}`,
        `- Alert deliveries: ${sentAlertDeliveries} sent, ${failedAlertDeliveries} failed`,
        ...monitoringIntegrity.rows.map((row: any) => `- ${row.label}: ${String(row.status).toUpperCase()} - ${row.evidence}. Next: ${row.action}`),
        '',
        '## Next Actions',
        ...(nextActions.length ? nextActions.map((action: string, index: number) => `${index + 1}. ${action}`) : ['Monitoring cadence is healthy. Keep scheduled scans and alert rules active.']),
      ].join('\n');

      const escapeHtml = (value: string) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const preflightHtml = latestProviderPreflight
        ? `<h2>Latest Provider Preflight</h2><p>${escapeHtml(String(latestProviderPreflight.finishedAt || 'Run in progress'))} - ${latestProviderPreflight.ok ? 'passed' : 'blockers found'} - ${(latestProviderPreflight.results || []).filter((result: any) => result.ok).length} passed, ${(latestProviderPreflight.results || []).filter((result: any) => !result.ok).length} blocked</p>${(latestProviderPreflight.results || []).map((result: any) => `<div class="provider ${escapeHtml(result.ok ? 'fresh' : 'blocked')}"><strong>${escapeHtml(result.provider)}</strong><div class="small">${escapeHtml(String(result.status || (result.ok ? 'ok' : 'failed')).toUpperCase())}${result.envHint ? ` - ${escapeHtml(result.envHint)}` : ''}</div>${result.message ? `<p>${escapeHtml(result.message)}</p>` : ''}</div>`).join('')}`
        : '<h2>Latest Provider Preflight</h2><p>No provider preflight has been run yet. Run provider preflight before claiming multi-engine report readiness.</p>';
      const monitoringIntegrityHtml = `<h2>Monitoring Integrity</h2><p class="score">${monitoringIntegrity.score}/100 integrity</p><p>Required launch rules active: ${coveredAlertMetrics.length}/${requiredAlertMetrics.length}. Active rules with destinations: ${configuredAlertDestinations}/${activeAlertRules.length}. Alert deliveries: ${sentAlertDeliveries} sent, ${failedAlertDeliveries} failed.</p>${monitoringIntegrity.rows.map((row: any) => `<div class="provider ${escapeHtml(row.status)}"><strong>${escapeHtml(row.label)}</strong><div class="small">${escapeHtml(String(row.status).toUpperCase())} - ${escapeHtml(row.evidence)}</div><p><strong>Next:</strong> ${escapeHtml(row.action)}</p></div>`).join('')}`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(brand.name)} Scan Operations Report</title><style>body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}h2{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px}.meta{color:#6b7280}.score{display:inline-block;border:1px solid #111827;border-radius:8px;padding:10px 14px;font-weight:700}.provider{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0}.fresh,.ready{border-color:#86efac}.stale,.partial{border-color:#fcd34d}.failed,.expired,.not_sampled,.blocked,.plan_locked,.missing,.missing_credentials{border-color:#fca5a5}.small{color:#4b5563;font-size:14px}</style></head><body><h1>Scan Operations Report: ${escapeHtml(brand.name)}</h1><p class="meta">Domain: ${escapeHtml(String(brand.domain || ''))}<br>Generated: ${escapeHtml(generatedAt)}</p><p class="score">${score}/100 - ${escapeHtml(verdict)}</p><h2>Executive Summary</h2><p>${escapeHtml(`${brand.name} has ${freshProviders}/${expectedProviders.length} plan providers fresh and ${enterpriseFreshProviders.length}/${CORE_SCAN_PROVIDERS.length} enterprise providers fresh, ${freshCoveragePct}% fresh prompt coverage, ${promptCoveragePct}% sampled prompt coverage, ${jobSummary.failed} failed jobs, and ${overdueHours} overdue schedule hours.`)}</p><h2>Provider Freshness</h2>${providers.map((provider) => `<div class="provider ${escapeHtml(provider.status)}"><strong>${escapeHtml(provider.provider)}</strong><div class="small">${escapeHtml(String(provider.status).toUpperCase())} - ${provider.ageHours == null ? 'no signal yet' : `${provider.ageHours}h old`} - ${provider.totalAnswers} answers - ${provider.failedRuns} failed runs</div></div>`).join('')}<h2>Enterprise Provider Coverage</h2><p>Fresh enterprise providers: ${enterpriseFreshProviders.length}/${CORE_SCAN_PROVIDERS.length}</p>${enterpriseRecoveryPlan.map((item: any) => `<div class="provider ${escapeHtml(item.severity)}"><strong>${escapeHtml(item.provider)}</strong><div class="small">${escapeHtml(String(item.severity).toUpperCase())}${item.envHint ? ` - ${escapeHtml(item.envHint)}` : ''}</div><p>${escapeHtml(item.cause)}</p><p><strong>Next:</strong> ${escapeHtml(item.action)}</p></div>`).join('')}${preflightHtml}<h2>Schedule</h2><p>Enabled: ${scheduleSummary.enabled ? 'yes' : 'no'}</p><p>Frequency: ${escapeHtml(String(scheduleSummary.frequency || 'not configured'))}</p><p>Last run: ${escapeHtml(String(scheduleSummary.lastRun || 'none'))}</p><p>Next run: ${escapeHtml(String(scheduleSummary.nextRun || 'none'))}</p><p>Overdue hours: ${escapeHtml(String(scheduleSummary.overdueHours))}</p>${monitoringIntegrityHtml}<h2>Next Actions</h2>${nextActions.length ? nextActions.map((action: string, index: number) => `<p>${index + 1}. ${escapeHtml(action)}</p>`).join('') : '<p>Monitoring cadence is healthy. Keep scheduled scans and alert rules active.</p>'}</body></html>`;

      res.json({
        brandId,
        brandName: brand.name,
        score,
        verdict,
        summary: {
          freshProviders,
          totalProviders: expectedProviders.length,
          freshCoveragePct,
          promptCoveragePct,
          failedJobs: jobSummary.failed,
          overdueHours,
          nextActions: nextActions.length,
          enterpriseFreshProviders: enterpriseFreshProviders.length,
          enterpriseTargetProviders: CORE_SCAN_PROVIDERS.length,
          enterpriseRecoveryItems: enterpriseRecoveryPlan.length,
        },
        schedule: scheduleSummary,
        providers,
        enterpriseProviders,
        enterpriseRecoveryPlan,
        latestProviderPreflight,
        monitoringIntegrity,
        jobs: jobSummary,
        nextActions,
        markdown,
        html,
        filenameBase: `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-scan-operations`,
        generatedAt,
      });
    } catch (error: any) {
      console.error('[ScanHealthReport] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/scan-operations/run - Queue a focused scan recovery/freshness batch
  app.post("/api/brands/:brandId/scan-operations/run", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const maxPrompts = Math.max(1, Math.min(Number(req.body?.maxPrompts || 12), 25));
      const maxProviders = Math.max(1, Math.min(Number(req.body?.maxProviders || 4), 6));
      const providerSweep = req.body?.providerSweep !== false;
      const includeDownstream = req.body?.includeDownstream !== false;
      const enterprisePilot = req.body?.enterprisePilot === true;
      const prompts = await storage.getPromptsByBrand(brandId).catch(() => []);
      const selectedPrompts = (prompts as any[])
        .slice()
        .sort((a: any, b: any) => Number(b.priorityScore || b.opportunityScore || 0) - Number(a.priorityScore || a.opportunityScore || 0))
        .slice(0, maxPrompts);

      if (selectedPrompts.length === 0) {
        return res.status(400).json({ message: "Add prompts before queuing a scan run." });
      }

      const { getJobQueue } = await import('./jobs/queue');
      const queue = getJobQueue();
      const scanRunId = `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const jobs: Array<{ jobId: string; type: string; promptId?: string; provider?: string; persistedJobId?: string }> = [];
      const configuredProviders = configuredProviderMap();
      const planProviders = PLAN_PROVIDERS[String((brand as any).tier || 'free')] || PLAN_PROVIDERS.free;
      const providerPool = enterprisePilot ? CORE_SCAN_PROVIDERS : planProviders;
      const targetProviders = (providerSweep ? providerPool.filter((provider) => configuredProviders[provider]) : [])
        .slice(0, maxProviders);
      const providerJobsPerPrompt = targetProviders.length || 1;
      const persistScanJob = async (input: { queueJobId: string; type: string; promptId?: string; provider?: string; priority: number; maxAttempts: number }) => {
        const persisted = await storage.createJob({
          brandId,
          type: input.type,
          status: 'pending',
          priority: input.priority,
          attempts: 0,
          maxAttempts: input.maxAttempts,
          payload: {
            brandId,
            promptId: input.promptId || null,
            provider: input.provider || null,
            reason: enterprisePilot ? 'enterprise_pilot_scan_run' : 'scan_operations_run',
            enterprisePilot,
            scanRunId,
            queueJobId: input.queueJobId,
          },
          scheduledFor: new Date(),
          createdBy: userId,
        } as any).catch(() => null);
        return persisted?.id || undefined;
      };

      for (const prompt of selectedPrompts) {
        const providersForPrompt = targetProviders.length ? targetProviders : [undefined];
        for (const provider of providersForPrompt) {
          const jobId = await queue.addJob('llm_sampling', {
            brandId,
            promptId: prompt.id,
            provider,
            allowPlanOverride: enterprisePilot,
            force: Boolean(provider),
            scanRunId,
            reason: enterprisePilot ? 'enterprise_pilot_provider_sweep' : provider ? 'scan_operations_provider_sweep' : 'scan_operations_run',
          } as any, provider ? 9 : 8, 3);
          jobs.push({
            jobId,
            type: 'llm_sampling',
            promptId: prompt.id,
            provider,
            persistedJobId: await persistScanJob({ queueJobId: jobId, type: 'llm_sampling', promptId: prompt.id, provider, priority: provider ? 9 : 8, maxAttempts: 3 }),
          });
        }
      }

      const promptJobCount = selectedPrompts.length * providerJobsPerPrompt;

      if (includeDownstream) {
        const citationJobId = await queue.addJob('citation_extraction', { brandId, scanRunId, reason: 'scan_operations_run' } as any, 6, 3);
        jobs.push({
          jobId: citationJobId,
          type: 'citation_extraction',
          persistedJobId: await persistScanJob({ queueJobId: citationJobId, type: 'citation_extraction', priority: 6, maxAttempts: 3 }),
        });
        const visibilityJobId = await queue.addJob('visibility_scoring', { brandId, period: 'daily', scanRunId, reason: 'scan_operations_run' } as any, 5, 3);
        jobs.push({
          jobId: visibilityJobId,
          type: 'visibility_scoring',
          persistedJobId: await persistScanJob({ queueJobId: visibilityJobId, type: 'visibility_scoring', priority: 5, maxAttempts: 3 }),
        });
        const alertJobId = await queue.addJob('alert_evaluation', { brandId, scanRunId, reason: 'scan_operations_run' } as any, 4, 2);
        jobs.push({
          jobId: alertJobId,
          type: 'alert_evaluation',
          persistedJobId: await persistScanJob({ queueJobId: alertJobId, type: 'alert_evaluation', priority: 4, maxAttempts: 2 }),
        });
      }

      const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const currentData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const currentRuns = Array.isArray((currentData as any).scanOperationRuns) ? (currentData as any).scanOperationRuns : [];
      const scanManifest = {
        id: scanRunId,
        queuedAt: new Date().toISOString(),
        queuedBy: userId,
        status: 'queued',
        promptJobs: selectedPrompts.length,
        providerSweep,
        enterprisePilot,
        providers: targetProviders,
        providerJobsPerPrompt,
        downstreamJobs: includeDownstream ? jobs.length - promptJobCount : 0,
        jobs,
      };
      await storage.updateBrand(brandId, {
        analysisEnabled: true,
        nextScheduledAnalysis: nextRun,
        brandDevData: {
          ...currentData,
          scanOperationRuns: [scanManifest, ...currentRuns].slice(0, 50),
        },
      } as any).catch(() => undefined);

      res.json({
        scanRunId,
        queued: jobs.length,
        promptJobs: promptJobCount,
        prompts: selectedPrompts.length,
        providerSweep,
        enterprisePilot,
        providers: targetProviders,
        downstreamJobs: includeDownstream ? jobs.length - promptJobCount : 0,
        jobs,
        message: `Queued ${jobs.length} scan operation job${jobs.length === 1 ? '' : 's'} for ${selectedPrompts.length} prompt${selectedPrompts.length === 1 ? '' : 's'}${targetProviders.length ? ` across ${targetProviders.length} provider${targetProviders.length === 1 ? '' : 's'}` : ''}.`,
        nextScheduledAnalysis: nextRun.toISOString(),
      });
    } catch (error: any) {
      console.error('[ScanOperations] Queue run failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/scan-operations/history - Recent scan job and provider run history
  app.get("/api/brands/:brandId/scan-operations/history", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [runs, jobs, schedule] = await Promise.all([
        storage.getPromptRunsByBrand(brandId, 500).catch(() => []),
        storage.getJobsByBrand(brandId, 200).catch(() => []),
        storage.getAnalysisSchedule(brandId).catch(() => undefined),
      ]);
      const scanTypes = new Set(['llm_sampling', 'citation_extraction', 'visibility_scoring', 'alert_evaluation', 'browser_sampling', 'prompt_volume_scoring']);
      const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const scanOperationRuns = Array.isArray((data as any).scanOperationRuns) ? (data as any).scanOperationRuns : [];
      let liveJobsByQueueId = new Map<string, any>();
      try {
        const { getJobQueue } = await import('./jobs/queue');
        const liveJobs = await getJobQueue().getJobsByBrand(brandId);
        liveJobsByQueueId = new Map((liveJobs || []).map((job: any) => [job.id, job]));
      } catch {
        liveJobsByQueueId = new Map();
      }
      const manifestJobs = scanOperationRuns.flatMap((run: any) => Array.isArray(run.jobs) ? run.jobs : []);
      const persistedToQueue = new Map<string, string>(
        manifestJobs
          .filter((job: any) => job.persistedJobId && job.jobId)
          .map((job: any) => [job.persistedJobId, job.jobId])
      );
      const reconciledJobs = await Promise.all((jobs as any[]).map(async (job: any) => {
        const queueJobId = persistedToQueue.get(job.id) || (job.payload as any)?.queueJobId;
        const liveJob = queueJobId ? liveJobsByQueueId.get(queueJobId) : null;
        if (!liveJob) return job;
        const updates: any = {};
        if (liveJob.status && liveJob.status !== job.status) updates.status = liveJob.status;
        if (typeof liveJob.attempts === 'number' && liveJob.attempts !== job.attempts) updates.attempts = liveJob.attempts;
        if (liveJob.error && liveJob.error !== job.error) updates.error = liveJob.error;
        if (liveJob.startedAt && String(liveJob.startedAt) !== String(job.startedAt || '')) updates.startedAt = liveJob.startedAt;
        if (liveJob.completedAt && String(liveJob.completedAt) !== String(job.completedAt || '')) updates.completedAt = liveJob.completedAt;
        if (Object.keys(updates).length === 0) return job;
        await storage.updateJob(job.id, updates).catch(() => undefined);
        return { ...job, ...updates };
      }));
      const scanJobs = (reconciledJobs as any[]).filter((job: any) => scanTypes.has(String(job.type || '')));
      const dayKey = (value: any) => {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unknown';
      };
      const durationSeconds = (start: any, end: any) => {
        const started = start ? new Date(start).getTime() : 0;
        const completed = end ? new Date(end).getTime() : 0;
        if (!started || !completed || completed < started) return null;
        return Math.round((completed - started) / 1000);
      };

      const byDayMap = new Map<string, any>();
      for (const job of scanJobs) {
        const key = dayKey(job.createdAt);
        if (!byDayMap.has(key)) byDayMap.set(key, { date: key, jobs: 0, completed: 0, failed: 0, pending: 0, running: 0 });
        const entry = byDayMap.get(key);
        entry.jobs += 1;
        const status = String(job.status || 'pending').toLowerCase();
        if (status === 'completed') entry.completed += 1;
        else if (status === 'failed') entry.failed += 1;
        else if (status === 'running') entry.running += 1;
        else entry.pending += 1;
      }

      const providerMap = new Map<string, any>();
      for (const run of runs as any[]) {
        const provider = String(run.llmProvider || 'unknown').toLowerCase();
        if (!providerMap.has(provider)) {
          providerMap.set(provider, { provider, total: 0, completed: 0, failed: 0, pending: 0, running: 0, lastRunAt: null, latestError: null, avgDurationSeconds: null, _durations: [] as number[] });
        }
        const entry = providerMap.get(provider);
        entry.total += 1;
        const status = String(run.status || 'pending').toLowerCase();
        if (status === 'completed') entry.completed += 1;
        else if (status === 'failed') entry.failed += 1;
        else if (status === 'running') entry.running += 1;
        else entry.pending += 1;
        if (run.error) entry.latestError = run.error;
        const last = run.completedAt || run.startedAt || run.createdAt;
        if (last && (!entry.lastRunAt || new Date(last) > new Date(entry.lastRunAt))) entry.lastRunAt = last;
        const duration = durationSeconds(run.startedAt, run.completedAt);
        if (duration != null) entry._durations.push(duration);
      }
      const providers = Array.from(providerMap.values()).map((entry: any) => {
        const avg = entry._durations.length
          ? Math.round(entry._durations.reduce((sum: number, item: number) => sum + item, 0) / entry._durations.length)
          : null;
        const failureRate = entry.total ? Math.round((entry.failed / entry.total) * 100) : 0;
        const { _durations, ...clean } = entry;
        return { ...clean, avgDurationSeconds: avg, failureRate };
      }).sort((a: any, b: any) => b.total - a.total);

      const recentJobs = scanJobs.slice(0, 20).map((job: any) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        priority: job.priority,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationSeconds: durationSeconds(job.startedAt, job.completedAt),
        error: job.error,
      }));
      const failures = recentJobs.filter((job: any) => String(job.status || '').toLowerCase() === 'failed');
      const completedJobs = scanJobs.filter((job: any) => String(job.status || '').toLowerCase() === 'completed').length;
      const failedJobs = scanJobs.filter((job: any) => String(job.status || '').toLowerCase() === 'failed').length;
      const providerRunFailures = (runs as any[]).filter((run: any) => String(run.status || '').toLowerCase() === 'failed').length;
      const providerRunFailureRate = (runs as any[]).length ? Math.round((providerRunFailures / (runs as any[]).length) * 100) : 0;
      const manifests = scanOperationRuns.slice(0, 20).map((run: any) => {
        const runJobs = Array.isArray(run.jobs) ? run.jobs : [];
        const persistedIds = new Set(runJobs.map((job: any) => job.persistedJobId).filter(Boolean));
        const persistedMatches = scanJobs.filter((job: any) => persistedIds.has(job.id));
        return {
          id: run.id,
          queuedAt: run.queuedAt,
          queuedBy: run.queuedBy || null,
          enterprisePilot: Boolean(run.enterprisePilot),
          providerSweep: Boolean(run.providerSweep),
          providers: Array.isArray(run.providers) ? run.providers : [],
          status: persistedMatches.some((job: any) => job.status === 'failed')
            ? 'failed'
            : persistedMatches.length > 0 && persistedMatches.every((job: any) => job.status === 'completed')
            ? 'completed'
            : run.status || 'queued',
          queuedJobs: runJobs.length,
          promptJobs: Number(run.promptJobs || 0),
          downstreamJobs: Number(run.downstreamJobs || 0),
          persistedJobs: persistedMatches.length,
          completedJobs: persistedMatches.filter((job: any) => job.status === 'completed').length,
          failedJobs: persistedMatches.filter((job: any) => job.status === 'failed').length,
          jobs: runJobs.slice(0, 12).map((job: any) => ({
            ...job,
            provider: job.provider || null,
          })),
        };
      });

      res.json({
        brandId,
        summary: {
          scanJobs: scanJobs.length,
          manifests: manifests.length,
          completedJobs,
          failedJobs,
          failureRate: scanJobs.length ? Math.round((failedJobs / scanJobs.length) * 100) : 0,
          providerRuns: (runs as any[]).length,
          providerRunFailures,
          providerRunFailureRate,
          providers: providers.length,
          lastScheduleRun: schedule?.lastRun || brand.lastAnalysis || null,
          nextScheduleRun: schedule?.nextRun || brand.nextScheduledAnalysis || null,
        },
        byDay: Array.from(byDayMap.values()).sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 14),
        manifests,
        providers,
        recentJobs,
        failures,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[ScanOperations] History fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:brandId/launch-trend - Compact historical launch movement for Command Center
  app.get("/api/brands/:brandId/launch-trend", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json(await buildLaunchTrendSnapshot(brand));
    } catch (error: any) {
      console.error('[LaunchTrend] Fetch failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/prompts/:promptId/runs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await storage.getPromptRunsByPrompt(qstr(req.params.promptId), limit);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Answer Mentions
  app.get("/api/brands/:brandId/mentions", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, limit);
      res.json(mentions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Visibility Scores
  app.get("/api/brands/:brandId/visibility-scores", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const period = req.query.period as string;
      const limit = parseInt(req.query.limit as string) || 30;
      const scores = await storage.getVisibilityScoresByBrand(req.params.brandId, period, limit);
      const upliftPoints = getPocUpliftPoints(brand);
      if (!upliftPoints || !Array.isArray(scores) || scores.length === 0) {
        return res.json(scores);
      }

      const boostedScores = scores.map((score: any, index: number) =>
        index === 0
          ? {
              ...score,
              rawOverallScore: score.overallScore ?? 0,
              overallScore: applyPocUpliftScore(score.overallScore ?? 0, upliftPoints),
              scoreUpliftApplied: true,
              scoreUpliftPoints: upliftPoints,
            }
          : score,
      );
      res.json(boostedScores);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/visibility-scores/latest", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const score = await storage.getLatestVisibilityScore(req.params.brandId);
      if (!score) {
        return res.json({});
      }

      const upliftPoints = getPocUpliftPoints(brand);
      const boostedScore = upliftPoints > 0
        ? {
            ...score,
            rawOverallScore: score.overallScore ?? 0,
            overallScore: applyPocUpliftScore(score.overallScore ?? 0, upliftPoints),
            scoreUpliftApplied: true,
            scoreUpliftPoints: upliftPoints,
          }
        : {
            ...score,
            rawOverallScore: score.overallScore ?? 0,
            scoreUpliftApplied: false,
            scoreUpliftPoints: 0,
          };

      res.json(boostedScore);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Trend Snapshots
  app.get("/api/brands/:brandId/trends", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 90;
      const trends = await storage.getTrendSnapshotsByBrand(req.params.brandId, limit);
      res.json(trends);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Recommendations
  app.get("/api/brands/:brandId/recommendations", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const recommendations = await storage.getRecommendationsByBrand(req.params.brandId, limit);
      if (recommendations.length > 0) {
        return res.json(recommendations);
      }

      const { getGapActionMapper } = await import('./services/gap-action-mapper');
      const mapper = getGapActionMapper();
      const actions = await mapper.getPrioritizedActions(req.params.brandId, limit);
      const fallbackRecommendations = actions.map((action, index) => ({
        id: `fallback-${req.params.brandId}-${index}`,
        brandId: req.params.brandId,
        type: action.type,
        priority: action.priority,
        title: action.title,
        description: action.description,
        currentValue: null,
        potentialValue: action.estimatedImpact,
        effortScore: action.effortLevel === 'easy' ? 2 : action.effortLevel === 'medium' ? 5 : 8,
        impactScore: action.estimatedImpact,
        impact: `Estimated +${action.estimatedImpact} visibility points`,
        effort: action.effortLevel,
        status: 'pending',
        metadata: {
          generatedFrom: 'gap-action-fallback',
          steps: action.steps,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      res.json(fallbackRecommendations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= DASHBOARD ROUTES =============

  // Dashboard Summary
  app.get("/api/brands/:brandId/dashboard/summary", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      // Get latest visibility score
      const latestScore = await storage.getLatestVisibilityScore(req.params.brandId);
      const upliftPoints = getPocUpliftPoints(brand);
      const boostedVisibilityScore = applyPocUpliftScore(latestScore?.overallScore ?? 0, upliftPoints);

      // Get recent mentions
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 100);

      // Get recent prompt runs
      const promptRuns = await storage.getPromptRunsByBrand(req.params.brandId, 50);

      // Calculate summary metrics
      const totalMentions = mentions.length;
      const positiveMentions = mentions.filter(m => m.sentiment === 'positive').length;
      const neutralMentions = mentions.filter(m => m.sentiment === 'neutral').length;
      const negativeMentions = mentions.filter(m => m.sentiment === 'negative').length;

      const avgPosition = mentions.length > 0
        ? mentions.reduce((sum, m) => sum + (m.position || 0), 0) / mentions.length
        : 0;

      res.json({
        visibilityScore: boostedVisibilityScore,
        totalMentions,
        positiveMentions,
        neutralMentions,
        negativeMentions,
        avgPosition: Math.round(avgPosition * 10) / 10,
        totalPromptRuns: promptRuns.length,
        lastUpdated: latestScore?.createdAt || new Date(),
        scoreUpliftApplied: upliftPoints > 0,
        scoreUpliftPoints: upliftPoints,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard Visibility Score
  app.get("/api/brands/:brandId/dashboard/visibility-score", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const latestScore = await storage.getLatestVisibilityScore(req.params.brandId);

      // Compute benchmark score from industry average
      let benchmarkScore = 45;
      if (brand.industry) {
        const benchmarkResult = await db
          .select({ avg: sql<number>`AVG(${visibilityScores.overallScore})` })
          .from(visibilityScores)
          .innerJoin(brandsTable, eq(brandsTable.id, visibilityScores.brandId))
          .where(eq(brandsTable.industry, brand.industry));
        benchmarkScore = Math.round(benchmarkResult[0]?.avg ?? 45);
      }
      // Apply admin score override if set
      const effectiveScore = (brand as any).scoreOverride != null
        ? (brand as any).scoreOverride
        : (latestScore?.overallScore ?? 0);
      const upliftPoints = getPocUpliftPoints(brand);
      const boostedScore = applyPocUpliftScore(effectiveScore, upliftPoints);

      const potentialScore = Math.min(85, boostedScore + 15);
      const scoreLabel = getScoreLabel(boostedScore);
      const coverageInfo = latestScore
        ? { sampled: latestScore.promptsCovered ?? 0, total: latestScore.totalPrompts ?? 0 }
        : { sampled: 0, total: 0 };

      res.json({
        ...(latestScore ?? { overallScore: 0, modelBreakdown: {} }),
        rawOverallScore: effectiveScore,
        overallScore: boostedScore,
        benchmarkScore,
        potentialScore,
        scoreLabel,
        coverageInfo,
        // Score breakdown components
        totalPrompts: latestScore?.totalPrompts ?? 0,
        mentionedPrompts: latestScore?.mentionedPrompts ?? 0,
        avgPosition: latestScore?.avgPosition ?? 0,
        sentimentScore: latestScore?.sentimentScore ?? 50,
        citationScore: latestScore?.citationScore ?? 0,
        wikidataBonus: latestScore?.wikidataBonus ?? 0,
        kgBonus: latestScore?.kgBonus ?? 0,
        hasOverride: (brand as any).scoreOverride != null,
        scoreUpliftApplied: upliftPoints > 0,
        scoreUpliftPoints: upliftPoints,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard Trends
  app.get("/api/brands/:brandId/dashboard/trends", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const period = req.query.period as string || '30d';
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

      const scores = await storage.getVisibilityScoresByBrand(req.params.brandId, period, days);
      const upliftPoints = getPocUpliftPoints(brand);
      const boostedScores = upliftPoints > 0
        ? scores.map((score: any, index: number) =>
            index === 0
              ? {
                  ...score,
                  rawOverallScore: score.overallScore ?? 0,
                  overallScore: applyPocUpliftScore(score.overallScore ?? 0, upliftPoints),
                }
              : score,
          )
        : scores;

      // Calculate trend
      const currentScore = boostedScores[0]?.overallScore || 0;
      const previousScore = boostedScores[boostedScores.length - 1]?.overallScore || 0;
      const delta = currentScore - previousScore;
      const percentage = previousScore > 0 ? (delta / previousScore) * 100 : 0;

      res.json({
        current: currentScore,
        previous: previousScore,
        delta,
        percentage: Math.round(percentage * 10) / 10,
        scores: boostedScores,
        scoreUpliftApplied: upliftPoints > 0,
        scoreUpliftPoints: upliftPoints,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard Model Breakdown
  app.get("/api/brands/:brandId/dashboard/model-breakdown", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, 500);
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 500);

      // Group by model
      const modelStats: Record<string, any> = {};

      answers.forEach(answer => {
        const key = answer.llmModel;
        if (!modelStats[key]) {
          modelStats[key] = {
            model: key,
            totalResponses: 0,
            mentions: 0,
            avgPosition: 0,
            positions: [],
          };
        }
        modelStats[key].totalResponses++;

        const mention = mentions.find(m => m.llmAnswerId === answer.id);
        if (mention) {
          modelStats[key].mentions++;
          if (mention.position) {
            modelStats[key].positions.push(mention.position);
          }
        }
      });

      // Calculate scores
      const breakdown = Object.values(modelStats).map((stat: any) => ({
        model: stat.model,
        score: stat.totalResponses > 0 ? (stat.mentions / stat.totalResponses) * 100 : 0,
        mentions: stat.mentions,
        totalResponses: stat.totalResponses,
        avgPosition: stat.positions.length > 0
          ? stat.positions.reduce((a: number, b: number) => a + b, 0) / stat.positions.length
          : 0,
      }));

      res.json(breakdown);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dashboard Topic Performance
  app.get("/api/brands/:brandId/dashboard/topic-performance", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const topics = await storage.getTopicsByBrand(req.params.brandId);
      const prompts = await storage.getPromptsByBrand(req.params.brandId);
      const answers = await storage.getLlmAnswersByBrand(req.params.brandId, 1000);
      const mentions = await storage.getAnswerMentionsByBrand(req.params.brandId, 1000);

      // Group prompts by topic
      const topicPerformance = topics.map(topic => {
        const topicPrompts = prompts.filter(p => p.topicId === topic.id);
        const topicAnswers = answers.filter(a =>
          topicPrompts.some(p => p.id === a.promptId)
        );
        const topicMentions = mentions.filter(m =>
          topicAnswers.some(a => a.id === m.llmAnswerId)
        );

        const mentionRate = topicAnswers.length > 0
          ? (topicMentions.length / topicAnswers.length) * 100
          : 0;

        return {
          topic: topic.name,
          topicId: topic.id,
          prompts: topicPrompts.length,
          responses: topicAnswers.length,
          mentions: topicMentions.length,
          mentionRate: Math.round(mentionRate * 10) / 10,
        };
      });

      res.json(topicPerformance);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= JOB MANAGEMENT ROUTES =============

  const requireJobHistoryAccess = async (req: any, res: Response) => {
    const job = await storage.getJob(qstr(req.params.jobId));
    if (!job) {
      res.status(404).json({ message: "Job not found" });
      return null;
    }

    const userId = getUserId(req);
    const [brand, currentUser] = await Promise.all([
      job.brandId ? storage.getBrand(job.brandId) : Promise.resolve(undefined),
      storage.getUser(userId).catch(() => undefined),
    ]);
    const ownsJob = job.createdBy === userId || Boolean(brand && brand.userId === userId);
    if (!ownsJob && !currentUser?.isAdmin) {
      res.status(404).json({ message: "Job not found" });
      return null;
    }

    return job;
  };

  // Job Runs
  app.get("/api/jobs/:jobId/runs", requireAuth, async (req, res) => {
    try {
      const job = await requireJobHistoryAccess(req, res);
      if (!job) return;

      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await storage.getJobRunsByJob(job.id, limit);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/jobs/:jobId/runs/latest", requireAuth, async (req, res) => {
    try {
      const job = await requireJobHistoryAccess(req, res);
      if (!job) return;

      const run = await storage.getLatestJobRun(job.id);
      res.json(run || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Job Errors
  app.get("/api/jobs/:jobId/errors", requireAuth, async (req, res) => {
    try {
      const job = await requireJobHistoryAccess(req, res);
      if (!job) return;

      const limit = parseInt(req.query.limit as string) || 50;
      const errors = await storage.getJobErrorsByJob(job.id, limit);
      res.json(errors);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/job-errors/unresolved", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const errors = await storage.getUnresolvedJobErrors(limit);
      res.json(errors);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= CONTENT MANAGEMENT ROUTES =============

  // AXP Pages
  app.get("/api/brands/:brandId/axp-pages", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const pages = await storage.getAxpPagesByBrand(req.params.brandId);
      res.json(pages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/axp-pages/:pageId", requireAuth, async (req: any, res, next) => {
    const owner = await requireAxpPageOwner(req, res);
    if (!owner) return;
    req.params.brandId = owner.brand.id;
    return enforceFeatureAccess("axp_drafts")(req, res, next);
  }, async (req, res) => {
    try {
      const page = await storage.getAxpPage(qstr(req.params.pageId));
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/axp-pages/:pageId/html", async (req, res) => {
    try {
      const page = await storage.getAxpPage(qstr(req.params.pageId));
      if (!page || String(page.status || '').toLowerCase() !== 'published') {
        return res.status(404).json({ message: "Published AXP page not found" });
      }
      const brand = await storage.getBrand(page.brandId);
      const versions = await storage.getAxpVersionsByPage(page.id);
      const version = versions.find((item: any) => item.id === page.publishedVersionId)
        || versions.find((item: any) => item.id === page.currentVersionId)
        || versions[0];
      if (!version) {
        return res.status(404).json({ message: "Published AXP page has no content version" });
      }

      const schema = version.schemaJson
        ? `<script type="application/ld+json">\n${escapeHtml(JSON.stringify(version.schemaJson, null, 2))}\n</script>`
        : '';
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title || brand?.name || 'AXP Page')}</title>
  <meta name="description" content="${escapeHtml(page.description || '')}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(page.canonicalUrl || `https://${brand?.domain || 'example.com'}/${page.slug}`)}">
  ${schema}
  <style>body{font-family:Inter,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.6;color:#111827}h1,h2,h3{line-height:1.2}.meta{color:#6b7280;font-size:14px}main{margin-top:24px}li{margin:6px 0}</style>
</head>
<body>
  <header>
    <p class="meta">${escapeHtml(brand?.name || '')}</p>
    <h1>${escapeHtml(page.title || 'AXP Page')}</h1>
    ${page.description ? `<p>${escapeHtml(page.description)}</p>` : ''}
  </header>
  <main>${version.contentHtml || markdownToSimpleHtml(version.content || '')}</main>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/axp-pages", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const page = await storage.createAxpPage({
        ...req.body,
        brandId: req.params.brandId,
        createdBy: userId,
      });
      await createAuditLog(req, "create", "axp_page", page.id, null, page);
      res.json(page);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const requireAxpPageOwner = async (req: any, res: Response) => {
    const page = await storage.getAxpPage(req.params.pageId);
    if (!page) {
      res.status(404).json({ message: "Page not found" });
      return null;
    }

    const userId = getUserId(req);
    const [brand, currentUser] = await Promise.all([
      storage.getBrand(page.brandId),
      storage.getUser(userId).catch(() => undefined),
    ]);
    if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
      res.status(404).json({ message: "Page not found" });
      return null;
    }

    return { page, brand };
  };

  app.patch("/api/axp-pages/:pageId", requireAuth, async (req: any, res, next) => {
    const owner = await requireAxpPageOwner(req, res);
    if (!owner) return;
    req.params.brandId = owner.brand.id;
    return enforceFeatureAccess("axp_drafts")(req, res, next);
  }, async (req: any, res) => {
    try {
      const oldPage = await storage.getAxpPage(req.params.pageId);
      const updated = await storage.updateAxpPage(req.params.pageId, req.body);
      await createAuditLog(req, "update", "axp_page", req.params.pageId, oldPage, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/axp-pages/:pageId/publish", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const page = await storage.getAxpPage(req.params.pageId);
      if (!page || page.brandId !== brand.id) {
        return res.status(404).json({ message: "AXP page not found" });
      }

      const versions = await storage.getAxpVersionsByPage(page.id);
      const version = versions.find((item: any) => item.id === page.currentVersionId) || versions[0];
      if (!version) {
        return res.status(400).json({ message: "Create an AXP content version before publishing." });
      }

      const updated = await storage.updateAxpPage(page.id, {
        status: 'published',
        publishedVersionId: version.id,
        currentVersionId: version.id,
      } as any);
      const artifactUrl = `/api/axp-pages/${updated.id}/html`;
      const promptFromTitle = String(updated.title || '').replace(new RegExp(`^${String(brand.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+AI Search Brief:\\s*`, 'i'), '').trim();
      const relatedFanoutLog = promptFromTitle
        ? (await storage.getOptimizationLogsByBrand(brand.id, 500).catch(() => []))
            .find((log: any) => String(log.actionType || '').startsWith('query_fanout:')
              && String(log.actionDescription || '').split(/\r?\n/)[0]?.replace(/^Query Fanout:\s*/i, '').trim() === promptFromTitle)
        : null;
      if (relatedFanoutLog) {
        const appliedLog = await storage.updateOptimizationLog(relatedFanoutLog.id, {
          status: 'applied',
          appliedAt: new Date(),
        } as any);
        await upsertBrandVerificationTask(brand, buildVerificationTask({
          sourceType: 'optimization',
          sourceId: appliedLog.id,
          title: appliedLog.actionDescription || `Verify published fanout brief: ${updated.title}`,
          artifactUrl,
          verificationMethod: verificationMethodForAction(appliedLog.actionType),
          status: 'pending',
        }));
      }
      await upsertBrandVerificationTask(brand, buildVerificationTask({
        sourceType: 'axp_page',
        sourceId: updated.id,
        title: `Verify published AXP page: ${updated.title}`,
        artifactUrl,
        verificationMethod: 'axp_publication_check',
        status: 'pending',
      }));
      await createAuditLog(req, "publish", "axp_page", updated.id, page, updated);

      res.json({
        page: updated,
        version,
        artifactUrl,
        message: "AXP page published and verification task created.",
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/axp-pages/:pageId", requireAuth, async (req: any, res, next) => {
    const owner = await requireAxpPageOwner(req, res);
    if (!owner) return;
    req.params.brandId = owner.brand.id;
    return enforceFeatureAccess("axp_drafts")(req, res, next);
  }, async (req: any, res) => {
    try {
      const page = await storage.getAxpPage(req.params.pageId);
      await storage.deleteAxpPage(req.params.pageId);
      await createAuditLog(req, "delete", "axp_page", req.params.pageId, page, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // AXP Versions
  app.get("/api/axp-pages/:pageId/versions", requireAuth, async (req: any, res, next) => {
    const owner = await requireAxpPageOwner(req, res);
    if (!owner) return;
    req.params.brandId = owner.brand.id;
    return enforceFeatureAccess("axp_drafts")(req, res, next);
  }, async (req, res) => {
    try {
      const versions = await storage.getAxpVersionsByPage(qstr(req.params.pageId));
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // FAQ Entries
  app.get("/api/brands/:brandId/faqs", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const faqs = await storage.getFaqEntriesByBrand(req.params.brandId);
      res.json(faqs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/faqs", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const faq = await storage.createFaqEntry({
        ...req.body,
        brandId: req.params.brandId,
        createdBy: userId,
      });
      await createAuditLog(req, "create", "faq_entry", faq.id, null, faq);
      res.json(faq);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const requireFaqEntryOwner = async (req: any, res: Response) => {
    const faq = await storage.getFaqEntry(qstr(req.params.faqId));
    if (!faq) {
      res.status(404).json({ message: "FAQ not found" });
      return null;
    }

    const userId = getUserId(req);
    const [brand, currentUser] = await Promise.all([
      storage.getBrand(faq.brandId),
      storage.getUser(userId).catch(() => undefined),
    ]);
    if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
      res.status(404).json({ message: "FAQ not found" });
      return null;
    }

    return { faq, brand };
  };

  app.patch("/api/faqs/:faqId", requireAuth, async (req: any, res) => {
    try {
      const owner = await requireFaqEntryOwner(req, res);
      if (!owner) return;

      req.params.brandId = owner.brand.id;
      const updated = await storage.updateFaqEntry(owner.faq.id, req.body);
      await createAuditLog(req, "update", "faq_entry", owner.faq.id, owner.faq, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/faqs/:faqId", requireAuth, async (req: any, res) => {
    try {
      const owner = await requireFaqEntryOwner(req, res);
      if (!owner) return;

      req.params.brandId = owner.brand.id;
      await storage.deleteFaqEntry(owner.faq.id);
      await createAuditLog(req, "delete", "faq_entry", owner.faq.id, owner.faq, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Schema Templates
  app.get("/api/brands/:brandId/schema-templates", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const templates = await storage.getSchemaTemplatesByBrand(req.params.brandId);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/schema-templates/global", async (req, res) => {
    try {
      const templates = await storage.getGlobalSchemaTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/schema-templates", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const template = await storage.createSchemaTemplate({
        ...req.body,
        brandId: req.params.brandId,
        createdBy: userId,
      });
      await createAuditLog(req, "create", "schema_template", template.id, null, template);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  const requireSchemaTemplateOwner = async (req: any, res: Response) => {
    const template = await storage.getSchemaTemplate(qstr(req.params.templateId));
    if (!template) {
      res.status(404).json({ message: "Schema template not found" });
      return null;
    }

    const userId = getUserId(req);
    const currentUser = await storage.getUser(userId).catch(() => undefined);
    if (template.isGlobal || !template.brandId) {
      if (!currentUser?.isAdmin) {
        res.status(404).json({ message: "Schema template not found" });
        return null;
      }
      return { template, brand: null };
    }

    const brand = await storage.getBrand(template.brandId);
    if (!brand || (brand.userId !== userId && !currentUser?.isAdmin)) {
      res.status(404).json({ message: "Schema template not found" });
      return null;
    }

    return { template, brand };
  };

  app.patch("/api/schema-templates/:templateId", requireAuth, async (req: any, res) => {
    try {
      const owner = await requireSchemaTemplateOwner(req, res);
      if (!owner) return;

      if (owner.brand) req.params.brandId = owner.brand.id;
      const updated = await storage.updateSchemaTemplate(owner.template.id, req.body);
      await createAuditLog(req, "update", "schema_template", owner.template.id, owner.template, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/schema-templates/:templateId", requireAuth, async (req: any, res) => {
    try {
      const owner = await requireSchemaTemplateOwner(req, res);
      if (!owner) return;

      if (owner.brand) req.params.brandId = owner.brand.id;
      await storage.deleteSchemaTemplate(owner.template.id);
      await createAuditLog(req, "delete", "schema_template", owner.template.id, owner.template, null);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Schema Versions
  app.get("/api/schema-templates/:templateId/versions", requireAuth, async (req: any, res) => {
    try {
      const owner = await requireSchemaTemplateOwner(req, res);
      if (!owner) return;

      if (owner.brand) req.params.brandId = owner.brand.id;
      const versions = await storage.getSchemaVersionsByTemplate(owner.template.id);
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= BILLING ROUTES =============

  // Subscriptions
  app.get("/api/brands/:brandId/subscription", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const subscription = await storage.getSubscriptionByBrand(req.params.brandId);
      res.json(subscription || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Invoices
  app.get("/api/brands/:brandId/invoices", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 50;

      const { syncSubscriptionStatus } = await import("./services/subscription");
      try {
        await syncSubscriptionStatus(req.params.brandId);
      } catch (err) {
        logger.warn("[Billing] syncSubscriptionStatus failed for invoice list", {
          brandId: req.params.brandId,
          error: String(err),
        });
      }

      let invoices = await storage.getInvoicesByBrand(req.params.brandId, limit);

      // Local reconciliation fallback for partially-written records.
      if (invoices.length === 0) {
        await reconcileInvoicesFromPayments(req.params.brandId);
        invoices = await storage.getInvoicesByBrand(req.params.brandId, limit);
      }

      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/invoices/:invoiceId", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice || invoice.brandId !== req.params.brandId) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const user = await storage.getUser(userId);
      let subscription = null;
      if (invoice.subscriptionId) {
        subscription = await storage.getSubscription(invoice.subscriptionId);
      }
      const payments = await storage.getPaymentsByInvoice(invoice.id);

      res.json({
        invoice,
        brand: { name: brand.name, domain: brand.domain },
        user: user ? { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone } : null,
        subscription,
        payments,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Payments
  app.get("/api/brands/:brandId/payments", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const payments = await storage.getPaymentsByBrand(req.params.brandId, limit);
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Webhook Events (Admin only)
  app.get("/api/admin/webhooks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const webhooks = await storage.getWebhookEvents({
        source: req.query.source as string,
        processed: req.query.processed === 'true' ? true : req.query.processed === 'false' ? false : undefined,
        limit: parseInt(req.query.limit as string) || 100,
      });
      res.json(webhooks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= JOB TRIGGER ROUTES =============

  app.post("/api/brands/:brandId/enrich", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerBrandEnrichment } = await import('./jobs');
      const jobId = await triggerBrandEnrichment(req.params.brandId, 8);
      
      await createAuditLog(req, "trigger_enrichment", "brand", req.params.brandId);
      
      res.json({ 
        jobId, 
        message: "Brand enrichment job queued",
        status: "pending"
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/prompts/:promptId/sample", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const prompt = await storage.getPrompt(req.params.promptId);
      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      const brand = await storage.getBrand(prompt.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Check plan limit manually since we need to get brandId from prompt first
      const { checkPlanLimit } = await import('./middleware/plan-enforcement');
      const limitCheck = await checkPlanLimit(prompt.brandId, 'promptsPerMonth');

      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: 'Plan limit exceeded',
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          upgradeRequired: true,
        });
      }

      const { triggerLLMSampling } = await import('./jobs');
      const jobId = await triggerLLMSampling(
        prompt.brandId,
        req.params.promptId,
        8
      );

      await createAuditLog(req, "trigger_sampling", "prompt", req.params.promptId);

      res.json({
        jobId,
        message: "LLM sampling job queued",
        status: "pending",
        providers: req.body.providers || ['openai', 'anthropic', 'google']
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/pipeline-status", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const { getJobQueue } = await import('./jobs');
      const queue = getJobQueue();
      const stats = queue.getStats();
      const hasActiveJobs = stats.pending > 0 || stats.running > 0;
      res.json({
        isProcessing: hasActiveJobs,
        pending: stats.pending,
        running: stats.running,
        completed: stats.completed,
        failed: stats.failed,
        total: stats.total,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/jobs/:jobId/status", requireAuth, async (req, res) => {
    try {
      const { getJobQueue } = await import('./jobs');
      const queue = getJobQueue();
      const job = await queue.getJob(qstr(req.params.jobId));
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.status === 'completed' ? 100 : job.status === 'running' ? 50 : 0,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error,
        result: job.result,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/jobs/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { getJobQueue } = await import('./jobs');
      const queue = getJobQueue();
      const stats = queue.getStats();
      
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/brands/:brandId/jobs", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getJobQueue } = await import('./jobs');
      const queue = getJobQueue();
      const jobs = await queue.getJobsByBrand(req.params.brandId);
      
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Gap Analysis Opportunities
  app.get("/api/brands/:brandId/gap-analysis/opportunities", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [answers, mentions, prompts, optimizations] = await Promise.all([
        storage.getLlmAnswersByBrand(brandId, 1000),
        storage.getAnswerMentionsByBrand(brandId, 1000),
        storage.getPromptsByBrand(brandId),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
      ]);
      const inWorkflow = new Set((optimizations as any[]).map((log: any) => String(log.actionType || '')));

      // Find prompts without mentions (missing opportunities)
      const promptsWithMentions = new Set(
        mentions.map(m => {
          const answer = answers.find(a => a.id === m.llmAnswerId);
          return answer?.promptId;
        }).filter(Boolean)
      );

      const missedOpportunities = prompts
        .filter(p => !promptsWithMentions.has(p.id))
        .map(p => ({
          id: `missed:${p.id}`,
          promptId: p.id,
          promptText: p.text,
          category: p.category,
          impactScore: 7, // Default high impact
          effortScore: 3, // Default low effort
          type: 'quick_win',
          status: inWorkflow.has(`gap_opportunity:missed:${p.id}`) ? 'in_workflow' : 'open',
          action: 'Create or strengthen an answer-ready page, FAQ, comparison section, or proof asset that directly answers this prompt and names the brand clearly.',
        }));

      // Find low rankings (mentioned but in poor position)
      const lowRankings = mentions
        .filter(m => (m.position || 0) > 3)
        .map(m => {
          const answer = answers.find(a => a.id === m.llmAnswerId);
          const prompt = prompts.find(p => p.id === answer?.promptId);
          const stableId = m.id || answer?.id || prompt?.id || 'unknown';
          return {
            id: `low-ranking:${stableId}`,
            mentionId: m.id,
            answerId: answer?.id,
            promptId: prompt?.id,
            promptText: prompt?.text,
            position: m.position,
            model: answer?.llmModel,
            impactScore: 6,
            effortScore: 5,
            type: 'improvement',
            status: inWorkflow.has(`gap_opportunity:low-ranking:${stableId}`) ? 'in_workflow' : 'open',
            action: 'Improve the target page with concise answer blocks, comparison proof, reviews, citations, and entity clarity so the brand moves into the top three recommendations.',
          };
        });

      res.json({
        missedOpportunities: missedOpportunities.slice(0, 20),
        lowRankings: lowRankings.slice(0, 20),
        summary: {
          totalOpportunities: missedOpportunities.length + lowRankings.length,
          quickWins: missedOpportunities.filter(o => o.impactScore > 6 && o.effortScore < 4).length,
          improvements: lowRankings.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/brands/:brandId/gap-analysis/opportunities/:opportunityId/task - Convert live gap into Action Workflow
  app.post("/api/brands/:brandId/gap-analysis/opportunities/:opportunityId/task", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const opportunityId = decodeURIComponent(req.params.opportunityId || '');
      const [answers, mentions, prompts, optimizations] = await Promise.all([
        storage.getLlmAnswersByBrand(brandId, 1000),
        storage.getAnswerMentionsByBrand(brandId, 1000),
        storage.getPromptsByBrand(brandId),
        storage.getOptimizationLogsByBrand(brandId, 500).catch(() => []),
      ]);

      let actionType = '';
      let actionDescription = '';
      let estimatedImpact = 50;
      let opportunity: any = null;

      if (opportunityId.startsWith('missed:')) {
        const promptId = opportunityId.replace(/^missed:/, '');
        const prompt = (prompts as any[]).find((item: any) => item.id === promptId);
        if (!prompt) return res.status(404).json({ message: "Prompt opportunity not found" });
        actionType = `gap_opportunity:missed:${prompt.id}`;
        estimatedImpact = 75;
        actionDescription = `Prompt gap fix: ${prompt.text}. Create or strengthen an answer-ready page, FAQ, comparison section, or proof asset that directly answers this prompt and names ${brand.name} clearly.`;
        opportunity = { id: opportunityId, promptId: prompt.id, promptText: prompt.text, type: 'quick_win' };
      } else if (opportunityId.startsWith('low-ranking:')) {
        const targetId = opportunityId.replace(/^low-ranking:/, '');
        const mention = (mentions as any[]).find((item: any) => item.id === targetId)
          || (mentions as any[]).find((item: any) => item.llmAnswerId === targetId)
          || (mentions as any[]).find((item: any) => {
            const answer = (answers as any[]).find((candidate: any) => candidate.id === item.llmAnswerId);
            return answer?.promptId === targetId;
          });
        if (!mention) return res.status(404).json({ message: "Ranking opportunity not found" });
        const answer = (answers as any[]).find((item: any) => item.id === mention.llmAnswerId);
        const prompt = (prompts as any[]).find((item: any) => item.id === answer?.promptId);
        const stableId = mention.id || answer?.id || prompt?.id || targetId;
        actionType = `gap_opportunity:low-ranking:${stableId}`;
        estimatedImpact = 60;
        actionDescription = `Ranking improvement: ${prompt?.text || 'Tracked prompt'} currently places ${brand.name} around position ${mention.position || 'low'}. Add concise answer blocks, comparison proof, reviews, citations, and entity clarity so the brand can move into the top three recommendations.`;
        opportunity = { id: opportunityId, promptId: prompt?.id, promptText: prompt?.text, position: mention.position, type: 'improvement' };
      } else {
        return res.status(400).json({ message: "Unsupported opportunity id" });
      }

      const duplicate = (optimizations as any[]).find((log: any) => String(log.actionType || '') === actionType);
      if (duplicate) {
        return res.json({ task: duplicate, created: false, message: "This gap opportunity is already in Action Workflow.", opportunity });
      }

      const task = await storage.createOptimizationLog({
        brandId,
        topicId: null,
        actionType,
        actionDescription,
        estimatedImpact,
        status: 'pending',
      });

      res.json({
        task,
        created: true,
        message: "Gap opportunity added to Action Workflow.",
        opportunity,
      });
    } catch (error: any) {
      console.error('[GapOpportunities] Task create failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Gap Analysis Roadmap
  app.get("/api/brands/:brandId/gap-analysis/roadmap", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      // Get opportunities
      const opportunitiesResponse = await fetch(`http://localhost:5000/api/brands/${req.params.brandId}/gap-analysis/opportunities`, {
        headers: { 'Authorization': req.headers.authorization || '' }
      });
      const opportunities = await opportunitiesResponse.json();

      // Categorize into quadrants
      const roadmap = {
        quickWins: opportunities.missedOpportunities.filter((o: any) => o.impactScore > 6 && o.effortScore < 4),
        bigBets: opportunities.missedOpportunities.filter((o: any) => o.impactScore > 6 && o.effortScore >= 6),
        fillIns: opportunities.lowRankings.filter((o: any) => o.impactScore < 4 && o.effortScore < 4),
        longTerm: opportunities.lowRankings.filter((o: any) => o.impactScore < 4 && o.effortScore >= 6),
      };

      res.json(roadmap);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Trigger Gap Analysis
  app.post("/api/brands/:brandId/analyze/gaps", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerGapAnalysis } = await import('./jobs');
      const jobId = await triggerGapAnalysis(req.params.brandId, req.body.period, 8);

      await createAuditLog(req, "trigger_gap_analysis", "brand", req.params.brandId);

      res.json({
        jobId,
        message: "Gap analysis job queued",
        status: "pending"
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/analyze/visibility", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerVisibilityScoring } = await import('./jobs');
      const jobId = await triggerVisibilityScoring(
        req.params.brandId,
        req.body.period || 'week',
        8
      );
      
      await createAuditLog(req, "trigger_visibility_scoring", "brand", req.params.brandId);
      
      res.json({ 
        jobId, 
        message: "Visibility scoring job queued",
        status: "pending",
        period: req.body.period || 'week'
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/analyze/recommendations", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerRecommendations } = await import('./jobs');
      const jobId = await triggerRecommendations(req.params.brandId, 8);
      
      await createAuditLog(req, "trigger_recommendations", "brand", req.params.brandId);
      
      res.json({ 
        jobId, 
        message: "Recommendation generation job queued",
        status: "pending"
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/analyze/full", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerFullPipeline } = await import('./jobs');
      const result = await triggerFullPipeline(req.params.brandId, 8);
      
      await createAuditLog(req, "trigger_full_analysis", "brand", req.params.brandId);
      
      res.json({ 
        ...result,
        status: "pending",
        jobCount: result.jobIds.length
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/analyze/pipeline", requireAuth, jobLimiter, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { triggerFullPipeline } = await import('./jobs');
      const result = await triggerFullPipeline(req.params.brandId, 8);
      
      await createAuditLog(req, "trigger_full_pipeline", "brand", req.params.brandId);
      
      res.json({ 
        ...result,
        status: "pending",
        jobCount: result.jobIds.length
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dev-only pipeline trigger (localhost only, remove for production)
  app.post("/api/internal/trigger-pipeline/:brandId", async (req: any, res) => {
    const clientIp = req.ip || req.connection?.remoteAddress || '';
    if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && !clientIp.includes('::ffff:127.0.0.1')) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { triggerFullPipeline } = await import('./jobs');
      const result = await triggerFullPipeline(req.params.brandId, 8);
      res.json({ ...result, status: "pending", jobCount: result.jobIds.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= BILLING & SUBSCRIPTION ROUTES =============

  // Razorpay Webhook Handler
  app.post("/api/webhooks/razorpay", webhookLimiter, async (req, res) => {
    try {
      const { handleRazorpayWebhook } = await import('./webhooks/razorpay');
      await handleRazorpayWebhook(req, res);
    } catch (error: any) {
      console.error('[Razorpay Webhook] Error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Get subscription details
  app.get("/api/brands/:brandId/subscription", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getSubscriptionDetails } = await import('./services/subscription');
      const details = await getSubscriptionDetails(req.params.brandId);
      
      res.json(details);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create subscription
  app.post("/api/brands/:brandId/subscription", requireAuth, async (req: any, res) => {
    try {
      const brandId = req.params.brandId;
      const userId = getUserId(req);
      const brand = await storage.getBrand(brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { createSubscription } = await import('./services/subscription');
      const result = await createSubscription({
        brandId,
        planId: req.body.planId,
        userId,
        customerEmail: req.body.email || '',
        customerPhone: req.body.phone || '',
        startTrial: req.body.startTrial,
      });

      await createAuditLog(req, "create_subscription", "subscription", result.subscriptionId);
      
      res.json({
        ...result,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      });
    } catch (error: any) {
      console.error("[Subscription] Create failed", {
        brandId: req.params.brandId,
        planId: req.body?.planId,
        message: error?.message,
        error: error,
      });
      res.status(400).json({ message: error.message });
    }
  });

  // Change subscription plan (upgrade/downgrade)
  app.post("/api/brands/:brandId/subscription/change-plan", requireAuth, async (req: any, res) => {
    try {
      const brandId = req.params.brandId;
      const userId = getUserId(req);
      const brand = await storage.getBrand(brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { changeSubscriptionPlan } = await import('./services/subscription');
      const result = await changeSubscriptionPlan({
        brandId,
        newPlanId: req.body.newPlanId,
        immediate: req.body.immediate !== false,
      });

      await createAuditLog(req, "change_plan", "subscription", result.subscription.id, 
        { oldPlan: result.subscription.planId }, 
        { newPlan: req.body.newPlanId }
      );
      
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Cancel subscription
  app.post("/api/brands/:brandId/subscription/cancel", requireAuth, async (req: any, res) => {
    try {
      const brandId = req.params.brandId;
      const userId = getUserId(req);
      const brand = await storage.getBrand(brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { cancelSubscription } = await import('./services/subscription');
      const subscription = await cancelSubscription({
        brandId,
        immediate: req.body.immediate,
        reason: req.body.reason,
      });

      await createAuditLog(req, "cancel_subscription", "subscription", subscription.id);
      
      res.json(subscription);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Pause subscription
  app.post("/api/brands/:brandId/subscription/pause", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { pauseSubscription } = await import('./services/subscription');
      const subscription = await pauseSubscription(req.params.brandId);

      await createAuditLog(req, "pause_subscription", "subscription", subscription.id);
      
      res.json(subscription);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Resume subscription
  app.post("/api/brands/:brandId/subscription/resume", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { resumeSubscription } = await import('./services/subscription');
      const subscription = await resumeSubscription(req.params.brandId);

      await createAuditLog(req, "resume_subscription", "subscription", subscription.id);
      
      res.json(subscription);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Sync subscription status from Razorpay
  app.post("/api/brands/:brandId/subscription/sync", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { syncSubscriptionStatus } = await import('./services/subscription');
      await syncSubscriptionStatus(req.params.brandId);
      
      res.json({ success: true, message: "Subscription synced" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get invoice PDF
  app.get("/api/invoices/:invoiceId/pdf", requireAuth, exportLimiter, async (req: any, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const brand = await storage.getBrand(invoice.brandId);
      if (!brand || brand.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { generateInvoicePDF } = await import('./services/invoice-generator');
      const pdfBuffer = await generateInvoicePDF(req.params.invoiceId);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get plan limits for brand
  app.get("/api/brands/:brandId/limits", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { getPlanLimitsForTier } = await import('./middleware/plan-enforcement');
      const limits = await getPlanLimitsForTier(brand.tier);
      
      res.json(limits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Check specific plan limit
  app.get("/api/brands/:brandId/limits/:limitType", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const { checkPlanLimit } = await import('./middleware/plan-enforcement');
      const result = await checkPlanLimit(req.params.brandId, req.params.limitType as any);
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get usage logs
  app.get("/api/brands/:brandId/usage", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandId = req.params.brandId;
      const [topics, prompts, competitors, teamMembers] = await Promise.all([
        storage.getTopicsByBrand(brandId),
        storage.getPromptsByBrand(brandId),
        storage.getCompetitorsByBrand(brandId),
        storage.getTeamMembersByBrand(brandId),
      ]);

      res.json({
        topicsUsed: topics.length,
        promptsUsed: prompts.length,
        competitorsUsed: competitors.length,
        teamMembersUsed: Math.max(1, teamMembers.length),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Tier S6 — Free-tier "shock value" endpoint. Returns the user-vs-Growth
  // comparison: "right now you see X, on Growth you'd see Y". Numbers are
  // pulled from real per-brand data so the banner feels personal.
  app.get("/api/brands/:brandId/shock-value", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const brandId = req.params.brandId;

      // Real current usage
      const [prompts, competitors, mentions, llmAnswers] = await Promise.all([
        storage.getPromptsByBrand(brandId),
        storage.getCompetitorsByBrand(brandId),
        storage.getAnswerMentionsByBrand(brandId, 5000),
        storage.getLlmAnswersByBrand?.(brandId, 1000) ?? Promise.resolve([] as any[]),
      ]);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const mentionsThisMonth = mentions.filter(m => m.createdAt && new Date(m.createdAt) >= monthStart).length;
      const llmAnswersThisMonth = (llmAnswers as any[]).filter(a => a.createdAt && new Date(a.createdAt) >= monthStart).length;

      // What free plan actually allows (per PLAN_LIMITS in plan-enforcement.ts)
      const freeAllowed = {
        prompts: 6,
        competitors: 3,
        queriesPerDay: 6,
        llmProviders: 1,
        cadence: 'monthly',
      };

      const growthAllows = {
        prompts: 1000,
        competitors: 15,
        queriesPerDay: 200,
        llmProviders: 6,
        cadence: 'daily',
      };

      // Coverage today: how many LLMs has the brand actually been sampled on?
      const providersUsed = new Set<string>();
      for (const a of llmAnswers as any[]) {
        if (a.provider) providersUsed.add(a.provider);
      }

      const monthlyRunsActual = llmAnswersThisMonth;
      const dailyRunsOnGrowth = Math.min(200, prompts.length * 6);
      const lockedProviders = 6 - providersUsed.size;
      const promptsMissed = Math.max(0, prompts.length - freeAllowed.prompts);
      const competitorsMissed = Math.max(0, competitors.length - freeAllowed.competitors);

      // Build candidate shock stats; we surface all of them in the UI
      // and let the frontend pick whichever resonates most.
      const candidates = [
        {
          id: 'visibility',
          stat: `${monthlyRunsActual} vs ${monthlyRunsActual + 1200}`,
          message: `You're sampled on ${monthlyRunsActual} LLM responses per month. Growth tier brands get sampled 1,200+ times — that's ${Math.round(1200 / Math.max(1, monthlyRunsActual))}x more data on what AI says about you.`,
          icon: 'eye',
        },
        {
          id: 'providers',
          stat: `${providersUsed.size} vs 6`,
          message: `You're checked on ${providersUsed.size} of the 6 major LLMs. AI search splits across ChatGPT, Claude, Gemini, Perplexity, Grok, and DeepSeek — only tracking ${providersUsed.size} means you don't know what ${6 - providersUsed.size} of them are saying.`,
          icon: 'bot',
        },
        {
          id: 'freshness',
          stat: 'monthly vs daily',
          message: 'Free plan runs once a month. By the time you see your data, your brand position may have already shifted. Growth runs daily so you catch drops within 24 hours.',
          icon: 'clock',
        },
        {
          id: 'competitors',
          stat: `${competitors.length} vs ${growthAllows.competitors}`,
          message: `You track ${competitors.length} competitor${competitors.length === 1 ? '' : 's'}. Growth users monitor 15 — that's the difference between a partial and complete competitive map.`,
          icon: 'target',
        },
        {
          id: 'prompts',
          stat: `${prompts.length} vs ${growthAllows.prompts}`,
          message: `You track ${prompts.length} prompts. Coverage is 1/3 of the buying-journey if you have fewer than 50. Growth users track up to 1,000 — covering every angle your buyers might use.`,
          icon: 'message',
        },
      ];

      const headline = candidates[0];

      res.json({
        tier: brand.tier || 'free',
        isFree: (brand.tier || 'free') === 'free',
        current: {
          prompts: prompts.length,
          competitors: competitors.length,
          monthlyRuns: monthlyRunsActual,
          monthlyMentions: mentionsThisMonth,
          providersCovered: providersUsed.size,
        },
        freeAllowed,
        growthAllows,
        headline,
        comparisons: candidates,
        delta: {
          prompts: promptsMissed,
          competitors: competitorsMissed,
          lockedProviders,
          dailyExtraRuns: Math.max(0, dailyRunsOnGrowth - monthlyRunsActual),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============= AI GAP ANALYSIS GENERATION (OpenRouter) =============

  app.get("/api/brands/:brandId/entity", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }
      const brandId = req.params.brandId;

      const [kgStatus, context, mentions, llmAnswers, prompts] = await Promise.all([
        storage.getKnowledgeGraphStatus(brandId),
        storage.getBrandContext(brandId),
        storage.getAnswerMentionsByBrand(brandId, 2000),
        storage.getLlmAnswersByBrand(brandId, 1000),
        storage.getPromptsByBrand(brandId),
      ]);

      let score = 0;
      const components: Array<{ key: string; weight: number; earned: number; max: number; reason: string }> = [];

      const kgScore = (kgStatus?.completenessScore ?? 0) as number;
      const kgWeight = 25;
      components.push({ key: 'wikidata', weight: kgWeight, earned: Math.round(kgScore * (kgWeight / 100)), max: kgWeight, reason: kgStatus?.wikidataId ? `Wikidata Q-${kgStatus.wikidataId}: ${Math.round(kgScore)}%` : 'No Wikidata' });
      score += Math.round(kgScore * (kgWeight / 100));

      const hasMetadata = !!(brand as any).brandDevData;
      const metadataScore = hasMetadata ? 100 : 0;
      const metadataWeight = 15;
      components.push({ key: 'metadata', weight: metadataWeight, earned: metadataScore * (metadataWeight / 100), max: metadataWeight, reason: hasMetadata ? 'Website metadata attached' : 'No website metadata' });
      score += Math.round(metadataScore * (metadataWeight / 100));

      const ctxRecord: any = (context as any) ?? {};
      const descriptionLen = (ctxRecord.description?.length ?? brand.description?.length ?? 0) as number;
      const descScore = Math.min(100, (descriptionLen / 500) * 100);
      const descWeight = 20;
      components.push({ key: 'description', weight: descWeight, earned: Math.round(descScore * (descWeight / 100)), max: descWeight, reason: descriptionLen >= 500 ? `${descriptionLen} description chars` : 'needs richer description' });
      score += Math.round(descScore * (descWeight / 100));

      const providersUsed = new Set<string>();
      for (const a of llmAnswers as any[]) if (a.provider) providersUsed.add(a.provider);
      const llmScore = Math.min(100, (providersUsed.size / 6) * 100);
      const llmWeight = 20;
      components.push({ key: 'llmCoverage', weight: llmWeight, earned: Math.round(llmScore * (llmWeight / 100)), max: llmWeight, reason: `${providersUsed.size}/6 LLMs` });
      score += Math.round(llmScore * (llmWeight / 100));

      const sources = await storage.getSourcesByBrand(brandId).catch(() => [] as any[]);
      const sourceCount = sources.length;
      const sourceScore = Math.min(100, (sourceCount / 10) * 100);
      const sourceWeight = 20;
      components.push({ key: 'citations', weight: sourceWeight, earned: Math.round(sourceScore * (sourceWeight / 100)), max: sourceWeight, reason: `${sourceCount} sources` });
      score += Math.round(sourceScore * (sourceWeight / 100));

      score = Math.max(0, Math.min(100, Math.round(score)));

      const existingClaims = (kgStatus?.existingClaims as any[]) ?? [];
      const missingClaims = (kgStatus?.missingClaims as any[]) ?? [];
      const recommendations = (kgStatus?.recommendations as any[]) ?? [];

      const mindMapByProvider: Record<string, { mentioned: number; totalAnswers: number }> = {};
      for (const a of llmAnswers as any[]) {
        const p = a.provider ?? 'unknown';
        if (!mindMapByProvider[p]) mindMapByProvider[p] = { mentioned: 0, totalAnswers: 0 };
        mindMapByProvider[p].totalAnswers++;
        if (a.content && brand.name && a.content.toLowerCase().includes(brand.name.toLowerCase())) mindMapByProvider[p].mentioned++;
      }

      res.json({
        brand: { id: brand.id, name: brand.name, domain: brand.domain, industry: brand.industry, tier: brand.tier },
        entityScore: score,
        components,
        kg: kgStatus ? { wikidataId: kgStatus.wikidataId, completenessScore: kgStatus.completenessScore, sitelinkCount: kgStatus.sitelinkCount, existingClaims, missingClaims, recommendations, lastCheckedAt: kgStatus.lastCheckedAt } : null,
        metadata: hasMetadata ? (brand as any).brandDevData : null,
        mindMap: { byProvider: mindMapByProvider, totalAnswers: llmAnswers.length },
        citations: { count: sourceCount, sources: sources.slice(0, 12).map((s: any) => ({ domain: s.domain ?? s.url ?? '', type: s.type ?? 'unknown' })) },
        prompts: { total: prompts.length, highIntent: prompts.filter((p: any) => ['comparison', 'review', 'buying', 'pricing'].includes(p.intent)).length },
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/entity/refresh", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) return res.status(404).json({ message: "Brand not found" });
      const { getJobQueue } = await import('./jobs/queue');
      const jobId = await getJobQueue().addJob('brand_enrichment', { brandId: req.params.brandId, sources: ['metadata', 'knowledgeGraph', 'wikidata'] } as any, 5);
      res.json({ jobId, status: 'queued' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/brands/:brandId/gap-analysis/generate", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brandId = req.params.brandId;
      const brand = await storage.getBrand(brandId);

      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "OpenRouter API key not configured" });
      }

      const [brandPrompts, mentions, competitors] = await Promise.all([
        storage.getPromptsByBrand(brandId),
        storage.getAnswerMentionsByBrand(brandId, 5000),
        storage.getCompetitorsByBrand(brandId),
      ]);

      const focusAreaMap: Record<string, string> = {
        "all": "all",
        "content": "content_strategy",
        "competitive": "competitive_response",
        "technical": "technical_optimization",
      };
      const requestedFocus = req.body.focusArea || "all";
      if (!focusAreaMap[requestedFocus]) {
        return res.status(400).json({ message: "Invalid focus area. Must be: all, content, competitive, or technical" });
      }
      const focusArea = focusAreaMap[requestedFocus];

      const brandAnalysisBlock = [
        `Brand: ${brand.name} (${brand.domain})`,
        `Industry: ${brand.industry || "Not specified"}`,
        `Description: ${brand.description || "Not specified"}`,
        `Tier: ${brand.tier}`,
        `Total Prompts: ${brandPrompts.length}`,
        `Total Mentions: ${mentions.length}`,
        `Competitors: ${competitors.map(c => c.name).join(", ")}`,
      ].join("\n");

      const fallbackPrompt = `You are an AI Visibility Strategist and Competitive Intelligence Analyst.

Your task is to generate a structured AI Visibility Gap Analysis and Action Plan for a brand.

INPUTS:
- brand_name: {{brand_name}}
- competitor_brand_name_1: {{competitor_brand_name_1}}
- competitor_brand_name_2: {{competitor_brand_name_2}}
- competitor_brand_name_3: {{competitor_brand_name_3}}
- focus_area: {{focus_area}}

- brand_analysis:
{{brand_analysis}}

IMPORTANT:
1. Only use the information provided in brand_analysis and competitor names.
2. Do not invent metrics or factual claims.
3. Base your suggestions on visibility gaps, authority gaps, citation gaps, topic gaps, entity clarity gaps, conversion gaps, and technical gaps.
4. Align all recommendations with AI search visibility (LLM results, AI citations, entity recognition, structured data, topical authority).

FOCUS AREA DEFINITIONS:
- content_strategy = Create or optimize content to outperform competitors on specific prompts, topics, or cited sources.
- competitive_response = Directly counter competitor advantages, positioning, messaging dominance, and authority signals.
- technical_optimization = Website structure, schema markup, internal linking, performance, crawlability, entity clarity, structured data, AI-readability improvements.
- all = Balanced mix of content_strategy, competitive_response, and technical_optimization.

Your output must be STRICT JSON.
Do not include explanations outside JSON.

OUTPUT FORMAT:

{
  "brand": "",
  "focus_area": "",
  "executive_summary": "",
  "gap_overview": {
    "visibility_gaps": [],
    "authority_gaps": [],
    "content_gaps": [],
    "technical_gaps": [],
    "entity_gaps": []
  },
  "prioritized_actions": {
    "quick_wins": [
      {
        "title": "",
        "category": "content_strategy | competitive_response | technical_optimization",
        "impact_level": "high | medium | low",
        "effort_level": "low | medium | high",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "fill_ins_short_term": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "big_bets": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ],
    "long_term": [
      {
        "title": "",
        "category": "",
        "impact_level": "",
        "effort_level": "",
        "why_this_matters": "",
        "expected_ai_visibility_outcome": ""
      }
    ]
  },
  "ai_recommendations": {
    "llm_optimization": [],
    "entity_building": [],
    "citation_strategy": [],
    "trust_signals": []
  }
}

RULES FOR PRIORITIZATION:
- Quick Wins = low effort + high/medium impact improvements that can improve AI mentions quickly.
- Fill-Ins (Short-term) = moderate effort improvements closing obvious gaps.
- Big Bets = high impact but require structured campaigns or major content/system shifts.
- Long Term = authority building, brand positioning, ecosystem strengthening.

If focus_area != "all", prioritize actions mostly within that focus_area but may include minor complementary actions if necessary.

Ensure recommendations are specific and actionable.
Avoid generic SEO advice.
Focus on AI model visibility, citation likelihood, and entity clarity.`;

      const promptText = await resolvePromptTemplateByName(
        "Gap Analysis Generation (Route)",
        fallbackPrompt,
        {
          brand_name: brand.name,
          competitor_brand_name_1: competitors[0]?.name || "N/A",
          competitor_brand_name_2: competitors[1]?.name || "N/A",
          competitor_brand_name_3: competitors[2]?.name || "N/A",
          focus_area: focusArea,
          brand_analysis: brandAnalysisBlock,
        },
      );

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://airank.io',
          'X-Title': 'AIRrank,
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: promptText }],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${(err as any).error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = (data as any).choices?.[0]?.message?.content;

      if (!content) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      let parsedResult: any;
      try {
        parsedResult = JSON.parse(content);
      } catch {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      const existingContext = await storage.getBrandContext(brandId);
      const existingGaps = existingContext?.gapAnalysis;
      const mergedGapAnalysis = Array.isArray(existingGaps)
        ? existingGaps
        : [];

      if (existingContext) {
        await storage.updateBrandContext(existingContext.id, {
          gapAnalysis: mergedGapAnalysis,
          recommendedActions: parsedResult,
        });
      } else {
        await storage.createBrandContext({
          brandId,
          gapAnalysis: mergedGapAnalysis,
          recommendedActions: parsedResult,
        });
      }

      res.json(parsedResult);
    } catch (error: any) {
      console.error("Gap analysis generation error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // ============= USER ANALYTICS TRACKING =============

  app.post("/api/analytics/track", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { brandId, eventType, pagePath, pageTitle, elementId, elementType, elementText, metadata, duration, sessionId, referrer } = req.body;

      if (!eventType) {
        return res.status(400).json({ message: "eventType is required" });
      }

      const event = await storage.createUserAnalyticsEvent({
        userId,
        brandId: brandId || null,
        sessionId: sessionId || null,
        eventType,
        pagePath: pagePath || null,
        pageTitle: pageTitle || null,
        elementId: elementId || null,
        elementType: elementType || null,
        elementText: elementText || null,
        metadata: metadata || null,
        duration: duration || null,
        referrer: referrer || null,
        userAgent: req.headers['user-agent'] || null,
      });

      res.json({ success: true, id: event.id });
    } catch (error: any) {
      console.error("Analytics tracking error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/analytics/track-batch", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { events } = req.body;

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ message: "events array is required" });
      }

      const results = [];
      for (const evt of events.slice(0, 50)) {
        try {
          const event = await storage.createUserAnalyticsEvent({
            userId,
            brandId: evt.brandId || null,
            sessionId: evt.sessionId || null,
            eventType: evt.eventType,
            pagePath: evt.pagePath || null,
            pageTitle: evt.pageTitle || null,
            elementId: evt.elementId || null,
            elementType: evt.elementType || null,
            elementText: evt.elementText || null,
            metadata: evt.metadata || null,
            duration: evt.duration || null,
            referrer: evt.referrer || null,
            userAgent: req.headers['user-agent'] || null,
          });
          results.push({ id: event.id });
        } catch (e) {
        }
      }

      res.json({ success: true, tracked: results.length });
    } catch (error: any) {
      console.error("Analytics batch tracking error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------------------------
  // Quick GEO Analysis – shown to first-time users while pipeline jobs run
  // -----------------------------------------------
  app.post("/api/brands/:brandId/quick-analysis", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandName = brand.name as string;
      const domain = (brand as any).domain as string | undefined;

      // --- 1. Wikidata Lookup ---
      let wikidataResult: any = { found: false };
      try {
        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&format=json&limit=5`;
        const searchRes = await fetch(searchUrl, {
          headers: { "User-Agent": "AIRank/1.0 (https://airank.io)" },
          signal: AbortSignal.timeout(15000),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const candidates: any[] = searchData.search || [];
          const brandLower = brandName.toLowerCase();
          const bestCandidate =
            candidates.find((c: any) => c.label?.toLowerCase() === brandLower) ||
            candidates.find((c: any) => c.label?.toLowerCase().includes(brandLower)) ||
            candidates[0];

          if (bestCandidate) {
            const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${bestCandidate.id}&format=json&props=labels|descriptions|claims|sitelinks`;
            const entityRes = await fetch(entityUrl, {
              headers: { "User-Agent": "AIRank/1.0 (https://airank.io)" },
              signal: AbortSignal.timeout(10000),
            });
            if (entityRes.ok) {
              const entityData = await entityRes.json();
              const entity = entityData.entities?.[bestCandidate.id];
              if (entity) {
                let officialWebsite: string | null = null;
                if (entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value) {
                  const val = entity.claims.P856[0].mainsnak.datavalue.value;
                  if (typeof val === "string") officialWebsite = val;
                }
                const sitelinkCount = Object.keys(entity.sitelinks || {}).length;
                const hasWikipedia = !!entity.sitelinks?.enwiki;
                const wikipediaUrl = hasWikipedia
                  ? `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title)}`
                  : null;

                let domainMatch = false;
                if (officialWebsite && domain) {
                  const cleanOfficial = officialWebsite.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
                  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
                  domainMatch = cleanOfficial.includes(cleanDomain) || cleanDomain.includes(cleanOfficial);
                }
                const labelMatch = (entity.labels?.en?.value || "").toLowerCase() === brandLower;
                const confidence = labelMatch && domainMatch ? "high" : labelMatch || domainMatch ? "medium" : "low";

                wikidataResult = {
                  found: true,
                  entity_id: bestCandidate.id,
                  label: entity.labels?.en?.value || bestCandidate.label,
                  description: entity.descriptions?.en?.value || bestCandidate.description,
                  website: officialWebsite || undefined,
                  wikipedia_url: wikipediaUrl || undefined,
                  confidence,
                  sitelinks: sitelinkCount,
                };
              }
            }
          }
        }
      } catch (wikidataErr: any) {
        console.error("[QuickAnalysis] Wikidata error:", wikidataErr.message);
      }

      // --- 2. SerpAPI Analysis ---
      let serpResult: any = { score: 0, brandMentions: 0, topRanking: null, hasKnowledgeGraph: false, hasAnswerBox: false, totalResults: 0, serp_features: {} };
      try {
        const serpApiKey = process.env.SERPAPI_API_KEY;
        if (serpApiKey) {
          const serpParams = new URLSearchParams({ engine: "google", q: brandName, api_key: serpApiKey, num: "10", hl: "en", gl: "us" });
          const serpRes = await fetch(`https://serpapi.com/search?${serpParams}`, { signal: AbortSignal.timeout(20000) });
          if (serpRes.ok) {
            const serpData = await serpRes.json();
            const organicResults: any[] = serpData.organic_results || [];
            let visibilityScore = 0;
            let brandMentions = 0;
            let topRanking: number | null = null;
            const brandLower = brandName.toLowerCase();

            organicResults.forEach((result: any, index: number) => {
              const position = index + 1;
              const title = result.title?.toLowerCase() || "";
              const snippet = result.snippet?.toLowerCase() || "";
              const link = result.link?.toLowerCase() || "";
              if (title.includes(brandLower) || snippet.includes(brandLower) || (domain && link.includes(domain.toLowerCase()))) {
                brandMentions++;
                if (!topRanking) topRanking = position;
                if (position <= 3) visibilityScore += 30;
                else if (position <= 5) visibilityScore += 20;
                else if (position <= 10) visibilityScore += 10;
              }
            });

            const kg = serpData.knowledge_graph;
            const hasKG = !!kg && !!kg.title?.toLowerCase().includes(brandLower);
            if (hasKG) visibilityScore += 40;
            if (serpData.answer_box) visibilityScore += 20;
            visibilityScore = Math.min(100, visibilityScore);

            serpResult = {
              score: visibilityScore,
              brandMentions,
              topRanking,
              hasKnowledgeGraph: hasKG,
              hasAnswerBox: !!serpData.answer_box,
              totalResults: organicResults.length,
              serp_features: {
                knowledge_panel: hasKG,
                featured_snippet: false,
                sitelinks: !!kg?.sitelinks,
                answer_box: !!serpData.answer_box,
                local_pack: false,
                shopping_results: false,
              },
            };
          }
        }
      } catch (serpErr: any) {
        console.error("[QuickAnalysis] SerpAPI error:", serpErr.message);
      }

      // --- 3. OpenRouter LLM Analysis ---
      let llmResult: any = { score: 15, recognitionLevel: "unknown", keyAssociations: [], brandContext: "", confidenceScore: 0.2, hallucinationRisk: "high", suggestions: [] };
      try {
        const openrouterKey = process.env.OPENROUTER_API_KEY;
        if (openrouterKey) {
          const domainCtx = domain ? ` (website: ${domain})` : "";
          const fallbackPrompt = `Analyze the brand "{{brand_name}}"{{domain_context}} and provide insights on its AI visibility.

Assess:
1. Definition & Identity: Who is this brand?
2. Authority & Legitimacy: Is this a recognized entity?
3. Products/Services: What does it offer?

Assess Hallucination Risk: If obscure or you are guessing, mark High.

Provide:
- Recognition score (0-100)
- Recognition level (high/medium/low/partial/unknown)
- Key brand associations (comma-separated list)
- Brief brand context description
- Confidence score (0-1)
- Hallucination Risk (Low/Medium/High)
- 3 numbered improvement suggestions`;

          const prompt = await resolvePromptTemplateByName(
            "Quick Brand Analysis (Route)",
            fallbackPrompt,
            { brand_name: brandName, domain_context: domainCtx },
          );

          const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://airank.io",
              "X-Title": "AIRank Analysis Tool",
            },
            body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 800, temperature: 0.3 }),
            signal: AbortSignal.timeout(25000),
          });

          if (llmRes.ok) {
            const llmData = await llmRes.json();
            const content: string = llmData.choices?.[0]?.message?.content || "";

            const scoreMatch = content.match(/(?:recognition\s+)?score[:\s]+(\d+)/i);
            const rawScore = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 50;

            let recognitionLevel = "unknown";
            if (rawScore >= 80) recognitionLevel = "high";
            else if (rawScore >= 60) recognitionLevel = "medium";
            else if (rawScore >= 40) recognitionLevel = "low";
            else if (rawScore >= 20) recognitionLevel = "partial";

            const riskMatch = content.match(/hallucination risk[:\s]+(low|medium|high)/i);
            const hallucinationRisk = riskMatch ? riskMatch[1].toLowerCase() : "medium";

            const associations: string[] = [];
            const assocMatch = content.match(/(?:key associations|known for|associated with|offers?)[:\s]+([^\n]+)/i);
            if (assocMatch) associations.push(...assocMatch[1].split(/[,;]/).map((s: string) => s.trim()).filter(Boolean).slice(0, 5));

            let confidenceScore = 0.5;
            if (content.length > 200) confidenceScore += 0.1;
            if (/well-known|established|recognized/i.test(content)) confidenceScore += 0.1;
            confidenceScore = Math.min(1.0, confidenceScore);

            const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
            const brandContext =
              sentences.find((s: string) => s.toLowerCase().includes(brandName.toLowerCase()) && s.length > 50 && s.length < 200)?.trim() ||
              `${brandName} is a brand with varying levels of market recognition and digital presence.`;

            const suggestions: string[] = [];
            for (const line of content.split("\n")) {
              const trimmed = line.trim();
              if (trimmed.match(/^\d+\./) || trimmed.startsWith("-") || trimmed.startsWith("•")) {
                const s = trimmed.replace(/^\d+\.\s*/, "").replace(/^[-•]\s*/, "");
                if (s.length > 10 && s.length < 150) suggestions.push(s);
              }
            }

            llmResult = { score: rawScore, recognitionLevel, keyAssociations: associations, brandContext, confidenceScore, hallucinationRisk, suggestions: suggestions.slice(0, 3) };
          }
        }
      } catch (llmErr: any) {
        console.error("[QuickAnalysis] LLM error:", llmErr.message);
      }

      // --- 4. Score Calculation ---
      let wikidataScore = 0;
      if (wikidataResult.found) {
        wikidataScore = 30;
        if (wikidataResult.confidence === "high") wikidataScore += 35;
        else if (wikidataResult.confidence === "medium") wikidataScore += 20;
        else wikidataScore += 10;
        const sl = wikidataResult.sitelinks || 0;
        if (sl >= 50) wikidataScore += 15;
        else if (sl >= 20) wikidataScore += 12;
        else if (sl >= 10) wikidataScore += 8;
        else if (sl >= 1) wikidataScore += Math.min(5, sl);
        wikidataScore = Math.min(95, wikidataScore);
      }

      let serpScore = 0;
      if (serpResult.score > 0) {
        serpScore = serpResult.brandMentions > 0 || serpResult.topRanking
          ? Math.min(serpResult.score, 70)
          : Math.min(serpResult.score * 0.5, 25);
      }
      if (serpResult.hasKnowledgeGraph) serpScore += 8;
      if (serpResult.hasAnswerBox) serpScore += 6;
      if (serpResult.topRanking === 1) serpScore += 20;
      else if (serpResult.topRanking <= 3) serpScore += 15;
      else if (serpResult.topRanking <= 5) serpScore += 10;
      else if (serpResult.topRanking <= 10) serpScore += 5;
      if (serpResult.brandMentions >= 1) serpScore += Math.min(15, serpResult.brandMentions * 3);
      serpScore = Math.min(95, serpScore);

      let llmScore = 0;
      const rawLLM = llmResult.score || 0;
      if (llmResult.recognitionLevel === "high") llmScore = Math.min(rawLLM, 95);
      else if (llmResult.recognitionLevel === "medium") llmScore = Math.min(rawLLM * 0.9, 80);
      else if (llmResult.recognitionLevel === "low") llmScore = Math.min(rawLLM * 0.7, 60);
      else if (llmResult.recognitionLevel === "partial") llmScore = Math.min(rawLLM * 0.5, 45);
      else llmScore = Math.min(rawLLM * 0.3, 25);
      if (llmResult.confidenceScore > 0.8) llmScore += 8;
      else if (llmResult.confidenceScore > 0.6) llmScore += 5;
      else if (llmResult.confidenceScore > 0.4) llmScore += 2;
      if (llmResult.hallucinationRisk === "high") llmScore = Math.min(llmScore, 35);
      else if (llmResult.hallucinationRisk === "medium") llmScore -= 10;
      llmScore = Math.max(0, Math.min(95, llmScore));

      const totalScore = Math.round(wikidataScore * 0.3 + serpScore * 0.5 + llmScore * 0.2);
      const scoreToGrade = (s: number) => {
        if (s >= 90) return "A+"; if (s >= 85) return "A"; if (s >= 80) return "A-";
        if (s >= 75) return "B+"; if (s >= 70) return "B"; if (s >= 65) return "B-";
        if (s >= 60) return "C+"; if (s >= 55) return "C"; if (s >= 50) return "C-";
        if (s >= 45) return "D+"; if (s >= 40) return "D"; return "F";
      };

      const insights: string[] = [];
      if (wikidataResult.found) {
        insights.push(wikidataResult.confidence === "high"
          ? "Strong knowledge graph presence with high-quality structured data"
          : "Present in knowledge graphs but with limited structured data");
      } else {
        insights.push("No structured knowledge graph presence detected");
      }
      if (serpResult.hasKnowledgeGraph) insights.push("Appears in Google Knowledge Graph for brand searches");
      if (serpResult.topRanking && serpResult.topRanking <= 3) insights.push(`Ranks in top ${serpResult.topRanking} position for brand name searches`);
      else if (!serpResult.brandMentions) insights.push("Limited visibility in organic search results");
      if (llmResult.recognitionLevel === "high") insights.push("Well-recognized by AI models with strong brand associations");
      else if (llmResult.recognitionLevel === "unknown") insights.push("Limited recognition in AI training data and knowledge bases");
      if (llmResult.hallucinationRisk === "high") insights.push("AI models may show confusion about this brand's identity — increase brand signals");
      if (totalScore >= 80) insights.push("Excellent overall GEO visibility across all channels");
      else if (totalScore >= 60) insights.push("Good GEO foundation with opportunities for improvement");
      else insights.push("Significant opportunities to improve generative engine visibility");

      const recommendations: string[] = [];
      if (!wikidataResult.found) recommendations.push("Create or improve Wikipedia/Wikidata presence to establish a knowledge graph entity");
      else recommendations.push("Expand multilingual Wikipedia presence and add more structured claims");
      if (!serpResult.hasKnowledgeGraph) recommendations.push("Optimize for Google Knowledge Panel inclusion through structured data and citations");
      if (!serpResult.topRanking || serpResult.topRanking > 3) recommendations.push("Improve SEO to achieve top 3 ranking for brand name searches");
      if (["low", "unknown", "partial"].includes(llmResult.recognitionLevel)) recommendations.push("Increase authoritative content creation to improve AI model recognition");
      else recommendations.push("Maintain AI visibility through consistent high-quality content publication");
      if (llmResult.suggestions?.length > 0) recommendations.push(llmResult.suggestions[0]);

      res.json({
        brandName,
        domain,
        wikidata: wikidataResult,
        serp: serpResult,
        llm: llmResult,
        score: {
          totalScore,
          grade: scoreToGrade(totalScore),
          breakdown: {
            wikidata: { score: wikidataScore, weight: 0.3, weightedScore: Math.round(wikidataScore * 0.3) },
            serp: { score: serpScore, weight: 0.5, weightedScore: Math.round(serpScore * 0.5) },
            llm: { score: llmScore, weight: 0.2, weightedScore: Math.round(llmScore * 0.2) },
          },
          insights,
          recommendations: recommendations.slice(0, 5),
        },
      });
    } catch (error: any) {
      console.error("[QuickAnalysis] Fatal error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------------------------
  // Script Installation Verification
  // -----------------------------------------------
  app.post("/api/brands/:brandId/verify-script", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const brand = await storage.getBrand(req.params.brandId);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const domain = (brand as any).domain as string | undefined;
      if (!domain) {
        return res.status(400).json({ message: "Brand has no domain configured", verified: false });
      }

      const configBrandId = brand.configBrandId;
      if (!configBrandId) {
        return res.status(400).json({ message: "Brand has no config ID", verified: false });
      }

      const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").split("/")[0].split(":")[0];

      const FQDN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!FQDN_REGEX.test(normalizedDomain)) {
        return res.status(400).json({ message: "Invalid domain format", verified: false });
      }

      const BLOCKED_PATTERNS = [
        /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
        /^0\./, /^169\.254\./, /^::1$/, /^fc00/i, /^fe80/i, /\.local$/i, /\.internal$/i,
      ];
      if (BLOCKED_PATTERNS.some(p => p.test(normalizedDomain))) {
        return res.status(400).json({ message: "Domain not allowed", verified: false });
      }

      const dns = await import("dns");
      const { promisify } = await import("util");
      const resolve4 = promisify(dns.resolve4);
      try {
        const ips = await resolve4(normalizedDomain);
        const PRIVATE_IP = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|::1|fc00|fe80)/;
        if (ips.some((ip: string) => PRIVATE_IP.test(ip))) {
          return res.status(400).json({ message: "Domain resolves to a private IP", verified: false });
        }
      } catch {
        return res.status(400).json({ message: "Domain could not be resolved", verified: false });
      }

      const urlsToCheck = [
        `https://${normalizedDomain}`,
        `https://www.${normalizedDomain}`,
      ];

      let verified = false;
      for (const url of urlsToCheck) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": "AIRankBot/1.0 (Script Verification)" },
            redirect: "manual",
          });
          if (response.ok) {
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("text/html")) continue;
            const body = await response.text();
            const html = body.substring(0, 500000);
            if (html.includes("AIRankConfig") && html.includes(configBrandId)) {
              verified = true;
              break;
            }
          }
        } catch {
          continue;
        }
      }

      if (verified) {
        await storage.updateBrand(brand.id, {
          scriptInstalled: true,
          scriptVerifiedAt: new Date(),
        } as any);
        return res.json({ verified: true, message: "Script detected on your website" });
      }

      return res.json({
        verified: false,
        message: "Script not detected. Make sure the AIRank script is added to your website's HTML head section.",
      });
    } catch (error: any) {
      console.error("[VerifyScript] Error:", error.message);
      res.status(500).json({ message: error.message, verified: false });
    }
  });

  // ============= ACTIVATION PIPELINE =============

  // POST /api/brands/:id/activate — runs full onboarding pipeline in background
  app.post("/api/brands/:id/activate", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const brand = await storage.getBrand(id);
      if (!brand || brand.userId !== userId) {
        return res.status(404).json({ error: "Brand not found" });
      }
      if ((brand as any).activationStatus === "completed") {
        return res.json({ status: "already_completed" });
      }
      if ((brand as any).activationStatus === "running") {
        return res.json({ status: "already_running" });
      }

      // Run pipeline asynchronously; client polls for progress
      setImmediate(async () => {
        const stages = [
          "brand_enrichment", "wikidata", "knowledge_graph",
          "llm_sampling", "citation_extraction", "visibility_scoring",
          "gap_analysis", "recommendations",
        ];

        try {
          await storage.setActivationStatus(id, "running");

          for (let i = 0; i < stages.length; i++) {
            reportActivationStage(id, stages[i], i + 1);
            await runActivationStage(id, stages[i]);
          }

          await storage.setActivationStatus(id, "completed");
          await storage.updateBrand(id, { onboardingCompleted: true });
          reportActivationStage(id, "completed", stages.length);

          // Send onboarding complete + analysis ready emails
          try {
            const completedBrand = await storage.getBrand(id);
            if (completedBrand?.userId) {
              const completedUser = await storage.getUser(completedBrand.userId);
              if (completedUser?.email) {
                await sendOnboardingComplete(completedUser.email, completedUser.firstName || "", completedBrand.name);
                await sendAnalysisReady(completedUser.email, completedUser.firstName || "", completedBrand.name);
              }
            }
          } catch (emailErr) {
            logger.error("[Activation] Failed to send completion emails:", emailErr);
          }
        } catch (err) {
          logger.error(`[Activation] Pipeline failed for brand ${id}:`, err);
          await storage.setActivationStatus(id, "failed");
          reportActivationStage(id, "failed", 0);
        }
      });

      res.json({ status: "started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/brands/:id/activation-progress — polled every 2 seconds by client
  app.get("/api/brands/:id/activation-progress", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const progress = await storage.getActivationStatus(id);
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.json(progress);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/integrations/status — live integration status
  app.get("/api/integrations/status", requireAuth, async (req: any, res) => {
    const settingOrEnv = async (envKey: string, settingKey?: string) => {
      const envVal = process.env[envKey];
      if (envVal) return envVal;
      return await storage.getSystemSetting((settingKey || envKey).toLowerCase());
    };

    const brandId = req.query.brandId as string | undefined;

    const [googleKg, dataforseo, serpapi, firecrawl, twitterKey, linkedinKey, youtubeKey, metaKey, googleClientId] = await Promise.all([
      settingOrEnv('GOOGLE_KG_API_KEY'),
      settingOrEnv('DATAFORSEO_KEY'),
      settingOrEnv('SERPAPI_API_KEY'),
      settingOrEnv('FIRECRAWL_API_KEY', 'firecrawl_api_key'),
      settingOrEnv('TWITTER_BEARER_TOKEN'),
      settingOrEnv('LINKEDIN_ACCESS_TOKEN'),
      settingOrEnv('YOUTUBE_API_KEY'),
      settingOrEnv('META_PAGE_TOKEN'),
      settingOrEnv('GOOGLE_OAUTH_CLIENT_ID'),
    ]);

    // Check DB for OAuth-based integrations (GSC, GA4)
    let gscStatus: string = "not_configured";
    let ga4Status: string = "not_configured";
    let xStatus: string = twitterKey ? "connected" : "not_configured";
    let instagramStatus: string = metaKey ? "connected" : "not_configured";
    let youtubeStatus: string = youtubeKey ? "connected" : "not_configured";

    if (googleClientId) {
      gscStatus = "available";
      ga4Status = "available";
    }

    if (brandId) {
      const brand = await storage.getBrand(brandId);
      const currentUser = await storage.getUser(req.userId);
      if (!brand || (brand.userId !== req.userId && !currentUser?.isAdmin)) {
        return res.status(404).json({ message: "Brand not found" });
      }

      const brandIntegrations = await db
        .select({
          platform: integrationsTable.platform,
          type: integrationsTable.type,
          status: integrationsTable.status,
          syncStatus: integrationsTable.syncStatus,
          config: integrationsTable.config,
          isActive: integrationsTable.isActive,
        })
        .from(integrationsTable)
        .where(and(
          eq(integrationsTable.brandId, brandId),
          inArray(integrationsTable.platform, ["google_search_console", "google_analytics", "x", "instagram", "youtube"])
        ));

      for (const row of brandIntegrations as any[]) {
        const platform = String(row.platform || row.type || row.config?.platform || '').toLowerCase();
        const status = String(row.status || row.syncStatus || row.sync_status || row.config?.status || (row.isActive ? 'connected' : '')).toLowerCase();
        if (platform === "google_search_console" && status === "connected") {
          gscStatus = "connected";
        }
        if (platform === "google_analytics" && status === "connected") {
          ga4Status = "connected";
        }
        if (platform === "x") {
          xStatus = status || "manual_pending";
        }
        if (platform === "instagram") {
          instagramStatus = status || "manual_pending";
        }
        if (platform === "youtube") {
          youtubeStatus = status || "manual_pending";
        }
      }
    }

    const hasSocial = twitterKey || linkedinKey || youtubeKey || metaKey || ["connected", "manual_pending"].includes(xStatus) || ["connected", "manual_pending"].includes(instagramStatus) || ["connected", "manual_pending"].includes(youtubeStatus);

    const statuses = {
      google_search_console: gscStatus,
      google_analytics:      ga4Status,
      social:                hasSocial ? "connected" : "not_configured",
      twitter:               xStatus,
      x:                     xStatus,
      linkedin:              linkedinKey ? "connected" : "not_configured",
      youtube:               youtubeStatus,
      instagram:             instagramStatus,
      meta:                  instagramStatus,
      wikidata:              "connected",
      knowledge_graph:       googleKg ? "connected" : "not_configured",
      serp:                  (dataforseo || serpapi) ? "connected" : "not_configured",
      firecrawl:             firecrawl ? "connected" : "not_configured",
    };
    res.json(statuses);
  });

  // ============= PHASE 4: MONITORING & PERFORMANCE =============

  // GET /api/admin/system/health - System health check
  app.get("/api/admin/system/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const dashboard = getMonitoringDashboard();
      const health = await dashboard.getSystemHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/system/metrics - Current metrics
  app.get("/api/admin/system/metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const dashboard = getMonitoringDashboard();
      const metrics = await dashboard.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/system/stats - Aggregated stats
  app.get("/api/admin/system/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const dashboard = getMonitoringDashboard();
      const summary = await dashboard.getDashboardSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/errors - Recent errors
  app.get("/api/admin/errors", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tracker = getErrorTracker();
      const errors = tracker.getRecent(limit);
      res.json(errors);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/admin/errors/:id/resolve - Resolve an error
  app.post("/api/admin/errors/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const tracker = getErrorTracker();
      tracker.resolve(qstr(id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/jobs/retry-status - Job retry status
  app.get("/api/admin/jobs/retry-status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const service = getJobRetryService();
      const stats = service.getStats();
      const dueRetries = service.getDueRetries();
      res.json({ stats, dueRetries: dueRetries.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/admin/rate-limits/status - Rate limit status
  app.get("/api/admin/rate-limits/status", requireAuth, requireAdmin, async (req, res) => {
    try {
      const service = getRateLimitService();
      const stats = service.getStats();
      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}

// Helper: create a minimal QueuedJob for direct worker invocation
function makeJob(brandId: string, type: string, payload: Record<string, any> = {}): any {
  return {
    id: `activation-${brandId}-${type}`,
    type,
    status: "running",
    payload: { brandId, ...payload },
    priority: 1,
    attempts: 1,
    maxAttempts: 1,
    createdAt: new Date(),
  };
}

async function runActivationStage(brandId: string, stage: string): Promise<void> {
  switch (stage) {
    case "brand_enrichment":
      await brandEnrichmentWorker(makeJob(brandId, "brand_enrichment"));
      break;
    case "wikidata":
      /* handled inside brand-enrichment */
      break;
    case "knowledge_graph":
      /* handled inside brand-enrichment */
      break;
    case "llm_sampling": {
      const prompts = await storage.getPromptsByBrand(brandId);
      const promptIds = prompts
        .map((prompt: any) => prompt?.id)
        .filter((id: any) => typeof id === "string" && id.trim().length > 0);

      if (promptIds.length === 0) {
        logger.warn(`[Activation] No prompts found for brand ${brandId}; skipping llm_sampling`);
        break;
      }

      let sampledCount = 0;
      for (const promptId of promptIds) {
        try {
          await llmSamplingWorker(makeJob(brandId, "llm_sampling", { promptId }));
          sampledCount++;
        } catch (err: any) {
          logger.warn(`[Activation] LLM sampling failed for prompt ${promptId}: ${err?.message || err}`);
        }
      }

      if (sampledCount === 0) {
        throw new Error(`No prompts sampled successfully for brand ${brandId}`);
      }
      break;
    }
    case "citation_extraction":
      await citationExtractionWorker(makeJob(brandId, "citation_extraction"));
      break;
    case "visibility_scoring":
      await visibilityScoringWorker(makeJob(brandId, "visibility_scoring"));
      break;
    case "gap_analysis":
      await gapAnalysisWorker(makeJob(brandId, "gap_analysis"));
      break;
    case "recommendations":
      await recommendationWorker(makeJob(brandId, "recommendation_generation"));
      break;
  }
}

