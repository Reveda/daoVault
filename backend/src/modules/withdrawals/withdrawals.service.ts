import { Prisma, WithdrawalStatus, type Withdrawal } from "@prisma/client";
import { Contract, Interface, JsonRpcProvider, parseUnits } from "ethers";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { serializable } from "../../config/transaction.js";
import { fromCents, toCents, withdrawalSplit } from "../plan/plan.js";
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
const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Requests that still hold (or already used) part of the balance. */
const RESERVED: WithdrawalStatus[] = [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING, WithdrawalStatus.COMPLETED];
const OPEN: WithdrawalStatus[] = [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING];
/** a voucher is treated as expired a little after its deadline (block time can lag) */
const EXPIRY_MARGIN_MS = 90_000;

/** Withdrawable = every earning (level commissions + rank rewards) minus requests not rejected. In cents. */
export async function balanceOf(db: Tx | typeof prisma, userId: string) {
  const [earned, reserved, paid] = await Promise.all([
    db.earning.aggregate({ where: { recipientId: userId }, _sum: { amountUsd: true } }),
    db.withdrawal.aggregate({ where: { userId, status: { in: RESERVED } }, _sum: { grossAmount: true } }),
    db.withdrawal.aggregate({ where: { userId, status: WithdrawalStatus.COMPLETED }, _sum: { grossAmount: true } }),
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
  w.status === WithdrawalStatus.PROCESSING && w.voucherId && w.voucherAmount && w.voucherSignature && w.voucherDeadline
    && w.voucherDeadline.getTime() > Date.now()
    ? {
      contract: env.PAYOUT_CONTRACT_ADDRESS ?? "",
      id: w.voucherId,
      amount: w.voucherAmount,
      deadline: Math.floor(w.voucherDeadline.getTime() / 1000),
      signature: w.voucherSignature,
    }
    : null;

const view = (w: Withdrawal, extra: { reviewReason?: string } = {}) => ({
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
  ...extra,
});

export class WithdrawalsService {
  /**
   * Settles this member's open instant vouchers against the chain: claimed ones become
   * COMPLETED; expired unclaimed ones are released back to the balance (REJECTED).
   * Released only after the deadline has passed, so a voucher can never be paid twice.
   */
  private async reconcile(userId: string) {
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
            data: { status: WithdrawalStatus.COMPLETED, payoutTxHash: tx?.toLowerCase() ?? null, reviewedAt: new Date() },
          });
        } else if (w.voucherDeadline && w.voucherDeadline.getTime() + EXPIRY_MARGIN_MS < Date.now()) {
          await prisma.withdrawal.updateMany({
            where: { id: w.id, status: WithdrawalStatus.PROCESSING },
            data: { status: WithdrawalStatus.REJECTED, rejectReason: "Not claimed in time. The amount is back in your balance.", reviewedAt: new Date() },
          });
        }
      } catch (error) {
        console.warn("[withdrawals] reconcile failed for", w.id, error);
      }
    }
  }

  async summary(wallet: string) {
    const user = await prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (!user) throw httpError("No activated account for this wallet.", 404);
    await this.reconcile(user.id);
    const [balance, items] = await Promise.all([
      balanceOf(prisma, user.id),
      prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
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
   * With the payout contract configured, the request gets a signed voucher the member claims at
   * once; otherwise (or if the contract can't pay it right now) it waits for admin review.
   */
  async request(wallet: string, amountUsd: number) {
    const grossCents = toCents(amountUsd);
    if (grossCents < toCents(env.WITHDRAWAL_MIN_USD)) throw httpError(`Minimum withdrawal is $${env.WITHDRAWAL_MIN_USD}.`, 400);
    const pre = await prisma.user.findUnique({ where: { walletAddress: wallet }, select: { id: true } });
    if (pre) await this.reconcile(pre.id);

    const created = await serializable(async (tx) => {
      const user = await tx.user.findUnique({ where: { walletAddress: wallet } });
      if (!user) throw httpError("No activated account for this wallet.", 404);
      const open = await tx.withdrawal.findFirst({ where: { userId: user.id, status: { in: OPEN } }, select: { id: true } });
      if (open) throw httpError("You already have a withdrawal in progress.", 409);
      const { availableCents } = await balanceOf(tx, user.id);
      if (grossCents > availableCents) throw httpError("Amount is more than your available balance.", 400);
      const split = withdrawalSplit(grossCents, env.WITHDRAWAL_FEE_PERCENT);
      return tx.withdrawal.create({
        data: {
          userId: user.id,
          grossAmount: fromCents(split.grossCents),
          feeAmount: fromCents(split.feeCents),
          netAmount: fromCents(split.netCents),
          destinationWallet: wallet,
        },
      });
    });

    if (!instantPayoutsEnabled()) return view(created, { reviewReason: "Withdrawals are reviewed by the team" });
    try {
      const check = await canPayInstantly(Number(created.netAmount));
      if (!check.ok) return view(created, { reviewReason: check.reason });
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
      console.warn("[withdrawals] instant payout unavailable, sent to review:", error);
      return view(created, { reviewReason: "Instant payout is unavailable right now" });
    }
  }

  /** The member's wallet claimed the voucher: verify the Claimed event on-chain and mark it paid. */
  async confirm(wallet: string, withdrawalId: string, txHash: string) {
    const w = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w || w.destinationWallet !== wallet) throw httpError("Withdrawal not found.", 404);
    if (w.status === WithdrawalStatus.COMPLETED) return view(w);
    if (!w.voucherId || !w.voucherAmount || w.status !== WithdrawalStatus.PROCESSING) throw httpError("This withdrawal has no open instant payout.", 409);
    if (!(await verifyClaimTx(txHash, w.voucherId, wallet, w.voucherAmount))) {
      throw httpError("That transaction is not the payout for this withdrawal.", 400);
    }
    try {
      const done = await prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: WithdrawalStatus.COMPLETED, payoutTxHash: txHash.toLowerCase(), reviewedAt: new Date() },
      });
      return view(done);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") throw httpError("That transaction is already recorded.", 409);
      throw error;
    }
  }

  // ── admin ────────────────────────────────────────────────────────────

  async list(status?: WithdrawalStatus) {
    const items = await prisma.withdrawal.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { user: { select: { walletAddress: true, referralCode: true } } },
    });
    return items.map((w) => ({ ...view(w), voucher: null, referralCode: w.user.referralCode }));
  }

  private async transition(id: string, from: WithdrawalStatus[], data: Prisma.WithdrawalUpdateInput) {
    return serializable(async (tx) => {
      const current = await tx.withdrawal.findUnique({ where: { id } });
      if (!current) throw httpError("Withdrawal not found.", 404);
      if (current.voucherId) throw httpError("Instant withdrawal: the payout contract handles it automatically.", 409);
      if (!from.includes(current.status)) throw httpError(`Withdrawal is ${current.status.toLowerCase()}.`, 409);
      return view(await tx.withdrawal.update({ where: { id }, data }));
    });
  }

  approve(id: string, admin: string) {
    return this.transition(id, [WithdrawalStatus.PENDING], { status: WithdrawalStatus.PROCESSING, reviewedBy: admin, reviewedAt: new Date() });
  }

  /** Rejecting releases the reserved amount back to the member's balance. */
  reject(id: string, admin: string, reason: string) {
    return this.transition(id, OPEN, { status: WithdrawalStatus.REJECTED, reviewedBy: admin, reviewedAt: new Date(), rejectReason: reason });
  }

  /**
   * Admin-reviewed requests: the admin pays from the treasury wallet (e.g. MetaMask) and
   * submits the tx hash. It is accepted only if that tx moved exactly the net USDT to the member.
   */
  async complete(id: string, admin: string, payoutTxHash: string) {
    if (!env.USDT_CONTRACT_ADDRESS) throw httpError("USDT_CONTRACT_ADDRESS is not configured.", 503);
    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw httpError("Withdrawal not found.", 404);
    if (w.voucherId) throw httpError("Instant withdrawal: the payout contract handles it automatically.", 409);
    if (w.status !== WithdrawalStatus.PROCESSING) throw httpError("Approve the withdrawal before marking it paid.", 409);

    const provider = new JsonRpcProvider(env.BSC_RPC_URL, env.BSC_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(payoutTxHash);
    if (!receipt || receipt.status !== 1) throw httpError("Payout transaction is missing or failed.", 400);
    const usdt = env.USDT_CONTRACT_ADDRESS.toLowerCase();
    const decimals = Number(await new Contract(usdt, ["function decimals() view returns (uint8)"], provider).decimals());
    const expected = parseUnits(Number(w.netAmount).toFixed(2), decimals);
    const erc20 = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    const match = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== usdt) return false;
      const parsed = (() => { try { return erc20.parseLog(log); } catch { return null; } })();
      if (!parsed || parsed.name !== "Transfer") return false;
      const [from, to, value] = parsed.args as unknown as [string, string, bigint];
      const fromOk = !env.COMPANY_WALLET_ADDRESS || from.toLowerCase() === env.COMPANY_WALLET_ADDRESS.toLowerCase();
      return fromOk && to.toLowerCase() === w.destinationWallet.toLowerCase() && value === expected;
    });
    if (!match) throw httpError("That transaction does not send the exact net USDT amount to this member.", 400);

    try {
      return await this.transition(id, [WithdrawalStatus.PROCESSING], {
        status: WithdrawalStatus.COMPLETED, payoutTxHash: payoutTxHash.toLowerCase(), reviewedBy: admin, reviewedAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") throw httpError("That payout transaction is already used for another withdrawal.", 409);
      throw error;
    }
  }

  async stats() {
    const [members, packages, levelPaid, rankPaid, byStatus, payout] = await Promise.all([
      // members = activated wallets; dashboard visitors without a package only hold a code
      prisma.user.count({ where: { packages: { some: {} } } }),
      prisma.package.count(),
      prisma.earning.aggregate({ where: { type: "LEVEL_COMMISSION" }, _sum: { amountUsd: true } }),
      prisma.earning.aggregate({ where: { type: "RANK_REWARD" }, _sum: { amountUsd: true } }),
      prisma.withdrawal.groupBy({ by: ["status"], _count: { _all: true }, _sum: { netAmount: true } }),
      payoutContractStatus(),
    ]);
    return {
      members,
      packages,
      volumeUsd: packages * env.ACTIVATION_AMOUNT_USDT,
      levelCommissionsUsd: Number(levelPaid._sum.amountUsd ?? 0),
      rankRewardsUsd: Number(rankPaid._sum.amountUsd ?? 0),
      withdrawals: Object.fromEntries(byStatus.map((s) => [s.status, { count: s._count._all, netUsd: Number(s._sum.netAmount ?? 0) }])),
      payout,
    };
  }
}

export const withdrawalsService = new WithdrawalsService();
