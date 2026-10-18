import { Prisma, WithdrawalStatus, type Withdrawal } from "@prisma/client";
import { Contract, Interface, parseUnits } from "ethers";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { serializable } from "../../config/transaction.js";
import { alert } from "../../config/alerts.js";
import { isAdminWallet } from "../auth/auth.service.js";
import { fromCents, toCents, withdrawalSplit } from "../plan/plan.js";
import { chainProvider } from "../../config/rpc.js";
import {
  canPayInstantly,
  findClaimTx,
  instantPayoutsEnabled,
  isVoucherUsed,
  payoutContractStatus,
  signVoucher,
  verifyClaimTx,
} from "./payout.js";

type Tx = Prisma.TransactionClient;
const httpError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode });

/** Requests that still hold (or already used) part of the balance. */
const RESERVED: WithdrawalStatus[] = [
  WithdrawalStatus.PENDING,
  WithdrawalStatus.PROCESSING,
  WithdrawalStatus.COMPLETED,
];
const OPEN: WithdrawalStatus[] = [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING];
/** a voucher is treated as expired a little after its deadline (block time can lag) */
const EXPIRY_MARGIN_MS = 90_000;
/** a request whose voucher was never signed (crash between the two steps) is released after this */
const UNSIGNED_TTL_MS = 5 * 60_000;

/** a chain read can lag the newest block by a few seconds: settled vouchers this close are counted again */
const SNAPSHOT_LAG_MS = 60_000;

/**
 * Payout capacity already promised (owner review, 2026-10-14): the token amount of every voucher
 * handed out and not yet expired, plus requests being signed right now. A new voucher must fit in
 * the contract's float and daily limit MINUS this, so two members can never be promised the same
 * dollars (the second claim would fail on-chain and lock that balance until the voucher expires).
 * `chainReadAt` = when the float / daily numbers were read: a voucher claimed AND settled after
 * that is in neither the chain numbers nor the open list, so it is counted too (2nd review: the
 * chain read and this transaction are not atomic). Counting a voucher twice only errs on the
 * safe side (a request may wait a minute); counting it zero times could over-promise.
 */
export async function reservedPayout(tx: Tx, chainReadAt: Date = new Date()): Promise<bigint> {
  const now = Date.now();
  const rows = await tx.withdrawal.findMany({
    where: {
      voucherAmount: { not: null },
      OR: [
        {
          status: WithdrawalStatus.PROCESSING,
          voucherDeadline: { gt: new Date(now - EXPIRY_MARGIN_MS) },
        },
        {
          status: WithdrawalStatus.PENDING,
          voucherId: null,
          createdAt: { gt: new Date(now - UNSIGNED_TTL_MS) },
        },
        {
          status: WithdrawalStatus.COMPLETED,
          voucherId: { not: null },
          reviewedAt: { gte: new Date(chainReadAt.getTime() - SNAPSHOT_LAG_MS) },
        },
      ],
    },
    select: { voucherAmount: true },
  });
  return rows.reduce((sum, r) => sum + BigInt(r.voucherAmount!), 0n);
}

/** releases requests whose voucher was never signed (the API stopped between the two steps) */
const releaseUnsigned = (where: Prisma.WithdrawalWhereInput = {}) =>
  prisma.withdrawal.updateMany({
    where: {
      ...where,
      status: WithdrawalStatus.PENDING,
      voucherId: null,
      voucherAmount: { not: null },
      createdAt: { lt: new Date(Date.now() - UNSIGNED_TTL_MS) },
    },
    data: {
      status: WithdrawalStatus.REJECTED,
      rejectReason: "Could not prepare the payout. The amount is back in your balance.",
      reviewedAt: new Date(),
    },
  });

