/**
 * DAOvault AI — Web3 Wallet Management Engine (TypeScript)
 * EIP-6963 + Injected Provider + BSC Network Switching
 */

import { BSC_CHAIN_ID, BSC_CHAIN_HEX, formatAddress, showToast } from './core.ts';
import type { EIP6963ProviderDetail, WalletOption } from './types.ts';
import { BrowserProvider, type JsonRpcSigner } from 'ethers';

// BSC Network Parameters for wallet_addEthereumChain
export const BSC_PARAMS = {
  chainId: BSC_CHAIN_HEX,
  chainName: BSC_CHAIN_ID === 97 ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain Mainnet',
  nativeCurrency: { name: BSC_CHAIN_ID === 97 ? 'tBNB' : 'BNB', symbol: BSC_CHAIN_ID === 97 ? 'tBNB' : 'BNB', decimals: 18 },
  rpcUrls: [import.meta.env.VITE_BSC_RPC_URL || (BSC_CHAIN_ID === 97 ? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545' : 'https://bsc-dataseed.binance.org/')],
  blockExplorerUrls: [BSC_CHAIN_ID === 97 ? 'https://testnet.bscscan.com/' : 'https://bscscan.com/'],
};

// Wallet discovery map (EIP-6963)
const discoveredWallets = new Map<string, EIP6963ProviderDetail>();
let activeProvider: any = null;
let currentAccount: string | null = null;

// Declare global ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

// EIP-6963 Provider Announcement Listener
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    const { info, provider } = event.detail || {};
    if (info && provider) {
      discoveredWallets.set(info.uuid, { info, provider });
      console.log(`[DAOvault Wallet TS] Discovered wallet: ${info.name}`);
      window.dispatchEvent(new CustomEvent('daovault:walletsUpdated'));
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/**
 * Detect all installed and announced EVM providers
 */
export function getInstalledWallets(): WalletOption[] {
  const wallets: WalletOption[] = [];
  const seenProviders = new Set<any>();

  // 1. EIP-6963 Announced Wallets
  discoveredWallets.forEach(({ info, provider }) => {
    seenProviders.add(provider);
    wallets.push({
      id: info.rdns || info.uuid,
      name: info.name,
      icon: info.icon,
      provider,
    });
  });

  // 2. Fallback to injected globals: window.ethereum (and its .providers list) plus the
  // wallet-specific objects some in-app browsers inject instead of or before window.ethereum
  injectedProviders().forEach((p: any) => {
    if (!seenProviders.has(p)) {
      seenProviders.add(p);
      // brand flags first: Trust, SafePal, Binance, OKX and Coinbase also set isMetaMask
      // for compatibility, so checking MetaMask first mislabelled them
      let name = 'Browser Wallet';
      if (p.isTrust || p.isTrustWallet) name = 'Trust Wallet';
      else if (p.isSafePal) name = 'SafePal';
      else if (p.isBinance || p.isBinanceChain) name = 'Binance Wallet';
      else if (p.isOkxWallet || p.isOKExWallet) name = 'OKX Wallet';
      else if (p.isCoinbaseWallet) name = 'Coinbase Wallet';
      else if (p.isMetaMask) name = 'MetaMask';

      wallets.push({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        icon: null,
        provider: p,
      });
    }
  });

  return wallets;
}

function injectedProviders(): any[] {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  const eth = w.ethereum;
  const asProvider = (x: any) => (x && typeof x.request === 'function' ? x : null);
  return [
    ...(eth?.providers?.length ? eth.providers : [eth]),
    asProvider(w.trustwallet) || asProvider(w.trustwallet?.ethereum),
    asProvider(w.binancew3w?.ethereum),
    asProvider(w.okxwallet),
  ].filter(asProvider);
}

/** In-app wallet browsers inject their provider a moment after load: wait for it (or give up after `ms`). */
export async function waitForWallet(ms = 3000): Promise<boolean> {
  for (let t = 0; t < ms && getInstalledWallets().length === 0; t += 100) {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise((r) => setTimeout(r, 100));
  }
  return getInstalledWallets().length > 0;
}

/** True once this tab was opened inside a wallet app by our Connect link (dv_connect). */
export function isInWalletApp(): boolean {
  try { return sessionStorage.getItem('dv_in_wallet_app') === '1'; } catch { return false; }
}

/**
 * Check if user is on mobile
 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let pendingConnect: Promise<string> | null = null;

/**
 * Connect to a specific Web3 provider with BSC Network Verification
 */
export function connectWithProvider(provider: any, walletName: string = 'Wallet'): Promise<string> {
  // A second tap while the wallet prompt is open would make the wallet reject it
  // ("request already pending", -32002): share the running attempt instead.
  if (!pendingConnect) {
    pendingConnect = doConnect(provider, walletName).finally(() => { pendingConnect = null; });
  }
  return pendingConnect;
}

async function doConnect(provider: any, walletName: string): Promise<string> {
  try {
    showToast(`Connecting to ${walletName}...`);

    // 1. Request account access
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned from wallet.');
    }

    const account = accounts[0].toLowerCase();
    activeProvider = provider;
    currentAccount = account;

    // 2. Validate BSC Network (Chain ID 56)
    await ensureBSCNetwork(provider);

    // 3. Persist session
    localStorage.setItem('daovault_connected_account', account);
    localStorage.setItem('daovault_connected_wallet', walletName);

    // 4. Wire account & chain change listeners
    wireProviderEvents(provider);

    showToast(`Connected: ${formatAddress(account)}`);
    window.dispatchEvent(new CustomEvent('daovault:accountConnected', { detail: { account, walletName } }));

    return account;
  } catch (err: any) {
    console.error('[DAOvault] Connection error:', err);
    if (err.code === 4001 || /rejected/i.test(err.message)) {
      showToast('Connection request was rejected.', true);
    } else {
      showToast(err.message || 'Could not connect wallet.', true);
    }
    throw err;
  }
}

/**
 * Ensure user is on the configured BSC network, prompt switch or add chain if necessary
 */
export async function ensureBSCNetwork(provider: any): Promise<void> {
  try {
    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    if (chainId !== BSC_CHAIN_ID) {
      console.log(`[DAOvault] Wrong chain (${chainId}), requesting switch to BSC (${BSC_CHAIN_ID})...`);
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_HEX }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902 || /unrecognized/i.test(switchError.message)) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [BSC_PARAMS],
          });
        } else {
          throw switchError;
        }
      }
    }
  } catch (err) {
    console.warn('[DAOvault] Network switch warning:', err);
    showToast(`Please switch your wallet to ${BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet'}.`, true);
  }
}

