import { BrowserProvider, Contract, ZeroAddress, parseUnits } from 'ethers';
import { BSC_CHAIN_ID, showToast } from './core.ts';
import { getActiveProvider, getCurrentAccount } from './wallet.ts';
import { verifyActivation } from './api.ts';

const PAYMENT_ADDRESS = String(import.meta.env.VITE_PAYMENT_CONTRACT_ADDRESS || '').trim();
const TOKEN_ADDRESS = String(import.meta.env.VITE_USDT_CONTRACT_ADDRESS || '').trim();
const ACTIVATION_AMOUNT = String(import.meta.env.VITE_ACTIVATION_AMOUNT_USDT || '300');

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const PAYMENT_ABI = [
  'function usdt() view returns (address)',
  'function activationAmount() view returns (uint256)',
  'function activate(address sponsor)',
  'function isActivated(address user) view returns (bool)',
];

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isPaymentConfigured(): boolean {
  return isAddress(PAYMENT_ADDRESS) && isAddress(TOKEN_ADDRESS);
}

export async function activateWallet(sponsorAddress = ZeroAddress): Promise<string> {
  if (!isPaymentConfigured()) {
    throw new Error('Payment contract is not configured. Add VITE_PAYMENT_CONTRACT_ADDRESS and VITE_USDT_CONTRACT_ADDRESS.');
  }

  const providerObject = getActiveProvider();
  const walletAddress = getCurrentAccount();
  if (!providerObject || !walletAddress) throw new Error('Connect your wallet first.');

  const provider = new BrowserProvider(providerObject);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== BSC_CHAIN_ID) {
    throw new Error(`Switch MetaMask to ${BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet'}.`);
  }

  const signer = await provider.getSigner();
  const token = new Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
  const payment = new Contract(PAYMENT_ADDRESS, PAYMENT_ABI, signer);
  const configuredToken = String(await payment.usdt()).toLowerCase();
  if (configuredToken !== TOKEN_ADDRESS.toLowerCase()) {
    throw new Error('Configured token does not match the deployed payment contract.');
  }

  const decimals = Number(await token.decimals());
  const contractAmount = await payment.activationAmount();
  const requestedAmount = parseUnits(ACTIVATION_AMOUNT, decimals);
  if (contractAmount !== requestedAmount) {
    throw new Error('Configured activation amount does not match the deployed payment contract.');
  }

  const alreadyActivated = await payment.isActivated(walletAddress);
  if (alreadyActivated) throw new Error('This wallet is already activated.');

  const allowance = await token.allowance(walletAddress, PAYMENT_ADDRESS);
  if (allowance < contractAmount) {
    showToast('Approve the activation amount in your wallet...');
    const approval = await token.approve(PAYMENT_ADDRESS, contractAmount);
    await approval.wait();
  }

  showToast('Confirm activation payment in your wallet...');
  const activation = await payment.activate(isAddress(sponsorAddress) ? sponsorAddress : ZeroAddress);
  await activation.wait();

  await verifyActivation({
    walletAddress,
    transactionHash: activation.hash,
    sponsorAddress: isAddress(sponsorAddress) ? sponsorAddress : ZeroAddress,
  });
  return activation.hash;
}
