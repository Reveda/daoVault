/**
 * DAOvault AI — Matrix vault dial
 *
 * The 20 matrix levels sit around a safe dial. A gold hand points at the chosen
 * level and an inner cog turns with every change; the centre shows that level's
 * commission. A "your active directs" slider lights up the levels that are
 * unlocked. The dial drives the (visually hidden) level pills from
 * initMatrixCalculator, so autoplay, the stats cards and the matrix cards'
 * "Simulate Level" buttons keep working through one code path.
 */

const LEVELS = [
  { req: 0, pct: 10, usd: 30 },
  { req: 2, pct: 5, usd: 15 },
  { req: 3, pct: 3, usd: 9 },
  { req: 5, pct: 3, usd: 9 },
  { req: 7, pct: 2, usd: 6 },
  { req: 9, pct: 2, usd: 6 },
  { req: 10, pct: 2, usd: 6 },
  ...Array.from({ length: 13 }, () => ({ req: 15, pct: 1, usd: 3 })),
];

const N = LEVELS.length;
const STEP = 360 / N;
const C = 200;          // centre of the 400x400 viewBox
const NODE_R = 158;     // radius the level nodes sit on

const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

/** arc along the node ring from level 0 to level `last` (inclusive) */
function unlockedArc(last: number): string {
  if (last >= N - 1) {
    const [x0, y0] = polar(NODE_R, 0);
    const [x1, y1] = polar(NODE_R, 180);
    return `M ${x0} ${y0} A ${NODE_R} ${NODE_R} 0 1 1 ${x1} ${y1} A ${NODE_R} ${NODE_R} 0 1 1 ${x0} ${y0}`;
  }
  const end = last * STEP + 0.001;
  const [x0, y0] = polar(NODE_R, 0);
  const [x1, y1] = polar(NODE_R, end);
  return `M ${x0} ${y0} A ${NODE_R} ${NODE_R} 0 ${end > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function initMatrixDial(): void {
  const mount = document.getElementById('matrixDial');
  const pillsWrap = document.getElementById('levelPills');
  if (!mount || !pillsWrap) return;
  const pills = () => [...pillsWrap.querySelectorAll<HTMLButtonElement>('.level-pill-btn')];
  // the pills stay as the engine behind the dial, out of the tab order
  pills().forEach((p) => { p.tabIndex = -1; });

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const [x0, y0] = polar(186, i * 6);
    const [x1, y1] = polar(i % 3 === 0 ? 176 : 180, i * 6);
    return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" />`;
  }).join('');
  const nodes = LEVELS.map((_, i) => {
    const [x, y] = polar(NODE_R, i * STEP);
    return `<g class="mdial-node" data-i="${i}" transform="translate(${x} ${y})">
      <circle r="16" /><text text-anchor="middle" dominant-baseline="central">L${i + 1}</text></g>`;
  }).join('');

  mount.innerHTML = `
    <svg class="mdial" viewBox="0 0 400 400" role="slider" tabindex="0" aria-label="Matrix level dial"
         aria-valuemin="1" aria-valuemax="20" aria-valuenow="1">
      <defs>
        <radialGradient id="mdialFace" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stop-color="#1b1609" /><stop offset="100%" stop-color="#050505" />
        </radialGradient>
        <linearGradient id="mdialGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff4b2" /><stop offset="55%" stop-color="#d4af37" /><stop offset="100%" stop-color="#8a6818" />
        </linearGradient>
      </defs>
      <circle class="mdial-face" cx="200" cy="200" r="192" />
      <g class="mdial-ticks">${ticks}</g>
      <circle class="mdial-track" cx="200" cy="200" r="${NODE_R}" />
      <path class="mdial-unlocked" d="${unlockedArc(0)}" />
      <g class="mdial-cog"><circle cx="200" cy="200" r="96" /><circle cx="200" cy="200" r="84" /></g>
      <g class="mdial-hand"><line x1="200" y1="200" x2="200" y2="${C - NODE_R + 26}" /><path d="M200 ${C - NODE_R + 18} l7 12 h-14 z" /></g>
      ${nodes}
      <circle class="mdial-hub" cx="200" cy="200" r="70" />
    </svg>
    <div class="mdial-center" aria-hidden="true">
      <span class="mdial-lv mono">LEVEL 1</span>
      <span class="mdial-pct">10%</span>
      <span class="mdial-usd mono">$30 / member</span>
      <span class="mdial-lock mono">Unlocked</span>
    </div>`;

  const svg = mount.querySelector<SVGSVGElement>('svg.mdial');
  const hand = mount.querySelector<SVGGElement>('.mdial-hand');
  const cog = mount.querySelector<SVGGElement>('.mdial-cog');
  const arc = mount.querySelector<SVGPathElement>('.mdial-unlocked');
  const nodeEls = [...mount.querySelectorAll<SVGGElement>('.mdial-node')];
  const lvEl = mount.querySelector<HTMLElement>('.mdial-lv');
  const pctEl = mount.querySelector<HTMLElement>('.mdial-pct');
  const usdEl = mount.querySelector<HTMLElement>('.mdial-usd');
  const lockEl = mount.querySelector<HTMLElement>('.mdial-lock');
  const center = mount.querySelector<HTMLElement>('.mdial-center');
  const range = document.getElementById('matrixDirects') as HTMLInputElement | null;
  if (!svg || !hand || !cog || !arc) return;

  let active = 0;
  let handDeg = 0;
  let directs = 0;

  const refreshLock = () => {
    const ok = directs >= LEVELS[active].req;
    if (lockEl) {
      lockEl.textContent = ok ? 'Unlocked for you' : `Needs ${LEVELS[active].req} directs`;
      lockEl.classList.toggle('is-locked', !ok);
    }
  };

  const show = (i: number) => {
    // turn the shortest way round, like a real dial
    let diff = (i - active) * STEP;
    diff = ((diff % 360) + 540) % 360 - 180;
    if (i !== active || handDeg === 0) handDeg += diff;
    active = i;
    hand.style.transform = `rotate(${handDeg}deg)`;
    cog.style.transform = `rotate(${-handDeg * 1.6}deg)`;
    nodeEls.forEach((n, k) => n.classList.toggle('is-active', k === i));
    svg.setAttribute('aria-valuenow', String(i + 1));
    svg.setAttribute('aria-valuetext', `Level ${i + 1}: ${LEVELS[i].pct}% commission`);
    if (lvEl) lvEl.textContent = `LEVEL ${i + 1}`;
    if (pctEl) pctEl.textContent = `${LEVELS[i].pct}%`;
    if (usdEl) usdEl.textContent = `$${LEVELS[i].usd} / member`;
    refreshLock();
    if (center) {
      center.classList.remove('is-ticking');
      void center.offsetWidth;
      center.classList.add('is-ticking');
    }
  };

  const choose = (i: number) => pills()[((i % N) + N) % N]?.click();

  // follow whichever level the calculator makes active (clicks, autoplay, Simulate buttons)
  new MutationObserver(() => {
    const i = pills().findIndex((p) => p.classList.contains('active'));
    if (i >= 0 && i !== active) show(i);
  }).observe(pillsWrap, { subtree: true, attributes: true, attributeFilter: ['class'] });

  nodeEls.forEach((n, i) => n.addEventListener('click', () => choose(i)));

  svg.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    choose(active + step);
  });

  // spin: drag around the dial and it follows the pointer level by level
  let dragging = false;
  const levelAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    return Math.round(deg / STEP) % N;
  };
  svg.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.mdial-node')) return;
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const i = levelAt(e);
    if (i !== active) choose(i);
  });
  const endDrag = () => { dragging = false; svg.classList.remove('is-dragging'); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // directs slider: unlocked levels light up around the dial
  const setDirects = (d: number) => {
    directs = d;
    const unlocked = LEVELS.filter((l) => l.req <= d).length;
    nodeEls.forEach((n, k) => n.classList.toggle('is-unlocked', LEVELS[k].req <= d));
    arc.setAttribute('d', unlockedArc(unlocked - 1));
    const perMember = LEVELS.slice(0, unlocked).reduce((s, l) => s + l.usd, 0);
    const next = LEVELS.find((l) => l.req > d);
    const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('matrixDirectsVal', String(d));
    set('matrixUnlocked', `${unlocked} / ${N}`);
    set('matrixPerMember', `$${perMember}`);
    set('matrixNext', next
      ? `Next: L${LEVELS.indexOf(next) + 1} unlocks at ${next.req} directs`
      : 'All 20 levels unlocked: full matrix depth');
    if (range) range.style.setProperty('--fill', `${(d / 15) * 100}%`);
    refreshLock();
  };
  range?.addEventListener('input', () => setDirects(Number(range.value)));

  // it is a simulator: always start at 0 (browsers restore a moved slider after a refresh,
  // which showed e.g. "1" to a visitor as if it were their own data)
  if (range) range.value = '0';
  setDirects(0);
  show(Math.max(0, pills().findIndex((p) => p.classList.contains('active'))));
}
