/**
 * DAOvault AI — Landing Page Application Coordinator (TypeScript)
 * 11-Tier Rank Showcase, 3D Tilt Physics, Countdown, Modal Controller, and 20-Level Matrix Simulator
 */

import { init3DScene, initHeroCore3D } from './scene.ts';
import { initApexTrophy } from './trophy3d.ts';
import { initScrollAnimations } from './scrollAnimations.ts';
import { initHeroWallet } from './heroWallet.ts';
import { initLiveMarket } from './liveMarket.ts';
import { initMatrixAutoDeck } from './matrixAutoDeck.ts';
import {
  initReferralCapture,
  bootPreloader,
  initScrollReveal,
  initCircuitSpine,
  initTrophyBoom,
  initOffscreenPause,
  enableTouchPress,
  countUp,
  formatAddress,
  showToast,
  showLaunchNotice,
  getPendingReferral,
  BSC_CHAIN_ID,
} from './core.ts';
import {
  getInstalledWallets,
  connectWithProvider,
  autoReconnect,
  getCurrentAccount,
  getLiveAccount,
  isMobileDevice,
  isInWalletApp,
  waitForWallet,
} from './wallet.ts';
import type { WalletOption } from './types.ts';
import { initRankGameCard } from './rankGameCard.ts';
import { initMatrixDial } from './matrixDial.ts';
import { initVaultQuiz } from './quiz.ts';
import { initDvLogos } from './dvLogo.ts';
import { wakeBackend } from './api.ts';

// start waking the backend right away (Render free plan sleeps it); the dashboard needs it next
wakeBackend();
import { initAnchorScroll, initScrollSpy, initNavIndicator, initJoinSteps, initDropCards, initSignalCardFlips } from './landingFx.ts';


document.addEventListener('DOMContentLoaded', async () => {
  initDvLogos(); // animated DAOVAULT logo: preloader, header, footer
  initOffscreenPause(); // looping CSS animations pause off screen
  enableTouchPress(); // smooth card press feedback on phones (iOS needs a touch listener)
  initReferralCapture();
  init3DScene();
  initHeroCore3D();
  initApexTrophy();

  // Ambient mouse spotlight tracker on whole document
  window.addEventListener('mousemove', (e: MouseEvent) => {
    document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
  });

  // pre-launch notice, once per browser
  showLaunchNotice('landing', 'We’ll be live soon',
    'DAOVAULT is getting ready to launch on BNB Smart Chain. Connect your wallet now to reserve your permanent referral link. Activations open at launch.');

  bootPreloader(() => {
    initScrollReveal(); // fallback IntersectionObserver for [data-reveal] without GSAP
    initCircuitSpine();
    initTrophyBoom();
    // GSAP ScrollTrigger — cinematic per-section scroll animations
    initScrollAnimations();
  });

  const header = document.querySelector('.top-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  initCountdown();
  initScrollSpy();
  initAnchorScroll(); // in-page links land on their section even when sections above change height
  initNavIndicator();
  initJoinSteps();
  initDropCards();
  initRankGameCard();
  initHeroMetricsSection();
  initSignalCardFlips();
  initVaultQuiz();
  initHeroMetricsInteraction();
  initCardTilt();
  initFlipCards();
  initMatrixCalculator();
  initMatrixDial();
  initMatrixAutoDeck();
  initWalletPicker();
  autoConnectFromWalletApp(); // opened inside a wallet app from our Connect: connect right away
  initHeroWallet(); // our own wallet + circling coins in the hero Connect badge
  initLiveMarket(); // live BNB/USDT rate + BSC gas on the hero metric cards

  // A connected member belongs on their own dashboard (that is where activation lives too).
  // Not when the dashboard itself just sent them here, or the two pages would bounce.
  // recordAutoRedirect() is the safety net on top: whatever a wallet emits, no endless loop.
  let bounced = false;
  try {
    bounced = sessionStorage.getItem('dv_dash_bounce') === '1';
    sessionStorage.removeItem('dv_dash_bounce');
  } catch { /* storage blocked */ }
  const existing = await autoReconnect();
  if (existing) {
    updateConnectButtonUI(existing);
    if (!bounced && recordAutoRedirect()) window.location.replace('dashboard.html');
  }
});

/** Allows an automatic landing -> dashboard redirect at most twice per 20s (loop breaker). */
function recordAutoRedirect(): boolean {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem('dv_auto_redirects') || '[]') as number[]).filter((t) => now - t < 20_000);
    if (recent.length >= 2) return false;
    sessionStorage.setItem('dv_auto_redirects', JSON.stringify([...recent, now]));
  } catch { /* storage blocked: the dv_dash_bounce guard still applies */ }
  return true;
}

