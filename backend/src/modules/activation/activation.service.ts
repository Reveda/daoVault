import {
  Contract,
  formatUnits,
  getAddress,
  Interface,
  ZeroAddress,
  type AbstractProvider,
  type LogDescription,
  type TransactionReceipt,
} from "ethers";
import { env } from "../../config/env.js";
import { serializable } from "../../config/transaction.js";
import { processActivation, processTopUp } from "./activation.engine.js";
import { kickPlanQueue } from "./planQueue.js";
import { alert, shortWallet } from "../../config/alerts.js";
import { chainProvider } from "../../config/rpc.js";

const shortTx = (hash: string) => `${hash.slice(0, 10)}…`;

/**
 * The member's payment is confirmed on-chain from our contract, but recording it failed: the
 * member has paid and is not activated. Logged at once as an [alert] line (owner, 2026-10-13).
 * A server error is retried by itself (the website on the member's next visit, the worker's
 * indexer); a refusal needs a person.
 */
function paidButNotRecorded(kind: string, wallet: string, txHash: string, error: unknown) {
  const status = (error as { statusCode?: number })?.statusCode ?? 500;
  const reason = String((error as Error)?.message ?? error).slice(0, 160);
  alert(
    status < 500 ? "critical" : "warning",
    `unrecorded-${txHash}`,
    `PAID BUT NOT RECORDED: ${kind} by ${shortWallet(wallet)} (tx ${shortTx(txHash)}) is on-chain but was not recorded: ${reason}.${status < 500 ? " Needs a look." : " It is retried automatically."}`,
  );
}

/** the plan queue pays the levels right after; wait for it a little so the dashboard shows the income on reload */
const settle = async <T>(result: T): Promise<T> => {
  await Promise.race([kickPlanQueue(), new Promise((r) => setTimeout(r, 4_000))]);
  return result;
};

const PAYMENT_ABI = [
  "function usdt() view returns (address)",
  "function treasury() view returns (address)",
  "function activationAmount() view returns (uint256)",
  // 45% of every payment goes here (owner, 2026-10-13): must be our DAOvaultPayout contract
  "function payoutVault() view returns (address)",
  "event Activated(address indexed user, address indexed sponsor, uint256 amount, uint256 timestamp)",
  "event ToppedUp(address indexed user, uint256 amount, uint256 count, uint256 timestamp)",
];

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

/** how long a verify request waits for its payment's block to become final before answering 503 */
const FINALITY_WAIT_MS = 25_000;
const FINALITY_POLL_MS = 1_500;
/** an RPC without the "finalized" block tag: this many blocks on top count as final instead */
const FALLBACK_CONFIRMATIONS = 3;

/**
 * The payment's receipt once its block is FINAL on BNB Smart Chain (owner 2026-10-19). Recorded at the
 * chain head, a reorg could drop a payment after its package and commissions were saved; the member could
 * even replace the transaction with another one of the same nonce, so no USDT ever arrived. BSC's fast
 * finality marks blocks "finalized" a few seconds after they are mined; an RPC that does not know the tag
 * falls back to FALLBACK_CONFIRMATIONS blocks. The receipt is read again on every round and its block must
 * still be the canonical block at that height. Returns null when there is no receipt (a missing, dropped
 * or replaced transaction); a failed transaction comes back at once (the caller rejects it); still not
 * final after FINALITY_WAIT_MS = 503 (the website retries; the chain indexer records it later too).
 */
async function finalReceipt(
  provider: AbstractProvider,
  transactionHash: string,
): Promise<TransactionReceipt | null> {
  const until = Date.now() + FINALITY_WAIT_MS;
  for (;;) {
    const receipt = await provider.getTransactionReceipt(transactionHash);
    if (receipt?.status === 0) return receipt;
    if (receipt) {
      let final: boolean;
      try {
        const finalized = await provider.getBlock("finalized");
        if (!finalized) throw new Error("no finalized block");
        final = receipt.blockNumber <= finalized.number;
      } catch {
        final = (await provider.getBlockNumber()) - receipt.blockNumber + 1 >= FALLBACK_CONFIRMATIONS;
      }
      if (final) {
        const block = await provider.getBlock(receipt.blockNumber);
        if (block?.hash === receipt.blockHash) return receipt;
      }
    }
    if (Date.now() > until) {
      if (!receipt) return null;
      throw fail(
        "Your payment is still being confirmed on BNB Smart Chain. Please wait a minute and refresh this page.",
        503,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, FINALITY_POLL_MS));
  }
}

/** Two requests for the same tx can race on the unique tx hash: the second one reports the stored result. */
async function once<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return run();
    throw error;
  }
}

