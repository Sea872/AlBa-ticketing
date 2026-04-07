import { HttpError } from "../utils/httpError.js";

const defaultWindowMs = 30_000;
const lastByKey = new Map();

/**
 * Simple in-memory rate limit for admin resend (per admin + target). Resets on process restart.
 */
export function assertResendRateLimitOk(key, windowMs = defaultWindowMs) {
  const now = Date.now();
  const last = lastByKey.get(key) ?? 0;
  if (now - last < windowMs) {
    throw new HttpError(429, "too many resend requests, try again later", {
      expose: true,
      code: "rate_limited",
    });
  }
  lastByKey.set(key, now);
}
