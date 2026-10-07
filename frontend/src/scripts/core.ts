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
      console.log('[DAOvault] Referral code captured:', cleanRef);
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
      if (loader) loader.classList.add('ready');
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
export function showToast(message: string, isError: boolean = false): void {
  let toast = document.getElementById('web3Toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'web3Toast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }

  const icon = isError ? '⚠️' : '✅';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toast.style.borderColor = isError ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 196, 0, 0.5)';
  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast?.classList.remove('show');
  }, 4200);
}

/**
 * Format wallet address: 0x1234...5678
 */
export function formatAddress(address: string | null | undefined): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
