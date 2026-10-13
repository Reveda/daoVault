import { EarningType, PackageStatus, Prisma } from "@prisma/client";
import { CAP_MULTIPLIER, LEVELS, RANKS, fromCents, isLevelUnlocked, rankForLegs, summarizeLegs, toCents } from "../plan/plan.js";
import { isRootWallet } from "../../config/root.js";

type Tx = Prisma.TransactionClient;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * One runner at a time for everything that changes commissions, directs, team volume or ranks
 * (the plan queue and linkUpline). A Postgres advisory lock: it works across every API copy and
 * the worker, needs no Redis, and is released when the transaction ends.
 */
const PLAN_LOCK = 0x44_56_50_51; // "DVPQ"
const lockPlan = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLAN_LOCK}::bigint)`;
async function tryLockPlan(tx: Tx): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_try_advisory_xact_lock(${PLAN_LOCK}::bigint) AS ok`;
  return Boolean(row?.ok);
}

/** only packages the plan queue has processed count as DAO volume (see PlanEvent) */
const COUNTED = { packages: { where: { countedAt: { not: null } } } } as const;

export type ActivationInput = {
  walletAddress: string;   // lowercase
  sponsorAddress: string;  // lowercase, zero address = no sponsor
  transactionHash: string;
  amountUsd: number;
};

export type Commission = { level: number; wallet: string; amountUsd: number };
export type Skipped = { level: number; wallet: string; reason: "no_package" | "capped" | "level_locked" };
export type RankUp = { wallet: string; from: number; to: number; rewardUsd: number };

