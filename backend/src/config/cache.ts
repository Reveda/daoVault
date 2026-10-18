/**
 * Short cache for heavy read-only numbers (owner, 2026-10-13: big teams). The dashboard's member
 * counts walk a member's whole team; with 100k+ members that is too slow to repeat on every page
 * load, and the numbers need not be to the second. Shared through Redis when REDIS_URL is set
 * (every API copy sees one copy), else kept in this process (Render: one copy).
 * Never for money: balances and earnings are always read fresh.
 */
import { redis } from "./redis.js";

const local = new Map<string, { until: number; value: string }>();
const MAX_LOCAL = 5_000;

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const full = `dv:cache:${key}`;
  try {
    const hit = redis
      ? await redis.get(full)
      : (local.get(full)?.until ?? 0) > Date.now()
        ? local.get(full)!.value
        : null;
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* cache down: just load */
  }
  const value = await load();
  const text = JSON.stringify(value);
  try {
    if (redis) await redis.set(full, text, { EX: ttlSeconds });
    else {
      if (local.size >= MAX_LOCAL) local.clear();
      local.set(full, { until: Date.now() + ttlSeconds * 1000, value: text });
    }
  } catch {
    /* cache down: fine */
  }
  return value;
}
