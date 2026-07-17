#!/usr/bin/env node
import fs from "fs";
import crypto from "crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const LEGACY_SQL_PATH = process.argv[2] || "/opt/geoscore/client/public/u907274113_geoscore.sql";
const OUTPUT_DIR = process.argv[3] || "/opt/geoscore/backups";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const REQUIRED_TABLES = new Set(["users", "brands"]);

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function normalizeDomain(domain) {
  if (!domain) return "brand";
  let value = String(domain).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0] || "brand";
  return value;
}

function splitName(name) {
  const clean = (name || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "User", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function sanitizePasswordSegment(value, fallback) {
  const out = (value || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
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
  if (t.startsWith("'") && t.endsWith("'")) return unescapeSqlString(t.slice(1, -1));
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
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

  const firstBrandDomainByOldUser = new Map();
  for (const b of brandsOld) {
    const uid = String(b.user_id);
    if (!firstBrandDomainByOldUser.has(uid)) {
      firstBrandDomainByOldUser.set(uid, normalizeDomain(b.domain));
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const summary = {
    totalLegacyUsers: usersOld.length,
    totalLegacyNonAdminUsers: 0,
    skippedAdminUsers: 0,
    usersCreated: 0,
    usersAlreadyPresent: 0,
    usersUpdatedToPending: 0,
    emailQueuePath: "",
  };

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
      if (isAdmin) {
        summary.skippedAdminUsers += 1;
        continue;
      }
      summary.totalLegacyNonAdminUsers += 1;

      const domainForPassword = firstBrandDomainByOldUser.get(oldUserId) || "brand";
      const generatedPassword = defaultPassword(name, domainForPassword);

      const cc = (u.country_code || "").trim();
      const ph = (u.phone || "").trim();
      const phone = cc && ph && !ph.startsWith("+") ? `${cc}${ph}` : (ph || null);

      if (existingUsersByEmail.has(email)) {
        const userId = existingUsersByEmail.get(email);
        await client.query(
          `UPDATE users
           SET onboarding_completed = FALSE,
               onboarding_step = 1,
               is_admin = is_admin OR $2,
               phone = COALESCE(phone, $3),
               updated_at = NOW()
           WHERE id = $1`,
          [userId, isAdmin, phone],
        );
        summary.usersAlreadyPresent += 1;
        summary.usersUpdatedToPending += 1;
        continue;
      }

      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(generatedPassword, 12);

      await client.query(
        `INSERT INTO users (
           id, email, first_name, last_name, phone, password_hash,
           email_verified, is_admin, onboarding_completed, onboarding_step,
           auth_provider, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           TRUE, $7, FALSE, 1,
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

      emailQueue.push({
        email,
        name,
        defaultPassword: generatedPassword,
        note: "Prepared only. Do not send automatically.",
      });

      existingUsersByEmail.set(email, userId);
      summary.usersCreated += 1;
    }

    await client.query("COMMIT");

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "");
    const queuePath = `${OUTPUT_DIR}/all_non_admin_users_email_queue_${stamp}.json`;
    fs.writeFileSync(queuePath, JSON.stringify(emailQueue, null, 2));
    summary.emailQueuePath = queuePath;

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
