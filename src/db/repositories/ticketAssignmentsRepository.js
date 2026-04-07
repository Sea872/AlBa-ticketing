import { getPool } from "../client/pool.js";

/**
 * @param {object} row
 * @param {string} row.concertId
 * @param {string} row.shopifyOrderId
 * @param {string} row.shopifyLineItemId
 * @param {string} row.customerEmail
 * @param {number} row.ticketIndex
 * @param {object} row.qrPayload
 * @param {import('pg').PoolClient | null} [client]
 */
export async function insertTicketAssignment(row, client = null) {
  const executor = client ?? getPool();
  const res = await executor.query(
    `INSERT INTO ticket_assignments (
       concert_id,
       shopify_order_id,
       shopify_line_item_id,
       customer_email,
       ticket_index,
       qr_payload,
       qr_file_path,
       status
     )
     VALUES (
       $1::uuid,
       $2::bigint,
       $3::bigint,
       $4,
       $5,
       $6::jsonb,
       NULL,
       'issued'
     )
     RETURNING id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index, qr_payload, created_at`,
    [
      row.concertId,
      String(row.shopifyOrderId),
      String(row.shopifyLineItemId),
      row.customerEmail,
      row.ticketIndex,
      JSON.stringify(row.qrPayload),
    ]
  );
  return res.rows[0];
}