/** Moves the four protocol cards into their dedicated section below the hero. */
function initHeroMetricsSection(): void {
  const source = document.getElementById('heroVisualCard');
  const target = document.getElementById('heroMetricsGrid');
  if (!source || !target) return;

  source.querySelectorAll<HTMLElement>('.crypto-exchange-card').forEach((card) => {
    target.appendChild(card);
  });

  const section = document.getElementById('heroMetrics');
  if (!section || !('IntersectionObserver' in window)) {
    section?.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        section.classList.add('is-visible');
        observer.disconnect();
      }
    },
    { threshold: 0.18 }
  );
  observer.observe(section);
}

/** Adds the subtle pointer depth / glow interaction used by the protocol cards. */
function initHeroMetricsInteraction(): void {
  const cards = document.querySelectorAll<HTMLElement>('#heroMetricsGrid .crypto-exchange-card');

  cards.forEach((card) => {
    card.addEventListener('pointermove', (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const rotateY = ((x / rect.width) - 0.5) * 8;
      const rotateX = ((y / rect.height) - 0.5) * -8;

      card.style.setProperty('--card-pointer-x', `${x}px`);
      card.style.setProperty('--card-pointer-y', `${y}px`);
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px) scale(1.015)`;
    });

    card.addEventListener('pointerenter', () => {
      card.style.animation = 'none';
      card.style.opacity = '1';
      card.classList.add('is-focused');
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-focused');
      card.style.removeProperty('transform');
      card.style.removeProperty('--card-pointer-x');
      card.style.removeProperty('--card-pointer-y');
    });
  });
}

/**
 * 3D Physical Card Tilt & Linear-Style Cursor Spotlight
 */
function initCardTilt(): void {
  // mouse only: on touch screens a tap sends one emulated mousemove and no mouseleave, so
  // the card tilted toward the finger and stayed tilted (the "ugly press effect")
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cards = document.querySelectorAll('.glass:not(.flip-card-front):not(.flip-card-back):not(.matrix-card):not(.wallet-dialog-box)');
  cards.forEach((card) => {
    const el = card as HTMLElement;
    el.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Local spotlight coordinate tracking
      el.style.setProperty('--mouse-x', `${x}px`);
      el.style.setProperty('--mouse-y', `${y}px`);

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -4.5;
      const rotateY = ((x - centerX) / centerX) * 4.5;

      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;

      // Alex Bender Multi-Plane 3D Parallax on Floating Exchange Cards
      const exCards = el.querySelectorAll<HTMLElement>('.crypto-exchange-card');
      exCards.forEach((exCard, idx) => {
        const depth = 35 + idx * 8;
        const offsetX = (x - centerX) * 0.035 * (idx + 1);
        const offsetY = (y - centerY) * 0.035 * (idx + 1);
        exCard.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${depth}px)`;
      });
    });

    el.addEventListener('mouseleave', () => {
      el.style.setProperty('--mouse-x', `-999px`);
      el.style.setProperty('--mouse-y', `-999px`);
      el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';

      const exCards = el.querySelectorAll<HTMLElement>('.crypto-exchange-card');
      exCards.forEach((exCard) => {
        exCard.style.removeProperty('transform');
      });
    });
  });
}

