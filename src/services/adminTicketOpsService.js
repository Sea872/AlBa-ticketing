import { HttpError } from "../utils/httpError.js";
import { assertUuidParam } from "../utils/uuid.js";
import {
  searchTicketsForAdmin as searchTicketsRepo,
  listTicketsWithEmailFailures,
  cancelTicketById,
} from "../db/repositories/ticketAssignmentsRepository.js";

function mapTicketRow(row) {
  if (!row) {
    return null;
  }
  const sent = row.email_sent_at;
  return {
    id: row.id,
    concertId: row.concert_id,
    concertName: row.concert_name ?? null,
    shopifyOrderId: String(row.shopify_order_id),
    shopifyLineItemId: row.shopify_line_item_id != null ? String(row.shopify_line_item_id) : null,
    customerEmail: row.customer_email,
    ticketIndex: row.ticket_index,
    status: row.status,
    emailSentAt: sent instanceof Date ? sent.toISOString() : sent ? String(sent) : null,
    emailLastError: row.email_last_error ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/**
 * @param {{ email?: string, shopifyOrderId?: string, limit?: number }} query
 */
export async function searchTicketsForAdmin(query) {
  const email = query.email != null ? String(query.email).trim() : "";
  const orderId = query.shopifyOrderId != null ? String(query.shopifyOrderId).trim() : "";
  const hasEmail = email.length > 0;
  const hasOrder = orderId.length > 0;
  if (hasEmail === hasOrder) {
    throw new HttpError(400, "provide exactly one of email or shopifyOrderId", {
      expose: true,
      code: "validation_error",
    });
  }
  const rows = await searchTicketsRepo({
    email: hasEmail ? email : undefined,
    shopifyOrderId: hasOrder ? orderId : undefined,
    limit: query.limit,
  });
  return rows.map(mapTicketRow);
}

export async function listEmailFailuresForAdmin(limit) {
  let lim;
  if (limit != null && String(limit).trim() !== "") {
    lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  }
  const rows = await listTicketsWithEmailFailures(lim);
  return rows.map((row) => ({
    id: row.id,
    concertId: row.concert_id,
    concertName: row.concert_name,
    shopifyOrderId: String(row.shopify_order_id),
    customerEmail: row.customer_email,
    ticketIndex: row.ticket_index,
    status: row.status,
    emailLastError: row.email_last_error,
    emailSentAt:
      row.email_sent_at instanceof Date
        ? row.email_sent_at.toISOString()
        : row.email_sent_at
          ? String(row.email_sent_at)
          : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

export async function cancelTicketForAdmin(ticketId) {
  assertUuidParam(ticketId, "ticket id");
  const row = await cancelTicketById(ticketId);
  if (!row) {
    throw new HttpError(
      404,
      "ticket not found or not in issued status",
      { expose: true, code: "not_found" }
    );
  }
  return {
    id: row.id,
    concertId: row.concert_id,
    shopifyOrderId: String(row.shopify_order_id),
    customerEmail: row.customer_email,
    ticketIndex: row.ticket_index,
    status: row.status,
  };
}
