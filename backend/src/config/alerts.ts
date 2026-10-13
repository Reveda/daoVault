/**
 * Problem log for the owner (owner, 2026-10-13: monitoring; Telegram removed the same day at the
 * owner's request: nothing leaves the server). alert() writes one clear line to the server log
 * (Render: Logs tab; VPS: docker compose logs), searchable by "[alert]".
 *  - the same `key` is written at most once per ALERT_REPEAT_MINUTES (default 15): an error storm
 *    becomes one line, not thousands
 *  - lines never carry secrets, tokens, keys or full wallet addresses
 */
import { env } from "./env.js";

type Level = "critical" | "warning" | "info";
const lastSent = new Map<string, number>();

/** 0x4c85…0540: enough to recognise a wallet in a log line */
export const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

export function alert(level: Level, key: string, message: string): void {
  const now = Date.now();
  const last = lastSent.get(key) ?? 0;
  if (now - last < env.ALERT_REPEAT_MINUTES * 60_000) return;
  lastSent.set(key, now);
  if (lastSent.size > 1_000) lastSent.clear();
  (level === "info" ? console.log : console.error)(`[alert] ${level.toUpperCase()} ${message}`);
}
