import { logError } from "../utils/logger.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Express error handler — must be registered last among middleware.
 * Expects errors to have optional `statusCode` and `expose` (safe for client).
 */
export function registerErrorHandler(app) {
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const statusCode =
      typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;

    logError("request failed", {
      path: req.path,
      method: req.method,
      statusCode,
      message: err.message,
    });

    const body = {
      ok: false,
      error:
        err instanceof HttpError && typeof err.code === "string" && err.code.length > 0
          ? err.code
          : statusCode === 500
            ? "internal_error"
            : "request_error",
    };

    if (err.expose === true && err.message) {
      body.detail = err.message;
    }

    res.status(statusCode).json(body);
  });
}
