import { Contract, JsonRpcProvider, getAddress, Interface, ZeroAddress, type LogDescription } from 'ethers';
import { env } from '../../config/env.js';
import { serializable } from '../../config/transaction.js';
import { processActivation, processTopUp } from './activation.engine.js';

const PAYMENT_ABI = [
  'function usdt() view returns (address)',
  'function treasury() view returns (address)',
  'function activationAmount() view returns (uint256)',
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

export class ActivationService {
  /**
   * The chain is the source of truth: the transaction must exist, have succeeded, come from
   * the member's wallet and call our payment contract, whose token and treasury must match
   * this backend. Returns the named event emitted BY OUR CONTRACT in that transaction.
   */
  private async contractEvent(walletAddress: string, transactionHash: string, eventName: 'Activated' | 'ToppedUp'): Promise<{ event: LogDescription; activationAmount: bigint }> {
    if (!env.PAYMENT_CONTRACT_ADDRESS) throw fail('Payment contract is not configured on the backend.', 503);
    const contractAddress = env.PAYMENT_CONTRACT_ADDRESS.toLowerCase();
    const provider = new JsonRpcProvider(env.BSC_RPC_URL, env.BSC_CHAIN_ID);
    const [transaction, receipt] = await Promise.all([provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)]);
    if (!transaction || !receipt || receipt.status !== 1) throw fail('Payment transaction is missing or failed.');
    if (transaction.from.toLowerCase() !== walletAddress || transaction.to?.toLowerCase() !== contractAddress) {
      throw fail('Transaction sender or destination does not match the configured contract.');
    }

    const payment = new Contract(env.PAYMENT_CONTRACT_ADDRESS, PAYMENT_ABI, provider);
    const [tokenAddress, treasuryAddress, activationAmount] = await Promise.all([payment.usdt(), payment.treasury(), payment.activationAmount()]);
    if (env.USDT_CONTRACT_ADDRESS && tokenAddress.toLowerCase() !== env.USDT_CONTRACT_ADDRESS.toLowerCase()) {
      throw fail('Payment token does not match backend configuration.');
    }
    if (env.COMPANY_WALLET_ADDRESS && treasuryAddress.toLowerCase() !== env.COMPANY_WALLET_ADDRESS.toLowerCase()) {
      throw fail('Treasury does not match backend configuration.');
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
    if (eventUser !== walletAddress || eventSponsor !== requestedSponsor || event.args[2] !== activationAmount) {
      throw fail('Activation event data failed verification.');
    }
    const activation = {
      walletAddress,
      sponsorAddress: eventSponsor,
      transactionHash: input.transactionHash.toLowerCase(),
      amountUsd: Number(env.ACTIVATION_AMOUNT_USDT),
    };
    return once(() => serializable((tx) => processActivation(tx, activation)));
  }

  /** Re-entry: a verified ToppedUp from the member adds a new package (activation.engine processTopUp). */
  async verifyTopUp(input: { walletAddress: string; transactionHash: string }) {
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const { event, activationAmount } = await this.contractEvent(walletAddress, input.transactionHash, 'ToppedUp');
    if (String(event.args[0]).toLowerCase() !== walletAddress || event.args[1] !== activationAmount) {
      throw fail('Top-up event data failed verification.');
    }
    const topUp = { walletAddress, transactionHash: input.transactionHash.toLowerCase(), amountUsd: Number(env.ACTIVATION_AMOUNT_USDT) };
    return once(() => serializable((tx) => processTopUp(tx, topUp)));
  }
}

export const activationService = new ActivationService();
