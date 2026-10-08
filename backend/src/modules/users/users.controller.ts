import type { RequestHandler } from "express";
import { usersService } from "./users.service.js";

export const getUserProfile: RequestHandler = async (req, res, next) => {
  try {
    const data = await usersService.getPublicProfile(String(req.params.walletAddress));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const registerWallet: RequestHandler = async (req, res, next) => {
  try {
    const data = await usersService.register(String(req.body.walletAddress));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getSponsorByCode: RequestHandler = async (req, res, next) => {
  try {
    const data = await usersService.getSponsorByCode(String(req.params.code));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
