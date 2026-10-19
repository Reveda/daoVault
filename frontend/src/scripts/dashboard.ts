/**
 * DAOvault AI — DApp Dashboard Controller (TypeScript)
 * 25x Capping Meter, 20-Level Matrix Explorer, 50% Leg Breakdown, and 5% Withdrawal Portal
 */

import { whenReady } from './core.ts';
import { init3DScene } from './scene.ts';
import {
  initReferralCapture,
  bootPreloader,
  formatAddress,
  showToast,
  confirmNotice,
  showLaunchNotice,
  getPendingReferral,
  clearPendingReferral,
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
  getDashboardData,
  markBoxOpened,
  collectReward,
  getSponsorByCode,
  getAdminStats,
  joinTeam,
  registerWallet,
  getWithdrawals,
  requestWithdrawal,
  confirmWithdrawal,
  type DashboardData,
  type Side,
  type WithdrawalSummary,
  type Withdrawal,
} from './api.ts';
import { mountDvToken3D } from './dvToken3d.ts';
import {
  activateWallet,
  isPaymentConfigured,
  resolveSponsor,
  retryPendingActivation,
  hasPendingPayment,
  topUpWallet,
  REAL_PAYMENTS_LOCKED,
  REAL_PAYMENTS_LOCKED_MSG,
} from './payment.ts';
import {
  prepareDashboardReveal,
  revealDashboard,
  rollNumber,
  initCardSpotlight,
  initMetricIcons3D,
  celebrate,
} from './dashboardFx.ts';
import { renderRewardVaults, initWalletMenu, RANK_TIERS } from './rewardVaults.ts';
import { initNotifications } from './notifications.ts';
import { openGiftBox } from './giftBox.ts';
import { initDvLogos } from './dvLogo.ts';
import { openLevelModal } from './levelModal.ts';
import { renderRankProgress } from './rankProgress.ts';
import { renderCompanyOverview } from './companyOverview.ts';
import { clearSession, logout, requireSession, savedSession, signIn } from './session.ts';

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

whenReady(async () => {
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
    try {
      sessionStorage.setItem('dv_dash_bounce', '1');
    } catch {
      /* storage blocked */
    }
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 900);
    return;
  }

  // The dashboard always shows the wallet that is live right now: switching account in the
  // wallet loads that account's dashboard, disconnecting it in the wallet logs out.
  window.addEventListener('daovault:accountChanged', (e: Event) => {
    const next = (e as CustomEvent<{ account: string }>).detail?.account;
    if (next && next.toLowerCase() !== account.toLowerCase()) window.location.reload();
  });
  window.addEventListener('daovault:disconnected', async () => {
    await logout();
    try {
      sessionStorage.setItem('dv_dash_bounce', '1');
    } catch {
      /* storage blocked */
    }
    window.location.href = 'index.html';
  });

  // pre-launch notice, once per browser (only for a real dashboard visit, not a bounce)
  showLaunchNotice(
    'dashboard',
    'We’ll be live soon',
    'Your vault and your permanent referral link are ready. The $300 activation and payouts open at launch. See you there!',
  );

  // 2. Populate Header Account
  const userAddrEl = document.getElementById('dashWalletAddr');
  if (userAddrEl) {
    userAddrEl.textContent = formatAddress(account);
  }

  // 3. Setup Disconnect
  // Log out: the server deletes this device's refresh token, then the wallet disconnects
  const logOut = async () => {
    await logout();
    disconnectWallet();
    window.location.href = 'index.html';
  };
  document.getElementById('dashLogoutBtn')?.addEventListener('click', () => void logOut());

  // 4. Wallet menu + nav
  initWalletMenu(account);
  initDashboardNavigation();

  // 5. A payment sent last time but not recorded yet (page closed, network) is re-checked first
  if (await retryPendingActivation(account).catch(() => false))
    showToast('Your payment has been confirmed.');
  else if (hasPendingPayment(account))
    showToast('Your last payment is still being confirmed. It will appear here shortly.');

  // 6. Load live dashboard data from the backend. There is no demo fallback:
  // an unknown wallet must be activated before it can show account data.
  // Render's free plan sleeps the API and the first request after that can fail or take
  // 30-50s, so network errors and 5xx are retried for about a minute before giving up.
  let dashboardData: DashboardData | null = null;
  // true when the server could not be reached: then we do NOT know whether this wallet is
  // activated, so no "Activate $300" card and no "activate to get your link" text
  let serverDown = false;
  let registered = false;
  let resigned = false;
  let token = '';
  let leaving = false;
  window.addEventListener('pagehide', () => {
    leaving = true;
  });
  const refInput = document.getElementById('dashRefLinkInput') as HTMLInputElement | null;
  if (refInput) refInput.value = 'Loading your invite link…';
  for (let attempt = 0; ; attempt++) {
    try {
      token ||= await requireSession(account, () => void logOut());
      dashboardData = await getDashboardData(account, token);
      break;
    } catch (error) {
      if (leaving) return; // a navigation cancelled the request: not a server problem
      if (error instanceof ApiError && error.status === 401 && !resigned) {
        // session ended (expired, or "log out all devices" elsewhere): sign in again once
        resigned = true;
        clearSession(account);
        token = '';
        continue;
      }
      if (error instanceof ApiError && error.status === 404) {
        // first visit: give this wallet its permanent referral code, then load its dashboard
        if (!registered) {
          registered = true;
          if (
            await registerWallet(account, token).then(
              () => true,
              () => false,
            )
          )
            continue;
        }
        showToast('Activate your wallet to unlock your dashboard.', true);
        break;
      }
      if (error instanceof ApiError && error.status === 429) {
        // rate limited (too many sign-ins from this network): say so, not "server down"
        showToast(error.message, true);
        serverDown = true;
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

  // the admin (= company) wallet belongs in the admin panel (owner, 2026-10-10); its own member
  // view stays reachable from there with ?view=member
  if (
    dashboardData?.isAdmin &&
    new URLSearchParams(window.location.search).get('view') !== 'member'
  ) {
    window.location.replace('admin.html');
    return;
  }

  // the package earning now (top-ups wait in line behind a package still under its cap)
  const pkg = dashboardData?.currentPackage ?? dashboardData?.packages?.[0];
  const totalEarned = toNumber(dashboardData?.totalEarned, 0);
  // the whole cap (owner, 2026-10-18): $7,500 per package, added up; all income counts toward it
  const capEarned = toNumber(dashboardData?.capEarnedUsd ?? pkg?.totalEarned, 0);
  const activeDirects = dashboardData?.activeDirects ?? 0;
  const maxCap = toNumber(dashboardData?.capTotalUsd ?? pkg?.maxCapLimit, 0);
  const hasLiveData = dashboardData !== null;
  scene?.setScene('dashTop'); // then each section re-forms the cloud as it scrolls in (data-scene)

  // Binary placement (owner, 2026-10-17): a member joins a team once, by picking LEFT or RIGHT
  // under the invite code (the sponsor tells them which side). Owner 2026-10-18: this is the FIRST
  // thing after sign-in, a gate the member cannot close; the dashboard opens only after joining.
  // The invite code is the latest link this browser opened, else the one saved on the server; an
  // unknown code is skipped (so nobody is locked out by a bad link). Once joined, the spot and the
  // sponsor never change.
  const isRoot = Boolean(dashboardData?.isRoot);
  let joinCode = '';
  if (dashboardData && !pkg && !isRoot && !dashboardData.placement) {
    const ref = getPendingReferral()
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    if (ref === dashboardData.referralCode) clearPendingReferral(); // their own link
    // last resort (owner, 2026-10-18): a member who arrived without any referral joins under the company
    const candidates = [
      ref !== dashboardData.referralCode ? ref : '',
      dashboardData.pendingSponsorCode ?? '',
      dashboardData.sponsorCode ?? '',
      dashboardData.companyCode ?? '',
    ].filter((c, i, all) => c && all.indexOf(c) === i);
    for (const code of candidates) {
      try {
        await getSponsorByCode(code);
        joinCode = code;
        break;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) {
          joinCode = code;
          break;
        } // server busy: let the join itself report it
        if (code === ref) {
          clearPendingReferral();
          showToast(`Invite code ${code} was not found. Check your invite link.`, true);
        }
      }
    }
    if (joinCode)
      showJoinGate(
        account,
        joinCode,
        token,
        () => void logOut(),
        joinCode === dashboardData.companyCode,
      );
  } else if (dashboardData?.placement) {
    clearPendingReferral(); // joined: an invite link opened later changes nothing
  }

  // admin = company wallet: the company overview (same data as the admin panel) + menu link
  if (dashboardData?.isAdmin) {
    const link = document.getElementById('walletAdminLink');
    if (link) link.hidden = false;
    getAdminStats(token)
      .then((stats) => {
        const section = document.getElementById('companySection');
        const grid = document.getElementById('companyStats');
        if (!section || !grid) return;
        renderCompanyOverview(grid, stats);
        section.hidden = false;
      })
      .catch(() => {
        /* not an admin any more, or the server is busy: the member view still works */
      });
  }

  initReferralLink(account, dashboardData, serverDown);
  // admin / company wallet (owner, 2026-10-15): never offered Pay & Activate or a withdrawal, in any
  // view (also ?view=member); the server refuses an admin withdrawal too
  const adminWallet = Boolean(dashboardData?.isAdmin);
  if (adminWallet) {
    document.getElementById('activationCard')?.setAttribute('hidden', '');
    document.getElementById('withdrawSection')?.setAttribute('hidden', '');
    document.querySelector('.dash-content-grid')?.classList.add('is-single');
  } else {
    gateLaunch(dashboardData?.paymentsOpen ?? true, dashboardData?.paymentsOpenAt ?? null);
  }
  // pay with the sponsor the server recorded (the team tree), so the on-chain sponsor always matches it;
  // a member who still has to pick Left / Right joins first (joinCode)
  if (!adminWallet)
    initActivation(
      account,
      Boolean(pkg) || isRoot,
      serverDown,
      dashboardData?.sponsorCode ?? '',
      Boolean(dashboardData?.canTopUp),
      dashboardData?.packageCount ?? 0,
      dashboardData?.paymentsOpenAt ?? null,
      dashboardData?.paymentsOpen ?? true,
      joinCode,
    );
  // the rank the member sees includes Power Business (shown as normal business); money stays official
  updateOverviewMetrics(
    activeDirects,
    totalEarned,
    capEarned,
    maxCap,
    Math.max(dashboardData?.currentRank ?? 0, dashboardData?.powerBusiness?.rank ?? 0),
    pkg?.status,
  );
  renderPowerBusiness(dashboardData);
  renderMoneyCards(dashboardData);
  initDvToken(dashboardData);
  initDvBox(account, dashboardData);
  updateMemberDetails(dashboardData, Boolean(pkg) || isRoot, capEarned, maxCap);

  // 7. 25x capping gauge
  initCapMeter(capEarned, maxCap);

  // 7b. Rank reward vaults (surprise boxes)
  // claim to collect (owner 2026-10-19): rewards reach the balance only when the member opens their box;
  // after a collect (or new income arriving live) the balance-dependent parts are fetched again
  let refreshing: Promise<void> | null = null;
  const refreshAfterCollect = () =>
    (refreshing ??= (async () => {
      try {
        const fresh = await getDashboardData(account, await signIn(account));
        dashboardData = fresh;
        updateOverviewMetrics(
          activeDirects,
          toNumber(fresh.totalEarned, 0),
          toNumber(fresh.capEarnedUsd, capEarned),
          maxCap,
          Math.max(fresh.currentRank ?? 0, fresh.powerBusiness?.rank ?? 0),
          pkg?.status,
        );
        drawVaults(fresh);
        renderMoneyCards(fresh);
        renderIncome(fresh);
        renderFastStart(fresh);
        document.dispatchEvent(new CustomEvent('dv:balance-changed'));
      } catch {
        /* the next visit shows it */
      } finally {
        refreshing = null;
      }
    })());
  const drawVaults = (data: DashboardData | null) =>
    renderRewardVaults(
      account,
      data?.currentRank ?? 0,
      data?.rankRewards ?? [],
      async (rank) => collectReward(account, await signIn(account), { kind: 'rank', rank }),
      () => void refreshAfterCollect(),
    );
  drawVaults(dashboardData);
  renderRankProgress(dashboardData);

  // 8. 20-level table, legs, income
  renderLevelTable(dashboardData);
  renderLegs(dashboardData);
  renderIncome(dashboardData);
  renderFastStart(dashboardData);
  // the earned fast-start bonus waits in its box until collected (owner 2026-10-19)
  document.getElementById('fastStartCollect')?.addEventListener('click', () => {
    const fs = dashboardData?.fastStart;
    const tier = fs?.tiers.find((t) => t.days === fs.earnedDays);
    if (!fs || !tier) return;
    openGiftBox({
      rank: tier.name,
      reward: fs.earnedUsd,
      requirement: `${fs.directsNeeded} directs within ${tier.days} days`,
      mode: 'ready',
      kicker: 'BONUS REWARD BOX',
      label: tier.name.toUpperCase(),
      openLabel: 'Open & collect',
      note: 'Added to your balance. You can withdraw it any time.',
      doneLabel: 'Done',
      onOpened: () => {
        void signIn(account)
          .then((t) => collectReward(account, t, { kind: 'bonus' }))
          .then(
            (r) => {
              if (!r.alreadyCollected)
                showToast(`$${r.collectedUsd.toLocaleString()} ${tier.name} added to your balance.`);
              void refreshAfterCollect();
            },
            () =>
              showToast(
                'We could not collect this bonus right now. It is safe in its box: please try again in a minute.',
                true,
              ),
          );
      },
    });
  });
  // rewards waiting in their boxes: a calm reminder once per visit
  const waiting = dashboardData?.pendingRewards ?? [];
  if (waiting.length)
    showToast(
      waiting.length === 1
        ? `${waiting[0].name}: $${waiting[0].amountUsd.toLocaleString()} is ready to collect. Open its box to add it to your balance.`
        : `${waiting.length} rewards ($${(dashboardData?.rewardsWaitingUsd ?? 0).toLocaleString()}) are ready to collect. Open their boxes to add them to your balance.`,
    );
  // live notifications (owner 2026-10-19): the bell, and fresh balances when income or rewards arrive
  if (dashboardData && !dashboardData.isRoot) {
    initNotifications(account);
    let pending = 0;
    document.addEventListener('dv:notification', () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => void refreshAfterCollect(), 800);
    });
  }

  // 9. Withdrawals (wallet-signature sign-in)
  if (!adminWallet)
    initWithdrawals(account, hasLiveData ? dashboardData!.availableUsd : 0, dashboardData);
});

