import { Prisma } from "@prisma/client";
import { serializable } from "../../config/transaction.js";
import { uniqueReferralCode } from "../activation/activation.engine.js";
import { usersRepository } from "./users.repository.js";

export class UsersService {
  async getPublicProfile(walletAddress: string) {
    const user = await usersRepository.findPublicByWallet(walletAddress.toLowerCase());
    if (!user) {
      const error = new Error("User not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return user;
  }

  async getSponsorByCode(code: string) {
    const sponsor = await usersRepository.findSponsorByCode(code.toUpperCase());
    if (!sponsor) {
      const error = new Error("Referral code not found or not activated") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return sponsor;
  }

  /**
   * Gives a wallet its permanent referral code the first time it opens the dashboard,
   * before any payment. Only the code is reserved: no upline (set at activation by
   * processActivation, which keeps this record and its code), no package, so the wallet
   * cannot sponsor anyone until it is activated (findSponsorByCode needs a package).
   * Idempotent: an existing wallet just gets its code back.
   */
  async register(walletAddress: string) {
    const wallet = walletAddress.toLowerCase();
    const view = (u: { walletAddress: string; referralCode: string; _count: { packages: number } }) =>
      ({ walletAddress: u.walletAddress, referralCode: u.referralCode, activated: u._count.packages > 0 });

    const existing = await usersRepository.findWithPackageCount(wallet);
    if (existing) return view(existing);
    try {
      return view(await serializable(async (tx) => {
        const again = await tx.user.findUnique({ where: { walletAddress: wallet }, include: { _count: { select: { packages: true } } } });
        if (again) return again;
        return tx.user.create({
          data: { walletAddress: wallet, referralCode: await uniqueReferralCode(tx, wallet) },
          include: { _count: { select: { packages: true } } },
        });
      }));
    } catch (error) {
      // two tabs registering the same wallet at once: the other one won, return its record
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await usersRepository.findWithPackageCount(wallet);
        if (winner) return view(winner);
      }
      throw error;
    }
  }
}

export const usersService = new UsersService();
