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

/** 11 rank tiers: required team volume in DAO (1 DAO = 1 activated package) and the one-time reward in USD. */
export const RANKS = [
  { rank: 1, name: "Starter", volume: 25, rewardUsd: 100 },
  { rank: 2, name: "Builder", volume: 50, rewardUsd: 250 },
  { rank: 3, name: "Leader", volume: 100, rewardUsd: 500 },
  { rank: 4, name: "Elite Leader", volume: 200, rewardUsd: 1_000 },
  { rank: 5, name: "Executive", volume: 350, rewardUsd: 2_500 },
  { rank: 6, name: "Crown Executive", volume: 1_000, rewardUsd: 5_000 },
  { rank: 7, name: "Crown Director", volume: 3_000, rewardUsd: 10_000 },
  { rank: 8, name: "Ambassador", volume: 7_000, rewardUsd: 20_000 },
  { rank: 9, name: "Crown Ambassador", volume: 10_000, rewardUsd: 30_000 },
  { rank: 10, name: "President", volume: 20_000, rewardUsd: 50_000 },
  { rank: 11, name: "Crown President", volume: 50_000, rewardUsd: 100_000 },
] as const;

export const CAP_MULTIPLIER = 10;

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
 * 50:50 rule: for a tier needing V, at most V/2 may come from the power leg and the
 * rest from the other legs combined. Returns the highest tier reached (0 = none).
 */
export function rankForLegs({ power, other }: LegSummary): number {
  let reached = 0;
  for (const tier of RANKS) {
    const counted = Math.min(power, tier.volume / 2) + other;
    if (counted >= tier.volume) reached = tier.rank;
  }
  return reached;
}

/** Withdrawal fee split, in cents. */
export function withdrawalSplit(grossCents: number, feePercent: number) {
  const feeCents = Math.round((grossCents * feePercent) / 100);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}