function initFlipCards(): void {
  const cards = document.querySelectorAll<HTMLElement>('.flip-card-wrap');
  // phones have no hover: the cards flip on tap, so say so
  if (matchMedia('(hover: none)').matches) {
    document.querySelectorAll<HTMLElement>('#about .flip-hint span').forEach((el) => { el.textContent = 'Tap to flip card'; });
    const sub = document.querySelector<HTMLElement>('#about .section-sub');
    if (sub) sub.textContent = sub.textContent?.replace('Hover over any pillar', 'Tap any pillar') ?? '';
  }
  // Touch screens: 3D only while turning. At rest the card was still drawn through a
  // preserve-3d context (and the back face as 180deg + 180deg), which phones rasterise at
  // low quality: blurry text. Once a turn ends it settles flat (.is-settled: the visible
  // face has no transform at all); a tap restores the 3D state instantly, then turns.
  const settleFlat = matchMedia('(hover: none)').matches;
  cards.forEach((card) => {
    const inner = card.querySelector<HTMLElement>('.flip-card-inner');
    if (settleFlat && inner) {
      card.classList.add('is-settled');
      inner.addEventListener('transitionend', (e) => {
        if (e.target !== inner || e.propertyName !== 'transform') return;
        // switch to the flat pose without animating it
        card.classList.add('no-anim', 'is-settled');
        void inner.offsetWidth;
        card.classList.remove('no-anim');
      });
    }
    card.addEventListener('click', () => {
      if (settleFlat && inner && card.classList.contains('is-settled')) {
        card.classList.add('no-anim');
        card.classList.remove('is-settled');
        void inner.offsetWidth; // back to the 3D pose of the current side, without animating
        card.classList.remove('no-anim');
      }
      card.classList.toggle('flipped');
    });
  });
}

