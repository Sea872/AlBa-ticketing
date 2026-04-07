import { HttpError } from "./httpError.js";

export function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function assertUuidParam(id, label) {
  if (!isUuid(id)) {
    throw new HttpError(400, `invalid ${label}`, { expose: true, code: "validation_error" });
  }
}
