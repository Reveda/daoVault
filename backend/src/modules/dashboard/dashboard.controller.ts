import type { RequestHandler } from "express";
import { dashboardService } from "./dashboard.service.js";

export const getDashboard: RequestHandler = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard(String(req.params.walletAddress));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
