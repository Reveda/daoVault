import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";

// one shared counter per limiter in Redis when several API copies run; in memory otherwise
const sharedStore = (name: string) =>
  redis
    ? new RedisStore({ prefix: `rl:${name}:`, sendCommand: (...args: string[]) => redis!.sendCommand(args) })
    : undefined;

const createLimiter = (name: string, windowMs: number, limit: number, message: string, keyGenerator?: (req: Request) => string) =>
  rateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
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

/**
 * Sign-in per wallet (owner, 2026-10-13): the per-IP sign-in limit is high for shared mobile IPs,
 * so one wallet gets its own small budget. Requests without a wallet fall back to the IP.
 */
export const authWalletRateLimiter = createLimiter(
  "auth-wallet",
  env.AUTH_RATE_LIMIT_WINDOW_MS,
  env.AUTH_WALLET_RATE_LIMIT_MAX,
  "Too many sign-in attempts for this wallet. Please wait a few minutes.",
  (req) => {
    const wallet = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim().toLowerCase() : "";
    return /^0x[0-9a-f]{40}$/.test(wallet) ? `w:${wallet}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
);

export const financialRateLimiter = createLimiter(
  "financial",
  env.FINANCIAL_RATE_LIMIT_WINDOW_MS,
  env.FINANCIAL_RATE_LIMIT_MAX,
  "Too many financial requests. Please try again later.",
);