/** Withdrawable = every earning (level commissions + rank rewards) minus requests not rejected. In cents. */
export async function balanceOf(db: Tx | typeof prisma, userId: string) {
  const [earned, reserved, paid] = await Promise.all([
    db.earning.aggregate({ where: { recipientId: userId }, _sum: { amountUsd: true } }),
    db.withdrawal.aggregate({
      where: { userId, status: { in: RESERVED } },
      _sum: { grossAmount: true },
    }),
    db.withdrawal.aggregate({
      where: { userId, status: WithdrawalStatus.COMPLETED },
      _sum: { grossAmount: true },
    }),
  ]);
  const earnedCents = toCents(earned._sum.amountUsd?.toString() ?? 0);
  const reservedCents = toCents(reserved._sum.grossAmount?.toString() ?? 0);
  return {
    earnedCents,
    withdrawnCents: toCents(paid._sum.grossAmount?.toString() ?? 0),
    pendingCents: reservedCents - toCents(paid._sum.grossAmount?.toString() ?? 0),
    availableCents: Math.max(0, earnedCents - reservedCents),
  };
}

const voucherOf = (w: Withdrawal) =>
  w.status === WithdrawalStatus.PROCESSING &&
  w.voucherId &&
  w.voucherAmount &&
  w.voucherSignature &&
  w.voucherDeadline &&
  w.voucherDeadline.getTime() > Date.now()
    ? {
        contract: env.PAYOUT_CONTRACT_ADDRESS ?? "",
        id: w.voucherId,
        amount: w.voucherAmount,
        deadline: Math.floor(w.voucherDeadline.getTime() / 1000),
        signature: w.voucherSignature,
      }
    : null;