/** Big numbers in short form so they fit the cards: 1.5M, 3B, 10T, 10Qa, 100Qi (below a million: 12,345). */
function shortNumber(n: number): string {
  const units: Array<[number, string]> = [[1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']];
  const unit = units.find(([size]) => n >= size);
  if (!unit) return n.toLocaleString();
  return `${(n / unit[0]).toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit[1]}`;
}

/**
 * Interactive 20-Level Matrix Commission Simulator
 */
function initMatrixCalculator(): void {
  const pillsWrap = document.getElementById('levelPills');
  if (!pillsWrap) return;

  // Theoretical team at a level if every member brings 10 directs: 10^level members,
  // earning `usd` each (owner, 2026-10-09: 10 directs each instead of the old 3x3)
  const team = (lvl: number, usd: number) => ({ members: 10 ** lvl, total: 10 ** lvl * usd });

  const levelConfigs = [
    { lvl: 1, pct: 10, usd: 30, req: '0 Directs', reqSub: 'Instant Unlock', ...team(1, 30) },
    { lvl: 2, pct: 5, usd: 15, req: '2 Directs', reqSub: 'Qualified', ...team(2, 15) },
    { lvl: 3, pct: 3, usd: 9, req: '3 Directs', reqSub: 'Qualified', ...team(3, 9) },
    { lvl: 4, pct: 3, usd: 9, req: '5 Directs', reqSub: 'Qualified', ...team(4, 9) },
    { lvl: 5, pct: 2, usd: 6, req: '7 Directs', reqSub: 'Qualified', ...team(5, 6) },
    { lvl: 6, pct: 2, usd: 6, req: '9 Directs', reqSub: 'Qualified', ...team(6, 6) },
    { lvl: 7, pct: 2, usd: 6, req: '10 Directs', reqSub: 'Qualified', ...team(7, 6) },
  ];

  // Fill levels 8 to 20 (1% each, $3.00, 15 Directs required)
  for (let l = 8; l <= 20; l++) {
    const mem = Math.pow(10, l);
    levelConfigs.push({
      lvl: l,
      pct: 1,
      usd: 3,
      req: '15 Directs',
      reqSub: 'Full Level Depth',
      members: mem,
      total: mem * 3,
    });
  }

  pillsWrap.innerHTML = '';
  const calcBox = document.querySelector<HTMLElement>('.matrix-calc-box');
  let activeIndex = 0;
  let autoTimer: number | null = null;
  let resumeTimer: number | null = null;

  const stopAutoLevels = (): void => {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
    calcBox?.classList.remove('auto-running');
  };

  const startAutoLevels = (): void => {
    stopAutoLevels();
    calcBox?.classList.add('auto-running');
    autoTimer = window.setInterval(() => {
      const nextIndex = (activeIndex + 1) % levelConfigs.length;
      selectLevel(nextIndex, true);
    }, 2000);
  };

  const scheduleResume = (): void => {
    if (resumeTimer !== null) window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(startAutoLevels, 6500);
  };

  const selectLevel = (idx: number, smoothPillScroll = false): void => {
    const cfg = levelConfigs[idx];
    if (!cfg) return;
    activeIndex = idx;
    document.querySelectorAll<HTMLButtonElement>('.level-pill-btn').forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.classList.toggle('auto-current', i === idx);
    });
    const activeButton = pillsWrap.querySelector<HTMLButtonElement>(`[data-level-index="${idx}"]`);
    if (smoothPillScroll && activeButton) {
      // Scroll only the horizontal pill rail. scrollIntoView() was also
      // moving the whole page back to the matrix section during autoplay.
      const targetLeft = activeButton.offsetLeft - (pillsWrap.clientWidth / 2) + (activeButton.offsetWidth / 2);
      pillsWrap.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });
    }
    updateCalcResult(cfg);
  };

  levelConfigs.forEach((cfg, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `level-pill-btn mono ${idx === 0 ? 'active auto-current' : ''}`;
    btn.dataset.levelIndex = String(idx);
    btn.textContent = `L${cfg.lvl}`;
    btn.addEventListener('click', () => {
      stopAutoLevels();
      selectLevel(idx, true);
      scheduleResume();
    });
    pillsWrap.appendChild(btn);
  });

  const updateCalcResult = (cfg: typeof levelConfigs[0]) => {
    const pctEl = document.getElementById('calcPct');
    const dollarEl = document.getElementById('calcDollar');
    const reqEl = document.getElementById('calcReq');
    const reqSubEl = document.getElementById('calcReqSub');
    const memEl = document.getElementById('calcMembers');
    const totalEl = document.getElementById('calcTotal');

    if (pctEl) pctEl.textContent = `${cfg.pct}%`;
    if (dollarEl) dollarEl.textContent = `$${cfg.usd.toFixed(2)} / Member`;
    if (reqEl) reqEl.textContent = cfg.req;
    if (reqSubEl) reqSubEl.textContent = cfg.reqSub;
    // millions and billions (L13+) in short form so they fit the card: 1.59M, $10.46B
    const short = shortNumber;
    if (memEl) memEl.textContent = `${short(cfg.members)} Members`;
    if (totalEl) {
      if (cfg.total >= 1_000_000) totalEl.textContent = `$${short(cfg.total)}`;
      else countUp(totalEl, cfg.total, '$');
    }
    calcBox?.classList.remove('level-changing');
    void calcBox?.offsetWidth;
    calcBox?.classList.add('level-changing');
  };

  selectLevel(0);

  // Watch the dial box, not the whole #matrix section: on phones the section is several
  // screens tall, so an 18% threshold on it was never reached and the dial never moved.
  const matrixSection = calcBox ?? document.getElementById('matrix');
  if (matrixSection && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      // every visit starts again from L1 and ticks round like a clock
      if (entry.isIntersecting) { selectLevel(0); startAutoLevels(); }
      else stopAutoLevels();
    }, { threshold: 0.2 });
    observer.observe(matrixSection);
  } else {
    startAutoLevels();
  }

  const pauseTargets = [pillsWrap, calcBox].filter(Boolean) as HTMLElement[];
  pauseTargets.forEach((target) => {
    target.addEventListener('pointerenter', stopAutoLevels);
    target.addEventListener('pointerleave', scheduleResume);
    target.addEventListener('focusin', stopAutoLevels);
    target.addEventListener('focusout', scheduleResume);
  });
}



