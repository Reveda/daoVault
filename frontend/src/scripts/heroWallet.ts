/**
 * Hero "Connect Wallet & Join" badge: our own gold wallet (inline SVG) with four DV coins
 * circling it (CSS, transform/opacity only). Replaces the third-party Lottie animation, so
 * lottie-web is no longer loaded on the landing page (owner, 2026-10-09).
 *
 * Sequence: the wallet shows in a round badge during the splash; once the page is revealed
 * the coins swirl, the badge opens into the full button (.is-ready) and "Explore" slides in;
 * after that the coins swirl again every 5s while the hero is on screen.
 */

const walletSvg = (id: string) => `
<svg class="hw-wallet" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1a8" />
      <stop offset="0.45" stop-color="#e2b33d" />
      <stop offset="1" stop-color="#9c7414" />
    </linearGradient>
  </defs>
  <path class="hw-card" d="M11 15.5 30.6 9.7a2.2 2.2 0 0 1 2.8 1.6L34.4 15" fill="none" stroke="url(#${id})" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
  <rect x="8" y="15" width="31" height="23" rx="4.5" fill="#0d0b05" stroke="url(#${id})" stroke-width="2.4" />
  <path d="M29.5 22.4H40v8.6H29.5a4.3 4.3 0 0 1 0-8.6z" fill="url(#${id})" />
  <circle cx="31.4" cy="26.7" r="1.7" fill="#0d0b05" />
</svg>`;

const COINS = 4;
const SWIRL_EVERY_MS = 5000;
const OPEN_AFTER_MS = 1300;

/** Runs cb once the splash screen has cleared (body.ready), so nothing plays unseen. */
function whenPageReady(cb: () => void): void {
  const check = () => {
    if (document.body.classList.contains('ready')) cb();
    else window.setTimeout(check, 150);
  };
  check();
}

let mounted = 0;

/** Puts the wallet + coins into `box`; returns a function that plays one coin swirl. */
function mountWallet(box: HTMLElement): () => void {
  const coins = Array.from({ length: COINS }, (_, i) => `<span class="hw-coin" style="--a:${(360 / COINS) * i}deg;--d:${i * 70}ms"></span>`).join('');
  box.innerHTML = `${walletSvg(`hwGold${mounted++}`)}<span class="hw-coins">${coins}</span>`;
  return () => {
    box.classList.remove('is-swirling');
    void box.offsetWidth; // restart the CSS animation
    box.classList.add('is-swirling');
  };
}

export function initHeroWallet(): void {
  // the navbar Connect Wallet button carries the same wallet (owner, 2026-10-09)
  const navSwirls = [...document.querySelectorAll<HTMLElement>('[data-wallet-icon]')].map(mountWallet);
  const swirlNav = () => { if (!document.hidden) navSwirls.forEach((s) => s()); };
  if (navSwirls.length) whenPageReady(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    swirlNav();
    window.setInterval(swirlNav, SWIRL_EVERY_MS);
  });

  const showcase = document.getElementById('heroConnectShowcase');
  const box = document.getElementById('heroWallet');
  if (!showcase || !box) return;

  const swirl = mountWallet(box);
  const showButtons = () => showcase.classList.add('is-ready');

  let heroVisible = true;
  const hero = document.getElementById('hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);
  }

  whenPageReady(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { showButtons(); return; }
    swirl();
    window.setTimeout(showButtons, OPEN_AFTER_MS);
    window.setInterval(() => {
      if (!document.hidden && heroVisible) swirl();
    }, SWIRL_EVERY_MS);
  });
}
