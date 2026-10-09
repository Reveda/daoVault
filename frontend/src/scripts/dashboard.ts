/**
 * DAOvault AI — DApp Dashboard Controller (TypeScript)
 * 25x Capping Meter, 20-Level Matrix Explorer, 50% Leg Breakdown, and 5% Withdrawal Portal
 */

import { init3DScene } from './scene.ts';
import {
  initReferralCapture,
  bootPreloader,
  formatAddress,
  showToast,
  showLaunchNotice,
  getPendingReferral,
  countUp,
  initOffscreenPause,
  enableTouchPress,
  BSC_CHAIN_ID,
} from './core.ts';
import {
  disconnectWallet,
  autoReconnect,
  getActiveProvider,
  getSignerFor,
  requireBSCNetwork,
} from './wallet.ts';
import { Contract } from 'ethers';
import type { LevelMatrixRow } from './types.ts';
import {
  ApiError,
  getAuthChallenge,
  getDashboardData,
  registerWallet,
  getWithdrawals,
  requestWithdrawal,
  confirmWithdrawal,
  verifyAuthSignature,
  type DashboardData,
  type WithdrawalSummary,
  type Withdrawal,
} from './api.ts';
import { activateWallet, isPaymentConfigured, resolveSponsor, retryPendingActivation, REAL_PAYMENTS_LOCKED, REAL_PAYMENTS_LOCKED_MSG } from './payment.ts';
import {
  prepareDashboardReveal,
  revealDashboard,
  rollNumber,
  initCardSpotlight,
  initMetricIcons3D,
  celebrate,
} from './dashboardFx.ts';
import { renderRewardVaults, initWalletMenu, RANK_TIERS } from './rewardVaults.ts';
import { initDvLogos } from './dvLogo.ts';
import { openLevelModal } from './levelModal.ts';

// 20-Level Matrix Specification with strict LevelMatrixRow interface
const LEVEL_MATRIX: LevelMatrixRow[] = [
  { level: 1, pct: 10, usd: 30, reqDirects: 0 },
  { level: 2, pct: 5, usd: 15, reqDirects: 2 },
  { level: 3, pct: 3, usd: 9, reqDirects: 3 },
  { level: 4, pct: 3, usd: 9, reqDirects: 5 },
  { level: 5, pct: 2, usd: 6, reqDirects: 7 },
  { level: 6, pct: 2, usd: 6, reqDirects: 9 },
  { level: 7, pct: 2, usd: 6, reqDirects: 10 },
  { level: 8, pct: 1, usd: 3, reqDirects: 15 },
  { level: 9, pct: 1, usd: 3, reqDirects: 15 },
  { level: 10, pct: 1, usd: 3, reqDirects: 15 },
  { level: 11, pct: 1, usd: 3, reqDirects: 15 },
  { level: 12, pct: 1, usd: 3, reqDirects: 15 },
  { level: 13, pct: 1, usd: 3, reqDirects: 15 },
  { level: 14, pct: 1, usd: 3, reqDirects: 15 },
  { level: 15, pct: 1, usd: 3, reqDirects: 15 },
  { level: 16, pct: 1, usd: 3, reqDirects: 15 },
  { level: 17, pct: 1, usd: 3, reqDirects: 15 },
  { level: 18, pct: 1, usd: 3, reqDirects: 15 },
  { level: 19, pct: 1, usd: 3, reqDirects: 15 },
  { level: 20, pct: 1, usd: 3, reqDirects: 15 },
];

