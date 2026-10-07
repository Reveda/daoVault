import type { RequestHandler } from "express";
import { authService, isAdminWallet, type AuthClaims } from "../modules/auth/auth.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

/** Requires `Authorization: Bearer <jwt>` from wallet-signature sign-in. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ success: false, error: "Sign in with your wallet first." });
    return;
  }
  try {
    req.auth = authService.verifyToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, error: "Session expired. Sign in again." });
  }
};

/** Admin = signed in AND still listed in ADMIN_WALLETS (removing a wallet revokes access at once). */
export const requireAdmin: RequestHandler = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.auth?.role !== "admin" || !isAdminWallet(req.auth.sub)) {
      res.status(403).json({ success: false, error: "Admin access required." });
      return;
    }
    next();
  });
};
