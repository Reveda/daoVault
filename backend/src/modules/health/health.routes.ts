import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { redis } from "../../config/redis.js";

export const healthRouter = Router();

/**
 * Healthy = the database answers AND has the newest schema (review, 2026-10-14): a live API on an
 * old schema would fail every payment. to_regclass only looks the table names up (no data read),
 * so this stays cheap for Docker / Render / uptime checks. Add the newest migration's table here
 * when a migration creates one. Startup already refuses to run after a failed migration
 * (scripts/start.mjs); this also catches a database swapped or changed under a running API.
 */
const NEWEST_TABLES = ["plan_events", "chain_cursors", "power_businesses", "notifications"] as const;

async function readiness(
  _req: Parameters<Parameters<typeof healthRouter.get>[1]>[0],
  res: Parameters<Parameters<typeof healthRouter.get>[1]>[1],
) {
  let database: "up" | "down" = "up";
  let schema: "ok" | "outdated" | "unknown" = "unknown";
  const redisStatus: "up" | "down" | "disabled" = !redis
    ? "disabled"
    : redis.isReady
      ? "up"
      : "down";
  try {
    const [row] = await prisma.$queryRaw<Array<{ missing: number }>>`
      SELECT COUNT(*) FILTER (WHERE to_regclass('public.' || t) IS NULL)::int AS missing
        FROM unnest(${NEWEST_TABLES as unknown as string[]}::text[]) AS t`;
    schema = row && row.missing === 0 ? "ok" : "outdated";
  } catch {
    database = "down";
  }

  const healthy = database === "up" && schema === "ok" && redisStatus !== "down";
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    service: "daovault-backend",
    database,
    schema,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
}

// Liveness never touches dependencies: a process that is alive can be restarted gracefully.
healthRouter.get("/live", (_req, res) =>
  res
    .status(200)
    .json({ success: true, service: "daovault-backend", timestamp: new Date().toISOString() }),
);
// Readiness is dependency-aware and is used by Docker/load balancers before sending traffic.
healthRouter.get("/ready", readiness);
// Backwards-compatible endpoint used by Render/UptimeRobot.
healthRouter.get("/", readiness);
