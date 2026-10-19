import { EarningType, PackageStatus, Prisma } from "@prisma/client";
import {
  CAP_MULTIPLIER,
  FAST_START,
  FAST_START_DIRECTS,
  LEVELS,
  RANKS,
  fromCents,
  isLevelUnlocked,
  rankForLegs,
  summarizeLegs,
  toCents,
} from "../plan/plan.js";
import { isRootWallet, rootWallet } from "../../config/root.js";

type Tx = Prisma.TransactionClient;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * One runner at a time for everything that changes commissions, directs, team volume or ranks
 * (the plan queue, linkUpline and placeMember). A Postgres advisory lock: it works across every API copy and
 * the worker, needs no Redis, and is released when the transaction ends.
 */
const PLAN_LOCK = 0x44_56_50_51; // "DVPQ"
const lockPlan = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLAN_LOCK}::bigint)`;
async function tryLockPlan(tx: Tx): Promise<boolean> {
  const [row] = await tx.$queryRaw<
    Array<{ ok: boolean }>
  >`SELECT pg_try_advisory_xact_lock(${PLAN_LOCK}::bigint) AS ok`;
  return Boolean(row?.ok);
}

/** only packages the plan queue has processed count as DAO volume (see PlanEvent) */
const COUNTED = { packages: { where: { countedAt: { not: null } } } } as const;

/**
 * Two trees (owner, 2026-10-17):
 *  - SPONSOR tree (users.upline_id, who invited whom): directs, level unlock and the 20-level income.
 *  - PLACEMENT tree (users.placement_id + placement_side, binary LEFT / RIGHT): team business, the
 *    Left / Right legs, ranks and rank rewards. The joining member picks the side; the spot is the
 *    bottom of that side under the sponsor and never changes (placeMember).
 */
export type Side = "LEFT" | "RIGHT";
type SideVolume = Map<string, { left: number; right: number }>;
const addTo = (volume: SideVolume, id: string, side: Side, dao: number) => {
  const v = volume.get(id) ?? { left: 0, right: 0 };
  if (side === "LEFT") v.left += dao;
  else v.right += dao;
  volume.set(id, v);
};

export type ActivationInput = {
  walletAddress: string; // lowercase
  sponsorAddress: string; // lowercase, zero address = no sponsor
  transactionHash: string;
  amountUsd: number;
  /** block time of the on-chain payment (event timestamp); empty = now */
  paidAt?: Date;
};

export type Commission = { level: number; wallet: string; amountUsd: number };
export type Skipped = {
  level: number;
  wallet: string;
  reason: "no_package" | "capped" | "level_locked";
};
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
  /**
   * the on-chain sponsor differed from the recorded one: "moved" = tree follows the chain,
   * "kept" = the member's team already paid, "loop" = the on-chain sponsor is inside the member's own team
   */
  sponsorMismatch?: "moved" | "kept" | "loop";
  commissions: Commission[];
  skipped: Skipped[];
  rankUps: RankUp[];
};

const httpError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode });

/** "DV" + first 6 hex chars; longer if that code is already taken (codes must stay unique). */
export async function uniqueReferralCode(tx: Pick<Tx, "user">, wallet: string): Promise<string> {
  for (let len = 6; len <= 14; len += 2) {
    const code = `DV${wallet.slice(2, 2 + len).toUpperCase()}`;
    if (!(await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } })))
      return code;
  }
  throw httpError("Could not allocate a referral code.", 500);
}

/** Every SPONSOR above `userId`, nearest first (depth 1 = sponsor): directs and the 20-level income. */
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
 * Every member above `userId` in the PLACEMENT tree, nearest first, with the side of theirs this
 * member's business arrives on. Depth-guarded like ancestorsOf.
 */
async function placementAncestorsOf(
  tx: Tx,
  userId: string,
): Promise<Array<{ id: string; side: Side }>> {
  return tx.$queryRaw<Array<{ id: string; side: Side }>>`
    WITH RECURSIVE chain(id, parent, side, depth) AS (
      SELECT id, placement_id, placement_side, 0 FROM users WHERE id = ${userId}::uuid
      UNION ALL
      SELECT u.id, u.placement_id, u.placement_side, c.depth + 1 FROM users u JOIN chain c ON u.id = c.parent
       WHERE c.depth < 1000000
    )
    SELECT parent::text AS id, side::text AS side FROM chain WHERE parent IS NOT NULL ORDER BY depth`;
}

/**
 * Has anyone below this member paid (a package, counted or still in the plan queue)? One rule for
 * the sponsor-change checks (users.service) and the on-chain sponsor branch below. Depth-guarded
 * like ancestorsOf, so a corrupt loop in upline_id can never recurse forever.
 */
export async function teamHasPayment(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ paid: boolean }>>`
    WITH RECURSIVE tree(id, depth) AS (
      SELECT id, 1 FROM users WHERE upline_id = ${userId}::uuid
      UNION ALL
      SELECT u.id, t.depth + 1 FROM users u JOIN tree t ON u.upline_id = t.id WHERE t.depth < 100000
    )
    SELECT EXISTS (SELECT 1 FROM packages p JOIN tree t ON p.user_id = t.id) AS paid`;
  return Boolean(row?.paid);
}

/**
 * Adds Left / Right DAO to each member (team volume = left + right): one UPDATE per distinct
 * (left, right) pair, so a batch writes each member once.
 */
async function addSideVolume(tx: Tx, volume: SideVolume) {
  const byDelta = new Map<string, string[]>();
  for (const [id, v] of volume) {
    if (!v.left && !v.right) continue;
    const key = `${v.left}:${v.right}`;
    byDelta.set(key, [...(byDelta.get(key) ?? []), id]);
  }
  for (const [key, ids] of byDelta) {
    const [left, right] = key.split(":").map(Number);
    for (let i = 0; i < ids.length; i += 5_000) {
      await tx.user.updateMany({
        where: { id: { in: ids.slice(i, i + 5_000) } },
        data: {
          leftVolume: { increment: left },
          rightVolume: { increment: right },
          teamVolume: { increment: left + right },
        },
      });
    }
  }
}

/**
 * Sets `userId`'s SPONSOR (referral tree). Pre-launch marketing (owner, 2026-10-13): an unpaid
 * wallet can be a sponsor. Refuses a loop (the sponsor is the user or below it in the sponsor
 * tree). Moves no business: team business follows the placement tree (placeMember). Never touches
 * activeDirectsCount: only a PAID member counts as a direct (the plan queue adds it). Holds the
 * plan lock. Returns false on a loop.
 */
export async function linkUpline(tx: Tx, userId: string, sponsorId: string): Promise<boolean> {
  if (userId === sponsorId) return false;
  await lockPlan(tx);
  const above = [sponsorId, ...(await ancestorsOf(tx, sponsorId)).map((a) => a.id)];
  if (above.includes(userId)) return false;
  await tx.user.update({ where: { id: userId }, data: { uplineId: sponsorId } });
  return true;
}

/**
 * Binary placement (owner, 2026-10-17): puts `userId` on the `side` of its sponsor's team, at the
 * BOTTOM of that side: the sponsor's LEFT spot, then that member's LEFT spot, and so on down to the
 * first empty one (RIGHT the same way). The spot is permanent. A team already placed below the
 * member (pre-launch) moves with it: its counted business is added to every new placement ancestor
 * and their ranks are re-checked. Holds the plan lock; the unique (placement_id, placement_side)
 * index is the backstop. Returns the member it now sits under, or null if it was already placed or
 * the spot would be inside its own team.
 */
export async function placeMember(
  tx: Tx,
  userId: string,
  sponsorId: string,
  side: Side,
): Promise<string | null> {
  if (userId === sponsorId) return null;
  await lockPlan(tx);
  const me = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { placementId: true, leftVolume: true, rightVolume: true, _count: { select: COUNTED } },
  });
  if (me.placementId) return null;
  const [bottom] = await tx.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE walk(id, depth) AS (
      SELECT ${sponsorId}::uuid, 0
      UNION ALL
      SELECT u.id, w.depth + 1 FROM users u JOIN walk w ON u.placement_id = w.id
       WHERE u.placement_side = ${side}::"PlacementSide" AND w.depth < 1000000
    )
    SELECT id::text AS id FROM walk ORDER BY depth DESC LIMIT 1`;
  const parentId = bottom.id;
  const above = await placementAncestorsOf(tx, parentId);
  if (parentId === userId || above.some((a) => a.id === userId)) return null;
  await tx.user.update({
    where: { id: userId },
    data: { placementId: parentId, placementSide: side },
  });
  const business = me.leftVolume + me.rightVolume + me._count.packages;
  if (business > 0) {
    const volume: SideVolume = new Map();
    addTo(volume, parentId, side, business);
    for (const a of above) addTo(volume, a.id, a.side, business);
    await addSideVolume(tx, volume);
    await recomputeRanks(tx, [...volume.keys()]);
  }
  return parentId;
}