export type ActivationResult = {
  walletAddress: string;
  referralCode: string;
  transactionHash: string;
  status: PackageStatus;
  alreadyProcessed: boolean;
  sponsorLinked: boolean;
  /** the plan queue pays the levels a moment later (processPlanEvents); filled only by tests */
  queued: boolean;
  commissions: Commission[];
  skipped: Skipped[];
  rankUps: RankUp[];
};

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** "DV" + first 6 hex chars; longer if that code is already taken (codes must stay unique). */
export async function uniqueReferralCode(tx: Tx, wallet: string): Promise<string> {
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

/** adds `delta` DAO to each member: one UPDATE per distinct delta (a batch's root row is written once) */
async function addVolume(tx: Tx, volume: Map<string, number>) {
  const byDelta = new Map<number, string[]>();
  for (const [id, delta] of volume) if (delta) byDelta.set(delta, [...(byDelta.get(delta) ?? []), id]);
  for (const [delta, ids] of byDelta) {
    for (let i = 0; i < ids.length; i += 5_000) {
      await tx.user.updateMany({ where: { id: { in: ids.slice(i, i + 5_000) } }, data: { teamVolume: { increment: delta } } });
    }
  }
}

/**
 * Puts `userId` (with its whole team) under `sponsorId`. Pre-launch marketing (owner, 2026-10-13):
 * the tree is built from invite links before anyone pays, so an unpaid wallet can be a sponsor.
 * Refuses a loop (the sponsor is the user or inside the user's own team). If the user's team
 * already holds counted packages, that DAO volume moves up to every new ancestor and their ranks
 * are re-checked. Never touches activeDirectsCount: only a PAID member counts as a direct (the
 * plan queue adds it). Holds the plan lock, so it never races the queue. Returns false on a loop.
 */
export async function linkUpline(tx: Tx, userId: string, sponsorId: string): Promise<boolean> {
  if (userId === sponsorId) return false;
  await lockPlan(tx);
  const above = [sponsorId, ...(await ancestorsOf(tx, sponsorId)).map((a) => a.id)];
  if (above.includes(userId)) return false;
  const user = await tx.user.update({
    where: { id: userId }, data: { uplineId: sponsorId },
    select: { teamVolume: true, _count: { select: COUNTED } },
  });
  const volume = user.teamVolume + user._count.packages;
  if (volume > 0) {
    await addVolume(tx, new Map(above.map((id) => [id, volume])));
    await recomputeRanks(tx, above);
  }
  return true;
}

/**
 * Re-evaluates the rank of each member in `ids` from their legs (50:50 rule). Ranks only
 * go up. Every newly reached tier pays its one-time reward once (rank rewards are a
 * separate pool, so they are not limited by the 25x level-income cap).
 */
export async function recomputeRanks(tx: Tx, ids: string[]): Promise<RankUp[]> {
  if (!ids.length) return [];
  const members = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, walletAddress: true, currentRank: true, packages: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const directs = await tx.user.findMany({
    where: { uplineId: { in: ids } },
    select: { uplineId: true, teamVolume: true, _count: { select: COUNTED } },
  });
  const legsBy = new Map<string, number[]>();
  for (const d of directs) {
    const legs = legsBy.get(d.uplineId!) ?? [];
    legs.push(d.teamVolume + d._count.packages); // 1 DAO per package, top-ups included
    legsBy.set(d.uplineId!, legs);
  }

  const rankUps: RankUp[] = [];
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

/** adds the package and queues it for the plan (directs, 20 levels, team volume, ranks) */
async function queuePackage(tx: Tx, userId: string, amountUsd: number, transactionHash: string, isActivation: boolean) {
  const amountCents = toCents(amountUsd);
  const pkg = await tx.package.create({
    data: {
      userId, packageAmount: amountUsd, maxCapLimit: fromCents(amountCents * CAP_MULTIPLIER),
      status: PackageStatus.ACTIVE, activationTxHash: transactionHash,
    },
  });
  await tx.planEvent.create({ data: { packageId: pkg.id, userId, isActivation, amountCents } });
  return pkg;
}

/**
 * Registers one verified on-chain activation: the member (upline set once, never overwritten:
 * usually already at registration from the invite link) and its package. The plan itself
 * (sponsor's direct +1, 20-level commissions, team volume, ranks) runs in the plan queue right
 * after (processPlanEvents), in payment order. Must run inside a serializable transaction.
 */
export async function processActivation(tx: Tx, input: ActivationInput): Promise<ActivationResult> {
  const { walletAddress, transactionHash, amountUsd } = input;

  const byHash = await tx.package.findUnique({ where: { activationTxHash: transactionHash }, include: { user: true } });
  if (byHash) {
    if (byHash.user.walletAddress !== walletAddress) throw httpError("Transaction belongs to another wallet.", 409);
    return {
      walletAddress, referralCode: byHash.user.referralCode, transactionHash, status: byHash.status,
      alreadyProcessed: true, sponsorLinked: Boolean(byHash.user.uplineId), queued: false, commissions: [], skipped: [], rankUps: [],
    };
  }

  let user = await tx.user.findUnique({ where: { walletAddress }, include: { _count: { select: { packages: true, downline: true } } } });
  if (user && user._count.packages > 0) throw httpError("This wallet already has an activation package.", 409);

  const sponsorAddress = input.sponsorAddress && input.sponsorAddress !== ZERO && input.sponsorAddress !== walletAddress
    ? input.sponsorAddress : null;
  const sponsor = sponsorAddress
    ? await tx.user.findUnique({ where: { walletAddress: sponsorAddress }, include: { _count: { select: { packages: true } } } })
    : null;
  // any registered wallet can sponsor, paid or not (owner, 2026-10-13: teams are built during the
  // pre-launch marketing days; an unpaid sponsor's shares stay with the company until it pays).
  // A root record missing at this point is created so the member is never left without its upline.
  const validSponsor = sponsorAddress && isRootWallet(sponsorAddress)
    ? sponsor ?? await tx.user.create({
      data: { walletAddress: sponsorAddress, referralCode: await uniqueReferralCode(tx, sponsorAddress) },
      include: { _count: { select: { packages: true } } },
    })
    : sponsor;

  if (!user) {
    user = await tx.user.create({
      data: { walletAddress, referralCode: await uniqueReferralCode(tx, walletAddress), uplineId: validSponsor?.id },
      include: { _count: { select: { packages: true, downline: true } } },
    });
  } else if (!user.uplineId && validSponsor) {
    // registered earlier without a sponsor (maybe with a team below it): link now, unless that
    // would make a loop; the upline set at registration (invite link) is never overwritten
    if (await linkUpline(tx, user.id, validSponsor.id)) {
      user = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { _count: { select: { packages: true, downline: true } } } });
    }
  }

  const pkg = await queuePackage(tx, user.id, amountUsd, transactionHash, true);
  return {
    walletAddress, referralCode: user.referralCode, transactionHash, status: pkg.status,
    alreadyProcessed: false, sponsorLinked: Boolean(user.uplineId), queued: true, commissions: [], skipped: [], rankUps: [],
  };
}

