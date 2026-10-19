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
export const REAL_PAYMENTS_LOCKED =
  BSC_CHAIN_ID !== 97 && import.meta.env.VITE_ALLOW_MAINNET_PAYMENTS !== 'true';
export const REAL_PAYMENTS_LOCKED_MSG =
  'Payments are switched off while DAOVAULT is in development. No real USDT is charged.';

export function isPaymentConfigured(): boolean {
  return isAddress(PAYMENT_ADDRESS) && isAddress(TOKEN_ADDRESS);
}

/**
 * Invite code -> sponsor wallet. Empty code = no sponsor. Throws a clear message when the
 * code is unknown, so a member never pays without the sponsor they were invited by.
 */
export async function resolveSponsor(
  code: string,
  self: string,
): Promise<{ wallet: string; code: string | null; activated: boolean }> {
  const clean = code.trim().toUpperCase();
  if (!clean) return { wallet: ZeroAddress, code: null, activated: true };
  try {
    const sponsor = await getSponsorByCode(clean);
    if (sponsor.walletAddress.toLowerCase() === self.toLowerCase())
      return { wallet: ZeroAddress, code: null, activated: true };
    // activated = paid (or the company root); an unpaid sponsor can sponsor (pre-launch teams)
    return {
      wallet: sponsor.walletAddress,
      code: sponsor.referralCode,
      activated: sponsor.activated !== false,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`Invite code ${clean} was not found. Check your invite link.`);
    }
    throw new Error('Could not check your invite code right now. Please try again.');
  }
}

/**
 * The server records a payment only once its block is final on BNB Smart Chain (a few seconds); while it
 * is still confirming it answers 503. Try again a few times before giving up (the payment is then kept as
 * pending and retried on the next visit).
 */
async function untilRecorded<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 503) || attempt >= 3) throw error;
      showToast('Confirming your payment on BNB Smart Chain...');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

/**
 * A payment the browser has sent but the server has not recorded yet (owner 2026-10-19: the browser may
 * close at any moment). It is saved the moment the wallet SENDS the transaction, not after it is mined,
 * so closing the page while it confirms loses nothing: the next visit records it (retryPendingActivation),
 * and on the VPS the chain indexer records it on its own as well.
 */
type PendingPayment = { hash: string; wallet: string; sponsor?: string; kind?: 'topup'; at?: number };
/** a saved transaction the server keeps refusing (never mined: cancelled or dropped) is forgotten after this */
const PENDING_GIVE_UP_MS = 10 * 60_000;

function readPending(walletAddress: string): PendingPayment | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_TX_KEY) || 'null') as PendingPayment | null;
    return saved && saved.wallet === walletAddress.toLowerCase() ? saved : null;
  } catch {
    return null;
  }
}
function savePending(record: PendingPayment): void {
  try {
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify({ ...record, at: Date.now() }));
  } catch {
    /* storage blocked: the chain indexer still records the payment */
  }
}
function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_TX_KEY);
  } catch {
    /* ignore */
  }
}

/** Does this browser hold a payment that is still waiting to be recorded? */
export const hasPendingPayment = (walletAddress: string) => Boolean(readPending(walletAddress));

/** A paid activation / top-up whose backend check failed (closed page, network) is retried on the next visit. */
export async function retryPendingActivation(walletAddress: string): Promise<boolean> {
  const saved = readPending(walletAddress);
  if (!saved) return false;
  try {
    if (saved.kind === 'topup') await verifyTopUp({ walletAddress, transactionHash: saved.hash });
    else
      await verifyActivation({
        walletAddress,
        transactionHash: saved.hash,
        sponsorAddress: saved.sponsor ?? ZeroAddress,
      });
  } catch (error) {
    // refused for good (never mined, or not a payment) and old enough: forget it, so it never blocks
    const refused = error instanceof ApiError && error.status >= 400 && error.status < 500;
    if (refused && Date.now() - (saved.at ?? 0) > PENDING_GIVE_UP_MS) clearPending();
    throw error;
  }
  clearPending();
  return true;
}

/**
 * Before a new payment: a previous one from this browser that is still being recorded is settled first,
 * so a member who thinks it failed never pays twice by mistake.
 */
async function settlePreviousPayment(walletAddress: string): Promise<void> {
  if (!readPending(walletAddress)) return;
  let recorded = false;
  try {
    recorded = await retryPendingActivation(walletAddress);
  } catch {
    if (readPending(walletAddress))
      throw new Error('Your previous payment is still being confirmed. Please wait a minute and refresh this page.');
    return; // it was forgotten (never went through): the new payment can go ahead
  }
  if (recorded)
    throw new Error('Your previous payment has just been confirmed. Please refresh this page to see it.');
}

/**
 * Shared checks before any $300 payment: payments allowed, contracts configured, wallet on
 * our BSC network, and the deployed contract's token and amount match this build.
 */
async function preparePayment() {
  if (REAL_PAYMENTS_LOCKED) throw new Error(REAL_PAYMENTS_LOCKED_MSG);
  if (!isPaymentConfigured()) {
    throw new Error(
      'Payment contract is not configured. Add VITE_PAYMENT_CONTRACT_ADDRESS and VITE_USDT_CONTRACT_ADDRESS.',
    );
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
async function approveOnePayment(
  token: Contract,
  walletAddress: string,
  contractAmount: bigint,
): Promise<void> {
  const allowance = await token.allowance(walletAddress, PAYMENT_ADDRESS);
  if (allowance < contractAmount) {
    showToast('Approve the $300 in your wallet...');
    const approval = await token.approve(PAYMENT_ADDRESS, contractAmount);
    await approval.wait();
  }
}

export async function activateWallet(sponsorAddress = ZeroAddress): Promise<string> {
  const { walletAddress, token, payment, contractAmount } = await preparePayment();
  await settlePreviousPayment(walletAddress);
  const alreadyActivated = await payment.isActivated(walletAddress);
  if (alreadyActivated) throw new Error('This wallet is already activated.');
  await approveOnePayment(token, walletAddress, contractAmount);

  showToast('Confirm activation payment in your wallet...');
  const sponsor = isAddress(sponsorAddress) ? sponsorAddress : ZeroAddress;
  const activation = await payment.activate(sponsor);
  // saved at once: a page closed while it confirms is recorded on the next visit
  savePending({ hash: activation.hash, wallet: walletAddress.toLowerCase(), sponsor });
  await activation.wait();
  await untilRecorded(() =>
    verifyActivation({
      walletAddress,
      transactionHash: activation.hash,
      sponsorAddress: sponsor,
    }),
  );
  clearPending();
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
  await settlePreviousPayment(walletAddress);
  if (!(await payment.isActivated(walletAddress)))
    throw new Error('Activate this wallet before a top-up.');
  await approveOnePayment(token, walletAddress, contractAmount);
  showToast('Confirm the $300 top-up in your wallet...');
  const topUp = await payment.topUp();
  // saved at once: a page closed while it confirms is recorded on the next visit (never paid twice)
  savePending({ hash: topUp.hash, wallet: walletAddress.toLowerCase(), kind: 'topup' });
  await topUp.wait();
  await untilRecorded(() => verifyTopUp({ walletAddress, transactionHash: topUp.hash }));
  clearPending();
  return topUp.hash;
}
