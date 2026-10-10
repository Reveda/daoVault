/**
 * Admin dashboard charts (owner, 2026-10-10): the company's numbers as charts in the DAOVAULT
 * gold theme (Chart.js, admin page only). Money flow, joins, where the money goes, commissions
 * per level, members per rank, the company tree, packages and payouts, top earners.
 * Data: GET /admin/stats + GET /admin/analytics.
 */
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, Legend,
  LinearScale, LineController, LineElement, PointElement, Tooltip, type ChartConfiguration, type ChartType, type ScriptableContext,
} from 'chart.js';
import type { AdminAnalytics, AdminStats } from './api.ts';
import { LITE } from './perf.ts';
import { pageCount, pageOf, renderPager } from './pager.ts';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip);

const GOLD = '#d4af37', GOLD_LIGHT = '#f5d76e', AMBER = '#fbbf24', GREEN = '#10b981', RED = '#ef4444', VIOLET = '#a78bfa', CREAM = '#f3ecd6';
const GRID = 'rgba(255, 255, 255, 0.06)';
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const usdShort = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${Number.isInteger(n) ? n : n.toFixed(1)}`);

Chart.defaults.color = '#a8a29e';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = GRID;
// change only these keys: replacing the whole object drops Chart.js's own animation settings
if (Chart.defaults.animation) Object.assign(Chart.defaults.animation, { duration: LITE ? 400 : 1100, easing: 'easeOutQuart' });
Object.assign(Chart.defaults.plugins.tooltip, {
  backgroundColor: 'rgba(8, 8, 8, 0.94)', borderColor: 'rgba(212, 175, 55, 0.55)', borderWidth: 1,
  titleColor: GOLD_LIGHT, bodyColor: CREAM, padding: 10, cornerRadius: 10, displayColors: true, boxPadding: 4,
});
Object.assign(Chart.defaults.plugins.legend.labels, { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14, color: '#d6d3d1' });

/** vertical gradient fill under a line / inside a bar */
const fade = (color: string, top = 0.45, bottom = 0) => (ctx: ScriptableContext<'line' | 'bar'>) => {
  const { chart } = ctx;
  const area = chart.chartArea;
  if (!area) return color;
  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  const hex = (a: number) => `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  g.addColorStop(0, hex(top));
  g.addColorStop(1, hex(bottom));
  return g;
};

const charts = new Map<string, Chart>();
/**
 * (Re)draws one chart. With no data yet the zeros stay VISIBLE (owner, 2026-10-10): lines run
 * along $0 with a dot per day, bars show a small stub, a doughnut shows a grey ring, the y axis
 * gets a sensible range ($0…$1k, not $0…$1), and a small corner badge says "no data yet".
 */
function draw<T extends ChartType>(id: string, config: ChartConfiguration<T>, empty: boolean, emptyMax = 10): void {
  const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  if (!canvas) return;
  canvas.closest('.chart-card, .pc-card')?.classList.toggle('is-empty', empty);
  charts.get(id)?.destroy();
  const cfg = config as unknown as ChartConfiguration;
  if (empty) {
    const options = (cfg.options ??= {}) as Record<string, any>;
    const y = options.scales?.[options.indexAxis === 'y' ? 'x' : 'y'];
    if (y) y.suggestedMax = emptyMax;
    for (const ds of cfg.data.datasets as unknown as Array<Record<string, unknown>>) {
      if (cfg.type === 'bar') ds.minBarLength = 3; // a zero still shows as a stub
      if (cfg.type === 'line') { ds.pointRadius = 2.5; ds.borderWidth = 2; }
    }
    if (cfg.type === 'doughnut') {
      cfg.data = { labels: ['No data yet'], datasets: [{ data: [1], backgroundColor: ['rgba(255, 255, 255, 0.1)'], borderWidth: 0 }] };
      options.plugins = { ...options.plugins, legend: { display: false }, tooltip: { enabled: false } };
    }
  }
  charts.set(id, new Chart(canvas, cfg));
}

