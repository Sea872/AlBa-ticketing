import { getPool } from "../client/pool.js";

/**
 * @param {import('pg').Pool | import('pg').PoolClient | null} [executor]
 */
export async function findProcessedOrderByShopifyId(shopifyOrderId, executor = null) {
  const db = executor ?? getPool();
  const res = await db.query(
    `SELECT id, shopify_order_id, processed_at
     FROM processed_orders
     WHERE shopify_order_id = $1::bigint
     LIMIT 1`,
    [String(shopifyOrderId)]
  );
  return res.rows[0] ?? null;
}

/**
 * @param {string} shopifyOrderId
 * @param {import('pg').Pool | import('pg').PoolClient | null} [executor] pool or client (e.g. inside a transaction)
 */
export async function insertProcessedOrder(shopifyOrderId, executor = null) {
  const db = executor ?? getPool();
  const res = await db.query(
    `INSERT INTO processed_orders (shopify_order_id)
     VALUES ($1::bigint)
     RETURNING id, shopify_order_id, processed_at`,
    [String(shopifyOrderId)]
  );
  return res.rows[0];
}
