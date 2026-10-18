import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient;

/**
 * Runs `fn` in a SERIALIZABLE transaction and retries when Postgres reports a
 * serialization conflict. Money-moving writes (commissions, cap, ranks, withdrawals)
 * go through here, so two requests touching the same upline or balance can never
 * both read the old value and double-pay.
 */
export async function serializable<T>(fn: (tx: Tx) => Promise<T>, attempts = 10): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const conflict =
        code === "P2034" || /could not serialize|40001/i.test(String((error as Error)?.message));
      if (!conflict || attempt >= attempts) throw error;
      // exponential backoff with jitter (launch bursts: many requests retrying at once must spread out)
      const base = Math.min(2_000, 25 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, base / 2 + Math.random() * base));
    }
  }
}