const axes = (money = false, stacked = false) => ({
  x: { stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
  y: { stacked, beginAtZero: true, grace: '8%', ticks: { precision: 0, callback: (v: string | number) => (money ? usdShort(Number(v)) : v) } },
});

const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const TOP_PAGE = 5;
/** top earners, 5 per page, ranked across all pages */
function showTopEarners(list: HTMLElement, all: AdminAnalytics['topEarners'], page: number): void {
  list.innerHTML = all.length
    ? pageOf(all, page, TOP_PAGE).map((t, i) => {
      const pos = (page - 1) * TOP_PAGE + i + 1;
      return `
        <li class="te-row" style="--i:${i}">
          <span class="te-pos mono">${String(pos).padStart(2, '0')}</span>
          <span class="te-code mono">${t.code.replace(/[^A-Za-z0-9]/g, '')}</span>
          <span class="te-meta mono">${t.directs} directs · ${t.team} DAO team · rank ${t.rank}</span>
          <b class="te-usd">${usd(t.earnedUsd)}</b>
        </li>`;
    }).join('')
    : '<li class="te-empty mono">No earnings yet: top members appear here.</li>';
  renderPager(document.getElementById('topPager'), page, pageCount(all.length, TOP_PAGE), (p) => showTopEarners(list, all, p));
}

export function renderAdminCharts(stats: AdminStats, a: AdminAnalytics): void {
  const days = a.series.map((d) => label(d.day));

  // 1. money flow over 30 days
  const moneyIn = a.series.map((d) => d.moneyInUsd);
  const credited = a.series.map((d) => d.levelUsd + d.rankUsd);
  const paid = a.series.map((d) => d.paidOutUsd);
  draw('chartMoney', {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        { label: 'Money in', data: moneyIn, borderColor: GOLD_LIGHT, backgroundColor: fade(GOLD, 0.5), fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5 },
        { label: 'Credited to members', data: credited, borderColor: AMBER, backgroundColor: fade(AMBER, 0.18), fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, borderDash: [6, 4] },
        { label: 'Paid out', data: paid, borderColor: GREEN, backgroundColor: fade(GREEN, 0.18), fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: axes(true),
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${usd(Number(c.raw))}` } } },
    },
  }, moneyIn.every((v) => !v) && credited.every((v) => !v) && paid.every((v) => !v), 1000);

  // 2. joins per day: first activations vs top-ups
  draw('chartJoins', {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'New members', data: a.series.map((d) => d.activations), backgroundColor: fade(GOLD, 0.95, 0.35), borderRadius: 6, maxBarThickness: 18 },
        { label: 'Top-ups', data: a.series.map((d) => d.topups), backgroundColor: fade(VIOLET, 0.9, 0.3), borderRadius: 6, maxBarThickness: 18 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: axes(false, true), interaction: { mode: 'index', intersect: false } },
  }, a.series.every((d) => !d.activations && !d.topups));

  // 3. where the money goes
  const kept = Math.max(0, stats.volumeUsd - stats.creditedUsd);
  draw('chartSplit', {
    type: 'doughnut',
    data: {
      labels: ['Level income', 'Rank rewards', 'Company keeps'],
      datasets: [{ data: [stats.levelCommissionsUsd, stats.rankRewardsUsd, kept], backgroundColor: [AMBER, VIOLET, GREEN], borderColor: '#0b0b0b', borderWidth: 3, hoverOffset: 10 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${usd(Number(c.raw))}` } } },
    },
  }, !stats.volumeUsd);

  // 4. commissions per level (L1 … L20)
  draw('chartLevels', {
    type: 'bar',
    data: {
      labels: a.commissionsByLevel.map((l) => `L${l.level}`),
      datasets: [{ label: 'Paid', data: a.commissionsByLevel.map((l) => l.usd), backgroundColor: fade(GOLD, 1, 0.3), borderRadius: 6, maxBarThickness: 22 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, scales: axes(true), plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${usd(Number(c.raw))} · ${a.commissionsByLevel[c.dataIndex].count} payments` } } },
    },
  }, a.commissionsByLevel.every((l) => !l.usd), 1000);

  // 5. members per rank
  draw('chartRanks', {
    type: 'bar',
    data: {
      labels: a.membersByRank.map((r) => r.name),
      datasets: [{ label: 'Members', data: a.membersByRank.map((r) => r.members), backgroundColor: a.membersByRank.map((r) => (r.rank ? GOLD : 'rgba(255,255,255,0.18)')), borderRadius: 6, maxBarThickness: 16 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grace: '8%', ticks: { precision: 0 } }, y: { grid: { display: false } } },
    },
  }, a.membersByRank.every((r) => !r.members));

  // 6. company tree: members per depth under the root
  const depth = Array.from({ length: 20 }, (_, i) => a.treeByDepth.find((t) => t.depth === i + 1)?.members ?? 0);
  draw('chartTree', {
    type: 'line',
    data: {
      labels: depth.map((_, i) => `L${i + 1}`),
      datasets: [{ label: 'Members', data: depth, borderColor: GOLD_LIGHT, backgroundColor: fade(GOLD, 0.45), fill: true, stepped: 'middle', borderWidth: 2, pointRadius: 2.5, pointBackgroundColor: GOLD_LIGHT }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: axes() },
  }, depth.every((v) => !v));

  // 7. packages + withdrawals
  const w = stats.withdrawals;
  draw('chartPackages', {
    type: 'doughnut',
    data: {
      labels: ['Active packages', 'Reached the cap', 'Withdrawals pending', 'Approved', 'Paid', 'Rejected'],
      datasets: [
        { data: [stats.activePackages, stats.cappedPackages, 0, 0, 0, 0], backgroundColor: [GOLD, '#6b5a1f', 'transparent', 'transparent', 'transparent', 'transparent'], borderColor: '#0b0b0b', borderWidth: 3 },
        { data: [0, 0, w.PENDING?.count ?? 0, w.PROCESSING?.count ?? 0, w.COMPLETED?.count ?? 0, w.REJECTED?.count ?? 0], backgroundColor: ['transparent', 'transparent', AMBER, VIOLET, GREEN, RED], borderColor: '#0b0b0b', borderWidth: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '52%',
      plugins: { legend: { position: 'bottom', labels: { filter: (item) => item.text !== '' } } },
    },
  }, !stats.packages && !Object.values(w).some((s) => s?.count));

  // top earners
  const top = document.getElementById('topEarners');
  if (top) showTopEarners(top, a.topEarners, 1);


  // live numbers inside "How DAOVAULT works"
  const set = (key: string, text: string) => document.querySelectorAll(`[data-flow="${key}"]`).forEach((el) => { el.textContent = text; });
  set('members', stats.members.toLocaleString('en-US'));
  set('moneyIn', usd(stats.volumeUsd));
  set('level', usd(stats.levelCommissionsUsd));
  set('rank', usd(stats.rankRewardsUsd));
  set('capped', stats.cappedPackages.toLocaleString('en-US'));
  set('topups', stats.topUps.toLocaleString('en-US'));
  set('paid', usd(stats.paidOutUsd));
  set('fees', usd(stats.feesUsd));
  set('net', usd(stats.companyNetUsd));
}

/* ── Live tracking: four panel charts (chart on a coloured panel, Material-style) + ledger ── */

const WHITE = 'rgba(255, 255, 255, 0.92)';
const panelOptions = (money: boolean) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: { raw: unknown }) => ` ${money ? usd(Number(c.raw)) : c.raw}` } } },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 9 }, maxRotation: 0, autoSkipPadding: 10 } },
    y: { beginAtZero: true, grace: '10%', border: { display: false }, grid: { color: 'rgba(255,255,255,0.16)' }, ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 9 }, maxTicksLimit: 5, callback: (v: string | number) => (money ? usdShort(Number(v)) : v) } },
  },
});

/** last 7 days against the 7 before: "↑ 55% vs previous 7 days" */
function trend(values: number[]): string {
  const now = values.slice(-7).reduce((s, v) => s + v, 0);
  const before = values.slice(-14, -7).reduce((s, v) => s + v, 0);
  if (!now && !before) return '<span class="tr-flat">No activity in the last 14 days</span>';
  if (!before) return '<span class="tr-up">&#8593; new this week</span>';
  const pct = Math.round(((now - before) / before) * 100);
  return pct >= 0
    ? `<span class="tr-up">&#8593; ${pct}%</span> vs previous 7 days`
    : `<span class="tr-down">&#8595; ${Math.abs(pct)}%</span> vs previous 7 days`;
}

export function renderTracking(a: AdminAnalytics): void {
  const last = a.series.slice(-14);
  const labels = last.map((d) => label(d.day));
  const deposits = a.series.map((d) => d.moneyInUsd);
  const earnings = a.series.map((d) => d.levelUsd + d.rankUsd);
  const paid = a.series.map((d) => d.paidOutUsd);
  let running = a.openingTreasuryUsd;
  const treasury = a.series.map((d) => (running += d.moneyInUsd - d.paidOutUsd));

  const panels: Array<[string, 'bar' | 'line', number[], boolean]> = [
    ['panelDeposits', 'bar', deposits, true],
    ['panelEarnings', 'line', earnings, true],
    ['panelPaid', 'line', paid, true],
    ['panelTreasury', 'line', treasury, true],
  ];
  for (const [id, type, values, money] of panels) {
    const data = values.slice(-14);
    draw(id, {
      type,
      data: {
        labels,
        datasets: [type === 'bar'
          ? { data, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 4, maxBarThickness: 12 }
          : { data, borderColor: WHITE, backgroundColor: 'rgba(255, 255, 255, 0.14)', fill: id === 'panelTreasury', tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 0 }],
      },
      options: panelOptions(money),
    } as ChartConfiguration, values.every((v) => !v), 1000);
    const card = document.getElementById(id)?.closest('.pc-card');
    const t = card?.querySelector('.pc-trend');
    if (t) t.innerHTML = id === 'panelTreasury' ? `Now <b>${usd(treasury[treasury.length - 1] ?? 0)}</b> in the treasury` : trend(values);
    const sumEl = card?.querySelector('.pc-total');
    if (sumEl) sumEl.textContent = id === 'panelTreasury' ? '' : `${usd(values.reduce((s, v) => s + v, 0))} in 30 days`;
  }
  const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelectorAll('.pc-updated').forEach((el) => { el.textContent = `updated ${stamp}`; });

  // treasury ledger: every day with activity, newest first, 10 per page
  const body = document.getElementById('ledgerBody');
  if (!body) return;
  const rows = a.series
    .map((d, i) => ({ ...d, treasury: treasury[i] }))
    .filter((d) => d.moneyInUsd || d.levelUsd || d.rankUsd || d.paidOutUsd)
    .reverse();
  const LEDGER_PAGE = 10;
  const show = (page: number) => {
    body.innerHTML = rows.length
      ? pageOf(rows, page, LEDGER_PAGE).map((d) => `
        <tr>
          <td class="mono">${label(d.day)}</td>
          <td class="lg-in">+${usd(d.moneyInUsd)}<small class="mono">${d.activations} new · ${d.topups} top-up</small></td>
          <td>${usd(d.levelUsd + d.rankUsd)}<small class="mono">level ${usd(d.levelUsd)} · rank ${usd(d.rankUsd)}</small></td>
          <td class="lg-out">${d.paidOutUsd ? `−${usd(d.paidOutUsd)}` : '—'}</td>
          <td class="lg-bal">${usd(d.treasury)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="lg-empty mono">No money moved in the last 30 days yet. Every deposit, credit and payout will be listed here, day by day.</td></tr>';
    renderPager(document.getElementById('ledgerPager'), page, pageCount(rows.length, LEDGER_PAGE), show);
  };
  show(1);
}
