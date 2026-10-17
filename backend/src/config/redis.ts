import { createClient } from "redis";
import { env } from "./env.js";

/**
 * Redis, only when REDIS_URL is set (production runs several API copies behind Nginx and they
 * must share the rate-limit counters). Without it (`npm run dev`, Render) the limits stay in memory.
 * The server waits briefly during startup so the normal Docker readiness race does not affect the
 * first request. A real outage does not block startup forever; the rate limiters use their
 * route-specific fail-open/fail-closed policy while the client reconnects in the background.
 */
export const redis = env.REDIS_URL
  ? createClient({
      url: env.REDIS_URL,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) => Math.min(5_000, 250 * 2 ** Math.min(retries, 5)),
      },
    })
  : null;

if (redis) {
  redis.on("error", (error: Error) => console.error("[redis]", error.message));
  redis.on("ready", () => console.log("Redis connected: rate limits are shared by every API copy"));
}

// The API waits briefly before accepting traffic so the normal Docker startup race does not make
// the first auth request hit an offline rate-limit store. If Redis is genuinely unavailable, the
// promise resolves false and the existing route-specific fail-open/fail-closed policy remains in
// charge; the client keeps reconnecting in the background.
export const redisReady: Promise<boolean> = redis
  ? redis.connect()
    .then(() => true)
    .catch((error: Error) => {
      console.error("[redis] first connection failed, retrying in the background:", error.message);
      return false;
    })
  : Promise.resolve(true);
