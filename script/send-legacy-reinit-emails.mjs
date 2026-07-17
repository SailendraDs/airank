#!/usr/bin/env node
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import pg from "pg";
import { storage } from "/opt/geoscore/server/storage.ts";

const { Client } = pg;

const LEGACY_SQL_PATH = process.argv[2] || "/opt/geoscore/client/public/u907274113_geoscore.sql";
const OUTPUT_DIR = process.argv[3] || "/opt/geoscore/backups";
const RUN_LABEL = process.argv[4] || "manual_now";

const SUBJECT = "Action Required: Reinitialize your Brand Data on GeoScore";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

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

function sanitizePasswordSegment(value, fallback) {
  const out = (value || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return out || fallback;
}

function defaultPassword(name, domain) {
  const namePart = sanitizePasswordSegment((name || "").split(/\s+/)[0], "user");
  const brandPart = sanitizePasswordSegment((domain || "").split(".")[0], "brand");
  return `${namePart}_${brandPart}@123#`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function renderHtml({ name, email, password }) {
  const safeName = escapeHtml(name || "User");
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);

  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <p>Dear ${safeName},</p>

    <p>We’re excited to inform you that we have successfully migrated to our new website to provide you with an improved experience - <a href="https://geoscore.in">GeoScore</a>.</p>

    <p>As part of this transition, your existing account credentials (username and password) have been shared below, so you can log in as usual without creating a new account.</p>

    <p><strong>Credentials:</strong><br/>
    Website: <a href="https://geoscore.in">https://geoscore.in</a><br/>
    Email: ${safeEmail}<br/>
    Password: ${safePassword}</p>

    <p>However, to ensure everything works smoothly with the new system, we kindly request you to reinitialize your data after logging in. This is a simple process that takes approximately 5 minutes to complete.</p>

    <p><strong>What you need to do:</strong></p>
    <p>Log in using the credentials provided.<br/>
    Follow the on-screen steps to set up your data again.</p>

    <p>We understand this may cause a small inconvenience, and we truly appreciate your cooperation. This step helps us ensure better performance, accuracy, and reliability going forward.</p>

    <p>If you have any questions or need assistance, please don’t hesitate to reach out to our support team.</p>

    <p>Thank you for your continued support.</p>

    <p>Best regards,<br/>
    Geoscore<br/>
    swaroop@geoscore.in</p>
  </body>
</html>`;
}

function withFromName(rawFrom) {
  const raw = String(rawFrom || "").trim();
  if (!raw) return "GeoScore <noreply@geoscore.in>";
  const m = raw.match(/<([^>]+)>/);
  const emailOnly = (m ? m[1] : raw).trim();
  return `GeoScore <${emailOnly}>`;
}

async function getEmailConfig() {
  const settings = await storage.getAllSystemSettings();
  const get = (key) => settings.find((s) => s.key === key)?.value ?? "";

  const provider = (get("email_provider") || process.env.EMAIL_PROVIDER || "smtp").toLowerCase();

  if (provider === "ses") {
    const host = get("ses_smtp_host") || process.env.SES_SMTP_HOST || "email-smtp.ap-south-1.amazonaws.com";
    const port = parseInt(get("ses_smtp_port") || process.env.SES_SMTP_PORT || "587", 10);
    const user = get("ses_smtp_user") || process.env.SES_SMTP_USER || "";
    const pass = get("ses_smtp_pass") || process.env.SES_SMTP_PASS || "";
    const from = get("ses_from_email") || process.env.SES_FROM_EMAIL || "noreply@geoscore.in";
    if (!user || !pass) return { provider: "none", host, port, user, pass, from };
    return { provider: "ses", host, port, user, pass, from };
  }

  const host = get("smtp_host") || process.env.SMTP_HOST || "";
  const port = parseInt(get("smtp_port") || process.env.SMTP_PORT || "587", 10);
  const user = get("smtp_user") || process.env.SMTP_USER || "";
  const pass = get("smtp_pass") || process.env.SMTP_PASS || "";
  const from = get("smtp_from") || process.env.SMTP_FROM || "noreply@geoscore.in";
  if (!host || !user || !pass) return { provider: "none", host, port, user, pass, from };
  return { provider: "smtp", host, port, user, pass, from };
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

  const recipients = [];
  for (const u of usersOld) {
    const oldRole = String(u.role || "user").toLowerCase();
    if (oldRole === "admin" || oldRole === "super_admin") continue;

    const email = normalizeEmail(u.email);
    if (!email) continue;

    const fullName = String(u.name || "User").trim() || "User";
    const domain = firstBrandDomainByOldUser.get(String(u.id)) || "brand";

    recipients.push({
      oldUserId: String(u.id),
      email,
      fullName,
      password: defaultPassword(fullName, domain),
    });
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const usersRes = await db.query("SELECT lower(email) AS email FROM users");
  await db.end();
  const existingEmails = new Set(usersRes.rows.map((r) => r.email));

  const existingRecipients = recipients.filter((r) => existingEmails.has(r.email));
  const missingInDb = recipients.filter((r) => !existingEmails.has(r.email));

  const cfg = await getEmailConfig();
  const report = {
    runLabel: RUN_LABEL,
    subject: SUBJECT,
    startedAt: new Date().toISOString(),
    provider: cfg.provider,
    totals: {
      legacyNonAdmin: recipients.length,
      presentInDb: existingRecipients.length,
      missingInDb: missingInDb.length,
      attempted: 0,
      sent: 0,
      failed: 0,
    },
    missingInDb: missingInDb.map((x) => ({ email: x.email, fullName: x.fullName })),
    failures: [],
    sent: [],
  };

  if (cfg.provider === "none") {
    report.totals.attempted = existingRecipients.length;
    report.totals.failed = existingRecipients.length;
    for (const r of existingRecipients) {
      report.failures.push({ email: r.email, reason: "Email provider not configured (SMTP/SES missing)" });
    }
  } else {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    for (const r of existingRecipients) {
      report.totals.attempted += 1;
      const html = renderHtml({ name: r.fullName, email: r.email, password: r.password });
      try {
        const info = await transporter.sendMail({
          from: withFromName(cfg.from),
          to: r.email,
          subject: SUBJECT,
          html,
        });
        report.totals.sent += 1;
        report.sent.push({ email: r.email, messageId: info.messageId || null, accepted: info.accepted || [] });
      } catch (err) {
        report.totals.failed += 1;
        report.failures.push({ email: r.email, reason: err?.message || String(err) });
      }
    }
  }

  report.finishedAt = new Date().toISOString();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const outPath = path.join(OUTPUT_DIR, `email_delivery_${RUN_LABEL}_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    reportPath: outPath,
    provider: report.provider,
    totals: report.totals,
    failedPreview: report.failures.slice(0, 5),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
