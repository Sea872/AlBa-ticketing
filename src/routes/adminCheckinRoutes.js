import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { scanTicketAtGate } from "../services/checkInService.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Staff check-in: validate QR payload at a concert gate (JWT required).
 */
export function createAdminCheckinRouter() {
  const router = Router();

  router.use(requireAuth);

  router.post(
    "/scan",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const concertId = body.concertId;
      if (concertId === undefined || concertId === null || String(concertId).trim() === "") {
        throw new HttpError(400, "concertId is required", {
          expose: true,
          code: "validation_error",
        });
      }
      const out = await scanTicketAtGate({
        gateConcertId: concertId,
        body,
        staffUserId: req.adminUser.id,
      });
      res.status(200).json({ ok: true, ...out });
    })
  );

  return router;
}