/**
 * Launch date the hero countdown runs to: one fixed moment, the same for every visitor.
 * (It used to be "now + 14 days" on every page load, so it never actually counted down.)
 * Override without a code change with VITE_LAUNCH_DATE (ISO 8601, e.g. 2026-10-22T00:00:00+05:30).
 */
const LAUNCH_DATE = new Date(import.meta.env.VITE_LAUNCH_DATE || '2026-10-22T00:00:00+05:30');

function initCountdown(): void {
  const targetDate = Number.isNaN(LAUNCH_DATE.getTime()) ? new Date('2026-10-22T00:00:00+05:30') : LAUNCH_DATE;

  const daysEl = document.getElementById('cdDays');
  const hoursEl = document.getElementById('cdHours');
  const minsEl = document.getElementById('cdMins');
  const secsEl = document.getElementById('cdSecs');

  // each changed value drops in. Web Animations API: no forced page re-layout every second
  // (the old class toggle + offsetWidth read cost ~90ms per tick on phones)
  const setDigit = (el: HTMLElement | null, value: string) => {
    if (!el || el.textContent === value) return;
    el.textContent = value;
    if (document.hidden || !el.animate) return;
    el.animate(
      [{ opacity: 0, transform: 'translateY(-55%)' }, { opacity: 1, transform: 'none' }],
      { duration: 500, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  };

  const update = () => {
    const now = new Date().getTime();
    const diff = targetDate.getTime() - now;

    if (diff <= 0) {
      if (daysEl) daysEl.textContent = '00';
      if (hoursEl) hoursEl.textContent = '00';
      if (minsEl) minsEl.textContent = '00';
      if (secsEl) secsEl.textContent = '00';
      return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    setDigit(daysEl, String(d).padStart(2, '0'));
    setDigit(hoursEl, String(h).padStart(2, '0'));
    setDigit(minsEl, String(m).padStart(2, '0'));
    setDigit(secsEl, String(s).padStart(2, '0'));
  };

  update();
  setInterval(update, 1000);
}

/**
 * Web3 Wallet Picker Modal & Connection Flow — with 3D Crypto Exchange Stage
 */
function initWalletPicker(): void {
  const modal = document.getElementById('walletModal');
  if (!modal) return;

  const closeBtn = document.getElementById('walletModalClose');

  const openModal = () => {
    renderWalletList();
    modal.classList.add('active');
    document.body.classList.add('wallet-modal-open');
  };
  // a wallet that announces itself after the modal opened gets its "Detected" row
  window.addEventListener('daovault:walletsUpdated', () => {
    if (modal.classList.contains('active')) renderWalletList();
  });

  const hideModal = () => {
    modal.classList.remove('active');
    document.body.classList.remove('wallet-modal-open');
  };

  // Close on overlay background click (not dialog box clicks)
  modal.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Only close if clicking outside the dialog box and floating cards
    if (target === modal || target.classList.contains('wallet-3d-canvas') || target.classList.contains('wallet-stage-wrap')) {
      hideModal();
    }
  });
  closeBtn?.addEventListener('click', hideModal);

  const triggers = document.querySelectorAll('[data-connect-trigger]');
  window.addEventListener('daovault:accountConnected', () => {
    hideModal();
    window.location.href = 'dashboard.html';
  });
  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault(); // the footer trigger is an <a href="#">: no jump to the top
      // only a wallet connected right now goes to the dashboard: a saved address from a
      // locked or missing wallet used to send the click to the dashboard and straight
      // back, so the wallet modal never opened
      const current = getLiveAccount();
      if (current) {
        // already connected: the address button leads to the dashboard
        window.location.href = 'dashboard.html';
      } else {
        openModal();
      }
    });
  });
}

