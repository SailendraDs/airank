import type { Express, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../auth-middleware';
import { storage } from '../storage';
import {
  runAgentReadinessScan,
  getAgentReadinessAccess,
  filterReportForAccess,
} from '../services/agent-readiness';
import { createAddonCheckout, verifyAddonPayment } from '../services/addon-offers';
import {
  buildProductListingPlaybook,
  buildProductReadiness,
  buildProductVisibilityActionExport,
  buildProductVisibilityActionPlan,
  buildProductVisibilityClientReport,
  buildProductVisibilityDraftPack,
  buildProductVisibility,
  buildProductVisibilityTrend,
  activateProductPromptPack,
  discoverProductCatalogFromStorefront,
  enrichProductCatalog,
  extractProductCatalogFromUrls,
  getProductCatalog,
  getProductCatalogImportHistory,
  getProductSamplingAutomation,
  getProductVisibilityPublishQueue,
  getProductVisibilityHistory,
  launchProductSellerPilotKit,
  mapCompetitorUrlsToCatalog,
  parseProductCatalogImport,
  publishProductVisibilityQueueItem,
  queueProductVisibilityDraftPublish,
  recordProductCatalogImportAttempt,
  saveProductCatalog,
  saveProductVisibilitySnapshot,
  updateProductSamplingAutomation,
  updateProductVisibilityDraftState,
  updateProductVisibilityActionState,
  validateProductCatalog,
} from '../services/product-readiness';
import { insertAddonOfferSchema } from '@shared/schema';
import { z } from 'zod';

function getUserId(req: Request): string {
  return (req as any).userId;
}

type RouteParam = string | string[] | undefined;

function routeParam(value: RouteParam): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const HOMEPAGE_SCHEMA_FIX_IDS = new Set(['json_ld_present', 'organization_schema', 'website_schema']);

function extractJsonLdTemplate(code: string): Record<string, any> {
  const match = code.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  const raw = (match?.[1] || code || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      '@context': 'https://schema.org',
      rawSnippet: code,
    };
  }
}

function findHomepageSchemaIssue(checks: any[]): any | null {
  return checks.find((check) => check?.id === 'json_ld_present' && check?.implementationCode?.code)
    || checks.find((check) => HOMEPAGE_SCHEMA_FIX_IDS.has(String(check?.id || '')) && check?.implementationCode?.code)
    || null;
}

function combineHomepageSchemaIssues(checks: any[], topIssues: any[]): any[] {
  return [...checks, ...topIssues].reduce((items: any[], issue: any) => {
    if (!HOMEPAGE_SCHEMA_FIX_IDS.has(String(issue?.id || ''))) return items;
    const existing = items.find((item) => item.id === issue.id);
    if (existing) {
      Object.assign(existing, { ...issue, passed: existing.passed === false ? false : issue.passed });
    } else {
      items.push({ ...issue });
    }
    return items;
  }, []);
}

async function assertBrandAccess(req: Request, brandIdParam: RouteParam) {
  const brandId = routeParam(brandIdParam);
  const brand = await storage.getBrand(brandId);
  if (!brand) return { error: 'Brand not found', status: 404 as const, brand: null };
  const userId = getUserId(req);
  const user = userId ? await storage.getUser(userId) : undefined;
  const isAdmin = Boolean(user?.isAdmin);
  if (!isAdmin && brand.userId !== userId) {
    return { error: 'Forbidden', status: 403 as const, brand: null };
  }
  return { error: null, status: 200 as const, brand };
}

