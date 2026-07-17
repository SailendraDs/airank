import type { Express } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../auth-middleware";
import { db } from "../db";
import { storage } from "../storage";
import {
  adminOpsTaskEvents,
  adminOpsTasks,
  brandFeatureOverrides,
  brands as brandsTable,
  integrationConnectionEvents,
  integrations,
  insertAdminOpsTaskSchema,
  llmAnswers,
  promptRuns,
} from "@shared/schema";
import { resolveFeatureAccessBatch } from "../middleware/plan-enforcement";
import { CORE_SCAN_PROVIDERS, getProviderEnvHint } from "../lib/plan-providers";

const OPS_TYPES = [
  "schema_deploy",
  "provider_recovery",
  "manual_evidence_review",
  "product_catalog_setup",
  "axp_review",
  "citation_acquisition",
  "social_setup",
  "report_qa",
  "enterprise_onboarding",
];

const DEDUPED_DESK_SOURCES = new Set([
  "provider_reliability_desk",
  "schema_deployment_desk",
  "integration_setup_desk",
  "report_qa",
]);

const CLOSED_TASK_STATUSES = new Set(["done", "cancelled"]);

const PROVIDER_RECOVERY_CHECKLIST = [
  "Run provider preflight for configured enterprise providers.",
  "Fix credential, billing, quota, model, or plan-lock blockers for failed providers.",
  "Restart workers after credential changes.",
  "Queue an enterprise pilot sweep and confirm at least four providers produce fresh answers.",
  "Verify cross-model visibility monitoring only after preflight passes and failed providers are zero.",
];

const SCHEMA_DEPLOYMENT_CHECKLIST = [
  "Deploy the active homepage JSON-LD @graph in the live homepage head.",
  "View source as a logged-out visitor and confirm application/ld+json is present.",
  "Validate the canonical homepage in Schema Markup Validator.",
  "Confirm Organization, WebSite, and WebPage nodes resolve without critical errors.",
  "Rerun Agent Readiness and use the schema proof task check before approving full agent-readiness claims.",
];

const INTEGRATION_SETUP_CHECKLIST = [
  "Confirm the requested account, handle, property, or channel belongs to the brand.",
  "Send the client setup instructions or collect the manual access/evidence snapshot.",
  "Record account identifiers, scopes, and setup status in the integration record.",
  "Attach evidence showing the connection or manual proof was reviewed.",
  "Replace manual-pending status with connected or verified manual evidence before launch claims.",
];

function schemaTemplateToSnippet(template: unknown) {
  return `<script type="application/ld+json">\n${JSON.stringify(template || {}, null, 2)}\n</script>`;
}

function integrationLabel(platform: unknown) {
  const value = String(platform || "").toLowerCase();
  if (value === "x" || value === "twitter") return "X";
  if (value === "instagram") return "Instagram";
  if (value === "youtube") return "YouTube";
  if (value === "google_analytics" || value === "ga4") return "GA4";
  if (value === "google_search_console" || value === "gsc") return "Google Search Console";
  return String(platform || "integration").replace(/_/g, " ");
}

function integrationTaskType(platform: unknown) {
  const value = String(platform || "").toLowerCase();
  return ["x", "twitter", "instagram", "youtube"].includes(value) ? "social_setup" : "manual_evidence_review";
}

function isValidEvidenceUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function integrationSetupTaskTitle(integration: any, brandName: string) {
  const label = integrationLabel(integration?.platform);
  const account = integration?.accountName || integration?.accountId || "";
  return `Complete ${label} setup for ${account || brandName}`;
}

