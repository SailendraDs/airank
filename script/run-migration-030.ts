/**
 * Applies migrations/030_agent_readiness_addons.sql when psql is unavailable.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import "../server/load-env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../migrations/030_agent_readiness_addons.sql");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = readFileSync(sqlPath, "utf8");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration 030 applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
