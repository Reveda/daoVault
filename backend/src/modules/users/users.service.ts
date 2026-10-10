import { Prisma } from "@prisma/client";
import { serializable } from "../../config/transaction.js";
import { uniqueReferralCode } from "../activation/activation.engine.js";
import { usersRepository } from "./users.repository.js";
import { isRootWallet } from "../../config/root.js";

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
      ({ walletAddress: u.walletAddress, referralCode: u.referralCode, activated: u._count.packages > 0 || isRootWallet(u.walletAddress) });

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

  /**
   * Latest invite link wins (owner, 2026-10-09): until the wallet pays, the invite code it
   * opened most recently is its sponsor, saved here so a change of browser or wallet app
   * keeps it. Activated wallets keep their real upline and are left untouched. The code
   * must belong to a registered wallet and cannot be the wallet's own code.
   */
  async savePendingSponsor(walletAddress: string, sponsorCode: string) {
    const code = sponsorCode.trim().toUpperCase();
    const me = await this.register(walletAddress);
    if (me.activated) return { pendingSponsorCode: null, activated: true };
    const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
    if (code === me.referralCode) throw fail("That is your own invite code.", 400);
    if (!(await usersRepository.codeExists(code))) throw fail("Invite code not found.", 404);
    await usersRepository.setPendingSponsor(me.walletAddress, code);
    return { pendingSponsorCode: code, activated: false };
  }
}

export const usersService = new UsersService();
