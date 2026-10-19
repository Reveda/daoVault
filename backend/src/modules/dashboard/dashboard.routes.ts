import { Router } from "express";
import { collect, getDashboard, getLevelMembers, openBox } from "./dashboard.controller.js";
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

// a reward box (DV token pot or a rank box) was opened: remembered so it opens only once (owner 2026-10-19)
dashboardRouter.post(
  "/:walletAddress/boxes/opened",
  validateRequest({
    params: z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
    }),
    body: z.object({
      kind: z.enum(["dv", "rank"]),
      rank: z.number().int().min(1).max(11).optional(),
      /** DV the page revealed (a top-up made after the page loaded stays unopened) */
      allocated: z.number().int().min(0).max(1_000_000_000).optional(),
    }),
  }),
  requireSelfOrAdmin(),
  openBox,
);

// collect a rank reward or the fast-start bonus into the balance (owner 2026-10-19: claim to collect)
dashboardRouter.post(
  "/:walletAddress/rewards/collect",
  validateRequest({
    params: z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
    }),
    body: z.object({
      kind: z.enum(["rank", "bonus"]),
      rank: z.number().int().min(1).max(11).optional(),
    }),
  }),
  requireSelfOrAdmin(),
  collect,
);

dashboardRouter.get(
  "/:walletAddress",
  validateRequest({
    params: z.object({
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
    }),
  }),
  requireSelfOrAdmin(),
  getDashboard,
);
