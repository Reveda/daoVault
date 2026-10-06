import { Contract, JsonRpcProvider, getAddress, Interface, ZeroAddress } from 'ethers';
import { env } from '../../config/env.js';
import { activationRepository } from './activation.repository.js';

const PAYMENT_ABI = [
  'function usdt() view returns (address)',
  'function treasury() view returns (address)',
  'function activationAmount() view returns (uint256)',
  'event Activated(address indexed user, address indexed sponsor, uint256 amount, uint256 timestamp)',
];

export class ActivationService {
  async verify(input: { walletAddress: string; transactionHash: string; sponsorAddress: string }) {
    if (!env.PAYMENT_CONTRACT_ADDRESS) {
      throw Object.assign(new Error('Payment contract is not configured on the backend.'), { statusCode: 503 });
    }
    const walletAddress = getAddress(input.walletAddress).toLowerCase();
    const requestedSponsor = getAddress(input.sponsorAddress || ZeroAddress).toLowerCase();
    const provider = new JsonRpcProvider(env.BSC_RPC_URL, env.BSC_CHAIN_ID);
    const transaction = await provider.getTransaction(input.transactionHash);
    const receipt = await provider.getTransactionReceipt(input.transactionHash);
    if (!transaction || !receipt || receipt.status !== 1) {
      throw Object.assign(new Error('Activation transaction is missing or failed.'), { statusCode: 400 });
    }
    if (transaction.from.toLowerCase() !== walletAddress || transaction.to?.toLowerCase() !== env.PAYMENT_CONTRACT_ADDRESS.toLowerCase()) {
      throw Object.assign(new Error('Transaction sender or destination does not match the configured contract.'), { statusCode: 400 });
    }

    const payment = new Contract(env.PAYMENT_CONTRACT_ADDRESS, PAYMENT_ABI, provider);
    const [tokenAddress, treasuryAddress, activationAmount] = await Promise.all([
      payment.usdt(), payment.treasury(), payment.activationAmount(),
    ]);
    if (env.USDT_CONTRACT_ADDRESS && tokenAddress.toLowerCase() !== env.USDT_CONTRACT_ADDRESS.toLowerCase()) {
      throw Object.assign(new Error('Payment token does not match backend configuration.'), { statusCode: 400 });
    }
    if (env.COMPANY_WALLET_ADDRESS && treasuryAddress.toLowerCase() !== env.COMPANY_WALLET_ADDRESS.toLowerCase()) {
      throw Object.assign(new Error('Treasury does not match backend configuration.'), { statusCode: 400 });
    }

    const eventInterface = new Interface(PAYMENT_ABI);
    const event = receipt.logs.map((log) => {
      try { return eventInterface.parseLog(log); } catch { return null; }
    }).find((parsed) => parsed?.name === 'Activated');
    if (!event) throw Object.assign(new Error('Activated event was not found in the transaction.'), { statusCode: 400 });
    const eventUser = String(event.args?.[0]).toLowerCase();
    const eventSponsor = String(event.args?.[1]).toLowerCase();
    const eventAmount = event.args?.[2];
    if (eventUser !== walletAddress || eventSponsor !== requestedSponsor || eventAmount !== activationAmount) {
      throw Object.assign(new Error('Activation event data failed verification.'), { statusCode: 400 });
    }

    return activationRepository.saveActivation({
      walletAddress,
      sponsorAddress: eventSponsor,
      transactionHash: input.transactionHash,
      amountUsd: Number(env.ACTIVATION_AMOUNT_USDT),
    });
  }
}

export const activationService = new ActivationService();