function isSchemaProofTask(task: any) {
  const text = [
    task?.id,
    task?.title,
    task?.sourceType,
    task?.verificationMethod,
    task?.evidence?.label,
    task?.verificationNote,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return text.includes("schema") || text.includes("json-ld") || text.includes("organization") || text.includes("website");
}

function isProviderProofTask(task: any) {
  const text = [
    task?.id,
    task?.title,
    task?.sourceType,
    task?.verificationMethod,
    task?.evidence?.label,
    task?.verificationNote,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return text.includes("provider") || text.includes("cross-model") || text.includes("multi-model") || text.includes("visibility monitoring");
}

function normalizeProvider(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (text.includes("openai") || text.includes("chatgpt") || text.includes("gpt")) return "openai";
  if (text.includes("anthropic") || text.includes("claude")) return "anthropic";
  if (text.includes("google") || text.includes("gemini")) return "google";
  if (text.includes("perplexity")) return "perplexity";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("grok")) return "grok";
  return text || "unknown";
}

function newestDate(items: any[], fields: string[]) {
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
}

type ProviderReliabilityAggregate = {
  provider: string;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  totalAnswers: number;
  latestStatus: string | null;
  latestError: string | null;
  lastRunAt: Date | null;
  lastAnswerAt: Date | null;
};

function emptyProviderReliabilityAggregate(provider: string): ProviderReliabilityAggregate {
  return {
    provider,
    completedRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    totalAnswers: 0,
    latestStatus: null,
    latestError: null,
    lastRunAt: null,
    lastAnswerAt: null,
  };
}

function numberFromDb(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFromDb(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getProviderReliabilityAggregates(brandId: string): Promise<Map<string, ProviderReliabilityAggregate> | null> {
  try {
    const [runResult, answerResult] = await Promise.all([
      db.execute(sql`
        WITH latest_runs AS (
          SELECT DISTINCT ON (llm_provider)
            llm_provider,
            status,
            error,
            COALESCE(completed_at, started_at, created_at) AS latest_at
          FROM ${promptRuns}
          WHERE brand_id = ${brandId}
          ORDER BY llm_provider, COALESCE(completed_at, started_at, created_at) DESC
        ),
        latest_errors AS (
          SELECT DISTINCT ON (llm_provider)
            llm_provider,
            error
          FROM ${promptRuns}
          WHERE brand_id = ${brandId}
            AND error IS NOT NULL
            AND error <> ''
          ORDER BY llm_provider, COALESCE(completed_at, started_at, created_at) DESC
        )
        SELECT
          pr.llm_provider AS provider,
          COUNT(*) FILTER (WHERE lower(pr.status) = 'completed') AS completed_runs,
          COUNT(*) FILTER (WHERE lower(pr.status) = 'failed') AS failed_runs,
          COUNT(*) FILTER (WHERE lower(pr.status) IN ('running', 'pending')) AS running_runs,
          MAX(COALESCE(pr.completed_at, pr.started_at, pr.created_at)) AS last_run_at,
          MAX(lr.status) AS latest_status,
          MAX(le.error) AS latest_error
        FROM ${promptRuns} pr
        LEFT JOIN latest_runs lr ON lr.llm_provider = pr.llm_provider
        LEFT JOIN latest_errors le ON le.llm_provider = pr.llm_provider
        WHERE pr.brand_id = ${brandId}
        GROUP BY pr.llm_provider
      `),
      db.execute(sql`
        SELECT
          llm_provider AS provider,
          COUNT(*) AS total_answers,
          MAX(created_at) AS last_answer_at
        FROM ${llmAnswers}
        WHERE brand_id = ${brandId}
        GROUP BY llm_provider
      `),
    ]);

    const summaries = new Map<string, ProviderReliabilityAggregate>();
    for (const provider of CORE_SCAN_PROVIDERS) {
      summaries.set(provider, emptyProviderReliabilityAggregate(provider));
    }

    for (const row of ((runResult as any).rows || [])) {
      const provider = normalizeProvider(row.provider);
      const current = summaries.get(provider) || emptyProviderReliabilityAggregate(provider);
      const lastRunAt = dateFromDb(row.last_run_at);
      summaries.set(provider, {
        ...current,
        completedRuns: current.completedRuns + numberFromDb(row.completed_runs),
        failedRuns: current.failedRuns + numberFromDb(row.failed_runs),
        runningRuns: current.runningRuns + numberFromDb(row.running_runs),
        latestStatus: current.latestStatus || row.latest_status || null,
        latestError: current.latestError || row.latest_error || null,
        lastRunAt: lastRunAt && (!current.lastRunAt || lastRunAt > current.lastRunAt) ? lastRunAt : current.lastRunAt,
      });
    }

    for (const row of ((answerResult as any).rows || [])) {
      const provider = normalizeProvider(row.provider);
      const current = summaries.get(provider) || emptyProviderReliabilityAggregate(provider);
      const lastAnswerAt = dateFromDb(row.last_answer_at);
      summaries.set(provider, {
        ...current,
        totalAnswers: current.totalAnswers + numberFromDb(row.total_answers),
        lastAnswerAt: lastAnswerAt && (!current.lastAnswerAt || lastAnswerAt > current.lastAnswerAt) ? lastAnswerAt : current.lastAnswerAt,
      });
    }

    return summaries;
  } catch {
    return null;
  }
}

function providerStatus(ageHours: number | null, latestStatus: string | null, completedRuns: number, answerCount: number) {
  if (String(latestStatus || "").toLowerCase() === "failed" && answerCount === 0) return "failed";
  if (completedRuns > 0 && answerCount === 0) return "failed";
  if (ageHours == null) return "not_sampled";
  if (ageHours <= 72) return "fresh";
  if (ageHours <= 168) return "stale";
  return "expired";
}

function providerDisplayName(provider: string) {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "google") return "Google/Gemini";
  if (provider === "perplexity") return "Perplexity";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "grok") return "Grok";
  return provider;
}

function buildRecovery(provider: string, status: string, latestError: string | null, runningRuns: number, answerlessCompletedRuns: number) {
  const name = providerDisplayName(provider);
  const envHint = getProviderEnvHint(provider as any);
  const errorText = String(latestError || "").toLowerCase();
  const accountBlocked = /suspended|disabled|permission denied|forbidden|unauthorized|invalid api|api key|quota|billing|credit|balance/.test(errorText);

  if (status === "fresh") {
    return {
      severity: "ok",
      cause: `${name} has fresh answer evidence.`,
      action: "No recovery needed. Keep this provider in the scheduled scan rotation.",
      canRetry: false,
      envHint,
    };
  }
  if (runningRuns > 0) {
    return {
      severity: "watch",
      cause: `${name} has ${runningRuns} queued or running scan job${runningRuns === 1 ? "" : "s"}.`,
      action: "Wait for the current jobs to finish before queueing another provider sweep.",
      canRetry: false,
      envHint,
    };
  }
  if (status === "failed" && accountBlocked) {
    return {
      severity: "blocked",
      cause: `${name} credential, billing, quota, or account access is failing.`,
      action: `Fix ${envHint || "the provider credential"}, confirm billing/quota/API access, restart workers, rerun preflight, then queue an enterprise pilot sweep.`,
      canRetry: false,
      envHint,
    };
  }
  if (status === "failed" && answerlessCompletedRuns > 0) {
    return {
      severity: "blocked",
      cause: `${name} completed runs without persisted answers.`,
      action: "Inspect worker response parsing and persistence logs, then force a single-provider prompt run before the full sweep.",
      canRetry: true,
      envHint,
    };
  }
  if (status === "failed") {
    return {
      severity: "blocked",
      cause: `${name} scan jobs are failing.`,
      action: `Check ${envHint || "provider credentials"}, rate limits, model name, and the latest redacted worker error before client reporting.`,
      canRetry: !latestError,
      envHint,
    };
  }
  if (status === "not_sampled") {
    return {
      severity: "missing",
      cause: `${name} has no answer evidence yet.`,
      action: "Queue a provider sweep for high-intent prompts and confirm at least one answer is persisted.",
      canRetry: true,
      envHint,
    };
  }
  return {
    severity: status === "expired" ? "blocked" : "watch",
    cause: `${name} evidence is ${status}.`,
    action: "Queue a fresh provider sweep before exporting launch or competitive reports.",
    canRetry: true,
    envHint,
  };
}

async function createOrReuseOpsTask(input: Record<string, unknown>, createdBy?: string | null) {
  const parsed = insertAdminOpsTaskSchema.parse({
    ...input,
    createdBy: createdBy || input.createdBy,
  });
  const taskSource = parsed.source || "manual";

  if (parsed.brandId && DEDUPED_DESK_SOURCES.has(taskSource)) {
    const existingTasks = await db
      .select()
      .from(adminOpsTasks)
      .where(and(
        eq(adminOpsTasks.brandId, parsed.brandId),
        eq(adminOpsTasks.type, parsed.type),
        eq(adminOpsTasks.source, taskSource),
        eq(adminOpsTasks.title, parsed.title),
      ))
      .orderBy(desc(adminOpsTasks.createdAt))
      .limit(20);
    const existingOpenTask = existingTasks.find((task) => !CLOSED_TASK_STATUSES.has(task.status));
    if (existingOpenTask) {
      const existingChecklist = Array.isArray(existingOpenTask.checklistItems) ? existingOpenTask.checklistItems : [];
      const patch: Record<string, unknown> = {};
      if (
        Array.isArray(parsed.checklistItems)
        && parsed.checklistItems.length > 0
        && (
          existingChecklist.length !== parsed.checklistItems.length
          || parsed.checklistItems.some((item) => !existingChecklist.includes(item))
        )
      ) {
        patch.checklistItems = parsed.checklistItems;
      }
      if (parsed.relatedActionId && !existingOpenTask.relatedActionId) {
        patch.relatedActionId = parsed.relatedActionId;
      }
      if (parsed.relatedVerificationTaskId && !existingOpenTask.relatedVerificationTaskId) {
        patch.relatedVerificationTaskId = parsed.relatedVerificationTaskId;
      }
      if (Object.keys(patch).length > 0) {
        const [updatedTask] = await db
          .update(adminOpsTasks)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(adminOpsTasks.id, existingOpenTask.id))
          .returning();
        return {
          task: updatedTask || existingOpenTask,
          created: false,
          deduped: true,
          checklistBackfilled: Boolean(patch.checklistItems),
          relatedActionBackfilled: Boolean(patch.relatedActionId),
          relatedVerificationBackfilled: Boolean(patch.relatedVerificationTaskId),
        };
      }
      return { task: existingOpenTask, created: false, deduped: true, checklistBackfilled: false, relatedActionBackfilled: false, relatedVerificationBackfilled: false };
    }
  }

  const [task] = await db.insert(adminOpsTasks).values(parsed).returning();
  return { task, created: true, deduped: false, checklistBackfilled: false, relatedActionBackfilled: false, relatedVerificationBackfilled: false };
}

