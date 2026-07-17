import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const dbUrl = process.env.DATABASE_URL;
const isLocalSocket = dbUrl.includes("host=/var/run/postgresql");
const isLocalhost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");
const sslDisabledByUrl = dbUrl.includes("sslmode=disable");
const shouldUseSsl = process.env.NODE_ENV === "production" && !isLocalSocket && !isLocalhost && !sslDisabledByUrl;

export const pool = new Pool({
  connectionString: dbUrl,
  ...(process.env.NODE_ENV === "production" && {
    ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }),
});
export const db = drizzle(pool, { schema });
