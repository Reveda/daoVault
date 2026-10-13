import { Contract, JsonRpcProvider, getAddress, Interface, ZeroAddress, type LogDescription } from 'ethers';
import { env } from '../../config/env.js';
import { serializable } from '../../config/transaction.js';
import { processActivation, processTopUp } from './activation.engine.js';
import { kickPlanQueue } from './planQueue.js';
import { alert, shortWallet } from '../../config/alerts.js';

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
  alert(status < 500 ? 'critical' : 'warning', `unrecorded-${txHash}`,
    `PAID BUT NOT RECORDED: ${kind} by ${shortWallet(wallet)} (tx ${shortTx(txHash)}) is on-chain but was not recorded: ${reason}.${status < 500 ? ' Needs a look.' : ' It is retried automatically.'}`);
}


/** the plan queue pays the levels right after; wait for it a little so the dashboard shows the income on reload */
const settle = async <T>(result: T): Promise<T> => {
  await Promise.race([kickPlanQueue(), new Promise((r) => setTimeout(r, 4_000))]);
  return result;
};

const PAYMENT_ABI = [
  'function usdt() view returns (address)',
  'function treasury() view returns (address)',
  'function activationAmount() view returns (uint256)',
  // 45% of every payment goes here (owner, 2026-10-13): must be our DAOvaultPayout contract
  'function payoutVault() view returns (address)',
  'event Activated(address indexed user, address indexed sponsor, uint256 amount, uint256 timestamp)',
  'event ToppedUp(address indexed user, uint256 amount, uint256 count, uint256 timestamp)',
];

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** Two requests for the same tx can race on the unique tx hash: the second one reports the stored result. */
async function once<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return run();
    throw error;
  }
}

const transactionHashOf = (input: { transactionHash: string }) => shortTx(input.transactionHash);

/**
 * The payment contract's token, treasury, amount and payout address are immutable (no owner, no
 * setter): read them once per contract address instead of 4 RPC calls on every payment (launch
 * traffic, public RPCs rate-limit). A failed read is not cached.
 */
type ContractConfig = { tokenAddress: string; treasuryAddress: string; activationAmount: bigint; payoutVault: string };
const contractConfigs = new Map<string, Promise<ContractConfig>>();
function contractConfig(payment: Contract, address: string): Promise<ContractConfig> {
  let config = contractConfigs.get(address);
  if (!config) {
    config = Promise.all([payment.usdt(), payment.treasury(), payment.activationAmount(), payment.payoutVault()])
      .then(([tokenAddress, treasuryAddress, activationAmount, payoutVault]) => ({ tokenAddress, treasuryAddress, activationAmount, payoutVault }));
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
  private async contractEvent(walletAddress: string, transactionHash: string, eventName: 'Activated' | 'ToppedUp'): Promise<{ event: LogDescription; activationAmount: bigint }> {
    if (!env.PAYMENT_CONTRACT_ADDRESS) throw fail('Payments are not open yet. Please try again later.', 503);
    const contractAddress = env.PAYMENT_CONTRACT_ADDRESS.toLowerCase();
    const provider = new JsonRpcProvider(env.BSC_RPC_URL, env.BSC_CHAIN_ID);
    const [transaction, receipt] = await Promise.all([provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)]);
    if (!transaction || !receipt || receipt.status !== 1) throw fail('Payment transaction is missing or failed.');
    if (transaction.from.toLowerCase() !== walletAddress || transaction.to?.toLowerCase() !== contractAddress) {
      throw fail('Transaction sender or destination does not match the configured contract.');
    }

    const payment = new Contract(env.PAYMENT_CONTRACT_ADDRESS, PAYMENT_ABI, provider);
    const { tokenAddress, treasuryAddress, activationAmount, payoutVault } = await contractConfig(payment, contractAddress);
    if (env.USDT_CONTRACT_ADDRESS && tokenAddress.toLowerCase() !== env.USDT_CONTRACT_ADDRESS.toLowerCase()) {
      alert('critical', 'config-usdt', 'Payments cannot be recorded: the payment contract uses another USDT than USDT_CONTRACT_ADDRESS. Fix the server setting.');
      throw fail('Payment token does not match backend configuration.');
    }
    if (env.COMPANY_WALLET_ADDRESS && treasuryAddress.toLowerCase() !== env.COMPANY_WALLET_ADDRESS.toLowerCase()) {
      alert('critical', 'config-treasury', 'Payments cannot be recorded: the payment contract treasury is not COMPANY_WALLET_ADDRESS. Fix the server setting.');
      throw fail('Treasury does not match backend configuration.');
    }
    if (env.PAYOUT_CONTRACT_ADDRESS && payoutVault.toLowerCase() !== env.PAYOUT_CONTRACT_ADDRESS.toLowerCase()) {
      alert('critical', 'config-payout-vault', 'Payments cannot be recorded: the payment contract sends its 45% to another payout contract than PAYOUT_CONTRACT_ADDRESS. Fix the server setting.');
      throw fail('Payout contract does not match backend configuration.');
    }

    const iface = new Interface(PAYMENT_ABI);
    const event = receipt.logs
      .filter((log) => log.address.toLowerCase() === contractAddress) // only our contract's own events count
      .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
      .find((parsed): parsed is LogDescription => parsed?.name === eventName);
    if (!event) throw fail(`${eventName} event was not found in the transaction.`);
    return { event, activationAmount };
  }

  async verify(input: { walletAddress: string; transactionHash: string; sponsorAddress: string }) {
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const requestedSponsor = getAddress(input.sponsorAddress || ZeroAddress).toLowerCase();
    const { event, activationAmount } = await this.contractEvent(walletAddress, input.transactionHash, 'Activated');
    const eventUser = String(event.args[0]).toLowerCase();
    const eventSponsor = String(event.args[1]).toLowerCase();
    if (eventUser !== walletAddress || event.args[2] !== activationAmount) {
      throw fail('Activation event data failed verification.');
    }
    // the member paid with the sponsor written on-chain: that one counts, whatever the browser sent
    if (eventSponsor !== requestedSponsor) {
      console.warn(`[activation] ${transactionHashOf(input)}: browser sent sponsor ${requestedSponsor}, chain says ${eventSponsor}; using the chain`);
    }
    const activation = {
      walletAddress,
      sponsorAddress: eventSponsor,
      transactionHash: input.transactionHash.toLowerCase(),
      amountUsd: Number(env.ACTIVATION_AMOUNT_USDT),
    };
    try {
      return await settle(await once(() => serializable((tx) => processActivation(tx, activation))));
    } catch (error) {
      paidButNotRecorded('activation', walletAddress, activation.transactionHash, error);
      throw error;
    }
  }

  /** Re-entry: a verified ToppedUp from the member adds a new package (activation.engine processTopUp). */
  async verifyTopUp(input: { walletAddress: string; transactionHash: string }) {
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const { event, activationAmount } = await this.contractEvent(walletAddress, input.transactionHash, 'ToppedUp');
    if (String(event.args[0]).toLowerCase() !== walletAddress || event.args[1] !== activationAmount) {
      throw fail('Top-up event data failed verification.');
    }
    const topUp = { walletAddress, transactionHash: input.transactionHash.toLowerCase(), amountUsd: Number(env.ACTIVATION_AMOUNT_USDT) };
    try {
      return await settle(await once(() => serializable((tx) => processTopUp(tx, topUp))));
    } catch (error) {
      paidButNotRecorded('top-up', walletAddress, topUp.transactionHash, error);
      throw error;
    }
  }
}

export const activationService = new ActivationService();
