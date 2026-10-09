import type { RequestHandler } from "express";
import { dashboardService } from "./dashboard.service.js";

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

export const getDashboard: RequestHandler = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard(String(req.params.walletAddress));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
