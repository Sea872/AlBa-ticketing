/**
 * Applies SQL files from src/db/migrations in order. Tracks applied files in schema_migrations.
 * Usage: DATABASE_URL=... node scripts/runMigrations.js
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "src", "db", "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function isApplied(client, version) {
  const res = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
  return res.rowCount > 0;
}

async function markApplied(client, version) {
  await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
}

async function run() {
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    for (const file of files) {
      if (await isApplied(client, file)) {
        console.log(`skip ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await markApplied(client, file);
        await client.query("COMMIT");
        console.log(`ok ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
