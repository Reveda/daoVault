import "dotenv/config";
import { PrismaClient, PackageStatus, EarningType } from "@prisma/client";
import { getAddress, keccak256, toUtf8Bytes } from "ethers";

const prisma = new PrismaClient();

const walletInput = process.env.SEED_WALLET_ADDRESS;
const wallet = walletInput ? getAddress(walletInput).toLowerCase() : null;

if (!wallet) {
  throw new Error("Set SEED_WALLET_ADDRESS to the wallet address connected in your local browser.");
}

const directs = Number(process.env.SEED_ACTIVE_DIRECTS ?? 12);
const earnedUsd = Number(process.env.SEED_EARNED_USD ?? 1450);

if (!Number.isInteger(directs) || directs < 0) {
  throw new Error("SEED_ACTIVE_DIRECTS must be a non-negative integer.");
}
if (!Number.isFinite(earnedUsd) || earnedUsd < 0) {
  throw new Error("SEED_EARNED_USD must be a non-negative number.");
}

const referralCode = `DV${wallet.slice(2, 8).toUpperCase()}`;
const activationTxHash = keccak256(toUtf8Bytes(`local-test-activation:${wallet}`));

try {
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { walletAddress: wallet },
      update: {
        activeDirectsCount: directs,
        currentRank: directs >= 12 ? 4 : directs >= 7 ? 3 : directs >= 3 ? 2 : 1,
      },
      create: {
        walletAddress: wallet,
        referralCode,
        activeDirectsCount: directs,
        currentRank: directs >= 12 ? 4 : directs >= 7 ? 3 : directs >= 3 ? 2 : 1,
      },
    });

    const existingPackage = await tx.package.findFirst({ where: { userId: user.id } });
    const pkg = existingPackage
      ? await tx.package.update({
        where: { id: existingPackage.id },
        data: { packageAmount: 300, totalEarned: earnedUsd, maxCapLimit: 3000, status: PackageStatus.ACTIVE, activationTxHash },
      })
      : await tx.package.create({
        data: { userId: user.id, packageAmount: 300, totalEarned: earnedUsd, maxCapLimit: 3000, status: PackageStatus.ACTIVE, activationTxHash },
      });

    await tx.earning.deleteMany({ where: { recipientId: user.id, sourceId: user.id, packageId: pkg.id } });
    if (earnedUsd > 0) {
      await tx.earning.create({
        data: {
          recipientId: user.id,
          sourceId: user.id,
          packageId: pkg.id,
          type: EarningType.LEVEL_COMMISSION,
          level: 1,
          percentage: 10,
          amountUsd: earnedUsd,
        },
      });
    }

    return user;
  });

  console.log(`Local test fixture ready for ${result.walletAddress}`);
  console.log(`Dashboard: http://localhost:3000/dashboard.html`);
  console.log("This fixture is for local development only; it is not a blockchain activation.");
} finally {
  await prisma.$disconnect();
}
