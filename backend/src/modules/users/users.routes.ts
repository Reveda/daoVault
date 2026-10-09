import { Router } from "express";
import { getSponsorByCode, getUserProfile, registerWallet } from "./users.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { requireSelfOrAdmin } from "../../middlewares/auth.js";
import { z } from "zod";

export const usersRouter = Router();

// referral code -> sponsor wallet (registered before /:walletAddress)
usersRouter.get(
  "/referral/:code",
  validateRequest({ params: z.object({ code: z.string().regex(/^DV[A-Fa-f0-9]{6,14}$/, "Invalid referral code") }) }),
  getSponsorByCode,
);

// first dashboard visit: reserve the wallet's permanent referral code (no payment needed)
usersRouter.post(
  "/register",
  validateRequest({ body: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  requireSelfOrAdmin("body"),
  registerWallet,
);

usersRouter.get(
  "/:walletAddress",
  validateRequest({ params: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  requireSelfOrAdmin(),
  getUserProfile,
);