/**
 * Before a transaction: asks the wallet to switch to our BSC network if needed and
 * throws a clear error if it is still elsewhere. Call it before creating a BrowserProvider
 * (ethers rejects calls when the network changes under an existing one).
 */
export async function requireBSCNetwork(provider: any): Promise<void> {
  await ensureBSCNetwork(provider);
  const chainId = parseInt(await provider.request({ method: 'eth_chainId' }), 16);
  if (chainId !== BSC_CHAIN_ID) {
    throw new Error(`Switch your wallet to ${BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BNB Smart Chain'} and try again.`);
  }
}

/** Signer for exactly `address`, with a clear message when the wallet has another account selected. */
export async function getSignerFor(provider: any, address: string): Promise<JsonRpcSigner> {
  try {
    return await new BrowserProvider(provider).getSigner(address);
  } catch (err: any) {
    if (err?.code === 4001) throw err;
    console.warn('[DAOvault] getSigner failed:', err);
    throw new Error(`Select account ${formatAddress(address)} in your wallet and try again.`);
  }
}

/**
 * Wire accountsChanged and chainChanged listeners
 */
const wiredProviders = new WeakSet<object>();

function wireProviderEvents(provider: any): void {
  if (!provider || !provider.on || wiredProviders.has(provider)) return;
  wiredProviders.add(provider);

  provider.on('accountsChanged', (accounts: string[]) => {
    // Logged out (or never connected on this page): the wallet's events no longer count.
    // Trust re-emits the account right after Log out, which used to save it again and
    // show the member as still connected on the landing page.
    if (!currentAccount) return;
    if (!accounts || accounts.length === 0) {
      // Phone wallets (Trust) emit an empty list around page loads without the member
      // disconnecting; only desktop extensions mean it (lock / disconnect site).
      if (!isMobileDevice()) disconnectWallet();
    } else if (accounts[0].toLowerCase() === currentAccount) {
      // Trust and others re-emit the same account when a listener attaches or the page
      // loads: not a change. Reacting to it reloaded the dashboard in a loop.
      return;
    } else {
      currentAccount = accounts[0].toLowerCase();
      localStorage.setItem('daovault_connected_account', currentAccount);
      showToast(`Account changed: ${formatAddress(currentAccount)}`);
      window.dispatchEvent(new CustomEvent('daovault:accountChanged', { detail: { account: currentAccount } }));
    }
  });

  // No page reload here: wallets (Trust especially) fire chainChanged while switching to BSC
  // during connect, and the reload threw the connection away. Payments re-check the chain.
  provider.on('chainChanged', (chainHex: string) => {
    const chainId = parseInt(chainHex, 16);
    window.dispatchEvent(new CustomEvent('daovault:chainChanged', { detail: { chainId } }));
    if (currentAccount && chainId !== BSC_CHAIN_ID) {
      showToast(`Switch your wallet back to ${BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BNB Smart Chain'} to use DAOVAULT.`, true);
    }
  });
}

