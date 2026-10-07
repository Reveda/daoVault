import { prisma } from "../../config/prisma.js";

export const usersRepository = {
  findByWallet(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress } });
  },

  findPublicByWallet(walletAddress: string) {
    return prisma.user.findUnique({
      where: { walletAddress },
      select: {
        id: true,
        walletAddress: true,
        referralCode: true,
        activeDirectsCount: true,
        currentRank: true,
        createdAt: true,
      },
    });
  },

  /** Sponsor lookup for invite links: only activated members can sponsor. */
  findSponsorByCode(referralCode: string) {
    return prisma.user.findFirst({
      where: { referralCode, packages: { some: {} } },
      select: { walletAddress: true, referralCode: true },
    });
  },
};
