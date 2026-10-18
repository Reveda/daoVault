/**
 * DAOvault AI — Rank medallion for the #ranks game card
 *
 * Sits between the reward details and the 50:50 rule: a DAOvault coin inside an
 * 11-segment ring (one segment per rank tier). On every rank change the coin
 * flips, the ring fills up to the new tier and gold sparks burst out.
 */

import { gsap } from 'gsap';
import { getRankCrestSvg, RANK_CREST_METAS } from './rankCrests.ts';

const C = 120; // centre of the 240x240 viewBox
const RING_R = 100; // tier segments
const GAP_DEG = 5;

const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

function segmentPath(i: number, total: number): string {
  const span = 360 / total;
  const start = i * span + GAP_DEG / 2;
  const end = (i + 1) * span - GAP_DEG / 2;
  const [x0, y0] = polar(RING_R, start);
  const [x1, y1] = polar(RING_R, end);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${RING_R} ${RING_R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

let root: HTMLElement | null = null;
let segments: SVGPathElement[] = [];
let lastIndex = -1;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Builds the medallion inside `host` (inserted before `before`). */
export function mountRankEmblem(host: HTMLElement, before: Element | null, total: number): void {
  root = document.createElement('div');
  root.className = 'rank-emblem';
  root.setAttribute('aria-hidden', 'true');
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const [x0, y0] = polar(116, i * 5);
    const [x1, y1] = polar(i % 6 === 0 ? 108 : 112, i * 5);
    return `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" />`;
  }).join('');
  const segs = Array.from(
    { length: total },
    (_, i) => `<path class="re-seg" d="${segmentPath(i, total)}" />`,
  ).join('');

  root.innerHTML = `
    <div class="re-stage">
      <svg class="re-ring" viewBox="0 0 240 240">
        <g class="re-ticks">${ticks}</g>
        <g class="re-segs">${segs}</g>
        <g class="re-orbit"><circle cx="${C}" cy="${C - RING_R}" r="4" /></g>
      </svg>
      <div class="re-coin" role="button" tabindex="0" aria-label="3D Rank Crest Medallion - Click to spin 360°">
        <div class="re-face re-front">${getRankCrestSvg(0)}</div>
        <div class="re-face re-back"><span class="re-num">01</span><span class="re-tier-title mono">STARTER</span></div>
      </div>
      <div class="re-sparks"></div>
    </div>
    <div class="re-caption mono">TIER <b class="re-tier">01</b> / ${String(total).padStart(2, '0')} <span class="re-hint">&bull; ${matchMedia('(hover: none)').matches ? 'Tap' : 'Click'} the crest to spin it</span></div>`;
  host.insertBefore(root, before);
  segments = [...root.querySelectorAll<SVGPathElement>('.re-seg')];

  // Interactive 3D Medallion Click: 360 spin + sparks + haptic
  const coin = root.querySelector<HTMLElement>('.re-coin');
  if (coin) {
    const handleCoinSpin = () => {
      try {
        navigator.vibrate?.(25);
      } catch {
        /* no vibration */
      }
      gsap.fromTo(
        coin,
        { rotateY: 0 },
        { rotateY: 360, duration: 1.0, ease: 'back.out(1.4)', clearProps: 'transform' },
      );
      gsap.fromTo(
        coin,
        { scale: 1 },
        { scale: 1.16, duration: 0.35, yoyo: true, repeat: 1, ease: 'power2.out' },
      );
      burst();
    };
    coin.addEventListener('click', handleCoinSpin);
    coin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCoinSpin();
      }
    });
  }
}

/** Moves the medallion to tier `index` (0-based). */
export function updateRankEmblem(index: number): void {
  if (!root) return;
  const label = String(index + 1).padStart(2, '0');
  const tierEl = root.querySelector('.re-tier');
  const numEl = root.querySelector('.re-num');
  const meta = RANK_CREST_METAS[index] || RANK_CREST_METAS[0];
  const backTitleEl = root.querySelector('.re-tier-title');

  if (tierEl) tierEl.textContent = label;
  if (numEl) numEl.textContent = label;
  if (backTitleEl) backTitleEl.textContent = meta.name.toUpperCase();

  // Inject active 3D metallic crest SVG into front face
  const frontEl = root.querySelector<HTMLElement>('.re-front');
  if (frontEl) {
    frontEl.innerHTML = getRankCrestSvg(index);
  }

  root.classList.toggle('is-tier-starter', index < 3);
  root.classList.toggle('is-tier-mid', index >= 3 && index < 6);
  root.classList.toggle('is-tier-elite', index >= 6 && index < 9);
  root.classList.toggle('is-tier-crown', index >= 9);

  segments.forEach((s, i) => {
    s.classList.toggle('is-lit', i <= index);
    s.classList.toggle('is-current', i === index);
  });

  const first = lastIndex < 0;
  const dir = index >= lastIndex ? 1 : -1;
  lastIndex = index;
  if (first || reduceMotion()) return;

  const coin = root.querySelector<HTMLElement>('.re-coin');
  const current = segments[index];
  // coin flips through its back (rank number) and lands on the 3D metal crest face
  if (coin) {
    gsap.fromTo(
      coin,
      { rotateY: 0 },
      { rotateY: dir * 360, duration: 1.1, ease: 'power3.inOut', clearProps: 'transform' },
    );
    gsap.fromTo(
      coin,
      { scale: 1 },
      { scale: 1.12, duration: 0.45, yoyo: true, repeat: 1, ease: 'power2.out' },
    );
  }
  if (current) {
    const len = current.getTotalLength();
    gsap.fromTo(
      current,
      { strokeDasharray: len, strokeDashoffset: len },
      {
        strokeDashoffset: 0,
        duration: 0.7,
        delay: 0.35,
        ease: 'power2.out',
        clearProps: 'strokeDasharray,strokeDashoffset',
      },
    );
  }
  burst();
}

function burst(): void {
  const host = root?.querySelector<HTMLElement>('.re-sparks');
  if (!host) return;
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    host.appendChild(s);
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const r = 80 + Math.random() * 60;
    gsap.fromTo(
      s,
      { x: 0, y: 0, scale: 0.6 + Math.random() * 0.8, opacity: 1 },
      {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        opacity: 0,
        scale: 0.2,
        duration: 0.9 + Math.random() * 0.5,
        delay: 0.3,
        ease: 'power3.out',
        onComplete: () => s.remove(),
      },
    );
  }
}