/**
 * Re-evaluates the rank of each member in `ids` from its Left and Right business (the DAO is
 * needed on EACH side). Ranks only go up. Every newly reached tier pays its one-time reward once,
 * INSIDE the 25x cap (owner, 2026-10-18; creditIntoCap): a member whose packages are full reaches
 * the rank but its reward (or the part over the cap) stays with the company.
 */
export async function recomputeRanks(tx: Tx, ids: string[]): Promise<RankUp[]> {
  if (!ids.length) return [];
  const members = await tx.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      walletAddress: true,
      currentRank: true,
      leftVolume: true,
      rightVolume: true,
      packages: { where: { status: PackageStatus.ACTIVE }, orderBy: { createdAt: "asc" } },
    },
  });

  const rankUps: RankUp[] = [];
  for (const m of members) {
    const reached = rankForLegs(summarizeLegs([m.leftVolume, m.rightVolume]));
    if (reached <= m.currentRank) continue;
    await tx.user.update({ where: { id: m.id }, data: { currentRank: reached } });
    let rewardCents = 0;
    for (let r = m.currentRank + 1; r <= reached; r++) {
      const paid = await tx.earning.findFirst({
        where: { recipientId: m.id, type: EarningType.RANK_REWARD, level: r },
        select: { id: true },
      });
      if (paid) continue;
      rewardCents += await creditIntoCap(tx, m.id, m.packages, toCents(RANKS[r - 1].rewardUsd), {
        sourceId: m.id,
        type: EarningType.RANK_REWARD,
        level: r,
      });
    }
    rankUps.push({
      wallet: m.walletAddress,
      from: m.currentRank,
      to: reached,
      rewardUsd: fromCents(rewardCents),
    });
  }
  return rankUps;
}

