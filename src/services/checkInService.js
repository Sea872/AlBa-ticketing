import { getPool } from "../db/client/pool.js";
import { insertScanLog } from "../db/repositories/scanLogsRepository.js";
import { findConcertById } from "../db/repositories/concertsRepository.js";
import { HttpError } from "../utils/httpError.js";
import { assertUuidParam, isUuid } from "../utils/uuid.js";
import { logInfo } from "../utils/logger.js";

const RESULT = {
  VALID: "valid",
  ALREADY_USED: "already_used",
  WRONG_EVENT: "wrong_event",
  CANCELLED: "cancelled",
  INVALID: "invalid",
};

/**
 * @param {unknown} body
 * @returns {object}
 */
export function parseQrFromBody(body) {
  const b = body ?? {};
  if (b.qrPayload != null && typeof b.qrPayload === "object" && !Array.isArray(b.qrPayload)) {
    return b.qrPayload;
  }
  if (typeof b.qr === "string" && b.qr.trim() !== "") {
    try {
      return JSON.parse(b.qr.trim());
    } catch {
      throw new HttpError(400, "qr must be valid JSON", { expose: true, code: "validation_error" });
    }
  }
  throw new HttpError(400, "send qrPayload object or qr string", {
    expose: true,
    code: "validation_error",
  });
}

/**
 * @param {unknown} p
 * @returns {boolean}
 */
export function isValidQrPayloadShape(p) {
  if (p === null || typeof p !== "object" || Array.isArray(p)) {
    return false;
  }
  const o = /** @type {Record<string, unknown>} */ (p);
  if (o.schemaVersion !== 1) {
    return false;
  }
  if (!isUuid(String(o.ticketId ?? ""))) {
    return false;
  }
  if (!isUuid(String(o.concertId ?? ""))) {
    return false;
  }
  if (o.shopifyOrderId === undefined || o.shopifyOrderId === null) {
    return false;
  }
  if (o.shopifyLineItemId === undefined || o.shopifyLineItemId === null) {
    return false;
  }
  const idx = o.ticketIndex;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 1) {
    return false;
  }
  return true;
}

/**
 * @param {object} stored
 * @param {object} scanned
 */
function payloadMatchesStored(stored, scanned) {
  return (
    stored.schemaVersion === scanned.schemaVersion &&
    String(stored.ticketId) === String(scanned.ticketId) &&
    String(stored.concertId) === String(scanned.concertId) &&
    String(stored.shopifyOrderId) === String(scanned.shopifyOrderId) &&
    String(stored.shopifyLineItemId) === String(scanned.shopifyLineItemId) &&
    Number(stored.ticketIndex) === Number(scanned.ticketIndex)
  );
}

/**
 * @param {{
 *   gateConcertId: string,
 *   body: object,
 *   staffUserId: string,
 * }} params
 */
export async function scanTicketAtGate({ gateConcertId, body, staffUserId }) {
  assertUuidParam(gateConcertId, "concert id");

  const gate = await findConcertById(gateConcertId);
  if (!gate) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }

  const deviceInfo =
    body.deviceInfo !== undefined && body.deviceInfo !== null
      ? String(body.deviceInfo).slice(0, 2000)
      : null;

  let parsed;
  try {
    parsed = parseQrFromBody(body);
  } catch (err) {
    throw err;
  }

  if (!isValidQrPayloadShape(parsed)) {
    await insertScanLog({
      ticketAssignmentId: null,
      concertId: gateConcertId,
      qrPayload: typeof parsed === "object" && parsed !== null ? parsed : { raw: parsed },
      result: RESULT.INVALID,
      deviceInfo,
      staffUserId,
    });
    return { result: RESULT.INVALID };
  }

  const ticketId = String(parsed.ticketId);

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `SELECT id, concert_id, shopify_order_id, shopify_line_item_id, customer_email, ticket_index,
              qr_payload, status
       FROM ticket_assignments
       WHERE id = $1::uuid
       FOR UPDATE`,
      [ticketId]
    );

    if (locked.rows.length === 0) {
      await insertScanLog(
        {
          ticketAssignmentId: null,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.INVALID,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.INVALID };
    }

    const ticket = locked.rows[0];
    const storedPayload =
      typeof ticket.qr_payload === "string" ? JSON.parse(ticket.qr_payload) : ticket.qr_payload;

    if (!payloadMatchesStored(storedPayload, parsed)) {
      await insertScanLog(
        {
          ticketAssignmentId: ticket.id,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.INVALID,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.INVALID };
    }

    if (String(ticket.concert_id) !== gateConcertId) {
      await insertScanLog(
        {
          ticketAssignmentId: ticket.id,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.WRONG_EVENT,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.WRONG_EVENT, ticketConcertId: ticket.concert_id };
    }

    if (ticket.status === "cancelled") {
      await insertScanLog(
        {
          ticketAssignmentId: ticket.id,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.CANCELLED,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.CANCELLED };
    }

    if (ticket.status === "used") {
      await insertScanLog(
        {
          ticketAssignmentId: ticket.id,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.ALREADY_USED,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.ALREADY_USED };
    }

    if (ticket.status !== "issued") {
      await insertScanLog(
        {
          ticketAssignmentId: ticket.id,
          concertId: gateConcertId,
          qrPayload: parsed,
          result: RESULT.INVALID,
          deviceInfo,
          staffUserId,
        },
        client
      );
      await client.query("COMMIT");
      return { result: RESULT.INVALID };
    }

    await client.query(
      `UPDATE ticket_assignments
       SET status = 'used', used_at = now(), updated_at = now()
       WHERE id = $1::uuid AND status = 'issued'`,
      [ticket.id]
    );

    await insertScanLog(
      {
        ticketAssignmentId: ticket.id,
        concertId: gateConcertId,
        qrPayload: parsed,
        result: RESULT.VALID,
        deviceInfo,
        staffUserId,
      },
      client
    );

    await client.query("COMMIT");

    logInfo("ticket checked in", {
      ticketId: ticket.id,
      gateConcertId,
      staffUserId,
    });

    return {
      result: RESULT.VALID,
      ticketId: ticket.id,
      concertId: ticket.concert_id,
      ticketIndex: ticket.ticket_index,
      customerEmail: ticket.customer_email,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
