/**
 * DAOvault AI — Dashboard rank reward vaults + wallet menu
 *
 * One sealed DAOvault box per rank (11 tiers from project.md). Claim to collect (owner
 * 2026-10-19): a reached rank's reward waits in its box and reaches the balance only when the
 * member opens it (server, once); collected boxes never open again.
 */

import { openGiftBox } from './giftBox.ts';
import { getRankCrestSvg } from './rankCrests.ts';
import { BSC_CHAIN_ID, showToast } from './core.ts';

export const RANK_TIERS = [
  { name: 'Starter', volume: 25, reward: 150 },
  { name: 'Builder', volume: 50, reward: 300 },
  { name: 'Leader', volume: 100, reward: 500 },
  { name: 'Elite Leader', volume: 200, reward: 1200 },
  { name: 'Executive', volume: 375, reward: 2500 },
  { name: 'Crown Executive', volume: 1000, reward: 7500 },
  { name: 'Crown Director', volume: 3000, reward: 15000 },
  { name: 'Ambassador', volume: 7000, reward: 30000 },
  { name: 'Crown Ambassador', volume: 12000, reward: 50000 },
  { name: 'President', volume: 20000, reward: 75000 },
  { name: 'Crown President', volume: 50000, reward: 200000 },
];

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/** a sealed rank box offers 'Preview the opening' only on the dev server and review builds (Render:
 *  VITE_REWARD_PREVIEW=true); production keeps sealed boxes sealed (owner 2026-10-18) */
const REWARD_PREVIEW = import.meta.env.DEV || import.meta.env.VITE_REWARD_PREVIEW === 'true';
const openedKey = (wallet: string, rank: number) =>
  `daovault_box_opened_${wallet.toLowerCase()}_${rank}`;

function markOpened(wallet: string, rank: number): void {
  try {
    localStorage.setItem(openedKey(wallet, rank), '1');
  } catch {
    /* storage blocked */
  }
}

/**
 * Draws the 11 boxes (owner 2026-10-19: claim to collect). A reached rank whose reward is still waiting is
 * "ready": opening it collects the reward into the balance (server, once). Collected = "Already collected"
 * with the amount, and it never opens again. Ranks not reached are sealed (preview only off production).
 */
