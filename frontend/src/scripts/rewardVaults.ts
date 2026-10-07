/**
 * DAOvault AI — Dashboard rank reward vaults + wallet menu
 *
 * One sealed DAOvault box per rank (11 tiers from project.md). Ranks the member
 * has reached are "ready" and open with the full gift-box sequence; the rest are
 * sealed and only rattle (with a preview). Which boxes were opened is remembered
 * per wallet in this browser only: it is a presentation state, never a payout.
 */

import { openGiftBox } from './giftBox.ts';
import { showToast } from './core.ts';

export const RANK_TIERS = [
  { name: 'Starter', volume: 25, reward: 100 },
  { name: 'Builder', volume: 50, reward: 250 },
  { name: 'Leader', volume: 100, reward: 500 },
  { name: 'Elite Leader', volume: 200, reward: 1000 },
  { name: 'Executive', volume: 350, reward: 2500 },
  { name: 'Crown Executive', volume: 1000, reward: 5000 },
  { name: 'Crown Director', volume: 3000, reward: 10000 },
  { name: 'Ambassador', volume: 7000, reward: 20000 },
  { name: 'Crown Ambassador', volume: 12000, reward: 30000 },
  { name: 'President', volume: 20000, reward: 50000 },
  { name: 'Crown President', volume: 50000, reward: 100000 },
];

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const openedKey = (wallet: string, rank: number) => `daovault_box_opened_${wallet.toLowerCase()}_${rank}`;

function isOpened(wallet: string, rank: number): boolean {
  try { return localStorage.getItem(openedKey(wallet, rank)) === '1'; } catch { return false; }
}
function markOpened(wallet: string, rank: number): void {
  try { localStorage.setItem(openedKey(wallet, rank), '1'); } catch { /* storage blocked */ }
}

/** Draws the 11 boxes. `currentRank` is the rank number from the backend (0 = unranked). */
export function renderRewardVaults(wallet: string, currentRank: number): void {
  const grid = document.getElementById('rewardBoxes');
  if (!grid) return;

  const draw = () => {
    grid.innerHTML = '';
    let opened = 0;
    RANK_TIERS.forEach((tier, i) => {
      const rank = i + 1;
      const reached = currentRank >= rank;
      const wasOpened = reached && isOpened(wallet, rank);
      if (wasOpened) opened++;
      const state = wasOpened ? 'opened' : reached ? 'ready' : 'locked';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `reward-box is-${state}`;
      btn.style.setProperty('--i', String(i));
      btn.setAttribute('aria-label', `${tier.name} box: ${state === 'locked' ? 'sealed' : state === 'ready' ? 'ready to open' : `opened, ${money(tier.reward)}`}`);
      btn.innerHTML = `
        <span class="rb-art" aria-hidden="true">
          <span class="rb-lid"></span><span class="rb-body"><img src="/favicon.png" alt="" /></span>
          ${state === 'locked' ? '<span class="rb-lock"></span>' : ''}
        </span>
        <span class="rb-rank mono">RANK ${String(rank).padStart(2, '0')}</span>
        <span class="rb-name">${tier.name}</span>
        <span class="rb-reward">${state === 'opened' ? money(tier.reward) : '???'}</span>
        <span class="rb-state mono">${state === 'locked' ? `${tier.volume.toLocaleString()} DAO volume` : state === 'ready' ? 'Ready to open' : 'Opened'}</span>`;
      btn.addEventListener('click', () => openGiftBox({
        rank: tier.name,
        reward: tier.reward,
        requirement: `${tier.volume.toLocaleString()} DAO team volume (${tier.name} rank)`,
        mode: state,
        onOpened: () => {
          markOpened(wallet, rank);
          draw();
        },
      }));
      grid.appendChild(btn);
    });

    const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const reachedTier = RANK_TIERS[currentRank - 1];
    const next = RANK_TIERS[currentRank];
    set('rankNow', reachedTier ? reachedTier.name : 'Unranked');
    set('rankBoxesOpen', `${opened} / ${RANK_TIERS.length} opened`);
    set('rankNext', next ? `Next: ${next.name} at ${next.volume.toLocaleString()} DAO team volume` : 'Top rank reached: Crown President');
    const bar = document.getElementById('rankBar');
    if (bar) window.setTimeout(() => { bar.style.width = `${(Math.min(currentRank, RANK_TIERS.length) / RANK_TIERS.length) * 100}%`; }, 400);
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
  if (scan) scan.href = `https://bscscan.com/address/${wallet}`;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('is-open', open);
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(panel.hidden); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
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
