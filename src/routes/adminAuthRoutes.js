import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginWithEmailPassword } from "../services/adminAuthService.js";

/**
 * Admin auth: login, logout (client clears token), current user.
 */
export function createAdminAuthRouter() {
  const router = Router();

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body ?? {};
      const result = await loginWithEmailPassword(email, password);
      res.status(200).json({
        ok: true,
        token: result.token,
        expiresIn: result.expiresIn,
        admin: result.admin,
      });
    })
  );

  router.post("/logout", (req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const u = req.adminUser;
      res.status(200).json({
        ok: true,
        admin: {
          id: u.id,
          email: u.email,
          role: u.role,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        },
      });
    })
  );

  return router;
}
