import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import {
  findProcessedOrderByShopifyId,
  insertProcessedOrder,
} from "../db/repositories/processedOrdersRepository.js";
import { HttpError } from "../utils/httpError.js";
import { logInfo, logWarn } from "../utils/logger.js";

const ordersPaidTopic = "orders/paid";

/**
 * Verifies `X-Shopify-Hmac-Sha256` against the raw body (Shopify custom app secret).
 */
export function verifyShopifyWebhookHmac(rawBodyBuffer, receivedHmacHeader, secret) {
  if (!secret || typeof secret !== "string") {
    return false;
  }
  if (!receivedHmacHeader || typeof receivedHmacHeader !== "string") {
    return false;
  }
  const trimmed = receivedHmacHeader.trim();
  const generated = crypto.createHmac("sha256", secret).update(rawBodyBuffer).digest("base64");
  const a = Buffer.from(generated, "utf8");
  const b = Buffer.from(trimmed, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function extractShopifyOrderIdFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "invalid payload", { code: "invalid_payload" });
  }
  const id = payload.id;
  if (typeof id === "number" && Number.isInteger(id) && id > 0) {
    return String(id);
  }
  if (typeof id === "string" && /^\d+$/.test(id) && id !== "0") {
    return id;
  }
  throw new HttpError(400, "order id missing or invalid", { code: "invalid_payload" });
}

/**
 * Handles verified `orders/paid` JSON: idempotency via `processed_orders`.
 * Phase 9 will add ticket issuance before (or in the same transaction as) recording processed orders.
 */
export async function processOrdersPaidPayload(payload, meta = {}) {
  const shopifyOrderId = extractShopifyOrderIdFromPayload(payload);

  const existing = await findProcessedOrderByShopifyId(shopifyOrderId);
  if (existing) {
    logInfo("shopify orders/paid duplicate", {
      shopifyOrderId,
      topic: meta.topic ?? null,
      shopDomain: meta.shopDomain ?? null,
    });
    return { duplicate: true, shopifyOrderId };
  }

  try {
    await insertProcessedOrder(shopifyOrderId);
  } catch (err) {
    if (err && err.code === "23505") {
      logInfo("shopify orders/paid duplicate (race)", {
        shopifyOrderId,
        topic: meta.topic ?? null,
      });
      return { duplicate: true, shopifyOrderId };
    }
    throw err;
  }

  logInfo("shopify orders/paid recorded", {
    shopifyOrderId,
    topic: meta.topic ?? null,
    shopDomain: meta.shopDomain ?? null,
  });
  return { processed: true, shopifyOrderId };
}

/**
 * Express handler: expects `express.raw` body (Buffer) for HMAC verification.
 */
export async function handleOrdersPaidWebhook(req, res) {
  const { shopifyWebhookSecret } = loadConfig();
  if (!shopifyWebhookSecret) {
    logWarn("SHOPIFY_WEBHOOK_SECRET / SHOPIFY_API_SECRET not set; rejecting webhook");
    throw new HttpError(500, "Shopify webhook secret not configured", {
      code: "server_misconfigured",
    });
  }

  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    throw new HttpError(400, "expected raw body buffer", { code: "invalid_payload" });
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!verifyShopifyWebhookHmac(raw, hmacHeader, shopifyWebhookSecret)) {
    logWarn("shopify webhook HMAC verification failed");
    throw new HttpError(401, "invalid HMAC", { code: "invalid_hmac" });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON body", { code: "invalid_payload" });
  }

  const topicHeader = req.get("X-Shopify-Topic");
  const topic = topicHeader ? String(topicHeader).trim().toLowerCase() : "";
  if (topic && topic !== ordersPaidTopic) {
    logWarn("shopify webhook unexpected topic", { topic: topicHeader });
    res.status(200).json({ ok: true, ignored: true, reason: "unexpected_topic" });
    return;
  }

  const shopDomain = req.get("X-Shopify-Shop-Domain") ?? null;

  const result = await processOrdersPaidPayload(payload, {
    topic: topicHeader ?? ordersPaidTopic,
    shopDomain,
  });

  if (result.duplicate) {
    res.status(200).json({ ok: true, duplicate: true, shopifyOrderId: result.shopifyOrderId });
    return;
  }

  res.status(200).json({
    ok: true,
    processed: true,
    shopifyOrderId: result.shopifyOrderId,
  });
}
