/**
 * DAOvault AI — City of Mist Interactive Game Cards Animation Engine
 * Inspired by Koncepted's City of Mist Game Cards (Dribbble #14764910)
 *
 * Features:
 * 1. Directional 3D Game Card Flip & Deal Transition (3D perspective rotateY, scale, elastic settle)
 * 2. Holographic Foil Laser Sheen Sweep across card face on tier change
 * 3. 3D Gyroscopic Cursor Parallax Tilt with dynamic specular reflection glare
 * 4. Interactive Slider Navigation Track with Prev/Next Arrow buttons
 * 5. Animated 50:50 Leg Qualification Bar & Reward Ticker Rollup
 * 6. Tier-Adaptive Ambient Energy Aura (Starter, Executive, Crown Apex)
 */

import { gsap } from 'gsap';
import type { RankTier } from './types.ts';
import { mountRankEmblem, updateRankEmblem } from './rankEmblem.ts';

export const RANK_DATA: RankTier[] = [
  {
    id: 1,
    title: 'Starter',
    dao: 25,
    reward: 100,
    powerLeg: 12.5,
    otherLegs: 12.5,
    desc: 'The gateway milestone for active team initiators.',
  },
  {
    id: 2,
    title: 'Builder',
    dao: 50,
    reward: 250,
    powerLeg: 25,
    otherLegs: 25,
    desc: 'Structured growth across two strong foundational legs.',
  },
  {
    id: 3,
    title: 'Leader',
    dao: 100,
    reward: 500,
    powerLeg: 50,
    otherLegs: 50,
    desc: 'Proven leadership driving 100 active community packages.',
  },
  {
    id: 4,
    title: 'Elite Leader',
    dao: 200,
    reward: 1000,
    powerLeg: 100,
    otherLegs: 100,
    desc: 'Regional expansion with balanced multi-leg performance.',
  },
  {
    id: 5,
    title: 'Executive',
    dao: 350,
    reward: 2186,
    powerLeg: 175,
    otherLegs: 175,
    desc: 'High-impact team builder with substantial ecosystem volume.',
  },
  {
    id: 6,
    title: 'Crown Executive',
    dao: 1000,
    reward: 5000,
    powerLeg: 500,
    otherLegs: 500,
    desc: 'Elite network orchestrator surpassing 1,000 DAO volume.',
  },
  {
    id: 7,
    title: 'Crown Director',
    dao: 3000,
    reward: 10000,
    powerLeg: 1500,
    otherLegs: 1500,
    desc: 'International directorship milestone and five-figure reward.',
  },
  {
    id: 8,
    title: 'Ambassador',
    dao: 7000,
    reward: 20000,
    powerLeg: 3500,
    otherLegs: 3500,
    desc: 'Global ambassador leading multi-tier organizational growth.',
  },
  {
    id: 9,
    title: 'Crown Ambassador',
    dao: 10000,
    reward: 30000,
    powerLeg: 5000,
    otherLegs: 5000,
    desc: 'Top 1% ecosystem vanguard commanding 10,000 DAO volume.',
  },
  {
    id: 10,
    title: 'President',
    dao: 20000,
    reward: 50000,
    powerLeg: 10000,
    otherLegs: 10000,
    desc: 'Pinnacle institutional tier with half-century USDT bonus.',
  },
  {
    id: 11,
    title: 'Crown President',
    dao: 50000,
    reward: 100000,
    powerLeg: 25000,
    otherLegs: 25000,
    desc: 'The ultimate apex crown achievement with $100,000 pool reward.',
  },
];

let currentRankIndex = 0;
let rankInterval: any = null;
let isAnimating = false;
let cardTl: gsap.core.Timeline | null = null;

/**
 * Initializes the City of Mist Interactive Game Cards Showcase
 */
