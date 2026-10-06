import { Router } from 'express';
import { z } from 'zod';
import { financialRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { verifyActivation } from './activation.controller.js';

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address');
const hash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash');

export const activationRouter = Router();
activationRouter.post('/verify', financialRateLimiter, validateRequest({ body: z.object({
  walletAddress: address,
  transactionHash: hash,
  sponsorAddress: address.default('0x0000000000000000000000000000000000000000'),
}) }), verifyActivation);
