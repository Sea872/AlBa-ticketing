import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { processOrdersPaidWithTickets } from "./orderTicketExtractionService.js";
import { HttpError } from "../utils/httpError.js";
import { logDebug, logError, logWarn } from "../utils/logger.js";

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

/**
 * Express handler: expects `express.raw` body (Buffer) for HMAC verification.
 */
export async function handleOrdersPaidWebhook(req, res) {
  const webhookId = req.get("X-Shopify-Webhook-Id") ?? null;
  const eventId = req.get("X-Shopify-Event-Id") ?? null;
  const shopDomain = req.get("X-Shopify-Shop-Domain") ?? null;
  const apiVersion = req.get("X-Shopify-Api-Version") ?? null;

  const { shopifyWebhookSecret } = loadConfig();
  if (!shopifyWebhookSecret) {
    logWarn("shopify webhook rejected: secret not configured", {
      shopDomain,
      webhookId,
    });
    throw new HttpError(500, "Shopify webhook secret not configured", {
      code: "server_misconfigured",
    });
  }

  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    logWarn("shopify webhook bad body type", {
      shopDomain,
      webhookId,
      bodyType: raw === null || raw === undefined ? String(raw) : typeof raw,
    });
    throw new HttpError(400, "expected raw body buffer", { code: "invalid_payload" });
  }

  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!verifyShopifyWebhookHmac(raw, hmacHeader, shopifyWebhookSecret)) {
    logWarn("shopify webhook HMAC verification failed", {
      shopDomain,
      webhookId,
      bodyBytes: raw.length,
      hasHmacHeader: Boolean(hmacHeader && String(hmacHeader).trim()),
    });
    throw new HttpError(401, "invalid HMAC", { code: "invalid_hmac" });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch (parseErr) {
    logWarn("shopify webhook JSON parse failed", {
      shopDomain,
      webhookId,
      bodyBytes: raw.length,
      message: parseErr?.message ?? String(parseErr),
    });
    throw new HttpError(400, "invalid JSON body", { code: "invalid_payload" });
  }

  const topicHeader = req.get("X-Shopify-Topic");
  const topic = topicHeader ? String(topicHeader).trim().toLowerCase() : "";
  if (topic && topic !== ordersPaidTopic) {
    logWarn("shopify webhook ignored: unexpected topic", {
      topic: topicHeader,
      shopDomain,
      webhookId,
    });
    res.status(200).json({ ok: true, ignored: true, reason: "unexpected_topic" });
    return;
  }

  const orderIdForLog =
    payload && typeof payload === "object" && payload.id !== undefined && payload.id !== null
      ? String(payload.id)
      : null;

  logDebug("shopify webhook orders/paid accepted", {
    shopDomain,
    webhookId,
    eventId,
    apiVersion,
    bodyBytes: raw.length,
    orderId: orderIdForLog,
  });

  let result;
  try {
    result = await processOrdersPaidWithTickets(payload, {
      topic: topicHeader ?? ordersPaidTopic,
      shopDomain,
      webhookId,
      eventId,
    });
  } catch (err) {
    logError("shopify webhook handler failed", {
      shopDomain,
      webhookId,
      eventId,
      orderId: orderIdForLog,
      message: err?.message ?? String(err),
      code: err?.code,
    });
    throw err;
  }

  if (result.duplicate) {
    logDebug("shopify webhook response: duplicate", {
      shopifyOrderId: result.shopifyOrderId,
      shopDomain,
      webhookId,
    });
    res.status(200).json({ ok: true, duplicate: true, shopifyOrderId: result.shopifyOrderId });
    return;
  }

  const body = {
    ok: true,
    processed: true,
    shopifyOrderId: result.shopifyOrderId,
    ticketsCreated: result.ticketsCreated,
  };
  if (result.skippedReason) {
    body.skippedReason = result.skippedReason;
  }
  if ("emailSent" in result) {
    body.emailSent = result.emailSent;
  }
  if ("emailSkipped" in result) {
    body.emailSkipped = result.emailSkipped;
  }
  if (result.emailError) {
    body.emailError = result.emailError;
  }
  if (result.emailProviderId) {
    body.emailProviderId = result.emailProviderId;
  }
  res.status(200).json(body);
}
