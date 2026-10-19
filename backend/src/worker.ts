/**
 * Background worker (owner, 2026-10-11): BullMQ jobs on Redis, ONE copy (docker-compose
 * `worker`), separate from the API copies so every job runs exactly once.
 *   chain-indexer   every INDEXER_INTERVAL_SECONDS  payment contract events -> activations / top-ups
 *   voucher-settle  every minute                    instant-withdrawal vouchers claimed / expired
 *   auth-cleanup    daily 03:00 UTC                 expired sign-in nonces and refresh tokens
 *   watch           every 2 minutes                 database, plan queue, payout float / pause / signer,
 *                                                   indexer lag -> [alert] log lines (jobs/watch.ts)
 * Also sweeps the plan queue every few seconds (planQueue.ts; the API copies do too, one runs).
 * Run: `npm run worker` (production build) or `npm run worker:dev`. Needs REDIS_URL.
 * The API does not need the worker; without it everything works as before (the website reports
 * payments, vouchers settle when the member opens the dashboard).
 */
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { unlinkSync, writeFileSync } from "node:fs";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { indexPaymentEvents } from "./jobs/chainIndexer.js";
import { cleanupAuthTables } from "./jobs/maintenance.js";
import { runWatch } from "./jobs/watch.js";
import { alert } from "./config/alerts.js";
import { startPlanQueueTimer, stopPlanQueueTimer } from "./modules/activation/planQueue.js";
import { withdrawalsService } from "./modules/withdrawals/withdrawals.service.js";
import { captureConsole } from "./config/logger.js";
import { initSocketEmitter } from "./modules/notifications/socket.js";
import { startNotificationPusher } from "./modules/notifications/notifications.service.js";

// every console line of the worker becomes one JSON log line (config/logger.ts)
captureConsole();

if (!env.REDIS_URL) {
  console.error("[worker] REDIS_URL is not set: the background worker needs Redis.");
  process.exit(1);
}

const QUEUE = "daovault-jobs";
const HEARTBEAT_FILE = "/tmp/daovault-worker-heartbeat";

function writeHeartbeat(): void {
  try {
    writeFileSync(HEARTBEAT_FILE, `${Date.now()}\n`);
  } catch (error) {
    console.error("[worker] heartbeat write failed:", (error as Error).message);
  }
}

writeHeartbeat();
const heartbeatTimer = setInterval(writeHeartbeat, 10_000);
heartbeatTimer.unref();

// BullMQ needs maxRetriesPerRequest: null (its blocking commands wait as long as they need)
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

// repeating schedules: upsert = safe to run on every start (no duplicates)
await queue.upsertJobScheduler(
  "chain-indexer",
  { every: env.INDEXER_INTERVAL_SECONDS * 1000 },
  { name: "chain-indexer" },
);
await queue.upsertJobScheduler("voucher-settle", { every: 60_000 }, { name: "voucher-settle" });
await queue.upsertJobScheduler(
  "auth-cleanup",
  { pattern: "0 3 * * *", tz: "UTC" },
  { name: "auth-cleanup" },
);
await queue.upsertJobScheduler("watch", { every: 120_000 }, { name: "watch" });

const handlers: Record<string, () => Promise<unknown>> = {
  "chain-indexer": indexPaymentEvents,
  "voucher-settle": () => withdrawalsService.reconcileAllOpen(),
  "auth-cleanup": cleanupAuthTables,
  watch: () => runWatch({ indexer: true }),
};

// concurrency 1: jobs never overlap (the indexer must finish one block range before the next)
const worker = new Worker(
  QUEUE,
  async (job: Job) => {
    const run = handlers[job.name];
    if (!run) throw new Error(`Unknown job ${job.name}`);
    return run();
  },
  { connection, concurrency: 1 },
);

worker.on("completed", (job, result) => {
  if (job.name === "chain-indexer") {
    const r = result as Awaited<ReturnType<typeof indexPaymentEvents>>;
    if (r.events)
      console.log(
        `[worker] chain-indexer blocks ${r.from}-${r.to}: ${r.events} events, ${r.skipped} skipped`,
      );
  } else if (job.name === "auth-cleanup") {
    console.log("[worker] auth-cleanup", result);
  }
});
worker.on("failed", (job, error) => {
  console.error(
    `[worker] ${job?.name ?? "job"} failed (BullMQ retry/backoff applies):`,
    error.message,
  );
  alert(
    "warning",
    `job-${job?.name ?? "job"}`,
    `Background job ${job?.name ?? "job"} failed: ${error.message.slice(0, 200)} (BullMQ retry/backoff applies).`,
  );
});
worker.on("error", (error) => {
  console.error("[worker]", error.message);
  alert(
    "critical",
    "worker-redis",
    `Worker lost Redis: ${error.message.slice(0, 160)}. Indexer and settlements pause until it is back.`,
  );
});
startPlanQueueTimer();
// live notifications: the worker emits through Redis to the API copy holding the member's socket
void initSocketEmitter()
  .then(() => startNotificationPusher())
  .catch((error) => console.error("[worker] notifications:", error));

console.log(
  `[worker] running: chain-indexer every ${env.INDEXER_INTERVAL_SECONDS}s, voucher-settle every 60s, watch every 2 min, auth-cleanup daily, plan queue sweep`,
);

let shuttingDown = false;
const shutdown = async (signal: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, finishing the current job...`);
  clearInterval(heartbeatTimer);
  stopPlanQueueTimer();
  try {
    await worker.close();
    await queue.close();
    await connection.quit();
    await prisma.$disconnect();
  } catch (error) {
    console.error("[worker] shutdown cleanup failed:", error);
    exitCode = 1;
  }
  try {
    unlinkSync(HEARTBEAT_FILE);
  } catch {
    /* container is exiting or file is already gone */
  }
  process.exit(exitCode);
};

// BullMQ job failures are handled above. These handlers cover process-level failures outside
// BullMQ: log and alert, close cleanly, then exit non-zero so Docker restarts the worker. Database
// transactions, idempotency checks, retry/backoff, and the next scheduler run keep work recoverable.
process.on("unhandledRejection", (reason) => {
  const message = String((reason as Error)?.message ?? reason).slice(0, 300);
  console.error("[worker] unhandled rejection:", reason);
  alert(
    "critical",
    "worker-unhandled-rejection",
    `Worker unhandled rejection: ${message}. Restarting the worker.`,
  );
  void shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  const message = error.message.slice(0, 300);
  console.error("[worker] uncaught exception:", error);
  alert(
    "critical",
    "worker-uncaught-exception",
    `Worker uncaught exception: ${message}. Restarting the worker.`,
  );
  void shutdown("uncaughtException", 1);
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
