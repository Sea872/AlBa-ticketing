import fs from "node:fs/promises";
import { Resend } from "resend";
import { loadConfig } from "../config.js";
import { findConcertById } from "../db/repositories/concertsRepository.js";
import {
  markTicketsEmailFailure,
  markTicketsEmailSuccess,
} from "../db/repositories/ticketAssignmentsRepository.js";
import { buildTicketOrderHtml } from "../emails/ticketOrderHtml.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";

/**
 * @typedef {{ ticketId: string, concertId: string, absolutePath: string, ticketIndex: number }} TicketEmailRow
 */

async function buildConcertLabel(concertId) {
  const row = await findConcertById(concertId);
  if (!row) {
    return "Concert";
  }
  const d = row.concert_date;
  const dateStr =
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return `${row.name} — ${dateStr} — ${row.venue}`;
}

/**
 * Sends one email per paid order with all QR PNGs attached. Does not throw; updates DB on success/failure.
 * @param {{ shopifyOrderId: string, customerEmail: string, tickets: TicketEmailRow[], isResend?: boolean }} params
 */
export async function sendOrderTicketEmail({ shopifyOrderId, customerEmail, tickets, isResend = false }) {
  const { resendApiKey, resendFromEmail } = loadConfig();

  const ticketIds = tickets.map((t) => t.ticketId);

  if (ticketIds.length === 0) {
    return { skipped: true };
  }

  if (!resendApiKey) {
    logWarn("RESEND_API_KEY not set; skipping ticket email", { shopifyOrderId });
    return { skipped: true };
  }

  try {
    const rows = [];
    for (const t of tickets) {
      const label = await buildConcertLabel(t.concertId);
      rows.push({ label, ticketIndex: t.ticketIndex });
    }

    const html = buildTicketOrderHtml({
      shopifyOrderId,
      customerEmail,
      rows,
    });

    const attachments = await Promise.all(
      tickets.map(async (t) => {
        const buf = await fs.readFile(t.absolutePath);
        return {
          filename: `ticket-${t.ticketIndex}-${String(t.ticketId).slice(0, 8)}.png`,
          content: buf.toString("base64"),
        };
      })
    );

    const resend = new Resend(resendApiKey);
    const subject = isResend
      ? `Your concert tickets (resent) — order ${shopifyOrderId}`
      : `Your concert tickets — order ${shopifyOrderId}`;

    const result = await resend.emails.send({
      from: resendFromEmail,
      to: customerEmail,
      subject,
      html,
      attachments,
    });

    if (result.error) {
      const errObj = result.error;
      const msg =
        typeof errObj === "object" && errObj !== null && "message" in errObj
          ? String(errObj.message)
          : JSON.stringify(errObj);
      throw new Error(msg);
    }

    const providerId = result.data?.id ?? null;
    const sentAt = new Date();
    await markTicketsEmailSuccess(ticketIds, { sentAt, providerId });

    logInfo("ticket email sent", {
      shopifyOrderId,
      to: customerEmail,
      ticketCount: ticketIds.length,
      providerId,
    });

    return { sent: true, providerId };
  } catch (err) {
    const message = err?.message ?? String(err);
    logError("ticket email failed", { shopifyOrderId, message });
    await markTicketsEmailFailure(ticketIds, message);
    return { sent: false, error: message };
  }
}
