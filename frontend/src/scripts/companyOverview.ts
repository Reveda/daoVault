/**
 * Company overview (owner, 2026-10-10): the admin = company wallet sees the whole business in
 * one summary, the same on the admin panel and on the company's own dashboard. Each card
 * carries a raised icon badge in its own colour. Data from GET /admin/stats (admin only).
 */
import type { AdminStats } from './api.ts';

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n: number) => n.toLocaleString('en-US');

const ICONS = {
  users: '<path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7" r="3.5"/><path d="M21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8"/>',
  deposit: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
  payout: '<path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
};
type Icon = keyof typeof ICONS;
type Tone = 'gold' | 'amber' | 'violet' | 'green' | 'red';

function tile(icon: Icon, tone: Tone, label: string, value: string, note = ''): string {
  return `<div class="glass metric-card co-tile is-${tone}">
    <span class="co-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg></span>
    <div class="metric-top"><span class="metric-label mono">${label}</span></div>
    <div class="metric-val">${value}</div>
    <div class="metric-footer mono">${note}</div>
  </div>`;
}

export function renderCompanyOverview(target: HTMLElement, s: AdminStats): void {
  const pending = s.withdrawals.PENDING;
  const approved = s.withdrawals.PROCESSING;
  const toPay = (pending?.netUsd ?? 0) + (approved?.netUsd ?? 0);
  const treasury = s.volumeUsd - s.paidOutUsd;
  const payout = s.payout
    ? tile('bolt', 'amber', 'Instant payout float', s.payout.error ? 'Unreadable' : usd(s.payout.floatUsd ?? 0),
      s.payout.error ?? `${s.payout.paused ? 'PAUSED · ' : ''}max ${usd(s.payout.maxPerClaimUsd ?? 0)} each · ${usd(s.payout.dailyLimitUsd ?? 0)} / day`)
    : tile('bolt', 'amber', 'Instant payouts', 'Off', 'every withdrawal is reviewed in the admin panel');
  target.innerHTML = [
    tile('users', 'violet', 'Members', int(s.members), `${int(s.registered)} wallets registered · ${int(s.payments24h)} payments in 24h · ${int(s.payments7d)} in 7 days`),
    tile('deposit', 'gold', 'Deposits (money in)', usd(s.volumeUsd), `${int(s.packages)} packages × $300 · ${int(s.topUps)} top-ups`),
    tile('coins', 'amber', 'Credited to members', usd(s.creditedUsd), `Level ${usd(s.levelCommissionsUsd)} · Rank ${usd(s.rankRewardsUsd)}`),
    tile('payout', 'green', 'Paid out', usd(s.paidOutUsd), `fees kept ${usd(s.feesUsd)} (5%)`),
    tile('wallet', 'gold', 'Treasury balance', usd(treasury), 'deposits − payouts so far'),
    tile('clock', toPay > 0 ? 'red' : 'violet', 'To pay now', usd(toPay), `${pending?.count ?? 0} pending · ${approved?.count ?? 0} approved`),
    tile('coins', 'violet', 'Members can still withdraw', usd(s.memberBalancesUsd), 'credited minus requested withdrawals'),
    tile('trend', 'green', 'Company net', usd(s.companyNetUsd), 'deposits − all credits + fees'),
    tile('box', 'gold', 'Packages', `${int(s.activePackages)} active`, `${int(s.cappedPackages)} reached the 25× cap`),
    payout,
  ].join('');
}
