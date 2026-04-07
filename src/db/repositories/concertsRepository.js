import { getPool } from "../client/pool.js";

/**
 * @param {{ status?: string }} [filters]
 */
export async function listConcerts(filters = {}) {
  const pool = getPool();
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.status) {
    conditions.push(`status = $${i++}`);
    values.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const res = await pool.query(
    `SELECT id, name, concert_date, venue, status, created_at, updated_at
     FROM concerts
     ${where}
     ORDER BY concert_date ASC, name ASC`,
    values
  );
  return res.rows;
}

export async function findConcertById(id) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, name, concert_date, venue, status, created_at, updated_at
     FROM concerts
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function insertConcert({ name, concertDate, venue, status }) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO concerts (name, concert_date, venue, status)
     VALUES ($1, $2::date, $3, $4)
     RETURNING id, name, concert_date, venue, status, created_at, updated_at`,
    [name, concertDate, venue, status]
  );
  return res.rows[0];
}

export async function updateConcert(id, patch) {
  const pool = getPool();
  const sets = [];
  const values = [];
  let i = 1;

  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(patch.name);
  }
  if (patch.concertDate !== undefined) {
    sets.push(`concert_date = $${i++}::date`);
    values.push(patch.concertDate);
  }
  if (patch.venue !== undefined) {
    sets.push(`venue = $${i++}`);
    values.push(patch.venue);
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(patch.status);
  }

  if (sets.length === 0) {
    return findConcertById(id);
  }

  sets.push(`updated_at = now()`);
  values.push(id);

  const res = await pool.query(
    `UPDATE concerts
     SET ${sets.join(", ")}
     WHERE id = $${i}
     RETURNING id, name, concert_date, venue, status, created_at, updated_at`,
    values
  );
  return res.rows[0] ?? null;
}