/** No section nav on the dashboard: the logo just takes the member back to the top. */
function initDashboardNavigation(): void {
  document
    .querySelector<HTMLAnchorElement>('.top-header .brand')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/**
 * The $300 card: activation for a new wallet, or a top-up (re-entry, owner 2026-10-10) once
 * every package of an active member has reached its 25x cap. Hidden otherwise.
 */
/**
 * Pre-launch marketing (owner, 2026-10-13): until PAYMENTS_OPEN_AT (server clock) the card shows
 * only the opening date and a live countdown (no other message, owner), with the button off; the
 * page reloads by itself at that moment.
 */
/**
 * Launch gate (owner 2026-10-18): Pay & Activate (#activationCard), Recent Income (#incomeCard) and the USDT
 * withdrawal (#withdrawSection) stay hidden until payments open (PAYMENTS_OPEN_AT, server clock: 10 Nov 00:00
 * IST; Render sets a past date so they show there now). Vite development always keeps the cards visible
 * for local UI testing; the server still refuses payments-side actions before the date. At launch an open
 * dashboard reloads itself with fresh data. If this device's clock runs ahead of the server, it checks
 * again a minute later instead of reloading in a loop.
 */
function gateLaunch(open: boolean, openAt: string | null): void {
  if (open || import.meta.env.DEV) return;
  for (const id of ['activationCard', 'incomeCard', 'withdrawSection'])
    document.getElementById(id)?.setAttribute('hidden', '');
  document.querySelector('.dash-content-grid')?.classList.add('is-single');
  const at = openAt ? new Date(openAt).getTime() : NaN;
  if (!Number.isFinite(at)) return;
  const wait = at - Date.now();
  // setTimeout holds at most ~24.8 days; a later date is picked up on the next visit
  if (wait > 2_000_000_000) return;
  window.setTimeout(() => window.location.reload(), wait > 0 ? wait + 3_000 : 60_000);
}

function showPaymentsCountdown(button: HTMLButtonElement, openAt: string): void {
  const title = document.getElementById('activationTitle');
  const status = document.getElementById('activationStatus');
  const at = new Date(openAt);
  button.disabled = true;
  button.textContent = 'Opens soon';
  if (title)
    title.textContent = `Activation opens on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  const tick = () => {
    const left = at.getTime() - Date.now();
    if (left <= 0) {
      if (status) status.textContent = 'Opening now';
      return;
    }
    const d = Math.floor(left / 86_400_000),
      h = Math.floor(left / 3_600_000) % 24,
      m = Math.floor(left / 60_000) % 60;
    const inText = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
    if (status) status.textContent = `Opens in ${inText}`;
  };
  tick();
  window.setInterval(tick, 30_000);
}

/**
 * Join gate (binary placement, owner 2026-10-17 / 2026-10-18): right after sign-in, a full-screen
 * modal the member cannot close: pick the LEFT or RIGHT side of the invite code's team (the sponsor
 * tells them which), confirm that the spot is permanent, and the dashboard opens (page reload with
 * the new placement). The only other way out is Log out.
 */
function showJoinGate(
  account: string,
  code: string,
  token: string,
  onLogout: () => void,
  company = false,
): void {
  const card = document.createElement('div');
  card.className = 'sign-gate join-gate';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'joinGateTitle');
  card.innerHTML = `
    <div class="sign-gate-card glass join-gate-card">
      <span class="mono sign-gate-tag">JOIN YOUR TEAM</span>
      <h3 id="joinGateTitle">Choose your side under <span class="grad-text"></span></h3>
      <p>Select the side your sponsor has advised. You will be placed in the next open position on that side of
        their team.</p>
      <div class="join-side-buttons">
        <button type="button" class="btn btn-line join-side-btn" data-side="LEFT"><span aria-hidden="true">&larr;</span> Join Left</button>
        <button type="button" class="btn btn-line join-side-btn" data-side="RIGHT">Join Right <span aria-hidden="true">&rarr;</span></button>
      </div>
      <button type="button" class="join-gate-out mono" data-out>Not your wallet? Log out</button>
    </div>`;
  // no referral: the member joins the company account (owner, 2026-10-18)
  card.querySelector('.grad-text')!.textContent = company ? `DAOVAULT (${code})` : code;
  document.body.appendChild(card);
  // the dashboard behind stays still until the member has joined
  document.documentElement.classList.add('lv-lock');
  card.querySelector('[data-out]')!.addEventListener('click', onLogout);
  card.querySelector<HTMLButtonElement>('[data-side]')?.focus({ preventScroll: true });
  card.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((button) => {
    button.addEventListener('click', async () => {
      const side = button.dataset.side === 'RIGHT' ? 'RIGHT' : ('LEFT' as Side);
      const sideName = side === 'LEFT' ? 'Left' : 'Right';
      const go = await confirmNotice({
        kicker: 'Join your team',
        title: 'Confirm your placement',
        message: `You are joining on the {highlight} and will take the next open position on that side. Please make sure this is the side your sponsor advised.`,
        highlight: `${sideName} side of ${code}`,
        confirm: `Confirm ${sideName} side`,
        cancel: 'Back',
      });
      if (!go) return;
      card.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) => {
        b.disabled = true;
      });
      try {
        const joined = await joinTeam(account, code, side, token);
        clearPendingReferral();
        showToast(
          `Joined: ${sideName} side under ${joined.placement.underCode}. Opening your dashboard...`,
        );
        window.setTimeout(() => window.location.reload(), 1200);
      } catch (error) {
        card.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) => {
          b.disabled = false;
        });
        if (error instanceof ApiError && error.status === 404) clearPendingReferral();
        showToast(
          error instanceof Error ? error.message : 'Could not join right now. Please try again.',
          true,
        );
      }
    });
  });
}

function initActivation(
  account: string,
  activated: boolean,
  serverDown = false,
  sponsorCode = '',
  canTopUp = false,
  packageCount = 0,
  paymentsOpenAt: string | null = null,
  paymentsOpen = true,
  joinCode = '',
): void {
  const card = document.getElementById('activationCard');
  const button = document.getElementById('dashActivateBtn') as HTMLButtonElement | null;
  const status = document.getElementById('activationStatus');
  const topUp = activated && canTopUp;
  // without the server we cannot tell an activated member from a new one: never offer
  // the $300 payment on a guess
  if ((activated && !topUp) || serverDown) {
    card?.setAttribute('hidden', '');
    return;
  }
  if (!button) return;
  if (!paymentsOpen && paymentsOpenAt) {
    showPaymentsCountdown(button, paymentsOpenAt);
    return;
  }
  if (topUp) {
    const title = document.getElementById('activationTitle');
    if (title) title.textContent = 'Add a package: +$7,500 earnings cap';
    button.textContent = 'Approve & Add $300 package';
  }
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
  // binary placement: pick Left / Right in the join card first, then pay
  if (joinCode && !topUp) {
    button.disabled = true;
    if (status)
      status.textContent = `Join a side (Left or Right) under ${joinCode} first, then activate.`;
    return;
  }
  const code = sponsorCode.replace(/[^A-Za-z0-9]/g, '');
  // the member sees whose team they join before paying
  if (status) {
    status.textContent = topUp
      ? `You hold ${packageCount} ${packageCount === 1 ? 'package' : 'packages'}: a total cap of $${(packageCount * 7500).toLocaleString()}. Each new $300 package adds $7,500 to it, any time: same ID, same team.`
      : code
        ? `You are joining under ${code} · one-time $300 USDT`
        : 'Joining without a sponsor · one-time $300 USDT';
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      // invite code -> sponsor wallet, checked before any payment
      const sponsor = topUp ? null : await resolveSponsor(code, account);
      // the sponsor has not activated yet (owner, 2026-10-13): say it plainly before paying. Their
      // share of this payment is not paid to them; the member's own ID and earnings are not affected.
      if (sponsor?.code && !sponsor.activated) {
        const go = await confirmNotice({
          kicker: 'Before you activate',
          title: "Your sponsor's ID is not active yet",
          message:
            'You are joining under {highlight}. Their ID has not been activated yet, so they will not receive a reward from your activation. Your own ID, team and earnings are not affected, and they receive rewards from new activations once their ID is active.',
          highlight: sponsor.code,
          confirm: 'Continue to activation',
          cancel: 'Not now',
        });
        if (!go) {
          button.disabled = false;
          return;
        }
      }
      const txHash = topUp ? await topUpWallet() : await activateWallet(sponsor!.wallet);
      if (status) status.textContent = `Confirmed: ${txHash.slice(0, 10)}...`;
      showToast(`${topUp ? 'Top-up' : 'Activation'} verified on-chain. Refreshing dashboard...`);
      document.getElementById('activationCard')?.classList.add('fx-celebrate');
      celebrate(button);
      window.setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Activation failed.', true);
      button.disabled = false;
    }
  });
}

/**
 * DV token allocation (owner, 2026-10-15): 1,500 DV for every $300 package (activation or top-up),
 * credited at the planned DV launch (March 2028, BNB Smart Chain). The card under the metrics and
 * the "DV Token" header button show the server's numbers: packages x 1,500, one line per package.
 * Hidden for the company root and when the server is unreachable (never a guessed number).
 */
/**
 * DV token pot (owner 2026-10-18): a gold pot under a red cloth on the DV token card that opens like the
 * rank reward boxes (giftBox.ts theme 'pot': the cloth blows off and DV coins erupt) and reveals the member's DV
 * allocation (packages x 1,500). Everywhere, production included (owner 2026-10-18: "as soon as he takes a
 * package, show him how many tokens he has"):
 *   no package yet  -> sealed: rattles, shows the 1,500 DV a first package records; "Preview the opening"
 *                      only on the dev server / review builds (VITE_REWARD_PREVIEW=true), never in production
 *   allocation new  -> ready: "Open box", the pot bursts and reveals the total; remembered on this device
 *   already opened  -> opened: replays the reveal; a top-up (more DV) makes it ready again
 * Display only: the tokens are credited at the planned DV launch; nothing is minted or sent now. Texts say
 * "allocated" and "planned", never value or profit.
 */
const DV_POT_PREVIEW = import.meta.env.DEV || import.meta.env.VITE_REWARD_PREVIEW === 'true';
function initDvBox(account: string, data: DashboardData | null): void {
  const btn = document.getElementById('dvBoxBtn');
  const stateEl = document.getElementById('dvBoxState');
  const dv = data?.dvToken;
  if (!btn || !stateEl || !dv || data?.isRoot) return;
  const fmt = (n: number) => `${Math.round(n).toLocaleString('en-US')} DV`;
  const key = `daovault_dv_box_${account.toLowerCase()}`;
  // opened once (owner 2026-10-19): the server remembers it (dv.opened), this browser too
  let serverOpened = dv.opened ?? 0;
  const openedAmount = () => {
    let local = 0;
    try {
      local = Number(localStorage.getItem(key)) || 0;
    } catch {
      /* storage blocked */
    }
    return Math.max(serverOpened, local);
  };
  const draw = () => {
    const mode: 'locked' | 'ready' | 'opened' =
      dv.allocated <= 0 ? 'locked' : openedAmount() >= dv.allocated ? 'opened' : 'ready';
    btn.className = `dv-box is-${mode}`;
    // an opened pot never opens again: it only shows what was revealed
    (btn as HTMLButtonElement).disabled = mode === 'opened';
    btn.querySelector('.rb-lock')?.toggleAttribute('hidden', mode !== 'locked');
    stateEl.textContent =
      mode === 'locked'
        ? 'Unlocks with your activation'
        : mode === 'ready'
          ? openedAmount() > 0
            ? `New: +${fmt(dv.allocated - openedAmount())} · ready to open`
            : 'Ready to open'
          : `Already opened · ${fmt(dv.allocated)} allocated`;
    btn.setAttribute(
      'aria-label',
      `DV token pot: ${mode === 'locked' ? 'sealed until you activate' : mode === 'ready' ? 'ready to open' : `already opened, ${fmt(dv.allocated)} allocated`}`,
    );
    return mode;
  };
  draw();
  btn.addEventListener('click', () => {
    const mode = draw();
    if (mode === 'opened') return;
    const launch = `Planned to be credited to this wallet at the DV launch on ${dv.network} (${dv.launch}).`;
    // a top-up opens the pot once more, for its NEW tokens only (owner 2026-10-19); never changes any balance
    const before = mode === 'ready' ? openedAmount() : 0;
    const fresh = Math.max(0, dv.allocated - before);
    openGiftBox({
      rank: 'DV Token Allocation',
      reward: mode === 'locked' ? dv.perPackage : before > 0 ? fresh : dv.allocated,
      requirement: 'your $300 package activation',
      mode,
      format: fmt,
      theme: 'pot',
      allowPreview: DV_POT_PREVIEW,
      kicker: mode === 'locked' ? 'SEALED DV TOKEN POT' : 'DV TOKEN POT',
      label: before > 0 ? 'NEW DV TOKENS ALLOCATED' : 'DV TOKENS ALLOCATED',
      note:
        before > 0
          ? `${fmt(fresh)} added for your new package. ${fmt(dv.allocated)} allocated in total. ${launch}`
          : `${fmt(dv.allocated)} allocated to your wallet (${fmt(dv.perPackage)} per package). ${launch}`,
      lockedNote: `Activate your $300 package and ${fmt(dv.perPackage)} are allocated to you. ${launch}`,
      previewNote: `This was a preview. The pot opens for real once your $300 package is activated: ${fmt(dv.perPackage)} per package.`,
      doneLabel: 'Got it',
      onOpened: () => {
        try {
          localStorage.setItem(key, String(dv.allocated));
        } catch {
          /* storage blocked: the server copy below still remembers it */
        }
        serverOpened = dv.allocated;
        void signIn(account)
          .then((token) => markBoxOpened(account, token, { kind: 'dv', allocated: dv.allocated }))
          .catch(() => {
            /* remembered in this browser; the server copy is retried next time */
          });
        draw();
      },
    });
  });
}

function initDvToken(data: DashboardData | null): void {
  const card = document.getElementById('dvTokenCard');
  const menu = document.getElementById('dvMenu');
  const dv = data?.dvToken;
  if (!data || !dv || data.isRoot) return;
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  const packages = data.packages ?? [];
  const count = packages.length;
  const el = (tag: string, className: string, text?: string) =>
    Object.assign(document.createElement(tag), {
      className,
      ...(text !== undefined ? { textContent: text } : {}),
    });


  if (card) {
    card.hidden = false;
    riseIn(card);
    card.classList.toggle('is-empty', count === 0);
    rollNumber(document.getElementById('dvTokenAmount'), dv.allocated, fmt);
    const calc = document.getElementById('dvTokenCalc');
    if (calc) {
      calc.replaceChildren();
      if (count > 0) {
        calc.append(
          el('span', 'dv-calc-chip', `${count} package${count === 1 ? '' : 's'}`),
          el('span', 'dv-calc-op', '\u00d7'),
          el('span', 'dv-calc-chip', `${fmt(dv.perPackage)} DV`),
          el('span', 'dv-calc-op', '='),
          el('span', 'dv-calc-chip is-total', `${fmt(dv.allocated)} DV`),
        );
      } else {
        calc.append(
          el(
            'span',
            'dv-calc-hint',
            `Activate your $300 package to receive ${fmt(dv.perPackage)} DV`,
          ),
        );
      }
    }
    const launch = document.getElementById('dvTokenLaunch');
    if (launch) launch.textContent = `Planned launch \u00b7 ${dv.launch}`;
  }

  // the token as a minted 3D coin (falls back to the flat logo + CSS spin on lite phones)
  const cardCoin = document.getElementById('dvCardCoin');
  if (card && cardCoin) void mountDvToken3D(cardCoin, 76, true);

  if (!menu) return;
  menu.hidden = false;
  const menuCoin = document.getElementById('dvMenuCoin');
  if (menuCoin) void mountDvToken3D(menuCoin, 34);
  const total = document.getElementById('dvMenuTotal');
  if (total) total.textContent = fmt(dv.allocated);
  const panelTotal = document.getElementById('dvPanelTotal');
  if (panelTotal) panelTotal.textContent = fmt(dv.allocated);
  const rows = document.getElementById('dvPanelRows');
  if (rows) {
    rows.replaceChildren();
    if (!count) {
      rows.append(
        el(
          'li',
          'dv-row is-empty',
          `No package yet. Each $300 package adds ${fmt(dv.perPackage)} DV.`,
        ),
      );
    } else {
      packages.forEach((p, i) => {
        const li = el('li', 'dv-row');
        const when = p.createdAt
          ? new Date(p.createdAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '';
        const left = el('span', 'dv-row-what');
        left.append(
          el('b', '', `Package #${i + 1}`),
          el(
            'small',
            'mono',
            [i === 0 ? 'Activation' : 'Top-up', when].filter(Boolean).join(' \u00b7 '),
          ),
        );
        li.append(left, el('span', 'dv-row-amt mono', `+${fmt(dv.perPackage)} DV`));
        rows.append(li);
      });
      const sum = el('li', 'dv-row is-sum');
      sum.append(
        el('span', 'dv-row-what', `${count} \u00d7 ${fmt(dv.perPackage)} DV`),
        el('span', 'dv-row-amt mono', `${fmt(dv.allocated)} DV`),
      );
      rows.append(sum);
    }
  }
  const foot = document.getElementById('dvPanelFoot');
  if (foot)
    foot.textContent = `${fmt(dv.perPackage)} DV per $300 package \u00b7 planned launch ${dv.launch} on ${dv.network}`;

  // open / close like the wallet menu: click, outside click, Escape
  const btn = document.getElementById('dvMenuBtn');
  const panel = document.getElementById('dvMenuPanel');
  if (!btn || !panel || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !menu.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updateOverviewMetrics(
  activeDirects: number,
  totalEarned: number,
  capEarned: number,
  maxCap: number,
  rank?: number,
  status?: string,
): void {
  const directsEl = document.getElementById('metricDirectsVal');
  const earnedEl = document.getElementById('metricEarnedVal');
  const capEl = document.getElementById('metricCapVal');
  const capStatusEl = document.getElementById('metricCapStatus');
  const rankEl = document.getElementById('metricRankVal');
  rollNumber(directsEl, activeDirects, (n) => Math.round(n).toLocaleString());
  rollNumber(earnedEl, totalEarned, formatUsd);
  if (capEl) {
    capEl.innerHTML = `<span class="cap-roll"></span> <span style="font-size: 1rem; color: var(--text-dim);">/ $${maxCap.toLocaleString()}</span>`;
    rollNumber(
      capEl.querySelector<HTMLElement>('.cap-roll'),
      capEarned,
      (n) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    );
  }
  if (capStatusEl) {
    const capped = status === 'CAPPED';
    capStatusEl.textContent = capped
      ? '• Cap reached: add a $300 package to keep earning'
      : maxCap > 0
        ? '• Earning'
        : '• No live package';
    capStatusEl.style.color = capped
      ? 'var(--red)'
      : maxCap > 0
        ? 'var(--green)'
        : 'var(--text-muted)';
  }
  if (rankEl)
    rankEl.textContent =
      typeof rank === 'number' && rank > 0
        ? (RANK_TIERS[rank - 1]?.name ?? `Rank ${rank}`)
        : 'Unranked';
}

/**
 * Power Business cards (owner, 2026-10-15): shown only to a member who has Power Business given to
 * them (never to their upline); everyone else keeps the normal four cards. Display only: never
 * income, a reward, a withdrawal or DV tokens. Its rank uses the official both-sides rule.
 */
function renderPowerBusiness(data: DashboardData | null): void {
  const cards = document.querySelectorAll<HTMLElement>(
    '.power-dao-metric, .power-business-total-metric',
  );
  const dao = document.getElementById('metricPowerDaoVal');
  const daoNote = document.getElementById('metricPowerDaoNote');
  const business = document.getElementById('metricPowerBusinessVal');
  const businessNote = document.getElementById('metricPowerBusinessNote');
  const rankNote = document.getElementById('metricPowerRankNote');
  const pb = data?.powerBusiness;
  const own = Number(pb?.totalUsd ?? 0);
  const show = Boolean(pb) && own > 0;
  cards.forEach((card) => {
    card.hidden = !show;
  });
  if (!show || !pb || !dao || !daoNote || !business || !businessNote) return;
  dao.textContent = `${pb.dao.toLocaleString('en-US')} DAO`;
  daoNote.textContent = `Left ${pb.legs.left.toLocaleString('en-US')} · Right ${pb.legs.right.toLocaleString('en-US')} DAO`;
  business.textContent = formatUsd(own);
  businessNote.textContent = `${pb.legs.matched.toLocaleString('en-US')} DAO matched`;
  if (rankNote) rankNote.textContent = `Rank: ${pb.rankName ?? 'Unranked'}`;
}

/** Header tag + metric captions, written from the live data so every line means something. */
function updateMemberDetails(
  data: DashboardData | null,
  active: boolean,
  capEarned: number,
  cap: number,
): void {
  const net = BSC_CHAIN_ID === 97 ? 'BSC Testnet' : 'BSC Mainnet';
  const tag = document.getElementById('dashMemberTag');
  if (tag) {
    tag.textContent = data?.isRoot
      ? `• Company root ID · ${net}`
      : active
        ? `• Active member · ${net}`
        : data
          ? `• Not activated yet · ${net}`
          : `• Wallet connected · ${net}`;
    tag.classList.toggle('is-active', active);
  }
  // the member's own proof: their $300 activation transaction on BscScan (public chain data)
  const proof = document.getElementById('dashActivationTx') as HTMLAnchorElement | null;
  const txHash = data?.packages?.[0]?.activationTxHash ?? '';
  if (proof) {
    const valid = /^0x[0-9a-fA-F]{64}$/.test(txHash);
    proof.hidden = !valid;
    if (valid) proof.href = scanTx(txHash);
  }
  const unlocked = data?.levelsUnlocked ?? 0;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set(
    'metricDirectsNote',
    unlocked >= 20 ? 'All 20 levels unlocked' : `Levels unlocked: ${unlocked} / 20`,
  );
  set(
    'metricEarnedNote',
    cap > 0
      ? `Level $${(data?.levelIncomeUsd ?? 0).toLocaleString()} · Rank $${(data?.rankRewardsUsd ?? 0).toLocaleString()}${data?.bonusUsd ? ` · Bonus $${data.bonusUsd.toLocaleString()}` : ''} · ${formatUsd(Math.max(cap - capEarned, 0))} to cap`
      : data?.isRoot
        ? 'Company root: its commission shares stay in the treasury'
        : 'Activate the $300 package to start earning',
  );
  // same rank as the Current Rank card (Power Business counted as normal business)
  const next = RANK_TIERS[Math.max(data?.currentRank ?? 0, data?.powerBusiness?.rank ?? 0)];
  set(
    'metricRankNote',
    next ? `Next: ${next.name} at ${next.volume.toLocaleString()} DAO` : 'Top rank reached',
  );
}

/**
 * Leg card: DAO matching toward the next rank. Binary placement (owner, 2026-10-17): the Left and
 * the Right side of the member's placement team, each needs the full DAO.
 */
function renderLegs(data: DashboardData | null): void {
  const set = (id: string, html: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  const legs = data?.legs ?? { left: 0, right: 0, total: 0 };
  const next = data?.nextRank;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  set('legTeamVal', `${fmt(data?.teamVolume ?? 0)} DAO`);
  // where the member sits: "Left · DV1234" (or not joined yet)
  const placed = data?.placement;
  const placeEl = document.getElementById('legCountVal');
  if (placeEl)
    placeEl.textContent = placed
      ? `${placed.side === 'LEFT' ? 'Left' : 'Right'} · ${placed.underCode ?? '—'}`
      : data?.isRoot
        ? 'Top ID'
        : 'Not joined';
  if (!next) {
    set('legNextTarget', '<strong>Top rank reached: Crown President</strong>');
    set('legPowerVal', `${fmt(legs.left)} DAO`);
    set('legOtherVal', `${fmt(legs.right)} DAO`);
    set('legCountedVal', `${fmt(legs.total)} DAO`);
    return;
  }
  // DAO matching: the rank's DAO is needed on EACH side; matched = the smaller side
  const need = next.volume;
  set(
    'legNextTarget',
    `Next target: <strong>${next.name} &middot; ${need.toLocaleString()} DAO each side &middot; $${next.rewardUsd.toLocaleString()} reward</strong>`,
  );
  set('legPowerVal', `${fmt(legs.left)} / ${fmt(need)} DAO`);
  set('legOtherVal', `${fmt(legs.right)} / ${fmt(need)} DAO`);
  set('legCountedVal', `${fmt(next.countedVolume)} / ${fmt(need)}`);
  window.setTimeout(() => {
    const p = document.getElementById('legPowerBar');
    const o = document.getElementById('legOtherBar');
    if (p) p.style.width = `${Math.min(100, (legs.left / need) * 100)}%`;
    if (o) o.style.width = `${Math.min(100, (legs.right / need) * 100)}%`;
  }, 400);
}

/**
 * Fast-start bonus card (owner, 2026-10-18): 10 paid directs within 3 days of activating = Rocket
 * Start Bonus $100, within 7 days = Fast Start Bonus $50 (one bonus, inside the 25x cap). Shown
 * from the first visit (owner: both bonuses visible up front): before activation as the offer,
 * then with the countdown and direct count, then as earned or closed. Each bonus has its own row.
 */
function renderFastStart(data: DashboardData | null): void {
  const card = document.getElementById('fastStartCard');
  const tiersEl = document.getElementById('fastStartTiers');
  const fs = data?.fastStart;
  if (!card || !tiersEl || !fs) return;
  const set = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const now = Date.now();
  const timeLeft = (deadline: string) => {
    const left = new Date(deadline).getTime() - now;
    const d = Math.floor(left / 86_400_000),
      h = Math.floor(left / 3_600_000) % 24;
    return d > 0 ? `${d}d ${h}h left` : `${Math.max(1, h)}h left`;
  };
  const earned = fs.earnedDays ? (fs.tiers.find((t) => t.days === fs.earnedDays) ?? null) : null;
  const open = fs.joinedAt
    ? (fs.tiers.find((t) => t.deadline && new Date(t.deadline).getTime() > now) ?? null)
    : null;
  card.hidden = false;
  // ring + bar fill (--fs-fill) start once the card has risen into view, so the fill is seen growing
  const show = (pct: number) =>
    riseIn(card, () =>
      requestAnimationFrame(() => card.style.setProperty('--fs-fill', `${Math.min(100, pct)}%`)),
    );
  const ring = document.getElementById('fastStartRing');
  if (ring) ring.hidden = !fs.eligible;
  // ring: the number big, "of 10" under it (one line "0 / 10" did not fit small phones)
  const setCount = (n: number) => {
    set('fastStartCount', String(n));
    set('fastStartOf', `of ${fs.directsNeeded}`);
    ring?.setAttribute('aria-label', `${n} of ${fs.directsNeeded} directs activated`);
  };
  // one row per bonus, with its own state; rocket = the 3-day bonus, bolt = the 7-day one
  const ICON_ROCKET =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>';
  const ICON_BOLT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
  tiersEl.innerHTML = fs.tiers
    .map((t) => {
      const state = !fs.eligible
        ? ''
        : earned
          ? t === earned
            ? `Earned +$${fs.earnedUsd.toLocaleString()}`
            : ''
          : !t.deadline
            ? 'Starts when you activate'
            : new Date(t.deadline).getTime() > now
              ? `${Math.min(t.directs, fs.directsNeeded)} / ${fs.directsNeeded} · ${timeLeft(t.deadline)}`
              : 'Closed';
      const cls =
        earned === t
          ? ' is-earned'
          : t === open
            ? ' is-open'
            : state === 'Closed'
              ? ' is-closed'
              : '';
      return (
        `<div class="fs-tier${cls}"><span class="fs-tier-icon" aria-hidden="true">${t.days <= 3 ? ICON_ROCKET : ICON_BOLT}</span>` +
        `<span class="fs-tier-name">${t.name}</span><span class="fs-tier-rule">${fs.directsNeeded} directs within ${t.days} days</span>` +
        `<b class="mono fs-tier-amt">$${t.rewardUsd}</b>${state ? `<small class="fs-tier-state mono">${state}</small>` : ''}</div>`
      );
    })
    .join('');

  if (!fs.eligible) {
    set('fastStartTitle', 'Fast-start bonuses for members');
    set(
      'fastStartText',
      'Members earn these when 10 of their directs activate soon after they do. The company root does not receive them.',
    );
    show(0);
    return;
  }
  const collectBtn = document.getElementById('fastStartCollect');
  if (collectBtn) collectBtn.hidden = !(earned && fs.collected === false);
  if (earned) {
    card.classList.add('is-earned');
    const waiting = fs.collected === false;
    set('fastStartTitle', waiting ? `${earned.name}: ready to collect` : `${earned.name} earned`);
    set(
      'fastStartText',
      waiting
        ? `${fs.directsNeeded} directs activated within ${earned.days} days. Open your bonus box to add $${fs.earnedUsd.toLocaleString()} to your balance.`
        : `${fs.directsNeeded} directs activated within ${earned.days} days: +$${fs.earnedUsd.toLocaleString()} added to your balance.`,
    );
    setCount(fs.directsNeeded);
    show(100);
    return;
  }
  if (!fs.joinedAt) {
    set('fastStartTitle', 'Earn up to $100 extra');
    set(
      'fastStartText',
      `The clock starts the day you activate your ID. Get ${fs.directsNeeded} directs activated within 3 days for $100, or within 7 days for $50.`,
    );
    setCount(0);
    show(0);
    return;
  }
  if (!open) {
    const last = fs.tiers[fs.tiers.length - 1];
    set('fastStartTitle', 'Fast-start window closed');
    set(
      'fastStartText',
      `${Math.min(last.directs, fs.directsNeeded)} of ${fs.directsNeeded} directs activated within ${last.days} days of joining.`,
    );
    setCount(Math.min(last.directs, fs.directsNeeded));
    card.classList.add('is-closed');
    show((last.directs / fs.directsNeeded) * 100);
    return;
  }
  set('fastStartTitle', `${open.name}: $${open.rewardUsd}`);
  set(
    'fastStartText',
    `Get ${fs.directsNeeded} directs activated within ${open.days} days of joining. ${timeLeft(open.deadline!)}.`,
  );
  setCount(Math.min(open.directs, fs.directsNeeded));
  show((open.directs / fs.directsNeeded) * 100);
}

/**
 * Cards that appear after the data loads (fast-start bonus, DV token) rise in ONCE when they first
 * scroll into view (owner 2026-10-18: they popped in). onShow runs at that moment (fills, counters).
 * Reduced motion or no IntersectionObserver = shown at once. A later refresh only re-runs onShow.
 */
function riseIn(card: HTMLElement, onShow?: () => void): void {
  // the page-load cascade (dashboardFx fx-pre) must not hide a card that appears later
  card.classList.remove('fx-pre', 'fx-in');
  if (card.dataset.risen) {
    onShow?.();
    return;
  }
  card.dataset.risen = '1';
  if (
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !('IntersectionObserver' in window)
  ) {
    onShow?.();
    return;
  }
  card.classList.add('rise-pre');
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      card.classList.replace('rise-pre', 'rise-in');
      onShow?.();
      // the card's own animation only (children run their own loops); timer as a safety net
      const done = () => card.classList.remove('rise-in');
      card.addEventListener('animationend', (e) => e.target === card && done());
      window.setTimeout(done, 1600);
    },
    { threshold: 0.12 },
  );
  io.observe(card);
}

