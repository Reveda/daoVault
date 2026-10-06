/**
 * DAOvault AI — Coin Circling Wallet & 3D Rotating Coin Lottie Controller
 * Powers the high-tech Web3 wallet animations on:
 * 1. Landing Page Hero Connect CTA (#heroCoinWalletLottie): intro, then buttons, then a swirl every 5s
 * (The final CTA no longer has a wallet animation: removed at the owner's request.)
 * 3. Connect Wallet Dialog Modal Header (#modalCoinWalletLottie)
 * 4. Connect Wallet Dialog Ambient Backdrop (#modalBackdropCoinLottie)
 */

import lottie, { type AnimationItem } from 'lottie-web';

const activeAnimations: Map<string, AnimationItem> = new Map();

/**
 * Loads a Lottie instance into the specified DOM element.
 */
function loadLottieAnim(containerId: string, path: string, speed = 1.0): AnimationItem | null {
  const container = document.getElementById(containerId);
  if (!container) return null;

  // Cleanup any existing instance
  if (activeAnimations.has(containerId)) {
    activeAnimations.get(containerId)?.destroy();
    activeAnimations.delete(containerId);
  }

  try {
    container.innerHTML = '';
    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path,
    });

    anim.setSpeed(speed);
    activeAnimations.set(containerId, anim);

    // Interactive 3D cursor tilt on hover
    const parent = container.parentElement;
    if (parent && !containerId.includes('Backdrop')) {
      parent.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = parent.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 16;
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * -16;
        container.style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${y}deg) scale(1.04)`;
      });
      parent.addEventListener('mouseleave', () => {
        container.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) scale(1)';
      });
    }

    return anim;
  } catch (err) {
    console.warn(`[coinWalletLottie] Failed to load animation for #${containerId}:`, err);
    return null;
  }
}

/**
 * Initializes all coin-wallet Lottie animations across landing page and modal.
 */
export function initCoinWalletLottie(): void {
  if (typeof window === 'undefined') return;

  // 1. Hero: the wallet plays first, then the Connect buttons appear beside it,
  //    then the coins swirl again every 5 seconds
  initHeroWalletSequence();

  // The wallet picker stays intentionally calm: connection choices are the
  // focus on mobile and desktop. Modal-specific 3D/Lottie animation is not
  // loaded here to avoid unnecessary motion and GPU work.
}

/**
 * Explicit trigger to ensure modal Lotties play smoothly when modal opens
 */
export function playModalWalletLottie(): void {
  const modalAnim = activeAnimations.get('modalCoinWalletLottie');
  if (modalAnim) {
    modalAnim.play();
  } else {
    loadLottieAnim('modalCoinWalletLottie', '/assets/rotating-coin.json', 1.0);
  }

  const backdropAnim = activeAnimations.get('modalBackdropCoinLottie');
  if (backdropAnim) {
    backdropAnim.play();
  } else {
    loadLottieAnim('modalBackdropCoinLottie', '/assets/rotating-coin.json', 0.85);
  }
}

/** frames of /assets/coin-wallet.json: the wallet appears, then coins circle it */
const WALLET_INTRO: [number, number] = [0, 100];
const WALLET_SWIRL: [number, number] = [30, 130];
const WALLET_REPEAT_MS = 5000;

/** Runs cb once the preloader has cleared (body.ready), so nothing plays unseen. */
function whenPageReady(cb: () => void): void {
  if (document.body.classList.contains('ready')) { cb(); return; }
  const mo = new MutationObserver(() => {
    if (!document.body.classList.contains('ready')) return;
    mo.disconnect();
    cb();
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function initHeroWalletSequence(): void {
  const showcase = document.getElementById('heroConnectShowcase');
  const box = document.getElementById('heroCoinWalletLottie');
  if (!showcase || !box) return;
  // the buttons appear after the wallet's intro, and never later than this
  const showButtons = () => showcase.classList.add('is-ready');
  window.setTimeout(showButtons, 6500);

  let anim: AnimationItem;
  try {
    box.innerHTML = '';
    anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, path: '/assets/coin-wallet.json' });
  } catch (err) {
    console.warn('[coinWalletLottie] hero wallet unavailable:', err);
    showButtons();
    return;
  }
  anim.addEventListener('data_failed', showButtons);
  anim.addEventListener('DOMLoaded', () => whenPageReady(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      anim.goToAndStop(WALLET_SWIRL[1], true);
      showButtons();
      return;
    }
    anim.setSpeed(1.3);
    anim.addEventListener('complete', showButtons);
    anim.playSegments(WALLET_INTRO, true);
    window.setInterval(() => {
      if (!document.hidden) anim.playSegments(WALLET_SWIRL, true);
    }, WALLET_REPEAT_MS);
  }));
}
