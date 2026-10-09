/**
 * DAOvault AI — Matrix Stacking Deck UI Controller
 * Synchronizes tabs, dots, pipeline flow, and simulator inspection buttons
 * with the ScrollTrigger 3D Stacking Deck.
 * Zero auto-timers, zero unwanted scroll jumps.
 */

import { ScrollTrigger } from 'gsap/ScrollTrigger';

let currentActiveTier = 0;

/**
 * Matrix payouts are derived from the package amount instead of being
 * duplicated as magic numbers in the card UI. The default is the package
 * described in project.md and can be changed on #levelMatrixGrid with
 * data-package-price="..." when the value comes from the API.
 */
// potentialMultiplier = theoretical members at those levels if every member brings 10 directs
const MATRIX_TIERS = [
  { commission: 0.10, potentialMultiplier: 1 },
  { commission: 0.05, potentialMultiplier: 100 },          // L2: 10 x 10 members
  { commission: 0.03, potentialMultiplier: 11_000 },       // L3 + L4: 1,000 + 10,000
  { commission: 0.02, potentialMultiplier: 11_100_000 },   // L5-L7: 10^5 + 10^6 + 10^7
  { commission: 0.01, potentialMultiplier: 13 },
] as const;

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Refreshes all money figures in the visible matrix cards from one base price. */
function syncMatrixMoney(deck: HTMLElement): void {
  const packagePrice = Number(deck.dataset.packagePrice || 300);
  if (!Number.isFinite(packagePrice) || packagePrice <= 0) return;

  const cards = Array.from(deck.querySelectorAll<HTMLElement>('.matrix-stack-card'));
  cards.forEach((card, index) => {
    const tier = MATRIX_TIERS[index];
    if (!tier) return;

    const commissionValue = packagePrice * tier.commission;
    const pillValue = card.querySelector<HTMLElement>('.cypheir-pill strong');
    if (pillValue) pillValue.textContent = money(commissionValue);

    const metaValue = card.querySelector<HTMLElement>('.cypheir-meta-cluster .meta-v');
    if (metaValue && index > 0 && index < cards.length - 1) {
      const potential = commissionValue * tier.potentialMultiplier;
      // millions in short form so the card stays one line: $66.6M USDT
      metaValue.textContent = potential >= 1_000_000
        ? `$${(potential / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M USDT`
        : `${money(potential)} USDT`;
    }

    card.style.setProperty('--matrix-package-price', String(packagePrice));
  });
}

/**
 * Updates UI indicators (tabs, dots, pipeline, cards) to match active tier
 */
export function setActiveTier(index: number, smoothScroll = false): void {
  const cards = document.querySelectorAll<HTMLElement>('.matrix-stack-card');
  const tabs = document.querySelectorAll<HTMLElement>('.matrix-tab-pill');
  const dots = document.querySelectorAll<HTMLElement>('.matrix-carousel-dots .dot');
  const pipelineLabels = document.querySelectorAll<HTMLElement>('.pipeline-labels span');

  if (!cards.length) return;
  currentActiveTier = Math.max(0, Math.min(index, cards.length - 1));

  // Update card active classes
  cards.forEach((card, i) => {
    card.classList.toggle('active', i === currentActiveTier);
  });

  // Update tabs
  tabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === currentActiveTier);
  });

  // Update dots
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentActiveTier);
  });

  // Update pipeline flow step
  pipelineLabels.forEach((label, i) => {
    label.classList.toggle('step-active', i === currentActiveTier);
  });

  // Smoothly scroll to the target tier on ScrollTrigger if user clicked tab/dot
  if (smoothScroll) {
    const st = ScrollTrigger.getById('matrixDeckST');
    if (st) {
      const targetScroll = st.start + (currentActiveTier / Math.max(cards.length - 1, 1)) * (st.end - st.start);
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }
}

/**
 * Initializes tab, dot, and simulator inspection interactions
 */
export function initMatrixAutoDeck(): void {
  const deck = document.getElementById('levelMatrixGrid');
  if (!deck) return;

  syncMatrixMoney(deck);

  const tabs = document.querySelectorAll<HTMLElement>('.matrix-tab-pill');
  const dots = document.querySelectorAll<HTMLElement>('.matrix-carousel-dots .dot');

  // Initial state: Tier 1 active
  setActiveTier(0, false);

  // 1. Tab click listeners
  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      setActiveTier(idx, true);
    });
  });

  // 2. Dots click listeners
  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      setActiveTier(idx, true);
    });
  });

  // 3. Simulator Inspect Buttons
  const simButtons = deck.querySelectorAll<HTMLButtonElement>('.btn-tier-inspect');
  simButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetLvl = btn.getAttribute('data-sim-target');
      if (targetLvl) {
        const pills = document.querySelectorAll<HTMLButtonElement>('.level-pill-btn');
        const targetBtn = Array.from(pills).find((b) => b.textContent?.trim() === `L${targetLvl}`);
        if (targetBtn) {
          targetBtn.click();
          const simBox = document.querySelector('.matrix-calc-box');
          simBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  });
}
