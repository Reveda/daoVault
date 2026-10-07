/**
 * DAOvault AI — Landing Page Application Coordinator (TypeScript)
 * 11-Tier Rank Showcase, 3D Tilt Physics, Countdown, Modal Controller, and 20-Level Matrix Simulator
 */

import { init3DScene, initHeroCore3D } from './scene.ts';
import { initApexTrophy } from './trophy3d.ts';
import { initScrollAnimations } from './scrollAnimations.ts';
import { initCoinWalletLottie } from './coinWalletLottie.ts';
import { initMatrixAutoDeck } from './matrixAutoDeck.ts';
import {
  initReferralCapture,
  bootPreloader,
  initScrollReveal,
  initCircuitSpine,
  initTrophyBoom,
  countUp,
  formatAddress,
  showToast,
} from './core.ts';
import {
  getInstalledWallets,
  connectWithProvider,
  autoReconnect,
  getCurrentAccount,
  isMobileDevice,
} from './wallet.ts';
import type { WalletOption } from './types.ts';
import { initRankGameCard } from './rankGameCard.ts';
import { initMatrixDial } from './matrixDial.ts';
import { initVaultQuiz } from './quiz.ts';
import { initDvLogos } from './dvLogo.ts';
import { initScrollSpy, initNavIndicator, initJoinSteps, initDropCards, initSignalCardFlips } from './landingFx.ts';


document.addEventListener('DOMContentLoaded', async () => {
  initDvLogos(); // animated DAOVAULT logo: preloader, header, footer
  initReferralCapture();
  init3DScene();
  initHeroCore3D();
  initApexTrophy();

  // Ambient mouse spotlight tracker on whole document
  window.addEventListener('mousemove', (e: MouseEvent) => {
    document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
  });

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
  initCoinWalletLottie();

  const existing = await autoReconnect();
  if (existing) {
    updateConnectButtonUI(existing);
  }
});

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
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });
  });
}

/**
 * Interactive 20-Level Matrix Commission Simulator
 */
function initMatrixCalculator(): void {
  const pillsWrap = document.getElementById('levelPills');
  if (!pillsWrap) return;

  const levelConfigs = [
    { lvl: 1, pct: 10, usd: 30, req: '0 Directs', reqSub: 'Instant Unlock', members: 3, total: 90 },
    { lvl: 2, pct: 5, usd: 15, req: '2 Directs', reqSub: 'Qualified', members: 9, total: 135 },
    { lvl: 3, pct: 3, usd: 9, req: '3 Directs', reqSub: 'Qualified', members: 27, total: 243 },
    { lvl: 4, pct: 3, usd: 9, req: '5 Directs', reqSub: 'Qualified', members: 81, total: 729 },
    { lvl: 5, pct: 2, usd: 6, req: '7 Directs', reqSub: 'Qualified', members: 243, total: 1458 },
    { lvl: 6, pct: 2, usd: 6, req: '9 Directs', reqSub: 'Qualified', members: 729, total: 4374 },
    { lvl: 7, pct: 2, usd: 6, req: '10 Directs', reqSub: 'Qualified', members: 2187, total: 13122 },
  ];

  // Fill levels 8 to 20 (1% each, $3.00, 15 Directs required)
  for (let l = 8; l <= 20; l++) {
    const mem = Math.min(1000000, Math.pow(3, Math.min(l, 12)));
    levelConfigs.push({
      lvl: l,
      pct: 1,
      usd: 3,
      req: '15 Directs',
      reqSub: 'Full Matrix Depth',
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
    if (memEl) memEl.textContent = `${cfg.members.toLocaleString()} Members`;
    if (totalEl) countUp(totalEl, cfg.total, '$');
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



function initCountdown(): void {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 14);

  const daysEl = document.getElementById('cdDays');
  const hoursEl = document.getElementById('cdHours');
  const minsEl = document.getElementById('cdMins');
  const secsEl = document.getElementById('cdSecs');

  // each changed value drops in (CSS .cd-tick)
  const setDigit = (el: HTMLElement | null, value: string) => {
    if (!el || el.textContent === value) return;
    el.textContent = value;
    el.classList.remove('cd-tick');
    void el.offsetWidth;
    el.classList.add('cd-tick');
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
    trigger.addEventListener('click', () => {
      const current = getCurrentAccount();
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
      appLink: (url) => `bnc://app.binance.com/dapp?url=${encodeURIComponent(url)}`,
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
      appLink: (url) => `okx://wallet/dapp/details?dappUrl=${encodeURIComponent(url)}`,
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
        if (inj) {
          await connectWithProvider(inj.provider, opt.name);
        } else if (window.ethereum) {
          // Works on desktop browser extensions and wallet in-app browsers.
          await connectWithProvider(window.ethereum, opt.name);
        } else if (mobile && opt.appLink) {
          // App first. If the OS does not open it, fall back to that wallet's
          // official web page instead of leaving the user on a dead screen.
          openWalletAppWithWebFallback(opt, window.location.href);
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
      <strong>WalletConnect</strong>
    </div>
    <div class="wallet-opt-right">
      <span class="wallet-badge" style="background: rgba(34, 211, 238, 0.15); color: var(--cyan); border-color: rgba(34, 211, 238, 0.3);">300+ Wallets</span>
      <span class="wallet-opt-arrow">&rarr;</span>
    </div>
  `;
  wcBtn.addEventListener('click', async () => {
    showToast('Initializing WalletConnect QR session...');
    if (window.ethereum) {
      try {
        await connectWithProvider(window.ethereum, 'Web3 Wallet');
      } catch {
        // connectWithProvider already shows the user-facing error toast.
      }
    } else {
      showToast('No Web3 provider found. Please install MetaMask or Trust Wallet.', true);
    }
  });
  listEl.appendChild(wcBtn);
}

function openWalletAppWithWebFallback(wallet: WalletOption, currentUrl: string): void {
  if (!wallet.appLink) return;

  showToast(`Opening ${wallet.name} app...`);
  let pageLeft = false;
  const markPageLeft = () => { pageLeft = true; };
  window.addEventListener('pagehide', markPageLeft, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pageLeft = true;
  }, { once: true });

  window.location.href = wallet.appLink(currentUrl);

  window.setTimeout(() => {
    if (!pageLeft && document.visibilityState === 'visible' && wallet.webLink) {
      showToast(`${wallet.name} app not detected. Opening wallet web page...`);
      window.location.href = wallet.webLink;
    }
  }, 1600);
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