/** adds the package and queues it for the plan (directs, 20 levels, team volume, ranks) */
async function queuePackage(
  tx: Tx,
  userId: string,
  amountUsd: number,
  transactionHash: string,
  isActivation: boolean,
  paidAt?: Date,
) {
  const amountCents = toCents(amountUsd);
  const pkg = await tx.package.create({
    data: {
      userId,
      packageAmount: amountUsd,
      maxCapLimit: fromCents(amountCents * CAP_MULTIPLIER),
      status: PackageStatus.ACTIVE,
      activationTxHash: transactionHash,
      paidAt: paidAt ?? new Date(),
    },
  });
  await tx.planEvent.create({ data: { packageId: pkg.id, userId, isActivation, amountCents } });
  return pkg;
}

/**
 * Registers one verified on-chain activation: the member (upline usually set at registration from
 * the invite link; it follows a different on-chain sponsor only while nobody in the member's team
 * has paid, see the sponsorMismatch branch) and its package. The plan itself
 * (sponsor's direct +1, 20-level commissions, team volume, ranks) runs in the plan queue right
 * after (processPlanEvents), in payment order. Must run inside a serializable transaction.
 */
export async function processActivation(tx: Tx, input: ActivationInput): Promise<ActivationResult> {
  const { walletAddress, transactionHash, amountUsd } = input;

  const byHash = await tx.package.findUnique({
    where: { activationTxHash: transactionHash },
    include: { user: true },
  });
  if (byHash) {
    if (byHash.user.walletAddress !== walletAddress)
      throw httpError("Transaction belongs to another wallet.", 409);
    return {
      walletAddress,
      referralCode: byHash.user.referralCode,
      transactionHash,
      status: byHash.status,
      alreadyProcessed: true,
      sponsorLinked: Boolean(byHash.user.uplineId),
      queued: false,
      commissions: [],
      skipped: [],
      rankUps: [],
    };
  }

  let user = await tx.user.findUnique({
    where: { walletAddress },
    include: { _count: { select: { packages: true, downline: true } } },
  });
  if (user && user._count.packages > 0)
    throw httpError("This wallet already has an activation package.", 409);
  let sponsorMismatch: ActivationResult["sponsorMismatch"];

  const sponsorAddress =
    input.sponsorAddress && input.sponsorAddress !== ZERO && input.sponsorAddress !== walletAddress
      ? input.sponsorAddress
      : null;
  const sponsor = sponsorAddress
    ? await tx.user.findUnique({
        where: { walletAddress: sponsorAddress },
        include: { _count: { select: { packages: true } } },
      })
    : null;
  // any registered wallet can sponsor, paid or not (owner, 2026-10-13: teams are built during the
  // pre-launch marketing days; an unpaid sponsor's shares stay with the company until it pays).
  // A root record missing at this point is created so the member is never left without its upline.
  const validSponsor =
    sponsorAddress && isRootWallet(sponsorAddress)
      ? (sponsor ??
        (await tx.user.create({
          data: {
            walletAddress: sponsorAddress,
            referralCode: await uniqueReferralCode(tx, sponsorAddress),
          },
          include: { _count: { select: { packages: true } } },
        })))
      : sponsor;
  // nobody stays outside the tree (owner, 2026-10-18): a member who pays with no (known) sponsor and
  // has no recorded sponsor yet joins under the company root
  const root = rootWallet();
  const rootFallback =
    !validSponsor && !user?.uplineId && root && walletAddress !== root
      ? ((await tx.user.findUnique({
          where: { walletAddress: root },
          include: { _count: { select: { packages: true } } },
        })) ??
        (await tx.user.create({
          data: { walletAddress: root, referralCode: await uniqueReferralCode(tx, root) },
          include: { _count: { select: { packages: true } } },
        })))
      : null;
  const treeSponsor = validSponsor ?? rootFallback;

  if (!user) {
    user = await tx.user.create({
      data: {
        walletAddress,
        referralCode: await uniqueReferralCode(tx, walletAddress),
        uplineId: treeSponsor?.id,
      },
      include: { _count: { select: { packages: true, downline: true } } },
    });
  } else if (!user.uplineId && treeSponsor) {
    // registered earlier without a sponsor (maybe with a team below it): link now, unless that
    // would make a loop
    if (await linkUpline(tx, user.id, treeSponsor.id)) {
      user = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { _count: { select: { packages: true, downline: true } } },
      });
    }
  } else if (user.uplineId && validSponsor && user.uplineId !== validSponsor.id) {
    // the member paid on-chain under another sponsor than the invite link recorded (the website
    // always pays with the recorded one; this is a direct contract call). The chain wins while it
    // is safe: nobody in the member's team has paid (no volume to move). Otherwise the platform
    // tree stays, so commissions already paid through it remain consistent.
    // (a rare path: only a direct contract call reaches it; the website pays with the recorded sponsor)
    // a member who already took a placement spot keeps its sponsor (the spot is permanent)
    if (user.placementId || (await teamHasPayment(tx, user.id))) sponsorMismatch = "kept";
    else if (await linkUpline(tx, user.id, validSponsor.id)) {
      sponsorMismatch = "moved";
      await tx.user.update({
        where: { id: user.id },
        data: { pendingSponsorCode: validSponsor.referralCode },
      });
    } else sponsorMismatch = "loop";
    if (sponsorMismatch === "moved")
      user = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { _count: { select: { packages: true, downline: true } } },
      });
  }

  // paid without choosing a side on the website (e.g. a direct contract call): the bottom of the
  // sponsor's LEFT side (owner, 2026-10-18)
  if (user.uplineId && !user.placementId) await placeMember(tx, user.id, user.uplineId, "LEFT");

  const pkg = await queuePackage(tx, user.id, amountUsd, transactionHash, true, input.paidAt);
  return {
    walletAddress,
    referralCode: user.referralCode,
    transactionHash,
    status: pkg.status,
    alreadyProcessed: false,
    sponsorLinked: Boolean(user.uplineId),
    queued: true,
    commissions: [],
    skipped: [],
    rankUps: [],
    ...(sponsorMismatch ? { sponsorMismatch } : {}),
  };
}