export type RankReward = { rank: number; name: string; amountUsd: number; collected: boolean };
export function renderRewardVaults(
  wallet: string,
  currentRank: number,
  rewards: RankReward[],
  collect: (rank: number) => Promise<{ collectedUsd: number; alreadyCollected: boolean }>,
  onCollected?: () => void,
): void {
  const grid = document.getElementById('rewardBoxes');
  if (!grid) return;
  const list = rewards.map((r) => ({ ...r }));

  const draw = () => {
    grid.innerHTML = '';
    let done = 0;
    RANK_TIERS.forEach((tier, i) => {
      const rank = i + 1;
      const reached = currentRank >= rank;
      const info = list.find((r) => r.rank === rank);
      const state: 'locked' | 'ready' | 'opened' = !reached
        ? 'locked'
        : info && !info.collected
          ? 'ready'
          : 'opened';
      if (state === 'opened') done++;
      const amount = info ? info.amountUsd : tier.reward;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `reward-box is-${state}`;
      btn.style.setProperty('--i', String(i));
      btn.setAttribute(
        'aria-label',
        `${tier.name} box: ${state === 'locked' ? 'sealed' : state === 'ready' ? `${money(amount)} ready to collect` : info ? `already collected, ${money(amount)}` : 'rank reached'}`,
      );
      btn.innerHTML = `
        <span class="rb-art" aria-hidden="true">
          <span class="rb-lid"></span><span class="rb-body"><img src="/favicon.png" alt="" /></span>
          ${state === 'locked' ? '<span class="rb-lock"></span>' : ''}
        </span>
        <span class="rb-rank mono"><span class="rb-crest" aria-hidden="true">${getRankCrestSvg(i)}</span>RANK ${String(rank).padStart(2, '0')}</span>
        <span class="rb-name">${tier.name}</span>
        <span class="rb-reward">${state === 'opened' ? (info ? money(amount) : '—') : '???'}</span>
        <span class="rb-state mono">${state === 'locked' ? `${tier.volume.toLocaleString()} DAO matching` : state === 'ready' ? 'Ready to collect' : info ? 'Already collected' : 'Rank reached'}</span>`;
      // a collected box never opens again (owner 2026-10-19)
      if (state === 'opened') {
        btn.disabled = true;
        btn.title = `${tier.name} reward box: ${info ? 'already collected' : 'rank reached'}`;
      } else
        btn.addEventListener('click', () =>
          openGiftBox({
            rank: tier.name,
            reward: amount,
            requirement: `${tier.volume.toLocaleString()} DAO matching on each side (${tier.name} rank)`,
            mode: state,
            allowPreview: REWARD_PREVIEW,
            openLabel: 'Open & collect',
            note: 'Added to your balance. You can withdraw it any time.',
            doneLabel: 'Done',
            onOpened: () => {
              // the reward reaches the balance only now, on the server, once
              collect(rank).then(
                (result) => {
                  if (info) info.collected = true;
                  markOpened(wallet, rank);
                  if (!result.alreadyCollected)
                    showToast(`${money(result.collectedUsd)} ${tier.name} reward added to your balance.`);
                  draw();
                  onCollected?.();
                },
                () =>
                  showToast(
                    'We could not collect this reward right now. It is safe in its box: please try again in a minute.',
                    true,
                  ),
              );
            },
          }),
        );
      grid.appendChild(btn);
    });
    // finished entrance animations are dropped (they kept a GPU layer per box on phones)
    grid.classList.remove('is-settled');
    window.setTimeout(() => grid.classList.add('is-settled'), 1400);

    const set = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const reachedTier = RANK_TIERS[currentRank - 1];
    const next = RANK_TIERS[currentRank];
    set('rankNow', reachedTier ? reachedTier.name : 'Unranked');
    set('rankBoxesOpen', `${done} / ${RANK_TIERS.length} collected`);
    const waiting = list.filter((r) => !r.collected).reduce((sum, r) => sum + r.amountUsd, 0);
    const chip = document.getElementById('rewardsWaiting');
    if (chip) {
      chip.hidden = waiting <= 0;
      chip.textContent = `Ready to collect: ${money(waiting)}`;
    }
    set(
      'rankNext',
      next
        ? `Next: ${next.name} at ${next.volume.toLocaleString()} DAO matching (each side)`
        : 'Top rank reached: Crown President',
    );
    const bar = document.getElementById('rankBar');
    if (bar)
      window.setTimeout(() => {
        bar.style.width = `${(Math.min(currentRank, RANK_TIERS.length) / RANK_TIERS.length) * 100}%`;
      }, 400);
  };
  draw();
}

/** Wallet chip dropdown: copy address, view on BscScan, log out (handled by dashboard.ts). */
export function initWalletMenu(wallet: string): void {
  const wrap = document.getElementById('walletMenu');
  const btn = document.getElementById('walletMenuBtn');
  const panel = wrap?.querySelector<HTMLElement>('.wallet-menu-panel');
  if (!wrap || !btn || !panel) return;
  const scan = document.getElementById('walletScanLink') as HTMLAnchorElement | null;
  if (scan)
    scan.href = `https://${BSC_CHAIN_ID === 97 ? 'testnet.' : ''}bscscan.com/address/${wallet}`;

  const jumps = Array.from(panel.querySelectorAll<HTMLAnchorElement>('[data-jump]'));
  const targetOf = (a: HTMLAnchorElement) => document.getElementById(a.hash.slice(1));
  const setOpen = (open: boolean) => {
    // a shortcut shows only when its section is on this member's dashboard
    if (open)
      jumps.forEach((a) => {
        const t = targetOf(a);
        a.hidden = !t || t.closest('[hidden]') !== null;
      });
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('is-open', open);
  };
  // section shortcuts (owner, 2026-10-11): smooth scroll under the header, then a short gold flash
  jumps.forEach((a) =>
    a.addEventListener('click', (e) => {
      const target = targetOf(a);
      if (!target) return;
      e.preventDefault();
      setOpen(false);
      target.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      target.classList.remove('jump-flash');
      window.setTimeout(() => {
        target.classList.add('jump-flash');
        window.setTimeout(() => target.classList.remove('jump-flash'), 1400);
      }, 450);
    }),
  );
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  document.getElementById('walletCopyBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      showToast('Wallet address copied.');
    } catch {
      showToast('Could not copy automatically.', true);
    }
    setOpen(false);
  });
}
