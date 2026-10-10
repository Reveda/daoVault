/**
 * DAOvault AI — Core Utilities & Foundation (TypeScript)
 * Preloader, WebGL check, Referral Interceptor, Scroll Reveal & Count-Up Engine
 */

export const BSC_CHAIN_ID = Number(import.meta.env.VITE_BSC_CHAIN_ID || 56);
export const BSC_CHAIN_HEX = `0x${BSC_CHAIN_ID.toString(16)}`;

/**
 * Lossless Referral Interceptor
 * Grabs ?ref=... parameter and stores permanently in localStorage
 */
export function initReferralCapture(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref.trim()) {
      const cleanRef = ref.trim().toUpperCase();
      localStorage.setItem('daovault_pending_ref', cleanRef);
    }
  } catch (e) {
    console.warn('[DAOvault] LocalStorage inaccessible for referral:', e);
  }
}

export function getPendingReferral(): string {
  try {
    return localStorage.getItem('daovault_pending_ref') || '';
  } catch (e) {
    return '';
  }
}

/** Forget the captured invite code (e.g. it was the member's own code). */
export function clearPendingReferral(): void {
  try { localStorage.removeItem('daovault_pending_ref'); } catch { /* storage blocked */ }
}

/**
 * WebGL Capability Check
 */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

/**
 * Preloader Progress Easing
 */
/** How long the splash counts 1% -> 100%; the splash logo's key-turn and door-open fit inside it. */
export const SPLASH_MS = 2800;

export function bootPreloader(onComplete?: () => void): void {
  const loader = document.getElementById('preloader');
  const bar = document.getElementById('loaderBar') as HTMLElement | null;
  const num = document.getElementById('loaderNum') as HTMLElement | null;
  const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = quick ? 900 : SPLASH_MS;
  const t0 = performance.now();

  // the page must also be loaded; never wait longer than 3s extra for slow assets
  let loaded = document.readyState === 'complete';
  if (!loaded) window.addEventListener('load', () => { loaded = true; }, { once: true });
  window.setTimeout(() => { loaded = true; }, duration + 1500);

  let shown = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 0.5 - Math.cos(Math.PI * t) / 2; // gentle ease in/out
    // counts every number: 1%, 2%, 3% ... 99%, then 100% once the page is loaded
    const target = Math.max(1, Math.min(loaded ? 100 : 99, Math.floor(1 + eased * 99)));
    // one number per frame so none is skipped; a very slow device catches up 2 at a time
    const pct = target > shown ? Math.min(target, shown + (target - shown > 20 ? 2 : 1)) : shown;
    if (pct !== shown) {
      shown = pct;
      if (num) num.textContent = `${pct}%`;
      if (bar) bar.style.width = pct + '%';
    }
    if (pct >= 100) {
      if (loader) {
        loader.classList.add('ready');
        // once the 0.6s fade is over, take the splash out of the page: hidden, its logo
        // kept 5 animations running for the whole visit (wasted work on every frame)
        window.setTimeout(() => loader.remove(), 800);
      }
      document.body.classList.add('ready');
      // heavy setup (scroll animations etc.) runs in its own task once the splash fade has
      // started, not inside this frame (it stalled the splash exit for ~240ms). The hero
      // reveal goes in the same task so its intro animation never flashes.
      window.setTimeout(() => {
        document.querySelectorAll('#hero .hero-left, #hero .hero-right').forEach((el) => el.classList.add('revealed'));
        if (onComplete) onComplete();
      }, 40);
      return;
    }
    requestAnimationFrame(tick);
  };
  if (num) num.textContent = '1%';
  requestAnimationFrame(tick);
}

/**
 * Animated Number Count-Up (Cubic Ease-Out)
 */
export function countUp(element: HTMLElement | null, toValue: number, prefix: string = '$', duration: number = 1200): void {
  if (!element) return;
  const t0 = performance.now();
  const el = element as HTMLElement & { _raf?: number };
  if (el._raf) cancelAnimationFrame(el._raf);

  const step = (now: number) => {
    const progress = Math.min(1, (now - t0) / duration);
    // Cubic ease-out: 1 - (1 - x)^3
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(toValue * ease);
    el.textContent = `${prefix}${current.toLocaleString()}`;

    if (progress < 1) {
      el._raf = requestAnimationFrame(step);
    } else {
      el.textContent = `${prefix}${toValue.toLocaleString()}`;
    }
  };
  el._raf = requestAnimationFrame(step);
}

/**
 * Scroll Reveal Observer
 */
export function initScrollReveal(): void {
  const elements = document.querySelectorAll('[data-reveal], .section-head, .level-matrix-grid, .steps-list, .rank-tabs');
  if (!elements.length || !('IntersectionObserver' in window)) return;

  // Items that arrive together cascade in one after another (TPR's reveal stagger).
  // The delay is cleared afterwards so it never slows hover transitions.
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry, i) => {
      const el = entry.target as HTMLElement;
      const delay = Math.min(i * 90, 450);
      el.style.transitionDelay = `${delay}ms`;
      el.classList.add('revealed');
      window.setTimeout(() => { el.style.transitionDelay = ''; }, delay + 900);
      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  elements.forEach((el) => observer.observe(el));

  // The last lines of the page (footer copyright) can never rise above the -6% bottom
  // margin, so they stayed invisible: at the end of the page reveal whatever is left.
  const revealRest = () => {
    if (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 4) return;
    elements.forEach((el) => {
      if (el.classList.contains('revealed') || el.getBoundingClientRect().top > window.innerHeight) return;
      el.classList.add('revealed');
      observer.unobserve(el);
    });
  };
  window.addEventListener('scroll', revealRest, { passive: true });
}

