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
import { logDebug, logError, logInfo, logWarn } from "../utils/logger.js";

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
      webhookId: meta.webhookId ?? null,
    });
    return { duplicate: true, shopifyOrderId, ticketsCreated: 0 };
  }

  logDebug("shopify orders/paid processing started", {
    shopifyOrderId,
    shopDomain: meta.shopDomain ?? null,
    webhookId: meta.webhookId ?? null,
    eventId: meta.eventId ?? null,
  });

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
        shopDomain: meta.shopDomain ?? null,
        webhookId: meta.webhookId ?? null,
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

    logDebug("orders/paid line items", {
      shopifyOrderId,
      lineItemCount: lineItems.length,
    });

    for (const li of lineItems) {
      const productId = li?.product_id;
      if (productId === null || productId === undefined) {
        logDebug("orders/paid line item skipped: no product_id", { shopifyOrderId });
        continue;
      }
      const pid =
        typeof productId === "number" && Number.isFinite(productId)
          ? String(Math.trunc(productId))
          : String(productId).trim();
      if (!/^\d+$/.test(pid)) {
        logDebug("orders/paid line item skipped: invalid product_id", { shopifyOrderId, productId: pid });
        continue;
      }

      const concertId = await findActiveConcertIdForShopifyProduct(pid, client);
      if (!concertId) {
        logDebug("orders/paid no active concert link for product", { shopifyOrderId, shopifyProductId: pid });
        continue;
      }

      logDebug("orders/paid matched concert for product", {
        shopifyOrderId,
        shopifyProductId: pid,
        concertId,
      });

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

    if (ticketsCreated === 0) {
      const productIds = lineItems
        .map((li) => li?.product_id)
        .filter((id) => id !== null && id !== undefined)
        .map((id) =>
          typeof id === "number" && Number.isFinite(id) ? String(Math.trunc(id)) : String(id).trim()
        )
        .filter((s) => /^\d+$/.test(s));
      const uniqueProducts = [...new Set(productIds)].slice(0, 30);
      logWarn("orders/paid committed with zero tickets (check concert_products links and concert status)", {
        shopifyOrderId,
        shopDomain: meta.shopDomain ?? null,
        lineItemCount: lineItems.length,
        distinctProductIdsInPayload: uniqueProducts,
      });
    }

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

    logInfo("shopify orders/paid completed", {
      shopifyOrderId,
      ticketsCreated,
      topic: meta.topic ?? null,
      shopDomain: meta.shopDomain ?? null,
      webhookId: meta.webhookId ?? null,
      eventId: meta.eventId ?? null,
      customerEmailDomain: customerEmail.includes("@")
        ? customerEmail.slice(customerEmail.indexOf("@"))
        : null,
      ...emailOutcome,
    });

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
      logInfo("shopify orders/paid duplicate (constraint)", {
        shopifyOrderId,
        shopDomain: meta.shopDomain ?? null,
        webhookId: meta.webhookId ?? null,
      });
      return { duplicate: true, shopifyOrderId, ticketsCreated: 0 };
    }
    logError("shopify orders/paid transaction failed", {
      shopifyOrderId,
      shopDomain: meta.shopDomain ?? null,
      webhookId: meta.webhookId ?? null,
      pgCode: err?.code,
      message: err?.message ?? String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}
