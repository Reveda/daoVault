/**
 * Runs the plan queue (activation.engine processPlanEvents) until it is empty.
 *  - kickPlanQueue(): right after a payment is recorded (the member's dashboard shows the new
 *    income a moment later); a second kick while one runs makes it loop once more
 *  - startPlanQueueTimer(): every API copy and the worker sweep every few seconds, so nothing
 *    waits for long even if a kick was missed (Render has no worker: the API does it alone)
 * Only one runner works at a time anywhere (Postgres advisory lock); the others return at once.
 */
import { prisma } from "../../config/prisma.js";
import { alert } from "../../config/alerts.js";
import { processPlanEvents } from "./activation.engine.js";

const BATCH = 100;
let running: Promise<number> | null = null;
let again = false;

async function drain(): Promise<number> {
  let total = 0;
  for (let round = 0; round < 500; round++) {
    const batch = await prisma.$transaction((tx) => processPlanEvents(tx, { limit: BATCH }), { maxWait: 10_000, timeout: 120_000 });
    if (batch.busy) return total; // another copy is draining: it will finish the queue
    total += batch.processed;
    for (const r of batch.rankUps) {
      if (r.rewardUsd > 0) console.log(`[plan] rank ${r.from} -> ${r.to} for ${r.wallet.slice(0, 8)}…, reward $${r.rewardUsd}`);
    }
    if (batch.processed < BATCH) return total;
  }
  return total;
}

/** Processes every queued payment now (resolves with how many this copy processed). Never throws. */
export function kickPlanQueue(): Promise<number> {
  if (running) { again = true; return running; }
  running = (async () => {
    let total = 0;
    try {
      do { again = false; total += await drain(); } while (again);
    } catch (error) {
      alert("critical", "plan-queue", `Plan queue failed: ${(error as Error).message.slice(0, 300)}. Payments are recorded; commissions wait until it runs again.`);
    } finally {
      running = null;
    }
    return total;
  })();
  return running;
}

let timer: NodeJS.Timeout | null = null;
export function startPlanQueueTimer(everyMs = 5_000): void {
  if (timer) return;
  timer = setInterval(() => void kickPlanQueue(), everyMs);
  timer.unref();
  void kickPlanQueue();
}

export function stopPlanQueueTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/** queue health for the watch job: waiting payments and the oldest one's age */
export async function planQueueBacklog(): Promise<{ waiting: number; oldestSeconds: number }> {
  const [waiting, oldest] = await Promise.all([
    prisma.planEvent.count({ where: { processedAt: null } }),
    prisma.planEvent.findFirst({ where: { processedAt: null }, orderBy: { id: "asc" }, select: { createdAt: true } }),
  ]);
  return { waiting, oldestSeconds: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : 0 };
}
