import dotenv from "dotenv";

dotenv.config();

/**
 * Application configuration from environment.
 * Naming: camelCase for all keys (project convention).
 */
export function loadConfig() {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const nodeEnv = process.env.NODE_ENV ?? "development";

  return {
    nodeEnv: nodeEnv,
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    isProduction: nodeEnv === "production",
  };
}
