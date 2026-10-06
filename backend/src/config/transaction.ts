import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient;

/**
 * Runs `fn` in a SERIALIZABLE transaction and retries when Postgres reports a
 * serialization conflict. Money-moving writes (commissions, cap, ranks, withdrawals)
 * go through here, so two requests touching the same upline or balance can never
 * both read the old value and double-pay.
 */
export async function serializable<T>(fn: (tx: Tx) => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const conflict = code === "P2034" || /could not serialize|40001/i.test(String((error as Error)?.message));
      if (!conflict || attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.random() * 60));
    }
  }
}
