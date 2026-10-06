import { EarningType, PackageStatus, Prisma } from "@prisma/client";
import { CAP_MULTIPLIER, LEVELS, RANKS, fromCents, isLevelUnlocked, rankForLegs, summarizeLegs, toCents } from "../plan/plan.js";

type Tx = Prisma.TransactionClient;

const ZERO = "0x0000000000000000000000000000000000000000";

export type ActivationInput = {
  walletAddress: string;   // lowercase
  sponsorAddress: string;  // lowercase, zero address = no sponsor
  transactionHash: string;
  amountUsd: number;
};

export type ActivationResult = {
  walletAddress: string;
  referralCode: string;
  transactionHash: string;
  status: PackageStatus;
  alreadyProcessed: boolean;
  sponsorLinked: boolean;
  commissions: Array<{ level: number; wallet: string; amountUsd: number }>;
  skipped: Array<{ level: number; wallet: string; reason: "no_package" | "capped" | "level_locked" }>;
  rankUps: Array<{ wallet: string; from: number; to: number; rewardUsd: number }>;
};

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** "DV" + first 6 hex chars; longer if that code is already taken (codes must stay unique). */
async function uniqueReferralCode(tx: Tx, wallet: string): Promise<string> {
  for (let len = 6; len <= 14; len += 2) {
    const code = `DV${wallet.slice(2, 2 + len).toUpperCase()}`;
    if (!(await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } }))) return code;
  }
  throw httpError("Could not allocate a referral code.", 500);
}

/** Every upline above `userId`, nearest first (depth 1 = sponsor). */
async function ancestorsOf(tx: Tx, userId: string): Promise<Array<{ id: string; depth: number }>> {
  return tx.$queryRaw<Array<{ id: string; depth: number }>>`
    WITH RECURSIVE chain(id, upline_id, depth) AS (
      SELECT u.id, u.upline_id, 1 FROM users u
       WHERE u.id = (SELECT upline_id FROM users WHERE id = ${userId}::uuid)
      UNION ALL
      SELECT u.id, u.upline_id, c.depth + 1 FROM users u JOIN chain c ON u.id = c.upline_id
       WHERE c.depth < 100000
    )
    SELECT id::text AS id, depth FROM chain ORDER BY depth`;
}

/**
 * Re-evaluates the rank of each member in `ids` from their legs (50:50 rule). Ranks only
 * go up. Every newly reached tier pays its one-time reward once (rank rewards are a
 * separate pool, so they are not limited by the 10x level-income cap).
 */
export async function recomputeRanks(tx: Tx, ids: string[]): Promise<ActivationResult["rankUps"]> {
  if (!ids.length) return [];
  const members = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, walletAddress: true, currentRank: true, packages: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const directs = await tx.user.findMany({
    where: { uplineId: { in: ids } },
    select: { uplineId: true, teamVolume: true, _count: { select: { packages: true } } },
  });
  const legsBy = new Map<string, number[]>();
  for (const d of directs) {
    const legs = legsBy.get(d.uplineId!) ?? [];
    legs.push(d.teamVolume + (d._count.packages > 0 ? 1 : 0));
    legsBy.set(d.uplineId!, legs);
  }

  const rankUps: ActivationResult["rankUps"] = [];
  for (const m of members) {
    const reached = rankForLegs(summarizeLegs(legsBy.get(m.id) ?? []));
    if (reached <= m.currentRank) continue;
    await tx.user.update({ where: { id: m.id }, data: { currentRank: reached } });
    let rewardUsd = 0;
    const pkg = m.packages[0];
    if (pkg) {
      for (let r = m.currentRank + 1; r <= reached; r++) {
        const paid = await tx.earning.findFirst({ where: { recipientId: m.id, type: EarningType.RANK_REWARD, level: r }, select: { id: true } });
        if (paid) continue;
        const tier = RANKS[r - 1];
        await tx.earning.create({
          data: { recipientId: m.id, sourceId: m.id, packageId: pkg.id, type: EarningType.RANK_REWARD, level: r, amountUsd: tier.rewardUsd },
        });
        rewardUsd += tier.rewardUsd;
      }
    }
    rankUps.push({ wallet: m.walletAddress, from: m.currentRank, to: reached, rewardUsd });
  }
  return rankUps;
}

/**
 * Registers one verified on-chain activation and runs the plan:
 *  1. member + package (upline set once, never overwritten)
 *  2. sponsor's active directs +1
 *  3. 20-level commissions: each upline is paid only if it has an ACTIVE package, the
 *     level is unlocked by its directs, and the payment fits under its 10x cap (partial
 *     up to the cap, then the package becomes CAPPED). Unpaid shares stay in the treasury.
 *  4. team volume +1 for every upline, then ranks re-evaluated with the 50:50 rule.
 * Must run inside a serializable transaction (see config/transaction.ts).
 */
