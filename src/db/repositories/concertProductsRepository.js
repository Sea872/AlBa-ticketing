import { getPool } from "../client/pool.js";

export async function listConcertProducts(concertId) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, concert_id, shopify_product_id, created_at
     FROM concert_products
     WHERE concert_id = $1
     ORDER BY created_at ASC`,
    [concertId]
  );
  return res.rows;
}

export async function insertConcertProduct(concertId, shopifyProductId) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO concert_products (concert_id, shopify_product_id)
     VALUES ($1, $2::bigint)
     RETURNING id, concert_id, shopify_product_id, created_at`,
    [concertId, shopifyProductId]
  );
  return res.rows[0];
}

export async function deleteConcertProduct(concertId, linkId) {
  const pool = getPool();
  const res = await pool.query(
    `DELETE FROM concert_products
     WHERE id = $1 AND concert_id = $2
     RETURNING id`,
    [linkId, concertId]
  );
  return res.rows[0] ?? null;
}

/**
 * First active concert linked to this Shopify product id (deterministic order).
 */
export async function findActiveConcertIdForShopifyProduct(shopifyProductId, client = null) {
  const executor = client ?? getPool();
  const res = await executor.query(
    `SELECT cp.concert_id
     FROM concert_products cp
     INNER JOIN concerts c ON c.id = cp.concert_id
     WHERE cp.shopify_product_id = $1::bigint
       AND c.status = 'active'
     ORDER BY cp.created_at ASC
     LIMIT 1`,
    [String(shopifyProductId)]
  );
  return res.rows[0]?.concert_id ?? null;
}