/**
 * Trophy Card Cinematic Boom Fade In/Out Reveal:
 * - When entering the section: Card scales in with a glowing golden bloom shockwave
 * - When exiting the section: Card softly recedes so re-entering triggers the pop again
 */
/**
 * Pauses the looping CSS animations of sections that are off screen (.is-offscreen,
 * see the Performance block in main.css). Saves battery and keeps scrolling smooth.
 */
/** Cards that glow gold when touched (main.css .tap-glow). */
const TAP_GLOW_CARDS = '.compare-matrix tbody tr, .glass, .metric-card, .calc-stat, .step-card, .reward-box, .crypto-exchange-card';

/**
 * Touch feedback. iOS Safari only applies :active (the card press in main.css) when the page
 * has a touchstart listener. A touched card also gets .tap-glow for ~0.65s, so even a quick
 * tap shows a gold glow that then fades out (:active alone lasts only while the finger is
 * down). Passive: it never delays scrolling.
 */
export function enableTouchPress(): void {
  const timers = new WeakMap<Element, number>();
  document.addEventListener('touchstart', (e) => {
    const card = (e.target as Element | null)?.closest?.(TAP_GLOW_CARDS);
    if (!card) return;
    card.classList.add('tap-glow');
    window.clearTimeout(timers.get(card));
    timers.set(card, window.setTimeout(() => card.classList.remove('tap-glow'), 650));
  }, { passive: true });
}

export function initOffscreenPause(): void {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const off = !e.isIntersecting;
      if (e.target.classList.contains('is-offscreen') !== off) e.target.classList.toggle('is-offscreen', off);
    });
  }, { rootMargin: '250px 0px' });
  document.querySelectorAll('main > section, main > div > section, .dash-shell section, .main-footer').forEach((el) => io.observe(el));
}

export function initTrophyBoom(): void {
  const card = document.getElementById('trophyCard');
  if (!card || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        card.classList.add('boomed');
      } else {
        card.classList.remove('boomed');
      }
    });
  }, { threshold: 0.15 });

  observer.observe(card);
}

/**
 * Legacy Laser Circuit Spine Check (Safe fallback)
 */
export function initCircuitSpine(): void {
  const bead = document.getElementById('circuitBead');
  if (!bead) return;

  const onScroll = () => {
    const scrollY = window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
    bead.style.top = `${pct}%`;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/**
 * Web3 Toast System
 */
let toastTimeout: any;
/**
 * One-time "We'll be live soon" popup. Shown once per browser for each `key` (landing and
 * dashboard have their own), a moment after the splash screen. Closes with the button, a
 * click outside the card or Escape.
 */
export function showLaunchNotice(key: string, title: string, message: string): void {
  const storageKey = `dv_launch_notice_${key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
  } catch { return; } // storage blocked: better no popup than one on every visit

  const open = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
    const overlay = document.createElement('div');
    overlay.className = 'launch-notice';
    overlay.innerHTML = `
      <div class="launch-notice-card" role="dialog" aria-modal="true" aria-labelledby="launchNoticeTitle">
        <img class="launch-notice-logo" src="/favicon.png" alt="" width="56" height="56" />
        <span class="launch-notice-kicker mono">DAOVAULT · Launching soon</span>
        <h3 id="launchNoticeTitle">${title}</h3>
        <p>${message}</p>
        <button type="button" class="btn btn-grad launch-notice-btn">Got it</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    const btn = overlay.querySelector<HTMLButtonElement>('.launch-notice-btn');
    btn?.focus({ preventScroll: true });
    const close = () => {
      overlay.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      window.setTimeout(() => overlay.remove(), 350);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    btn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
  };

  // after the splash screen (body.ready), so it never hides behind the preloader
  const started = Date.now();
  const wait = () => {
    if (document.body.classList.contains('ready')) window.setTimeout(open, 700);
    else if (Date.now() - started < 15000) window.setTimeout(wait, 200);
    else open();
  };
  wait();
}

const TOAST_MS = 4200;
const TOAST_ICONS = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6.5M12 17.2v.1"/></svg>',
};

/**
 * Top-right toast in the DAOvault theme (owner, 2026-10-10): dark card, gold (or red) accent,
 * icon, title, message and a shrinking timer bar; tap / close to dismiss. The message is set
 * as text, never HTML (wallet names come from browser extensions).
 */
export function showToast(message: string, isError: boolean = false): void {
  let toast = document.getElementById('web3Toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'web3Toast';
    toast.className = 'toast-msg';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="toast-icon"></span>
      <div class="toast-body"><strong class="toast-title"></strong><span class="toast-text"></span></div>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
      <i class="toast-timer"></i>`;
    const hide = () => { clearTimeout(toastTimeout); toast?.classList.remove('show'); };
    toast.querySelector('.toast-close')?.addEventListener('click', hide);
    document.body.appendChild(toast);
  }

  toast.classList.toggle('is-error', isError);
  toast.querySelector('.toast-icon')!.innerHTML = isError ? TOAST_ICONS.error : TOAST_ICONS.ok;
  toast.querySelector('.toast-title')!.textContent = isError ? 'Attention' : 'DAOvault';
  toast.querySelector('.toast-text')!.textContent = message;

  // restart the slide-in and the timer bar for every new message
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast?.classList.remove('show');
  }, TOAST_MS);
}

/**
 * Format wallet address: 0x1234...5678
 */
export function formatAddress(address: string | null | undefined): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
