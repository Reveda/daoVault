import { prisma } from "../../config/prisma.js";

export const dashboardRepository = {
  findUserDashboard(walletAddress: string) {
    return prisma.user.findUnique({
      where: { walletAddress },
      include: { packages: true },
    });
  },

  sumEarnings(recipientId: string) {
    return prisma.earning.aggregate({
      where: { recipientId },
      _sum: { amountUsd: true },
    });
  },
};
