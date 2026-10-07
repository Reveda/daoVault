/**
 * DAOvault AI — the animated DAOVAULT logo, everywhere.
 *
 * A port of public/DAOVault logo animation.html into a reusable component: the
 * extruded gold DV emblem sways in 3D, a key slides in and turns, the vault door
 * opens on a glow and closes again (12s loop), and the DAOVault wordmark rises.
 *
 *   <div data-dv-logo="full">  emblem + wordmark (hero, preloader)
 *   <div data-dv-logo="mark">  emblem only (header/footer icons, medallions)
 *
 * Any fallback <img> inside the host is replaced on mount. Each instance gets its own
 * SVG gradient ids, scales to its host box, and pauses its animations off-screen.
 */
import '../styles/dvlogo.css';
import { LITE } from './perf.ts';

const W = 460;                 // design width of the original animation
const H_FULL = 470;            // emblem + wordmark
const H_MARK = 340;            // emblem only
const D = 'M30 30H190C270 30 310 90 310 150C310 210 270 260 190 260H60L30 230ZM70 70H185C235 70 265 105 265 150C265 195 235 220 185 220H70Z';
const V = '262,120 306,120 340,205 385,95 430,95 352,290 322,290';

let uid = 0;

function emblemLayers(id: string, depth: number): string {
  const layer = (z: number, fill: string, extra = '') =>
    `<svg width="460" height="320" viewBox="0 0 460 320" style="transform:translateZ(${z}px)" aria-hidden="true">${extra}<path fill-rule="evenodd" d="${D}" fill="${fill}"/><polygon points="${V}" fill="${fill}"/></svg>`;
  let html = '';
  // extrusion: stacked copies behind the face (fewer, thicker steps in lite mode)
  const step = 22.4 / depth;
  for (let i = depth; i >= 1; i--) {
    const t = i / depth;
    html += layer(-i * step, `rgb(${Math.round(150 - 60 * t)},${Math.round(100 - 50 * t)},6)`);
  }
  html += layer(1, `url(#dvl-fg-${id})`, `<defs><linearGradient id="dvl-fg-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".5" stop-color="#e8a820"/><stop offset="1" stop-color="#b97d08"/></linearGradient></defs>`);
  return html;
}

function markup(id: string, word: boolean, depth: number): string {
  return `
  <div class="dvl-scene"><div class="dvl-rig">
    <div class="dvl-emblem">${emblemLayers(id, depth)}</div>
    <div class="dvl-glow"></div>
    <div class="dvl-door"><svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
      <defs><radialGradient id="dvl-dg-${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ffe27a"/><stop offset=".6" stop-color="#e0a21a"/><stop offset="1" stop-color="#9a6500"/></radialGradient></defs>
      <circle cx="52" cy="52" r="49" fill="url(#dvl-dg-${id})" stroke="#fff0a8" stroke-width="2"/>
      <circle cx="52" cy="52" r="36" fill="none" stroke="#7a4e00" stroke-width="4"/>
      <circle cx="52" cy="52" r="30" fill="#c98d12" stroke="#ffe27a" stroke-width="1.5"/>
      <g class="dvl-spokes" stroke="#fff0a8" stroke-width="7" stroke-linecap="round"><line x1="52" y1="6" x2="52" y2="24"/><line x1="52" y1="80" x2="52" y2="98"/><line x1="6" y1="52" x2="24" y2="52"/><line x1="80" y1="52" x2="98" y2="52"/></g>
      <circle cx="52" cy="52" r="14" fill="#ffd95a" stroke="#7a4e00" stroke-width="2"/>
      <circle cx="52" cy="50" r="3.5" fill="#1a1100"/><path d="M50 52h4l1.5 7h-7z" fill="#1a1100"/>
    </svg></div>
    <div class="dvl-key"><svg width="130" height="30" viewBox="0 0 130 30" aria-hidden="true">
      <defs><linearGradient id="dvl-kg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset="1" stop-color="#d9a017"/></linearGradient></defs>
      <g fill="url(#dvl-kg-${id})"><rect x="0" y="12" width="108" height="6" rx="2"/><rect x="6" y="18" width="7" height="9"/><rect x="18" y="18" width="7" height="6"/><path fill-rule="evenodd" d="M115 1a14 14 0 1 0 .1 0zM115 9a6 6 0 1 1-.1 0z"/></g>
    </svg></div>
    ${word ? '<div class="dvl-word"><span class="dvl-g">DAO</span><span class="dvl-w">Vault</span></div>' : ''}
  </div></div>`;
}

/** Mounts the animated logo into `host` (its box decides the size). */
export function mountDvLogo(host: HTMLElement, opts: { word?: boolean } = {}): void {
  if (host.dataset.dvMounted) return;
  host.dataset.dvMounted = '1';
  const word = opts.word ?? true;
  const id = String(++uid);
  const height = word ? H_FULL : H_MARK;

  host.classList.add('dvl', word ? 'dvl--full' : 'dvl--mark');
  // small icons need little depth; on phones the small icons hold still (only big logos animate)
  const depth = !word ? 5 : LITE ? 7 : 14;
  if (LITE && !word) host.classList.add('dvl-static');
  host.style.setProperty('--dvl-ratio', `${W} / ${height}`);
  host.setAttribute('role', 'img');
  if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', 'DAOVAULT');
  host.innerHTML = markup(id, word, depth);

  const scene = host.querySelector<HTMLElement>('.dvl-scene')!;
  const fit = () => {
    const s = Math.min(host.clientWidth / W, host.clientHeight / height) || 0;
    scene.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  fit();
  new ResizeObserver(fit).observe(host);

  // off-screen logos stop animating (battery, smooth scrolling)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => host.classList.toggle('dvl-paused', !entry.isIntersecting)).observe(host);
  }
}

/** Mounts every `[data-dv-logo]` on the page ("full" = with wordmark, "mark" = emblem only). */
export function initDvLogos(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-dv-logo]').forEach((el) => {
    mountDvLogo(el, { word: el.dataset.dvLogo !== 'mark' });
  });
}