async function logOpsTaskEvent(input: {
  taskId: string;
  brandId?: string | null;
  eventType: string;
  actorUserId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  evidenceUrl?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminOpsTaskEvents).values({
    taskId: input.taskId,
    brandId: input.brandId || null,
    eventType: input.eventType,
    actorUserId: input.actorUserId || null,
    fromStatus: input.fromStatus || null,
    toStatus: input.toStatus || null,
    evidenceUrl: input.evidenceUrl || null,
    message: input.message || null,
    metadata: input.metadata || {},
  }).catch(() => undefined);
}

export function registerAdminOpsRoutes(app: Express) {
  app.get("/api/admin/ops/queue", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
      const filters = [
        status ? eq(adminOpsTasks.status, status) : undefined,
        brandId ? eq(adminOpsTasks.brandId, brandId) : undefined,
      ].filter(Boolean) as any[];

      const tasks = await db
        .select({
          id: adminOpsTasks.id,
          brandId: adminOpsTasks.brandId,
          brandName: brandsTable.name,
          title: adminOpsTasks.title,
          type: adminOpsTasks.type,
          source: adminOpsTasks.source,
          priority: adminOpsTasks.priority,
          status: adminOpsTasks.status,
          ownerUserId: adminOpsTasks.ownerUserId,
          dueAt: adminOpsTasks.dueAt,
          clientVisibleStatus: adminOpsTasks.clientVisibleStatus,
          checklistItems: adminOpsTasks.checklistItems,
          evidenceRequired: adminOpsTasks.evidenceRequired,
          evidenceUrl: adminOpsTasks.evidenceUrl,
          relatedActionId: adminOpsTasks.relatedActionId,
          relatedVerificationTaskId: adminOpsTasks.relatedVerificationTaskId,
          createdAt: adminOpsTasks.createdAt,
          updatedAt: adminOpsTasks.updatedAt,
        })
        .from(adminOpsTasks)
        .leftJoin(brandsTable, eq(adminOpsTasks.brandId, brandsTable.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(adminOpsTasks.createdAt))
        .limit(200);

      const summary = tasks.reduce((acc: Record<string, number>, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {});
      const taskIds = tasks.map((task) => task.id);
      const events = taskIds.length
        ? await db
          .select()
          .from(adminOpsTaskEvents)
          .where(brandId
            ? and(eq(adminOpsTaskEvents.brandId, brandId), inArray(adminOpsTaskEvents.taskId, taskIds))
            : inArray(adminOpsTaskEvents.taskId, taskIds))
          .orderBy(desc(adminOpsTaskEvents.createdAt))
          .limit(100)
        : [];

      res.json({ tasks, summary, types: OPS_TYPES, events });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ops/queue", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const result = await createOrReuseOpsTask(req.body, req.userId);
      await logOpsTaskEvent({
        taskId: result.task.id,
        brandId: result.task.brandId,
        eventType: result.created ? "created" : result.checklistBackfilled || result.relatedActionBackfilled || result.relatedVerificationBackfilled ? "backfilled" : "reused",
        actorUserId: req.userId,
        toStatus: result.task.status,
        message: result.created ? "Admin ops task created." : result.deduped ? "Existing open admin ops task reused." : "Admin ops task updated.",
        metadata: {
          deduped: result.deduped,
          checklistBackfilled: result.checklistBackfilled,
          relatedActionBackfilled: result.relatedActionBackfilled,
          relatedVerificationBackfilled: result.relatedVerificationBackfilled,
        },
      });
      res.status(result.created ? 201 : 200).json({
        ...result.task,
        deduped: result.deduped,
        checklistBackfilled: result.checklistBackfilled,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/admin/ops/queue/:taskId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const taskId = String(req.params.taskId);
      const [existingTask] = await db
        .select()
        .from(adminOpsTasks)
        .where(eq(adminOpsTasks.id, taskId))
        .limit(1);
      if (!existingTask) return res.status(404).json({ message: "Task not found" });

      const nextStatus = typeof req.body?.status === "string" ? req.body.status : existingTask.status;
      const nextEvidenceUrl = typeof req.body?.evidenceUrl === "string" ? req.body.evidenceUrl.trim() : existingTask.evidenceUrl;
      if (nextStatus === "done" && existingTask.evidenceRequired && !nextEvidenceUrl) {
        return res.status(400).json({
          message: "Evidence URL is required before marking this operations task done.",
          code: "evidence_required",
        });
      }
      if (nextStatus === "done" && existingTask.evidenceRequired && !isValidEvidenceUrl(nextEvidenceUrl)) {
        return res.status(400).json({
          message: "Evidence URL must be a valid http or https URL.",
          code: "invalid_evidence_url",
        });
      }

      const [task] = await db
        .update(adminOpsTasks)
        .set({ ...req.body, evidenceUrl: nextEvidenceUrl || null, updatedAt: new Date() })
        .where(eq(adminOpsTasks.id, taskId))
        .returning();
      await logOpsTaskEvent({
        taskId,
        brandId: task?.brandId || existingTask.brandId,
        eventType: nextStatus !== existingTask.status ? "status_changed" : nextEvidenceUrl !== existingTask.evidenceUrl ? "evidence_updated" : "updated",
        actorUserId: req.userId,
        fromStatus: existingTask.status,
        toStatus: nextStatus,
        evidenceUrl: nextEvidenceUrl || null,
        message: nextStatus === "done" ? "Admin ops task completed with evidence." : "Admin ops task updated.",
        metadata: {
          source: task?.source || existingTask.source,
          relatedActionId: task?.relatedActionId || existingTask.relatedActionId || null,
          relatedVerificationTaskId: task?.relatedVerificationTaskId || existingTask.relatedVerificationTaskId || null,
        },
      });
      if (
        task
        && nextStatus === "done"
        && task.source === "integration_setup_desk"
        && task.relatedActionId
        && task.brandId
        && nextEvidenceUrl
      ) {
        const [integration] = await db
          .select()
          .from(integrations)
          .where(and(eq(integrations.id, task.relatedActionId), eq(integrations.brandId, task.brandId)))
          .limit(1);
        if (integration) {
          const now = new Date();
          const config = ((integration.config && typeof integration.config === "object") ? integration.config : {}) as Record<string, unknown>;
          await db
            .update(integrations)
            .set({
              status: "connected",
              syncStatus: "connected",
              syncError: null,
              errorMessage: null,
              lastSync: now,
              updatedAt: now,
              config: {
                ...config,
                status: "connected",
                mode: "manual_evidence_verified",
                evidenceUrl: nextEvidenceUrl,
                verifiedAt: now.toISOString(),
                verifiedBy: req.userId,
              },
            } as any)
            .where(eq(integrations.id, integration.id));
          await db.insert(integrationConnectionEvents).values({
            brandId: task.brandId,
            platform: integration.platform,
            eventType: "manual_evidence_verified",
            status: "connected",
            actorUserId: req.userId,
            scopes: [],
            message: `Admin verified ${integrationLabel(integration.platform)} setup evidence for ${integration.accountName || integration.accountId || integration.platform}.`,
          }).catch(() => undefined);
        }
      }
      if (
        task
        && nextStatus === "done"
        && task.source === "schema_deployment_desk"
        && task.relatedVerificationTaskId
        && task.brandId
        && nextEvidenceUrl
      ) {
        const brand = await storage.getBrand(task.brandId);
        if (brand) {
          const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
          const verificationTasks = Array.isArray((data as any).verificationTasks) ? (data as any).verificationTasks : [];
          const updatedTasks = verificationTasks.map((item: any) => item.id === task.relatedVerificationTaskId ? {
            ...item,
            status: item.status === "verified" ? "verified" : "pending",
            verificationMethod: "manual_schema_deploy_evidence",
            verificationNote: "Homepage schema deployment evidence is attached. Rerun Agent Readiness and verify JSON-LD, Organization, and WebSite checks before marking this proof task verified.",
            evidence: {
              ...(item.evidence && typeof item.evidence === "object" ? item.evidence : {}),
              type: "manual_schema_deploy_evidence",
              deploymentEvidenceUrl: nextEvidenceUrl,
              opsTaskId: task.id,
              attachedAt: new Date().toISOString(),
              passed: item.status === "verified",
            },
            lastCheckedAt: new Date().toISOString(),
          } : item);
          await storage.updateBrand(task.brandId, {
            brandDevData: {
              ...data,
              verificationTasks: updatedTasks,
            },
          } as any).catch(() => undefined);
        }
      }
      if (
        task
        && nextStatus === "done"
        && task.source === "provider_reliability_desk"
        && task.relatedVerificationTaskId
        && task.brandId
        && nextEvidenceUrl
      ) {
        const brand = await storage.getBrand(task.brandId);
        if (brand) {
          const data = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
          const verificationTasks = Array.isArray((data as any).verificationTasks) ? (data as any).verificationTasks : [];
          const updatedTasks = verificationTasks.map((item: any) => item.id === task.relatedVerificationTaskId ? {
            ...item,
            status: item.status === "verified" ? "verified" : "pending",
            verificationMethod: "manual_provider_recovery_evidence",
            verificationNote: "Provider recovery evidence is attached. Rerun provider preflight and an enterprise pilot sweep before marking cross-model visibility monitoring verified.",
            evidence: {
              ...(item.evidence && typeof item.evidence === "object" ? item.evidence : {}),
              type: "manual_provider_recovery_evidence",
              recoveryEvidenceUrl: nextEvidenceUrl,
              opsTaskId: task.id,
              attachedAt: new Date().toISOString(),
              passed: item.status === "verified",
            },
            lastCheckedAt: new Date().toISOString(),
          } : item);
          await storage.updateBrand(task.brandId, {
            brandDevData: {
              ...data,
              verificationTasks: updatedTasks,
            },
          } as any).catch(() => undefined);
        }
      }
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId/launch-console", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = String(req.params.brandId);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });

      const [integrationsRows, events, opsTasks] = await Promise.all([
        db.select().from(integrations).where(eq(integrations.brandId, brand.id)),
        db.select().from(integrationConnectionEvents).where(eq(integrationConnectionEvents.brandId, brand.id)).orderBy(desc(integrationConnectionEvents.createdAt)).limit(50).catch(() => []),
        db.select().from(adminOpsTasks).where(eq(adminOpsTasks.brandId, brand.id)).orderBy(desc(adminOpsTasks.createdAt)).limit(50).catch(() => []),
      ]);

      const featureKeys = [
        "production_audit",
        "competitive_parity",
        "agent_readiness_full",
        "product_readiness",
        "agent_analytics",
        "ga4_oauth",
        "gsc_oauth",
        "social_x",
        "social_instagram",
        "social_youtube",
        "admin_assisted_execution",
      ];
      const entitlements = await resolveFeatureAccessBatch(brand.id, featureKeys);

      const devData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray((devData as any).verificationTasks) ? (devData as any).verificationTasks : [];
      const verifiedProofTaskIds = new Set(verificationTasks
        .filter((task: any) => String(task.status || "pending") === "verified")
        .map((task: any) => task.id)
        .filter(Boolean));
      const activeIntegrationIds = new Set(integrationsRows.map((row) => row.id));
      const allOpenOps = opsTasks.filter((task) => !["done", "cancelled"].includes(task.status));
      const pendingOps = allOpenOps.filter((task) => {
        if (task.relatedVerificationTaskId && verifiedProofTaskIds.has(task.relatedVerificationTaskId)) return false;
        if (String(task.source || "") === "integration_setup_desk" && task.relatedActionId && !activeIntegrationIds.has(task.relatedActionId)) return false;
        return true;
      });
      const proofTasksCoveredByOpenOps = new Set(pendingOps
        .map((task) => task.relatedVerificationTaskId)
        .filter(Boolean));
      const uncoveredPendingProofTasks = verificationTasks
        .filter((task: any) => String(task.status || "pending") !== "verified")
        .filter((task: any) => !proofTasksCoveredByOpenOps.has(task.id));
      const pendingIntegrationTaskTitles = new Set(pendingOps
        .filter((task) => String(task.source || "") === "integration_setup_desk")
        .map((task) => task.title));
      const pendingIntegrations = integrationsRows
        .filter((row) => row.status !== "connected")
        .filter((row) => !pendingIntegrationTaskTitles.has(integrationSetupTaskTitle(row, brand.name)));
      const blockers = [
        ...pendingOps.map((task) => ({ type: "ops_task", title: task.title, status: task.status })),
        ...uncoveredPendingProofTasks.map((task: any) => ({ type: "proof_task", title: task.title || task.id, status: task.status || "pending" })),
        ...pendingIntegrations.map((row) => ({ type: "integration", title: row.platform, status: row.status })),
      ];
      const isLaunchReady = blockers.length === 0;

      res.json({
        brand,
        readiness: {
          verdict: isLaunchReady ? "Enterprise production ready" : "Pilot launch ready with proof gaps",
          unsafeClaims: isLaunchReady ? [] : [
            "Enterprise production ready",
            "Stable multi-model coverage",
            "All recommendations verified",
          ],
          pendingProof: isLaunchReady ? [] : uncoveredPendingProofTasks.map((task: any) => task.title || task.id),
        },
        integrations: integrationsRows,
        integrationEvents: events,
        opsTasks,
        blockers,
        staleResolvedOpsTasks: allOpenOps.length - pendingOps.length,
        entitlements,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/brands/:brandId/launch-console/sync-blocker-tasks", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const brandId = String(req.params.brandId);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });

      const devData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray((devData as any).verificationTasks) ? (devData as any).verificationTasks : [];
      const pendingSchemaTask = verificationTasks.find((task: any) => (
        isSchemaProofTask(task) && String(task.status || "pending") !== "verified"
      ));
      const pendingProviderTask = verificationTasks.find((task: any) => (
        isProviderProofTask(task) && String(task.status || "pending") !== "verified"
      ));
      const pendingIntegrations = await db
        .select()
        .from(integrations)
        .where(eq(integrations.brandId, brand.id))
        .then((rows) => rows.filter((row) => String(row.status || "").toLowerCase() !== "connected"));

      const tasksToSync = [
        {
          brandId: brand.id,
          title: "Recover enterprise provider reliability",
          type: "provider_recovery",
          source: "provider_reliability_desk",
          priority: "urgent",
          evidenceRequired: true,
          checklistItems: PROVIDER_RECOVERY_CHECKLIST,
          relatedVerificationTaskId: pendingProviderTask?.id || null,
          internalNotes: [
            "External blocker: enterprise provider coverage is not yet safe for production claims.",
            "Clear condition: at least four enterprise providers fresh, zero failed providers, and zero preflight blockers.",
            ...PROVIDER_RECOVERY_CHECKLIST,
          ].join("\n"),
        },
        {
          brandId: brand.id,
          title: "Deploy homepage schema and verify Agent Readiness",
          type: "schema_deploy",
          source: "schema_deployment_desk",
          priority: "urgent",
          evidenceRequired: true,
          checklistItems: SCHEMA_DEPLOYMENT_CHECKLIST,
          relatedVerificationTaskId: pendingSchemaTask?.id || null,
          internalNotes: [
            "External blocker: live homepage schema deployment and Agent Readiness rescan are still pending.",
            pendingSchemaTask?.title ? `Related proof task: ${pendingSchemaTask.title}` : "",
            ...SCHEMA_DEPLOYMENT_CHECKLIST,
          ].filter(Boolean).join("\n"),
        },
        ...pendingIntegrations.map((integration) => {
          const label = integrationLabel(integration.platform);
          const account = integration.accountName || integration.accountId || "";
          return {
            brandId: brand.id,
            title: integrationSetupTaskTitle(integration, brand.name),
            type: integrationTaskType(integration.platform),
            source: "integration_setup_desk",
            priority: "high",
            evidenceRequired: true,
            relatedActionId: integration.id,
            checklistItems: INTEGRATION_SETUP_CHECKLIST,
            internalNotes: [
              `Integration blocker: ${label} is ${integration.status || "pending"}.`,
              account ? `Account: ${account}` : "",
              integration.syncError ? `Latest sync error: ${integration.syncError}` : "",
              ...INTEGRATION_SETUP_CHECKLIST,
            ].filter(Boolean).join("\n"),
          };
        }),
      ];

      const results = [];
      for (const taskInput of tasksToSync) {
        const result = await createOrReuseOpsTask(taskInput, req.userId);
        results.push({
          task: result.task,
          created: result.created,
          deduped: result.deduped,
          checklistBackfilled: result.checklistBackfilled,
          relatedActionBackfilled: result.relatedActionBackfilled,
          relatedVerificationBackfilled: result.relatedVerificationBackfilled,
        });
        await logOpsTaskEvent({
          taskId: result.task.id,
          brandId: result.task.brandId,
          eventType: result.created ? "sync_created" : result.checklistBackfilled || result.relatedActionBackfilled || result.relatedVerificationBackfilled ? "sync_backfilled" : "sync_reused",
          actorUserId: req.userId,
          toStatus: result.task.status,
          message: "Launch blocker sync processed this task.",
          metadata: {
            deduped: result.deduped,
            checklistBackfilled: result.checklistBackfilled,
            relatedActionBackfilled: result.relatedActionBackfilled,
            relatedVerificationBackfilled: result.relatedVerificationBackfilled,
          },
        });
      }

      res.json({
        brandId: brand.id,
        synced: results.length,
        created: results.filter((result) => result.created).length,
        reused: results.filter((result) => result.deduped).length,
        checklistBackfilled: results.filter((result) => result.checklistBackfilled).length,
        relatedActionBackfilled: results.filter((result) => result.relatedActionBackfilled).length,
        relatedVerificationBackfilled: results.filter((result) => result.relatedVerificationBackfilled).length,
        tasks: results.map((result) => ({
          id: result.task.id,
          title: result.task.title,
          type: result.task.type,
          source: result.task.source,
          status: result.task.status,
          checklistItems: Array.isArray(result.task.checklistItems) ? result.task.checklistItems.length : 0,
          created: result.created,
          deduped: result.deduped,
          checklistBackfilled: result.checklistBackfilled,
          relatedActionBackfilled: result.relatedActionBackfilled,
          relatedVerificationBackfilled: result.relatedVerificationBackfilled,
        })),
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId/schema-deployment-desk", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = String(req.params.brandId);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });

      const [schemas, opsTasks] = await Promise.all([
        storage.getSchemaTemplatesByBrand(brand.id).catch(() => []),
        db.select().from(adminOpsTasks).where(eq(adminOpsTasks.brandId, brand.id)).orderBy(desc(adminOpsTasks.createdAt)).limit(50).catch(() => []),
      ]);
      const devData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray((devData as any).verificationTasks) ? (devData as any).verificationTasks : [];
      const schemaProofTasks = verificationTasks.filter(isSchemaProofTask);
      const homepageSchema = (schemas as any[]).find((schema) => (
        schema?.isActive !== false
        && (String(schema?.schemaType || "").toLowerCase() === "homepagegraph"
          || String(schema?.name || "").toLowerCase().includes("homepage ai readiness")
          || String(schema?.name || "").toLowerCase().includes("homepage schema"))
      )) || (schemas as any[]).find((schema) => schema?.isActive !== false) || null;
      const schemaOpsTasks = (opsTasks as any[]).filter((task) => String(task.type || "") === "schema_deploy");
      const pendingProof = schemaProofTasks.filter((task: any) => String(task.status || "pending") !== "verified");
      const verifiedSchemaProofTaskIds = new Set(schemaProofTasks
        .filter((task: any) => String(task.status || "pending") === "verified")
        .map((task: any) => task.id)
        .filter(Boolean));
      const pendingSchemaOps = schemaOpsTasks.filter((task) => (
        !["done", "cancelled"].includes(String(task.status || ""))
        && !(task.relatedVerificationTaskId && verifiedSchemaProofTaskIds.has(task.relatedVerificationTaskId))
      ));
      const homepage = String((brand as any).domain || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      const homepageUrl = homepage ? `https://${homepage}` : null;

      res.json({
        brand: {
          id: brand.id,
          name: brand.name,
          domain: brand.domain,
          homepageUrl,
        },
        summary: {
          schemaAssets: (schemas as any[]).length,
          activeSchemaAssets: (schemas as any[]).filter((schema) => schema.isActive !== false).length,
          schemaProofTasks: schemaProofTasks.length,
          pendingSchemaProofTasks: pendingProof.length,
          pendingSchemaOpsTasks: pendingSchemaOps.length,
          status: !homepageSchema ? "missing_asset" : pendingProof.length > 0 || pendingSchemaOps.length > 0 ? "needs_deploy_or_rescan" : "ready_for_review",
        },
        homepageSchema: homepageSchema ? {
          id: homepageSchema.id,
          name: homepageSchema.name,
          schemaType: homepageSchema.schemaType,
          isActive: homepageSchema.isActive,
          updatedAt: homepageSchema.updatedAt,
          snippet: schemaTemplateToSnippet(homepageSchema.template),
        } : null,
        schemas: (schemas as any[]).map((schema) => ({
          id: schema.id,
          name: schema.name,
          schemaType: schema.schemaType,
          isActive: schema.isActive,
          updatedAt: schema.updatedAt,
        })),
        proofTasks: schemaProofTasks,
        opsTasks: schemaOpsTasks,
        checklist: SCHEMA_DEPLOYMENT_CHECKLIST,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/brands/:brandId/provider-reliability-desk", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = String(req.params.brandId);
      const brand = await storage.getBrand(brandId);
      if (!brand) return res.status(404).json({ message: "Brand not found" });

      const [providerAggregates, opsTasks] = await Promise.all([
        getProviderReliabilityAggregates(brand.id),
        db.select().from(adminOpsTasks).where(eq(adminOpsTasks.brandId, brand.id)).orderBy(desc(adminOpsTasks.createdAt)).limit(50).catch(() => []),
      ]);
      const [runs, answers] = providerAggregates
        ? [[], []]
        : await Promise.all([
          storage.getPromptRunsByBrand(brand.id, 2000).catch(() => []),
          storage.getLlmAnswersByBrand(brand.id, 2000).catch(() => []),
        ]);
      const devData = ((brand as any).brandDevData && typeof (brand as any).brandDevData === "object") ? (brand as any).brandDevData : {};
      const preflightRuns = Array.isArray((devData as any).providerPreflightRuns) ? (devData as any).providerPreflightRuns : [];
      const verificationTasks = Array.isArray((devData as any).verificationTasks) ? (devData as any).verificationTasks : [];
      const verifiedProviderProofTaskIds = new Set(verificationTasks
        .filter((task: any) => isProviderProofTask(task) && String(task.status || "pending") === "verified")
        .map((task: any) => task.id)
        .filter(Boolean));
      const latestPreflight = preflightRuns[0] || null;
      const latestPreflightResults = Array.isArray(latestPreflight?.results) ? latestPreflight.results : [];

      const providers = CORE_SCAN_PROVIDERS.map((provider) => {
        const aggregate = providerAggregates?.get(provider);
        const providerRuns = aggregate ? [] : (runs as any[]).filter((run: any) => normalizeProvider(run.llmProvider || run.provider || run.llmModel || run.model) === provider);
        const providerAnswers = aggregate ? [] : (answers as any[]).filter((answer: any) => normalizeProvider(answer.llmProvider || answer.provider || answer.llmModel || answer.model) === provider);
        const completedRuns = aggregate?.completedRuns ?? providerRuns.filter((run: any) => String(run.status || "").toLowerCase() === "completed").length;
        const failedRuns = aggregate?.failedRuns ?? providerRuns.filter((run: any) => String(run.status || "").toLowerCase() === "failed").length;
        const latestStatus = aggregate?.latestStatus ?? (providerRuns
          .sort((a: any, b: any) => new Date(b.completedAt || b.startedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.startedAt || a.createdAt || 0).getTime())[0]?.status || null);
        const runningRuns = aggregate?.runningRuns ?? providerRuns.filter((run: any) => ["running", "pending"].includes(String(run.status || "").toLowerCase())).length;
        const latestError = aggregate?.latestError ?? (providerRuns
          .filter((run: any) => run.error)
          .sort((a: any, b: any) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())[0]?.error || null);
        const lastRunAt = aggregate?.lastRunAt ?? newestDate(providerRuns, ["completedAt", "startedAt", "createdAt"]);
        const lastAnswerAt = aggregate?.lastAnswerAt ?? newestDate(providerAnswers, ["createdAt"]);
        const totalAnswers = aggregate?.totalAnswers ?? providerAnswers.length;
        const ageHours = lastAnswerAt ? Math.round(((Date.now() - lastAnswerAt.getTime()) / 36e5) * 10) / 10 : null;
        const status = providerStatus(ageHours, latestStatus, completedRuns, totalAnswers);
        const answerlessCompletedRuns = completedRuns > 0 && totalAnswers === 0 ? completedRuns : 0;
        const latestProviderPreflight = latestPreflightResults.find((result: any) => normalizeProvider(result?.provider) === provider) || null;
        const recovery = buildRecovery(provider, status, latestError, runningRuns, answerlessCompletedRuns);

        return {
          provider,
          label: providerDisplayName(provider),
          status,
          lastRunAt: lastRunAt?.toISOString() || null,
          lastAnswerAt: lastAnswerAt?.toISOString() || null,
          ageHours,
          completedRuns,
          failedRuns,
          latestStatus,
          runningRuns,
          totalAnswers,
          latestError,
          latestPreflight: latestProviderPreflight ? {
            ok: Boolean(latestProviderPreflight.ok),
            status: latestProviderPreflight.status || (latestProviderPreflight.ok ? "ok" : "failed"),
            message: latestProviderPreflight.message || null,
            envHint: latestProviderPreflight.envHint || recovery.envHint,
          } : null,
          recovery,
        };
      });

      const freshProviders = providers.filter((provider) => provider.status === "fresh");
      const failedProviders = providers.filter((provider) => provider.status === "failed");
      const preflightBlocked = latestPreflight ? latestPreflightResults.filter((result: any) => !result?.ok).length : null;
      const pendingProviderOps = (opsTasks as any[]).filter((task) => (
        String(task.type || "") === "provider_recovery"
        && !CLOSED_TASK_STATUSES.has(String(task.status || ""))
        && !(task.relatedVerificationTaskId && verifiedProviderProofTaskIds.has(task.relatedVerificationTaskId))
      ));
      const ready = freshProviders.length >= 4 && failedProviders.length === 0 && preflightBlocked === 0;

      res.json({
        brand: {
          id: brand.id,
          name: brand.name,
          domain: brand.domain,
        },
        summary: {
          status: ready ? "ready" : freshProviders.length > 0 ? "partial" : "blocked",
          freshEnterpriseProviders: freshProviders.length,
          enterpriseTargetProviders: CORE_SCAN_PROVIDERS.length,
          failedEnterpriseProviders: failedProviders.length,
          preflightBlocked,
          pendingProviderOpsTasks: pendingProviderOps.length,
          clearCondition: "At least four enterprise providers fresh, zero failed providers, and zero preflight blockers.",
          canClaimEnterpriseCoverage: ready,
        },
        latestPreflight: latestPreflight ? {
          id: latestPreflight.id || null,
          startedAt: latestPreflight.startedAt || null,
          finishedAt: latestPreflight.finishedAt || null,
          ok: Boolean(latestPreflight.ok),
          passed: latestPreflightResults.filter((result: any) => result?.ok).length,
          blocked: latestPreflightResults.filter((result: any) => !result?.ok).length,
          results: latestPreflightResults.map((result: any) => ({
            provider: normalizeProvider(result?.provider),
            ok: Boolean(result?.ok),
            status: result?.status || (result?.ok ? "ok" : "failed"),
            message: result?.message || null,
            envHint: result?.envHint || getProviderEnvHint(normalizeProvider(result?.provider) as any),
          })),
        } : null,
        providers,
        recoveryPlan: providers
          .filter((provider) => provider.recovery.severity !== "ok" || provider.latestPreflight?.ok === false)
          .map((provider) => ({
            provider: provider.provider,
            label: provider.label,
            status: provider.status,
            severity: provider.latestPreflight?.ok === false ? "blocked" : provider.recovery.severity,
            cause: provider.latestPreflight?.ok === false
              ? `${provider.label} latest preflight is ${provider.latestPreflight.status}.`
              : provider.recovery.cause,
            action: provider.latestPreflight?.ok === false
              ? `Resolve ${provider.latestPreflight.envHint || "provider credentials/billing/quota"}, rerun preflight, then queue an enterprise pilot sweep.`
              : provider.recovery.action,
            envHint: provider.latestPreflight?.envHint || provider.recovery.envHint,
            latestError: provider.latestError,
          })),
        opsTasks: pendingProviderOps,
        checklist: [
          "Run provider preflight for configured enterprise providers.",
          "Fix credential, billing, quota, model, or plan-lock blockers for failed providers.",
          "Restart workers after credential changes.",
          "Queue an enterprise pilot sweep and confirm at least four providers produce fresh answers.",
          "Verify cross-model visibility monitoring only after preflight passes and failed providers are zero.",
        ],
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/integration-setup-desk", requireAuth, requireAdmin, async (req, res) => {
    try {
      const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
      const expectedPlatforms = [
        { platform: "google_search_console", label: "Google Search Console", featureKey: "gsc_oauth", kind: "oauth" },
        { platform: "google_analytics", label: "GA4", featureKey: "ga4_oauth", kind: "oauth" },
        { platform: "x", label: "X", featureKey: "social_x", kind: "social" },
        { platform: "instagram", label: "Instagram", featureKey: "social_instagram", kind: "social" },
        { platform: "youtube", label: "YouTube", featureKey: "social_youtube", kind: "social" },
      ];
      const rows = await db
        .select({
          id: integrations.id,
          brandId: integrations.brandId,
          brandName: brandsTable.name,
          platform: integrations.platform,
          status: integrations.status,
          syncStatus: integrations.syncStatus,
          accountId: integrations.accountId,
          accountName: integrations.accountName,
          lastSync: integrations.lastSync,
          syncError: integrations.syncError,
          updatedAt: integrations.updatedAt,
        })
        .from(integrations)
        .leftJoin(brandsTable, eq(integrations.brandId, brandsTable.id))
        .where(brandId ? eq(integrations.brandId, brandId) : undefined)
        .orderBy(desc(integrations.updatedAt))
        .limit(200);

      const events = brandId
        ? await db.select().from(integrationConnectionEvents).where(eq(integrationConnectionEvents.brandId, brandId)).orderBy(desc(integrationConnectionEvents.createdAt)).limit(100).catch(() => [])
        : [];
      const entitlements = brandId
        ? await resolveFeatureAccessBatch(brandId, expectedPlatforms.map((item) => item.featureKey)).catch(() => [])
        : [];
      const entitlementByKey = new Map(entitlements.map((item) => [item.featureKey, item]));
      const rowByPlatform = new Map(rows.map((row) => [String(row.platform), row]));
      const verifiedEventPlatforms = new Set((events as any[])
        .filter((event) => String(event.status || "") === "connected" || String(event.eventType || "") === "manual_evidence_verified")
        .map((event) => String(event.platform || "")));
      const setupOptions = brandId ? expectedPlatforms.map((item) => {
        const row = rowByPlatform.get(item.platform);
        const entitlement = entitlementByKey.get(item.featureKey);
        const status = row?.status || (verifiedEventPlatforms.has(item.platform) ? "connected" : entitlement?.allowed ? "not_configured" : "locked");
        return {
          ...item,
          status,
          allowed: Boolean(entitlement?.allowed),
          entitlementSource: entitlement?.source || null,
          integrationId: row?.id || null,
          accountName: row?.accountName || row?.accountId || null,
          lastSync: row?.lastSync || null,
          nextStep: status === "connected"
            ? "Connection evidence is present."
            : status === "locked"
              ? "Upgrade or grant a feature override before setup."
              : item.kind === "oauth"
                ? "Start OAuth connection from the brand Integrations page."
                : "Request social setup from the brand Integrations page, then verify ownership in the admin desk.",
        };
      }) : [];

      res.json({ integrations: rows, events, setupOptions });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/brands/:brandId/feature-overrides", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { featureKey, enabled, limitValue, expiresAt, reason } = req.body;
      if (!featureKey) return res.status(400).json({ message: "featureKey is required" });

      await db
        .delete(brandFeatureOverrides)
        .where(and(eq(brandFeatureOverrides.brandId, req.params.brandId), eq(brandFeatureOverrides.featureKey, featureKey)));

      const [override] = await db.insert(brandFeatureOverrides).values({
        brandId: req.params.brandId,
        featureKey,
        enabled: Boolean(enabled),
        limitValue: limitValue ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason: reason || "Admin override",
        grantedBy: req.userId,
      }).returning();

      res.status(201).json(override);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
}
