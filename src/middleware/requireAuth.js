import { asyncHandler } from "./asyncHandler.js";
import { verifyAccessToken, getAdminProfileFromTokenPayload } from "../services/adminAuthService.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Requires `Authorization: Bearer <jwt>`. Sets `req.adminUser` to the DB row.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new HttpError(401, "missing bearer token", { code: "unauthorized" });
  }
  const raw = header.slice("Bearer ".length).trim();
  if (!raw) {
    throw new HttpError(401, "empty bearer token", { code: "unauthorized" });
  }
  const payload = verifyAccessToken(raw);
  req.adminUser = await getAdminProfileFromTokenPayload(payload);
  next();
});
