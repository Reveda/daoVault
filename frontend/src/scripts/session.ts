/**
 * Member sign-in session (owner, 2026-10-09).
 *  - The wallet signs a free EIP-4361 (Sign-In with Ethereum) message once.
 *  - The server answers with a short ACCESS token (kept in memory only, never in storage)
 *    and sets a REFRESH token as an httpOnly cookie that page scripts cannot read.
 *  - When the access token is missing (new tab, reload) or expiring, the cookie gets a new one
 *    silently, so the member signs again only after the refresh token expires (30 days),
 *    after Log out, or when the wallet changes.
 */
import { ApiError, getAuthChallenge, logoutAuthSession, refreshAuthSession, verifyAuthSignature } from './api.ts';
import { hexlify, toUtf8Bytes } from 'ethers';
import { getActiveProvider } from './wallet.ts';
import { showToast } from './core.ts';

type Access = { wallet: string; token: string; expiresAt: number };
let access: Access | null = null;
const pending = new Map<string, Promise<string>>();

// tokens from older builds sat in localStorage / sessionStorage: drop them
for (const getStore of [() => localStorage, () => sessionStorage]) {
  try {
    const store = getStore(); // even reading the property throws when storage is blocked
    Object.keys(store).filter((k) => k.startsWith('daovault_session_')).forEach((k) => store.removeItem(k));
  } catch { /* storage blocked */ }
}

const remember = (wallet: string, token: string, expiresAt: string) => {
  access = { wallet: wallet.toLowerCase(), token, expiresAt: new Date(expiresAt).getTime() };
  return token;
};

/** The in-memory access token for this wallet, if it is still valid for at least a minute. */
export function savedSession(wallet: string): string | null {
  return access && access.wallet === wallet.toLowerCase() && access.expiresAt > Date.now() + 60_000 ? access.token : null;
}

/** Forget the access token (e.g. the server said it ended); the next call refreshes. */
export function clearSession(wallet: string): void {
  if (access?.wallet === wallet.toLowerCase()) access = null;
}

/** Log out this device: the server deletes the refresh token and clears the cookie. */
export async function logout(): Promise<void> {
  access = null;
  // at most 3s: a sleeping server (Render free plan) must not hold the member on the page;
  // offline, the refresh token still expires on its own
  await Promise.race([
    logoutAuthSession().catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, 3000)),
  ]);
}

export const isUserRejection = (error: unknown): boolean => {
  const code = (error as { code?: string | number })?.code;
  return code === 'ACTION_REJECTED' || code === 4001;
};

/** New access token from the refresh cookie, only if it belongs to this wallet. */
async function refreshFor(wallet: string): Promise<string | null> {
  try {
    const session = await refreshAuthSession();
    if (session.walletAddress.toLowerCase() !== wallet.toLowerCase()) return null; // another wallet signed in here
    return remember(wallet, session.token, session.expiresAt);
  } catch (error) {
    // no cookie / expired / revoked: sign in again. Server asleep or down: no signature
    // prompt for a session that is probably fine; the caller retries.
    if (error instanceof ApiError && error.status < 500) return null;
    throw error;
  }
}

/** Valid access token: memory, else the refresh cookie, else the wallet signs (no gas). */
export function signIn(wallet: string): Promise<string> {
  const existing = savedSession(wallet);
  if (existing) return Promise.resolve(existing);
  const key = wallet.toLowerCase();
  const running = pending.get(key);
  if (running) return running; // one refresh / signature prompt at a time
  const job = (async () => {
    const refreshed = await refreshFor(wallet);
    if (refreshed) return refreshed;
    const provider = getActiveProvider();
    if (!provider) throw new Error('Reconnect your wallet to sign in.');
    const { message } = await getAuthChallenge(wallet);
    showToast('Sign the message in your wallet (free, no gas)...');
    // straight personal_sign: signing a message needs no network, so a pending "switch to
    // BSC" prompt (autoReconnect) can never break it the way an ethers provider would
    const signature: string = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(message)), wallet] });
    const session = await verifyAuthSignature(wallet, signature);
    return remember(wallet, session.token, session.expiresAt);
  })();
  pending.set(key, job);
  job.finally(() => pending.delete(key)).catch(() => { /* handled by the caller */ });
  return job;
}

/**
 * Sign in, and if the member declines in the wallet, show a "Sign in to open your vault"
 * panel and wait until they sign (or log out). Other errors (server asleep...) are thrown
 * to the caller, which retries them.
 */
export async function requireSession(wallet: string, onLogout: () => void): Promise<string> {
  try {
    return await signIn(wallet);
  } catch (error) {
    if (!isUserRejection(error)) throw error;
  }
  return new Promise<string>((resolve) => {
    const gate = document.createElement('div');
    gate.className = 'sign-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'signGateTitle');
    gate.innerHTML = `
      <div class="sign-gate-card glass">
        <span class="mono sign-gate-tag">PRIVATE VAULT</span>
        <h3 id="signGateTitle">Sign in to open <span class="grad-text">your vault</span></h3>
        <p>Your wallet signs a free message: no gas, no transaction, nothing is approved. It proves this vault is yours, so nobody else can see your team and earnings.</p>
        <div class="sign-gate-actions">
          <button type="button" class="btn btn-grad" data-sign>Sign in with wallet</button>
          <button type="button" class="btn btn-line" data-out>Log out</button>
        </div>
      </div>`;
    document.body.appendChild(gate);
    const signBtn = gate.querySelector<HTMLButtonElement>('[data-sign]')!;
    signBtn.focus();
    signBtn.addEventListener('click', async () => {
      signBtn.disabled = true;
      try {
        const token = await signIn(wallet);
        gate.remove();
        resolve(token);
      } catch (error) {
        showToast(isUserRejection(error) ? 'Signing was cancelled. Your vault stays locked until you sign.' : error instanceof Error ? error.message : 'Sign-in failed.', true);
      } finally {
        signBtn.disabled = false;
      }
    });
    gate.querySelector('[data-out]')!.addEventListener('click', onLogout);
  });
}
