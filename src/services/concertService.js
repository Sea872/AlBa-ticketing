import {
  listConcerts as listConcertsRepo,
  findConcertById,
  insertConcert,
  updateConcert as updateConcertRepo,
} from "../db/repositories/concertsRepository.js";
import { HttpError } from "../utils/httpError.js";
import { assertUuidParam } from "../utils/uuid.js";

const allowedStatuses = new Set(["active", "finished", "cancelled"]);

const maxNameLen = 500;
const maxVenueLen = 500;

function trimNonEmptyString(value, fieldName, maxLen) {
  if (value === undefined || value === null) {
    throw new HttpError(400, `${fieldName} is required`, { expose: true, code: "validation_error" });
  }
  const s = String(value).trim();
  if (s.length === 0) {
    throw new HttpError(400, `${fieldName} must not be empty`, { expose: true, code: "validation_error" });
  }
  if (s.length > maxLen) {
    throw new HttpError(400, `${fieldName} is too long`, { expose: true, code: "validation_error" });
  }
  return s;
}

/**
 * Validates YYYY-MM-DD calendar date.
 */
export function parseConcertDateString(value, fieldName = "concertDate") {
  if (value === undefined || value === null) {
    throw new HttpError(400, `${fieldName} is required`, { expose: true, code: "validation_error" });
  }
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new HttpError(400, `${fieldName} must be YYYY-MM-DD`, { expose: true, code: "validation_error" });
  }
  const d = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${fieldName} is not a valid date`, { expose: true, code: "validation_error" });
  }
  const [y, m, day] = raw.split("-").map((x) => Number.parseInt(x, 10));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    throw new HttpError(400, `${fieldName} is not a valid date`, { expose: true, code: "validation_error" });
  }
  return raw;
}

function parseStatus(value, { required, defaultValue }) {
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    if (required) {
      throw new HttpError(400, "status is required", { expose: true, code: "validation_error" });
    }
    return undefined;
  }
  const s = String(value).trim();
  if (!allowedStatuses.has(s)) {
    throw new HttpError(400, "status must be active, finished, or cancelled", {
      expose: true,
      code: "validation_error",
    });
  }
  return s;
}

export function mapConcertRow(row) {
  if (!row) {
    return null;
  }
  const d = row.concert_date;
  const concertDate =
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return {
    id: row.id,
    name: row.name,
    concertDate,
    venue: row.venue,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listConcertsForAdmin(query) {
  const raw = query?.status;
  let filters = {};
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const status = String(raw).trim();
    parseStatus(status, { required: true });
    filters = { status };
  }
  const rows = await listConcertsRepo(filters);
  return rows.map(mapConcertRow);
}

export async function getConcertForAdmin(concertId) {
  assertUuidParam(concertId, "concert id");
  const row = await findConcertById(concertId);
  if (!row) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }
  return mapConcertRow(row);
}

export async function createConcertForAdmin(body) {
  const name = trimNonEmptyString(body?.name, "name", maxNameLen);
  const concertDate = parseConcertDateString(body?.concertDate, "concertDate");
  const venue = trimNonEmptyString(body?.venue, "venue", maxVenueLen);
  const status = parseStatus(body?.status, { required: false, defaultValue: "active" });

  const row = await insertConcert({ name, concertDate, venue, status });
  return mapConcertRow(row);
}

export async function updateConcertForAdmin(concertId, body) {
  assertUuidParam(concertId, "concert id");

  const existing = await findConcertById(concertId);
  if (!existing) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "name")) {
    patch.name = trimNonEmptyString(body.name, "name", maxNameLen);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "concertDate")) {
    patch.concertDate = parseConcertDateString(body.concertDate, "concertDate");
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "venue")) {
    patch.venue = trimNonEmptyString(body.venue, "venue", maxVenueLen);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "status")) {
    patch.status = parseStatus(body.status, { required: true });
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "no fields to update", { expose: true, code: "validation_error" });
  }

  const row = await updateConcertRepo(concertId, patch);
  if (!row) {
    throw new HttpError(404, "concert not found", { code: "not_found" });
  }
  return mapConcertRow(row);
}