type CapPackage = {
  id: string;
  totalEarned: { toString(): string };
  maxCapLimit: { toString(): string };
  status: PackageStatus;
};

/**
 * Credits up to `cents` to a member inside the 25x cap (owner, 2026-10-18: level income, rank
 * rewards and the fast-start bonus ALL count toward it; total earnings never pass 25x). Fills the
 * member's ACTIVE packages oldest first; a package that reaches its cap becomes CAPPED and the
 * rest spills into the next (a top-up waiting in line). One Earning per package touched. The
 * `packages` objects are updated in place, so several credits in a row stay correct. Returns the
 * cents paid: less than asked (or 0) when the packages are full; the rest stays with the company.
 */
async function creditIntoCap(
  tx: Tx,
  recipientId: string,
  packages: CapPackage[],
  cents: number,
  earning: { sourceId: string; type: EarningType; level: number; percentage?: number },
): Promise<number> {
  let remaining = cents;
  let paid = 0;
  for (const p of packages) {
    if (remaining <= 0) break;
    if (p.status !== PackageStatus.ACTIVE) continue;
    const earnedCents = toCents(p.totalEarned.toString());
    const capCents = toCents(p.maxCapLimit.toString());
    const payCents = Math.min(remaining, capCents - earnedCents);
    if (payCents <= 0) {
      await tx.package.update({ where: { id: p.id }, data: { status: PackageStatus.CAPPED } });
      p.status = PackageStatus.CAPPED;
      continue;
    }
    await tx.earning.create({
      data: {
        recipientId,
        sourceId: earning.sourceId,
        packageId: p.id,
        type: earning.type,
        level: earning.level,
        percentage: earning.percentage,
        amountUsd: fromCents(payCents),
      },
    });
    const newEarned = earnedCents + payCents;
    const status = newEarned >= capCents ? PackageStatus.CAPPED : PackageStatus.ACTIVE;
    await tx.package.update({
      where: { id: p.id },
      data: { totalEarned: fromCents(newEarned), status },
    });
    p.totalEarned = fromCents(newEarned);
    p.status = status;
    remaining -= payCents;
    paid += payCents;
  }
  return paid;
}