document.addEventListener('DOMContentLoaded', async () => {
  initDvLogos(); // animated DAOVAULT logo: preloader, header, footer
  initOffscreenPause(); // looping CSS animations pause off screen
  enableTouchPress(); // smooth card press feedback on phones (iOS needs a touch listener)
  initReferralCapture();
  // the DAOvault mark forms while the wallet is checked; a calm galaxy once the member is in
  const scene = init3DScene('vault');
  prepareDashboardReveal();
  bootPreloader(() => revealDashboard());
  initCardSpotlight();
  initMetricIcons3D();

  // 1. Verify the live wallet provider. Never trust a cached address as auth.
  const account = await autoReconnect();
  if (!account) {
    showToast('Connect your wallet to open the live dashboard.', true);
    // tells the landing page not to send the member straight back here
    try { sessionStorage.setItem('dv_dash_bounce', '1'); } catch { /* storage blocked */ }
    window.setTimeout(() => { window.location.href = 'index.html'; }, 900);
    return;
  }

  // The dashboard always shows the wallet that is live right now: switching account in the
  // wallet loads that account's dashboard, disconnecting it in the wallet logs out.
  window.addEventListener('daovault:accountChanged', (e: Event) => {
    const next = (e as CustomEvent<{ account: string }>).detail?.account;
    if (next && next.toLowerCase() !== account.toLowerCase()) window.location.reload();
  });
  window.addEventListener('daovault:disconnected', () => {
    try { sessionStorage.setItem('dv_dash_bounce', '1'); } catch { /* storage blocked */ }
    window.location.href = 'index.html';
  });

  // pre-launch notice, once per browser (only for a real dashboard visit, not a bounce)
  showLaunchNotice('dashboard', 'We’ll be live soon',
    'Your vault and your permanent referral link are ready. The $300 activation and payouts open at launch. See you there!');

  // 2. Populate Header Account
  const userAddrEl = document.getElementById('dashWalletAddr');
  if (userAddrEl) {
    userAddrEl.textContent = formatAddress(account);
  }

  // 3. Setup Disconnect
  const logoutBtn = document.getElementById('dashLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      disconnectWallet();
      window.location.href = 'index.html';
    });
  }

  // 4. Wallet menu + nav
  initWalletMenu(account);
  initDashboardNavigation();

  // 5. A paid activation whose backend check failed last time is re-checked first
  if (await retryPendingActivation(account).catch(() => false)) showToast('Your activation was confirmed.');

  // 6. Load live dashboard data from the backend. There is no demo fallback:
  // an unknown wallet must be activated before it can show account data.
  // Render's free plan sleeps the API and the first request after that can fail or take
  // 30-50s, so network errors and 5xx are retried for about a minute before giving up.
  let dashboardData: DashboardData | null = null;
  // true when the server could not be reached: then we do NOT know whether this wallet is
  // activated, so no "Activate $300" card and no "activate to get your link" text
  let serverDown = false;
  let registered = false;
  let leaving = false;
  window.addEventListener('pagehide', () => { leaving = true; });
  const refInput = document.getElementById('dashRefLinkInput') as HTMLInputElement | null;
  if (refInput) refInput.value = 'Loading your invite link…';
  for (let attempt = 0; ; attempt++) {
    try {
      dashboardData = await getDashboardData(account);
      break;
    } catch (error) {
      if (leaving) return; // a navigation cancelled the request: not a server problem
      if (error instanceof ApiError && error.status === 404) {
        // first visit: give this wallet its permanent referral code, then load its dashboard
        if (!registered) {
          registered = true;
          if (await registerWallet(account).then(() => true, () => false)) continue;
        }
        showToast('Activate your wallet to unlock your dashboard.', true);
        break;
      }
      const retryable = !(error instanceof ApiError) || error.status >= 500;
      if (retryable && attempt < 12) {
        if (attempt === 0) showToast('Waking up the DAOvault server, one moment...');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error('[DAOvault] Dashboard API unavailable:', error);
      showToast('Could not reach the DAOvault server. Please refresh in a minute.', true);
      serverDown = true;
      break;
    }
  }

  const pkg = dashboardData?.packages?.[0];
  const totalEarned = toNumber(dashboardData?.totalEarned, 0);
  const capEarned = toNumber(pkg?.totalEarned, 0); // level income only: rank rewards sit outside the 25x cap
  const activeDirects = dashboardData?.activeDirects ?? 0;
  const maxCap = toNumber(pkg?.maxCapLimit, 0);
  const hasLiveData = dashboardData !== null;
  scene?.setScene('dash');

  initReferralLink(account, dashboardData, serverDown);
  initActivation(account, Boolean(pkg), serverDown);
  updateOverviewMetrics(activeDirects, totalEarned, capEarned, maxCap, dashboardData?.currentRank, pkg?.status);
  updateMemberDetails(dashboardData, Boolean(pkg), capEarned, maxCap);

  // 7. 25x capping gauge
  initCapMeter(capEarned, maxCap);

  // 7b. Rank reward vaults (surprise boxes)
  renderRewardVaults(account, dashboardData?.currentRank ?? 0);

  // 8. 20-level table, legs, income
  renderLevelTable(dashboardData);
  renderLegs(dashboardData);
  renderIncome(dashboardData);

  // 9. Withdrawals (wallet-signature sign-in)
  initWithdrawals(account, hasLiveData ? dashboardData!.availableUsd : 0, dashboardData);
});

