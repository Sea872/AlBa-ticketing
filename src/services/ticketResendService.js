import fs from "node:fs/promises";
import path from "node:path";
import {
  findTicketAssignmentById,
  incrementTicketResendCount,
  listTicketAssignmentsByShopifyOrderId,
} from "../db/repositories/ticketAssignmentsRepository.js";
import { sendOrderTicketEmail } from "./ticketEmailService.js";
import { assertResendRateLimitOk } from "./ticketResendRateLimit.js";
import { HttpError } from "../utils/httpError.js";
import { assertUuidParam } from "../utils/uuid.js";
import { logInfo } from "../utils/logger.js";

function parseShopifyOrderIdBody(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const s =
    typeof raw === "number" && Number.isFinite(raw)
      ? String(Math.trunc(raw))
      : String(raw).trim();
  if (!/^\d+$/.test(s) || s === "0") {
    throw new HttpError(400, "shopifyOrderId must be a positive integer", {
      expose: true,
      code: "validation_error",
    });
  }
  return s;
}

function assertSameCustomerEmail(rows) {
  const emails = [...new Set(rows.map((r) => r.customer_email))];
  if (emails.length !== 1) {
    throw new HttpError(400, "tickets must share the same customer email", {
      expose: true,
      code: "validation_error",
    });
  }
}

function buildProviderFailureDetail(rawError) {
  const msg = String(rawError ?? "email provider request failed");
  const lower = msg.toLowerCase();
  if (
    lower.includes("https") ||
    lower.includes("ssl") ||
    lower.includes("tls") ||
    lower.includes("certificate")
  ) {
    return `${msg}. Check HTTPS/TLS connectivity and certificate trust between this server and Resend API.`;
  }
  return msg;
}

/**
 * Admin resend: one of shopifyOrderId (all tickets) or ticketId (single ticket).
 */
export async function resendTicketEmailByAdmin({ adminUserId, shopifyOrderId, ticketId }) {
  const hasOrder = shopifyOrderId !== undefined && shopifyOrderId !== null && String(shopifyOrderId).trim() !== "";
  const hasTicket = ticketId !== undefined && ticketId !== null && String(ticketId).trim() !== "";

  if (hasOrder === hasTicket) {
    throw new HttpError(400, "send exactly one of shopifyOrderId or ticketId", {
      expose: true,
      code: "validation_error",
    });
  }

  let rows;
  if (hasTicket) {
    assertUuidParam(String(ticketId).trim(), "ticket id");
    const row = await findTicketAssignmentById(String(ticketId).trim());
    if (!row) {
      throw new HttpError(404, "ticket not found", { code: "not_found" });
    }
    rows = [row];
  } else {
    const oid = parseShopifyOrderIdBody(shopifyOrderId);
    rows = await listTicketAssignmentsByShopifyOrderId(oid);
    if (rows.length === 0) {
      throw new HttpError(404, "no tickets for this order", { code: "not_found" });
    }
  }

  assertSameCustomerEmail(rows);

  for (const r of rows) {
    if (!r.qr_file_path) {
      throw new HttpError(400, "ticket has no QR file path", {
        expose: true,
        code: "missing_qr_file",
      });
    }
  }

  const rateKey = hasTicket
    ? `admin:${adminUserId}:ticket:${rows[0].id}`
    : `admin:${adminUserId}:order:${rows[0].shopify_order_id}`;
  assertResendRateLimitOk(rateKey);

  const shopifyOrderIdStr = String(rows[0].shopify_order_id);
  const customerEmail = rows[0].customer_email;

  const tickets = rows.map((r) => {
    const absolutePath = path.resolve(process.cwd(), r.qr_file_path);
    return {
      ticketId: r.id,
      concertId: r.concert_id,
      ticketIndex: r.ticket_index,
      absolutePath,
    };
  });

  for (const t of tickets) {
    try {
      await fs.access(t.absolutePath);
    } catch {
      throw new HttpError(400, "QR file missing on disk", {
        expose: true,
        code: "missing_file",
      });
    }
  }

  const result = await sendOrderTicketEmail({
    shopifyOrderId: shopifyOrderIdStr,
    customerEmail,
    tickets,
    isResend: true,
  });

  if (result.skipped) {
    throw new HttpError(503, "RESEND_API_KEY not configured", {
      expose: true,
      code: "provider_not_configured",
    });
  }

  if (result.sent) {
    await incrementTicketResendCount(rows.map((r) => r.id));
    logInfo("admin ticket email resent", {
      adminUserId,
      shopifyOrderId: shopifyOrderIdStr,
      ticketCount: rows.length,
      providerId: result.providerId,
    });
    return {
      sent: true,
      shopifyOrderId: shopifyOrderIdStr,
      ticketCount: rows.length,
      providerId: result.providerId,
    };
  }

  throw new HttpError(502, buildProviderFailureDetail(result.error), {
    expose: true,
    code: "email_send_failed",
  });
}
