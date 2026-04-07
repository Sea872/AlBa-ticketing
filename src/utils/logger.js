/**
 * Minimal structured logger. Extend with pino/winston later if needed.
 * All log functions use camelCase (project convention).
 */

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
