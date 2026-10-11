import { createClient } from "redis";
import { env } from "./env.js";

/**
 * Redis, only when REDIS_URL is set (production runs several API copies behind Nginx and they
 * must share the rate-limit counters). Without it (`npm run dev`, Render) the limits stay in memory.
 * The server waits for the first connection; after that a lost connection fails fast instead of
 * queueing, and the rate limiters let requests through until Redis is back (passOnStoreError).
 */
export const redis = env.REDIS_URL
  ? createClient({ url: env.REDIS_URL, disableOfflineQueue: true })
  : null;

if (redis) {
  redis.on("error", (error: Error) => console.error("[redis]", error.message));
  await redis.connect();
  console.log("Redis connected: rate limits are shared by every API copy");
}
