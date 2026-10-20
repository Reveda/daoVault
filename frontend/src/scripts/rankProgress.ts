/**
 * Dashboard "All Ranks" section (owner, 2026-10-09): every rank with its reward, the
 * Left Leg and Right Leg progress against the rank's DAO target (needed on EACH side,
 * plan.ts rankForLegs; binary placement, owner 2026-10-17) in DAO only (owner: no USD business
 * figures) and the status. Each card draws the legs as a small tree (owner, 2026-10-11): YOU on
 * top, arrows to the Left Leg and Right Leg rings; hover / tap a ring for its member count.
 * Read-only: the numbers come from GET /dashboard (legs + currentRank); rewards are only
 * ever paid by the backend engine.
 */
import type { DashboardData } from './api.ts';
import { RANK_TIERS } from './rewardVaults.ts';
import { getRankCrestSvg } from './rankCrests.ts';

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
type Filter = 'all' | 'achieved' | 'pending';
let filter: Filter = 'all';

const GIFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 3.8 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h.5v8a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8h.5a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-5-2a1 1 0 1 1 0 2h-2a2 2 0 0 1 2-2ZM9 5a2 2 0 0 1 2 2H9a1 1 0 1 1 0-2Zm-4 4h6v1H5V9Zm1.5 3H11v7H6.5v-7ZM13 19v-7h4.5v7H13Zm6-9h-6V9h6v1Z"/></svg>';
const TROPHY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a2 2 0 0 0-2 2v1a5 5 0 0 0 4.4 5A5 5 0 0 0 11 14.9V18H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-3.1a5 5 0 0 0 3.6-2.9A5 5 0 0 0 21 7V6a2 2 0 0 0-2-2ZM5 7V6h2v3.8A3 3 0 0 1 5 7Zm14 0a3 3 0 0 1-2 2.8V6h2Z"/></svg>';

const RING = 2 * Math.PI * 26; // progress ring circumference (r = 26)
const PEOPLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4.5V20h14v-2.5C16 14.7 12.3 13 9 13Zm8-2a3.5 3.5 0 1 0-1.4-6.7A5.9 5.9 0 0 1 16 7a6 6 0 0 1-1.3 3.7c.7.2 1.5.3 2.3.3Zm1 2.1A5.6 5.6 0 0 1 20 17.5V20h3v-2.5c0-2.3-2.4-3.9-5-4.4Z"/></svg>';
const YOU =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z"/></svg>';

/**
 * One side of the leg tree (owner, 2026-10-11): a progress ring with the side's DAO against the
 * rank target; hover / focus / tap shows how many members are on that side.
 */
function legNode(
  side: 'left' | 'right',
  label: string,
  rawHave: number,
  need: number,
  members: number | undefined,
  hint: string,
): string {
  // capped at the target (owner, 2026-10-15): a reached side reads 25 / 25, never 42 / 25
  const have = Math.min(rawHave, need);
  const pct = Math.min(1, need ? have / need : 0);
  const done = rawHave >= need;
  const people = members === undefined ? '—' : num(members);
  return `
    <button type="button" class="ri-node is-${side}${done ? ' is-done' : ''}" aria-label="${label}: ${num(have)} of ${num(need)} DAO, ${people} members">
      <span class="ri-ring">
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <circle class="ri-ring-track" cx="30" cy="30" r="26" />
          <circle class="ri-ring-bar" cx="30" cy="30" r="26" style="--off:${(RING * (1 - pct)).toFixed(2)}" />
        </svg>
        <b>${num(have)}</b>
      </span>
      <span class="ri-node-label mono">${label}</span>
      <span class="ri-node-vals mono">${num(have)} / ${num(need)} DAO</span>
      <span class="ri-tip" role="tooltip">
        <span class="ri-tip-label mono">${label}</span>
        <span class="ri-tip-count">${PEOPLE}<b>${people}</b></span>
        <span class="ri-tip-text">${members === 1 ? 'member' : 'members'}</span>
        <span class="ri-tip-hint mono">${hint}</span>
      </span>
    </button>`;
}

/**
 * `legs` = the member's Left / Right business (binary placement, owner 2026-10-17), Power Business
 * already inside it (server, shown as normal business)
 */
