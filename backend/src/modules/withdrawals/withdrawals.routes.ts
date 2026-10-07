import { Router } from "express";
import { WithdrawalStatus } from "@prisma/client";
import { z } from "zod";
import { financialRateLimiter } from "../../middlewares/rateLimiter.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { requireAdmin, requireAuth } from "../../middlewares/auth.js";
import { withdrawalsService } from "./withdrawals.service.js";

/** Member side: /withdrawals (signed-in wallet only) */
export const withdrawalsRouter = Router();

withdrawalsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.summary(req.auth!.sub) });
  } catch (error) { next(error); }
});

withdrawalsRouter.post("/", requireAuth, financialRateLimiter, validateRequest({
  body: z.object({ amountUsd: z.number().positive().max(10_000_000).multipleOf(0.01, "Use at most 2 decimals") }),
}), async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await withdrawalsService.request(req.auth!.sub, req.body.amountUsd) });
  } catch (error) { next(error); }
});

// after the member's wallet claimed an instant voucher: verified on-chain, then marked paid
withdrawalsRouter.post("/:id/confirm", requireAuth, financialRateLimiter, validateRequest({
  params: z.object({ id: z.string().uuid("Invalid id") }),
  body: z.object({ txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash") }),
}), async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.confirm(req.auth!.sub, String(req.params.id), req.body.txHash) });
  } catch (error) { next(error); }
});

/** Admin side: /admin/... (wallet in ADMIN_WALLETS, signed in) */
export const adminRouter = Router();
adminRouter.use(requireAdmin);

const idParam = validateRequest({ params: z.object({ id: z.string().uuid("Invalid id") }) });

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.stats() });
  } catch (error) { next(error); }
});

adminRouter.get("/withdrawals", validateRequest({
  query: z.object({ status: z.enum(WithdrawalStatus).optional() }),
}), async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.list(req.query.status as WithdrawalStatus | undefined) });
  } catch (error) { next(error); }
});

adminRouter.post("/withdrawals/:id/approve", financialRateLimiter, idParam, async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.approve(String(req.params.id), req.auth!.sub) });
  } catch (error) { next(error); }
});

adminRouter.post("/withdrawals/:id/reject", financialRateLimiter, idParam, validateRequest({
  body: z.object({ reason: z.string().trim().min(3).max(280) }),
}), async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.reject(String(req.params.id), req.auth!.sub, req.body.reason) });
  } catch (error) { next(error); }
});

adminRouter.post("/withdrawals/:id/complete", financialRateLimiter, idParam, validateRequest({
  body: z.object({ payoutTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash") }),
}), async (req, res, next) => {
  try {
    res.json({ success: true, data: await withdrawalsService.complete(String(req.params.id), req.auth!.sub, req.body.payoutTxHash) });
  } catch (error) { next(error); }
});
