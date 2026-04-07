import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { loadConfig } from "../config.js";
import { findAdminByEmail, findAdminById } from "../db/repositories/adminUsersRepository.js";
import { HttpError } from "../utils/httpError.js";

export async function loginWithEmailPassword(email, password) {
  if (!email || !password) {
    throw new HttpError(400, "email and password are required", {
      expose: true,
      code: "validation_error",
    });
  }

  const admin = await findAdminByEmail(email);
  if (!admin) {
    throw new HttpError(401, "invalid credentials", { code: "invalid_credentials" });
  }

  const match = await bcrypt.compare(password, admin.password_hash);
  if (!match) {
    throw new HttpError(401, "invalid credentials", { code: "invalid_credentials" });
  }

  const { jwtSecret, jwtExpiresIn } = loadConfig();
  if (!jwtSecret) {
    throw new HttpError(500, "JWT not configured", { code: "server_misconfigured" });
  }

  const token = jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

  return {
    token,
    expiresIn: jwtExpiresIn,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
  };
}

export function verifyAccessToken(token) {
  const { jwtSecret } = loadConfig();
  if (!jwtSecret) {
    throw new HttpError(500, "JWT not configured", { code: "server_misconfigured" });
  }
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, "invalid or expired token", { code: "token_invalid" });
  }
}

export async function getAdminProfileFromTokenPayload(payload) {
  const id = payload.sub;
  if (!id) {
    throw new HttpError(401, "invalid token subject", { code: "token_invalid" });
  }
  const admin = await findAdminById(id);
  if (!admin) {
    throw new HttpError(401, "admin not found", { code: "token_invalid" });
  }
  return admin;
}
