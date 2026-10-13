import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { authRateLimiter, authWalletRateLimiter } from "../../middlewares/rateLimiter.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { requireAuth } from "../../middlewares/auth.js";
import { authService, type AccessSession, type RefreshCookie } from "./auth.service.js";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");

/**
 * Refresh token cookie: httpOnly (page scripts cannot read it), SameSite=Strict (never sent
 * from another site, so no CSRF), only on the auth routes. The site and its API share one
 * origin (Render rewrite /api/* on the frontend, Vite proxy locally), so it is first-party.
 */
const REFRESH_COOKIE = "dv_rt";
const COOKIE_PATH = `${env.API_PREFIX}/auth`;
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: COOKIE_PATH };

/**
 * Admin page gate cookie (authService.issueAdminGate): whole site path, because the browser must
 * send it when it loads /admin.html. Lax, so an admin opening a saved link from another app still
 * gets the page (it opens no data by itself).
 */
const ADMIN_GATE_COOKIE = "dv_ag";
const gateOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

function readCookie(req: Request, name: string): string | undefined {
  const part = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}
const readRefreshCookie = (req: Request) => readCookie(req, REFRESH_COOKIE);

async function sendSession(res: Response, access: AccessSession, refresh: RefreshCookie | null) {
  if (refresh) res.cookie(REFRESH_COOKIE, refresh.value, { ...cookieOptions, expires: refresh.expiresAt });
  const gate = await authService.issueAdminGate(access.walletAddress);
  if (gate) res.cookie(ADMIN_GATE_COOKIE, gate.value, { ...gateOptions, expires: gate.expiresAt });
  else res.clearCookie(ADMIN_GATE_COOKIE, gateOptions);
  res.json({ success: true, data: access });
}

export const authRouter = Router();

// 1. get the message to sign
authRouter.post("/challenge", authRateLimiter, authWalletRateLimiter, validateRequest({ body: z.object({ walletAddress: address }) }), async (req, res, next) => {
  try {
    res.json({ success: true, data: await authService.createChallenge(req.body.walletAddress, req.get("origin")) });
  } catch (error) { next(error); }
});

// 2. send the signature back: access token in the body, refresh token as an httpOnly cookie
authRouter.post("/verify", authRateLimiter, authWalletRateLimiter, validateRequest({
  body: z.object({ walletAddress: address, signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, "Invalid signature") }),
}), async (req, res, next) => {
  try {
    const { access, refresh } = await authService.verifySignature(req.body.walletAddress, req.body.signature);
    await sendSession(res, access, refresh);
  } catch (error) { next(error); }
});

// 3. new access token from the refresh cookie (rotated on every use)
authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { access, refresh } = await authService.refresh(readRefreshCookie(req));
    await sendSession(res, access, refresh);
  } catch (error) {
    // only a dead session clears the cookie; a passing server/database error must not log out
    if ((error as { statusCode?: number }).statusCode === 401) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      res.clearCookie(ADMIN_GATE_COOKIE, gateOptions);
    }
    next(error);
  }
});

// log out this device: its refresh tokens are deleted and the cookie cleared
authRouter.post("/logout", async (req, res, next) => {
  try {
    await authService.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.clearCookie(ADMIN_GATE_COOKIE, gateOptions);
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, data: { walletAddress: req.auth!.sub, role: req.auth!.role } });
});

// Nginx (auth_request) asks this before serving admin.html / the admin script: 204 = admin, 401 = 404 page
authRouter.get("/admin-gate", async (req, res) => {
  res.status((await authService.checkAdminGate(readCookie(req, ADMIN_GATE_COOKIE))) ? 204 : 401).end();
});