function legTree(
  legs: { left: number; right: number },
  need: number,
  leftMembers?: number,
  rightMembers?: number,
): string {
  return `
    <div class="ri-tree">
      <span class="ri-root" aria-hidden="true">${YOU}<em class="mono">YOU</em></span>
      <svg class="ri-links" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
        <path class="ri-link${legs.left >= need ? ' is-done' : ''}" d="M100 0 C100 26 50 18 50 44" />
        <path class="ri-link${legs.right >= need ? ' is-done' : ''}" d="M100 0 C100 26 150 18 150 44" />
      </svg>
      <div class="ri-legs">
        ${legNode('left', 'Left Leg', legs.left, need, leftMembers, 'Everyone placed on your Left side')}
        ${legNode('right', 'Right Leg', legs.right, need, rightMembers, 'Everyone placed on your Right side')}
      </div>
    </div>`;
}

export function renderRankProgress(data: DashboardData | null): void {
  const list = document.getElementById('rankList');
  const chip = document.getElementById('rankAchievedChip');
  const tabs = document.getElementById('rankFilter');
  if (!list) return;
  const left = data?.legs.left ?? 0;
  const right = data?.legs.right ?? 0;
  const current = data?.currentRank ?? 0;
  const achieved = Math.min(current, RANK_TIERS.length);

  // claim to collect (owner 2026-10-19): a reached rank's reward waits in its box until collected
  const collected = new Map((data?.rankRewards ?? []).map((r) => [r.rank, r.collected]));
  // Left / Right business from the server (Power Business already inside, shown as normal business)
  const shown = { left, right };
  list.innerHTML = RANK_TIERS.map((tier, i) => {
    const rank = i + 1;
    const state = rank <= current ? 'achieved' : rank === current + 1 ? 'current' : 'locked';
    const status =
      state === 'achieved' ? 'Achieved' : state === 'current' ? 'In progress' : 'Locked';
    const moreLeft = Math.max(0, tier.volume - shown.left);
    const moreRight = Math.max(0, tier.volume - shown.right);
    const foot =
      state === 'achieved'
        ? collected.get(rank) === false
          ? 'Rank reached &middot; reward ready to collect in its box'
          : collected.get(rank)
            ? 'Rank reached &middot; reward collected to your balance'
            : 'Rank reached'
        : moreLeft || moreRight
          ? `Still needed: <b>${num(moreLeft)}</b> Left Leg &middot; <b>${num(moreRight)}</b> Right Leg`
          : 'Both sides matched &middot; unlocks with your next activation';
    return `
      <li class="rank-item is-${state}" data-state="${state === 'achieved' ? 'achieved' : 'pending'}" style="--i:${i}">
        <div class="ri-head">
          <span class="ri-badge mono" title="Rank ${rank}">${getRankCrestSvg(i)}<em>${String(rank).padStart(2, '0')}</em></span>
          <div class="ri-title">
            <b>${tier.name}</b>
            <span class="ri-reward mono">${GIFT}<span class="ri-reward-label">Reward:</span> ${usd(tier.reward)}</span>
          </div>
          <span class="ri-status mono">${status}</span>
        </div>
        <p class="ri-target mono">Target: ${num(tier.volume)} DAO on each side</p>
        ${legTree(shown, tier.volume, data?.legs.leftMembers, data?.legs.rightMembers)}
        <p class="ri-foot mono">${foot}</p>
      </li>`;
  }).join('');

  if (chip) chip.innerHTML = `${TROPHY}<span>${achieved} / ${RANK_TIERS.length} Achieved</span>`;
  if (tabs) {
    const counts: Record<Filter, number> = {
      all: RANK_TIERS.length,
      achieved,
      pending: RANK_TIERS.length - achieved,
    };
    tabs.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
      const f = b.dataset.filter as Filter;
      const n = b.querySelector('em');
      if (n) n.textContent = String(counts[f]);
      b.onclick = () => {
        filter = f;
        applyFilter(list, tabs);
      };
    });
  }
  applyFilter(list, tabs);

  // tap a leg (phones have no hover): its member count opens; tap again / elsewhere closes it
  list.onclick = (e) => {
    const node = (e.target as HTMLElement).closest<HTMLElement>('.ri-node');
    list.querySelectorAll('.ri-node.is-tip').forEach((n) => {
      if (n !== node) n.classList.remove('is-tip');
    });
    node?.classList.toggle('is-tip');
  };
  if (!list.dataset.tipClose) {
    list.dataset.tipClose = '1';
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.ri-node'))
        list.querySelectorAll('.ri-node.is-tip').forEach((n) => n.classList.remove('is-tip'));
    });
  }

  // rings fill the first time the list scrolls into view
  if (!('IntersectionObserver' in window)) {
    list.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        list.classList.add('is-in');
        io.disconnect();
      }
    },
    { threshold: 0.1 },
  );
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
