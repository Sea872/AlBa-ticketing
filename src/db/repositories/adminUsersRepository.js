import { getPool } from "../client/pool.js";

/**
 * Returns admin row for login, or null.
 */
export async function findAdminByEmail(email) {
  const pool = getPool();
  const normalized = String(email).trim().toLowerCase();
  const res = await pool.query(
    `SELECT id, email, password_hash, role, created_at
     FROM admin_users
     WHERE lower(email) = $1
     LIMIT 1`,
    [normalized]
  );
  return res.rows[0] ?? null;
}

/**
 * Returns admin by id (no password hash) for /me.
 */
export async function findAdminById(id) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, email, role, created_at, updated_at
     FROM admin_users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return res.rows[0] ?? null;
}