/**
 * The two money cards (owner 2026-10-19): "Ready to Collect" = rank rewards and the fast-start bonus still
 * waiting in their boxes (not withdrawable yet); "Withdrawable Balance" = collected level income, rewards
 * and bonuses minus withdrawals (what the withdraw form can send).
 */
function renderMoneyCards(data: DashboardData | null): void {
  const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const waiting = data?.pendingRewards ?? [];
  const waitingUsd = data?.rewardsWaitingUsd ?? 0;
  rollNumber(document.getElementById('metricWaitingVal'), waitingUsd, usd);
  const note = document.getElementById('metricWaitingNote');
  if (note)
    note.textContent = waiting.length
      ? `${waiting.length} ${waiting.length === 1 ? 'reward' : 'rewards'} waiting in ${waiting.length === 1 ? 'its box' : 'their boxes'}`
      : 'No rewards waiting';
  const link = document.getElementById('metricWaitingLink') as HTMLAnchorElement | null;
  if (link) {
    link.hidden = !waiting.length;
    // straight to the box: the bonus card when only the bonus waits, else the rank boxes
    link.href = waiting.every((w) => w.kind === 'bonus') ? '#fastStartCard' : '#rewardsSection';
  }
  document.getElementById('metricWaitingCard')?.classList.toggle('has-waiting', waiting.length > 0);
  rollNumber(document.getElementById('metricAvailVal'), data?.availableUsd ?? 0, usd);
  const avail = document.getElementById('metricAvailNote');
  if (avail && data)
    avail.textContent = `Pending ${usd(data.pendingWithdrawalUsd ?? 0)} · Withdrawn ${usd(data.withdrawnUsd ?? 0)}`;
}

