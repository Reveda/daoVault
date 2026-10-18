import { Prisma } from "@prisma/client";
import { serializable } from "../../config/transaction.js";
import { prisma } from "../../config/prisma.js";
import {
  linkUpline,
  placeMember,
  teamHasPayment,
  uniqueReferralCode,
  type Side,
} from "../activation/activation.engine.js";
import { usersRepository } from "./users.repository.js";
import { isRootWallet, rootWallet } from "../../config/root.js";

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
   * before any payment. Its invite link works at once (owner, 2026-10-13); the sponsor and the
   * placement spot come from joining a team (joinTeam) or, failing that, at activation.
   * Idempotent: an existing wallet just gets its code back.
   */
  async register(walletAddress: string) {
    const wallet = walletAddress.toLowerCase();
    const view = (u: {
      walletAddress: string;
      referralCode: string;
      _count: { packages: number };
    }) => ({
      walletAddress: u.walletAddress,
      referralCode: u.referralCode,
      activated: u._count.packages > 0 || isRootWallet(u.walletAddress),
    });

    // No serializable transaction here (load test, 2026-10-14: 40 sign-ups at once made Postgres
    // abort some as write conflicts -> 500s). The unique wallet and code constraints already stop
    // doubles: a duplicate wallet means another tab won (return its record); a duplicate code means
    // two wallets share the first hex chars, so pick the code again (it grows longer).
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await usersRepository.findWithPackageCount(wallet);
      if (existing) return view(existing);
      try {
        return view(
          await prisma.user.create({
            data: { walletAddress: wallet, referralCode: await uniqueReferralCode(prisma, wallet) },
            include: { _count: { select: { packages: true } } },
          }),
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"))
          throw error;
        // loop: the wallet now exists (return it) or the code was just taken (try another)
      }
    }
    throw Object.assign(new Error("Could not register this wallet right now. Please try again."), {
      statusCode: 503,
    });
  }

  /**
   * Joining a team (owner, 2026-10-17): the member opened an invite link and picked LEFT or RIGHT.
   * In one step the invite code becomes its SPONSOR (directs + 20-level income) and it takes the
   * bottom spot of that side under the sponsor in the PLACEMENT tree (business + ranks). Allowed
   * once: the spot and the sponsor never change afterwards. Works before payment (pre-launch teams,
   * owner 2026-10-13). The code must belong to a registered wallet, not the wallet's own, and not
   * someone inside the wallet's own team (no loops).
   */
  async joinTeam(walletAddress: string, sponsorCode: string, side: Side) {
    const code = sponsorCode.trim().toUpperCase();
    const me = await this.register(walletAddress);
    const fail = (message: string, statusCode: number) =>
      Object.assign(new Error(message), { statusCode });
    if (code === me.referralCode) throw fail("That is your own invite code.", 400);
    return serializable(async (tx) => {
      const [user, sponsor] = await Promise.all([
        tx.user.findUniqueOrThrow({
          where: { walletAddress: me.walletAddress },
          include: {
            upline: { select: { referralCode: true } },
            placement: { select: { referralCode: true } },
          },
        }),
        tx.user.findUnique({ where: { referralCode: code }, select: { id: true } }),
      ]);
      if (!sponsor) throw fail("Invite code not found.", 404);
      if (user.placementId) {
        const placed = `${user.placementSide === "RIGHT" ? "Right" : "Left"} side under ${user.placement?.referralCode}`;
        throw fail(`You have already joined: ${placed}. Your place is fixed.`, 409);
      }
      // a member registered earlier with another sponsor (or paid without joining) keeps it once its team paid
      if (user.uplineId && user.uplineId !== sponsor.id && (await teamHasPayment(tx, user.id))) {
        throw fail(
          `Your sponsor stays ${user.upline?.referralCode}: your team has already started paying.`,
          409,
        );
      }
      if (user.uplineId !== sponsor.id && !(await linkUpline(tx, user.id, sponsor.id))) {
        throw fail("That invite code belongs to someone in your own team.", 400);
      }
      const parentId = await placeMember(tx, user.id, sponsor.id, side);
      if (!parentId) throw fail("That invite code belongs to someone in your own team.", 400);
      await tx.user.update({ where: { id: user.id }, data: { pendingSponsorCode: code } });
      const parent = await tx.user.findUniqueOrThrow({
        where: { id: parentId },
        select: { referralCode: true },
      });
      return { sponsorCode: code, placement: { side, underCode: parent.referralCode } };
    });
  }

  /**
   * Self-repair, run at every server start: a PAID member with a sponsor but no placement spot
   * (paid before binary placement existed, 2026-10-17) takes the bottom of its sponsor's LEFT side,
   * oldest first, so its business counts again. Safe from several API copies (re-checked inside the
   * transaction, plan lock).
   */
  async placeUnplacedPaid() {
    // nobody stays outside the tree (owner, 2026-10-18): a paid member with no sponsor joins the company root
    const root = rootWallet();
    const rootUser = root
      ? await prisma.user.findUnique({ where: { walletAddress: root }, select: { id: true } })
      : null;
    const rows = await prisma.user.findMany({
      where: {
        placementId: null,
        packages: { some: {} },
        ...(rootUser ? { NOT: { id: rootUser.id } } : { uplineId: { not: null } }),
      },
      select: { id: true, referralCode: true, uplineId: true },
      orderBy: { createdAt: "asc" },
    });
    const placed: string[] = [];
    for (const row of rows) {
      const sponsorId = row.uplineId ?? rootUser?.id;
      if (!sponsorId) continue;
      const ok = await serializable(async (tx) => {
        const now = await tx.user.findUniqueOrThrow({
          where: { id: row.id },
          select: { placementId: true, uplineId: true },
        });
        if (now.placementId) return false;
        if (!now.uplineId && !(await linkUpline(tx, row.id, sponsorId))) return false;
        return Boolean(await placeMember(tx, row.id, now.uplineId ?? sponsorId, "LEFT"));
      });
      if (ok) placed.push(row.referralCode);
    }
    return placed;
  }
}

export const usersService = new UsersService();
