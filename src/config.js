import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const defaultPort = 8000;
const defaultTicketStorageDir = "storage/tickets";

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

  const shopifyClientId = process.env.SHOPIFY_CLIENT_ID ?? null;
  const shopifyClientSecret = process.env.SHOPIFY_CLIENT_SECRET ?? null;
  const shopifyShopDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? null;

  const shopifyWebhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET ?? null;

  const ticketStorageDir = path.resolve(
    process.cwd(),
    process.env.TICKET_STORAGE_DIR ?? defaultTicketStorageDir
  );

  const resendApiKey = process.env.RESEND_API_KEY ?? null;
  const resendFromEmail =
    process.env.RESEND_FROM ?? "Alba GB <onboarding@resend.dev>";

  return {
    nodeEnv: nodeEnv,
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
    isProduction: nodeEnv === "production",
    databaseUrl: process.env.DATABASE_URL ?? null,
    jwtSecret,
    jwtExpiresIn,
    shopifyWebhookSecret,
    shopifyClientId,
    shopifyClientSecret,
    shopifyShopDomain,
    ticketStorageDir,
    resendApiKey,
    resendFromEmail,
  };
}