const transactionHashOf = (input: { transactionHash: string }) => shortTx(input.transactionHash);

/**
 * The payment contract's token, treasury, amount and payout address are immutable (no owner, no
 * setter): read them once per contract address instead of 4 RPC calls on every payment (launch
 * traffic, public RPCs rate-limit). A failed read is not cached.
 */
type ContractConfig = {
  tokenAddress: string;
  treasuryAddress: string;
  activationAmount: bigint;
  payoutVault: string;
  amountUsd: number;
};
const contractConfigs = new Map<string, Promise<ContractConfig>>();
function contractConfig(
  payment: Contract,
  address: string,
  provider: AbstractProvider,
): Promise<ContractConfig> {
  let config = contractConfigs.get(address);
  if (!config) {
    config = Promise.all([
      payment.usdt(),
      payment.treasury(),
      payment.activationAmount(),
      payment.payoutVault(),
    ]).then(async ([tokenAddress, treasuryAddress, activationAmount, payoutVault]) => {
      // a wrong token is reported as such (config-usdt) before any call to it
      if (
        env.USDT_CONTRACT_ADDRESS &&
        String(tokenAddress).toLowerCase() !== env.USDT_CONTRACT_ADDRESS.toLowerCase()
      ) {
        return { tokenAddress, treasuryAddress, activationAmount, payoutVault, amountUsd: NaN };
      }
      // the package is worth what the contract really takes (not what an env value says)
      const decimals = Number(
        await new Contract(
          tokenAddress,
          ["function decimals() view returns (uint8)"],
          provider,
        ).decimals(),
      );
      const amountUsd = Number(formatUnits(activationAmount, decimals));
      if (amountUsd !== Number(env.ACTIVATION_AMOUNT_USDT)) {
        alert(
          "critical",
          "config-amount",
          `The payment contract takes $${amountUsd} but ACTIVATION_AMOUNT_USDT is ${env.ACTIVATION_AMOUNT_USDT}: packages are recorded at $${amountUsd} (the contract). Fix the setting (and VITE_ACTIVATION_AMOUNT_USDT).`,
        );
      }
      return { tokenAddress, treasuryAddress, activationAmount, payoutVault, amountUsd };
    });
    config.catch(() => contractConfigs.delete(address));
    contractConfigs.set(address, config);
  }
  return config;
}

