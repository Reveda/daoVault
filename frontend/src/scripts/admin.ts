/**
 * DAOvault admin = the company's Admin Console (owner, 2026-10-10; was "Command Center"): overview KPIs, charts of
 * the business (adminCharts.ts), how the system works with live numbers, and the withdrawal
 * queue. Access = wallet listed in ADMIN_WALLETS on the backend + a wallet signature (made on
 * the dashboard). Everyone else gets "page not found" (openIfAdmin; Nginx too on the VPS).
 * Payouts are sent by the admin from the treasury wallet; the backend accepts "paid" only
 * after it finds that USDT transfer on-chain. Background: the landing particle scene.
 */
import { whenReady } from './core.ts';
import { BSC_CHAIN_ID, formatAddress, showToast } from './core.ts';
import { signIn as sessionFor, silentSession } from './session.ts';
import {
  ApiError,
  approveWithdrawal,
  completeWithdrawal,
  getAdminStats,
  getAdminAnalytics,
  getAdminLedger,
  getAdminWithdrawals,
  rejectWithdrawal,
  type LedgerGroup,
  type Withdrawal,
  type WithdrawalPeriod,
} from './api.ts';
import { initDvLogos } from './dvLogo.ts';
import { renderCompanyOverview } from './companyOverview.ts';
import { renderAdminCharts, renderLedger, renderTracking } from './adminCharts.ts';
import { init3DScene } from './scene.ts';
import { pageCount, renderPager } from './pager.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const scan = (kind: 'tx' | 'address', v: string) =>
  `https://${BSC_CHAIN_ID === 97 ? 'testnet.' : ''}bscscan.com/${kind}/${v}`;
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// admin wallet once signed in; every call gets a fresh access token (memory + refresh cookie)
let adminWallet = '';
const token = () => sessionFor(adminWallet);
let status: Withdrawal['status'] = 'PENDING';
let listPage = 1;
// filters (owner, 2026-10-18): ledger by day / week / month, withdrawals by request date
let ledgerGroup: LedgerGroup = 'day';
let period: WithdrawalPeriod = 'all';

const HELP: Record<Withdrawal['status'], string> = {
  PENDING:
    'Check the member, then Approve (or Reject with a reason: the amount returns to their balance).',
  PROCESSING:
    'Send the NET amount in USDT from the treasury wallet to the member, then paste the transaction hash. It is verified on-chain.',
  COMPLETED: 'Paid and verified on BNB Smart Chain.',
  REJECTED: 'Rejected requests. The amount went back to the member balance.',
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Admin page gate (owner, 2026-10-11): the page exists only for a signed-in admin wallet.
 * Session from the refresh cookie only (silentSession): no wallet prompt, no "sign in" button,
 * nothing that tells a visitor an admin area is here. Admins sign in on their dashboard, which
 * sends them here. A sleeping / failing server is retried for about a minute (Render wakes up).
 */
async function openIfAdmin(): Promise<void> {
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const session = await silentSession();
      if (!session || session.role !== 'admin') return showNotFound();
      adminWallet = session.wallet;
      await loadStats(); // the server answers 403 unless the wallet is in ADMIN_WALLETS
      return revealAdmin();
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) return showNotFound();
      showNotFound(); // shown while waiting; replaced by the panel if a retry gets through
      await wait(10_000);
    }
  }
}

function showNotFound(): void {
  $('notFound')!.hidden = false;
}

function revealAdmin(): void {
  $('notFound')!.hidden = true;
  $('adminRoot')!.hidden = false;
  document.title = 'DAOvault';
  initDvLogos(); // animated DAOVAULT logo: header, footer
  init3DScene('admin'); // gold particles + lightning, like the landing page
  const badge = $('adminWallet');
  if (badge) {
    badge.hidden = false;
    badge.textContent = formatAddress(adminWallet);
  }
  $('adminApp')!.hidden = false;
  $('adminState')!.textContent = `• Administrator · ${formatAddress(adminWallet)}`;
  $('adminHeroActions')!.hidden = false;
  $('adminToDash')!.hidden = false;
  loadList().catch((error) =>
    showToast(error instanceof Error ? error.message : 'Could not load.', true),
  );
}

/** KPIs + charts + live numbers (stats and analytics in parallel) */
async function loadStats(): Promise<void> {
  const session = await token();
  const [stats, analytics] = await Promise.all([
    getAdminStats(session),
    getAdminAnalytics(session),
  ]);
  renderCompanyOverview($('adminStats')!, stats);
  renderAdminCharts(stats, analytics);
  renderTracking(analytics);
  await loadLedger();
}

/** treasury ledger in the chosen grouping */
async function loadLedger(): Promise<void> {
  renderLedger(await getAdminLedger(await token(), ledgerGroup));
}

/** a segmented filter: marks the pressed button and calls back with its value */
function bindSeg(id: string, key: string, onPick: (value: string) => void): void {
  const seg = $(id);
  seg?.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.classList.contains('is-active')) return;
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((x) => {
        x.classList.toggle('is-active', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      onPick(b.dataset[key] ?? '');
    }),
  );
}

