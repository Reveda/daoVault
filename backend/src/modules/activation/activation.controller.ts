import type { RequestHandler } from 'express';
import { activationService } from './activation.service.js';

export const verifyActivation: RequestHandler = async (req, res, next) => {
  try {
    const data = await activationService.verify(req.body);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const verifyTopUp: RequestHandler = async (req, res, next) => {
  try {
    const data = await activationService.verifyTopUp(req.body);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};
