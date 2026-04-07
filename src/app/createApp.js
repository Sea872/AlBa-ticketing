import express from "express";
import { createHealthRouter } from "../routes/healthRoutes.js";
import { createAdminAuthRouter } from "../routes/adminAuthRoutes.js";
import { createAdminConcertProductRouter } from "../routes/adminConcertProductRoutes.js";
import { createAdminConcertRouter } from "../routes/adminConcertRoutes.js";
import { registerErrorHandler } from "../middleware/errorHandler.js";

/**
 * Creates and configures the Express application (no listen).
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(createHealthRouter());
  app.use("/api/admin", createAdminAuthRouter());
  // Register before generic /api/admin/concerts so "products" is not captured as :concertId
  app.use("/api/admin/concerts/:concertId/products", createAdminConcertProductRouter());
  app.use("/api/admin/concerts", createAdminConcertRouter());

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "not_found" });
  });

  registerErrorHandler(app);

  return app;
}
