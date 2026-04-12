import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listConcertsForAdmin,
  getConcertForAdmin,
  createConcertForAdmin,
  updateConcertForAdmin,
  listTicketsForConcertAdmin,
} from "../services/concertService.js";

/**
 * Concert CRUD (admin, JWT required).
 */
export function createAdminConcertRouter() {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const concerts = await listConcertsForAdmin(req.query ?? {});
      res.status(200).json({ ok: true, concerts });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const concert = await createConcertForAdmin(req.body ?? {});
      res.status(201).json({ ok: true, concert });
    })
  );

  router.get(
    "/:concertId/tickets",
    asyncHandler(async (req, res) => {
      const tickets = await listTicketsForConcertAdmin(req.params.concertId);
      res.status(200).json({ ok: true, tickets });
    })
  );

  router.get(
    "/:concertId",
    asyncHandler(async (req, res) => {
      const concert = await getConcertForAdmin(req.params.concertId);
      res.status(200).json({ ok: true, concert });
    })
  );

  router.patch(
    "/:concertId",
    asyncHandler(async (req, res) => {
      const concert = await updateConcertForAdmin(req.params.concertId, req.body ?? {});
      res.status(200).json({ ok: true, concert });
    })
  );

  return router;
}
