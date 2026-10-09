/**
 * Hero "BNB / USDT" card with live market data (owner, 2026-10-09: real rates like the
 * BscScan header, instead of the fixed "$100,000 / +24.8% 24H"):
 *  - price + 24h change and a 24h sparkline from Binance's public spot API (no key),
 *    CoinGecko as a fallback for price + change;
 *  - BNB Chain gas price straight from the chain (eth_gasPrice), shown on the payout card.
 * Refreshes every 60s while the card is on screen and the tab is visible. On any failure the
 * last good values stay (or the placeholders, which never claim a number).
 */
import { BSC_PARAMS } from './wallet.ts';

const REFRESH_MS = 60_000;
const BINANCE = 'https://api.binance.com/api/v3';
const COINGECKO = 'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd&include_24hr_change=true';
// gas is always read from BSC mainnet: it is the live network the card describes
const MAINNET_RPC = 'https://bsc-dataseed.binance.org/';

const $ = (id: string) => document.getElementById(id);

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadPrice(): Promise<{ price: number; change: number } | null> {
  try {
    const t = await getJson<{ lastPrice: string; priceChangePercent: string }>(`${BINANCE}/ticker/24hr?symbol=BNBUSDT`);
    return { price: Number(t.lastPrice), change: Number(t.priceChangePercent) };
  } catch {
    try {
      const g = await getJson<{ binancecoin: { usd: number; usd_24h_change: number } }>(COINGECKO);
      return { price: g.binancecoin.usd, change: g.binancecoin.usd_24h_change };
    } catch {
      return null;
    }
  }
}

async function loadSparkline(): Promise<number[] | null> {
  try {
    const rows = await getJson<Array<[number, string, string, string, string]>>(`${BINANCE}/klines?symbol=BNBUSDT&interval=1h&limit=24`);
    return rows.map((r) => Number(r[4]));
  } catch {
    return null;
  }
}

async function loadGasGwei(): Promise<number | null> {
  const rpc = BSC_PARAMS.chainId === '0x38' ? BSC_PARAMS.rpcUrls[0] : MAINNET_RPC;
  try {
    const r = await getJson<{ result: string }>(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
    });
    return parseInt(r.result, 16) / 1e9;
  } catch {
    return null;
  }
}

/** 24 closing prices -> the card's 120x28 sparkline (line + filled area). */
function drawSparkline(closes: number[]): void {
  const line = $('mkSparkLine');
  const fill = $('mkSparkFill');
  if (!line || !fill || closes.length < 2) return;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => [(i / (closes.length - 1)) * 120, 26 - ((c - min) / span) * 22]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  line.setAttribute('d', d);
  fill.setAttribute('d', `${d} L120,28 L0,28 Z`);
  const up = closes[closes.length - 1] >= closes[0];
  line.setAttribute('stroke', up ? '#10b981' : '#f87171');
}

async function refresh(): Promise<void> {
  const [price, closes, gas] = await Promise.all([loadPrice(), loadSparkline(), loadGasGwei()]);
  if (price && Number.isFinite(price.price)) {
    const priceEl = $('mkPrice');
    if (priceEl) priceEl.textContent = `$${price.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const badge = $('mkChange');
    if (badge && Number.isFinite(price.change)) {
      const up = price.change >= 0;
      badge.textContent = `${up ? '↑ +' : '↓ −'}${Math.abs(price.change).toFixed(2)}% 24H`;
      badge.className = `${up ? 'ex-badge-green' : 'ex-badge-red'} mono`;
    }
  }
  if (closes) drawSparkline(closes);
  const gasEl = $('mkGas');
  if (gasEl && gas !== null && Number.isFinite(gas)) {
    gasEl.textContent = `Gas: ${gas < 1 ? gas.toFixed(2) : gas.toFixed(1)} Gwei`;
  }
}

export function initLiveMarket(): void {
  const card = $('mkCard');
  if (!card) return;
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) void refresh(); // fresh numbers when it comes back on screen
    }).observe(card);
  }
  void refresh();
  window.setInterval(() => {
    if (visible && !document.hidden) void refresh();
  }, REFRESH_MS);
}