function renderWalletList(): void {
  const listEl = document.getElementById('walletOptionsList');
  if (!listEl) return;

  const installed = getInstalledWallets();
  const mobile = isMobileDevice();

  const options: WalletOption[] = [
    {
      id: 'metamask',
      name: 'MetaMask',
      icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21.5 7.5L13.8 2.2a3 3 0 00-3.6 0L2.5 7.5a1.5 1.5 0 00-.6 1.4l1.8 8.2a3 3 0 002.3 2.3l4.8 1.1a3 3 0 002.4-.4l1.2-.8 1.2.8a3 3 0 002.4.4l4.8-1.1a3 3 0 002.3-2.3l1.8-8.2a1.5 1.5 0 00-.6-1.4z" fill="#E2761B"/><path d="M7 11.5l2-3.5 3 2-2 3.5H7z" fill="#F6851B"/><path d="M17 11.5l-2-3.5-3 2 2 3.5h3z" fill="#F6851B"/></svg>`,
      appLink: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,
      webLink: 'https://metamask.io/download/',
    },
    {
      id: 'binance',
      name: 'Binance Web3 Wallet',
      icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#F0B90B"><path d="M12 2.5l3.2 3.2-3.2 3.2-3.2-3.2L12 2.5zm6.8 6.8l3.2 3.2-3.2 3.2-3.2-3.2 3.2-3.2zm-13.6 0l3.2 3.2-3.2 3.2-3.2-3.2 3.2-3.2zM12 9.5l3.2 3.2-3.2 3.2-3.2-3.2L12 9.5zm0 7l3.2 3.2-3.2 3.2-3.2-3.2L12 16.5z"/></svg>`,
      // official format from @binance/w3w-utils getDeeplink(): opens the app's dapp browser
      appLink: (url) => {
        const bnc = `bnc://app.binance.com/mp/app?appId=yFK5FCqYprrXDiVFbhyRx7`
          + `&startPagePath=${btoa('/pages/browser/index')}`
          + `&startPageQuery=${btoa(`url=${url}&defaultChainId=${BSC_CHAIN_ID}`)}`;
        return `https://app.binance.com/en/download?_dp=${btoa(bnc)}`;
      },
      webLink: 'https://www.binance.com/en/web3wallet',
    },
    {
      id: 'trust',
      name: 'Trust Wallet',
      icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2.5L4 6.5v5.5c0 5.5 3.5 10.5 8 12 4.5-1.5 8-6.5 8-12V6.5l-8-4z" fill="#0500FF"/><path d="M12 5l5 2.5v4.5c0 3.8-2.2 7.2-5 8.5-2.8-1.3-5-4.7-5-8.5V7.5L12 5z" fill="#0057FF"/></svg>`,
      appLink: (url) => `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}`,
      webLink: 'https://trustwallet.com/',
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M4 4h5v5H4V4zm11 0h5v5h-5V4zm-5.5 5.5h5v5h-5v-5zm-5.5 5.5h5v5H4v-5zm11 0h5v5h-5v-5z"/></svg>`,
      appLink: (url) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
      webLink: 'https://www.okx.com/web3',
    },
    {
      id: 'coinbase',
      name: 'Coinbase Wallet',
      icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#0052FF"><circle cx="12" cy="12" r="10"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="#FFFFFF"/></svg>`,
      appLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
      webLink: 'https://www.coinbase.com/wallet',
    },
  ];

  listEl.innerHTML = '';

  options.forEach((opt) => {
    const inj = installed.find((w) => w.name.toLowerCase().includes(opt.id));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wallet-opt';
    btn.innerHTML = `
      <div class="wallet-opt-left">
        <span class="wallet-opt-icon">${opt.icon}</span>
        <strong>${opt.name}</strong>
      </div>
      <div class="wallet-opt-right">
        <span class="wallet-badge ${inj ? 'installed' : ''}">${inj ? 'Detected' : (mobile ? 'Open App' : 'Ready')}</span>
        <span class="wallet-opt-arrow">&rarr;</span>
      </div>
    `;

    btn.addEventListener('click', async () => {
      try {
        // On a phone the wallet app's browser may still be injecting its provider: wait for
        // it instead of firing the app link, which reopened (reloaded) the site in a loop.
        // Only inside a wallet app: in Chrome/Safari a delay would cost the tap's user
        // activation, and iOS then refuses to open the app link.
        if (mobile && isInWalletApp() && !getInstalledWallets().length) await waitForWallet(3000);
        const inApp = mobile && getInstalledWallets()[0];
        if (inApp) {
          // inside a wallet app's own browser: its built-in wallet is the one to use
          await connectWithProvider(inApp.provider, inApp.name);
        } else if (mobile && isInWalletApp()) {
          showToast('Wallet not ready yet. Please wait a moment and tap again.', true);
        } else if (inj) {
          await connectWithProvider(inj.provider, opt.name);
        } else if (!mobile && window.ethereum && installed.length === 1 && installed[0].name === 'Browser Wallet') {
          // a single unbranded extension: use it rather than refusing
          await connectWithProvider(window.ethereum, opt.name);
        } else if (mobile && opt.appLink) {
          // Opens this site inside the wallet app, which then connects by itself
          // (dv_connect flag, see autoConnectFromWalletApp). If the app does not open,
          // the visitor gets a hint and stays on this page.
          openWalletApp(opt, withConnectFlag(window.location.href));
        } else {
          showToast(`Please install ${opt.name} or open inside wallet app browser.`, true);
        }
      } catch {
        // connectWithProvider already shows the user-facing error toast.
      }
    });

    listEl.appendChild(btn);
  });

  // WalletConnect Option
  const wcBtn = document.createElement('button');
  wcBtn.type = 'button';
  wcBtn.className = 'wallet-opt';
  wcBtn.innerHTML = `
    <div class="wallet-opt-left">
      <span class="wallet-opt-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#3B99FC"><path d="M6.5 7.5a8 8 0 0111 0l.7.7a.5.5 0 010 .7l-1.3 1.3a.5.5 0 01-.7 0l-.8-.8a5.5 5.5 0 00-7.8 0l-.8.8a.5.5 0 01-.7 0L4.8 8.9a.5.5 0 010-.7l.7-.7zm14.2 3.6l1.8 1.8a.5.5 0 010 .7l-8.2 8.2a.5.5 0 01-.7 0L7.4 15.6a.5.5 0 010-.7l.7-.7a.5.5 0 01.7 0l5.5 5.5 7.4-7.4a.5.5 0 01.7 0l-1.7-1.7zm-17.4 0l1.7-1.7a.5.5 0 01.7 0l7.4 7.4 5.5-5.5a.5.5 0 01.7 0l.7.7a.5.5 0 010 .7L11.5 21.8a.5.5 0 01-.7 0L2.6 13.6a.5.5 0 010-.7l1.7-1.7z"/></svg>
      </span>
      <strong>Other Wallet</strong>
    </div>
    <div class="wallet-opt-right">
      <span class="wallet-badge" style="background: rgba(34, 211, 238, 0.15); color: var(--cyan); border-color: rgba(34, 211, 238, 0.3);">Any EVM wallet</span>
      <span class="wallet-opt-arrow">&rarr;</span>
    </div>
  `;
  // Any injected wallet (Rabby, SafePal, TokenPocket, Bitget, ...). Without one on a phone,
  // the link is copied so the member can paste it into their wallet app's browser.
  // (A real WalletConnect QR needs a Reown project id; not set up yet.)
  wcBtn.addEventListener('click', async () => {
    if (mobile && isInWalletApp() && !getInstalledWallets().length) await waitForWallet(3000);
    const wallet = getInstalledWallets()[0];
    if (wallet) {
      try {
        await connectWithProvider(wallet.provider, wallet.name);
      } catch {
        // connectWithProvider already shows the user-facing error toast.
      }
      return;
    }
    // with the referral and the auto-connect flag, so pasting it in the wallet app just works
    const link = withConnectFlag(window.location.href);
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
    showToast(mobile
      ? 'Link copied. Open your wallet app, go to its Browser / DApps tab and paste the link.'
      : 'No wallet extension found. Install MetaMask, Trust Wallet or another EVM wallet.', true);
  });
  listEl.appendChild(wcBtn);
}

