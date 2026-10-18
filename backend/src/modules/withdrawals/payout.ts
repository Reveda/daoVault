/**
 * Instant withdrawals through contracts/DAOvaultPayout.sol.
 *
 * The backend never sends money. It signs a one-time EIP-712 voucher for the member
 * ("pay <member> <amount>, id <id>, until <deadline>"); the member's own wallet calls
 * claim() and the contract pays from the treasury float. This module signs vouchers,
 * reads the contract's limits/float, and verifies claims on-chain.
 *
 * Signer: voucherSigner.ts (the Docker signer service, or the testnet-only env key).
 */
import {
  Contract,
  Interface,
  formatUnits,
  id as keccakText,
  parseUnits,
  type AbstractProvider,
} from "ethers";
import { env } from "../../config/env.js";
import { signClaim, signerAddress, signerConfigured } from "./voucherSigner.js";
import { alert } from "../../config/alerts.js";
import { chainProvider } from "../../config/rpc.js";

const PAYOUT_ABI = [
  "function claim(bytes32 id, uint256 amount, uint256 deadline, bytes signature)",
  "function used(bytes32) view returns (bool)",
  "function paused() view returns (bool)",
  "function signer() view returns (address)",
  "function maxPerClaim() view returns (uint256)",
  "function dailyLimit() view returns (uint256)",
  "function currentDay() view returns (uint256)",
  "function spentToday() view returns (uint256)",
  "function floatBalance() view returns (uint256)",
  "event Claimed(bytes32 indexed id, address indexed member, uint256 amount)",
];
const ERC20_ABI = ["function decimals() view returns (uint8)"];
const payoutInterface = new Interface(PAYOUT_ABI);

export type Voucher = {
  contract: string;
  id: string;
  amount: string;
  deadline: number;
  signature: string;
};

export const instantPayoutsEnabled = () =>
  Boolean(env.PAYOUT_CONTRACT_ADDRESS && env.USDT_CONTRACT_ADDRESS && signerConfigured());

let provider: AbstractProvider | null = null;
const chain = () => (provider ??= chainProvider());
const payout = () => new Contract(env.PAYOUT_CONTRACT_ADDRESS!, PAYOUT_ABI, chain());
let decimalsCache: number | null = null;
const tokenDecimals = async () =>
  (decimalsCache ??= Number(
    await new Contract(env.USDT_CONTRACT_ADDRESS!, ERC20_ABI, chain()).decimals(),
  ));

/** bytes32 voucher id for a withdrawal row */
export const voucherIdFor = (withdrawalId: string) =>
  keccakText(`daovault-withdrawal:${withdrawalId}`);

/**
 * Can the contract pay `netUsd` right now? There is no admin review (owner, 2026-10-13): when it
 * cannot, the member gets a clear message and no withdrawal is created.
 */
export type PayCheck =
  | { ok: true; amount: bigint; dailyLeft: bigint; float: bigint; checkedAt: Date }
  | { ok: false; status: number; message: string };

