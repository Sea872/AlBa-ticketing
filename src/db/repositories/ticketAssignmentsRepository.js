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

/**
 * @param {string} ticketId
 * @param {object} qrPayload
 * @param {string} qrFilePath
 * @param {import('pg').PoolClient | null} [client]
 */
export async function updateTicketQrAssignment(ticketId, qrPayload, qrFilePath, client = null) {
  const executor = client ?? getPool();
  await executor.query(
    `UPDATE ticket_assignments
     SET qr_payload = $1::jsonb,
         qr_file_path = $2,
         updated_at = now()
     WHERE id = $3::uuid`,
    [JSON.stringify(qrPayload), qrFilePath, ticketId]
  );
}

/**
 * @param {string[]} ticketIds
 * @param {{ sentAt: Date, providerId: string | null }} meta
 */
export async function markTicketsEmailSuccess(ticketIds, meta, client = null) {
  if (ticketIds.length === 0) {
    return;
  }
  const executor = client ?? getPool();
  await executor.query(
    `UPDATE ticket_assignments
     SET email_sent_at = $2::timestamptz,
         email_provider_id = $3,
         email_last_error = NULL,
         updated_at = now()
     WHERE id = ANY($1::uuid[])`,
    [ticketIds, meta.sentAt, meta.providerId]
  );
}

/**
 * @param {string[]} ticketIds
 * @param {string} errorMessage
 */
export async function markTicketsEmailFailure(ticketIds, errorMessage, client = null) {
  if (ticketIds.length === 0) {
    return;
  }
  const executor = client ?? getPool();
  const msg = String(errorMessage).slice(0, 2000);
  await executor.query(
    `UPDATE ticket_assignments
     SET email_last_error = $2,
         updated_at = now()
     WHERE id = ANY($1::uuid[])`,
    [ticketIds, msg]
  );
}

export async function listTicketAssignmentsByShopifyOrderId(shopifyOrderId) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index,
            qr_file_path, status, created_at
     FROM ticket_assignments
     WHERE shopify_order_id = $1::bigint
     ORDER BY shopify_line_item_id ASC, ticket_index ASC`,
    [String(shopifyOrderId)]
  );
  return res.rows;
}

export async function findTicketAssignmentById(ticketId) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index,
            qr_file_path, status, created_at
     FROM ticket_assignments
     WHERE id = $1::uuid
     LIMIT 1`,
    [ticketId]
  );
  return res.rows[0] ?? null;
}

export async function incrementTicketResendCount(ticketIds, client = null) {
  if (ticketIds.length === 0) {
    return;
  }
  const executor = client ?? getPool();
  await executor.query(
    `UPDATE ticket_assignments
     SET email_resend_count = email_resend_count + 1,
         updated_at = now()
     WHERE id = ANY($1::uuid[])`,
    [ticketIds]
  );
}
