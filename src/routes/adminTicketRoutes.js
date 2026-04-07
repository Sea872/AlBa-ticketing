import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { resendTicketEmailByAdmin } from "../services/ticketResendService.js";

/**
 * Admin ticket actions (JWT required).
 */
export function createAdminTicketRouter() {
  const router = Router();

  router.use(requireAuth);

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

  return router;
}