/** No section nav on the dashboard: the logo just takes the member back to the top. */
function initDashboardNavigation(): void {
  document.querySelector<HTMLAnchorElement>('.top-header .brand')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initActivation(account: string, activated: boolean, serverDown = false): void {
  const card = document.getElementById('activationCard');
  const button = document.getElementById('dashActivateBtn') as HTMLButtonElement | null;
  const status = document.getElementById('activationStatus');
  // without the server we cannot tell an activated member from a new one: never offer
  // the $300 payment on a guess
  if (activated || serverDown) { card?.setAttribute('hidden', ''); return; }
  if (!button) return;
  if (REAL_PAYMENTS_LOCKED) {
    button.disabled = true;
    if (status) status.textContent = REAL_PAYMENTS_LOCKED_MSG;
    return;
  }
  if (!isPaymentConfigured()) {
    button.disabled = true;
    if (status) status.textContent = 'Payment contract is not configured yet.';
    return;
  }
  const code = getPendingReferral();
  if (status) status.textContent = code ? `Invited by ${code.replace(/[^A-Za-z0-9]/g, '')} · one-time $300 USDT` : 'Joining without a sponsor · one-time $300 USDT';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      // invite code -> sponsor wallet, checked before any payment
      const sponsor = await resolveSponsor(code, account);
      const txHash = await activateWallet(sponsor.wallet);
      if (status) status.textContent = `Confirmed: ${txHash.slice(0, 10)}...`;
      showToast('Activation verified on-chain. Refreshing dashboard...');
      document.getElementById('activationCard')?.classList.add('fx-celebrate');
      celebrate(button);
      window.setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Activation failed.', true);
      button.disabled = false;
    }
  });
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateOverviewMetrics(activeDirects: number, totalEarned: number, capEarned: number, maxCap: number, rank?: number, status?: string): void {
  const directsEl = document.getElementById('metricDirectsVal');
  const earnedEl = document.getElementById('metricEarnedVal');
  const capEl = document.getElementById('metricCapVal');
  const capStatusEl = document.getElementById('metricCapStatus');
  const rankEl = document.getElementById('metricRankVal');
  rollNumber(directsEl, activeDirects, (n) => Math.round(n).toLocaleString());
  rollNumber(earnedEl, totalEarned, formatUsd);
  if (capEl) {
    capEl.innerHTML = `<span class="cap-roll"></span> <span style="font-size: 1rem; color: var(--text-dim);">/ $${maxCap.toLocaleString()}</span>`;
    rollNumber(capEl.querySelector<HTMLElement>('.cap-roll'), capEarned, (n) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  }
  if (capStatusEl) {
    const capped = status === 'CAPPED';
    capStatusEl.textContent = capped ? '• Cap reached: re-entry needed' : maxCap > 0 ? '• Active package' : '• No live package';
    capStatusEl.style.color = capped ? 'var(--red)' : maxCap > 0 ? 'var(--green)' : 'var(--text-muted)';
  }
  if (rankEl) rankEl.textContent = typeof rank === 'number' && rank > 0 ? (RANK_TIERS[rank - 1]?.name ?? `Rank ${rank}`) : 'Unranked';
}

/** Header tag + metric captions, written from the live data so every line means something. */
function updateMemberDetails(data: DashboardData | null, active: boolean, capEarned: number, cap: number): void {
  const net = BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet';
  const tag = document.getElementById('dashMemberTag');
  if (tag) {
    tag.textContent = active ? `• Active member · ${net}` : data ? `• Not activated yet · ${net}` : `• Wallet connected · ${net}`;
    tag.classList.toggle('is-active', active);
  }
  const unlocked = data?.levelsUnlocked ?? 0;
  const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('metricDirectsNote', unlocked >= 20 ? 'All 20 levels unlocked' : `Levels unlocked: ${unlocked} / 20`);
  set('metricEarnedNote', cap > 0
    ? `Level $${(data?.levelIncomeUsd ?? 0).toLocaleString()} · Rank $${(data?.rankRewardsUsd ?? 0).toLocaleString()} · ${formatUsd(Math.max(cap - capEarned, 0))} to cap`
    : 'Activate the $300 package to start earning');
  const next = RANK_TIERS[data?.currentRank ?? 0];
  set('metricRankNote', next ? `Next: ${next.name} at ${next.volume.toLocaleString()} DAO` : 'Top rank reached');
}

/** Leg card: DAO matching toward the next rank (power leg vs other legs, each needs the full DAO). */
function renderLegs(data: DashboardData | null): void {
  const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const legs = data?.legs ?? { total: 0, power: 0, other: 0, count: 0 };
  const next = data?.nextRank;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  set('legTeamVal', `${fmt(data?.teamVolume ?? 0)} DAO`);
  set('legCountVal', String(legs.count));
  if (!next) {
    set('legNextTarget', '<strong>Top rank reached: Crown President</strong>');
    set('legPowerVal', `${fmt(legs.power)} DAO`);
    set('legOtherVal', `${fmt(legs.other)} DAO`);
    set('legCountedVal', `${fmt(legs.total)} DAO`);
    return;
  }
  // DAO matching: the rank's DAO is needed on EACH side; matched = the smaller side
  const need = next.volume;
  set('legNextTarget', `Next target: <strong>${next.name} &middot; ${need.toLocaleString()} DAO each side &middot; $${next.rewardUsd.toLocaleString()} reward</strong>`);
  set('legPowerVal', `${fmt(legs.power)} / ${fmt(need)} DAO`);
  set('legOtherVal', `${fmt(legs.other)} / ${fmt(need)} DAO`);
  set('legCountedVal', `${fmt(next.countedVolume)} / ${fmt(need)}`);
  window.setTimeout(() => {
    const p = document.getElementById('legPowerBar');
    const o = document.getElementById('legOtherBar');
    if (p) p.style.width = `${Math.min(100, (legs.power / need) * 100)}%`;
    if (o) o.style.width = `${Math.min(100, (legs.other / need) * 100)}%`;
  }, 400);
}

/** Latest level commissions and rank rewards. */
function renderIncome(data: DashboardData | null): void {
  const list = document.getElementById('incomeList');
  const split = document.getElementById('incomeSplit');
  if (split && data) split.textContent = `Level $${data.levelIncomeUsd.toLocaleString()} · Rank $${data.rankRewardsUsd.toLocaleString()}`;
  if (!list || !data?.recentEarnings.length) return;
  list.innerHTML = data.recentEarnings.map((e) => {
    const what = e.type === 'RANK_REWARD'
      ? `Rank reward &middot; ${RANK_TIERS[(e.level ?? 1) - 1]?.name ?? ''}`
      : `Level ${e.level} &middot; from ${formatAddress(e.from)}`;
    const when = new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `<li class="${e.type === 'RANK_REWARD' ? 'is-rank' : ''}"><span>${what}</span><span class="income-when">${when}</span><b>+${formatUsd(e.amountUsd)}</b></li>`;
  }).join('');
}

/**
 * Referral Link Copier
 */
function initReferralLink(account: string, data: DashboardData | null, serverDown = false): void {
  const inputEl = document.getElementById('dashRefLinkInput') as HTMLInputElement | null;
  const copyBtn = document.getElementById('dashCopyRefBtn');
  const sponsorTag = document.getElementById('dashSponsorTag');

  // the server's code wins (it is longer when the short one was already taken)
  const refCode = data?.referralCode ?? 'DV' + account.slice(2, 8).toUpperCase();
  const origin = window.location.origin;
  const fullLink = `${origin}/index.html?ref=${refCode}`;

  if (inputEl) {
    inputEl.value = data ? fullLink
      : serverDown ? 'Server unavailable · refresh in a minute to see your link'
      : 'Activate your ID to get your invite link';
  }
  const idEl = document.getElementById('dashMemberId');
  if (idEl) idEl.textContent = data ? refCode : '–';
  // every wallet gets its permanent link on its first visit; invites through it only
  // work once the wallet is activated (the contract accepts activated sponsors only)
  const activated = Boolean(data?.packages?.length);
  if (sponsorTag) {
    // before activation the sponsor is still the invite code this visitor arrived with
    const sponsor = data?.sponsorCode ?? (activated ? null : getPendingReferral());
    sponsorTag.innerHTML = sponsor ? `Sponsor <b>${sponsor.replace(/[^A-Za-z0-9]/g, '')}</b>` : 'Joined direct';
  }
  if (!data && copyBtn) (copyBtn as HTMLButtonElement).disabled = true;
  const copiedMsg = activated
    ? 'Referral link copied to clipboard!'
    : 'Link copied. It starts working for your invites once you activate your $300 ID.';

  if (copyBtn && inputEl) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullLink);
        showToast(copiedMsg);
        celebrate(copyBtn, 28);
      } catch (err) {
        inputEl.select();
        document.execCommand('copy');
        showToast(copiedMsg);
      }
    });
  }
}