const view = (w: Withdrawal) => ({
  id: w.id,
  grossUsd: Number(w.grossAmount),
  feeUsd: Number(w.feeAmount),
  netUsd: Number(w.netAmount),
  destinationWallet: w.destinationWallet,
  status: w.status,
  instant: Boolean(w.voucherId),
  voucher: voucherOf(w),
  payoutTxHash: w.payoutTxHash,
  rejectReason: w.rejectReason,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

export class WithdrawalsService {
  /**
   * Settles this member's open instant vouchers against the chain: claimed ones become
   * COMPLETED; expired unclaimed ones are released back to the balance (REJECTED).
   * Released only after the deadline has passed, so a voucher can never be paid twice.
   */
  private async reconcile(userId: string) {
    // first, even with instant payouts switched off: an unsigned request must never stay stuck
    await releaseUnsigned({ userId });
    if (!instantPayoutsEnabled()) return;
    const open = await prisma.withdrawal.findMany({
      where: { userId, status: WithdrawalStatus.PROCESSING, voucherId: { not: null } },
    });
    for (const w of open) {
      try {
        if (await isVoucherUsed(w.voucherId!)) {
          const tx = await findClaimTx(w.voucherId!);
          await prisma.withdrawal.updateMany({
            where: { id: w.id, status: WithdrawalStatus.PROCESSING },
            data: {
              status: WithdrawalStatus.COMPLETED,
              payoutTxHash: tx?.toLowerCase() ?? null,
              reviewedAt: new Date(),
            },
          });
        } else if (
          w.voucherDeadline &&
          w.voucherDeadline.getTime() + EXPIRY_MARGIN_MS < Date.now()
        ) {
          await prisma.withdrawal.updateMany({
            where: { id: w.id, status: WithdrawalStatus.PROCESSING },
            data: {
              status: WithdrawalStatus.REJECTED,
              rejectReason: "Not claimed in time. The amount is back in your balance.",
              reviewedAt: new Date(),
            },
          });
        }
      } catch (error) {
        console.warn("[withdrawals] reconcile failed for", w.id, error);
      }
    }
  }

  /** Background worker: settle every member's open instant vouchers (claimed or expired). */
  async reconcileAllOpen(): Promise<number> {
    await releaseUnsigned();
    if (!instantPayoutsEnabled()) return 0;
    const users = await prisma.withdrawal.findMany({
      where: { status: WithdrawalStatus.PROCESSING, voucherId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    });
    for (const { userId } of users) await this.reconcile(userId);
    return users.length;
  }

  async summary(wallet: string) {
    const user = await prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (!user) throw httpError("No activated account for this wallet.", 404);
    await this.reconcile(user.id);
    const [balance, items] = await Promise.all([
      balanceOf(prisma, user.id),
      prisma.withdrawal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      availableUsd: fromCents(balance.availableCents),
      pendingUsd: fromCents(balance.pendingCents),
      withdrawnUsd: fromCents(balance.withdrawnCents),
      feePercent: env.WITHDRAWAL_FEE_PERCENT,
      minimumUsd: env.WITHDRAWAL_MIN_USD,
      instant: instantPayoutsEnabled(),
      items: items.map((w) => view(w)),
    };
  }

  /**
   * Member request. Destination is always the signed-in wallet; the amount is checked server-side.
   * Every request is instant (owner, 2026-10-13: no admin review): it gets a signed voucher the
   * member claims at once. When the payout contract can't pay it right now, the member gets a
   * clear message and nothing is created (the balance stays untouched).
   */
  async request(wallet: string, amountUsd: number) {
    const grossCents = toCents(amountUsd);
    // the admin / company wallet never withdraws member payouts (owner, 2026-10-15)
    if (isAdminWallet(wallet)) throw httpError("Admin wallets cannot request withdrawals.", 403);
    if (grossCents < toCents(env.WITHDRAWAL_MIN_USD))
      throw httpError(`Minimum withdrawal is $${env.WITHDRAWAL_MIN_USD}.`, 400);
    if (!instantPayoutsEnabled())
      throw httpError("Withdrawals are not open yet. Please try again later.", 503);
    const pre = await prisma.user.findUnique({
      where: { walletAddress: wallet },
      select: { id: true },
    });
    if (pre) await this.reconcile(pre.id);

    // limits, float and signer are checked before anything is reserved
    const netCents = withdrawalSplit(grossCents, env.WITHDRAWAL_FEE_PERCENT).netCents;
    const check = await canPayInstantly(Number(fromCents(netCents))).catch((error) => {
      console.error("[withdrawals] payout check failed:", error);
      alert(
        "critical",
        "payout-check",
        `Withdrawals blocked: the payout contract could not be read (${String((error as Error)?.message ?? error).slice(0, 160)}).`,
      );
      throw httpError(
        "Withdrawals are not available right now. Please try again in a few minutes.",
        503,
      );
    });
    if (!check.ok) throw httpError(check.message, check.status);

    // a refusal from the reservation is re-checked once after settling claimed vouchers: a voucher
    // claimed on-chain but not yet marked paid (browser closed, no worker on Render) is counted in
    // both the chain numbers and the open list until settled
    let settled = false;
    const create = () =>
      serializable(async (tx) => {
        const user = await tx.user.findUnique({ where: { walletAddress: wallet } });
        if (!user) throw httpError("No activated account for this wallet.", 404);
        const open = await tx.withdrawal.findFirst({
          where: { userId: user.id, status: { in: OPEN } },
          select: { id: true },
        });
        if (open) throw httpError("You already have a withdrawal in progress.", 409);
        const { availableCents } = await balanceOf(tx, user.id);
        if (grossCents > availableCents)
          throw httpError("Amount is more than your available balance.", 400);
        // reserve: this voucher + every one already handed out must fit the float and today's limit.
        // Serializable: two requests at the same moment cannot both see the old total.
        const reserved = await reservedPayout(tx, check.checkedAt);
        if (reserved + check.amount > check.dailyLeft) {
          if (settled)
            alert(
              "warning",
              "daily-reserved",
              "Today's payout limit is fully promised to open withdrawals: members are told to try tomorrow. Raise it with setLimits if this is expected.",
            );
          throw Object.assign(
            httpError("Today's withdrawal limit has been reached. Please try again tomorrow.", 503),
            { capacity: true },
          );
        }
        if (reserved + check.amount > check.float) {
          if (settled)
            alert(
              "warning",
              "float-reserved",
              "Payout float is fully promised to open withdrawals: new requests are refused until vouchers are claimed or the float is topped up.",
            );
          throw Object.assign(
            httpError("Withdrawals are being topped up. Please try again in a little while.", 503),
            { capacity: true },
          );
        }
        const split = withdrawalSplit(grossCents, env.WITHDRAWAL_FEE_PERCENT);
        return tx.withdrawal.create({
          data: {
            userId: user.id,
            grossAmount: fromCents(split.grossCents),
            feeAmount: fromCents(split.feeCents),
            netAmount: fromCents(split.netCents),
            destinationWallet: wallet,
            voucherAmount: check.amount.toString(), // the reservation, until the voucher is signed
          },
        });
      });
    const created = await create().catch(async (error) => {
      if (!(error as { capacity?: boolean })?.capacity) throw error;
      await this.reconcileAllOpen().catch(() => 0);
      settled = true;
      return create();
    });

    try {
      const voucher = await signVoucher(wallet, created.id, check.amount);
      const updated = await prisma.withdrawal.update({
        where: { id: created.id },
        data: {
          status: WithdrawalStatus.PROCESSING,
          voucherId: voucher.id,
          voucherAmount: voucher.amount,
          voucherDeadline: new Date(voucher.deadline * 1000),
          voucherSignature: voucher.signature,
        },
      });
      return view(updated);
    } catch (error) {
      // no voucher exists, so nothing can be paid: release the amount back to the balance at once
      console.error("[withdrawals] voucher signing failed:", error);
      alert(
        "critical",
        "voucher-signing",
        `Withdrawals blocked: the signer did not sign (${String((error as Error)?.message ?? error).slice(0, 160)}). Check the signer container.`,
      );
      await prisma.withdrawal.updateMany({
        where: { id: created.id, status: WithdrawalStatus.PENDING },
        data: {
          status: WithdrawalStatus.REJECTED,
          rejectReason: "Could not prepare the payout. The amount is back in your balance.",
          reviewedAt: new Date(),
        },
      });
      throw httpError(
        "Withdrawals are not available right now. Please try again in a few minutes.",
        503,
      );
    }
  }

  /** The member's wallet claimed the voucher: verify the Claimed event on-chain and mark it paid. */
  async confirm(wallet: string, withdrawalId: string, txHash: string) {
    const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w || w.destinationWallet !== wallet) throw httpError("Withdrawal not found.", 404);
    if (w.status === WithdrawalStatus.COMPLETED) return view(w);
    if (!w.voucherId || !w.voucherAmount || w.status !== WithdrawalStatus.PROCESSING)
      throw httpError("This withdrawal has no open instant payout.", 409);
    if (!(await verifyClaimTx(txHash, w.voucherId, wallet, w.voucherAmount))) {
      throw httpError("That transaction is not the payout for this withdrawal.", 400);
    }
    try {
      // guarded on PROCESSING: the worker may settle the same claim at the same moment
      await prisma.withdrawal.updateMany({
        where: { id: w.id, status: WithdrawalStatus.PROCESSING },
        data: {
          status: WithdrawalStatus.COMPLETED,
          payoutTxHash: txHash.toLowerCase(),
          reviewedAt: new Date(),
        },
      });
      return view(await prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } }));
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002")
        throw httpError("That transaction is already recorded.", 409);
      throw error;
    }
  }

  // ── admin ────────────────────────────────────────────────────────────

  /** Admin queue, 20 per page. Open requests oldest first (first come, first served); paid and rejected newest first. */
  /** admin list: by status, optionally only requests from the last 7 / 30 days, with the period's totals */
  async list(status?: WithdrawalStatus, page = 1, period: "all" | "week" | "month" = "all") {
    const pageSize = 20;
    const since =
      period === "all" ? null : new Date(Date.now() - (period === "week" ? 7 : 30) * 86_400_000);
    const where: Prisma.WithdrawalWhereInput = {
      ...(status ? { status } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    };
    const open = status === "PENDING" || status === "PROCESSING";
    const [total, sums, items] = await Promise.all([
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.aggregate({ where, _sum: { grossAmount: true, netAmount: true } }),
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: open ? "asc" : "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { walletAddress: true, referralCode: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      period,
      grossUsd: fromCents(toCents(sums._sum.grossAmount?.toString() ?? 0)),
      netUsd: fromCents(toCents(sums._sum.netAmount?.toString() ?? 0)),
      items: items.map((w) => ({ ...view(w), voucher: null, referralCode: w.user.referralCode })),
    };
  }

  private async transition(
    id: string,
    from: WithdrawalStatus[],
    data: Prisma.WithdrawalUpdateInput,
  ) {
    return serializable(async (tx) => {
      const current = await tx.withdrawal.findUnique({ where: { id } });
      if (!current) throw httpError("Withdrawal not found.", 404);
      // voucherAmount without voucherId = an instant request being signed right now (never an admin case)
      if (current.voucherId || current.voucherAmount)
        throw httpError("Instant withdrawal: the payout contract handles it automatically.", 409);
      if (!from.includes(current.status))
        throw httpError(`Withdrawal is ${current.status.toLowerCase()}.`, 409);
      return view(await tx.withdrawal.update({ where: { id }, data }));
    });
  }

  approve(id: string, admin: string) {
    return this.transition(id, [WithdrawalStatus.PENDING], {
      status: WithdrawalStatus.PROCESSING,
      reviewedBy: admin,
      reviewedAt: new Date(),
    });
  }

  /** Rejecting releases the reserved amount back to the member's balance. */
  reject(id: string, admin: string, reason: string) {
    return this.transition(id, OPEN, {
      status: WithdrawalStatus.REJECTED,
      reviewedBy: admin,
      reviewedAt: new Date(),
      rejectReason: reason,
    });
  }

  /**
   * Admin-reviewed requests: the admin pays from the treasury wallet (e.g. MetaMask) and
   * submits the tx hash. It is accepted only if that tx moved exactly the net USDT to the member.
   */
  async complete(id: string, admin: string, payoutTxHash: string) {
    if (!env.USDT_CONTRACT_ADDRESS)
      throw httpError("The USDT token is not set up on the server yet.", 503);
    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw httpError("Withdrawal not found.", 404);
    if (w.voucherId || w.voucherAmount)
      throw httpError("Instant withdrawal: the payout contract handles it automatically.", 409);
    if (w.status !== WithdrawalStatus.PROCESSING)
      throw httpError("Approve the withdrawal before marking it paid.", 409);

    const provider = chainProvider();
    const receipt = await provider.getTransactionReceipt(payoutTxHash);
    if (!receipt || receipt.status !== 1)
      throw httpError("Payout transaction is missing or failed.", 400);
    const usdt = env.USDT_CONTRACT_ADDRESS.toLowerCase();
    const decimals = Number(
      await new Contract(usdt, ["function decimals() view returns (uint8)"], provider).decimals(),
    );
    const expected = parseUnits(Number(w.netAmount).toFixed(2), decimals);
    const erc20 = new Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    ]);
    const match = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== usdt) return false;
      const parsed = (() => {
        try {
          return erc20.parseLog(log);
        } catch {
          return null;
        }
      })();
      if (!parsed || parsed.name !== "Transfer") return false;
      const [from, to, value] = parsed.args as unknown as [string, string, bigint];
      const fromOk =
        !env.COMPANY_WALLET_ADDRESS ||
        from.toLowerCase() === env.COMPANY_WALLET_ADDRESS.toLowerCase();
      return fromOk && to.toLowerCase() === w.destinationWallet.toLowerCase() && value === expected;
    });
    if (!match)
      throw httpError(
        "That transaction does not send the exact net USDT amount to this member.",
        400,
      );

    try {
      return await this.transition(id, [WithdrawalStatus.PROCESSING], {
        status: WithdrawalStatus.COMPLETED,
        payoutTxHash: payoutTxHash.toLowerCase(),
        reviewedBy: admin,
        reviewedAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002")
        throw httpError("That payout transaction is already used for another withdrawal.", 409);
      throw error;
    }
  }

  /**
   * Company overview (owner, 2026-10-10): the admin = company wallet sees the whole business in
   * one place (admin panel and the company's own dashboard). Money in = every package paid
   * on-chain ($300 each, top-ups included); credited = level commissions + rank rewards owed to
   * members; withdrawals by status; what members can still withdraw; fees; payments over time.
   */
  async stats() {
    const day = new Date(Date.now() - 86_400_000);
    const week = new Date(Date.now() - 7 * 86_400_000);
    const [
      registered,
      members,
      packages,
      activePackages,
      cappedPackages,
      levelPaid,
      rankPaid,
      byStatus,
      payments24h,
      payments7d,
      payout,
      paidIn,
    ] = await Promise.all([
      prisma.user.count(),
      // members = activated wallets; dashboard visitors without a package only hold a code
      prisma.user.count({ where: { packages: { some: {} } } }),
      prisma.package.count(),
      prisma.package.count({ where: { status: "ACTIVE" } }),
      prisma.package.count({ where: { status: "CAPPED" } }),
      prisma.earning.aggregate({ where: { type: "LEVEL_COMMISSION" }, _sum: { amountUsd: true } }),
      // rewards = rank rewards + fast-start bonuses (everything that is not level income)
      prisma.earning.aggregate({
        where: { type: { in: ["RANK_REWARD", "FAST_START_BONUS"] } },
        _sum: { amountUsd: true },
      }),
      prisma.withdrawal.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { grossAmount: true, feeAmount: true, netAmount: true },
      }),
      prisma.package.count({ where: { createdAt: { gte: day } } }),
      prisma.package.count({ where: { createdAt: { gte: week } } }),
      payoutContractStatus(),
      prisma.package.aggregate({ _sum: { packageAmount: true } }),
    ]);
    const sum = (status: WithdrawalStatus, field: "grossAmount" | "feeAmount" | "netAmount") =>
      toCents(String(byStatus.find((b) => b.status === status)?._sum[field] ?? 0));
    // the packages' recorded amounts (= what the contract really took), not packages x an env value
    const volumeCents = toCents(String(paidIn._sum.packageAmount ?? 0));
    const levelCents = toCents(String(levelPaid._sum.amountUsd ?? 0));
    const rankCents = toCents(String(rankPaid._sum.amountUsd ?? 0));
    const creditedCents = levelCents + rankCents;
    // requested (not rejected) withdrawals use up a member's balance; the rest can still be withdrawn
    const requestedCents =
      sum("PENDING", "grossAmount") +
      sum("PROCESSING", "grossAmount") +
      sum("COMPLETED", "grossAmount");
    const feesCents = sum("COMPLETED", "feeAmount");
    return {
      registered,
      members,
      packages,
      topUps: Math.max(0, packages - members),
      activePackages,
      cappedPackages,
      payments24h,
      payments7d,
      volumeUsd: fromCents(volumeCents),
      levelCommissionsUsd: fromCents(levelCents),
      rankRewardsUsd: fromCents(rankCents),
      creditedUsd: fromCents(creditedCents),
      paidOutUsd: fromCents(sum("COMPLETED", "netAmount")),
      feesUsd: fromCents(feesCents),
      memberBalancesUsd: fromCents(Math.max(0, creditedCents - requestedCents)),
      // what the company keeps if every credited dollar is withdrawn (fees stay with it)
      companyNetUsd: fromCents(volumeCents - creditedCents + feesCents),
      withdrawals: Object.fromEntries(
        byStatus.map((b) => [
          b.status,
          { count: b._count._all, netUsd: Number(b._sum.netAmount ?? 0) },
        ]),
      ),
      payout,
    };
  }
}

export const withdrawalsService = new WithdrawalsService();
