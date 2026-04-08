/**
 * Minimal structured logger. Extend with pino/winston later if needed.
 * All log functions use camelCase (project convention).
 *
 * Verbose traces: set DEBUG_TICKETING=1 or LOG_LEVEL=debug (also on when NODE_ENV=development).
 */

function isDebugEnabled() {
  if (process.env.DEBUG_TICKETING === "1") {
    return true;
  }
  if (process.env.LOG_LEVEL === "debug") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  if (meta && Object.keys(meta).length > 0) {
    return `${ts} [${level}] ${message} ${JSON.stringify(meta)}`;
  }
  return `${ts} [${level}] ${message}`;
}

export function logInfo(message, meta) {
  console.log(formatMessage("INFO", message, meta));
}

export function logWarn(message, meta) {
  console.warn(formatMessage("WARN", message, meta));
}

export function logError(message, meta) {
  console.error(formatMessage("ERROR", message, meta));
}

/** Structured debug line; suppressed unless DEBUG_TICKETING / LOG_LEVEL / development. */
export function logDebug(message, meta) {
  if (!isDebugEnabled()) {
    return;
  }
  console.log(formatMessage("DEBUG", message, meta));
}
