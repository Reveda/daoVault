/**
 * DAOvault compensation plan (project.md §2). Pure data + math, no database, so it can
 * be unit-checked and shared by the activation, dashboard and admin modules.
 */

/** 20-level income matrix: % of the $300 package and the active directs needed to unlock the level. */
export const LEVELS = [
  { level: 1, pct: 10, reqDirects: 0 },
  { level: 2, pct: 5, reqDirects: 2 },
  { level: 3, pct: 3, reqDirects: 3 },
  { level: 4, pct: 3, reqDirects: 5 },
  { level: 5, pct: 2, reqDirects: 7 },
  { level: 6, pct: 2, reqDirects: 9 },
  { level: 7, pct: 2, reqDirects: 10 },
  ...Array.from({ length: 13 }, (_, i) => ({ level: 8 + i, pct: 1, reqDirects: 15 })),
] as const;

/** 11 rank tiers (marketing plan, owner 2026-10-09): DAO matching needed on EACH side (power leg and other legs; 1 DAO = 1 activated package) and the one-time reward in USD. */
export const RANKS = [
  { rank: 1, name: "Starter", volume: 25, rewardUsd: 150 },
  { rank: 2, name: "Builder", volume: 50, rewardUsd: 300 },
  { rank: 3, name: "Leader", volume: 100, rewardUsd: 500 },
  { rank: 4, name: "Elite Leader", volume: 200, rewardUsd: 1_200 },
  { rank: 5, name: "Executive", volume: 375, rewardUsd: 2_500 }, // owner, 2026-10-09: 375 per side (plan image said 350)
  { rank: 6, name: "Crown Executive", volume: 1_000, rewardUsd: 7_500 },
  { rank: 7, name: "Crown Director", volume: 3_000, rewardUsd: 15_000 },
  { rank: 8, name: "Ambassador", volume: 7_000, rewardUsd: 30_000 },
  { rank: 9, name: "Crown Ambassador", volume: 12_000, rewardUsd: 50_000 },
  { rank: 10, name: "President", volume: 20_000, rewardUsd: 75_000 },
  { rank: 11, name: "Crown President", volume: 50_000, rewardUsd: 200_000 },
] as const;

/** Level income cap per package: 25x ($7,500 on $300); owner 2026-10-09, was 10x. Rank rewards sit outside it. */
export const CAP_MULTIPLIER = 25;

/** Is `level` (1-based) open for a member with `activeDirects`? */
export const isLevelUnlocked = (level: number, activeDirects: number): boolean =>
  activeDirects >= (LEVELS[level - 1]?.reqDirects ?? Infinity);

export const unlockedLevels = (activeDirects: number): number =>
  LEVELS.filter((l) => activeDirects >= l.reqDirects).length;

/** Money is kept in whole cents to avoid float drift. */
export const toCents = (usd: number | string): number => Math.round(Number(usd) * 100);
export const fromCents = (cents: number): number => cents / 100;

export type LegSummary = { total: number; power: number; other: number };

/** `legs` = volume of each direct's leg (that direct's own package + everything below it). */
export function summarizeLegs(legs: number[]): LegSummary {
  const total = legs.reduce((s, v) => s + v, 0);
  const power = legs.length ? Math.max(...legs) : 0;
  return { total, power, other: total - power };
}

/**
 * DAO matching volume: the smaller of the two sides, the power leg (strongest direct
 * leg) and all other legs combined. A tier's DAO must be matched on BOTH sides.
 */
export function matchedVolume({ power, other }: LegSummary): number {
  return Math.min(power, other);
}

/**
 * Rank rule (owner, 2026-10-08): the plan's "DAO matching" is per side. A tier needing V
 * is reached when the power leg has at least V AND the other legs combined have at least
 * V (Starter 25 DAO = 25 + 25). Replaces the earlier split rule (V/2 + V/2).
 * Returns the highest tier reached (0 = none).
 */
export function rankForLegs(legs: LegSummary): number {
  const matched = matchedVolume(legs);
  let reached = 0;
  for (const tier of RANKS) {
    if (matched >= tier.volume) reached = tier.rank;
  }
  return reached;
}

/** Withdrawal fee split, in cents. */
export function withdrawalSplit(grossCents: number, feePercent: number) {
  const feeCents = Math.round((grossCents * feePercent) / 100);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}
