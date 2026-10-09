import { prisma } from "../../config/prisma.js";

export const usersRepository = {
  findByWallet(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress } });
  },

  findWithPackageCount(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress }, include: { _count: { select: { packages: true } } } });
  },

  async codeExists(referralCode: string) {
    return (await prisma.user.count({ where: { referralCode } })) > 0;
  },

  setPendingSponsor(walletAddress: string, pendingSponsorCode: string) {
    return prisma.user.update({ where: { walletAddress }, data: { pendingSponsorCode } });
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
