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

/**
 * Recent paid-order webhook processing (processed_orders + ticket/email aggregates).
 */
export async function listRecentProcessedOrdersWithStats(limit = 20) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pool = getPool();
  const res = await pool.query(
    `SELECT po.shopify_order_id,
            po.processed_at,
            COUNT(ta.id)::int AS ticket_count,
            COUNT(ta.id) FILTER (WHERE ta.email_sent_at IS NOT NULL)::int AS emails_sent_count,
            COUNT(ta.id) FILTER (WHERE ta.email_last_error IS NOT NULL)::int AS tickets_with_email_errors,
            COALESCE(
              (SELECT c2.name FROM ticket_assignments ta2
               INNER JOIN concerts c2 ON c2.id = ta2.concert_id
               WHERE ta2.shopify_order_id = po.shopify_order_id
               ORDER BY ta2.created_at ASC
               LIMIT 1),
              '—'
            ) AS concert_name_hint
     FROM processed_orders po
     LEFT JOIN ticket_assignments ta ON ta.shopify_order_id = po.shopify_order_id
     GROUP BY po.id, po.shopify_order_id, po.processed_at
     ORDER BY po.processed_at DESC
     LIMIT $1`,
    [lim]
  );
  return res.rows;
}
