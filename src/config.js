import dotenv from "dotenv";

dotenv.config();

const defaultPort = 8000;

/** Development-only secret; production must set JWT_SECRET. */
const devJwtSecret = "development-only-jwt-secret-min-32-chars!!";

/**
 * Application configuration from environment.
 * Naming: camelCase for all keys (project convention).
 */
export function loadConfig() {
  const port = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);
  const nodeEnv = process.env.NODE_ENV ?? "development";

  const jwtSecret =
    process.env.JWT_SECRET ?? (nodeEnv !== "production" ? devJwtSecret : null);
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

  const shopifyWebhookSecret =
    process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_API_SECRET ?? null;

  return {
    nodeEnv: nodeEnv,
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
    isProduction: nodeEnv === "production",
    databaseUrl: process.env.DATABASE_URL ?? null,
    jwtSecret,
    jwtExpiresIn,
    shopifyWebhookSecret,
  };
}
