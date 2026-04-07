import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { loadConfig } from "../config.js";

/**
 * Payload embedded in the QR image (JSON). Identity is not a bare shared code;
 * it includes ticket id plus concert and order context (see project brief).
 */
export function buildQrPayloadForTicket({
  ticketId,
  concertId,
  shopifyOrderId,
  shopifyLineItemId,
  ticketIndex,
}) {
  return {
    schemaVersion: 1,
    ticketId,
    concertId,
    shopifyOrderId: String(shopifyOrderId),
    shopifyLineItemId: String(shopifyLineItemId),
    ticketIndex,
  };
}

/**
 * Writes a PNG QR code and returns absolute path plus a repo-root-relative posix path for DB storage.
 */
export async function writeTicketQrPng(ticketId, payloadObject) {
  const { ticketStorageDir } = loadConfig();
  await fs.mkdir(ticketStorageDir, { recursive: true });

  const fileName = `${ticketId}.png`;
  const absolutePath = path.join(ticketStorageDir, fileName);
  const text = JSON.stringify(payloadObject);

  await QRCode.toFile(absolutePath, text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    type: "png",
  });

  const relativePath = path.relative(process.cwd(), absolutePath).split(path.sep).join("/");

  return { absolutePath, relativePath };
}