/** withdrawal queue, 20 per page */
async function loadList(page = listPage): Promise<void> {
  listPage = page;
  $('adminHelp')!.textContent = HELP[status];
  const res = await getAdminWithdrawals(await token(), status, page, period);
  const items = res.items;
  const when =
    period === 'week'
      ? 'in the last 7 days'
      : period === 'month'
        ? 'in the last 30 days'
        : 'in total';
  $('wdSummary')!.textContent =
    `${res.total} ${res.total === 1 ? 'withdrawal' : 'withdrawals'} ${when} · ${usd(res.netUsd)} net`;
  const list = $('adminList')!;
  renderPager($('adminPager'), res.page, pageCount(res.total, res.pageSize), (p) => {
    loadList(p).catch((error) =>
      showToast(error instanceof Error ? error.message : 'Could not load.', true),
    );
  });
  if (!items.length) {
    list.innerHTML = '<p class="admin-empty">Nothing here.</p>';
    return;
  }
  list.innerHTML = items
    .map(
      (w) => `
    <article class="admin-item" data-id="${w.id}">
      <div class="admin-item-main">
        <div class="admin-amount"><b>${usd(w.netUsd)}</b> <span class="mono">net USDT</span></div>
        <div class="mono admin-sub">${usd(w.grossUsd)} requested · ${usd(w.feeUsd)} fee · ${new Date(w.createdAt).toLocaleString()}</div>
        <div class="mono admin-sub">To <a href="${scan('address', w.destinationWallet)}" target="_blank" rel="noopener">${w.destinationWallet}</a> · ${esc(w.referralCode ?? '')}</div>
        ${w.payoutTxHash ? `<div class="mono admin-sub">Paid: <a href="${scan('tx', w.payoutTxHash)}" target="_blank" rel="noopener">${formatAddress(w.payoutTxHash)}</a></div>` : ''}
        ${w.rejectReason ? `<div class="mono admin-sub">Reason: ${esc(w.rejectReason)}</div>` : ''}
      </div>
      <div class="admin-actions">
        ${w.instant ? '<p class="mono admin-sub">Instant payout: the member claims it from the payout contract. No action needed.</p>' : ''}
        ${
          !w.instant && w.status === 'PENDING'
            ? `
          <button class="btn btn-grad" data-act="approve" type="button">Approve</button>
          <input class="ref-input" data-field="reason" placeholder="Reason to reject" maxlength="280" />
          <button class="btn admin-btn-danger" data-act="reject" type="button">Reject</button>`
            : ''
        }
        ${
          !w.instant && w.status === 'PROCESSING'
            ? `
          <input class="ref-input mono" data-field="tx" placeholder="Payout tx hash 0x…" />
          <button class="btn btn-grad" data-act="complete" type="button">Mark paid</button>
          <input class="ref-input" data-field="reason" placeholder="Reason to reject" maxlength="280" />
          <button class="btn admin-btn-danger" data-act="reject" type="button">Reject</button>`
            : ''
        }
      </div>
    </article>`,
    )
    .join('');
}

async function act(item: HTMLElement, action: string, button: HTMLButtonElement): Promise<void> {
  const id = item.dataset.id!;
  const field = (name: string) =>
    item.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value.trim() ?? '';
  button.disabled = true;
  try {
    if (action === 'approve') await approveWithdrawal(await token(), id);
    if (action === 'reject') {
      const reason = field('reason');
      if (reason.length < 3) {
        showToast('Write a short reason first.', true);
        return;
      }
      await rejectWithdrawal(await token(), id, reason);
    }
    if (action === 'complete') {
      const tx = field('tx');
      if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
        showToast('Paste the full payout transaction hash.', true);
        return;
      }
      showToast('Checking the transfer on-chain...');
      await completeWithdrawal(await token(), id, tx);
    }
    showToast(
      action === 'approve'
        ? 'Approved. Now send the payout.'
        : action === 'reject'
          ? 'Rejected. Amount returned to member.'
          : 'Payout verified on-chain.',
    );
    await Promise.all([loadStats(), loadList()]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      showToast('Session expired. Sign in again.', true);
      window.setTimeout(() => window.location.reload(), 1200);
      return;
    }
    showToast(error instanceof Error ? error.message : 'Action failed.', true);
  } finally {
    button.disabled = false;
  }
}

whenReady(() => {
  openIfAdmin().catch(() => showNotFound());
  $('adminRefresh')?.addEventListener('click', async (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await Promise.all([loadStats(), loadList()]);
      showToast('Data refreshed.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not refresh the data. Please try again.',
        true,
      );
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });
  bindSeg('ledgerGroup', 'group', (value) => {
    ledgerGroup = value as LedgerGroup;
    loadLedger().catch((error) =>
      showToast(error instanceof Error ? error.message : 'Could not load the ledger.', true),
    );
  });
  bindSeg('wdPeriod', 'period', (value) => {
    period = value as WithdrawalPeriod;
    loadList(1).catch((error) =>
      showToast(error instanceof Error ? error.message : 'Could not load.', true),
    );
  });
  document.querySelectorAll<HTMLButtonElement>('.admin-tabs button').forEach((tab) =>
    tab.addEventListener('click', () => {
      document
        .querySelectorAll('.admin-tabs button')
        .forEach((t) => t.classList.toggle('is-active', t === tab));
      status = tab.dataset.status as Withdrawal['status'];
      loadList(1).catch((error) =>
        showToast(error instanceof Error ? error.message : 'Could not load.', true),
      );
    }),
  );
  $('adminList')?.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const item = button?.closest<HTMLElement>('.admin-item');
    if (button && item) act(item, button.dataset.act!, button);
  });
});
