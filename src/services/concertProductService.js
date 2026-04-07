import { findConcertById } from "../db/repositories/concertsRepository.js";
import {
  listConcertProducts,
  insertConcertProduct,
  deleteConcertProduct,
} from "../db/repositories/concertProductsRepository.js";
import { HttpError } from "../utils/httpError.js";
import { assertUuidParam } from "../utils/uuid.js";

/** Max digits for Shopify Admin API numeric IDs (safe for bigint / JSON string transport). */
const maxShopifyIdDigits = 19;

/**
 * Parses Shopify product id from JSON (number or string). Returns decimal string for Postgres bigint.
 */
export function parseShopifyProductId(raw) {
  if (raw === undefined || raw === null) {
    throw new HttpError(400, "shopifyProductId is required", { expose: true, code: "validation_error" });
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      throw new HttpError(400, "shopifyProductId must be a positive integer", {
        expose: true,
        code: "validation_error",
      });
    }
    if (!Number.isSafeInteger(raw)) {
      throw new HttpError(400, "send shopifyProductId as a string for very large ids", {
        expose: true,
        code: "validation_error",
      });
    }
    return String(raw);
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    throw new HttpError(400, "shopifyProductId must be a positive integer", {
      expose: true,
      code: "validation_error",
    });
  }
  if (s.length > maxShopifyIdDigits) {
    throw new HttpError(400, "shopifyProductId is too long", { expose: true, code: "validation_error" });
  }
  if (s.startsWith("0") && s.length > 1) {
    throw new HttpError(400, "shopifyProductId must not have leading zeros", {
      expose: true,
      code: "validation_error",
    });
  }
  if (s === "0") {
    throw new HttpError(400, "shopifyProductId must be positive", { expose: true, code: "validation_error" });
  }
  return s;
}

function mapLinkRow(row) {
  return {
    id: row.id,
    concertId: row.concert_id,
    shopifyProductId: String(row.shopify_product_id),
    createdAt: row.created_at,
  };
}

export async function listConcertProductsForAdmin(concertId) {
  assertUuidParam(concertId, "concert id");
  const concert = await findConcertById(concertId);
  if (!concert) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }
  const rows = await listConcertProducts(concertId);
  return rows.map(mapLinkRow);
}

export async function addConcertProductForAdmin(concertId, body) {
  assertUuidParam(concertId, "concert id");
  const shopifyProductId = parseShopifyProductId(body?.shopifyProductId);

  const concert = await findConcertById(concertId);
  if (!concert) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }
  if (concert.status !== "active") {
    throw new HttpError(400, "only active concerts accept product links", {
      expose: true,
      code: "concert_not_active",
    });
  }

  try {
    const row = await insertConcertProduct(concertId, shopifyProductId);
    return mapLinkRow(row);
  } catch (err) {
    if (err && err.code === "23505") {
      throw new HttpError(409, "product already linked to this concert", {
        expose: true,
        code: "duplicate_link",
      });
    }
    throw err;
  }
}

export async function removeConcertProductForAdmin(concertId, linkId) {
  assertUuidParam(concertId, "concert id");
  assertUuidParam(linkId, "link id");

  const concert = await findConcertById(concertId);
  if (!concert) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }

  const deleted = await deleteConcertProduct(concertId, linkId);
  if (!deleted) {
    throw new HttpError(404, "product link not found", { code: "not_found" });
  }
  return { deleted: true };
}
