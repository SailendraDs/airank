import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const root = process.cwd();
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const SETTING_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "PERPLEXITY_API_KEY",
  "GROK_API_KEY",
  "DEEPSEEK_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_KG_API_KEY",
  "FIRECRAWL_API_KEY",
  "BRAND_ENRICHMENT_LLM_MODEL",
  "SERPAPI_API_KEY",
  "DATAFORSEO_KEY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "ANTHROPIC_MODEL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SES_SMTP_HOST",
  "SES_SMTP_PORT",
  "SES_SMTP_USER",
  "SES_SMTP_PASS",
  "SES_FROM_EMAIL",
  "TWITTER_BEARER_TOKEN",
  "LINKEDIN_ACCESS_TOKEN",
  "YOUTUBE_API_KEY",
  "META_PAGE_TOKEN",
  "AWS_S3_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AXP_CDN_DOMAIN",
];

const RETIRED_KEYS = new Set(["BRAND_DEV_API_KEY", "CONTEXT_DEV_API_KEY"]);

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function settingName(envKey) {
  return envKey.toLowerCase();
}

function collectSettings() {
  const pairs = [];
  for (const envKey of SETTING_KEYS) {
    if (RETIRED_KEYS.has(envKey)) continue;
    const value = process.env[envKey];
    if (value === undefined || value === "") continue;
    pairs.push([settingName(envKey), value]);
  }

  pairs.push(["maintenance_mode", "false"]);
  return pairs;
}

async function main() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 1) {
    const current = process.argv[i];
    if (current.startsWith("--")) {
      args.set(current, process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true");
    }
  }

  const adminEmail = args.get("--admin-email") || "sailendra@geoscore.in";
  const adminPassword = args.get("--admin-password") || "";
  const settings = collectSettings();

  const lines = [];
  lines.push("-- Generated production settings SQL.");
  lines.push("-- Safe scope: system_settings upserts, maintenance off, optional admin password rotation.");
  lines.push("-- Existing users, brands, subscriptions, invoices, prompts, reports, and integrations are preserved.");
  lines.push("BEGIN;");
  lines.push("");
  lines.push("-- Remove retired provider settings if they exist.");
  lines.push("DELETE FROM system_settings");
  lines.push("WHERE key IN ('brand_dev_api_key', 'context_dev_api_key');");
  lines.push("");
  lines.push("-- Upsert latest runtime keys from local .env into production DB fallback settings.");
  lines.push("INSERT INTO system_settings (key, value, updated_at, updated_by)");
  lines.push("VALUES");
  lines.push(settings.map(([key, value]) => `  (${sqlString(key)}, ${sqlString(value)}, now(), 'codex-production-deploy')`).join(",\n") + "");
  lines.push("ON CONFLICT (key) DO UPDATE SET");
  lines.push("  value = EXCLUDED.value,");
  lines.push("  updated_at = now(),");
  lines.push("  updated_by = EXCLUDED.updated_by;");

  if (adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    lines.push("");
    lines.push("-- Rotate requested admin password without deleting or recreating the account.");
    lines.push("UPDATE users");
    lines.push(`SET password_hash = ${sqlString(passwordHash)},`);
    lines.push("    password_changed_at = now(),");
    lines.push("    require_password_change = false,");
    lines.push("    failed_login_attempts = 0,");
    lines.push("    account_locked = false,");
    lines.push("    locked_until = null,");
    lines.push("    email_verified = true,");
    lines.push("    updated_at = now()");
    lines.push(`WHERE lower(email) = lower(${sqlString(adminEmail)});`);
  } else {
    lines.push("");
    lines.push("-- Admin password rotation skipped. Pass --admin-password \"...\" to include it.");
  }

  lines.push("");
  lines.push("COMMIT;");
  lines.push("");
  lines.push("-- Review after deploy:");
  lines.push("-- SELECT key, length(value) AS value_length, updated_at FROM system_settings ORDER BY key;");
  lines.push(`-- SELECT email, email_verified, account_locked, password_changed_at FROM users WHERE lower(email) = lower(${sqlString(adminEmail)});`);

  const outputPath = args.get("--out");
  const sql = `${lines.join("\n")}\n`;
  if (outputPath) {
    fs.writeFileSync(path.resolve(root, outputPath), sql);
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(sql);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