/**
 * 25x Capping Meter Progress
 */
function initCapMeter(currentEarned: number, maxCap: number = 7500): void {
  const earnedEl = document.getElementById('capEarnedVal');
  const maxEl = document.getElementById('capMaxVal');
  const barEl = document.getElementById('capFillBar') as HTMLElement | null;
  const pctEl = document.getElementById('capPctText');

  const percentage = maxCap > 0
    ? Math.min(100, Math.round((currentEarned / maxCap) * 100))
    : 0;

  if (earnedEl) countUp(earnedEl, currentEarned, '$', 1000);
  if (maxEl) maxEl.textContent = `$${maxCap.toLocaleString()}`;
  if (pctEl) pctEl.textContent = `${percentage}% of 25× Cap Reached`;

  setTimeout(() => {
    if (barEl) barEl.style.width = `${percentage}%`;
  }, 300);
}

/**
 * 20-level table from the backend: unlock state, members at each depth and what that level paid.
 */
function renderLevelTable(data: DashboardData | null): void {
  const tbody = document.getElementById('levelTableBody');
  if (!tbody) return;
  const note = document.getElementById('levelTableNote');
  if (note) note.textContent = data ? `${data.levelsUnlocked} / 20 levels unlocked` : 'Live data required';

  tbody.innerHTML = '';
  LEVEL_MATRIX.forEach((row, idx) => {
    const live = data?.levels[idx];
    const isUnlocked = live ? live.unlocked : false;
    const tr = document.createElement('tr');
    tr.className = 'lvl-row';
    tr.style.setProperty('--i', String(idx));
    tr.innerHTML = `
      <td><strong>Level ${row.level}</strong></td>
      <td><span style="color: var(--gold); font-weight: 700;">${row.pct}%</span> ($${row.usd})</td>
      <td>${row.reqDirects === 0 ? '0 Directs (Open)' : `${row.reqDirects} Directs Required`}</td>
      <td>
        <span class="level-status-tag ${isUnlocked ? 'unlocked' : 'locked'}">
          ${isUnlocked ? '✓ Unlocked' : '🔒 Locked'}
        </span>
      </td>
      <td><span class="lvl-members">${(live?.members ?? 0).toLocaleString()} <i aria-hidden="true">&rsaquo;</i></span></td>
      <td><strong>${formatUsd(live?.earnedUsd ?? 0)}</strong></td>
    `;
    // tap a level: modal with everyone who joined at that level (levelModal.ts)
    if (data) {
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', `Level ${row.level}: see who joined`);
      const open = () => openLevelModal(data.walletAddress, row.level, row.pct, row.usd);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    tbody.appendChild(tr);
  });
}

// ── Withdrawals: wallet-signature session, request, history ─────────────

const SESSION_KEY = (wallet: string) => `daovault_session_${wallet.toLowerCase()}`;

function savedSession(wallet: string): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY(wallet)) || 'null') as { token: string; expiresAt: string } | null;
    if (raw && new Date(raw.expiresAt).getTime() > Date.now() + 60_000) return raw.token;
  } catch { /* ignore */ }
  return null;
}

