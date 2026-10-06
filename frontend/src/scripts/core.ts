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
export function bootPreloader(onComplete?: () => void): void {
  const loader = document.getElementById('preloader');
  const bar = document.getElementById('loaderBar') as HTMLElement | null;
  const num = document.getElementById('loaderNum') as HTMLElement | null;

  let current = 0;
  let target = 0.4;
  let done = false;

  const tick = () => {
    current += (target - current) * 0.085;
    const pct = Math.min(100, Math.round(current * 100));

    // counts naturally: 1%, 2%, 3% … 100% (no leading zeros)
    if (num) num.textContent = `${pct}%`;
    if (bar) bar.style.width = pct + '%';

    if (done && pct >= 99) {
      if (num) num.textContent = '100%';
      if (bar) bar.style.width = '100%';
      if (loader) loader.classList.add('ready');
      document.body.classList.add('ready');
      document.querySelectorAll('#hero .hero-left, #hero .hero-right').forEach((el) => el.classList.add('revealed'));
      if (onComplete) onComplete();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // When fonts and DOM are ready, push to 85%
  if (document.fonts) {
    document.fonts.ready.then(() => {
      target = Math.max(target, 0.85);
    });
  }

  // Safety cap: Never hold the page more than 900ms
  setTimeout(() => {
    target = 1.0;
    done = true;
  }, 900);
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
