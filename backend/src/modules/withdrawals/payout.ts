/**
 * Instant withdrawals through contracts/DAOvaultPayout.sol.
 *
 * The backend never sends money. It signs a one-time EIP-712 voucher for the member
 * ("pay <member> <amount>, id <id>, until <deadline>"); the member's own wallet calls
 * claim() and the contract pays from the treasury float. This module signs vouchers,
 * reads the contract's limits/float, and verifies claims on-chain.
 *
 * Signer: PAYOUT_SIGNER_TESTNET_KEY, accepted on BSC Testnet only (env.ts refuses it
 * on mainnet). Mainnet needs a KMS-backed signer behind the same signVoucher() call.
 */
import { Contract, Interface, JsonRpcProvider, Wallet, id as keccakText, parseUnits } from "ethers";
import { env } from "../../config/env.js";

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
const CLAIM_TYPES = {
  Claim: [
    { name: "member", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "id", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};
const payoutInterface = new Interface(PAYOUT_ABI);

export type Voucher = { contract: string; id: string; amount: string; deadline: number; signature: string };

export const instantPayoutsEnabled = () =>
  Boolean(env.PAYOUT_CONTRACT_ADDRESS && env.PAYOUT_SIGNER_TESTNET_KEY && env.USDT_CONTRACT_ADDRESS);

let provider: JsonRpcProvider | null = null;
const chain = () => (provider ??= new JsonRpcProvider(env.BSC_RPC_URL, env.BSC_CHAIN_ID));
const payout = () => new Contract(env.PAYOUT_CONTRACT_ADDRESS!, PAYOUT_ABI, chain());
let decimalsCache: number | null = null;
const tokenDecimals = async () => (decimalsCache ??= Number(await new Contract(env.USDT_CONTRACT_ADDRESS!, ERC20_ABI, chain()).decimals()));

/** bytes32 voucher id for a withdrawal row */
export const voucherIdFor = (withdrawalId: string) => keccakText(`daovault-withdrawal:${withdrawalId}`);

/** Can the contract pay `netUsd` right now? Returns a reason when it can't (then the request goes to admin review). */
export async function canPayInstantly(netUsd: number): Promise<{ ok: true; amount: bigint } | { ok: false; reason: string }> {
  const c = payout();
  const amount = parseUnits(netUsd.toFixed(2), await tokenDecimals());
  const [paused, signerAddr, maxPerClaim, dailyLimit, currentDay, spentToday, float] = await Promise.all([
    c.paused(), c.signer(), c.maxPerClaim(), c.dailyLimit(), c.currentDay(), c.spentToday(), c.floatBalance(),
  ]) as [boolean, string, bigint, bigint, bigint, bigint, bigint];
  if (paused) return { ok: false, reason: "Instant payouts are paused" };
  if (signerAddr.toLowerCase() !== new Wallet(env.PAYOUT_SIGNER_TESTNET_KEY!).address.toLowerCase()) {
    return { ok: false, reason: "Payout signer is not set up on the contract" };
  }
  if (amount > maxPerClaim) return { ok: false, reason: "Above the instant payout limit" };
  const today = BigInt(Math.floor(Date.now() / 86_400_000));
  const spent = currentDay === today ? spentToday : 0n;
  if (spent + amount > dailyLimit) return { ok: false, reason: "Today's instant payout limit is reached" };
  if (amount > float) return { ok: false, reason: "The payout float is being refilled" };
  return { ok: true, amount };
}

/** Signs the one-time voucher the member's wallet submits to claim(). */
export async function signVoucher(member: string, withdrawalId: string, amount: bigint): Promise<Voucher> {
  const signer = new Wallet(env.PAYOUT_SIGNER_TESTNET_KEY!);
  const id = voucherIdFor(withdrawalId);
  const deadline = Math.floor(Date.now() / 1000) + env.PAYOUT_VOUCHER_MINUTES * 60;
  const signature = await signer.signTypedData(
    { name: "DAOvaultPayout", version: "1", chainId: env.BSC_CHAIN_ID, verifyingContract: env.PAYOUT_CONTRACT_ADDRESS! },
    CLAIM_TYPES,
    { member, amount, id, deadline },
  );
  return { contract: env.PAYOUT_CONTRACT_ADDRESS!, id, amount: amount.toString(), deadline, signature };
}

export const isVoucherUsed = async (voucherId: string): Promise<boolean> => Boolean(await payout().used(voucherId));

/** Does this tx contain the Claimed event for exactly this voucher, member and amount? */
export async function verifyClaimTx(txHash: string, voucherId: string, member: string, amount: string): Promise<boolean> {
  const receipt = await chain().getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return false;
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== env.PAYOUT_CONTRACT_ADDRESS!.toLowerCase()) return false;
    const parsed = (() => { try { return payoutInterface.parseLog(log); } catch { return null; } })();
    if (!parsed || parsed.name !== "Claimed") return false;
    const [id, who, paid] = parsed.args as unknown as [string, string, bigint];
    return id === voucherId && who.toLowerCase() === member.toLowerCase() && paid.toString() === amount;
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
    const [paused, maxPerClaim, dailyLimit, float] = await Promise.all([c.paused(), c.maxPerClaim(), c.dailyLimit(), c.floatBalance()]) as [boolean, bigint, bigint, bigint];
    const toUsd = (v: bigint) => Number(v) / 10 ** decimals;
    return { contract: env.PAYOUT_CONTRACT_ADDRESS, paused, maxPerClaimUsd: toUsd(maxPerClaim), dailyLimitUsd: toUsd(dailyLimit), floatUsd: toUsd(float) };
  } catch {
    return { contract: env.PAYOUT_CONTRACT_ADDRESS, error: "Could not read the payout contract" };
  }
}