/** Latest level commissions, rank rewards and bonuses. */
function renderIncome(data: DashboardData | null): void {
  const list = document.getElementById('incomeList');
  const split = document.getElementById('incomeSplit');
  if (split && data)
    split.textContent = `Level $${data.levelIncomeUsd.toLocaleString()} · Rank $${data.rankRewardsUsd.toLocaleString()}${data.bonusUsd ? ` · Bonus $${data.bonusUsd.toLocaleString()}` : ''}`;
  if (!list || !data?.recentEarnings.length) return;
  list.innerHTML = data.recentEarnings
    .map((e) => {
      const what =
        e.type === 'RANK_REWARD'
          ? `Rank reward &middot; ${RANK_TIERS[(e.level ?? 1) - 1]?.name ?? ''}`
          : e.type === 'FAST_START_BONUS'
            ? e.level === 3
              ? 'Rocket Start Bonus &middot; 10 directs in 3 days'
              : 'Fast Start Bonus &middot; 10 directs in 7 days'
            : `Level ${e.level} &middot; from ${formatAddress(e.from)}`;
      const when = new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      return `<li class="${e.type === 'LEVEL_COMMISSION' ? '' : 'is-rank'}"><span>${what}</span><span class="income-when">${when}</span><b>+${formatUsd(e.amountUsd)}</b></li>`;
    })
    .join('');
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
    inputEl.value = data
      ? fullLink
      : serverDown
        ? 'Server unavailable · refresh in a minute to see your link'
        : 'Activate your ID to get your invite link';
  }
  const idEl = document.getElementById('dashMemberId');
  if (idEl) idEl.textContent = data ? refCode : '–';
  // every wallet gets its permanent link on its first visit, and it works at once, paid or not
  // (owner, 2026-10-13: teams are built during the pre-launch marketing days)
  const activated = Boolean(data?.packages?.length) || Boolean(data?.isRoot); // the root sponsors without paying
  // the member's own invite code is never their sponsor (they opened their own link)
  // before payment the sponsor is the latest invite saved on the server (browser copy if offline)
  let pendingRef = (getPendingReferral() || data?.pendingSponsorCode || '').replace(
    /[^A-Za-z0-9]/g,
    '',
  );
  if (data && pendingRef === refCode) {
    clearPendingReferral();
    pendingRef = '';
  }
  if (sponsorTag) {
    // before activation the sponsor is still the invite code this visitor arrived with
    const sponsor = data?.sponsorCode ?? (activated ? null : pendingRef);
    sponsorTag.innerHTML = sponsor
      ? `Sponsor <b>${sponsor.replace(/[^A-Za-z0-9]/g, '')}</b>`
      : 'Joined direct';
    // say it now, not at payment time, when the invite code does not exist
    if (!data?.sponsorCode && !activated && pendingRef) {
      getSponsorByCode(pendingRef).catch((error) => {
        if (!(error instanceof ApiError && error.status === 404)) return;
        sponsorTag.innerHTML = `Invite <b>${pendingRef}</b> not found`;
        sponsorTag.classList.add('is-warn');
        showToast(`Invite code ${pendingRef} was not found. Check your invite link.`, true);
      });
    }
  }
  if (!data && copyBtn) (copyBtn as HTMLButtonElement).disabled = true;
  const copiedMsg = 'Referral link copied to clipboard!';

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

  const percentage = maxCap > 0 ? Math.min(100, Math.round((currentEarned / maxCap) * 100)) : 0;

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
  if (note)
    note.textContent = data ? `${data.levelsUnlocked} / 20 levels unlocked` : 'Live data required';

  tbody.innerHTML = '';
  LEVEL_MATRIX.forEach((row, idx) => {
    const live = data?.levels[idx];
    const isUnlocked = live ? live.unlocked : false;
    const tr = document.createElement('tr');
    const hasMembers = (live?.members ?? 0) > 0;
    const statusText = isUnlocked ? '✓ Unlocked' : hasMembers ? 'Viewable' : '🔒 Locked';
    const statusClass = isUnlocked ? 'unlocked' : hasMembers ? 'viewable' : 'locked';
    tr.className = `${isUnlocked ? 'lvl-row' : 'lvl-row is-locked'}${hasMembers ? ' is-browseable' : ''}`;
    tr.style.setProperty('--i', String(idx));
    tr.innerHTML = `
      <td><strong>Level ${row.level}</strong></td>
      <td><span style="color: var(--gold); font-weight: 700;">${row.pct}%</span> ($${row.usd})</td>
      <td>${row.reqDirects === 0 ? '0 Directs (Open)' : `${row.reqDirects} Directs Required`}</td>
      <td>
        <span class="level-status-tag ${statusClass}">
          ${statusText}
        </span>
      </td>
      <td><span class="lvl-members">${(live?.members ?? 0).toLocaleString()}${hasMembers ? ' <i aria-hidden="true">&rsaquo;</i>' : ''}</span></td>
      <td><strong>${formatUsd(live?.earnedUsd ?? 0)}</strong></td>
    `;
    // Members are viewable before activation; the locked status still controls earning eligibility.
    if (data && hasMembers) {
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', `Level ${row.level}: see ${live?.members ?? 0} members`);
      const open = () => openLevelModal(data.walletAddress, row.level);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    }
    tbody.appendChild(tr);
  });
  // once the rows have cascaded in, drop the finished animation: kept with fill-mode it held a GPU
  // layer per row and phones left rows blank while scrolling fast (owner, 2026-10-12)
  tbody.classList.remove('is-settled');
  window.setTimeout(() => tbody.classList.add('is-settled'), 2200);
}