/**
 * Fast-start bonus (owner, 2026-10-18; plan.ts FAST_START): counted from the member's own
 * activation (its joining date). 10 paid directs (sponsor tree) whose activation is within 3 days
 * = Rocket Start Bonus $100, else within 7 days = Fast Start Bonus $50. Only directs who paid AT OR
 * AFTER the member's own payment count (owner 2026-10-19: a member who stayed unpaid while 10 directs
 * paid under its link, then activated, got $100 at once). One bonus per member, paid the moment the
 * 10th direct is counted, inside the 25x cap. The company root earns nothing.
 */
async function awardFastStart(
  tx: Tx,
  userId: string,
): Promise<{ wallet: string; days: number; rewardUsd: number } | null> {
  const m = await tx.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true, packages: { orderBy: { createdAt: "asc" } } },
  });
  if (!m?.packages.length || isRootWallet(m.walletAddress)) return null;
  if (
    await tx.earning.findFirst({
      where: { recipientId: userId, type: EarningType.FAST_START_BONUS },
      select: { id: true },
    })
  )
    return null;
  // the clock starts when the member PAID on-chain (owner, 2026-10-18), not when the server recorded it
  const joinedAt = m.packages[0].paidAt ?? m.packages[0].createdAt;
  const joined = joinedAt.getTime();
  for (const tier of FAST_START) {
    const deadline = new Date(joined + tier.days * 86_400_000);
    const [row] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM users d
       CROSS JOIN LATERAL (
         SELECT MIN(COALESCE(p.paid_at, p.created_at)) AS at FROM packages p
          WHERE p.user_id = d.id AND p.counted_at IS NOT NULL
       ) f
       WHERE d.upline_id = ${userId}::uuid
         -- the columns hold UTC without a zone; AT TIME ZONE 'UTC' compares them right whatever the
         -- database TimeZone is (a local Postgres on Asia/Calcutta shifted them 5.5 hours)
         AND (f.at AT TIME ZONE 'UTC') >= ${joinedAt}
         AND (f.at AT TIME ZONE 'UTC') <= ${deadline}`;
    if (Number(row?.n ?? 0) < FAST_START_DIRECTS) continue;
    const paid = await creditIntoCap(tx, userId, m.packages, toCents(tier.rewardUsd), {
      sourceId: userId,
      type: EarningType.FAST_START_BONUS,
      level: tier.days,
    });
    return paid > 0
      ? { wallet: m.walletAddress, days: tier.days, rewardUsd: fromCents(paid) }
      : null;
  }
  return null;
}

/**
 * 20-level commissions for one package. Each upline is paid only if the level is unlocked by
 * its directs and it has an ACTIVE package. The share fills its OLDEST active package first;
 * when that one reaches its 25x cap it becomes CAPPED and the rest spills into the next active
 * package (a top-up waiting in line). Unpaid shares stay with the company.
 */
async function payCommissions(
  tx: Tx,
  sourceUserId: string,
  amountCents: number,
  chain: Array<{ id: string; depth: number }>,
) {
  const commissions: Commission[] = [];
  const skipped: Skipped[] = [];
  const top = chain.slice(0, LEVELS.length);
  const uplines = await tx.user.findMany({
    where: { id: { in: top.map((c) => c.id) } },
    select: {
      id: true,
      walletAddress: true,
      activeDirectsCount: true,
      _count: { select: { packages: true } },
      packages: { where: { status: PackageStatus.ACTIVE }, orderBy: { createdAt: "asc" } },
    },
  });
  const byId = new Map(uplines.map((u) => [u.id, u]));
  for (const { id, depth } of top) {
    const upline = byId.get(id);
    if (!upline) continue;
    const level = depth;
    if (!upline._count.packages) {
      skipped.push({ level, wallet: upline.walletAddress, reason: "no_package" });
      continue;
    }
    if (!upline.packages.length) {
      skipped.push({ level, wallet: upline.walletAddress, reason: "capped" });
      continue;
    }
    if (!isLevelUnlocked(level, upline.activeDirectsCount)) {
      skipped.push({ level, wallet: upline.walletAddress, reason: "level_locked" });
      continue;
    }

    const share = Math.round((amountCents * LEVELS[level - 1].pct) / 100);
    const paid = await creditIntoCap(tx, upline.id, upline.packages, share, {
      sourceId: sourceUserId,
      type: EarningType.LEVEL_COMMISSION,
      level,
      percentage: LEVELS[level - 1].pct,
    });
    if (paid > 0)
      commissions.push({ level, wallet: upline.walletAddress, amountUsd: fromCents(paid) });
    else skipped.push({ level, wallet: upline.walletAddress, reason: "capped" });
  }
  return { commissions, skipped };
}

export type PlanBatch = {
  busy: boolean;
  processed: number;
  events: Array<{
    packageId: string;
    wallet: string;
    commissions: Commission[];
    skipped: Skipped[];
  }>;
  rankUps: RankUp[];
  /** fast-start bonuses paid in this batch (awardFastStart) */
  bonuses: Array<{ wallet: string; days: number; rewardUsd: number }>;
};

/**
 * The plan queue: takes up to `limit` unprocessed payments, oldest first, and for each one
 *  1. the sponsor gains an active direct (activations only; before commissions, so it can
 *     unlock their next level, exactly as when the payment arrived)
 *  2. 20-level commissions up the SPONSOR tree (payCommissions)
 *  3. +1 DAO on the matching side of every member above it in the PLACEMENT tree, summed over
 *     the batch and written once per member
 * then re-checks the ranks of every member touched. Runs under the plan lock (one runner across
 * all API copies and the worker); `lock: false` only inside the plan self-test's own transaction.
 */
export async function processPlanEvents(
  tx: Tx,
  { limit = 100, lock = true } = {},
): Promise<PlanBatch> {
  const batch: PlanBatch = { busy: false, processed: 0, events: [], rankUps: [], bonuses: [] };
  if (lock && !(await tryLockPlan(tx))) return { ...batch, busy: true };
  const events = await tx.planEvent.findMany({
    where: { processedAt: null },
    orderBy: { id: "asc" },
    take: limit,
  });
  if (!events.length) return batch;

  const volume: SideVolume = new Map();
  const now = new Date();
  for (const ev of events) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: ev.userId },
      select: { walletAddress: true },
    });
    const chain = await ancestorsOf(tx, ev.userId);
    if (ev.isActivation && chain.length) {
      await tx.user.update({
        where: { id: chain[0].id },
        data: { activeDirectsCount: { increment: 1 } },
      });
    }
    const paid = chain.length
      ? await payCommissions(tx, ev.userId, ev.amountCents, chain)
      : { commissions: [], skipped: [] };
    for (const a of await placementAncestorsOf(tx, ev.userId)) addTo(volume, a.id, a.side, 1);
    await tx.package.update({ where: { id: ev.packageId }, data: { countedAt: now } });
    await tx.planEvent.update({ where: { id: ev.id }, data: { processedAt: now } });
    batch.events.push({ packageId: ev.packageId, wallet: user.walletAddress, ...paid });
    // fast-start bonus: the sponsor may just have reached 10 paid directs; a member activating after
    // its directs did may already have them
    if (ev.isActivation) {
      for (const id of [chain[0]?.id, ev.userId]) {
        const bonus = id ? await awardFastStart(tx, id) : null;
        if (bonus) batch.bonuses.push(bonus);
      }
    }
  }
  await addSideVolume(tx, volume);
  batch.rankUps = await recomputeRanks(tx, [...volume.keys()]);
  batch.processed = events.length;
  return batch;
}

export type TopUpInput = {
  walletAddress: string; // lowercase
  transactionHash: string;
  amountUsd: number;
  /** block time of the on-chain payment (event timestamp); empty = now */
  paidAt?: Date;
};

/**
 * Re-entry (owner, 2026-10-10): a verified on-chain ToppedUp adds a NEW package to an activated
 * member, with its own 25x cap. Same ID, same sponsor and placement; the sponsor gains no new
 * direct (already counted). The plan queue pays the sponsors the 20 levels again and adds 1 DAO
 * to the matching side of every placement upline. Commissions keep filling the oldest active package first. Idempotent per
 * transaction hash. Must run inside a serializable transaction.
 */
export async function processTopUp(tx: Tx, input: TopUpInput): Promise<ActivationResult> {
  const { walletAddress, transactionHash, amountUsd } = input;
  const byHash = await tx.package.findUnique({
    where: { activationTxHash: transactionHash },
    include: { user: true },
  });
  if (byHash) {
    if (byHash.user.walletAddress !== walletAddress)
      throw httpError("Transaction belongs to another wallet.", 409);
    return {
      walletAddress,
      referralCode: byHash.user.referralCode,
      transactionHash,
      status: byHash.status,
      alreadyProcessed: true,
      sponsorLinked: Boolean(byHash.user.uplineId),
      queued: false,
      commissions: [],
      skipped: [],
      rankUps: [],
    };
  }
  const user = await tx.user.findUnique({
    where: { walletAddress },
    include: { _count: { select: { packages: true } } },
  });
  if (!user || user._count.packages === 0)
    throw httpError("Activate the wallet before a top-up.", 409);

  const pkg = await queuePackage(tx, user.id, amountUsd, transactionHash, false, input.paidAt);
  return {
    walletAddress,
    referralCode: user.referralCode,
    transactionHash,
    status: pkg.status,
    alreadyProcessed: false,
    sponsorLinked: Boolean(user.uplineId),
    queued: true,
    commissions: [],
    skipped: [],
    rankUps: [],
  };
}
