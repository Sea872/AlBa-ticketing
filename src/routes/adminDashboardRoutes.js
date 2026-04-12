import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAdminDashboardSummary,
  getRecentProcessedOrders,
} from "../services/adminDashboardService.js";

/**
 * Admin dashboard metrics (JWT required).
 */
export function createAdminDashboardRouter() {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/summary",
    asyncHandler(async (_req, res) => {
      const summary = await getAdminDashboardSummary();
      res.status(200).json({ ok: true, ...summary });
    })
  );

  router.get(
    "/recent-orders",
    asyncHandler(async (req, res) => {
      const raw = req.query?.limit;
      const limit = raw != null && String(raw).trim() !== "" ? Number(raw) : 20;
      const orders = await getRecentProcessedOrders(Number.isFinite(limit) ? limit : 20);
      res.status(200).json({ ok: true, orders });
    })
  );

  return router;
}
