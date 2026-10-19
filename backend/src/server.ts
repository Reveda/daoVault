import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { rootWallet } from "./config/root.js";
import { usersService } from "./modules/users/users.service.js";
import { alert } from "./config/alerts.js";
import { startPlanQueueTimer, stopPlanQueueTimer } from "./modules/activation/planQueue.js";
import { runWatch } from "./jobs/watch.js";
import { withdrawalsService } from "./modules/withdrawals/withdrawals.service.js";
import { redisReady } from "./config/redis.js";
import { captureConsole } from "./config/logger.js";
import { closeSocketServer, initSocketServer } from "./modules/notifications/socket.js";
import { cleanupNotifications, startNotificationPusher } from "./modules/notifications/notifications.service.js";

// every console line of the API becomes one JSON log line (config/logger.ts)
captureConsole();

// a crash or a forgotten promise reaches the owner (then the process manager restarts the API)
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandled rejection:", reason);
  alert(
    "critical",
    "api-unhandled",
    `API error not handled: ${String((reason as Error)?.message ?? reason).slice(0, 200)}`,
  );
});
process.on("uncaughtException", (error) => {
  console.error("[api] uncaught exception:", error);
  alert(
    "critical",
    "api-crash",
    `API crashed: ${error.message.slice(0, 200)}. It restarts by itself; check the logs.`,
  );
  setTimeout(() => process.exit(1), 500).unref(); // let the log line flush
});

// Avoid accepting the first auth request while the Docker Redis service is still becoming ready.
// A real outage must not prevent the API from starting; route-specific rate-limit policy handles it.
const redisStartupReady = await Promise.race([
  redisReady,
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000)),
]);
if (env.REDIS_URL && !redisStartupReady) {
  console.warn(
    "[redis] not ready after 5s; API started in degraded rate-limit mode and will keep retrying",
  );
}

const server = app.listen(env.PORT, () => {
  console.log(`DAOvault API listening on http://localhost:${env.PORT}`);
  // which admin wallets this server sees (ADMIN_WALLETS): a quick check in the Render logs
  console.log(
    env.ADMIN_WALLETS.length
      ? `Admin wallets: ${env.ADMIN_WALLETS.map((w) => `${w.slice(0, 6)}...${w.slice(-4)}`).join(", ")}`
      : `Admin wallets: none (ADMIN_WALLETS ${process.env.ADMIN_WALLETS?.trim() ? "has no full 0x + 40-character address" : "is not set"} on this server)`,
  );
  // the company root (treasury) is "activated from the backend": its record and permanent
  // referral code exist from the start, so members can join under it before anyone pays
  const root = rootWallet();
  const rootReady = root
    ? usersService.register(root).then(
        (r) => console.log(`Company root ${r.walletAddress} ready, invite code ${r.referralCode}`),
        (error) => console.error("Company root setup failed:", error),
      )
    : Promise.resolve(
        console.warn(
          "COMPANY_WALLET_ADDRESS is not set: there is no company root, so no one can join under the company link.",
        ),
      );
  // paid members without a placement spot (from before binary placement, 2026-10-17, or without any
  // sponsor) take one, under the company root when they have no sponsor; after the root exists
  void rootReady
    .then(() => usersService.placeUnplacedPaid())
    .then(
      (codes) => {
        if (codes.length)
          console.log(`Placed on the Left (sponsor or company root): ${codes.join(", ")}`);
      },
      (error) => console.error("Placing unplaced paid members failed:", error),
    );
  // plan queue: commissions / volume / ranks for recorded payments (one runner across all copies)
  startPlanQueueTimer();
  // live notifications (owner 2026-10-19): new rows go out over socket.io every 2 seconds
  startNotificationPusher();
  // no worker without Redis (Render): this API watches the system itself
  if (!env.REDIS_URL) {
    setInterval(
      () => void runWatch().catch((error) => console.error("[watch]", error)),
      5 * 60_000,
    ).unref();
    // the worker's daily clean-up of old notifications (read after 30 days, any after 90)
    setInterval(
      () => void cleanupNotifications().catch((error) => console.error("[notify cleanup]", error)),
      24 * 3_600_000,
    ).unref();
    // the worker's voucher-settle job: claimed vouchers become paid, expired ones free the balance
    setInterval(
      () =>
        void withdrawalsService
          .reconcileAllOpen()
          .catch((error) => console.error("[settle]", error)),
      60_000,
    ).unref();
  }
});
// live notifications over socket.io on the same port, at ${API_PREFIX}/socket.io (owner 2026-10-19)
initSocketServer(server);


const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down...`);
  stopPlanQueueTimer();
  void closeSocketServer().catch(() => undefined);
  const force = setTimeout(() => {
    console.error(
      "[api] graceful shutdown timed out; exiting so the orchestrator can replace this replica",
    );
    process.exit(1);
  }, 15_000);
  force.unref();
  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(force);
    process.exit(0);
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
