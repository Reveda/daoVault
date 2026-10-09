/**
 * Dashboard "All Ranks" section (owner, 2026-10-09): every rank with its reward, the
 * Power Leg and Other Legs progress against the rank's DAO target (needed on EACH side,
 * plan.ts rankForLegs) in DAO only (owner: no USD business figures) and the status.
 * Read-only: the numbers come from GET /dashboard (legs + currentRank); rewards are only
 * ever paid by the backend engine.
 */
import type { DashboardData } from './api.ts';
import { RANK_TIERS } from './rewardVaults.ts';

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
type Filter = 'all' | 'achieved' | 'pending';
let filter: Filter = 'all';

const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h.5v8a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8h.5a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-5-2a1 1 0 1 1 0 2h-2a2 2 0 0 1 2-2ZM9 5a2 2 0 0 1 2 2H9a1 1 0 1 1 0-2Zm-4 4h6v1H5V9Zm1.5 3H11v7H6.5v-7ZM13 19v-7h4.5v7H13Zm6-9h-6V9h6v1Z"/></svg>';
const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2v1a5 5 0 0 0 4.4 5A5 5 0 0 0 11 14.9V18H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-3.1a5 5 0 0 0 3.6-2.9A5 5 0 0 0 21 7V6a2 2 0 0 0-2-2ZM5 7V6h2v3.8A3 3 0 0 1 5 7Zm14 0a3 3 0 0 1-2 2.8V6h2Z"/></svg>';

function side(label: string, have: number, need: number): string {
  const pct = Math.min(100, (have / need) * 100);
  const done = have >= need;
  return `
    <div class="ri-side${done ? ' is-done' : ''}">
      <span class="ri-side-label mono">${label}</span>
      <div class="ri-track"><i style="--w:${pct.toFixed(1)}%"></i></div>
      <div class="ri-vals"><b>${num(have)}</b><span class="mono">/ ${num(need)} DAO</span></div>
    </div>`;
}

export function renderRankProgress(data: DashboardData | null): void {
  const list = document.getElementById('rankList');
  const chip = document.getElementById('rankAchievedChip');
  const tabs = document.getElementById('rankFilter');
  if (!list) return;
  const power = data?.legs.power ?? 0;
  const other = data?.legs.other ?? 0;
  const current = data?.currentRank ?? 0;
  const achieved = Math.min(current, RANK_TIERS.length);

  list.innerHTML = RANK_TIERS.map((tier, i) => {
    const rank = i + 1;
    const state = rank <= current ? 'achieved' : rank === current + 1 ? 'current' : 'locked';
    const status = state === 'achieved' ? 'Achieved' : state === 'current' ? 'In progress' : 'Locked';
    const morePower = Math.max(0, tier.volume - power);
    const moreOther = Math.max(0, tier.volume - other);
    const foot = state === 'achieved'
      ? 'Rank reached &middot; reward credited to your balance'
      : morePower || moreOther
        ? `Still needed: <b>${num(morePower)}</b> Strong Leg &middot; <b>${num(moreOther)}</b> Other Leg`
        : 'Both sides matched &middot; unlocks with your next activation';
    return `
      <li class="rank-item is-${state}" data-state="${state === 'achieved' ? 'achieved' : 'pending'}" style="--i:${i}">
        <div class="ri-head">
          <span class="ri-badge mono">${String(rank).padStart(2, '0')}</span>
          <div class="ri-title">
            <b>${tier.name}</b>
            <span class="ri-reward mono">${GIFT}<span class="ri-reward-label">Reward:</span> ${usd(tier.reward)}</span>
          </div>
          <span class="ri-status mono">${status}</span>
        </div>
        <p class="ri-target mono">Target: ${num(tier.volume)} DAO on each side</p>
        <div class="ri-sides">
          ${side('Strong Leg', power, tier.volume)}
          ${side('Other Leg', other, tier.volume)}
        </div>
        <p class="ri-foot mono">${foot}</p>
      </li>`;
  }).join('');

  if (chip) chip.innerHTML = `${TROPHY}<span>${achieved} / ${RANK_TIERS.length} Achieved</span>`;
  if (tabs) {
    const counts: Record<Filter, number> = { all: RANK_TIERS.length, achieved, pending: RANK_TIERS.length - achieved };
    tabs.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
      const f = b.dataset.filter as Filter;
      const n = b.querySelector('em');
      if (n) n.textContent = String(counts[f]);
      b.onclick = () => { filter = f; applyFilter(list, tabs); };
    });
  }
  applyFilter(list, tabs);

  // bars fill the first time the list scrolls into view
  if (!('IntersectionObserver' in window)) { list.classList.add('is-in'); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { list.classList.add('is-in'); io.disconnect(); }
  }, { threshold: 0.1 });
  io.observe(list);
}

function applyFilter(list: HTMLElement, tabs: HTMLElement | null): void {
  list.querySelectorAll<HTMLElement>('.rank-item').forEach((li) => {
    li.hidden = filter !== 'all' && li.dataset.state !== filter;
  });
  tabs?.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
    const on = b.dataset.filter === filter;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const empty = list.parentElement?.querySelector<HTMLElement>('.rank-list-empty');
  if (empty) empty.hidden = list.querySelector('.rank-item:not([hidden])') !== null;
}
