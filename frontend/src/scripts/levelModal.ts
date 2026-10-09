/**
 * Dashboard level modal (owner, 2026-10-09): tap a row of the 20-Level Downline and a modal
 * lists everyone who joined at that level - DV code, short wallet, who sponsored them and
 * when they activated - 50 at a time with "Load more". Phones get a bottom sheet.
 * Closes with the X, a tap outside the card or Escape; focus returns to the row.
 */
import { getLevelMembers, type LevelMembers } from './api.ts';
import { signIn } from './session.ts';

let overlay: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function memberRows(members: LevelMembers['members'], startIndex: number): string {
  return members.map((m, i) => `
    <li class="lv-member" style="--i:${Math.min(startIndex + i, 12)}">
      <span class="lv-avatar mono">${esc(m.referralCode.slice(2, 4))}</span>
      <span class="lv-who">
        <b class="mono">${esc(m.referralCode)}</b>
        <small class="mono">${esc(m.wallet)}</small>
      </span>
      <span class="lv-meta">
        <small>Sponsor <b class="mono">${esc(m.sponsorCode ?? '—')}</b></small>
        <small>${date(m.joinedAt)}</small>
      </span>
    </li>`).join('');
}

function close(): void {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.documentElement.classList.remove('lv-lock');
  document.removeEventListener('keydown', onKey);
  const el = overlay;
  overlay = null;
  window.setTimeout(() => el.remove(), 320);
  lastFocus?.focus({ preventScroll: true });
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

export function openLevelModal(wallet: string, level: number, pct: number, usd: number): void {
  close();
  lastFocus = document.activeElement as HTMLElement | null;
  overlay = document.createElement('div');
  overlay.className = 'lv-overlay';
  overlay.innerHTML = `
    <div class="lv-card" role="dialog" aria-modal="true" aria-labelledby="lvTitle">
      <header class="lv-head">
        <div>
          <span class="lv-kicker mono">Your downline</span>
          <h3 id="lvTitle">Level ${level} <span class="grad-text">members</span></h3>
          <p class="lv-sub mono">${pct}% · $${usd} per member</p>
        </div>
        <span class="lv-count mono" id="lvCount">…</span>
        <button type="button" class="lv-close" aria-label="Close">&times;</button>
      </header>
      <div class="lv-body">
        <ul class="lv-list" id="lvList">${'<li class="lv-skel"></li>'.repeat(4)}</ul>
        <button type="button" class="btn btn-line lv-more" id="lvMore" hidden>Load more</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // the page behind must not scroll while a (possibly long) list scrolls inside the modal
  document.documentElement.classList.add('lv-lock');
  requestAnimationFrame(() => overlay?.classList.add('is-open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.lv-close')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  overlay.querySelector<HTMLButtonElement>('.lv-close')?.focus({ preventScroll: true });

  const list = overlay.querySelector<HTMLElement>('#lvList')!;
  const count = overlay.querySelector<HTMLElement>('#lvCount')!;
  const more = overlay.querySelector<HTMLButtonElement>('#lvMore')!;
  let page = 1;
  let shown = 0;
  const mine = overlay;

  const load = async () => {
    more.disabled = true;
    try {
      const data = await getLevelMembers(wallet, level, page, await signIn(wallet));
      if (overlay !== mine) return; // closed meanwhile
      if (page === 1) list.innerHTML = '';
      count.textContent = `${data.total.toLocaleString()} ${data.total === 1 ? 'member' : 'members'}`;
      if (!data.total) {
        list.innerHTML = `<li class="lv-empty"><b>No one has joined at Level ${level} yet.</b><small>Share your referral link: everyone your team brings in shows up here, level by level.</small></li>`;
      } else {
        list.insertAdjacentHTML('beforeend', memberRows(data.members, shown));
        shown += data.members.length;
      }
      more.hidden = shown >= data.total;
      page += 1;
    } catch {
      if (overlay !== mine) return;
      if (page === 1) list.innerHTML = '<li class="lv-empty"><b>Could not load this level.</b><small>Check your connection and try again.</small></li>';
      count.textContent = '—';
    } finally {
      more.disabled = false;
    }
  };
  more.addEventListener('click', () => void load());
  void load();
}
