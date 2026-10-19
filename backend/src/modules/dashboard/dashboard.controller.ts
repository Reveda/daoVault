import type { RequestHandler } from "express";
import { collectReward, dashboardService, markBoxOpened } from "./dashboard.service.js";

export const getLevelMembers: RequestHandler = async (req, res, next) => {
  try {
    const data = await dashboardService.getLevelMembers(
      String(req.params.walletAddress),
      Number(req.params.level),
      Number(req.query.page ?? 1),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** the member's own reward box was opened (only the member: an admin cannot open boxes for them) */
export const openBox: RequestHandler = async (req, res, next) => {
  try {
    const wallet = String(req.params.walletAddress).toLowerCase();
    if ((req as { auth?: { sub?: string } }).auth?.sub !== wallet) {
      res.status(403).json({ success: false, error: "You can only open your own boxes." });
      return;
    }
    const data = await markBoxOpened(wallet, req.body.kind, req.body.rank, req.body.allocated);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/** the member collects a reward from its box (only the member themself) */
export const collect: RequestHandler = async (req, res, next) => {
  try {
    const wallet = String(req.params.walletAddress).toLowerCase();
    if ((req as { auth?: { sub?: string } }).auth?.sub !== wallet) {
      res.status(403).json({ success: false, error: "You can only collect your own rewards." });
      return;
    }
    res.json({ success: true, data: await collectReward(wallet, req.body.kind, req.body.rank) });
  } catch (error) {
    next(error);
  }
};

export const getDashboard: RequestHandler = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard(String(req.params.walletAddress));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
