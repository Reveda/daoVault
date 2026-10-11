import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";

// one shared counter per limiter in Redis when several API copies run; in memory otherwise
const sharedStore = (name: string) =>
  redis
    ? new RedisStore({ prefix: `rl:${name}:`, sendCommand: (...args: string[]) => redis!.sendCommand(args) })
    : undefined;

const createLimiter = (name: string, windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS" || req.path.endsWith("/health"),
    message: { success: false, error: message },
    store: sharedStore(name),
    // Redis down: serve the request (Nginx still limits per IP) rather than fail the whole API
    passOnStoreError: Boolean(redis),
  });

export const apiRateLimiter = createLimiter(
  "api",
  env.API_RATE_LIMIT_WINDOW_MS,
  env.API_RATE_LIMIT_MAX,
  "Too many API requests. Please try again later.",
);

export const authRateLimiter = createLimiter(
  "auth",
  env.AUTH_RATE_LIMIT_WINDOW_MS,
  env.AUTH_RATE_LIMIT_MAX,
  "Too many authentication attempts. Please try again later.",
);

export const financialRateLimiter = createLimiter(
  "financial",
  env.FINANCIAL_RATE_LIMIT_WINDOW_MS,
  env.FINANCIAL_RATE_LIMIT_MAX,
  "Too many financial requests. Please try again later.",
);
