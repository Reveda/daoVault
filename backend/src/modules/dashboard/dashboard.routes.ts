import { Router } from "express";
import { getDashboard } from "./dashboard.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { z } from "zod";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/:walletAddress",
  validateRequest({ params: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  getDashboard,
);