// ── Withdrawals: wallet-signature session, request, history ─────────────

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Processing',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REJECTED: 'Returned to balance',
};

const PAYOUT_ABI = [
  'function claim(bytes32 id, uint256 amount, uint256 deadline, bytes signature)',
];
/** withdrawal preview (owner 2026-10-19): on the dev server, open the dashboard with ?wdDemo to walk through
 *  every withdrawal step without sending anything. Never on the live site, never on a real error. */
const WD_DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('wdDemo');
const scanTx = (hash: string) =>
  `https://${BSC_CHAIN_ID === 97 ? 'testnet.' : ''}bscscan.com/tx/${hash}`;

/**
 * Instant payout: the member's wallet submits the signed voucher to the payout contract,
 * which sends the USDT in the same transaction; then the backend verifies and marks it paid.
 */
async function claimVoucher(
  token: string,
  w: Withdrawal,
  onStage: (stage: 'confirm' | 'sending' | 'arriving') => void = () => {},
): Promise<Withdrawal> {
  if (!w.voucher) throw new Error('This withdrawal is no longer open.');
  if (REAL_PAYMENTS_LOCKED) throw new Error(REAL_PAYMENTS_LOCKED_MSG);
  const provider = getActiveProvider();
  if (!provider) throw new Error('Please reconnect your wallet to receive this withdrawal.');
  await requireBSCNetwork(provider);
  // the voucher pays msg.sender, so it must be the member's own account
  const payout = new Contract(
    w.voucher.contract,
    PAYOUT_ABI,
    await getSignerFor(provider, w.destinationWallet),
  );
  onStage('confirm');
  const tx = await payout.claim(
    w.voucher.id,
    w.voucher.amount,
    w.voucher.deadline,
    w.voucher.signature,
  );
  onStage('sending');
  await tx.wait();
  onStage('arriving');
  return confirmWithdrawal(token, w.id, tx.hash);
}

