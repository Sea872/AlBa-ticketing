/**
 * Inserts a local admin user if missing (bcrypt password).
 * Usage: DATABASE_URL=... node scripts/seedAdmin.js
 */

import bcrypt from "bcrypt";
import { loadConfig } from "../src/config.js";
import pg from "pg";

const { Client } = pg;

async function run() {
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const email = String(process.env.SEED_ADMIN_EMAIL ?? "admin@example.com")
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme";

  if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
    console.error("Refusing to seed with default password in production. Set SEED_ADMIN_PASSWORD.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const res = await client.query(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, passwordHash]
    );

    if (res.rowCount === 0) {
      console.log(`admin already exists: ${email}`);
    } else {
      console.log(`seeded admin: ${email}`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
