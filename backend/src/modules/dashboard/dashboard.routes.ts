import { Router } from "express";
import { getDashboard, getLevelMembers } from "./dashboard.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { requireSelfOrAdmin } from "../../middlewares/auth.js";
import { z } from "zod";

// a member's own data only (wallet-signature sign-in): knowing an address is not enough
export const dashboardRouter = Router();

// who joined at one level of the downline (dashboard level modal)
dashboardRouter.get(
  "/:walletAddress/levels/:level",
  validateRequest({
    params: z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
      level: z.coerce.number().int().min(1).max(20),
    }),
    query: z.object({ page: z.coerce.number().int().min(1).max(10_000).optional() }),
  }),
  requireSelfOrAdmin(),
  getLevelMembers,
);

dashboardRouter.get(
  "/:walletAddress",
  validateRequest({ params: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  requireSelfOrAdmin(),
  getDashboard,
);
