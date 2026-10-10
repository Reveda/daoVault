import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { rootWallet } from "./config/root.js";
import { usersService } from "./modules/users/users.service.js";

const server = app.listen(env.PORT, () => {
  console.log(`DAOvault API listening on http://localhost:${env.PORT}`);
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