/**
 * 20-level commissions for one package. Each upline is paid only if the level is unlocked by
 * its directs and it has an ACTIVE package. The share fills its OLDEST active package first;
 * when that one reaches its 25x cap it becomes CAPPED and the rest spills into the next active
 * package (a top-up waiting in line). Unpaid shares stay with the company.
 */
async function payCommissions(tx: Tx, sourceUserId: string, amountCents: number, chain: Array<{ id: string; depth: number }>) {
  const commissions: Commission[] = [];
  const skipped: Skipped[] = [];
  const top = chain.slice(0, LEVELS.length);
  const uplines = await tx.user.findMany({
    where: { id: { in: top.map((c) => c.id) } },
    select: {
      id: true, walletAddress: true, activeDirectsCount: true,
      _count: { select: { packages: true } },
      packages: { where: { status: PackageStatus.ACTIVE }, orderBy: { createdAt: "asc" } },
    },
  });
  const byId = new Map(uplines.map((u) => [u.id, u]));
  for (const { id, depth } of top) {
    const upline = byId.get(id);
    if (!upline) continue;
    const level = depth;
    if (!upline._count.packages) { skipped.push({ level, wallet: upline.walletAddress, reason: "no_package" }); continue; }
    if (!upline.packages.length) { skipped.push({ level, wallet: upline.walletAddress, reason: "capped" }); continue; }
    if (!isLevelUnlocked(level, upline.activeDirectsCount)) { skipped.push({ level, wallet: upline.walletAddress, reason: "level_locked" }); continue; }

    let remaining = Math.round((amountCents * LEVELS[level - 1].pct) / 100);
    let paid = 0;
    for (const upPkg of upline.packages) {
      if (remaining <= 0) break;
      const earnedCents = toCents(upPkg.totalEarned.toString());
      const capCents = toCents(upPkg.maxCapLimit.toString());
      const payCents = Math.min(remaining, capCents - earnedCents);
      if (payCents <= 0) {
        await tx.package.update({ where: { id: upPkg.id }, data: { status: PackageStatus.CAPPED } });
        continue;
      }
      await tx.earning.create({
        data: {
          recipientId: upline.id, sourceId: sourceUserId, packageId: upPkg.id, type: EarningType.LEVEL_COMMISSION,
          level, percentage: LEVELS[level - 1].pct, amountUsd: fromCents(payCents),
        },
      });
      const newEarned = earnedCents + payCents;
      await tx.package.update({
        where: { id: upPkg.id },
        data: { totalEarned: fromCents(newEarned), status: newEarned >= capCents ? PackageStatus.CAPPED : PackageStatus.ACTIVE },
      });
      remaining -= payCents;
      paid += payCents;
    }
    if (paid > 0) commissions.push({ level, wallet: upline.walletAddress, amountUsd: fromCents(paid) });
    else skipped.push({ level, wallet: upline.walletAddress, reason: "capped" });
  }
  return { commissions, skipped };
}

export type PlanBatch = {
  busy: boolean;
  processed: number;
  events: Array<{ packageId: string; wallet: string; commissions: Commission[]; skipped: Skipped[] }>;
  rankUps: RankUp[];
};