/**
 * Marks a link so the site connects by itself once it opens inside the wallet app. The
 * pending referral rides along: the wallet app's browser has its own empty localStorage.
 */
function withConnectFlag(url: string): string {
  const u = new URL(url);
  u.searchParams.set('dv_connect', '1');
  const ref = getPendingReferral();
  if (ref && !u.searchParams.get('ref')) u.searchParams.set('ref', ref);
  return u.toString();
}

/**
 * The site was opened inside a wallet app from our "Connect" (dv_connect=1): connect to
 * that app's built-in wallet straight away instead of making the member tap Connect again.
 * Other parameters (e.g. ?ref=) are kept.
 */
async function autoConnectFromWalletApp(): Promise<void> {
  const url = new URL(window.location.href);
  if (url.searchParams.get('dv_connect') !== '1') return;
  url.searchParams.delete('dv_connect');
  history.replaceState(null, '', url.toString());
  // remembered for this tab: from here on Connect never fires the app link again
  try { sessionStorage.setItem('dv_in_wallet_app', '1'); } catch { /* storage blocked */ }
  if (getCurrentAccount()) return; // the normal autoReconnect picks the session up
  // in-app browsers inject their wallet a moment after load
  if (!(await waitForWallet(4000))) return;
  const wallet = getInstalledWallets()[0];
  try {
    await connectWithProvider(wallet.provider, wallet.name);
  } catch {
    // connectWithProvider shows the error; the Connect button still works
  }
}

