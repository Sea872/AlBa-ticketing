import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listConcertProductsForAdmin,
  addConcertProductForAdmin,
  removeConcertProductForAdmin,
} from "../services/concertProductService.js";

/**
 * Shopify product ↔ concert links (admin, JWT required).
 * Router uses mergeParams so :concertId comes from parent mount path.
 */
export function createAdminConcertProductRouter() {
  const router = Router({ mergeParams: true });

  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { concertId } = req.params;
      const links = await listConcertProductsForAdmin(concertId);
      res.status(200).json({ ok: true, links });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { concertId } = req.params;
      const link = await addConcertProductForAdmin(concertId, req.body ?? {});
      res.status(201).json({ ok: true, link });
    })
  );

  router.delete(
    "/:linkId",
    asyncHandler(async (req, res) => {
      const { concertId, linkId } = req.params;
      await removeConcertProductForAdmin(concertId, linkId);
      res.status(200).json({ ok: true, deleted: true });
    })
  );

  return router;
}
