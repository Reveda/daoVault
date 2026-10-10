import { Contract, ZeroAddress, parseUnits } from 'ethers';
import { BSC_CHAIN_ID, showToast } from './core.ts';
import { getActiveProvider, getCurrentAccount, getSignerFor, requireBSCNetwork } from './wallet.ts';
import { ApiError, getSponsorByCode, verifyActivation, verifyTopUp } from './api.ts';

const PENDING_TX_KEY = 'daovault_pending_activation_tx';

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
  'function topUp()',
  'function isActivated(address user) view returns (bool)',
];

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Development lock: real-money payments (any chain but BSC Testnet 97) stay switched off
 * until the owner sets VITE_ALLOW_MAINNET_PAYMENTS=true for launch. Covers the $300
 * activation and the instant payout claim. Testnet is never blocked.
 */
export const REAL_PAYMENTS_LOCKED = BSC_CHAIN_ID !== 97 && import.meta.env.VITE_ALLOW_MAINNET_PAYMENTS !== 'true';
export const REAL_PAYMENTS_LOCKED_MSG = 'Payments are switched off while DAOVAULT is in development. No real USDT is charged.';

export function isPaymentConfigured(): boolean {
  return isAddress(PAYMENT_ADDRESS) && isAddress(TOKEN_ADDRESS);
}

/**
 * Invite code -> sponsor wallet. Empty code = no sponsor. Throws a clear message when the
 * code is unknown, so a member never pays without the sponsor they were invited by.
 */
export async function resolveSponsor(code: string, self: string): Promise<{ wallet: string; code: string | null }> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { wallet: ZeroAddress, code: null };
  try {
    const sponsor = await getSponsorByCode(clean);
    if (sponsor.walletAddress.toLowerCase() === self.toLowerCase()) return { wallet: ZeroAddress, code: null };
    return { wallet: sponsor.walletAddress, code: sponsor.referralCode };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`Invite code ${clean} is not an active DAOvault member. Check your invite link.`);
    }
    throw new Error('Could not check your invite code right now. Please try again.');
  }
}

/** A paid activation whose backend check failed (network etc.) is retried on the next visit. */
export async function retryPendingActivation(walletAddress: string): Promise<boolean> {
  let saved: { hash: string; wallet: string; sponsor?: string; kind?: 'topup' } | null = null;
  try { saved = JSON.parse(localStorage.getItem(PENDING_TX_KEY) || 'null'); } catch { /* ignore */ }
  if (!saved || saved.wallet !== walletAddress.toLowerCase()) return false;
  if (saved.kind === 'topup') await verifyTopUp({ walletAddress, transactionHash: saved.hash });
  else await verifyActivation({ walletAddress, transactionHash: saved.hash, sponsorAddress: saved.sponsor ?? ZeroAddress });
  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
  return true;
}

/**
 * Shared checks before any $300 payment: payments allowed, contracts configured, wallet on
 * our BSC network, and the deployed contract's token and amount match this build.
 */
async function preparePayment() {
  if (REAL_PAYMENTS_LOCKED) throw new Error(REAL_PAYMENTS_LOCKED_MSG);
  if (!isPaymentConfigured()) {
    throw new Error('Payment contract is not configured. Add VITE_PAYMENT_CONTRACT_ADDRESS and VITE_USDT_CONTRACT_ADDRESS.');
  }

  const providerObject = getActiveProvider();
  const walletAddress = getCurrentAccount();
  if (!providerObject || !walletAddress) throw new Error('Connect your wallet first.');

  await requireBSCNetwork(providerObject);
  // the dashboard's wallet signs, not whichever account happens to be selected in the wallet
  const signer = await getSignerFor(providerObject, walletAddress);
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

  return { walletAddress, token, payment, contractAmount };
}

/** USDT approval for exactly one payment, if the current one is not enough. */
async function approveOnePayment(token: Contract, walletAddress: string, contractAmount: bigint): Promise<void> {
  const allowance = await token.allowance(walletAddress, PAYMENT_ADDRESS);
  if (allowance < contractAmount) {
    showToast('Approve the $300 in your wallet...');
    const approval = await token.approve(PAYMENT_ADDRESS, contractAmount);
    await approval.wait();
  }
}

export async function activateWallet(sponsorAddress = ZeroAddress): Promise<string> {
  const { walletAddress, token, payment, contractAmount } = await preparePayment();
  const alreadyActivated = await payment.isActivated(walletAddress);
  if (alreadyActivated) throw new Error('This wallet is already activated.');
  await approveOnePayment(token, walletAddress, contractAmount);

  showToast('Confirm activation payment in your wallet...');
  const activation = await payment.activate(isAddress(sponsorAddress) ? sponsorAddress : ZeroAddress);
  await activation.wait();

  const sponsor = isAddress(sponsorAddress) ? sponsorAddress : ZeroAddress;
  try { localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ hash: activation.hash, wallet: walletAddress.toLowerCase(), sponsor })); } catch { /* ignore */ }
  await verifyActivation({ walletAddress, transactionHash: activation.hash, sponsorAddress: sponsor });
  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
  return activation.hash;
}

/**
 * Re-entry (owner, 2026-10-10): once every package has reached its cap, the member buys a new
 * $300 package from the same wallet (same ID, same team). The contract only takes the payment;
 * the backend verifies the ToppedUp event and adds the package. A failed backend check is
 * retried on the next visit (retryPendingActivation).
 */
export async function topUpWallet(): Promise<string> {
  const { walletAddress, token, payment, contractAmount } = await preparePayment();
  if (!(await payment.isActivated(walletAddress))) throw new Error('Activate this wallet before a top-up.');
  await approveOnePayment(token, walletAddress, contractAmount);
  showToast('Confirm the $300 top-up in your wallet...');
  const topUp = await payment.topUp();
  await topUp.wait();
  try { localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ hash: topUp.hash, wallet: walletAddress.toLowerCase(), kind: 'topup' })); } catch { /* ignore */ }
  await verifyTopUp({ walletAddress, transactionHash: topUp.hash });
  try { localStorage.removeItem(PENDING_TX_KEY); } catch { /* ignore */ }
  return topUp.hash;
}
