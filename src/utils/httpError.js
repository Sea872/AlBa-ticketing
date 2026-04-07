/**
 * HTTP errors with optional client-facing code (machine-readable `error` field).
 */
export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {{ expose?: boolean, code?: string }} [options]
   */
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.expose = options.expose ?? false;
    this.code = options.code;
  }
}
