/**
 * Creates the application database if it does not exist.
 *
 * PostgreSQL does not let you connect to a database that is not there yet, so
 * migrations cannot create the DB. This script connects to the built-in
 * `postgres` database (or POSTGRES_ADMIN_DATABASE), then runs CREATE DATABASE.
 *
 * Usage: set DATABASE_URL in .env, then: npm run db:create
 *
 * Requires a role that can CREATE DATABASE (often the default superuser).
 */

import { loadConfig } from "../src/config.js";
import pg from "pg";

const { Client } = pg;

const adminDbName = process.env.POSTGRES_ADMIN_DATABASE ?? "postgres";

function parseDatabaseUrl(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  const pathName = url.pathname.replace(/^\//, "");
  const targetDatabase = pathName.split("/")[0];

  if (!targetDatabase) {
    throw new Error(
      "DATABASE_URL must include a database name in the path, e.g. postgresql://localhost:5432/concert_ticketing"
    );
  }

  if (targetDatabase === adminDbName) {
    throw new Error(
      `DATABASE_URL must name your app database (e.g. .../concert_ticketing), not "${adminDbName}". This script connects to "${adminDbName}" only to run CREATE DATABASE.`
    );
  }

  if (!/^[a-zA-Z0-9_]+$/.test(targetDatabase)) {
    throw new Error(
      "Database name in DATABASE_URL must contain only letters, numbers, and underscores for safe creation."
    );
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = `/${adminDbName}`;

  return {
    targetDatabase,
    adminConnectionString: adminUrl.toString(),
  };
}

async function databaseExists(client, name) {
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  return res.rowCount > 0;
}

async function run() {
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const { targetDatabase, adminConnectionString } = parseDatabaseUrl(databaseUrl);

  const client = new Client({ connectionString: adminConnectionString });
  await client.connect();

  try {
    if (await databaseExists(client, targetDatabase)) {
      console.log(`database already exists: ${targetDatabase}`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdent(targetDatabase)}`);
    console.log(`created database: ${targetDatabase}`);
  } finally {
    await client.end();
  }
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
