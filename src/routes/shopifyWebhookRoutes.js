import express from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { handleOrdersPaidWebhook } from "../services/shopifyWebhookService.js";

/**
 * Shopify webhooks — use raw JSON body for HMAC verification (registered before express.json).
 */
export function createShopifyWebhookRouter() {
  const router = express.Router();
  const rawJson = express.raw({
    type: (req) => {
      const t = req.headers["content-type"] ?? "";
      return t.includes("application/json");
    },
    limit: "5mb",
  });

  router.post(
    "/shopify/orders-paid",
    rawJson,
    asyncHandler(async (req, res) => {
      await handleOrdersPaidWebhook(req, res);
    })
  );

  return router;
}