export async function canPayInstantly(netUsd: number): Promise<PayCheck> {
  // taken BEFORE the chain reads: a voucher settled after this moment may be missing from them
  const checkedAt = new Date();
  const c = payout();
  const decimals = await tokenDecimals();
  const amount = parseUnits(netUsd.toFixed(2), decimals);
  const [
    paused,
    contractSigner,
    maxPerClaim,
    dailyLimit,
    currentDay,
    spentToday,
    float,
    ourSigner,
  ] = (await Promise.all([
    c.paused(),
    c.signer(),
    c.maxPerClaim(),
    c.dailyLimit(),
    c.currentDay(),
    c.spentToday(),
    c.floatBalance(),
    signerAddress(),
  ])) as [boolean, string, bigint, bigint, bigint, bigint, bigint, string];
  const usd = (v: bigint) =>
    `$${Number(formatUnits(v, decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (paused)
    return {
      ok: false,
      status: 503,
      message: "Withdrawals are paused for a short check. Please try again later.",
    };
  if (contractSigner.toLowerCase() !== ourSigner.toLowerCase()) {
    console.error(
      "[withdrawals] payout contract signer",
      contractSigner,
      "is not this server's signer",
      ourSigner,
    );
    alert(
      "critical",
      "signer-mismatch",
      `Withdrawals blocked: the payout contract trusts signer ${contractSigner.slice(0, 8)}… but this server signs as ${ourSigner.slice(0, 8)}…. Fix with setSigner or the signer keystore.`,
    );
    return {
      ok: false,
      status: 503,
      message: "Withdrawals are not available right now. Please try again later.",
    };
  }
  if (amount > maxPerClaim) {
    return {
      ok: false,
      status: 400,
      message: `You can withdraw up to ${usd(maxPerClaim)} (after fee) at a time. Please enter a smaller amount.`,
    };
  }
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  const spent = currentDay === today ? spentToday : 0n;
  if (spent + amount > dailyLimit) {
    alert(
      "warning",
      "daily-limit",
      `Payout daily limit reached (${usd(dailyLimit)}): members are told to try tomorrow. Raise it with setLimits if this is expected.`,
    );
  }
  if (spent + amount > dailyLimit)
    return {
      ok: false,
      status: 503,
      message: "Today's withdrawal limit has been reached. Please try again tomorrow.",
    };
  if (amount > float) {
    console.warn("[withdrawals] payout float too low:", usd(float), "needed", usd(amount));
    alert(
      "critical",
      "float-empty",
      `A member could not withdraw ${usd(amount)}: the payout contract holds only ${usd(float)}. Send USDT to the payout contract.`,
    );
    return {
      ok: false,
      status: 503,
      message: "Withdrawals are being topped up. Please try again in a little while.",
    };
  }
  // what is left on-chain right now; the caller subtracts vouchers already handed out (reservations)
  return { ok: true, amount, dailyLeft: dailyLimit - spent, float, checkedAt };
}

/** Signs the one-time voucher the member's wallet submits to claim(). */
export async function signVoucher(
  member: string,
  withdrawalId: string,
  amount: bigint,
): Promise<Voucher> {
  const id = voucherIdFor(withdrawalId);
  const deadline = Math.floor(Date.now() / 1000) + env.PAYOUT_VOUCHER_MINUTES * 60;
  const signature = await signClaim(
    {
      name: "DAOvaultPayout",
      version: "1",
      chainId: env.BSC_CHAIN_ID,
      verifyingContract: env.PAYOUT_CONTRACT_ADDRESS!,
    },
    { member, amount, id, deadline },
  );
  return {
    contract: env.PAYOUT_CONTRACT_ADDRESS!,
    id,
    amount: amount.toString(),
    deadline,
    signature,
  };
}

export const isVoucherUsed = async (voucherId: string): Promise<boolean> =>
  Boolean(await payout().used(voucherId));

/** Does this tx contain the Claimed event for exactly this voucher, member and amount? */
export async function verifyClaimTx(
  txHash: string,
  voucherId: string,
  member: string,
  amount: string,
): Promise<boolean> {
  const receipt = await chain().getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return false;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== env.PAYOUT_CONTRACT_ADDRESS!.toLowerCase()) return false;
    const parsed = (() => {
      try {
        return payoutInterface.parseLog(log);
      } catch {
        return null;
      }
    })();
    if (!parsed || parsed.name !== "Claimed") return false;
    const [id, who, paid] = parsed.args as unknown as [string, string, bigint];
    return (
      id === voucherId && who.toLowerCase() === member.toLowerCase() && paid.toString() === amount
    );
  });
}

/** Looks for the Claimed event of a voucher in recent blocks (public RPCs limit the range). */
export async function findClaimTx(voucherId: string): Promise<string | null> {
  try {
    const latest = await chain().getBlockNumber();
    const logs = await chain().getLogs({
      address: env.PAYOUT_CONTRACT_ADDRESS!,
      topics: [payoutInterface.getEvent("Claimed")!.topicHash, voucherId],
      fromBlock: Math.max(0, latest - 4_900),
      toBlock: latest,
    });
    return logs[0]?.transactionHash ?? null;
  } catch {
    return null;
  }
}

export async function payoutContractStatus() {
  if (!instantPayoutsEnabled()) return null;
  try {
    const c = payout();
    const decimals = await tokenDecimals();
    const [paused, maxPerClaim, dailyLimit, float] = (await Promise.all([
      c.paused(),
      c.maxPerClaim(),
      c.dailyLimit(),
      c.floatBalance(),
    ])) as [boolean, bigint, bigint, bigint];
    const toUsd = (v: bigint) => Number(v) / 10 ** decimals;
    return {
      contract: env.PAYOUT_CONTRACT_ADDRESS,
      paused,
      maxPerClaimUsd: toUsd(maxPerClaim),
      dailyLimitUsd: toUsd(dailyLimit),
      floatUsd: toUsd(float),
    };
  } catch {
    return { contract: env.PAYOUT_CONTRACT_ADDRESS, error: "Could not read the payout contract" };
  }
}

/** watch job: does the payout contract still trust this server's signer? null = not set up / unreadable */
export async function signerMatchesContract(): Promise<{
  ok: boolean;
  contractSigner: string;
  ourSigner: string;
} | null> {
  if (!instantPayoutsEnabled()) return null;
  try {
    const [contractSigner, ourSigner] = await Promise.all([
      payout().signer() as Promise<string>,
      signerAddress(),
    ]);
    return {
      ok: contractSigner.toLowerCase() === ourSigner.toLowerCase(),
      contractSigner,
      ourSigner,
    };
  } catch {
    return null;
  }
}
