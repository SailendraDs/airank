import pg from "pg";
import "../server/load-env";

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const offers = await c.query("select id, slug, title, is_active from addon_offers");
  console.log("addon_offers:", offers.rows.length, offers.rows);
  const plans = await c.query(
    "select id, agent_readiness_full_enabled, agent_readiness_partial_enabled from plan_capabilities",
  );
  console.log("plans:", plans.rows);
  const reports = await c.query("select count(*)::int as n from agent_readiness_reports");
  console.log("reports:", reports.rows[0]);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
