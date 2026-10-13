/**
 * Watch job (owner, 2026-10-13: monitoring). Every few minutes it checks what would hurt members
 * and writes an [alert] line to the server log (config/alerts.ts) before members complain:
 *   database reachable · plan queue not stuck · payout contract not paused, float above
 *   PAYOUT_FLOAT_ALERT_USD, still trusting our signer · chain indexer keeping up (worker only)
 * Runs in the worker (Docker) and, when there is no worker (Render: no REDIS_URL), in the API.
 * Each problem alerts once per ALERT_REPEAT_MINUTES; a fix is reported once ("back to normal").
 */
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { alert } from "../config/alerts.js";
import { planQueueBacklog } from "../modules/activation/planQueue.js";
import { payoutContractStatus, signerMatchesContract } from "../modules/withdrawals/payout.js";

const problems = new Set<string>();
function report(key: string, bad: boolean, level: "critical" | "warning", message: string) {
  if (bad) { problems.add(key); alert(level, `watch-${key}`, message); return; }
  if (problems.delete(key)) alert("info", `watch-${key}-ok-${Date.now()}`, `Back to normal: ${key}.`);
}

export async function runWatch({ indexer = false } = {}): Promise<{ problems: string[] }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    report("database", false, "critical", "");
  } catch (error) {
    report("database", true, "critical", `Database unreachable: ${(error as Error).message.slice(0, 160)}. The site cannot record payments.`);
    return { problems: [...problems] };
  }

  const q = await planQueueBacklog();
  report("plan-queue", q.oldestSeconds > 300, q.oldestSeconds > 900 ? "critical" : "warning",
    `Plan queue is behind: ${q.waiting} payments waiting, the oldest for ${Math.round(q.oldestSeconds / 60)} min. Commissions are delayed (nothing is lost).`);

  const payout = await payoutContractStatus();
  if (payout) {
    if ("error" in payout && payout.error) {
      report("payout-contract", true, "warning", "Payout contract could not be read (RPC down?). Withdrawals may fail.");
    } else {
      report("payout-contract", false, "warning", "");
      report("payout-paused", Boolean(payout.paused), "warning", "Payout contract is PAUSED: no member can withdraw until setPaused(false).");
      const float = payout.floatUsd ?? 0;
      report("payout-float", float < env.PAYOUT_FLOAT_ALERT_USD, float < 50 ? "critical" : "warning",
        `Payout float is low: $${float.toFixed(2)} left (alert below $${env.PAYOUT_FLOAT_ALERT_USD}). Send USDT from the treasury to the payout contract.`);
    }
    const signer = await signerMatchesContract();
    if (signer) {
      report("payout-signer", !signer.ok, "critical",
        `Payout contract trusts ${signer.contractSigner.slice(0, 8)}… but this server signs as ${signer.ourSigner.slice(0, 8)}…: every withdrawal is refused.`);
    }
  }

  if (indexer && env.PAYMENT_CONTRACT_ADDRESS) {
    const cursor = await prisma.chainCursor.findUnique({ where: { name: "payment-contract" } });
    const staleMin = cursor ? (Date.now() - cursor.updatedAt.getTime()) / 60_000 : 0;
    report("chain-indexer", staleMin > 10, "warning",
      `Chain indexer has not moved for ${Math.round(staleMin)} min (RPC limit or error). Payments reported by the website still work.`);
  }
  return { problems: [...problems] };
}
