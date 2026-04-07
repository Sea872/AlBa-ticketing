import { Router } from "express";

/**
 * Liveness / readiness probe for Nginx, PM2, and monitoring.
 */
export function createHealthRouter() {
  const router = Router();

  router.get("/health", (req, res) => {
    res.status(200).json({
      ok: true,
      service: "concert-ticketing",
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  return router;
}
