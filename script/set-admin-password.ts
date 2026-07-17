/**
 * Set admin password for a user. Usage:
 *   npx tsx script/set-admin-password.ts <email> <newPassword>
 * Optional: --make-admin flag promotes the user to admin.
 */
import bcrypt from "bcryptjs";
import pg from "pg";
import "../server/load-env";

const args = process.argv.slice(2);
const makeAdmin = args.includes("--make-admin");
const filtered = args.filter((a) => !a.startsWith("--"));
const email = (filtered[0] || "").trim().toLowerCase();
const newPassword = filtered[1] || "";

if (!email || !newPassword) {
  console.error("Usage: npx tsx script/set-admin-password.ts <email> <newPassword> [--make-admin]");
  process.exit(1);
}

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const found = await c.query(`select id, email, is_admin from users where lower(email) = $1`, [email]);
  if (found.rows.length === 0) {
    console.error(`No user found for ${email}`);
    await c.end();
    process.exit(2);
  }
  const user = found.rows[0];
  console.log(`Found user id=${user.id} email=${user.email} is_admin=${user.is_admin}`);

  const passwordHash = await bcrypt.hash(newPassword, 12);

  if (makeAdmin && !user.is_admin) {
    await c.query(`update users set is_admin = true where id = $1`, [user.id]);
    console.log(`Promoted ${email} to admin.`);
  }

  await c.query(
    `update users set password_hash = $1, require_password_change = false, account_locked = false, failed_login_attempts = 0 where id = $2`,
    [passwordHash, user.id],
  );
  console.log(`Password updated for ${email}. Length: ${newPassword.length}`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