/** Asks the wallet to sign a one-time message (no gas) and keeps the session for a few hours. */
async function signIn(wallet: string): Promise<string> {
  const existing = savedSession(wallet);
  if (existing) return existing;
  const provider = getActiveProvider();
  if (!provider) throw new Error('Reconnect your wallet to sign in.');
  const { message } = await getAuthChallenge(wallet);
  showToast('Sign the message in your wallet (no gas)...');
  const signer = await getSignerFor(provider, wallet);
  const signature = await signer.signMessage(message);
  const session = await verifyAuthSignature(wallet, signature);
  try { localStorage.setItem(SESSION_KEY(wallet), JSON.stringify({ token: session.token, expiresAt: session.expiresAt })); } catch { /* ignore */ }
  return session.token;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Waiting for review',
  PROCESSING: 'Approved · paying out',
  COMPLETED: 'Paid',
  REJECTED: 'Rejected',
};

const PAYOUT_ABI = ['function claim(bytes32 id, uint256 amount, uint256 deadline, bytes signature)'];
const scanTx = (hash: string) => `https://${BSC_CHAIN_ID === 97 ? 'testnet.' : ''}bscscan.com/tx/${hash}`;

/**
 * Instant payout: the member's wallet submits the signed voucher to the payout contract,
 * which sends the USDT in the same transaction; then the backend verifies and marks it paid.
 */
