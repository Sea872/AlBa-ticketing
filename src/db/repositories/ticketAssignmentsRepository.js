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

export async function listTicketAssignmentsByConcertId(concertId) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index,
            qr_file_path, status, email_sent_at, email_last_error, email_provider_id, email_resend_count,
            created_at, updated_at
     FROM ticket_assignments
     WHERE concert_id = $1::uuid
     ORDER BY created_at DESC, shopify_order_id ASC, ticket_index ASC`,
    [concertId]
  );
  return res.rows;
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
            qr_file_path, status, email_sent_at, email_last_error, email_provider_id, email_resend_count,
            created_at, updated_at
     FROM ticket_assignments
     WHERE id = $1::uuid
     LIMIT 1`,
    [ticketId]
  );
  return res.rows[0] ?? null;
}

/**
 * Search tickets by exact email or by Shopify order id (admin).
 * @param {{ email?: string, shopifyOrderId?: string, limit?: number }} params
 */
export async function searchTicketsForAdmin(params) {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
  const pool = getPool();
  if (params.shopifyOrderId != null && String(params.shopifyOrderId).trim() !== "") {
    const oid = String(params.shopifyOrderId).trim();
    if (!/^\d+$/.test(oid)) {
      return [];
    }
    const res = await pool.query(
      `SELECT ta.id, ta.concert_id, ta.shopify_order_id, ta.shopify_line_item_id, ta.customer_email,
              ta.ticket_index, ta.status, ta.email_sent_at, ta.email_last_error, ta.created_at,
              c.name AS concert_name
       FROM ticket_assignments ta
       INNER JOIN concerts c ON c.id = ta.concert_id
       WHERE ta.shopify_order_id = $1::bigint
       ORDER BY ta.ticket_index ASC
       LIMIT $2`,
      [oid, limit]
    );
    return res.rows;
  }
  if (params.email != null && String(params.email).trim() !== "") {
    const em = String(params.email).trim().toLowerCase();
    const res = await pool.query(
      `SELECT ta.id, ta.concert_id, ta.shopify_order_id, ta.shopify_line_item_id, ta.customer_email,
              ta.ticket_index, ta.status, ta.email_sent_at, ta.email_last_error, ta.created_at,
              c.name AS concert_name
       FROM ticket_assignments ta
       INNER JOIN concerts c ON c.id = ta.concert_id
       WHERE lower(ta.customer_email) = $1
       ORDER BY ta.created_at DESC
       LIMIT $2`,
      [em, limit]
    );
    return res.rows;
  }
  return [];
}

/**
 * Tickets where initial email send failed (email_last_error set).
 */
export async function listTicketsWithEmailFailures(limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pool = getPool();
  const res = await pool.query(
    `SELECT ta.id, ta.concert_id, ta.shopify_order_id, ta.customer_email, ta.ticket_index,
            ta.status, ta.email_last_error, ta.email_sent_at, ta.created_at,
            c.name AS concert_name
     FROM ticket_assignments ta
     INNER JOIN concerts c ON c.id = ta.concert_id
     WHERE ta.email_last_error IS NOT NULL
     ORDER BY ta.updated_at DESC NULLS LAST, ta.created_at DESC
     LIMIT $1`,
    [lim]
  );
  return res.rows;
}

/**
 * Cancel an issued ticket (admin). Only from `issued` → `cancelled`.
 */
export async function cancelTicketById(ticketId) {
  const pool = getPool();
  const res = await pool.query(
    `UPDATE ticket_assignments
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1::uuid AND status = 'issued'
     RETURNING id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index, status`,
    [ticketId]
  );
  return res.rows[0] ?? null;
}

export async function listAllTicketsForAdmin(limit = 200) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const pool = getPool();
  const res = await pool.query(
    `SELECT ta.id, ta.concert_id, ta.shopify_order_id, ta.shopify_line_item_id, ta.customer_email,
            ta.ticket_index, ta.status, ta.email_sent_at, ta.email_last_error, ta.created_at,
            c.name AS concert_name
     FROM ticket_assignments ta
     INNER JOIN concerts c ON c.id = ta.concert_id
     ORDER BY ta.created_at DESC
     LIMIT $1`,
    [lim]
  );
  return res.rows;
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