export function initRankGameCard(): void {
  const tabsWrap = document.getElementById('rankTabs');
  const card = document.getElementById('rankDisplayCard');
  if (!tabsWrap || !card) return;

  // 1. Build Interactive Tab Buttons
  tabsWrap.innerHTML = '';
  RANK_DATA.forEach((rank, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rank-tab-btn ${index === 0 ? 'active' : ''}`;
    btn.setAttribute('data-rank-index', String(index));
    btn.textContent = `${rank.id}. ${rank.title}`;
    btn.addEventListener('click', () => {
      const dir = index > currentRankIndex ? 1 : -1;
      selectRank(index, true, dir);
    });
    tabsWrap.appendChild(btn);
  });

  // 1b. Rank medallion between the details and the 50:50 rule
  const inner = document.getElementById('rankCardInner');
  if (inner) mountRankEmblem(inner, inner.querySelector('.rank-leg-meter'), RANK_DATA.length);

  // 1c. One tick per tier on the slider track
  const track = document.querySelector<HTMLElement>('.rank-slider-track');
  if (track && !track.querySelector('.rank-slider-tick')) {
    RANK_DATA.forEach((_, i) => {
      const t = document.createElement('span');
      t.className = 'rank-slider-tick';
      t.style.left = `${(i / (RANK_DATA.length - 1)) * 100}%`;
      track.appendChild(t);
    });
  }

  // 2. Setup Slider Navigation Track & Prev/Next Arrows
  setupSliderNav();

  // 3. Setup 3D Gyroscopic Cursor Parallax on Card
  setupCard3DParallax(card);

  // 4. Initial Render
  renderRankData(RANK_DATA[0]);
  updateSliderProgress(0);

  // 5. Start Auto-Cycle ONLY when #ranks section is actively in viewport
  const ranksSection = document.getElementById('ranks');
  if (ranksSection && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startAutoCycle();
          } else {
            stopAutoCycle();
          }
        });
      },
      { threshold: 0.15 }
    );
    // watch the card, not the whole section: on phones #ranks is several screens
    // tall and a 15% threshold on it was never reached, so the tour never ran
    obs.observe(card);
  }

  card.addEventListener('mouseenter', stopAutoCycle);
  card.addEventListener('mouseleave', () => {
    if (ranksSection) {
      const rect = ranksSection.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        startAutoCycle();
      }
    }
  });
  tabsWrap.addEventListener('mouseenter', stopAutoCycle);
  tabsWrap.addEventListener('mouseleave', () => {
    if (ranksSection) {
      const rect = ranksSection.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        startAutoCycle();
      }
    }
  });
}

/**
 * Selects a rank with City of Mist 3D card deal & flip motion
 */
export function selectRank(index: number, userClicked = false, direction = 1): void {
  if (index < 0 || index >= RANK_DATA.length) return;
  if (index === currentRankIndex && !userClicked) return;

  const prevIndex = currentRankIndex;
  currentRankIndex = index;
  const rank = RANK_DATA[index];

  // Update tabs active state
  const buttons = document.querySelectorAll<HTMLElement>('.rank-tab-btn');
  buttons.forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });

  // Smoothly scroll active tab within the horizontal tabs container only (never touches window scroll)
  const activeBtn = buttons[index];
  const tabsWrap = document.getElementById('rankTabs');
  if (tabsWrap && activeBtn) {
    const scrollLeft = activeBtn.offsetLeft - (tabsWrap.clientWidth / 2) + (activeBtn.clientWidth / 2);
    tabsWrap.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  }

  // Update slider track progress
  updateSliderProgress(index);

  // Trigger City of Mist 3D Card Animation
  animateCardTransition(rank, direction || (index >= prevIndex ? 1 : -1));

  if (userClicked) {
    stopAutoCycle();
    // Restart cycle after 10s of inactivity
    setTimeout(startAutoCycle, 10000);
  }
}

/**
 * City of Mist 3D Game Card Transition (Deal, Flip & Holographic Sheen)
 */
function animateCardTransition(rank: RankTier, direction: number): void {
  const card = document.getElementById('rankDisplayCard');
  const inner = document.getElementById('rankCardInner');
  const holoSheen = document.getElementById('rankHoloSheen');
  const aura = document.getElementById('rankCardAura');
  if (!card) return;

  isAnimating = true;

  // Tier color assignment
  const tierColor = getTierColor(rank.id);
  card.style.setProperty('--card-beam-col', tierColor.primary);
  if (aura) {
    aura.style.background = `radial-gradient(circle, ${tierColor.primary} 0%, transparent 70%)`;
  }

  // a new rank cancels the running transition so nothing is left half-faded
  const detailTargets = card.querySelectorAll<HTMLElement>(
    '.rank-qualified-tag, .rank-big-reward, #rankDisplayTitle, #rankDisplayDesc, .btn-rank-qualify, .rank-leg-meter > *'
  );
  cardTl?.kill();
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    onComplete: () => {
      isAnimating = false;
      gsap.set([card, inner], { clearProps: 'transform,filter' });
      gsap.set(detailTargets, { clearProps: 'transform,opacity,filter' });
    },
  });
  cardTl = tl;

  // 1. Tilt away Phase (Out)
  tl.to(card, {
    rotateY: direction * -12,
    x: direction * -28,
    scale: 0.965,
    opacity: 0.35,
    filter: 'brightness(0.8)',
    duration: 0.22,
    ease: 'power2.in',
  });

  // 2. Midpoint: Update all content values
  tl.add(() => {
    renderRankData(rank);
  });

  // 3. Deal in Phase (In with elastic game-card snap)
  tl.fromTo(
    card,
    {
      rotateY: direction * 14,
      x: direction * 32,
      scale: 0.955,
      opacity: 0.3,
      filter: 'brightness(1.25)',
    },
    {
      rotateY: 0,
      x: 0,
      scale: 1,
      opacity: 1,
      filter: 'brightness(1)',
      duration: 0.5,
      ease: 'back.out(1.3)',
    }
  );

  // 4. Bring the new rank details in as a coordinated reveal instead of
  // replacing text abruptly. This keeps Starter → Builder → Leader changes
  // readable on both desktop and mobile.
  // (no blur here: blurred text read as broken on phones)
  if (detailTargets.length) {
    tl.fromTo(
      detailTargets,
      { y: 14, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.42, stagger: 0.05, ease: 'power3.out' },
      '-=0.2'
    );
  }

  // 5. Holographic Laser Sheen Sweep across Card Surface
  if (holoSheen) {
    tl.fromTo(
      holoSheen,
      { xPercent: -130, opacity: 0.9 },
      { xPercent: 230, opacity: 0, duration: 0.75, ease: 'power2.out' },
      '-=0.45'
    );
  }

  // 6. Animate 50:50 Leg Split Bars expanding
  const legPower = card.querySelector('.leg-power') as HTMLElement;
  const legOther = card.querySelector('.leg-other') as HTMLElement;
  if (legPower && legOther) {
    tl.fromTo([legPower, legOther], { width: '0%' }, { width: '50%', duration: 0.8, ease: 'power3.out', stagger: 0.12 }, '-=0.45');
    tl.fromTo(card.querySelector('.leg-split-bar'), { '--sweep': '-30%' }, { '--sweep': '130%', duration: 0.9, ease: 'power2.inOut' }, '-=0.3');
    tl.add(() => card.querySelector('.leg-total-row')?.classList.add('is-pulse'), '-=0.2');
    card.querySelector('.leg-total-row')?.classList.remove('is-pulse');
  }
}

/**
 * Populates DOM elements with rank values
 */
function renderRankData(rank: RankTier): void {
  const titleEl = document.getElementById('rankDisplayTitle');
  const rewardEl = document.getElementById('rankDisplayReward');
  const descEl = document.getElementById('rankDisplayDesc');
  const daoEl = document.getElementById('rankDisplayDao');
  const legPowerEl = document.getElementById('rankPowerLegVal');
  const legOtherEl = document.getElementById('rankOtherLegVal');

  if (titleEl) titleEl.textContent = `${rank.id}. ${rank.title}`;
  if (descEl) descEl.textContent = rank.desc;
  if (daoEl) daoEl.textContent = `${rank.dao.toLocaleString()} DAO`;
  const daoRoll = (el: HTMLElement | null, to: number) => {
    if (!el) return;
    const o = { v: 0 };
    gsap.to(o, { v: to, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = `${(Math.round(o.v * 10) / 10).toLocaleString()} DAO`; } });
  };
  daoRoll(legPowerEl, rank.powerLeg);
  daoRoll(legOtherEl, rank.otherLegs);

  if (rewardEl) {
    animateCountUp(rewardEl, rank.reward);
    rewardEl.classList.remove('is-shine');
    void rewardEl.offsetWidth;
    rewardEl.classList.add('is-shine');
  }
  updateRankEmblem(Math.max(0, RANK_DATA.indexOf(rank)));
  document.querySelectorAll<HTMLElement>('.rank-slider-tick').forEach((t, i) => t.classList.toggle('is-done', i <= RANK_DATA.indexOf(rank)));
}

/**
 * High-speed digital ticker count-up for qualified reward
 */
function animateCountUp(target: HTMLElement, finalValue: number): void {
  const obj = { val: 0 };
  gsap.to(obj, {
    val: finalValue,
    duration: 0.65,
    ease: 'power3.out',
    onUpdate: () => {
      target.textContent = `$${Math.round(obj.val).toLocaleString()}`;
    },
  });
}

/**
 * 3D Gyroscopic Cursor Parallax on the Game Card
 */
function setupCard3DParallax(card: HTMLElement): void {
  const glare = document.getElementById('rankInteractiveGlare');

  card.addEventListener('mousemove', (e: MouseEvent) => {
    if (isAnimating) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotX = ((y / rect.height) - 0.5) * -12;
    const rotY = ((x / rect.width) - 0.5) * 14;

    gsap.to(card, {
      rotateX: rotX,
      rotateY: rotY,
      transformPerspective: 1200,
      duration: 0.25,
      ease: 'power1.out',
      overwrite: 'auto',
    });

    if (glare) {
      glare.style.opacity = '1';
      glare.style.background = `radial-gradient(circle 380px at ${x}px ${y}px, rgba(255, 255, 255, 0.16) 0%, rgba(255, 184, 0, 0.08) 45%, transparent 75%)`;
    }
  });

  card.addEventListener('mouseleave', () => {
    gsap.to(card, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.65,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    if (glare) {
      glare.style.opacity = '0';
    }
  });
}

/**
 * Navigation Slider & Prev/Next Arrow Buttons
 */
function setupSliderNav(): void {
  const prevBtn = document.getElementById('rankPrevBtn');
  const nextBtn = document.getElementById('rankNextBtn');
  const track = document.querySelector('.rank-slider-track') as HTMLElement;

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const target = (currentRankIndex - 1 + RANK_DATA.length) % RANK_DATA.length;
      selectRank(target, true, -1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const target = (currentRankIndex + 1) % RANK_DATA.length;
      selectRank(target, true, 1);
    });
  }

  // Click directly on slider track to jump
  if (track) {
    track.addEventListener('click', (e: MouseEvent) => {
      const rect = track.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetIndex = Math.round(clickRatio * (RANK_DATA.length - 1));
      const dir = targetIndex >= currentRankIndex ? 1 : -1;
      selectRank(targetIndex, true, dir);
    });
  }
}

/**
 * Updates slider fill and thumb position
 */
function updateSliderProgress(index: number): void {
  const fill = document.getElementById('rankSliderFill');
  const thumb = document.getElementById('rankSliderThumb');
  const pct = (index / Math.max(1, RANK_DATA.length - 1)) * 100;

  if (fill) {
    fill.style.width = `${pct}%`;
  }
  if (thumb) {
    thumb.style.left = `${pct}%`;
  }
}

/**
 * Auto-tour cycle through the 11 tiers
 */
function startAutoCycle(): void {
  stopAutoCycle();
  rankInterval = setInterval(() => {
    const nextIdx = (currentRankIndex + 1) % RANK_DATA.length;
    selectRank(nextIdx, false, 1);
  }, 6500);
}

function stopAutoCycle(): void {
  if (rankInterval) {
    clearInterval(rankInterval);
    rankInterval = null;
  }
}

/**
 * Color palettes for tier milestones
 */
function getTierColor(id: number): { primary: string; secondary: string } {
  if (id <= 2) return { primary: '#d4af37', secondary: '#fff4b2' }; // Starter / Builder
  if (id <= 4) return { primary: '#f0d777', secondary: '#ffffff' }; // Leader / Elite
  if (id <= 7) return { primary: '#d4af37', secondary: '#ffffff' }; // Executive / Director
  return { primary: '#fff4b2', secondary: '#d4af37' }; // Apex Crown Ambassador / President
}