export async function processActivation(tx: Tx, input: ActivationInput): Promise<ActivationResult> {
  const { walletAddress, transactionHash, amountUsd } = input;

  const byHash = await tx.package.findUnique({ where: { activationTxHash: transactionHash }, include: { user: true } });
  if (byHash) {
    if (byHash.user.walletAddress !== walletAddress) throw httpError("Transaction belongs to another wallet.", 409);
    return {
      walletAddress, referralCode: byHash.user.referralCode, transactionHash, status: byHash.status,
      alreadyProcessed: true, sponsorLinked: Boolean(byHash.user.uplineId), commissions: [], skipped: [], rankUps: [],
    };
  }

  let user = await tx.user.findUnique({ where: { walletAddress }, include: { _count: { select: { packages: true, downline: true } } } });
  if (user && user._count.packages > 0) throw httpError("This wallet already has an activation package.", 409);

  const sponsorAddress = input.sponsorAddress && input.sponsorAddress !== ZERO && input.sponsorAddress !== walletAddress
    ? input.sponsorAddress : null;
  const sponsor = sponsorAddress
    ? await tx.user.findUnique({ where: { walletAddress: sponsorAddress }, include: { _count: { select: { packages: true } } } })
    : null;
  // only an activated member can sponsor
  const validSponsor = sponsor && sponsor._count.packages > 0 ? sponsor : null;

  if (!user) {
    user = await tx.user.create({
      data: { walletAddress, referralCode: await uniqueReferralCode(tx, walletAddress), uplineId: validSponsor?.id },
      include: { _count: { select: { packages: true, downline: true } } },
    });
  } else if (!user.uplineId && validSponsor && user._count.downline === 0) {
    // a pre-existing record without upline or downline can still be linked (no cycle possible)
    user = await tx.user.update({
      where: { id: user.id }, data: { uplineId: validSponsor.id },
      include: { _count: { select: { packages: true, downline: true } } },
    });
  }

  const amountCents = toCents(amountUsd);
  const pkg = await tx.package.create({
    data: {
      userId: user.id, packageAmount: amountUsd, maxCapLimit: fromCents(amountCents * CAP_MULTIPLIER),
      status: PackageStatus.ACTIVE, activationTxHash: transactionHash,
    },
  });

  const result: ActivationResult = {
    walletAddress, referralCode: user.referralCode, transactionHash, status: pkg.status,
    alreadyProcessed: false, sponsorLinked: Boolean(user.uplineId), commissions: [], skipped: [], rankUps: [],
  };

  const chain = await ancestorsOf(tx, user.id);
  if (!chain.length) return result;

  // 2. the sponsor gains an active direct (before commissions, so it can unlock their next level)
  await tx.user.update({ where: { id: chain[0].id }, data: { activeDirectsCount: { increment: 1 } } });

  // 3. 20-level commissions
  const top = chain.slice(0, LEVELS.length);
  const uplines = await tx.user.findMany({
    where: { id: { in: top.map((c) => c.id) } },
    select: {
      id: true, walletAddress: true, activeDirectsCount: true,
      packages: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const byId = new Map(uplines.map((u) => [u.id, u]));
  for (const { id, depth } of top) {
    const upline = byId.get(id);
    if (!upline) continue;
    const level = depth;
    const upPkg = upline.packages[0];
    if (!upPkg) { result.skipped.push({ level, wallet: upline.walletAddress, reason: "no_package" }); continue; }
    if (upPkg.status !== PackageStatus.ACTIVE) { result.skipped.push({ level, wallet: upline.walletAddress, reason: "capped" }); continue; }
    if (!isLevelUnlocked(level, upline.activeDirectsCount)) { result.skipped.push({ level, wallet: upline.walletAddress, reason: "level_locked" }); continue; }

    const shareCents = Math.round((amountCents * LEVELS[level - 1].pct) / 100);
    const earnedCents = toCents(upPkg.totalEarned.toString());
    const capCents = toCents(upPkg.maxCapLimit.toString());
    const payCents = Math.min(shareCents, capCents - earnedCents);
    if (payCents <= 0) {
      await tx.package.update({ where: { id: upPkg.id }, data: { status: PackageStatus.CAPPED } });
      result.skipped.push({ level, wallet: upline.walletAddress, reason: "capped" });
      continue;
    }
    await tx.earning.create({
      data: {
        recipientId: upline.id, sourceId: user.id, packageId: upPkg.id, type: EarningType.LEVEL_COMMISSION,
        level, percentage: LEVELS[level - 1].pct, amountUsd: fromCents(payCents),
      },
    });
    const newEarned = earnedCents + payCents;
    await tx.package.update({
      where: { id: upPkg.id },
      data: { totalEarned: fromCents(newEarned), status: newEarned >= capCents ? PackageStatus.CAPPED : PackageStatus.ACTIVE },
    });
    result.commissions.push({ level, wallet: upline.walletAddress, amountUsd: fromCents(payCents) });
  }

  // 4. team volume for every upline, then ranks
  const allIds = chain.map((c) => c.id);
  await tx.user.updateMany({ where: { id: { in: allIds } }, data: { teamVolume: { increment: 1 } } });
  result.rankUps = await recomputeRanks(tx, allIds);
  return result;
}
