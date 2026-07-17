#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const LEGACY_SQL_PATH = process.argv[2] || "/opt/geoscore/client/public/u907274113_geoscore.sql";
const OUTPUT_DIR = process.argv[3] || "/opt/geoscore/backups";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const REQUIRED_TABLES = new Set([
  "users",
  "brands",
  "brand_competitors",
  "topics",
  "queries",
  "brand_analytics",
  "platforms",
  "domains",
  "search_executions",
  "execution_brands",
  "execution_citations",
]);

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function normalizeDomain(domain) {
  if (!domain) return null;
  return String(domain).trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const s = String(value).toLowerCase().trim();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

function safeJsonParse(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function splitName(name) {
  const clean = (name || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "User", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function sanitizePasswordSegment(value, fallback) {
  const out = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
  return out || fallback;
}

function defaultPassword(name, domain) {
  const namePart = sanitizePasswordSegment((name || "").split(/\s+/)[0], "user");
  const brandPart = sanitizePasswordSegment((domain || "").split(".")[0], "brand");
  return `${namePart}_${brandPart}@123#`;
}

function findStatementEnd(sql, fromIdx) {
  let inQuote = false;
  for (let i = fromIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== "\\") {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote && ch === "\\") {
      i += 1;
      continue;
    }
    if (!inQuote && ch === ";") return i;
  }
  return -1;
}

function extractInsertStatements(sql, tableFilter) {
  const out = new Map();
  let idx = 0;
  while (true) {
    const start = sql.indexOf("INSERT INTO `", idx);
    if (start === -1) break;

    const tableNameStart = start + "INSERT INTO `".length;
    const tableNameEnd = sql.indexOf("`", tableNameStart);
    if (tableNameEnd === -1) break;
    const table = sql.slice(tableNameStart, tableNameEnd);

    const stmtEnd = findStatementEnd(sql, tableNameEnd);
    if (stmtEnd === -1) break;

    if (tableFilter.has(table)) {
      const stmt = sql.slice(start, stmtEnd + 1);
      if (!out.has(table)) out.set(table, []);
      out.get(table).push(stmt);
    }

    idx = stmtEnd + 1;
  }
  return out;
}

function unescapeSqlString(raw) {
  let s = raw;
  s = s.replace(/\\'/g, "'");
  s = s.replace(/\\\\/g, "\\");
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/\\r/g, "\r");
  s = s.replace(/\\t/g, "\t");
  s = s.replace(/\\0/g, "\0");
  return s;
}

function parseToken(token) {
  const t = token.trim();
  if (t.toUpperCase() === "NULL") return null;
  if (t.startsWith("'") && t.endsWith("'")) {
    return unescapeSqlString(t.slice(1, -1));
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    return t;
  }
  return t;
}

function splitFields(rowBody) {
  const fields = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < rowBody.length; i++) {
    const ch = rowBody[i];
    if (ch === "'" && rowBody[i - 1] !== "\\") {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (!inQuote && ch === ",") {
      fields.push(buf);
      buf = "";
      continue;
    }
    if (inQuote && ch === "\\") {
      buf += ch;
      if (i + 1 < rowBody.length) {
        i += 1;
        buf += rowBody[i];
      }
      continue;
    }
    buf += ch;
  }
  fields.push(buf);
  return fields;
}

function extractRows(valuesPart) {
  const rows = [];
  let inQuote = false;
  let depth = 0;
  let rowStart = -1;

  for (let i = 0; i < valuesPart.length; i++) {
    const ch = valuesPart[i];

    if (ch === "'" && valuesPart[i - 1] !== "\\") {
      inQuote = !inQuote;
      continue;
    }

    if (inQuote && ch === "\\") {
      i += 1;
      continue;
    }

    if (!inQuote && ch === "(") {
      if (depth === 0) rowStart = i;
      depth += 1;
      continue;
    }

    if (!inQuote && ch === ")") {
      depth -= 1;
      if (depth === 0 && rowStart >= 0) {
        rows.push(valuesPart.slice(rowStart + 1, i));
        rowStart = -1;
      }
      continue;
    }
  }

  return rows;
}

function parseInsertStatement(statement) {
  const m = statement.match(/^INSERT INTO `([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*);$/);
  if (!m) return null;

  const table = m[1];
  const colPart = m[2];
  const valuesPart = m[3];

  const columns = [...colPart.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  const rowBodies = extractRows(valuesPart);

  const rows = rowBodies.map((body) => {
    const tokens = splitFields(body).map(parseToken);
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = idx < tokens.length ? tokens[idx] : null;
    });
    return obj;
  });

  return { table, columns, rows };
}

async function main() {
  const sql = fs.readFileSync(LEGACY_SQL_PATH, "utf8");
  const statements = extractInsertStatements(sql, REQUIRED_TABLES);

  const parsed = new Map();
  for (const [table, stmts] of statements.entries()) {
    const rows = [];
    for (const stmt of stmts) {
      const p = parseInsertStatement(stmt);
      if (p?.rows?.length) rows.push(...p.rows);
    }
    parsed.set(table, rows);
  }

  const usersOld = parsed.get("users") || [];
  const brandsOld = parsed.get("brands") || [];
  const competitorsOld = parsed.get("brand_competitors") || [];
  const topicsOld = parsed.get("topics") || [];
  const queriesOld = parsed.get("queries") || [];
  const brandAnalyticsOld = parsed.get("brand_analytics") || [];
  const platformsOld = parsed.get("platforms") || [];
  const domainsOld = parsed.get("domains") || [];
  const executionsOld = parsed.get("search_executions") || [];
  const executionBrandsOld = parsed.get("execution_brands") || [];
  const executionCitationsOld = parsed.get("execution_citations") || [];

  const platformById = new Map(platformsOld.map((p) => [String(p.id), (p.slug || p.name || "legacy").toLowerCase()]));

  const firstBrandByOldUser = new Map();
  for (const b of brandsOld) {
    const oldUserId = String(b.user_id);
    if (!firstBrandByOldUser.has(oldUserId)) {
      firstBrandByOldUser.set(oldUserId, normalizeDomain(b.domain) || "brand");
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const summary = {
    usersCreated: 0,
    usersUpdated: 0,
    brandsCreated: 0,
    brandsUpdated: 0,
    competitorsCreated: 0,
    topicsCreated: 0,
    promptsCreated: 0,
    visibilityRowsCreated: 0,
    trendRowsCreated: 0,
    sourcesCreated: 0,
    promptRunsCreated: 0,
    llmAnswersCreated: 0,
    mentionRowsCreated: 0,
    citationRowsCreated: 0,
    emailQueuePath: "",
  };

  const oldUserToNewUser = new Map();
  const oldBrandToNewBrand = new Map();
  const oldTopicToNewTopic = new Map();
  const oldQueryToPrompt = new Map();
  const oldExecutionToAnswer = new Map();
  const newAnswerToOwnerBrand = new Map();

  const emailQueue = [];

  try {
    await client.query("BEGIN");

    const existingUsersRes = await client.query("SELECT id, lower(email) AS email FROM users");
    const existingUsersByEmail = new Map(existingUsersRes.rows.map((r) => [r.email, r.id]));

    for (const u of usersOld) {
      const oldUserId = String(u.id);
      const email = normalizeEmail(u.email);
      if (!email) continue;

      const name = (u.name || "").trim() || "User";
      const { firstName, lastName } = splitName(name);
      const oldRole = (u.role || "user").toLowerCase();
      const isAdmin = oldRole === "admin" || oldRole === "super_admin";

      const brandForPassword = firstBrandByOldUser.get(oldUserId) || "brand";
      const generatedPassword = defaultPassword(name, brandForPassword);

      const cc = (u.country_code || "").trim();
      const ph = (u.phone || "").trim();
      const phone = cc && ph && !ph.startsWith("+") ? `${cc}${ph}` : (ph || null);

      if (existingUsersByEmail.has(email)) {
        const userId = existingUsersByEmail.get(email);
        oldUserToNewUser.set(oldUserId, userId);

        await client.query(
          `UPDATE users
           SET onboarding_completed = TRUE,
               onboarding_step = GREATEST(COALESCE(onboarding_step, 1), 4),
               is_admin = is_admin OR $2,
               phone = COALESCE(phone, $3),
               updated_at = NOW()
           WHERE id = $1`,
          [userId, isAdmin, phone],
        );

        summary.usersUpdated += 1;
      } else {
        const userId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(generatedPassword, 12);

        await client.query(
          `INSERT INTO users (
             id, email, first_name, last_name, phone, password_hash,
             email_verified, is_admin, onboarding_completed, onboarding_step,
             auth_provider, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             TRUE, $7, TRUE, 4,
             'email', COALESCE($8::timestamp, NOW()), COALESCE($9::timestamp, NOW())
           )`,
          [
            userId,
            email,
            firstName,
            lastName || null,
            phone,
            passwordHash,
            isAdmin,
            u.created_at || null,
            u.updated_at || null,
          ],
        );

        oldUserToNewUser.set(oldUserId, userId);
        existingUsersByEmail.set(email, userId);

        emailQueue.push({
          email,
          name,
          defaultPassword: generatedPassword,
          note: "Prepared only. Do not send automatically.",
        });

        summary.usersCreated += 1;
      }
    }

    const existingBrandsRes = await client.query("SELECT id, lower(domain) AS domain FROM brands");
    const existingBrandsByDomain = new Map(existingBrandsRes.rows.map((r) => [r.domain, r.id]));

    for (const b of brandsOld) {
      const oldBrandId = String(b.id);
      const oldUserId = String(b.user_id);
      const newUserId = oldUserToNewUser.get(oldUserId);
      const domain = normalizeDomain(b.domain);
      if (!newUserId || !domain) continue;

      const visibilityScore = toNumber(b.brand_score, 0);
      const scriptInstalled = Boolean((b.script_field || "").trim() || (b.code_field || "").trim());
      const country = (b.headquarters || "").trim() || null;

      if (existingBrandsByDomain.has(domain)) {
        const brandId = existingBrandsByDomain.get(domain);
        oldBrandToNewBrand.set(oldBrandId, brandId);

        await client.query(
          `UPDATE brands
           SET user_id = COALESCE(user_id, $2),
               name = COALESCE(NULLIF(name, ''), $3),
               description = COALESCE(description, $4),
               logo = COALESCE(logo, $5),
               industry = COALESCE(industry, $6),
               country = COALESCE(country, $7),
               visibility_score = GREATEST(COALESCE(visibility_score, 0), $8),
               tier = 'free',
               onboarding_completed = TRUE,
               activation_status = 'completed',
               script_installed = script_installed OR $9,
               updated_at = NOW()
           WHERE id = $1`,
          [
            brandId,
            newUserId,
            b.name || null,
            b.description || null,
            b.logo || null,
            b.industry || null,
            country,
            visibilityScore,
            scriptInstalled,
          ],
        );

        summary.brandsUpdated += 1;
      } else {
        const brandId = crypto.randomUUID();
        await client.query(
          `INSERT INTO brands (
             id, user_id, name, domain, logo, industry, description,
             country, tier, visibility_score, onboarding_completed,
             activation_status, status, analysis_enabled,
             script_installed, script_verified_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, 'free', $9, TRUE,
             'completed', 'active', TRUE,
             $10, CASE WHEN $10 THEN NOW() ELSE NULL END, COALESCE($11::timestamp, NOW()), COALESCE($12::timestamp, NOW())
           )`,
          [
            brandId,
            newUserId,
            b.name || domain,
            domain,
            b.logo || null,
            b.industry || null,
            b.description || null,
            country,
            visibilityScore,
            scriptInstalled,
            b.created_at || null,
            b.updated_at || null,
          ],
        );

        oldBrandToNewBrand.set(oldBrandId, brandId);
        existingBrandsByDomain.set(domain, brandId);
        summary.brandsCreated += 1;
      }
    }

    const existingTopicsRes = await client.query("SELECT id, brand_id, lower(name) AS name FROM topics");
    const existingTopicByKey = new Map(existingTopicsRes.rows.map((r) => [`${r.brand_id}::${r.name}`, r.id]));

    for (const t of topicsOld) {
      const oldTopicId = String(t.id);
      const newBrandId = oldBrandToNewBrand.get(String(t.brand_id));
      if (!newBrandId) continue;
      const name = (t.name || "").trim();
      if (!name) continue;
      const key = `${newBrandId}::${name.toLowerCase()}`;

      if (existingTopicByKey.has(key)) {
        const topicId = existingTopicByKey.get(key);
        oldTopicToNewTopic.set(oldTopicId, topicId);
        continue;
      }

      const topicId = crypto.randomUUID();
      await client.query(
        `INSERT INTO topics (id, brand_id, name, category, importance, prompt_count, created_at, updated_at)
         VALUES ($1, $2, $3, 'legacy', NULL, $4, COALESCE($5::timestamp, NOW()), COALESCE($6::timestamp, NOW()))`,
        [
          topicId,
          newBrandId,
          name,
          Math.max(0, Math.trunc(toNumber(t.query_count, 0))),
          t.created_at || null,
          t.updated_at || null,
        ],
      );

      oldTopicToNewTopic.set(oldTopicId, topicId);
      existingTopicByKey.set(key, topicId);
      summary.topicsCreated += 1;
    }

    const existingPromptRes = await client.query("SELECT id, brand_id, lower(text) AS text FROM prompts");
    const existingPromptByKey = new Map(existingPromptRes.rows.map((r) => [`${r.brand_id}::${r.text}`, r.id]));

    for (const q of queriesOld) {
      const oldQueryId = String(q.id);
      const newBrandId = oldBrandToNewBrand.get(String(q.brand_id));
      if (!newBrandId) continue;

      const text = (q.query_text || "").trim();
      if (!text) continue;
      const key = `${newBrandId}::${text.toLowerCase()}`;

      if (existingPromptByKey.has(key)) {
        const promptId = existingPromptByKey.get(key);
        oldQueryToPrompt.set(oldQueryId, promptId);
        continue;
      }

      const promptId = crypto.randomUUID();
      await client.query(
        `INSERT INTO prompts (
           id, brand_id, text, category, topic_id,
           avg_rank, visibility_pct, is_brand_present, priority_score,
           sentiment, run_count, status, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           NULL, $10, $11, COALESCE($12::timestamp, NOW()), COALESCE($13::timestamp, NOW())
         )`,
        [
          promptId,
          newBrandId,
          text,
          q.query_type || "legacy_query",
          q.topic_id ? oldTopicToNewTopic.get(String(q.topic_id)) || null : null,
          q.rank_position === null ? 0 : toNumber(q.rank_position, 0),
          toNumber(q.visibility_score, 0),
          toNumber(q.mention_count, 0) > 0,
          Math.max(0, Math.trunc(toNumber(q.search_volume, 0))),
          Math.max(0, Math.trunc(toNumber(q.mention_count, 0))),
          toBool(q.is_active, true) ? "active" : "archived",
          q.created_at || null,
          q.updated_at || null,
        ],
      );

      oldQueryToPrompt.set(oldQueryId, promptId);
      existingPromptByKey.set(key, promptId);
      summary.promptsCreated += 1;
    }

    for (const d of domainsOld) {
      const newBrandId = oldBrandToNewBrand.get(String(d.brand_id));
      if (!newBrandId) continue;
      const domain = normalizeDomain(d.domain_name);
      if (!domain) continue;

      const existing = await client.query(
        `SELECT id FROM sources WHERE brand_id = $1 AND lower(domain) = $2 LIMIT 1`,
        [newBrandId, domain],
      );
      if (existing.rowCount > 0) continue;

      await client.query(
        `INSERT INTO sources (
           id, brand_id, domain, url, title, mentions, domain_authority,
           citation_type, source_type, first_seen, last_seen, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, 'legacy_domain', COALESCE($9::timestamp, NOW()), COALESCE($10::timestamp, NOW()), COALESCE($11::timestamp, NOW()), COALESCE($12::timestamp, NOW())
         )`,
        [
          crypto.randomUUID(),
          newBrandId,
          domain,
          `https://${domain}`,
          domain,
          Math.max(0, Math.trunc(toNumber(d.mention_count, 0))),
          Math.max(0, Math.trunc(toNumber(d.authority_score, 0))),
          d.domain_type || "legacy",
          d.created_at || null,
          d.updated_at || null,
          d.created_at || null,
          d.updated_at || null,
        ],
      );

      summary.sourcesCreated += 1;
    }

    for (const c of competitorsOld) {
      const newBrandId = oldBrandToNewBrand.get(String(c.brand_id));
      if (!newBrandId) continue;
      const domain = normalizeDomain(c.domain);
      if (!domain) continue;

      const existing = await client.query(
        `SELECT id FROM competitors WHERE brand_id = $1 AND lower(domain) = $2 LIMIT 1`,
        [newBrandId, domain],
      );

      if (existing.rowCount > 0) continue;

      await client.query(
        `INSERT INTO competitors (
           id, brand_id, name, domain, logo, description,
           visibility_score, is_tracked, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, COALESCE($9::timestamp, NOW()), COALESCE($10::timestamp, NOW())
         )`,
        [
          crypto.randomUUID(),
          newBrandId,
          c.name || domain,
          domain,
          c.logo || null,
          c.description || null,
          toNumber(c.competitor_score, 0),
          toBool(c.is_active, true),
          c.created_at || null,
          c.updated_at || null,
        ],
      );

      summary.competitorsCreated += 1;
    }

    for (const a of brandAnalyticsOld) {
      const newBrandId = oldBrandToNewBrand.get(String(a.brand_id));
      if (!newBrandId) continue;

      const dateStr = (a.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

      const periodStart = `${dateStr} 00:00:00+00`;
      const periodEnd = `${dateStr} 23:59:59+00`;

      const mentionCount = Math.max(0, Math.trunc(toNumber(a.total_mentions, 0)));
      const citationCount = Math.max(0, Math.trunc(toNumber(a.total_citations, 0)));
      const overallScore = toNumber(a.visibility_percentage, 0);
      const avgPosition = a.industry_rank ? toNumber(a.industry_rank, 0) : 0;

      await client.query(
        `INSERT INTO visibility_scores (
           id, brand_id, period, period_start, period_end,
           overall_score, mention_count, avg_position,
           citation_count, sentiment_score, confidence_band, created_at
         ) VALUES (
           $1, $2, 'daily', $3::timestamp, $4::timestamp,
           $5, $6, $7,
           $8, $9, 17, NOW()
         )`,
        [
          crypto.randomUUID(),
          newBrandId,
          periodStart,
          periodEnd,
          overallScore,
          mentionCount,
          avgPosition,
          citationCount,
          toNumber(a.sentiment_score, 0),
        ],
      );
      summary.visibilityRowsCreated += 1;

      await client.query(
        `INSERT INTO trend_snapshots (
           id, brand_id, snapshot_date, visibility_score,
           mention_count, avg_rank, competitor_count,
           market_share, trend_direction, change_percent, metadata, created_at
         ) VALUES (
           $1, $2, $3::timestamp, $4,
           $5, $6, 0,
           $7, 'stable', 0, $8::jsonb, NOW()
         )`,
        [
          crypto.randomUUID(),
          newBrandId,
          `${dateStr} 00:00:00+00`,
          overallScore,
          mentionCount,
          avgPosition,
          toNumber(a.share_of_voice, 0),
          JSON.stringify({
            source: "legacy_brand_analytics",
            topQueries: safeJsonParse(a.top_queries),
            topTopics: safeJsonParse(a.top_topics),
            sentimentBreakdown: safeJsonParse(a.sentiment_breakdown),
          }),
        ],
      );
      summary.trendRowsCreated += 1;
    }

    for (const ex of executionsOld) {
      const oldExecutionId = String(ex.id);
      const newBrandId = oldBrandToNewBrand.get(String(ex.brand_id));
      if (!newBrandId) continue;

      let promptId = oldQueryToPrompt.get(String(ex.query_id));
      if (!promptId && ex.query_text) {
        const qText = String(ex.query_text).trim().toLowerCase();
        const maybeKey = `${newBrandId}::${qText}`;
        promptId = existingPromptByKey.get(maybeKey);
      }
      if (!promptId) continue;

      const provider = platformById.get(String(ex.platform_id)) || "legacy";
      const runId = crypto.randomUUID();
      const runStatus = (() => {
        const s = (ex.status || "pending").toLowerCase();
        if (s === "success") return "completed";
        if (s === "failed") return "failed";
        if (s === "timeout") return "failed";
        return "pending";
      })();

      await client.query(
        `INSERT INTO prompt_runs (
           id, prompt_id, brand_id, status, llm_provider,
           started_at, completed_at, tokens_used, cost,
           error, metadata, created_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::timestamp, $7::timestamp, 0, $8,
           $9, $10::jsonb, $11::timestamp
         )`,
        [
          runId,
          promptId,
          newBrandId,
          runStatus,
          provider,
          ex.execution_timestamp || ex.created_at || null,
          runStatus === "completed" ? (ex.updated_at || ex.execution_timestamp || null) : null,
          toNumber(ex.cost, 0),
          ex.error_message || null,
          JSON.stringify({
            source: "legacy_search_executions",
            legacyExecutionId: oldExecutionId,
            responseTimeMs: toNumber(ex.response_time_ms, 0),
            webSearchTriggered: toBool(ex.web_search_triggered, false),
            totalBrandsMentioned: toNumber(ex.total_brands_mentioned, 0),
            totalCitations: toNumber(ex.total_citations, 0),
          }),
          ex.created_at || ex.execution_timestamp || new Date().toISOString(),
        ],
      );
      summary.promptRunsCreated += 1;

      const answerId = crypto.randomUUID();
      const parsedResponse = safeJsonParse(ex.response_data);
      await client.query(
        `INSERT INTO llm_answers (
           id, prompt_id, brand_id, llm_provider, llm_model,
           raw_response, parsed_response, response_hash, created_at
         ) VALUES (
           $1, $2, $3, $4, 'legacy-migrated',
           $5, $6::jsonb, $7, $8::timestamp
         )`,
        [
          answerId,
          promptId,
          newBrandId,
          provider,
          ex.response_text || "",
          parsedResponse ? JSON.stringify(parsedResponse) : null,
          crypto.createHash("sha256").update(String(ex.response_text || "")).digest("hex"),
          ex.execution_timestamp || ex.created_at || new Date().toISOString(),
        ],
      );

      oldExecutionToAnswer.set(oldExecutionId, answerId);
      newAnswerToOwnerBrand.set(answerId, newBrandId);
      summary.llmAnswersCreated += 1;
    }

    for (const mb of executionBrandsOld) {
      const answerId = oldExecutionToAnswer.get(String(mb.execution_id));
      if (!answerId) continue;

      const mappedBrandId = mb.brand_id ? oldBrandToNewBrand.get(String(mb.brand_id)) || null : null;
      const ownerBrandId = newAnswerToOwnerBrand.get(answerId) || null;
      const isCompetitor = mappedBrandId ? mappedBrandId !== ownerBrandId : true;
      const entityName = (mb.brand_name || mb.brand_domain || "Unknown").trim();
      if (!entityName) continue;

      await client.query(
        `INSERT INTO answer_mentions (
           id, llm_answer_id, brand_id, competitor_id, entity_name,
           position, context, sentiment, confidence, is_competitor, created_at
         ) VALUES (
           $1, $2, $3, NULL, $4,
           $5, $6, $7, 0.8, $8, COALESCE($9::timestamp, NOW())
         )`,
        [
          crypto.randomUUID(),
          answerId,
          mappedBrandId,
          entityName,
          mb.mention_position === null ? null : Math.trunc(toNumber(mb.mention_position, 0)),
          mb.mention_context || null,
          mb.sentiment || null,
          isCompetitor,
          mb.created_at || null,
        ],
      );
      summary.mentionRowsCreated += 1;
    }

    for (const ec of executionCitationsOld) {
      const answerId = oldExecutionToAnswer.get(String(ec.execution_id));
      if (!answerId) continue;

      const url = (ec.url || "").trim();
      if (!url) continue;
      const domain = normalizeDomain(ec.domain) || (() => {
        try {
          return new URL(url).hostname.toLowerCase();
        } catch {
          return "unknown";
        }
      })();

      await client.query(
        `INSERT INTO answer_citations (
           id, llm_answer_id, source_id, url, domain,
           title, position, citation_type, normalized_url, created_at
         ) VALUES (
           $1, $2, NULL, $3, $4,
           $5, $6, 'legacy', $7, COALESCE($8::timestamp, NOW())
         ) ON CONFLICT DO NOTHING`,
        [
          crypto.randomUUID(),
          answerId,
          url,
          domain,
          ec.title || null,
          ec.citation_position === null ? null : Math.trunc(toNumber(ec.citation_position, 0)),
          url,
          ec.created_at || null,
        ],
      );
      summary.citationRowsCreated += 1;
    }

    const nowTs = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const queuePath = path.join(OUTPUT_DIR, `migration_email_queue_${nowTs}.json`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const brandsByUser = new Map();
    for (const b of brandsOld) {
      const oldUserId = String(b.user_id);
      if (!brandsByUser.has(oldUserId)) brandsByUser.set(oldUserId, []);
      brandsByUser.get(oldUserId).push(normalizeDomain(b.domain));
    }

    const queueDetailed = emailQueue.map((item) => {
      const oldUser = usersOld.find((u) => normalizeEmail(u.email) === item.email);
      const userBrands = oldUser ? (brandsByUser.get(String(oldUser.id)) || []) : [];
      return { ...item, brands: userBrands.filter(Boolean) };
    });

    fs.writeFileSync(queuePath, JSON.stringify(queueDetailed, null, 2));
    summary.emailQueuePath = queuePath;

    await client.query("COMMIT");

    console.log(JSON.stringify({
      status: "ok",
      summary,
      parsedRows: {
        users: usersOld.length,
        brands: brandsOld.length,
        competitors: competitorsOld.length,
        topics: topicsOld.length,
        queries: queriesOld.length,
        brandAnalytics: brandAnalyticsOld.length,
        domains: domainsOld.length,
        searchExecutions: executionsOld.length,
        executionBrands: executionBrandsOld.length,
        executionCitations: executionCitationsOld.length,
      },
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err?.message || err);
  process.exit(1);
});
