import { Prisma } from "@prisma/client";
import { serializable } from "../../config/transaction.js";
import { linkUpline, uniqueReferralCode } from "../activation/activation.engine.js";
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
      const [paidBelow] = user.uplineId ? await tx.$queryRaw<Array<{ paid: boolean }>>`
        WITH RECURSIVE tree(id) AS (
          SELECT id FROM users WHERE upline_id = ${user.id}::uuid
          UNION ALL
          SELECT u.id FROM users u JOIN tree t ON u.upline_id = t.id
        )
        SELECT EXISTS (SELECT 1 FROM packages p JOIN tree t ON p.user_id = t.id) AS paid` : [{ paid: false }];
      if (user.uplineId && (user.teamVolume > 0 || paidBelow?.paid)) {
        throw fail(`Your sponsor stays ${user.upline?.referralCode}: your team has already started paying.`, 409);
      }
      if (!(await linkUpline(tx, user.id, sponsor.id))) throw fail("That invite code belongs to someone in your own team.", 400);
      await tx.user.update({ where: { id: user.id }, data: { pendingSponsorCode: code } });
      return { pendingSponsorCode: code, activated: false };
    });
  }
}

export const usersService = new UsersService();
