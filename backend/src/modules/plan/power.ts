/**
 * Power Business in the rank (owner, 2026-10-19). A record (power_businesses, $300 = 1 DAO) is business
 * given to one member on one of its sides. It counts for rank and rank rewards ONLY (never level income:
 * it is no payment) for that member AND every member above it in the PLACEMENT tree, on the side where
 * the member sits under each of them, exactly like real business. It is never written into
 * left_volume / right_volume (those stay real payments only): it is added when ranks are computed.
 *
 * Safety rule: for any member, power counts on ONE side only (the side where the most power arrives);
 * the other side must be real business. So power alone, even on both sides, never makes a rank out of
 * nothing, and every rank reward needs real payments on the other side.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { toCents } from "./plan.js";

type Db = Prisma.TransactionClient | PrismaClient;

/** power (cents) arriving on each side of a member: its own records + everything below it */
export type PowerIn = { left: number; right: number };

/**
 * Power arriving at members: walks up the placement tree from every record's owner. Only the few
 * members holding power and their uplines appear. `ids` filters the result (all when omitted).
 */
export async function powerArriving(db: Db, ids?: string[]): Promise<Map<string, PowerIn>> {
  if (ids && !ids.length) return new Map();
  const rows = await db.$queryRaw<Array<{ id: string; left_power: string; right_power: string }>>`
    WITH RECURSIVE up(member, side, amount, depth) AS (
      SELECT user_id, side::text, amount_usd, 0 FROM power_businesses
      UNION ALL
      SELECT u.placement_id, u.placement_side::text, up.amount, up.depth + 1
        FROM up JOIN users u ON u.id = up.member
       WHERE u.placement_id IS NOT NULL AND up.depth < 1000000
    )
    SELECT member::text AS id,
           COALESCE(SUM(amount) FILTER (WHERE side = 'LEFT'), 0)::text AS left_power,
           COALESCE(SUM(amount) FILTER (WHERE side = 'RIGHT'), 0)::text AS right_power
      FROM up
     ${ids ? Prisma.sql`WHERE member = ANY(${ids}::uuid[])` : Prisma.empty}
     GROUP BY member`;
  return new Map(
    rows.map((r) => [r.id, { left: toCents(r.left_power), right: toCents(r.right_power) }]),
  );
}

/**
 * The member's Left / Right DAO for the rank: real business + power on ONE side only (the side with
 * the most power; whole DAO only).
 */
export function legsWithPower(left: number, right: number, power?: PowerIn): [number, number] {
  if (!power) return [left, right];
  const daoCents = toCents(env.ACTIVATION_AMOUNT_USDT);
  if (power.left >= power.right) return [left + Math.floor(power.left / daoCents), right];
  return [left, right + Math.floor(power.right / daoCents)];
}
