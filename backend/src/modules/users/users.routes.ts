import { Router } from "express";
import { getSponsorByCode, getUserProfile } from "./users.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { z } from "zod";

export const usersRouter = Router();

// referral code -> sponsor wallet (registered before /:walletAddress)
usersRouter.get(
  "/referral/:code",
  validateRequest({ params: z.object({ code: z.string().regex(/^DV[A-Fa-f0-9]{6,14}$/, "Invalid referral code") }) }),
  getSponsorByCode,
);

usersRouter.get(
  "/:walletAddress",
  validateRequest({ params: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  getUserProfile,
);
