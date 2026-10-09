/**
 * Member sign-in session (owner, 2026-10-09). The wallet signs a free EIP-4361 (Sign-In with
 * Ethereum) message from the server and gets a JWT, which the dashboard API requires: a
 * vault opens only for its own wallet.
 * The token lives in sessionStorage (ends when the tab closes) and Log out removes it.
 */
import { getAuthChallenge, verifyAuthSignature } from './api.ts';
import { getActiveProvider, getSignerFor } from './wallet.ts';
import { showToast } from './core.ts';

const PREFIX = 'daovault_session_';
const KEY = (wallet: string) => `${PREFIX}${wallet.toLowerCase()}`;
const pending = new Map<string, Promise<string>>();

// tokens from older builds sat in localStorage for 12h: drop them
try {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
} catch { /* storage blocked */ }

export function savedSession(wallet: string): string | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY(wallet)) || 'null') as { token: string; expiresAt: string } | null;
    if (raw && new Date(raw.expiresAt).getTime() > Date.now() + 60_000) return raw.token;
  } catch { /* ignore */ }
  return null;
}

export function clearSession(wallet: string): void {
  try { sessionStorage.removeItem(KEY(wallet)); } catch { /* ignore */ }
}

/** Log out: every saved session in this tab. */
export function clearAllSessions(): void {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

export const isUserRejection = (error: unknown): boolean => {
  const code = (error as { code?: string | number })?.code;
  return code === 'ACTION_REJECTED' || code === 4001;
};

/** The saved session, or a new one: the wallet signs the server's one-time message (no gas). */
export function signIn(wallet: string): Promise<string> {
  const existing = savedSession(wallet);
  if (existing) return Promise.resolve(existing);
  const key = wallet.toLowerCase();
  const running = pending.get(key);
  if (running) return running; // one signature prompt at a time
  const job = (async () => {
    const provider = getActiveProvider();
    if (!provider) throw new Error('Reconnect your wallet to sign in.');
    const { message } = await getAuthChallenge(wallet);
    showToast('Sign the message in your wallet (free, no gas)...');
    const signer = await getSignerFor(provider, wallet);
    const signature = await signer.signMessage(message);
    const session = await verifyAuthSignature(wallet, signature);
    try { sessionStorage.setItem(KEY(wallet), JSON.stringify({ token: session.token, expiresAt: session.expiresAt })); } catch { /* ignore */ }
    return session.token;
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