/**
 * Disconnect current wallet
 */
export function disconnectWallet(): void {
  currentAccount = null;
  activeProvider = null;
  localStorage.removeItem('daovault_connected_account');
  localStorage.removeItem('daovault_connected_wallet');
  showToast('Wallet disconnected.');
  window.dispatchEvent(new Event('daovault:disconnected'));
}

/**
 * Opening the site in a wallet that sits on another network (Ethereum, or BSC Mainnet on the
 * testnet build): ask to switch to ours (adding it if the wallet lacks it). Once per tab and
 * without blocking the page; payments and payouts still enforce it (requireBSCNetwork).
 */
async function askNetworkOnce(provider: any): Promise<void> {
  try {
    if (parseInt(await provider.request({ method: 'eth_chainId' }), 16) === BSC_CHAIN_ID) return;
    if (sessionStorage.getItem('dv_net_asked')) return;
    sessionStorage.setItem('dv_net_asked', '1');
  } catch { /* storage blocked or no chain id: still try once */ }
  await ensureBSCNetwork(provider);
}

/**
 * Check if a session is already cached
 */
export async function autoReconnect(): Promise<string | null> {
  const cached = localStorage.getItem('daovault_connected_account');
  if (!cached) return null;

  // EIP-6963 wallets announce asynchronously: on a fresh page load (or refresh of the
  // dashboard) none may be known yet, which used to bounce members back to the landing page.
  // Phones get longer: in-app browsers (Trust, Binance) inject late.
  await waitForWallet(isMobileDevice() ? 3000 : 1500);

  // Try the wallet the member connected with first, then every other installed wallet.
  const savedName = localStorage.getItem('daovault_connected_wallet');
  const installed = getInstalledWallets().sort((a, b) => Number(b.name === savedName) - Number(a.name === savedName));
  for (const wallet of installed) {
    try {
      const accounts: string[] = await wallet.provider.request({ method: 'eth_accounts' });
      const match = accounts?.find((a) => a.toLowerCase() === cached.toLowerCase());
      if (match) {
        activeProvider = wallet.provider;
        currentAccount = match.toLowerCase();
        wireProviderEvents(wallet.provider);
        void askNetworkOnce(wallet.provider);
        return currentAccount;
      }
    } catch (e) {
      console.warn(`[DAOvault] Auto-reconnect via ${wallet.name} failed:`, e);
    }
  }

  // Inside a phone wallet's own browser (Trust especially) eth_accounts often returns []
  // after a page load until the site asks again. Asking there is silent for a site the
  // member already approved, so do that instead of bouncing them to the landing page
  // (which, with Connect redirecting back here, made the page reload in a loop).
  if (isMobileDevice() && installed.length) {
    try {
      const accounts: string[] = await installed[0].provider.request({ method: 'eth_requestAccounts' });
      if (accounts?.length) {
        activeProvider = installed[0].provider;
        currentAccount = accounts[0].toLowerCase();
        localStorage.setItem('daovault_connected_account', currentAccount);
        wireProviderEvents(activeProvider);
        void askNetworkOnce(activeProvider);
        return currentAccount;
      }
    } catch (e) {
      console.warn('[DAOvault] In-app reconnect failed:', e);
    }
  }
  return null;
}

/**
 * The account of a wallet that is connected right now (connect or autoReconnect
 * verified it), unlike getCurrentAccount() which also returns a saved address left
 * over from a locked or missing wallet.
 */
export function getLiveAccount(): string | null {
  return activeProvider ? currentAccount : null;
}

export function getCurrentAccount(): string | null {
  return currentAccount || localStorage.getItem('daovault_connected_account');
}

export function getActiveProvider(): any {
  return activeProvider;
}
