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
  authService.verifyToken(token).then(
    (claims) => { req.auth = claims; next(); },
    () => { res.status(401).json({ success: false, error: "Session expired. Sign in again." }); },
  );
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

/**
 * A member's own data only: signed in as the wallet in the URL (or in the body for POSTs),
 * or as an admin. Anyone else gets 403, so knowing an address is not enough to read it.
 */
export const requireSelfOrAdmin = (source: "params" | "body" = "params"): RequestHandler => (req, res, next) => {
  requireAuth(req, res, () => {
    const wallet = String((source === "params" ? req.params : req.body)?.walletAddress ?? "").toLowerCase();
    const self = req.auth?.sub === wallet;
    const admin = req.auth?.role === "admin" && isAdminWallet(req.auth.sub);
    if (!self && !admin) {
      res.status(403).json({ success: false, error: "You can only open your own vault." });
      return;
    }
    next();
  });
};