function renderWithdrawalSummary(summary: WithdrawalSummary): void {
  const availEl = document.getElementById('withAvailBalance');
  const meta = document.getElementById('withMeta');
  rollNumber(availEl, summary.availableUsd, (n) => `${formatUsd(n)} USDT`);
  if (meta)
    meta.textContent = `Pending ${formatUsd(summary.pendingUsd)} · Withdrawn ${formatUsd(summary.withdrawnUsd)} · Min ${formatUsd(summary.minimumUsd)} · Max ${formatUsd(summary.maximumUsd ?? 5_000)}`;
  const box = document.getElementById('withHistory');
  const list = document.getElementById('withHistoryList');
  if (!box || !list) return;
  box.hidden = summary.items.length === 0;
  list.innerHTML = summary.items
    .map((w) => {
      const date = new Date(w.createdAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      });
      const tx =
        w.payoutTxHash && w.status === 'COMPLETED'
          ? ` <a href="${scanTx(w.payoutTxHash)}" target="_blank" rel="noopener">View transfer &nearr;</a>`
          : '';
      const reason = w.rejectReason
        ? `<small>${w.rejectReason.replace(/[<>&"]/g, '')}</small>`
        : '';
      const label = w.voucher ? 'Ready to receive' : (STATUS_LABEL[w.status] ?? 'Processing');
      const claim = w.voucher
        ? `<button type="button" class="with-claim" data-claim="${w.id}">Receive now &rarr;</button>`
        : '';
      return `<li class="is-${w.status.toLowerCase()}"><span>${date} · ${formatUsd(w.grossUsd)} → <b>${formatUsd(w.netUsd)}</b></span><span class="with-status">${label}${tx}</span>${claim}${reason}</li>`;
    })
    .join('');
}

