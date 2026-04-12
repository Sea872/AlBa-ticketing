import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import morgan from "morgan";
import { createHealthRouter } from "../routes/healthRoutes.js";
import { createShopifyWebhookRouter } from "../routes/shopifyWebhookRoutes.js";
import { createAdminAuthRouter } from "../routes/adminAuthRoutes.js";
import { createAdminConcertProductRouter } from "../routes/adminConcertProductRoutes.js";
import { createAdminConcertRouter } from "../routes/adminConcertRoutes.js";
import { createAdminTicketRouter } from "../routes/adminTicketRoutes.js";
import { createAdminDashboardRouter } from "../routes/adminDashboardRoutes.js";
import { createAdminCheckinRouter } from "../routes/adminCheckinRoutes.js";
import { registerErrorHandler } from "../middleware/errorHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectPublic = path.join(__dirname, "..", "..", "public");
const staffCheckinHtmlPath = path.join(projectPublic, "staff-checkin.html");
const adminStaticDir = path.join(projectPublic, "admin");

/**
 * Creates and configures the Express application (no listen).
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(morgan("dev"));

  // Shopify webhooks need the raw body for HMAC — must be registered before express.json()
  app.use("/webhooks", createShopifyWebhookRouter());

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(createHealthRouter());
  app.use("/api/admin", createAdminAuthRouter());

  app.use("/api/admin/concerts/:concertId/products", createAdminConcertProductRouter());
  app.use("/api/admin/concerts", createAdminConcertRouter());
  app.use("/api/admin/dashboard", createAdminDashboardRouter());
  app.use("/api/admin/tickets", createAdminTicketRouter());
  app.use("/api/admin/check-in", createAdminCheckinRouter());

  app.get("/staff/check-in", (req, res, next) => {
    res.sendFile(staffCheckinHtmlPath, (err) => {
      if (err) {
        next(err);
      }
    });
  });

  app.get("/admin", (_req, res) => {
    res.redirect(302, "/admin/login.html");
  });
  // app.get("/admin/", (_req, res) => {
  //   res.redirect(302, "/admin/login.html");
  // });
  app.use("/admin", express.static(adminStaticDir, { index: false }));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "not_found" });
  });

  registerErrorHandler(app);

  return app;
}
