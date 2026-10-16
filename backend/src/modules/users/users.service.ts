import { Prisma } from "@prisma/client";
import { serializable } from "../../config/transaction.js";
import { prisma } from "../../config/prisma.js";
import { linkUpline, teamHasPayment, uniqueReferralCode } from "../activation/activation.engine.js";
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
      const error = new Error("Referral code not found") as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return sponsor;
  }

  /**
   * Gives a wallet its permanent referral code the first time it opens the dashboard,
   * before any payment. Its invite link works at once (owner, 2026-10-13); the upline comes
   * from the invite link it opened (savePendingSponsor) or, failing that, at activation.
   * Idempotent: an existing wallet just gets its code back.
   */
  async register(walletAddress: string) {
    const wallet = walletAddress.toLowerCase();
    const view = (u: { walletAddress: string; referralCode: string; _count: { packages: number } }) =>
      ({ walletAddress: u.walletAddress, referralCode: u.referralCode, activated: u._count.packages > 0 || isRootWallet(u.walletAddress) });

    // No serializable transaction here (load test, 2026-10-14: 40 sign-ups at once made Postgres
    // abort some as write conflicts -> 500s). The unique wallet and code constraints already stop
    // doubles: a duplicate wallet means another tab won (return its record); a duplicate code means
    // two wallets share the first hex chars, so pick the code again (it grows longer).
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await usersRepository.findWithPackageCount(wallet);
      if (existing) return view(existing);
      try {
        return view(await prisma.user.create({
          data: { walletAddress: wallet, referralCode: await uniqueReferralCode(prisma, wallet) },
          include: { _count: { select: { packages: true } } },
        }));
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        // loop: the wallet now exists (return it) or the code was just taken (try another)
      }
    }
    throw Object.assign(new Error("Could not register this wallet right now. Please try again."), { statusCode: 503 });
  }

  /**
   * The invite link puts the wallet into the tree at once, before any payment (owner, 2026-10-13:
   * teams are built during the pre-launch marketing days). Latest invite link wins (owner,
   * 2026-10-09) while the wallet is unpaid AND nobody in its own team has paid yet; after that
   * the sponsor is fixed (moving a team with packages would move volume already counted).
   * Activated wallets keep their real upline. The code must belong to a registered wallet, not
   * the wallet's own, and not someone inside the wallet's own team (no loops).
   */
  async savePendingSponsor(walletAddress: string, sponsorCode: string) {
    const code = sponsorCode.trim().toUpperCase();
    const me = await this.register(walletAddress);
    if (me.activated) return { pendingSponsorCode: null, activated: true };
    const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
    if (code === me.referralCode) throw fail("That is your own invite code.", 400);
    return serializable(async (tx) => {
      const [user, sponsor] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { walletAddress: me.walletAddress }, include: { upline: { select: { referralCode: true } } } }),
        tx.user.findUnique({ where: { referralCode: code }, select: { id: true } }),
      ]);
      if (!sponsor) throw fail("Invite code not found.", 404);
      if (user.uplineId === sponsor.id) return { pendingSponsorCode: code, activated: false };
      // any package below (counted or still in the plan queue) fixes the sponsor
      if (user.uplineId && (user.teamVolume > 0 || (await teamHasPayment(tx, user.id)))) {
        throw fail(`Your sponsor stays ${user.upline?.referralCode}: your team has already started paying.`, 409);
      }
      if (!(await linkUpline(tx, user.id, sponsor.id))) throw fail("That invite code belongs to someone in your own team.", 400);
      await tx.user.update({ where: { id: user.id }, data: { pendingSponsorCode: code } });
      return { pendingSponsorCode: code, activated: false };
    });
  }

  /**
   * Self-repair, run at every server start: an UNPAID wallet whose invite code is saved but which
   * is not in the tree (upline_id empty) is linked under that sponsor. Wallets that saved a code
   * before 2026-10-13 were left like this (the old rule linked only at payment), so they and their
   * teams were missing from the sponsor's downline. Same linkUpline as an invite link (loop check,
   * plan lock); safe to run from several API copies at once (re-checked inside the transaction).
   */
  async linkSavedSponsors() {
    const rows = await prisma.user.findMany({
      where: { uplineId: null, pendingSponsorCode: { not: null }, packages: { none: {} } },
      select: { id: true, referralCode: true, pendingSponsorCode: true },
      orderBy: { createdAt: "asc" },
    });
    const result = { found: rows.length, linked: [] as string[], skipped: [] as string[] };
    for (const row of rows) {
      const sponsor = await prisma.user.findUnique({ where: { referralCode: row.pendingSponsorCode! }, select: { id: true } });
      const ok = sponsor && await serializable(async (tx) => {
        const now = await tx.user.findUniqueOrThrow({ where: { id: row.id }, select: { uplineId: true } });
        return now.uplineId ? true : linkUpline(tx, row.id, sponsor.id);
      });
      (ok ? result.linked : result.skipped).push(`${row.referralCode} -> ${row.pendingSponsorCode}`);
    }
    return result;
  }
}

export const usersService = new UsersService();
