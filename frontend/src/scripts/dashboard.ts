/**
 * DAOvault AI — DApp Dashboard Controller (TypeScript)
 * 10x Capping Meter, 20-Level Matrix Explorer, 50% Leg Breakdown, and 5% Withdrawal Portal
 */

import { init3DScene } from './scene.ts';
import {
  initReferralCapture,
  bootPreloader,
  formatAddress,
  showToast,
  getPendingReferral,
  countUp,
  BSC_CHAIN_ID,
} from './core.ts';
import {
  disconnectWallet,
  autoReconnect,
} from './wallet.ts';
import type { LevelMatrixRow } from './types.ts';
import { getDashboardData, type DashboardData } from './api.ts';
import { activateWallet, isPaymentConfigured } from './payment.ts';
import {
  prepareDashboardReveal,
  revealDashboard,
  rollNumber,
  initCardSpotlight,
  initMetricIcons3D,
  celebrate,
} from './dashboardFx.ts';
import { renderRewardVaults, initWalletMenu, RANK_TIERS } from './rewardVaults.ts';

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
    window.setTimeout(() => { window.location.href = 'index.html'; }, 900);
    return;
  }

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

  // 4. Setup Referral Link + wallet menu
  initReferralLink(account);
  initWalletMenu(account);
  initDashboardNavigation();
  initActivation();

  // 5. Load live dashboard data from the backend. There is no demo fallback:
  // an unknown wallet must be activated before it can show account data.
  let dashboardData: DashboardData | null = null;
  try {
    dashboardData = await getDashboardData(account);
    showToast('Dashboard synced with backend.');
  } catch (error) {
    console.error('[DAOvault] Dashboard API unavailable:', error);
    showToast('No live account data found. Activate your wallet first.', true);
  }

  const totalEarned = toNumber(dashboardData?.totalEarned, 0);
  const activeDirects = dashboardData?.activeDirects ?? 0;
  const maxCap = toNumber(dashboardData?.packages?.[0]?.maxCapLimit, 0);
  const hasLiveData = dashboardData !== null;
  scene?.setScene('dash');

  updateOverviewMetrics(activeDirects, totalEarned, maxCap, dashboardData?.currentRank);
  updateMemberDetails(hasLiveData, maxCap > 0, activeDirects, totalEarned, maxCap, dashboardData?.currentRank ?? 0);

  // 6. Initialize 10x Capping Gauge Meter
  initCapMeter(totalEarned, maxCap);

  // 6b. Rank reward vaults (surprise boxes)
  renderRewardVaults(account, dashboardData?.currentRank ?? 0);

  // 7. Render 20-Level Matrix Table
  renderLevelTable(hasLiveData ? activeDirects : -1);

  // 8. Initialize Withdrawal Calculator
  initWithdrawalCalculator(0);
});

function initDashboardNavigation(): void {
  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.dash-page .nav-links a');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

function initActivation(): void {
  const button = document.getElementById('dashActivateBtn') as HTMLButtonElement | null;
  const status = document.getElementById('activationStatus');
  if (!button) return;
  if (!isPaymentConfigured()) {
    button.disabled = true;
    if (status) status.textContent = 'Testnet contract is not configured yet.';
    return;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const sponsor = getPendingReferral();
      const txHash = await activateWallet(sponsor);
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

function updateOverviewMetrics(activeDirects: number, totalEarned: number, maxCap: number, rank?: number): void {
  const directsEl = document.getElementById('metricDirectsVal');
  const earnedEl = document.getElementById('metricEarnedVal');
  const capEl = document.getElementById('metricCapVal');
  const capStatusEl = document.getElementById('metricCapStatus');
  const rankEl = document.getElementById('metricRankVal');
  rollNumber(directsEl, activeDirects, (n) => Math.round(n).toLocaleString());
  rollNumber(earnedEl, totalEarned, formatUsd);
  if (capEl) {
    capEl.innerHTML = `<span class="cap-roll"></span> <span style="font-size: 1rem; color: var(--text-dim);">/ $${maxCap.toLocaleString()}</span>`;
    rollNumber(capEl.querySelector<HTMLElement>('.cap-roll'), totalEarned, (n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  }
  if (capStatusEl) {
    capStatusEl.textContent = maxCap > 0 ? '• Active package' : '• No live package';
    capStatusEl.style.color = maxCap > 0 ? 'var(--green)' : 'var(--text-muted)';
  }
  if (rankEl) rankEl.textContent = typeof rank === 'number' && rank > 0 ? (RANK_TIERS[rank - 1]?.name ?? `Rank ${rank}`) : 'Unranked';
}

/** Header tag + metric captions, written from the live data so every line means something. */
function updateMemberDetails(live: boolean, active: boolean, directs: number, earned: number, cap: number, rank: number): void {
  const net = BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet';
  const tag = document.getElementById('dashMemberTag');
  if (tag) {
    tag.textContent = active ? `• Active member · ${net}` : live ? `• Not activated yet · ${net}` : `• Wallet connected · ${net}`;
    tag.classList.toggle('is-active', active);
  }
  const unlocked = live ? LEVEL_MATRIX.filter((l) => directs >= l.reqDirects).length : 0;
  const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('metricDirectsNote', unlocked >= 20 ? 'All 20 levels unlocked' : `Levels unlocked: ${unlocked} / 20`);
  set('metricEarnedNote', cap > 0 ? `${formatUsd(Math.max(cap - earned, 0))} left before the 10× cap` : 'Activate the $300 package to start earning');
  const next = RANK_TIERS[rank];
  set('metricRankNote', next ? `Next: ${next.name} at ${next.volume.toLocaleString()} DAO` : 'Top rank reached');
}

/**
 * Referral Link Copier
 */
function initReferralLink(account: string): void {
  const inputEl = document.getElementById('dashRefLinkInput') as HTMLInputElement | null;
  const copyBtn = document.getElementById('dashCopyRefBtn');
  const sponsorTag = document.getElementById('dashSponsorTag');

  const refCode = 'DV' + account.slice(2, 8).toUpperCase();
  const origin = window.location.origin;
  const fullLink = `${origin}/index.html?ref=${refCode}`;

  if (inputEl) inputEl.value = fullLink;
  const idEl = document.getElementById('dashMemberId');
  if (idEl) idEl.textContent = refCode;
  if (sponsorTag) {
    const sponsor = getPendingReferral();
    sponsorTag.innerHTML = sponsor ? `Sponsor <b>${sponsor.replace(/[^A-Za-z0-9]/g, '')}</b>` : 'Joined direct';
  }

  if (copyBtn && inputEl) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullLink);
        showToast('Referral link copied to clipboard!');
        celebrate(copyBtn, 28);
      } catch (err) {
        inputEl.select();
        document.execCommand('copy');
        showToast('Referral link copied!');
      }
    });
  }
}

