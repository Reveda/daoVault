import { Router } from "express";
import { z } from "zod";
import { authRateLimiter } from "../../middlewares/rateLimiter.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { requireAuth } from "../../middlewares/auth.js";
import { authService } from "./auth.service.js";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address");

export const authRouter = Router();

// 1. get the message to sign
authRouter.post("/challenge", authRateLimiter, validateRequest({ body: z.object({ walletAddress: address }) }), async (req, res, next) => {
  try {
    res.json({ success: true, data: await authService.createChallenge(req.body.walletAddress) });
  } catch (error) { next(error); }
});

// 2. send the signature back, receive a session token
authRouter.post("/verify", authRateLimiter, validateRequest({
  body: z.object({ walletAddress: address, signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, "Invalid signature") }),
}), async (req, res, next) => {
  try {
    res.json({ success: true, data: await authService.verifySignature(req.body.walletAddress, req.body.signature) });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, data: { walletAddress: req.auth!.sub, role: req.auth!.role } });
});
