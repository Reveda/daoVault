import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const createLimiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS" || req.path.endsWith("/health"),
    message: { success: false, error: message },
  });

export const apiRateLimiter = createLimiter(
  env.API_RATE_LIMIT_WINDOW_MS,
  env.API_RATE_LIMIT_MAX,
  "Too many API requests. Please try again later.",
);

export const authRateLimiter = createLimiter(
  env.AUTH_RATE_LIMIT_WINDOW_MS,
  env.AUTH_RATE_LIMIT_MAX,
  "Too many authentication attempts. Please try again later.",
);

export const financialRateLimiter = createLimiter(
  env.FINANCIAL_RATE_LIMIT_WINDOW_MS,
  env.FINANCIAL_RATE_LIMIT_MAX,
  "Too many financial requests. Please try again later.",
);