function openWalletApp(wallet: WalletOption, currentUrl: string): void {
  if (!wallet.appLink) return;

  showToast(`Opening ${wallet.name} app...`);
  let pageLeft = false;
  const markPageLeft = () => { pageLeft = true; };
  window.addEventListener('pagehide', markPageLeft, { once: true });
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { pageLeft = true; document.removeEventListener('visibilitychange', onVisibility); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  window.location.href = wallet.appLink(currentUrl);

  // Our page is never replaced by the wallet's own website any more: on many phones the
  // app opens later than any timer here (or Chrome first asks "Open in app?"), and the
  // old fallback then loaded trustwallet.com / metamask.io over our site. If the app
  // really did not open, the visitor only gets a hint and stays here.
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    if (pageLeft || document.visibilityState !== 'visible') return;
    const where = wallet.webLink ? ` If it is not installed, get it from ${new URL(wallet.webLink).hostname}.` : '';
    showToast(`${wallet.name} did not open.${where} Then tap Connect again.`, true);
  }, 4000);
}

function updateConnectButtonUI(account: string): void {
  // reveals the Dashboard link in the nav (hidden until a wallet is connected)
  document.body.classList.add('wallet-connected');
  const btns = document.querySelectorAll('[data-connect-trigger]');
  btns.forEach((btn) => {
    // buttons with a separate label (the hero wallet button) keep their icon
    const label = btn.querySelector('.btn-label');
    if (label) label.textContent = `🟢 ${formatAddress(account)}`;
    else btn.innerHTML = `<span>🟢</span> ${formatAddress(account)}`;
    btn.classList.add('connected');
  });
}