async function claimVoucher(token: string, w: Withdrawal): Promise<Withdrawal> {
  if (!w.voucher) throw new Error('This withdrawal has no open payout.');
  if (REAL_PAYMENTS_LOCKED) throw new Error(REAL_PAYMENTS_LOCKED_MSG);
  const provider = getActiveProvider();
  if (!provider) throw new Error('Reconnect your wallet to receive the payout.');
  await requireBSCNetwork(provider);
  // the voucher pays msg.sender, so it must be the member's own account
  const payout = new Contract(w.voucher.contract, PAYOUT_ABI, await getSignerFor(provider, w.destinationWallet));
  showToast('Confirm in your wallet to receive your USDT...');
  const tx = await payout.claim(w.voucher.id, w.voucher.amount, w.voucher.deadline, w.voucher.signature);
  showToast('Sending your USDT...');
  await tx.wait();
  return confirmWithdrawal(token, w.id, tx.hash);
}

function renderWithdrawalSummary(summary: WithdrawalSummary): void {
  const availEl = document.getElementById('withAvailBalance');
  const meta = document.getElementById('withMeta');
  rollNumber(availEl, summary.availableUsd, (n) => `${formatUsd(n)} USDT`);
  if (meta) meta.textContent = `Pending ${formatUsd(summary.pendingUsd)} · Withdrawn ${formatUsd(summary.withdrawnUsd)} · Min ${formatUsd(summary.minimumUsd)}`;
  const box = document.getElementById('withHistory');
  const list = document.getElementById('withHistoryList');
  if (!box || !list) return;
  box.hidden = summary.items.length === 0;
  list.innerHTML = summary.items.map((w) => {
    const date = new Date(w.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const tx = w.payoutTxHash ? ` <a href="${scanTx(w.payoutTxHash)}" target="_blank" rel="noopener">tx&nearr;</a>` : '';
    const reason = w.rejectReason ? `<small>${w.rejectReason.replace(/[<>&"]/g, '')}</small>` : '';
    const label = w.voucher ? 'Ready to receive' : w.status === 'COMPLETED' && w.instant ? 'Paid instantly' : STATUS_LABEL[w.status] ?? w.status;
    const claim = w.voucher ? `<button type="button" class="with-claim" data-claim="${w.id}">Receive now &rarr;</button>` : '';
    return `<li class="is-${w.status.toLowerCase()}"><span>${date} · ${formatUsd(w.grossUsd)} → <b>${formatUsd(w.netUsd)}</b></span><span class="with-status">${label}${tx}</span>${claim}${reason}</li>`;
  }).join('');
}

function initWithdrawals(wallet: string, availableBalance: number, data: DashboardData | null): void {
  const availEl = document.getElementById('withAvailBalance');
  const inputEl = document.getElementById('withAmountInput') as HTMLInputElement | null;
  const grossEl = document.getElementById('withGrossVal');
  const feeEl = document.getElementById('withFeeVal');
  const netEl = document.getElementById('withNetVal');
  const submitBtn = document.getElementById('withSubmitBtn') as HTMLButtonElement | null;
  const label = document.getElementById('withSubmitLabel');
  const note = document.getElementById('withPayoutNote');
  let available = availableBalance;
  let feePercent = 5;
  let items: Withdrawal[] = [];

  rollNumber(availEl, available, (n) => `${formatUsd(n)} USDT`);
  const meta = document.getElementById('withMeta');
  if (meta && data) meta.textContent = `Pending ${formatUsd(data.pendingWithdrawalUsd)} · Withdrawn ${formatUsd(data.withdrawnUsd)}`;

  const updateMath = (): void => {
    const amount = Math.max(0, parseFloat(inputEl?.value || '0') || 0);
    const fee = Math.round(amount * feePercent) / 100;
    if (grossEl) grossEl.textContent = formatUsd(amount);
    if (feeEl) feeEl.textContent = `-${formatUsd(fee)} (${feePercent}%)`;
    if (netEl) netEl.textContent = `${formatUsd(Math.max(0, amount - fee))} USDT`;
  };
  inputEl?.addEventListener('input', updateMath);
  updateMath();

  if (!data || !submitBtn) {
    if (submitBtn) submitBtn.disabled = true;
    if (label) label.textContent = 'Activate your ID to withdraw';
    return;
  }

  const refresh = async (token: string) => {
    const summary = await getWithdrawals(token);
    available = summary.availableUsd;
    feePercent = summary.feePercent;
    items = summary.items;
    if (note) note.textContent = summary.instant
      ? '• Instant: your wallet receives the USDT in seconds (a tiny BNB network fee applies). Signing in costs no gas.'
      : '• Paid after a quick review. Signing in only proves wallet ownership: no gas, no transaction.';
    renderWithdrawalSummary(summary);
    updateMath();
  };

  const failMessage = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      try { localStorage.removeItem(SESSION_KEY(wallet)); } catch { /* ignore */ }
      return 'Session expired. Tap again to sign in.';
    }
    const code = (error as { code?: string | number })?.code;
    if (code === 'ACTION_REJECTED' || code === 4001) return 'Cancelled in your wallet. You can receive it from "Your withdrawals" before it expires.';
    return error instanceof Error ? error.message : 'Withdrawal failed.';
  };

  /** claims an open voucher and shows the result */
  const receive = async (token: string, w: Withdrawal, button: HTMLElement) => {
    const paid = await claimVoucher(token, w);
    showToast(`Paid! ${formatUsd(paid.netUsd)} USDT is in your wallet.`);
    celebrate(button, 30);
    await refresh(token);
  };

  // signed in earlier on this device: show history straight away
  const token = savedSession(wallet);
  if (token) {
    if (label) label.textContent = 'Withdraw now →';
    refresh(token).catch(() => { try { localStorage.removeItem(SESSION_KEY(wallet)); } catch { /* ignore */ } });
  }

  submitBtn.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    const amount = Math.round((parseFloat(inputEl?.value || '0') || 0) * 100) / 100;
    if (amount <= 0) { showToast('Enter the amount you want to withdraw.', true); return; }
    if (amount > available) { showToast('That is more than your available balance.', true); return; }
    submitBtn.disabled = true;
    try {
      const session = await signIn(wallet);
      if (label) label.textContent = 'Withdraw now →';
      const created = await requestWithdrawal(session, amount);
      if (inputEl) inputEl.value = '0';
      if (created.voucher) {
        await refresh(session);
        await receive(session, created, submitBtn);
      } else {
        showToast(`Withdrawal of ${formatUsd(created.grossUsd)} sent for review${created.reviewReason ? ` (${created.reviewReason})` : ''}. You will receive ${formatUsd(created.netUsd)} USDT.`);
        celebrate(submitBtn, 24);
        await refresh(session);
      }
    } catch (error) {
      showToast(failMessage(error), true);
      const session = savedSession(wallet);
      if (session) refresh(session).catch(() => {});
    } finally {
      submitBtn.disabled = false;
    }
  });

  // "Receive now" on an open voucher in the history (e.g. after cancelling the wallet pop-up)
  document.getElementById('withHistoryList')?.addEventListener('click', async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim]');
    if (!button) return;
    const w = items.find((x) => x.id === button.dataset.claim);
    const session = savedSession(wallet);
    if (!w || !session) { showToast('Sign in again to receive this payout.', true); return; }
    button.disabled = true;
    try {
      await receive(session, w, button);
    } catch (error) {
      showToast(failMessage(error), true);
      button.disabled = false;
    }
  });
}
