import { createClient } from "redis";
import { env } from "./env.js";

/**
 * Redis, only when REDIS_URL is set (production runs several API copies behind Nginx and they
 * must share the rate-limit counters). Without it (`npm run dev`, Render) the limits stay in memory.
 * The server does NOT wait for Redis: a lost (or not yet made) connection fails fast instead of
 * queueing, and the rate limiters let requests through until Redis is back (passOnStoreError).
 */
export const redis = env.REDIS_URL
  ? createClient({ url: env.REDIS_URL, disableOfflineQueue: true })
  : null;

if (redis) {
  redis.on("error", (error: Error) => console.error("[redis]", error.message));
  redis.on("ready", () => console.log("Redis connected: rate limits are shared by every API copy"));
  // never awaited (review, 2026-10-14): with Redis down at start the API still starts in degraded
  // mode (rate limits pass through, cache skipped) and the client keeps reconnecting by itself
  redis.connect().catch((error: Error) => console.error("[redis] first connection failed, retrying in the background:", error.message));
}
