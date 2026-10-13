import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { rootWallet } from "./config/root.js";
import { usersService } from "./modules/users/users.service.js";
import { alert } from "./config/alerts.js";
import { startPlanQueueTimer } from "./modules/activation/planQueue.js";
import { runWatch } from "./jobs/watch.js";

// a crash or a forgotten promise reaches the owner (then the process manager restarts the API)
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandled rejection:", reason);
  alert("critical", "api-unhandled", `API error not handled: ${String((reason as Error)?.message ?? reason).slice(0, 200)}`);
});
process.on("uncaughtException", (error) => {
  console.error("[api] uncaught exception:", error);
  alert("critical", "api-crash", `API crashed: ${error.message.slice(0, 200)}. It restarts by itself; check the logs.`);
  setTimeout(() => process.exit(1), 500).unref(); // let the log line flush
});

const server = app.listen(env.PORT, () => {
  console.log(`DAOvault API listening on http://localhost:${env.PORT}`);
  // which admin wallets this server sees (ADMIN_WALLETS): a quick check in the Render logs
  console.log(env.ADMIN_WALLETS.length
    ? `Admin wallets: ${env.ADMIN_WALLETS.map((w) => `${w.slice(0, 6)}...${w.slice(-4)}`).join(", ")}`
    : `Admin wallets: none (ADMIN_WALLETS ${process.env.ADMIN_WALLETS?.trim() ? "has no full 0x + 40-character address" : "is not set"} on this server)`);
  // the company root (treasury) is "activated from the backend": its record and permanent
  // referral code exist from the start, so members can join under it before anyone pays
  const root = rootWallet();
  if (root) {
    usersService.register(root).then(
      (r) => console.log(`Company root ${r.walletAddress} ready, invite code ${r.referralCode}`),
      (error) => console.error("Company root setup failed:", error),
    );
  } else {
    console.warn("COMPANY_WALLET_ADDRESS is not set: there is no company root, so no one can join under the company link.");
  }
  // plan queue: commissions / volume / ranks for recorded payments (one runner across all copies)
  startPlanQueueTimer();
  // no worker without Redis (Render): this API watches the system itself
  if (!env.REDIS_URL) {
    setInterval(() => void runWatch().catch((error) => console.error("[watch]", error)), 5 * 60_000).unref();
  }
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
