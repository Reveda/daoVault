/**
 * Landing "Live on-chain pulse" card (owner, 2026-10-12: it took the place of the 25x Cap signal card).
 * Only REAL data, never invented events (the earlier version cycled made-up wallets and amounts):
 *   - the latest activations, top-ups, rank rewards and paid withdrawals from GET /activity/recent;
 *   - the current BSC block number, read from the chain every few seconds (always live).
 * Before the first real event it shows labelled SAMPLE events ("Sample preview", owner 2026-10-12).
 * Refreshes while the card is on screen; one event shows at a time and slides to the next every 4.5 s.
 */
import { BSC_CHAIN_ID } from './core.ts';
import { LITE } from './perf.ts';
import { getRecentActivity, type ActivityItem } from './api.ts';

const RPC = String(import.meta.env.VITE_BSC_RPC_URL || (BSC_CHAIN_ID === 97 ? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545' : 'https://bsc-dataseed.binance.org/'));
const SCAN = BSC_CHAIN_ID === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';

const ICON: Record<ActivityItem['type'], string> = {
  activation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  topup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  rank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  withdrawal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
};

/**
 * Owner, 2026-10-12: until the first real event exists the card shows these SAMPLE events so it is
 * not empty, clearly labelled "Sample preview" (title, amber dot, "sample" on each line). They are
 * never shown as live: once GET /activity/recent returns a real event, only real events are shown.
 */
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const SAMPLE: ActivityItem[] = [
  { type: 'activation', wallet: '0x8a14...3f4b', detail: 'Activated an ID', amountUsd: 300, at: minsAgo(2), txHash: null },
  { type: 'rank', wallet: '0x4f82...91c2', detail: 'Reached Starter', amountUsd: 150, at: minsAgo(7), txHash: null },
  { type: 'withdrawal', wallet: '0x1d39...e8a2', detail: 'Withdrew to wallet', amountUsd: 285, at: minsAgo(14), txHash: null },
  { type: 'topup', wallet: '0x5a29...c018', detail: 'Topped up a package', amountUsd: 300, at: minsAgo(21), txHash: null },
  { type: 'rank', wallet: '0x7c44...b29f', detail: 'Reached Builder', amountUsd: 300, at: minsAgo(35), txHash: null },
];

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function blockNumber(): Promise<number | null> {
  try {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
    const json = await res.json();
    return typeof json.result === 'string' ? parseInt(json.result, 16) : null;
  } catch {
    return null;
  }
}

export function initLiveActivityStream(): void {
  const card = document.getElementById('livePulseCard');
  const feed = document.getElementById('lpFeed');
  const block = document.getElementById('lpBlock');
  const count = document.getElementById('lpCount');
  if (!card || !feed) return;

  let items: ActivityItem[] = [];
  let sample = true; // labelled SAMPLE until the first real event
  const title = card.querySelector<HTMLElement>('.ex-pair');
  let index = 0;
  let visible = false;
  let timers: number[] = [];

  const render = (animate: boolean) => {
    const list = sample ? SAMPLE : items;
    const item = list[index % list.length];
    card.classList.toggle('is-sample', sample);
    if (title) title.innerHTML = `<i class="ex-dot lp-live"></i> ${sample ? 'SAMPLE PREVIEW' : 'LIVE ON-CHAIN'}`;
    const html = item
      ? `<a class="lp-item is-${item.type}" ${item.txHash ? `href="${SCAN}/tx/${item.txHash}" target="_blank" rel="noopener"` : ''}>
          <span class="lp-icon" aria-hidden="true">${ICON[item.type]}</span>
          <span class="lp-text"><b class="mono">${item.wallet}</b> ${item.detail}</span>
          <span class="lp-amount mono">${item.type === 'rank' ? '+' : ''}${money(item.amountUsd)}</span>
          <span class="lp-time mono">${sample ? 'sample &bull; ' : ''}${ago(item.at)}</span>
        </a>`
      : `<div class="lp-item is-empty"><span class="lp-icon" aria-hidden="true">${ICON.activation}</span>
          <span class="lp-text">Waiting for the first activation on-chain.</span></div>`;
    if (!animate || LITE) { feed.innerHTML = html; return; }
    feed.classList.add('is-out');
    window.setTimeout(() => { feed.innerHTML = html; feed.classList.remove('is-out'); }, 260);
  };

  const loadEvents = async () => {
    try {
      const next = await getRecentActivity();
      const changed = JSON.stringify(next) !== JSON.stringify(items);
      items = next;
      const wasSample = sample;
      sample = items.length === 0;
      if (count) count.textContent = sample ? 'Live data at launch' : `${items.length} recent`;
      if (changed || wasSample !== sample) { index = 0; render(false); }
    } catch {
      if (!items.length) { sample = true; if (count) count.textContent = 'Live data at launch'; render(false); } // server asleep: the labelled sample
    }
  };
  const loadBlock = async () => {
    const n = await blockNumber();
    if (block && n) { block.textContent = `#${n.toLocaleString('en-US')}`; block.classList.remove('is-tick'); void block.offsetWidth; block.classList.add('is-tick'); }
  };

  const start = () => {
    stop();
    void loadEvents();
    void loadBlock();
    timers = [
      window.setInterval(() => { const n = sample ? SAMPLE.length : items.length; if (n > 1) { index = (index + 1) % n; render(true); } }, 4500),
      window.setInterval(loadBlock, 3500), // BSC makes a block about every 3 s
      window.setInterval(loadEvents, 30_000),
    ];
  };
  const stop = () => { timers.forEach((t) => window.clearInterval(t)); timers = []; };

  render(false);
  if (!('IntersectionObserver' in window)) { start(); return; }
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === visible) return;
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  }).observe(card);
}
