/**
 * Dashboard notification bell (owner, 2026-10-19). The bell shows the 5 newest notifications (level
 * income, rewards ready to collect, DV tokens, withdrawals) and "View all" opens the full history (All /
 * Unread, 20 at a time, Mark all as read, Clear read). Each one can be removed with ×; read ones are
 * also removed by the server after 30 days, any after 90. New ones arrive live over socket.io: the
 * socket signs in with the member's session token and only hears its own wallet. A new one shows a
 * toast, bumps the count and tells the dashboard (event "dv:notification") so balances refresh.
 * Tapping one marks it read and scrolls to the part of the dashboard it is about.
 */
import { io, type Socket } from 'socket.io-client';
import {
  getNotifications,
  markNotificationsRead,
  removeNotifications,
  socketEndpoint,
  type AppNotification,
} from './api.ts';
import { signIn } from './session.ts';
import { showToast } from './core.ts';

const PANEL_SIZE = 5;
const PAGE_SIZE = 20;

const SVG = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICON: Record<string, string> = {
  LEVEL_INCOME: SVG('<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
  RANK_REWARD: SVG('<path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
  BONUS: SVG('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
  DV_TOKENS: SVG('<circle cx="12" cy="12" r="9"/><path d="M9 8h4a3 3 0 0 1 0 6H9z"/><path d="M9 8v8"/>'),
  WITHDRAWAL_PAID: SVG('<path d="M5 12.5 10 17 19 7.5"/>'),
  WITHDRAWAL_RETURNED: SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
};
const CLOSE = SVG('<path d="M6 6l12 12M18 6 6 18"/>');
/** where a notification's link goes on the dashboard */
const TARGET: Record<string, string> = {
  income: 'incomeCard',
  rewards: 'rewardsSection',
  bonus: 'fastStartCard',
  dv: 'dvTokenCard',
  withdraw: 'withdrawSection',
};
const targetOf = (link: string | null) =>
  link ? (link.startsWith('rank:') ? 'rewardsSection' : (TARGET[link] ?? null)) : null;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const itemHtml = (n: AppNotification) => `
  <li class="notif-item${n.read ? '' : ' is-unread'}" data-id="${esc(n.id)}" data-link="${esc(n.link ?? '')}" tabindex="0" role="button">
    <span class="notif-ico notif-ico--${esc(n.kind.toLowerCase())}" aria-hidden="true">${ICON[n.kind] ?? ICON.RANK_REWARD}</span>
    <span class="notif-text">
      <b>${n.read ? '' : '<i class="notif-dot" aria-hidden="true"></i>'}${esc(n.title)}</b>
      <span>${esc(n.body)}</span>
      <time class="mono">${timeAgo(n.createdAt)}</time>
    </span>
    <button type="button" class="notif-x" data-remove="${esc(n.id)}" aria-label="Remove this notification">${CLOSE}</button>
  </li>`;

/** "Today" / "Yesterday" / "Earlier" headings for the full history */
function dayGroup(iso: string): string {
  const d = new Date(iso).getTime();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d >= start) return 'Today';
  if (d >= start - 86_400_000) return 'Yesterday';
  return 'Earlier';
}
const groupedHtml = (items: AppNotification[]) => {
  let last = '';
  return items
    .map((n) => {
      const g = dayGroup(n.createdAt);
      const head = g !== last ? `<li class="notif-group mono" aria-hidden="true">${g}</li>` : '';
      last = g;
      return head + itemHtml(n);
    })
    .join('');
};

export function initNotifications(account: string): void {
  const menu = document.getElementById('notifMenu');
  const btn = document.getElementById('notifBtn');
  const count = document.getElementById('notifCount');
  const panel = document.getElementById('notifPanel');
  const list = document.getElementById('notifList');
  const readAll = document.getElementById('notifReadAll') as HTMLButtonElement | null;
  if (!menu || !btn || !count || !panel || !list) return;
  menu.hidden = false;

  let latest: AppNotification[] = [];
  let unread = 0;
  let total = 0;
  const token = () => signIn(account);

  // ── the bell: count + the 5 newest ──
  const viewAll = document.createElement('button');
  viewAll.type = 'button';
  viewAll.className = 'notif-viewall';
  panel.appendChild(viewAll);

  const renderBell = () => {
    count.hidden = unread <= 0;
    count.textContent = unread > 99 ? '99+' : String(unread);
    btn.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    if (readAll) readAll.disabled = unread <= 0;
    list.innerHTML = latest.length
      ? latest.slice(0, PANEL_SIZE).map(itemHtml).join('')
      : '<li class="notif-empty">You are all caught up. New income and rewards will appear here.</li>';
    viewAll.hidden = total === 0;
    viewAll.textContent = total > PANEL_SIZE ? `View all notifications (${total})` : 'View all notifications';
  };

  const loadBell = async () => {
    const data = await getNotifications(await token(), { limit: PANEL_SIZE });
    latest = data.items;
    unread = data.unread;
    total = data.total;
    renderBell();
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) void loadBell().catch(() => undefined);
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

  // ── shared actions (bell and "View all") ──
  const markOneRead = async (id: string) => {
    const r = await markNotificationsRead(await token(), id).catch(() => null);
    if (r) unread = r.unread;
  };
  const remove = async (id: string) => {
    const r = await removeNotifications(await token(), id).catch(() => null);
    if (r) unread = r.unread;
    latest = latest.filter((x) => x.id !== id);
    total = Math.max(0, total - 1);
  };
  const goTo = (link: string | null) => {
    const target = targetOf(link);
    const el = target ? document.getElementById(target) : null;
    if (el && !el.hidden) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('jump-flash');
      void el.offsetWidth;
      el.classList.add('jump-flash');
    }
  };
  /** handles a tap inside any list: × removes, the row opens */
  const onListClick = async (e: Event, after: () => void) => {
    const x = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (x) {
      e.stopPropagation();
      await remove(x.dataset.remove!);
      after();
      // refill the bell to 5 from the server (older ones move up)
      await loadBell().catch(() => renderBell());
      return;
    }
    const li = (e.target as HTMLElement).closest<HTMLElement>('.notif-item');
    if (!li) return;
    const id = li.dataset.id ?? '';
    const n = latest.find((x) => x.id === id) ?? fullItems.find((x) => x.id === id);
    if (n && !n.read) {
      n.read = true;
      unread = Math.max(0, unread - 1);
      void markOneRead(id).then(renderBell);
    }
    setOpen(false);
    closeAll();
    goTo(li.dataset.link || null);
  };
  list.addEventListener('click', (e) => void onListClick(e, () => undefined));
  list.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).classList.contains('notif-item')) {
      e.preventDefault();
      void onListClick(e, () => undefined);
    }
  });
  readAll?.addEventListener('click', async () => {
    latest.forEach((n) => (n.read = true));
    fullItems.forEach((n) => (n.read = true));
    unread = 0;
    renderBell();
    renderAll();
    await markNotificationsRead(await token()).catch(() => undefined);
  });

  // ── "View all": the full history ──
  let fullItems: AppNotification[] = [];
  let fullPage = 0;
  let fullTotal = 0;
  let filter: 'all' | 'unread' = 'all';
  const overlay = document.createElement('div');
  overlay.className = 'notif-all';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'All notifications');
  overlay.innerHTML = `
    <div class="notif-all-card">
      <header class="notif-all-head">
        <div><b>All notifications</b><span class="mono" data-all-count></span></div>
        <button type="button" class="notif-all-close" data-all-close aria-label="Close">${CLOSE}</button>
      </header>
      <div class="notif-all-bar">
        <div class="notif-tabs" role="tablist">
          <button type="button" role="tab" class="is-on" data-filter="all">All</button>
          <button type="button" role="tab" data-filter="unread">Unread</button>
        </div>
        <div class="notif-all-actions">
          <button type="button" class="mono" data-all-read>Mark all as read</button>
          <button type="button" class="mono" data-all-clear>Clear read</button>
        </div>
      </div>
      <ul class="notif-list notif-all-list" data-all-list></ul>
      <button type="button" class="notif-more" data-all-more hidden>Load more</button>
    </div>`;
  document.body.appendChild(overlay);
  const allList = overlay.querySelector<HTMLElement>('[data-all-list]')!;
  const allCount = overlay.querySelector<HTMLElement>('[data-all-count]')!;
  const moreBtn = overlay.querySelector<HTMLButtonElement>('[data-all-more]')!;

  const renderAll = () => {
    allCount.textContent = `${fullTotal} ${filter === 'unread' ? 'unread' : 'total'}`;
    allList.innerHTML = fullItems.length
      ? groupedHtml(fullItems)
      : `<li class="notif-empty">${filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</li>`;
    moreBtn.hidden = fullItems.length >= fullTotal;
    overlay.querySelectorAll<HTMLElement>('[data-filter]').forEach((t) => {
      const on = t.dataset.filter === filter;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
    });
  };
  const loadAll = async (reset: boolean) => {
    if (reset) {
      fullItems = [];
      fullPage = 0;
    }
    const data = await getNotifications(await token(), { page: fullPage + 1, limit: PAGE_SIZE, filter });
    fullPage = data.page;
    fullTotal = data.total;
    unread = data.unread;
    const seen = new Set(fullItems.map((x) => x.id));
    fullItems = [...fullItems, ...data.items.filter((x) => !seen.has(x.id))];
    renderAll();
    renderBell();
  };
  const openAll = () => {
    setOpen(false);
    overlay.hidden = false;
    document.body.classList.add('notif-all-open');
    void loadAll(true).catch(() => undefined);
  };
  const closeAll = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('notif-all-open');
    void loadBell().catch(() => undefined);
  };
  viewAll.addEventListener('click', openAll);
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.closest('[data-all-close]')) return closeAll();
    const tab = t.closest<HTMLElement>('[data-filter]');
    if (tab) {
      filter = tab.dataset.filter === 'unread' ? 'unread' : 'all';
      void loadAll(true).catch(() => undefined);
      return;
    }
    if (t.closest('[data-all-more]')) return void loadAll(false).catch(() => undefined);
    if (t.closest('[data-all-read]')) return readAll?.click();
    if (t.closest('[data-all-clear]')) {
      void token()
        .then((tk) => removeNotifications(tk))
        .then((r) => {
          unread = r.unread;
          return loadAll(true);
        })
        .catch(() => undefined);
      return;
    }
    if (t.closest('.notif-item'))
      void onListClick(e, () => {
        fullItems = fullItems.filter((x) => document.querySelector(`[data-id="${CSS.escape(x.id)}"]`));
        fullTotal = Math.max(0, fullTotal - 1);
        renderAll();
      });
  });
  // the × inside "View all" must also drop the row from its own list
  allList.addEventListener(
    'click',
    (e) => {
      const x = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
      if (!x) return;
      fullItems = fullItems.filter((n) => n.id !== x.dataset.remove);
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  void loadBell().catch(() => {
    /* the bell stays usable; it loads again when opened */
  });

  // ── live: socket.io with the member's session token (a fresh one on every reconnect) ──
  const endpoint = socketEndpoint();
  const socket: Socket = io(endpoint.origin, {
    path: endpoint.path,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    auth: (cb) => {
      token().then(
        (t) => cb({ token: t }),
        () => cb({}),
      );
    },
    reconnectionDelayMax: 15_000,
  });
  socket.on('notification', (n: AppNotification) => {
    if (latest.some((x) => x.id === n.id)) return;
    latest = [n, ...latest].slice(0, PANEL_SIZE);
    unread += 1;
    total += 1;
    renderBell();
    if (!overlay.hidden && filter === 'all') {
      fullItems = [n, ...fullItems];
      fullTotal += 1;
      renderAll();
    }
    btn.classList.remove('is-ringing');
    void btn.offsetWidth;
    btn.classList.add('is-ringing');
    showToast(`${n.title}. ${n.body}`);
    document.dispatchEvent(new CustomEvent('dv:notification', { detail: n }));
  });
  // back online after a gap: catch up on what arrived meanwhile
  socket.io.on('reconnect', () => void loadBell().catch(() => undefined));
}