/**
 * 10x Capping Meter Progress
 */
function initCapMeter(currentEarned: number, maxCap: number = 3000): void {
  const earnedEl = document.getElementById('capEarnedVal');
  const maxEl = document.getElementById('capMaxVal');
  const barEl = document.getElementById('capFillBar') as HTMLElement | null;
  const pctEl = document.getElementById('capPctText');

  const percentage = maxCap > 0
    ? Math.min(100, Math.round((currentEarned / maxCap) * 100))
    : 0;

  if (earnedEl) countUp(earnedEl, currentEarned, '$', 1000);
  if (maxEl) maxEl.textContent = `$${maxCap.toLocaleString()}`;
  if (pctEl) pctEl.textContent = `${percentage}% of 10× Cap Reached`;

  setTimeout(() => {
    if (barEl) barEl.style.width = `${percentage}%`;
  }, 300);
}

/**
 * Render 20-Level Matrix Table with Unlocked / Locked badges
 */
function renderLevelTable(userDirectsCount: number = 12): void {
  const tbody = document.getElementById('levelTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  LEVEL_MATRIX.forEach((row, idx) => {
    const isUnlocked = userDirectsCount >= row.reqDirects;
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
      <td><strong>${isUnlocked ? '$' + (row.usd * (21 - row.level)).toLocaleString() : '$0.00'}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Interactive 5% Withdrawal Calculator
 */
function initWithdrawalCalculator(availableBalance: number = 0): void {
  const availEl = document.getElementById('withAvailBalance');
  const inputEl = document.getElementById('withAmountInput') as HTMLInputElement | null;
  const grossEl = document.getElementById('withGrossVal');
  const feeEl = document.getElementById('withFeeVal');
  const netEl = document.getElementById('withNetVal');
  const submitBtn = document.getElementById('withSubmitBtn');

  rollNumber(availEl, availableBalance, (n) => `$${n.toFixed(2)} USDT`);

  function updateMath(): void {
    const amount = parseFloat(inputEl?.value || '0');
    const fee = amount * 0.05; // 5% Flat fee
    const net = Math.max(0, amount - fee);

    if (grossEl) grossEl.textContent = `$${amount.toFixed(2)}`;
    if (feeEl) feeEl.textContent = `-$${fee.toFixed(2)} (5%)`;
    if (netEl) netEl.textContent = `$${net.toFixed(2)} USDT`;
  }

  if (inputEl) {
    inputEl.addEventListener('input', updateMath);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      const amount = parseFloat(inputEl?.value || '0');
      if (amount <= 0 || isNaN(amount)) {
        showToast('Please enter a valid withdrawal amount.', true);
        return;
      }
      if (amount > availableBalance) {
        showToast('Withdrawal amount exceeds available balance.', true);
        return;
      }

      showToast('Withdrawal requests are unavailable until the live payout service is configured.', true);
    });
  }

  updateMath();
}
