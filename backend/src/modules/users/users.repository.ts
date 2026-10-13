import { prisma } from "../../config/prisma.js";
import { rootWallet } from "../../config/root.js";

export const usersRepository = {
  findByWallet(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress } });
  },

  findWithPackageCount(walletAddress: string) {
    return prisma.user.findUnique({ where: { walletAddress }, include: { _count: { select: { packages: true } } } });
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

  /** Sponsor lookup for invite links: any registered wallet, paid or not (owner, 2026-10-13). */
  async findSponsorByCode(referralCode: string) {
    const user = await prisma.user.findUnique({
      where: { referralCode },
      select: { walletAddress: true, referralCode: true, _count: { select: { packages: true } } },
    });
    if (!user) return null;
    return { walletAddress: user.walletAddress, referralCode: user.referralCode, activated: user._count.packages > 0 || user.walletAddress === rootWallet() };
  },
};
