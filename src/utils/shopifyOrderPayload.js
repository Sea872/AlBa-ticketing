import { HttpError } from "./httpError.js";

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