export function registerAgentReadinessRoutes(app: Express): void {
  // ============= AGENT READINESS (Customer) =============

  app.get('/api/brands/:brandId/agent-readiness', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const plan = await storage.getPlanCapability(brand.tier);
      const access = getAgentReadinessAccess(brand.tier, plan);
      const teaser = await storage.getLatestAgentReadinessReport(brand.id, 'teaser');
      const full = await storage.getLatestAgentReadinessReport(brand.id, 'full');
      const report = full || teaser;

      if (!report || report.status !== 'completed') {
        return res.json({
          brandId: brand.id,
          domain: brand.domain,
          access,
          hasReport: false,
        });
      }

      const payload = filterReportForAccess({
        score: report.score,
        grade: report.grade || 'poor',
        checks: (report.checks as any[]) || [],
        topIssues: (report.topIssues as any[]) || [],
        fullReport: report.fullReport as any,
        scanType: report.scanType,
        access,
        domain: brand.domain,
        brandName: brand.name,
      });

      res.json({
        ...payload,
        brandId: brand.id,
        domain: brand.domain,
        hasReport: true,
        reportId: report.id,
        scanType: report.scanType,
        scannedAt: report.createdAt,
        businessChannel: brand.businessChannel,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/agent-readiness/teaser', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const existing = await storage.getLatestAgentReadinessReport(brand.id, 'teaser');
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (existing?.createdAt && Date.now() - new Date(existing.createdAt).getTime() < maxAgeMs) {
        const plan = await storage.getPlanCapability(brand.tier);
        const access = getAgentReadinessAccess(brand.tier, plan);
        return res.json({
          cached: true,
          reportId: existing.id,
          ...filterReportForAccess({
            score: existing.score,
            grade: existing.grade || 'poor',
            checks: (existing.checks as any[]) || [],
            topIssues: (existing.topIssues as any[]) || [],
            fullReport: existing.fullReport as any,
            scanType: 'teaser',
            access,
            domain: brand.domain,
            brandName: brand.name,
          }),
        });
      }

      const result = await runAgentReadinessScan({ brand, scanType: 'teaser' });
      const saved = await storage.createAgentReadinessReport({
        brandId: brand.id,
        domain: brand.domain,
        scanType: 'teaser',
        score: result.score,
        grade: result.grade,
        checks: result.checks,
        topIssues: result.topIssues,
        status: 'completed',
        creditsUsed: result.creditsUsed,
      });

      const plan = await storage.getPlanCapability(brand.tier);
      const access = getAgentReadinessAccess(brand.tier, plan);
      res.json({
        cached: false,
        reportId: saved.id,
        ...filterReportForAccess({
          score: result.score,
          grade: result.grade,
          checks: result.checks,
          topIssues: result.topIssues,
          scanType: 'teaser',
          access,
          domain: brand.domain,
          brandName: brand.name,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/agent-readiness/scan', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const plan = await storage.getPlanCapability(brand.tier);
      const access = getAgentReadinessAccess(brand.tier, plan);
      if (access !== 'full') {
        return res.status(403).json({
          message: 'Full Agent Readiness scans require Growth plan or higher.',
          access,
          upgradeRequired: true,
        });
      }

      const result = await runAgentReadinessScan({ brand, scanType: 'full' });
      const saved = await storage.createAgentReadinessReport({
        brandId: brand.id,
        domain: brand.domain,
        scanType: 'full',
        score: result.score,
        grade: result.grade,
        checks: result.checks,
        topIssues: result.topIssues,
        fullReport: result.fullReport || null,
        status: 'completed',
        creditsUsed: result.creditsUsed,
      });

      res.json({
        reportId: saved.id,
        ...filterReportForAccess({
          score: result.score,
          grade: result.grade,
          checks: result.checks,
          topIssues: result.topIssues,
          fullReport: result.fullReport,
          scanType: 'full',
          access,
          domain: brand.domain,
          brandName: brand.name,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/agent-readiness/issues/:issueId/task', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        label: z.string().min(1).max(160),
        severity: z.enum(['critical', 'warning', 'info']).default('warning'),
        message: z.string().max(500).optional(),
        fixHint: z.string().max(500).optional(),
        whyItMatters: z.string().max(800).optional(),
        implementationSteps: z.array(z.string().max(500)).max(8).optional(),
        verificationSteps: z.array(z.string().max(500)).max(8).optional(),
        implementationCode: z.object({
          title: z.string().max(160),
          language: z.string().max(40),
          code: z.string().max(12000),
        }).optional(),
      });
      const payload = schema.parse(req.body || {});
      const issueId = routeParam(req.params.issueId);
      const estimatedImpact = payload.severity === 'critical' ? 9 : payload.severity === 'warning' ? 6 : 3;
      const descriptionParts = [
        `Agent Readiness: ${payload.label}`,
        payload.fixHint || payload.message || '',
        payload.whyItMatters ? `Why it matters: ${payload.whyItMatters}` : '',
        payload.implementationSteps?.length ? `Implementation steps: ${payload.implementationSteps.join(' | ')}` : '',
        payload.verificationSteps?.length ? `Verification: ${payload.verificationSteps.join(' | ')}` : '',
        payload.implementationCode?.code ? `Snippet: ${payload.implementationCode.title} (${payload.implementationCode.language})` : '',
      ].filter(Boolean);

      const existing = await storage.getOptimizationLogsByBrand(brand.id, 100);
      const duplicate = existing.find((log: any) => (
        log.status !== 'verified'
        && log.actionType === `agent_readiness:${issueId}`
        && String(log.actionDescription || '').includes(`Agent Readiness: ${payload.label}`)
      ));
      if (duplicate) {
        return res.json({ task: duplicate, duplicate: true });
      }

      const task = await storage.createOptimizationLog({
        brandId: brand.id,
        actionType: `agent_readiness:${issueId}`,
        actionDescription: descriptionParts.join('\n'),
        estimatedImpact,
        status: 'pending',
      });

      res.json({ task, duplicate: false });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/agent-readiness/schema-fix-pack', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      let report = await storage.getLatestAgentReadinessReport(brand.id, 'full')
        || await storage.getLatestAgentReadinessReport(brand.id, 'teaser');

      if (!report || report.status !== 'completed') {
        const result = await runAgentReadinessScan({ brand, scanType: 'teaser' });
        report = await storage.createAgentReadinessReport({
          brandId: brand.id,
          domain: brand.domain,
          scanType: 'teaser',
          score: result.score,
          grade: result.grade,
          checks: result.checks,
          topIssues: result.topIssues,
          status: 'completed',
          creditsUsed: result.creditsUsed,
        });
      }

      let checks = ((report.checks as any[]) || []).filter(Boolean);
      let topIssues = ((report.topIssues as any[]) || []).filter(Boolean);
      let combinedIssues = combineHomepageSchemaIssues(checks, topIssues);
      let schemaIssues = combinedIssues.filter((check: any) => check.passed !== true);
      if (schemaIssues.length === 0) {
        return res.json({
          ready: true,
          message: 'Homepage JSON-LD, Organization, and WebSite schema already pass in the latest Agent Readiness scan.',
          issues: [],
        });
      }

      let schemaSource = findHomepageSchemaIssue(schemaIssues) || findHomepageSchemaIssue(combinedIssues);
      if (!schemaSource?.implementationCode?.code) {
        const result = await runAgentReadinessScan({ brand, scanType: 'teaser' });
        report = await storage.createAgentReadinessReport({
          brandId: brand.id,
          domain: brand.domain,
          scanType: 'teaser',
          score: result.score,
          grade: result.grade,
          checks: result.checks,
          topIssues: result.topIssues,
          status: 'completed',
          creditsUsed: result.creditsUsed,
        });
        checks = result.checks || [];
        topIssues = result.topIssues || [];
        combinedIssues = combineHomepageSchemaIssues(checks, topIssues);
        schemaIssues = combinedIssues.filter((check: any) => check.passed !== true);
        schemaSource = findHomepageSchemaIssue(schemaIssues) || findHomepageSchemaIssue(combinedIssues);
      }
      if (!schemaSource?.implementationCode?.code) {
        return res.status(409).json({ message: 'No homepage schema implementation snippet is available for the latest scan.' });
      }

      const templatePayload = extractJsonLdTemplate(schemaSource.implementationCode.code);
      const schemaSnippet = schemaSource.implementationCode.code;
      const cleanDomain = String(brand.domain || '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split(/[/?#\s]/)[0];
      const homepageUrl = cleanDomain ? `https://${cleanDomain}` : String(brand.domain || '');
      const validatorUrl = homepageUrl
        ? `https://validator.schema.org/#url=${encodeURIComponent(homepageUrl)}`
        : 'https://validator.schema.org/';
      const deployPack = {
        title: 'Homepage AI Readiness Schema Fix Pack',
        target: {
          page: 'Homepage',
          placement: 'Inside the <head> before the closing </head> tag',
          domain: cleanDomain || brand.domain,
          url: homepageUrl,
        },
        files: [
          {
            path: 'homepage-head-jsonld.html',
            language: 'html',
            description: 'Paste this exact JSON-LD block into the homepage head after replacing placeholder logo/social URLs.',
            content: schemaSnippet,
          },
          {
            path: 'agent-readiness-qa.md',
            language: 'markdown',
            description: 'Developer QA checklist for the schema deployment.',
            content: [
              '# Agent Readiness Schema QA',
              '',
              `Brand: ${brand.name}`,
              `Homepage: ${homepageUrl || brand.domain}`,
              '',
              '## Before Publish',
              '- Replace placeholder logo URL with the final public logo asset.',
              '- Replace placeholder sameAs links with official brand profiles only.',
              '- Confirm Organization @id, WebSite @id, and WebPage @id use the canonical domain.',
              '- Keep one JSON-LD @graph block on the homepage to avoid conflicting duplicate entity facts.',
              '',
              '## After Publish',
              `- Validate the page in Schema Markup Validator: ${validatorUrl}`,
              '- Confirm Organization, WebSite, and WebPage nodes are detected.',
              '- Open view-source and confirm application/ld+json appears on the homepage.',
              '- Rerun AIRank Agent Readiness and verify JSON-LD, Organization schema, and WebSite schema pass.',
            ].join('\n'),
          },
        ],
        cmsInstall: [
          { platform: 'WordPress', steps: ['Add the JSON-LD through the theme header, a code-snippet plugin, or SEO/schema plugin custom schema field.', 'Clear page/cache/CDN cache.', 'View source to confirm the script renders for logged-out visitors.'] },
          { platform: 'Shopify', steps: ['Add the JSON-LD to theme.liquid inside <head> or the homepage template section.', 'Avoid duplicating Organization schema emitted by another app.', 'Preview and validate the live homepage.'] },
          { platform: 'Webflow/Framer', steps: ['Add the JSON-LD in custom code for the homepage head.', 'Publish the site, not only preview.', 'Validate the published canonical URL.'] },
          { platform: 'Next.js/React', steps: ['Render the script in the homepage head using the framework Head/metadata mechanism.', 'Use type application/ld+json and dangerouslySetInnerHTML or equivalent escaped JSON output.', 'Deploy and verify server-rendered HTML contains the block.'] },
        ],
        validation: {
          validatorUrl,
          requiredNodes: ['Organization', 'WebSite', 'WebPage'],
          acceptanceCriteria: [
            'Schema validator detects Organization, WebSite, and WebPage without critical errors.',
            'Organization name and url match the brand and canonical homepage.',
            'WebSite publisher points to the Organization @id.',
            'AIRank Agent Readiness marks JSON-LD, Organization schema, and WebSite schema as passing.',
          ],
        },
      };
      const templateName = 'Homepage AI Readiness Schema Fix Pack';
      const existingTemplates = await storage.getSchemaTemplatesByBrand(brand.id);
      const existingTemplate = existingTemplates.find((template: any) => (
        template.name === templateName || template.schemaType === 'HomepageGraph'
      ));

      const schemaTemplate = existingTemplate
        ? await storage.updateSchemaTemplate(existingTemplate.id, {
          name: templateName,
          schemaType: 'HomepageGraph',
          template: templatePayload,
          isActive: true,
          isGlobal: false,
        } as any)
        : await storage.createSchemaTemplate({
          brandId: brand.id,
          name: templateName,
          schemaType: 'HomepageGraph',
          template: templatePayload,
          isActive: true,
          isGlobal: false,
          createdBy: getUserId(req),
        } as any);

      const issueLabels = schemaIssues.map((issue: any) => issue.label || issue.id).join(', ');
      const descriptionParts = [
        'Agent Readiness: Homepage schema fix pack',
        `Fixes latest failing schema checks: ${issueLabels}`,
        'Publish one JSON-LD @graph on the homepage containing Organization, WebSite, and WebPage nodes.',
        'Deploy it in the homepage <head>, validate with Schema Markup Validator, then rerun Agent Readiness.',
        `Schema asset: ${schemaTemplate.id}`,
      ];

      const existingTasks = await storage.getOptimizationLogsByBrand(brand.id, 100);
      const duplicateTask = existingTasks.find((log: any) => (
        log.status !== 'verified'
        && log.actionType === 'agent_readiness:schema_fix_pack'
      ));

      const task = duplicateTask || await storage.createOptimizationLog({
        brandId: brand.id,
        actionType: 'agent_readiness:schema_fix_pack',
        actionDescription: descriptionParts.join('\n'),
        estimatedImpact: 10,
        status: 'pending',
      });

      res.json({
        ready: false,
        schemaTemplate,
        deployPack,
        task,
        duplicateTask: Boolean(duplicateTask),
        duplicateTemplate: Boolean(existingTemplate),
        issues: schemaIssues.map((issue: any) => ({
          id: issue.id,
          label: issue.label,
          severity: issue.severity,
          message: issue.message,
        })),
        nextSteps: [
          'Open Content & AXP > Schema and review the Homepage AI Readiness Schema Fix Pack.',
          'Add real logo and official sameAs links before publishing.',
          'Deploy the JSON-LD on the homepage and rerun Agent Readiness.',
        ],
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-readiness', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const readiness = await buildProductReadiness(brand);
      res.json(readiness);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-catalog', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const products = await getProductCatalog(brand.id);
      res.json({ products, count: products.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-catalog/import-history', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const history = await getProductCatalogImportHistory(brand.id);
      res.json({ history, count: history.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-playbook', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const playbook = await buildProductListingPlaybook(brand);
      res.json(playbook);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const visibility = await buildProductVisibility(brand);
      res.json(visibility);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/history', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const history = await getProductVisibilityHistory(brand.id);
      res.json({ history, count: history.length, trend: buildProductVisibilityTrend(history) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-sampling-automation', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const automation = await getProductSamplingAutomation(brand.id);
      res.json(automation);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-seller-pilot-kit', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        products: z.array(z.unknown()).max(100).optional(),
        enrich: z.boolean().optional(),
        createPrompts: z.boolean().optional(),
        queueSampling: z.boolean().optional(),
        maxPrompts: z.number().int().min(1).max(40).optional(),
      });
      const payload = schema.parse(req.body || {});
      const kit = await launchProductSellerPilotKit(brand, payload);
      res.json(kit);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-prompt-pack/activate', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        maxPrompts: z.number().int().min(1).max(40).optional(),
        maxSamplingPrompts: z.number().int().min(1).max(15).optional(),
      });
      const payload = schema.parse(req.body || {});
      const activation = await activateProductPromptPack(brand, payload);
      res.json(activation);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-pilot-checks/:checkId/task', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const checkId = routeParam(req.params.checkId);
      const report = await buildProductVisibilityClientReport(brand);
      const check = report.pilotReadiness.checks.find((item) => item.id === checkId);
      if (!check) return res.status(404).json({ message: 'Product pilot check not found' });

      const actionType = `product_pilot:${check.id}`;
      const existing = await storage.getOptimizationLogsByBrand(brand.id, 100);
      const duplicate = existing.find((log: any) => (
        log.status !== 'verified'
        && log.actionType === actionType
      ));
      if (duplicate) {
        return res.json({ task: duplicate, duplicate: true, check });
      }

      const descriptionParts = [
        `Product Pilot: ${check.label}`,
        `Evidence: ${check.evidence}`,
        `Fix: ${check.fix}`,
        `Pilot status: ${report.pilotReadiness.status} (${report.pilotReadiness.score}/100)`,
        report.pilotReadiness.blockers.length ? `Current blockers: ${report.pilotReadiness.blockers.join(', ')}` : '',
      ].filter(Boolean);

      const task = await storage.createOptimizationLog({
        brandId: brand.id,
        actionType,
        actionDescription: descriptionParts.join('\n'),
        estimatedImpact: check.status === 'missing' ? 9 : check.status === 'warning' ? 6 : 3,
        status: 'pending',
      });

      res.json({ task, duplicate: false, check });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/brands/:brandId/product-sampling-automation', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        enabled: z.boolean().optional(),
        frequency: z.enum(['daily', 'weekly', 'manual']).optional(),
        maxPromptsPerRun: z.number().int().min(1).max(25).optional(),
      });
      const payload = schema.parse(req.body || {});
      const automation = await updateProductSamplingAutomation(brand.id, payload, getUserId(req));
      res.json(automation);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/actions', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const actionPlan = await buildProductVisibilityActionPlan(brand);
      res.json(actionPlan);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/brands/:brandId/product-visibility/actions/:actionId', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
        note: z.string().max(500).optional(),
      });
      const payload = schema.parse(req.body || {});
      const actionState = await updateProductVisibilityActionState(brand.id, routeParam(req.params.actionId), payload.status, payload.note);
      const actionPlan = await buildProductVisibilityActionPlan(brand);
      res.json({ actionState, actionPlan });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/actions-export', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const exportPack = await buildProductVisibilityActionExport(brand);
      res.json(exportPack);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/client-report', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const clientReport = await buildProductVisibilityClientReport(brand);
      res.json(clientReport);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/client-report/pdf', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const { getPDFReportGenerator } = await import('../services/pdf-generator');
      const pdfBuffer = await getPDFReportGenerator().generateProductVisibilityClientReport(brand);
      const filename = `${brand.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brand'}-product-visibility-report-${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/drafts', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const draftPack = await buildProductVisibilityDraftPack(brand);
      res.json(draftPack);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch('/api/brands/:brandId/product-visibility/drafts/:actionId', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        status: z.enum(['draft', 'in_review', 'approved', 'rejected']),
        note: z.string().max(500).optional(),
        markdown: z.string().max(20000).optional(),
        assignee: z.string().max(120).optional(),
      });
      const payload = schema.parse(req.body || {});
      const actionId = routeParam(req.params.actionId);
      const existingDraftPack = await buildProductVisibilityDraftPack(brand);
      const existingDraft = existingDraftPack.drafts.find((draft) => draft.actionId === actionId);
      const draftMarkdown = typeof payload.markdown === 'string' ? payload.markdown : existingDraft?.markdown;
      const draftState = await updateProductVisibilityDraftState(brand.id, actionId, payload.status, payload.note, draftMarkdown, {
        reviewerId: getUserId(req),
        assignee: payload.assignee,
      });
      const draftPack = await buildProductVisibilityDraftPack(brand);
      res.json({ draftState, draftPack });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/brands/:brandId/product-visibility/publish-queue', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const publishQueue = await getProductVisibilityPublishQueue(brand);
      res.json(publishQueue);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-visibility/drafts/:actionId/publish', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        channel: z.enum(['schema', 'faq', 'cms_export', 'axp']),
        note: z.string().max(500).optional(),
      });
      const payload = schema.parse(req.body || {});
      const publishQueue = await queueProductVisibilityDraftPublish(brand, routeParam(req.params.actionId), payload.channel, payload.note, getUserId(req));
      res.json(publishQueue);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-visibility/publish-queue/:itemId/publish', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const publishQueue = await publishProductVisibilityQueueItem(brand, routeParam(req.params.itemId), getUserId(req));
      res.json(publishQueue);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-visibility/snapshot', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const snapshot = await saveProductVisibilitySnapshot(brand);
      const history = await getProductVisibilityHistory(brand.id);
      res.json({ snapshot, history, count: history.length, trend: buildProductVisibilityTrend(history) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-catalog/validate', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        mode: z.enum(['json', 'csv']).default('json'),
        input: z.unknown().optional(),
        products: z.array(z.unknown()).optional(),
      });
      const payload = schema.parse(req.body || {});
      const validation = parseProductCatalogImport(payload.mode === 'csv' ? payload.input : payload.products ?? payload.input, payload.mode);
      res.json(validation);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-catalog/extract', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        urls: z.array(z.string().url()).min(1).max(20),
      });
      const payload = schema.parse(req.body || {});
      const extraction = await extractProductCatalogFromUrls(payload.urls);
      res.json(extraction);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-catalog/discover', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        url: z.string().url(),
        limit: z.number().int().min(1).max(20).optional(),
      });
      const payload = schema.parse(req.body || {});
      const discovery = await discoverProductCatalogFromStorefront(payload.url, payload.limit || 12);
      res.json(discovery);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-catalog/enrich', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        products: z.array(z.unknown()).min(1).max(100),
      });
      const payload = schema.parse(req.body || {});
      const enrichment = enrichProductCatalog(payload.products);
      res.json(enrichment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/product-catalog/map-competitors', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        products: z.array(z.unknown()).min(1).max(100),
        competitorUrls: z.array(z.string().url()).min(1).max(20),
      });
      const payload = schema.parse(req.body || {});
      const mapping = await mapCompetitorUrlsToCatalog(payload.products, payload.competitorUrls);
      res.json(mapping);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put('/api/brands/:brandId/product-catalog', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });

      const schema = z.object({
        mode: z.enum(['json', 'csv']).optional(),
        products: z.array(z.unknown()).max(100),
      });
      const { products, mode } = schema.parse(req.body || {});
      const validation = validateProductCatalog(products);
      if (!validation.valid) {
        await recordProductCatalogImportAttempt(brand.id, validation, {
          status: 'failed',
          mode: mode || 'json',
          source: 'api',
          message: validation.errors[0],
        });
        return res.status(400).json({ message: validation.errors[0], validation });
      }
      const saved = await saveProductCatalog(brand.id, products, { mode: mode || 'json', source: 'api' });
      res.json({ products: saved, count: saved.length, validation: validateProductCatalog(saved) });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ============= ADD-ON OFFERS (Customer) =============

  app.get('/api/brands/:brandId/addon-offers', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });
      const { getEffectiveOffersForBrand } = await import('../services/addon-offers');
      const offers = await getEffectiveOffersForBrand(brand.id);
      res.json({ offers });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/addon-offers/:offerId/checkout', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });
      const checkout = await createAddonCheckout({
        brand,
        userId: getUserId(req),
        offerId: routeParam(req.params.offerId),
      });
      res.json(checkout);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/brands/:brandId/addon-offers/verify', requireAuth, async (req, res) => {
    try {
      const { brand, error, status } = await assertBrandAccess(req, req.params.brandId);
      if (!brand) return res.status(status).json({ message: error });
      const { purchaseId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
      if (!purchaseId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: 'Missing payment verification fields' });
      }
      await verifyAddonPayment({ purchaseId, razorpayOrderId, razorpayPaymentId, razorpaySignature });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ============= ADMIN: ADD-ON OFFERS =============

  app.get('/api/admin/addon-offers', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const offers = await storage.getAllAddonOffers();
      const enriched = await Promise.all(offers.map(async (offer) => {
        const brandLinks = await storage.getAddonOfferBrands(offer.id);
        return { ...offer, brandLinks };
      }));
      res.json({ offers: enriched });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/admin/addon-offers', requireAuth, requireAdmin, async (req, res) => {
    try {
      const data = insertAddonOfferSchema.parse(req.body);
      const offer = await storage.createAddonOffer(data);
      res.json(offer);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/admin/addon-offers/:offerId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const offerId = routeParam(req.params.offerId);
      const offer = await storage.updateAddonOffer(offerId, req.body);
      res.json(offer);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/admin/addon-offers/:offerId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const offerId = routeParam(req.params.offerId);
      await storage.deleteAddonOffer(offerId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put('/api/admin/addon-offers/:offerId/brands', requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        brandIds: z.array(z.string()),
        priceOverrideInr: z.number().optional().nullable(),
      });
      const { brandIds, priceOverrideInr } = schema.parse(req.body);
      const offerId = routeParam(req.params.offerId);
      const offer = await storage.getAddonOffer(offerId);
      if (!offer) return res.status(404).json({ message: 'Offer not found' });

      await storage.updateAddonOffer(offerId, { visibility: 'selected' });

      const existing = await storage.getAddonOfferBrands(offerId);
      for (const link of existing) {
        if (!brandIds.includes(link.brandId)) {
          await storage.deleteAddonOfferBrand(link.id);
        }
      }
      for (const brandId of brandIds) {
        await storage.upsertAddonOfferBrand({
          offerId,
          brandId,
          priceOverrideInr: priceOverrideInr ?? null,
          isEnabled: true,
        });
      }
      const brandLinks = await storage.getAddonOfferBrands(offerId);
      res.json({ offer: await storage.getAddonOffer(offerId), brandLinks });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put('/api/admin/brands/:brandId/addon-offers', requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        offers: z.array(z.object({
          offerId: z.string(),
          priceOverrideInr: z.number().optional().nullable(),
          isEnabled: z.boolean().optional(),
        })),
      });
      const { offers } = schema.parse(req.body);
      const brandId = routeParam(req.params.brandId);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: 'Brand not found' });

      for (const item of offers) {
        const offer = await storage.getAddonOffer(item.offerId);
        if (!offer) continue;
        if (offer.visibility === 'all' && item.priceOverrideInr != null) {
          await storage.upsertAddonOfferBrand({
            offerId: item.offerId,
            brandId,
            priceOverrideInr: item.priceOverrideInr,
            isEnabled: item.isEnabled ?? true,
          });
        } else if (offer.visibility === 'selected') {
          await storage.upsertAddonOfferBrand({
            offerId: item.offerId,
            brandId,
            priceOverrideInr: item.priceOverrideInr ?? null,
            isEnabled: item.isEnabled ?? true,
          });
        }
      }

      const visible = await storage.getAddonOffersForBrand(brandId);
      const links = await storage.getAddonOfferBrandsByBrand(brandId);
      res.json({ offers: visible, brandLinks: links });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/admin/brands/:brandId/addon-offers', requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = routeParam(req.params.brandId);
      const allOffers = await storage.getAllAddonOffers();
      const visible = await storage.getAddonOffersForBrand(brandId);
      const links = await storage.getAddonOfferBrandsByBrand(brandId);
      res.json({ allOffers, visible, brandLinks: links });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