export class ActivationService {
  /**
   * The chain is the source of truth: the transaction must exist, have succeeded, come from
   * the member's wallet and call our payment contract, whose token and treasury must match
   * this backend. Returns the named event emitted BY OUR CONTRACT in that transaction.
   */
  private async contractEvent(
    walletAddress: string,
    transactionHash: string,
    eventName: "Activated" | "ToppedUp",
  ): Promise<{ event: LogDescription; activationAmount: bigint; amountUsd: number }> {
    if (!env.PAYMENT_CONTRACT_ADDRESS)
      throw fail("Payments are not open yet. Please try again later.", 503);
    const contractAddress = env.PAYMENT_CONTRACT_ADDRESS.toLowerCase();
    const provider = chainProvider();
    // only a payment in a FINAL block is recorded (finalReceipt): a reorg can no longer undo it
    const [transaction, receipt] = await Promise.all([
      provider.getTransaction(transactionHash),
      finalReceipt(provider, transactionHash),
    ]);
    if (!transaction || !receipt || receipt.status !== 1)
      throw fail("Payment transaction is missing or failed.");
    if (
      transaction.from.toLowerCase() !== walletAddress ||
      transaction.to?.toLowerCase() !== contractAddress
    ) {
      throw fail("Transaction sender or destination does not match the configured contract.");
    }

    const payment = new Contract(env.PAYMENT_CONTRACT_ADDRESS, PAYMENT_ABI, provider);
    const { tokenAddress, treasuryAddress, activationAmount, payoutVault, amountUsd } =
      await contractConfig(payment, contractAddress, provider);
    if (
      env.USDT_CONTRACT_ADDRESS &&
      tokenAddress.toLowerCase() !== env.USDT_CONTRACT_ADDRESS.toLowerCase()
    ) {
      alert(
        "critical",
        "config-usdt",
        "Payments cannot be recorded: the payment contract uses another USDT than USDT_CONTRACT_ADDRESS. Fix the server setting.",
      );
      throw fail("Payment token does not match backend configuration.");
    }
    if (
      env.COMPANY_WALLET_ADDRESS &&
      treasuryAddress.toLowerCase() !== env.COMPANY_WALLET_ADDRESS.toLowerCase()
    ) {
      alert(
        "critical",
        "config-treasury",
        "Payments cannot be recorded: the payment contract treasury is not COMPANY_WALLET_ADDRESS. Fix the server setting.",
      );
      throw fail("Treasury does not match backend configuration.");
    }
    if (
      env.PAYOUT_CONTRACT_ADDRESS &&
      payoutVault.toLowerCase() !== env.PAYOUT_CONTRACT_ADDRESS.toLowerCase()
    ) {
      alert(
        "critical",
        "config-payout-vault",
        "Payments cannot be recorded: the payment contract sends its 45% to another payout contract than PAYOUT_CONTRACT_ADDRESS. Fix the server setting.",
      );
      throw fail("Payout contract does not match backend configuration.");
    }

    const iface = new Interface(PAYMENT_ABI);
    const event = receipt.logs
      .filter((log) => log.address.toLowerCase() === contractAddress) // only our contract's own events count
      .map((log) => {
        try {
          return iface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed): parsed is LogDescription => parsed?.name === eventName);
    if (!event) throw fail(`${eventName} event was not found in the transaction.`);
    return { event, activationAmount, amountUsd };
  }

  async verify(input: { walletAddress: string; transactionHash: string; sponsorAddress: string }) {
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const requestedSponsor = getAddress(input.sponsorAddress || ZeroAddress).toLowerCase();
    const { event, activationAmount, amountUsd } = await this.contractEvent(
      walletAddress,
      input.transactionHash,
      "Activated",
    );
    const eventUser = String(event.args[0]).toLowerCase();
    const eventSponsor = String(event.args[1]).toLowerCase();
    if (eventUser !== walletAddress || event.args[2] !== activationAmount) {
      throw fail("Activation event data failed verification.");
    }
    // the on-chain sponsor is recorded, whatever the browser sent (the engine decides the tree)
    if (eventSponsor !== requestedSponsor) {
      console.warn(
        `[activation] ${transactionHashOf(input)}: browser sent sponsor ${requestedSponsor}, chain says ${eventSponsor}`,
      );
    }
    const activation = {
      walletAddress,
      sponsorAddress: eventSponsor,
      transactionHash: input.transactionHash.toLowerCase(),
      amountUsd, // from the contract, not the env
      paidAt: eventTime(event.args[3]),
    };
    try {
      const result = await settle(
        await once(() => serializable((tx) => processActivation(tx, activation))),
      );
      if (result.sponsorMismatch) {
        alert(
          result.sponsorMismatch === "kept" ? "warning" : "info",
          `sponsor-mismatch-${activation.transactionHash}`,
          result.sponsorMismatch === "moved"
            ? `${shortWallet(walletAddress)} paid under another sponsor (${shortWallet(eventSponsor)}) than its invite link; the team tree now follows the chain.`
            : result.sponsorMismatch === "loop"
              ? `${shortWallet(walletAddress)} paid on-chain under ${shortWallet(eventSponsor)}, a member of its OWN team (a loop): the recorded tree was kept. Check tx ${transactionHashOf(activation)}.`
              : `${shortWallet(walletAddress)} paid under ${shortWallet(eventSponsor)} on-chain, but its team has already paid under the recorded sponsor: the recorded tree was kept. Check tx ${transactionHashOf(activation)}.`,
        );
      }
      return result;
    } catch (error) {
      paidButNotRecorded("activation", walletAddress, activation.transactionHash, error);
      throw error;
    }
  }

  /** Re-entry: a verified ToppedUp from the member adds a new package (activation.engine processTopUp). */
  async verifyTopUp(input: { walletAddress: string; transactionHash: string }) {
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const { event, activationAmount, amountUsd } = await this.contractEvent(
      walletAddress,
      input.transactionHash,
      "ToppedUp",
    );
    if (
      String(event.args[0]).toLowerCase() !== walletAddress ||
      event.args[1] !== activationAmount
    ) {
      throw fail("Top-up event data failed verification.");
    }
    const topUp = {
      walletAddress,
      transactionHash: input.transactionHash.toLowerCase(),
      amountUsd,
      paidAt: eventTime(event.args[3]),
    };
    try {
      return await settle(await once(() => serializable((tx) => processTopUp(tx, topUp))));
    } catch (error) {
      paidButNotRecorded("top-up", walletAddress, topUp.transactionHash, error);
      throw error;
    }
  }
}

/**
 * The block time the contract put in the event (seconds). It decides the fast-start clock (owner,
 * 2026-10-18), so a payment recorded late (server or indexer busy) still counts from when it was paid.
 * Anything unreadable or in the future falls back to now.
 */
function eventTime(value: unknown): Date | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const at = new Date(seconds * 1000);
  return at.getTime() > Date.now() + 5 * 60_000 ? undefined : at;
}

export const activationService = new ActivationService();