/**
 * The plan queue: takes up to `limit` unprocessed payments, oldest first, and for each one
 *  1. the sponsor gains an active direct (activations only; before commissions, so it can
 *     unlock their next level, exactly as when the payment arrived)
 *  2. 20-level commissions (payCommissions)
 *  3. +1 DAO for every upline: summed over the batch and written once per upline
 * then re-checks the ranks of every upline touched. Runs under the plan lock (one runner across
 * all API copies and the worker); `lock: false` only inside the plan self-test's own transaction.
 */
export async function processPlanEvents(tx: Tx, { limit = 100, lock = true } = {}): Promise<PlanBatch> {
  const batch: PlanBatch = { busy: false, processed: 0, events: [], rankUps: [] };
  if (lock && !(await tryLockPlan(tx))) return { ...batch, busy: true };
  const events = await tx.planEvent.findMany({ where: { processedAt: null }, orderBy: { id: "asc" }, take: limit });
  if (!events.length) return batch;

  const volume = new Map<string, number>();
  const now = new Date();
  for (const ev of events) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: ev.userId }, select: { walletAddress: true } });
    const chain = await ancestorsOf(tx, ev.userId);
    if (ev.isActivation && chain.length) {
      await tx.user.update({ where: { id: chain[0].id }, data: { activeDirectsCount: { increment: 1 } } });
    }
    const paid = chain.length ? await payCommissions(tx, ev.userId, ev.amountCents, chain) : { commissions: [], skipped: [] };
    for (const c of chain) volume.set(c.id, (volume.get(c.id) ?? 0) + 1);
    await tx.package.update({ where: { id: ev.packageId }, data: { countedAt: now } });
    await tx.planEvent.update({ where: { id: ev.id }, data: { processedAt: now } });
    batch.events.push({ packageId: ev.packageId, wallet: user.walletAddress, ...paid });
  }
  await addVolume(tx, volume);
  batch.rankUps = await recomputeRanks(tx, [...volume.keys()]);
  batch.processed = events.length;
  return batch;
}

export type TopUpInput = {
  walletAddress: string;   // lowercase
  transactionHash: string;
  amountUsd: number;
};

/**
 * Re-entry (owner, 2026-10-10): a verified on-chain ToppedUp adds a NEW package to an activated
 * member, with its own 25x cap. Same ID, same upline and team; the sponsor gains no new direct
 * (already counted). The plan queue pays the uplines the 20 levels again and adds 1 DAO to their
 * team volume. Commissions keep filling the oldest active package first. Idempotent per
 * transaction hash. Must run inside a serializable transaction.
 */
export async function processTopUp(tx: Tx, input: TopUpInput): Promise<ActivationResult> {
  const { walletAddress, transactionHash, amountUsd } = input;
  const byHash = await tx.package.findUnique({ where: { activationTxHash: transactionHash }, include: { user: true } });
  if (byHash) {
    if (byHash.user.walletAddress !== walletAddress) throw httpError("Transaction belongs to another wallet.", 409);
    return {
      walletAddress, referralCode: byHash.user.referralCode, transactionHash, status: byHash.status,
      alreadyProcessed: true, sponsorLinked: Boolean(byHash.user.uplineId), queued: false, commissions: [], skipped: [], rankUps: [],
    };
  }
  const user = await tx.user.findUnique({ where: { walletAddress }, include: { _count: { select: { packages: true } } } });
  if (!user || user._count.packages === 0) throw httpError("Activate the wallet before a top-up.", 409);

  const pkg = await queuePackage(tx, user.id, amountUsd, transactionHash, false);
  return {
    walletAddress, referralCode: user.referralCode, transactionHash, status: pkg.status,
    alreadyProcessed: false, sponsorLinked: Boolean(user.uplineId), queued: true, commissions: [], skipped: [], rankUps: [],
  };
}
