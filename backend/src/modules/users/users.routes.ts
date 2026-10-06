import { Router } from "express";
import { getUserProfile } from "./users.controller.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { z } from "zod";

export const usersRouter = Router();

usersRouter.get(
  "/:walletAddress",
  validateRequest({ params: z.object({ walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address") }) }),
  getUserProfile,
);
