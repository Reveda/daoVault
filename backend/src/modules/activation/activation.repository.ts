import { PackageStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export const activationRepository = {
  findPackageByUser(userId: string) {
    return prisma.package.findFirst({ where: { userId } });
  },

  async saveActivation(input: {
    walletAddress: string;
    sponsorAddress: string;
    transactionHash: string;
    amountUsd: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const sponsor = input.sponsorAddress !== '0x0000000000000000000000000000000000000000'
        ? await tx.user.findUnique({ where: { walletAddress: input.sponsorAddress } })
        : null;
      const referralCode = `DV${input.walletAddress.slice(2, 8).toUpperCase()}`;
      const user = await tx.user.upsert({
        where: { walletAddress: input.walletAddress },
        update: sponsor ? { uplineId: sponsor.id } : {},
        create: { walletAddress: input.walletAddress, referralCode, uplineId: sponsor?.id },
      });
      const existing = await tx.package.findFirst({ where: { userId: user.id } });
      if (existing && existing.activationTxHash !== input.transactionHash) {
        throw Object.assign(new Error('This wallet already has an activation package.'), { statusCode: 409 });
      }
      const packageRecord = existing ?? await tx.package.create({
        data: {
          userId: user.id,
          packageAmount: input.amountUsd,
          maxCapLimit: input.amountUsd * 10,
          status: PackageStatus.ACTIVE,
          activationTxHash: input.transactionHash,
        },
      });
      return { walletAddress: user.walletAddress, transactionHash: packageRecord.activationTxHash, status: packageRecord.status };
    });
  },
};
