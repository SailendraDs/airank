/**
 * Remove a user and owned brands (cascade) by email for clean re-registration.
 * Usage: npx tsx script/purge-user-by-email.ts user@example.com
 */
import pg from "pg";
import "../server/load-env";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx script/purge-user-by-email.ts <email>");
  process.exit(1);
}

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const users = await c.query(`select id, email, first_name, last_name from users where lower(email) = $1`, [email]);
  if (users.rows.length === 0) {
    console.log(`No user found for ${email}`);
    await c.end();
    return;
  }

  for (const user of users.rows) {
    console.log(`User: ${user.id} ${user.email}`);
    const brands = await c.query(`select id, name, domain from brands where user_id = $1`, [user.id]);
    for (const brand of brands.rows) {
      console.log(`  Deleting brand: ${brand.id} ${brand.name} (${brand.domain})`);
      await c.query(`delete from brands where id = $1`, [brand.id]);
    }
    const sessions = await c.query(`delete from user_sessions where user_id = $1`, [user.id]);
    console.log(`  Deleted sessions: ${sessions.rowCount}`);
    const tables = [
      "audit_logs",
      "user_analytics_events",
      "addon_purchases",
      "team_members",
      "login_attempts",
      "account_lockouts",
      "password_history",
      "security_events",
    ];
    for (const table of tables) {
      try {
        const r = await c.query(`delete from ${table} where user_id = $1`, [user.id]);
        if (r.rowCount) console.log(`  Deleted ${table}: ${r.rowCount}`);
      } catch {
        // table may not exist or use different column
      }
    }
    await c.query(`delete from users where id = $1`, [user.id]);
    console.log(`  Deleted user ${user.id}`);
  }

  console.log(`Done. ${email} can register again.`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
