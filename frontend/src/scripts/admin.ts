/**
 * DAOvault admin: withdrawal queue. Access = wallet listed in ADMIN_WALLETS on the
 * backend + a fresh wallet signature. Payouts are sent by the admin from the treasury
 * wallet; the backend accepts "paid" only after it finds that USDT transfer on-chain.
 */
import { BSC_CHAIN_ID, formatAddress, showToast } from './core.ts';
import { autoReconnect, connectWithProvider, getActiveProvider, getInstalledWallets, getSignerFor } from './wallet.ts';
import {
  ApiError,
  approveWithdrawal,
  completeWithdrawal,
  getAdminStats,
  getAdminWithdrawals,
  getAuthChallenge,
  rejectWithdrawal,
  verifyAuthSignature,
  type Withdrawal,
} from './api.ts';
import { initDvLogos } from './dvLogo.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const scan = (kind: 'tx' | 'address', v: string) => `https://${BSC_CHAIN_ID === 97 ? 'testnet.' : ''}bscscan.com/${kind}/${v}`;
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

let token = '';
let status: Withdrawal['status'] = 'PENDING';

const HELP: Record<Withdrawal['status'], string> = {
  PENDING: 'Check the member, then Approve (or Reject with a reason: the amount returns to their balance).',
  PROCESSING: 'Send the NET amount in USDT from the treasury wallet to the member, then paste the transaction hash. It is verified on-chain.',
  COMPLETED: 'Paid and verified on BNB Smart Chain.',
  REJECTED: 'Rejected requests. The amount went back to the member balance.',
};

async function signIn(): Promise<void> {
  let wallet = await autoReconnect();
  if (!wallet) {
    const [first] = getInstalledWallets();
    if (!first) { showToast('Install or open a Web3 wallet to sign in.', true); return; }
    wallet = await connectWithProvider(first.provider, first.name);
  }
  const { message } = await getAuthChallenge(wallet);
  const signer = await getSignerFor(getActiveProvider(), wallet);
  const session = await verifyAuthSignature(wallet, await signer.signMessage(message));
  if (session.role !== 'admin') {
    showToast('This wallet is not an admin.', true);
    $('adminState')!.textContent = `• ${formatAddress(wallet)} is not an admin wallet`;
    return;
  }
  token = session.token;
  const badge = $('adminWallet');
  if (badge) { badge.hidden = false; badge.textContent = formatAddress(wallet); }
  $('adminSignIn')!.hidden = true;
  $('adminLocked')!.hidden = true;
  $('adminApp')!.hidden = false;
  $('adminState')!.textContent = '• Signed in as admin';
  await Promise.all([loadStats(), loadList()]);
}

async function loadStats(): Promise<void> {
  const s = await getAdminStats(token);
  const pending = s.withdrawals.PENDING;
  const approved = s.withdrawals.PROCESSING;
  const tile = (label: string, value: string, note = '') =>
    `<div class="glass metric-card"><div class="metric-top"><span class="metric-label mono">${label}</span></div><div class="metric-val">${value}</div><div class="metric-footer mono">${note}</div></div>`;
  $('adminStats')!.innerHTML = [
    tile('Members', s.members.toLocaleString(), `${s.packages.toLocaleString()} packages · ${usd(s.volumeUsd)}`),
    tile('Level income', usd(s.levelCommissionsUsd), 'credited to members'),
    tile('Rank rewards', usd(s.rankRewardsUsd), 'credited to members'),
    tile('To pay', usd((pending?.netUsd ?? 0) + (approved?.netUsd ?? 0)), `${pending?.count ?? 0} pending · ${approved?.count ?? 0} approved`),
    s.payout
      ? tile('Instant payout float', s.payout.error ? 'Unreadable' : usd(s.payout.floatUsd ?? 0), s.payout.error ?? `${s.payout.paused ? 'PAUSED · ' : ''}max ${usd(s.payout.maxPerClaimUsd ?? 0)} each · ${usd(s.payout.dailyLimitUsd ?? 0)} / day`)
      : tile('Instant payouts', 'Off', 'every withdrawal is reviewed here'),
  ].join('');
}

async function loadList(): Promise<void> {
  $('adminHelp')!.textContent = HELP[status];
  const items = await getAdminWithdrawals(token, status);
  const list = $('adminList')!;
  if (!items.length) { list.innerHTML = '<p class="admin-empty">Nothing here.</p>'; return; }
  list.innerHTML = items.map((w) => `
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
        ${!w.instant && w.status === 'PENDING' ? `
          <button class="btn btn-grad" data-act="approve" type="button">Approve</button>
          <input class="ref-input" data-field="reason" placeholder="Reason to reject" maxlength="280" />
          <button class="btn admin-btn-danger" data-act="reject" type="button">Reject</button>` : ''}
        ${!w.instant && w.status === 'PROCESSING' ? `
          <input class="ref-input mono" data-field="tx" placeholder="Payout tx hash 0x…" />
          <button class="btn btn-grad" data-act="complete" type="button">Mark paid</button>
          <input class="ref-input" data-field="reason" placeholder="Reason to reject" maxlength="280" />
          <button class="btn admin-btn-danger" data-act="reject" type="button">Reject</button>` : ''}
      </div>
    </article>`).join('');
}

async function act(item: HTMLElement, action: string, button: HTMLButtonElement): Promise<void> {
  const id = item.dataset.id!;
  const field = (name: string) => item.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value.trim() ?? '';
  button.disabled = true;
  try {
    if (action === 'approve') await approveWithdrawal(token, id);
    if (action === 'reject') {
      const reason = field('reason');
      if (reason.length < 3) { showToast('Write a short reason first.', true); return; }
      await rejectWithdrawal(token, id, reason);
    }
    if (action === 'complete') {
      const tx = field('tx');
      if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) { showToast('Paste the full payout transaction hash.', true); return; }
      showToast('Checking the transfer on-chain...');
      await completeWithdrawal(token, id, tx);
    }
    showToast(action === 'approve' ? 'Approved. Now send the payout.' : action === 'reject' ? 'Rejected. Amount returned to member.' : 'Payout verified on-chain.');
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

document.addEventListener('DOMContentLoaded', () => {
  initDvLogos(); // animated DAOVAULT logo: preloader, header, footer
  $('adminSignIn')?.addEventListener('click', () => {
    signIn().catch((error) => showToast(error instanceof Error ? error.message : 'Sign-in failed.', true));
  });
  document.querySelectorAll<HTMLButtonElement>('.admin-tabs button').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach((t) => t.classList.toggle('is-active', t === tab));
    status = tab.dataset.status as Withdrawal['status'];
    loadList().catch((error) => showToast(error instanceof Error ? error.message : 'Could not load.', true));
  }));
  $('adminList')?.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const item = button?.closest<HTMLElement>('.admin-item');
    if (button && item) act(item, button.dataset.act!, button);
  });
});
