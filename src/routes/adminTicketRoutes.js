import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { resendTicketEmailByAdmin } from "../services/ticketResendService.js";
import {
  searchTicketsForAdmin,
  listEmailFailuresForAdmin,
  cancelTicketForAdmin,
} from "../services/adminTicketOpsService.js";

/**
 * Admin ticket actions (JWT required).
 */
export function createAdminTicketRouter() {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const tickets = await searchTicketsForAdmin({
        email: req.query?.email,
        shopifyOrderId: req.query?.shopifyOrderId,
        limit: req.query?.limit != null ? Number(req.query.limit) : undefined,
      });
      res.status(200).json({ ok: true, tickets });
    })
  );

  router.get(
    "/email-failures",
    asyncHandler(async (req, res) => {
      const tickets = await listEmailFailuresForAdmin(req.query?.limit);
      res.status(200).json({ ok: true, tickets });
    })
  );

  router.post(
    "/resend",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const result = await resendTicketEmailByAdmin({
        adminUserId: req.adminUser.id,
        shopifyOrderId: body.shopifyOrderId,
        ticketId: body.ticketId,
      });
      res.status(200).json({ ok: true, ...result });
    })
  );

  router.post(
    "/:ticketId/cancel",
    asyncHandler(async (req, res) => {
      const ticket = await cancelTicketForAdmin(req.params.ticketId);
      res.status(200).json({ ok: true, ticket });
    })
  );

  return router;
}
