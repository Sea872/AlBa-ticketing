import pg from "pg";
import { loadConfig } from "../../config.js";

const { Pool } = pg;

let pool = null;

/**
 * Returns a singleton connection pool. Requires DATABASE_URL in environment.
 */
export function getPool() {
  if (pool) {
    return pool;
  }

  const { databaseUrl } = loadConfig();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  return pool;
}

/**
 * Closes the pool (e.g. in tests or graceful shutdown).
 */
export async function closePool() {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}