function initWithdrawals(
  wallet: string,
  availableBalance: number,
  data: DashboardData | null,
): void {
  const availEl = document.getElementById('withAvailBalance');
  const inputEl = document.getElementById('withAmountInput') as HTMLInputElement | null;
  const grossEl = document.getElementById('withGrossVal');
  const feeEl = document.getElementById('withFeeVal');
  const netEl = document.getElementById('withNetVal');
  const submitBtn = document.getElementById('withSubmitBtn') as HTMLButtonElement | null;
  const label = document.getElementById('withSubmitLabel');
  const note = document.getElementById('withPayoutNote');
  const feeLbl = document.getElementById('withFeeLbl');
  let available = availableBalance;
  let feePercent = 5;
  // per request (owner 2026-10-19): minimum $10, maximum $5,000 and never more than the available
  // balance; the server values win and the server checks them again
  let minimum = data?.withdrawalMinUsd ?? 10;
  let maximum = data?.withdrawalMaxUsd ?? 5_000;
  if (inputEl) {
    inputEl.min = String(minimum);
    inputEl.max = String(maximum);
  }
  let items: Withdrawal[] = [];

  rollNumber(availEl, available, (n) => `${formatUsd(n)} USDT`);
  const meta = document.getElementById('withMeta');
  if (meta && data)
    meta.textContent = `Pending ${formatUsd(data.pendingWithdrawalUsd)} · Withdrawn ${formatUsd(data.withdrawnUsd)} · Min ${formatUsd(minimum)} · Max ${formatUsd(maximum)}`;

  const updateMath = (): void => {
    const amount = Math.max(0, parseFloat(inputEl?.value || '0') || 0);
    const fee = Math.round(amount * feePercent) / 100;
    if (grossEl) grossEl.textContent = formatUsd(amount);
    if (feeEl) feeEl.textContent = `-${formatUsd(fee)}`;
    if (feeLbl) feeLbl.textContent = `Withdrawal fee (${feePercent}%)`;
    if (netEl) netEl.textContent = `${formatUsd(Math.max(0, amount - fee))} USDT`;
  };

  const presetBtns = document.querySelectorAll<HTMLButtonElement>('.wd-preset-btn');
  const syncPresets = (currentVal: number): void => {
    presetBtns.forEach((btn) => {
      const presetVal = Number(btn.dataset.preset);
      btn.classList.toggle('is-active', Math.abs(presetVal - currentVal) < 0.01);
    });
  };

  inputEl?.addEventListener('input', () => {
    updateMath();
    syncPresets(parseFloat(inputEl?.value || '0') || 0);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!inputEl) return;
      const targetAmount = Number(btn.dataset.preset);
      inputEl.value = String(targetAmount);
      updateMath();
      syncPresets(targetAmount);
      inputEl.focus();
    });
  });

  // Max = the whole available balance, capped at the per-request maximum (whole cents)
  document.getElementById('withMaxBtn')?.addEventListener('click', () => {
    if (!inputEl) return;
    const maxVal = Math.floor(Math.max(0, Math.min(available, maximum)) * 100) / 100;
    inputEl.value = String(maxVal);
    updateMath();
    syncPresets(maxVal);
    inputEl.focus();
  });
  updateMath();

  if (!data || !submitBtn) {
    if (submitBtn) submitBtn.disabled = true;
    if (label) label.textContent = 'Activate your ID to withdraw';
    if (note) note.textContent = 'Withdrawals become available once your ID is activated.';
    return;
  }

  document.addEventListener('dv:balance-changed', () => {
    const session = savedSession(wallet);
    if (session) void refresh(session).catch(() => undefined);
  });
  const refresh = async (token: string) => {
    const summary = await getWithdrawals(token);
    available = summary.availableUsd;
    feePercent = summary.feePercent;
    minimum = summary.minimumUsd;
    maximum = summary.maximumUsd ?? maximum;
    items = summary.items;
    if (note)
      note.textContent = summary.instant
        ? 'Confirm once in your wallet and the USDT is sent to you, usually within seconds.'
        : WD_DEMO
          ? 'Preview mode: tap "Withdraw now" to see every step. Nothing is sent.'
          : 'Withdrawals are not available right now. Your balance stays safely recorded here.';
    renderWithdrawalSummary(summary);
    updateMath();
  };

  // member-facing texts only: server messages are already written for members; anything else
  // (network, wallet library) becomes one calm sentence, never a technical error
  const failMessage = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      clearSession(wallet);
      return 'Your session has ended. Please tap again to sign in.';
    }
    if (error instanceof ApiError) return error.message;
    const code = (error as { code?: string | number })?.code;
    if (code === 'ACTION_REJECTED' || code === 4001)
      return 'Cancelled in your wallet. You can receive it from "Your withdrawals" before it expires.';
    return 'We could not complete your withdrawal right now. Please try again in a few minutes.';
  };

  // ── the withdrawal, step by step (owner 2026-10-19): Amount → Confirm → Sending → Received ──
  // While it runs, the form is swapped for a stepper and one clear card per step; the last step is a
  // full success screen. Plain words only: no fees, no technical terms (the wallet shows its own fee).
  const formEl = document.getElementById('withForm');
  const flowEl = document.getElementById('withFlow');
  const stageIcon = document.getElementById('withStageIcon');
  const stageTitle = document.getElementById('withStageTitle');
  const stageAmount = document.getElementById('withStageAmount');
  const stageText = document.getElementById('withStageText');
  const stageRows = document.getElementById('withStageRows');
  const stageHint = document.getElementById('withStageHint');
  const doneBtn = document.getElementById('withDoneBtn') as HTMLButtonElement | null;
  const SVG = (path: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const STAGE_ICON = {
    verify: SVG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    wallet: SVG('<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16" cy="14" r="1.4"/>'),
    working: '<span class="wd-spin"></span>',
    done: SVG('<path d="M5 12.5 10 17 19 7.5"/>'),
  };
  type Stage = 'verify' | 'preparing' | 'confirm' | 'sending' | 'arriving' | 'done';
  // the "Sending" card's own checklist (owner 2026-10-19): approved, confirming on the chain, arriving
  const sendChecklist = (stage: 'sending' | 'arriving') => {
    const item = (label: string, state: 'done' | 'active' | 'wait') =>
      `<li class="wd-check is-${state}"><i aria-hidden="true"></i><span>${label}</span><em>${state === 'done' ? 'Done' : state === 'active' ? 'In progress' : 'Waiting'}</em></li>`;
    return (
      item('Withdrawal approved', 'done') +
      item('Confirming on BNB Smart Chain', stage === 'sending' ? 'active' : 'done') +
      item('USDT arriving in your wallet', stage === 'sending' ? 'wait' : 'active')
    );
  };
  type FlowInfo = { grossUsd: number; netUsd: number; txHash?: string | null };
  const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
  const row = (k: string, v: string, cls = '') =>
    `<div class="wd-row${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
  const stageDetail = (info: FlowInfo) =>
    row('Wallet', formatAddress(wallet)) +
    row('Amount', `${formatUsd(info.grossUsd)} <small>(you receive ${formatUsd(info.netUsd)})</small>`, ' is-gold') +
    row('Network', 'BNB Smart Chain', ' is-ok');
  const setStage = (stage: Stage, info: FlowInfo) => {
    if (!flowEl || !formEl) return;
    formEl.hidden = true;
    flowEl.hidden = false;
    const step = stage === 'sending' || stage === 'arriving' ? 3 : stage === 'done' ? 4 : 2;
    flowEl.querySelectorAll<HTMLElement>('.wd-pill').forEach((pill) => {
      const n = Number(pill.dataset.step);
      pill.classList.toggle('is-done', n < step || (stage === 'done' && n === 4));
      pill.classList.toggle('is-active', n === step && stage !== 'done');
    });
    flowEl.classList.toggle('is-success', stage === 'done');
    const text = {
      verify: ['Verify your wallet', 'Approve the sign-in request in your wallet. It only confirms that this wallet is yours.'],
      preparing: ['Preparing your withdrawal', 'Checking your balance. This takes a moment.'],
      confirm: ['Confirm in your wallet', 'Approve the withdrawal in your wallet. Your USDT is sent right after.'],
      sending: ['Sending your USDT', 'This usually takes a few seconds. Please keep this page open.'],
      arriving: ['Sending your USDT', 'Almost done. Your USDT is arriving in your wallet.'],
      done: ['Withdrawal successful!', 'The USDT is in your wallet.'],
    }[stage];
    if (stageIcon)
      stageIcon.innerHTML =
        stage === 'verify' ? STAGE_ICON.verify : stage === 'confirm' ? STAGE_ICON.wallet : stage === 'done' ? STAGE_ICON.done : STAGE_ICON.working;
    if (stageTitle) stageTitle.textContent = text[0];
    if (stageText) stageText.textContent = text[1];
    if (stageAmount) {
      stageAmount.hidden = stage !== 'done';
      stageAmount.textContent = `+${formatUsd(info.netUsd)} USDT`;
    }
    if (stageRows)
      stageRows.innerHTML =
        stage === 'done'
          ? (info.txHash
              ? row('Transaction', `<a href="${scanTx(info.txHash)}" target="_blank" rel="noopener">${shortHash(info.txHash)} &nearr;</a>`, ' is-gold')
              : '') + row('Status', '&check; Confirmed', ' is-ok')
          : stage === 'sending' || stage === 'arriving'
            ? row('You receive', `${formatUsd(info.netUsd)} USDT`, ' is-gold')
            : stage === 'preparing'
              ? row('You receive', `${formatUsd(info.netUsd)} USDT`, ' is-gold')
              : stageDetail(info);
    const checks = document.getElementById('withStageChecks');
    if (checks) {
      checks.hidden = !(stage === 'sending' || stage === 'arriving');
      if (!checks.hidden) checks.innerHTML = sendChecklist(stage as 'sending' | 'arriving');
    }
    if (stageHint) {
      stageHint.hidden = !(stage === 'verify' || stage === 'confirm');
      stageHint.textContent = 'A pop-up opens in your wallet app. Tap "Confirm" there.';
    }
    if (doneBtn) doneBtn.hidden = stage !== 'done';
    const hashBox = document.getElementById('withStageHash');
    const hashValue = document.getElementById('withStageHashValue');
    if (hashBox) hashBox.hidden = !(stage === 'done' && info.txHash);
    if (hashValue) hashValue.textContent = info.txHash ?? '';
  };
  // copy the full transaction hash (selects the text when the clipboard is not allowed)
  document.getElementById('withStageHashCopy')?.addEventListener('click', async (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    const value = document.getElementById('withStageHashValue');
    const hash = value?.textContent ?? '';
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      button.textContent = 'Copied';
      window.setTimeout(() => (button.textContent = 'Copy'), 1_800);
    } catch {
      if (value) {
        const range = document.createRange();
        range.selectNodeContents(value);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  });
  const closeFlow = () => {
    if (flowEl) flowEl.hidden = true;
    if (formEl) formEl.hidden = false;
  };
  doneBtn?.addEventListener('click', closeFlow);

  /** the member's wallet receives the voucher and sends the USDT to itself */
  const receive = async (token: string, w: Withdrawal) => {
    const info: FlowInfo = { grossUsd: w.grossUsd, netUsd: w.netUsd };
    setStage('confirm', info);
    const paid = await claimVoucher(token, w, (stage) => setStage(stage, info));
    setStage('done', { ...info, txHash: paid.payoutTxHash });
    if (stageIcon) celebrate(stageIcon, 30);
    await refresh(token);
  };

  /** preview of every step without sending anything (dev server + ?wdDemo only) */
  const demo = async (amount: number) => {
    const info: FlowInfo = {
      grossUsd: amount,
      netUsd: Math.round(amount * (1 - feePercent / 100) * 100) / 100,
    };
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    setStage('verify', info);
    await pause(1_600);
    setStage('preparing', info);
    await pause(1_000);
    setStage('confirm', info);
    await pause(2_000);
    setStage('sending', info);
    await pause(2_200);
    setStage('arriving', info);
    await pause(1_400);
    setStage('done', { ...info, txHash: '0x8a1f3c5e7b9d0f2a4c6e8a0b2d4f6a8c0e2a4c6e8a0b2d4f6a8c0e2a4c6e9c4b' });
    if (stageIcon) celebrate(stageIcon, 35);
  };

  // signed in earlier on this device: show history straight away
  const token = savedSession(wallet);
  if (token) {
    if (label) label.textContent = 'Withdraw now →';
    refresh(token).catch(() => clearSession(wallet));
  }

  submitBtn.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    const amount = Math.round((parseFloat(inputEl?.value || '0') || 0) * 100) / 100;
    if (amount <= 0) {
      showToast('Enter the amount you want to withdraw.', true);
      return;
    }
    if (amount < minimum) {
      showToast(`The minimum withdrawal is ${formatUsd(minimum)}.`, true);
      return;
    }
    if (amount > maximum) {
      showToast(`The maximum withdrawal is ${formatUsd(maximum)} at a time.`, true);
      return;
    }
    if (amount > available) {
      showToast(`You can withdraw up to ${formatUsd(available)}, your available balance.`, true);
      return;
    }
    submitBtn.disabled = true;
    const idleLabel = label?.textContent ?? '';
    if (WD_DEMO) {
      if (label) label.textContent = 'Processing…';
      await demo(amount);
      submitBtn.disabled = false;
      if (label) label.textContent = idleLabel;
      return;
    }
    const info: FlowInfo = {
      grossUsd: amount,
      netUsd: Math.round(amount * (1 - feePercent / 100) * 100) / 100,
    };
    try {
      // a saved session needs no new signature: straight to "Preparing"
      setStage(savedSession(wallet) ? 'preparing' : 'verify', info);
      const session = await signIn(wallet);
      if (label) label.textContent = 'Processing…';
      setStage('preparing', info);
      const created = await requestWithdrawal(session, amount);
      if (inputEl) inputEl.value = '0';
      updateMath();
      if (created.voucher) {
        await refresh(session);
        await receive(session, created);
      } else {
        closeFlow();
        showToast('Your withdrawal has been recorded and is being processed.');
        await refresh(session);
      }
    } catch (error) {
      closeFlow();
      showToast(failMessage(error), true);
      const session = savedSession(wallet);
      if (session) refresh(session).catch(() => {});
    } finally {
      submitBtn.disabled = false;
      if (label) label.textContent = savedSession(wallet) ? 'Withdraw now →' : idleLabel;
    }
  });

  // "Receive now" on an open voucher in the history (e.g. after cancelling the wallet pop-up)
  document.getElementById('withHistoryList')?.addEventListener('click', async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-claim]');
    if (!button) return;
    const w = items.find((x) => x.id === button.dataset.claim);
    const session = savedSession(wallet);
    if (!w || !session) {
      showToast('Please sign in again to receive this withdrawal.', true);
      return;
    }
    button.disabled = true;
    try {
      await receive(session, w);
    } catch (error) {
      closeFlow();
      showToast(failMessage(error), true);
      button.disabled = false;
    }
  });
}
