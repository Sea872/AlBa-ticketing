import dotenv from "dotenv";

dotenv.config();

const defaultPort = 8000;

/**
 * Application configuration from environment.
 * Naming: camelCase for all keys (project convention).
 */
export function loadConfig() {
  const port = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);
  const nodeEnv = process.env.NODE_ENV ?? "development";

  return {
    nodeEnv: nodeEnv,
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
    isProduction: nodeEnv === "production",
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
}
