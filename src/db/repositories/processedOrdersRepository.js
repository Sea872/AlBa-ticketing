import { getPool } from "../client/pool.js";

export async function findProcessedOrderByShopifyId(shopifyOrderId) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, shopify_order_id, processed_at
     FROM processed_orders
     WHERE shopify_order_id = $1::bigint
     LIMIT 1`,
    [String(shopifyOrderId)]
  );
  return res.rows[0] ?? null;
}

export async function insertProcessedOrder(shopifyOrderId) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO processed_orders (shopify_order_id)
     VALUES ($1::bigint)
     RETURNING id, shopify_order_id, processed_at`,
    [String(shopifyOrderId)]
  );
  return res.rows[0];
}
