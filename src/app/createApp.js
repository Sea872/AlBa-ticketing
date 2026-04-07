import express from "express";
import { createHealthRouter } from "../routes/healthRoutes.js";
import { registerErrorHandler } from "../middleware/errorHandler.js";

/**
 * Creates and configures the Express application (no listen).
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(express.json({ limit: "1mb" }));

  app.use(createHealthRouter());

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "not_found" });
  });

  registerErrorHandler(app);

  return app;
}
