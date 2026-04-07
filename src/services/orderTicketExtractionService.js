import fs from "node:fs/promises";
import { getPool } from "../db/client/pool.js";
import { findActiveConcertIdForShopifyProduct } from "../db/repositories/concertProductsRepository.js";
import {
  insertTicketAssignment,
  updateTicketQrAssignment,
} from "../db/repositories/ticketAssignmentsRepository.js";
import {
  findProcessedOrderByShopifyId,
  insertProcessedOrder,
} from "../db/repositories/processedOrdersRepository.js";
import { buildQrPayloadForTicket, writeTicketQrPng } from "./ticketQrService.js";
import { sendOrderTicketEmail } from "./ticketEmailService.js";
import { extractShopifyOrderIdFromPayload } from "../utils/shopifyOrderPayload.js";
import { logInfo, logWarn } from "../utils/logger.js";

export function buildPreliminaryQrPayload({ concertId, shopifyOrderId, shopifyLineItemId, ticketIndex }) {
  return {
    concertId,
    shopifyOrderId: String(shopifyOrderId),
    shopifyLineItemId: String(shopifyLineItemId),
    ticketIndex,
  };
}

export function extractOrderCustomerEmail(order) {
  const raw = order?.email ?? order?.contact_email ?? order?.customer?.email;
  if (!raw || String(raw).trim() === "") {
    return null;
  }
  return String(raw).trim().toLowerCase();
}

export function parseLineItems(order) {
  const items = order?.line_items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items;
}

/**
 * Creates ticket rows for matching line items, then records processed_orders (same transaction).
 */
export async function processOrdersPaidWithTickets(payload, meta = {}) {
  const shopifyOrderId = extractShopifyOrderIdFromPayload(payload);

  const existing = await findProcessedOrderByShopifyId(shopifyOrderId);
  if (existing) {
    logInfo("shopify orders/paid duplicate", {
      shopifyOrderId,
      topic: meta.topic ?? null,
      shopDomain: meta.shopDomain ?? null,
    });
    return { duplicate: true, shopifyOrderId, ticketsCreated: 0 };
  }

  const pool = getPool();
  const client = await pool.connect();
  /** @type {string[]} */
  const writtenQrFiles = [];
  /** @type {{ ticketId: string, concertId: string, absolutePath: string, ticketIndex: number }[]} */
  const ticketsForEmail = [];

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [String(shopifyOrderId)]);

    const dupAfterLock = await findProcessedOrderByShopifyId(shopifyOrderId, client);
    if (dupAfterLock) {
      await client.query("ROLLBACK");
      logInfo("shopify orders/paid duplicate after lock", { shopifyOrderId });
      return { duplicate: true, shopifyOrderId, ticketsCreated: 0 };
    }

    const customerEmail = extractOrderCustomerEmail(payload);
    if (!customerEmail) {
      logWarn("orders/paid missing customer email; recording processed without tickets", {
        shopifyOrderId,
      });
      await insertProcessedOrder(shopifyOrderId, client);
      await client.query("COMMIT");
      return {
        processed: true,
        shopifyOrderId,
        ticketsCreated: 0,
        skippedReason: "missing_email",
      };
    }

    const lineItems = parseLineItems(payload);
    let ticketsCreated = 0;

    for (const li of lineItems) {
      const productId = li?.product_id;
      if (productId === null || productId === undefined) {
        continue;
      }
      const pid =
        typeof productId === "number" && Number.isFinite(productId)
          ? String(Math.trunc(productId))
          : String(productId).trim();
      if (!/^\d+$/.test(pid)) {
        continue;
      }

      const concertId = await findActiveConcertIdForShopifyProduct(pid, client);
      if (!concertId) {
        continue;
      }

      const lineItemId = li?.id;
      if (lineItemId === null || lineItemId === undefined) {
        logWarn("line item missing id", { shopifyOrderId, productId: pid });
        continue;
      }
      const lineIdStr =
        typeof lineItemId === "number" && Number.isFinite(lineItemId)
          ? String(Math.trunc(lineItemId))
          : String(lineItemId).trim();
      if (!/^\d+$/.test(lineIdStr)) {
        continue;
      }

      let quantity = Number(li?.quantity ?? 0);
      if (!Number.isFinite(quantity) || quantity < 1) {
        continue;
      }
      quantity = Math.floor(quantity);

      for (let t = 1; t <= quantity; t += 1) {
        const qrPayload = buildPreliminaryQrPayload({
          concertId,
          shopifyOrderId,
          shopifyLineItemId: lineIdStr,
          ticketIndex: t,
        });
        const row = await insertTicketAssignment(
          {
            concertId,
            shopifyOrderId,
            shopifyLineItemId: lineIdStr,
            customerEmail,
            ticketIndex: t,
            qrPayload,
          },
          client
        );
        const ticketId = row.id;
        const finalPayload = buildQrPayloadForTicket({
          ticketId,
          concertId,
          shopifyOrderId,
          shopifyLineItemId: lineIdStr,
          ticketIndex: t,
        });
        const { absolutePath, relativePath } = await writeTicketQrPng(ticketId, finalPayload);
        writtenQrFiles.push(absolutePath);
        await updateTicketQrAssignment(ticketId, finalPayload, relativePath, client);
        ticketsForEmail.push({
          ticketId,
          concertId,
          absolutePath,
          ticketIndex: t,
        });
        ticketsCreated += 1;
      }
    }

    await insertProcessedOrder(shopifyOrderId, client);
    await client.query("COMMIT");

    logInfo("shopify orders/paid processed", {
      shopifyOrderId,
      ticketsCreated,
      topic: meta.topic ?? null,
      shopDomain: meta.shopDomain ?? null,
    });

    /** @type {Record<string, unknown>} */
    const emailOutcome = {};
    if (ticketsForEmail.length > 0) {
      const emailResult = await sendOrderTicketEmail({
        shopifyOrderId,
        customerEmail,
        tickets: ticketsForEmail,
      });
      if (emailResult.skipped) {
        emailOutcome.emailSkipped = true;
      } else if (emailResult.sent) {
        emailOutcome.emailSent = true;
        if (emailResult.providerId) {
          emailOutcome.emailProviderId = emailResult.providerId;
        }
      } else {
        emailOutcome.emailSent = false;
        if (emailResult.error) {
          emailOutcome.emailError = emailResult.error;
        }
      }
    }

    return { processed: true, shopifyOrderId, ticketsCreated, ...emailOutcome };
  } catch (err) {
    await client.query("ROLLBACK");
    for (const filePath of writtenQrFiles) {
      try {
        await fs.unlink(filePath);
      } catch {
        /* ignore cleanup errors */
      }
    }
    if (err && err.code === "23505") {
      logInfo("shopify orders/paid duplicate (constraint)", { shopifyOrderId });
      return { duplicate: true, shopifyOrderId, ticketsCreated: 0 };
    }
    throw err;
  } finally {
    client.release();
  }
}
