/**
 * DAOvault AI — Matrix Plan Interactive Enhancements
 * 25× Cap & Re-Topup Cycle Explainer (Infinite Earning Engine)
 * Explains why platform is 100% sustainable: $300 Entry -> Earn up to $7,500 -> Manual $300 Re-Topup -> Next $7,500 Cycle.
 */

import { gsap } from 'gsap';

export function initMatrixVisualizer(): void {
  initRetopupCycle();
}

/**
 * 25× Cap & Re-Topup Infinite Cycle Engine
 */
function initRetopupCycle(): void {
  const triggerBtn = document.getElementById('retopupSimulateBtn');
  const meterFill = document.getElementById('retopupMeterFill');
  const meterVal = document.getElementById('retopupMeterVal');
  const cycleCountBadge = document.getElementById('retopupCycleBadge');
  const capAlert = document.getElementById('retopupCapAlert');
  const statusPill = document.getElementById('retopupStatusPill');
  const manualBuyPrompt = document.getElementById('retopupManualPrompt');
  const manualBuyBtn = document.getElementById('retopupManualBuyBtn');

  if (!triggerBtn || !meterFill || !meterVal) return;

  let currentCycle = 1;
  let isRunning = false;

  const stations = document.querySelectorAll<HTMLElement>('.cycle-station');

  const highlightStation = (stationIdx: number): void => {
    stations.forEach((st, idx) => {
      st.classList.toggle('is-active', idx === stationIdx);
    });
  };

  const runCycleSimulation = (): void => {
    if (isRunning) return;
    isRunning = true;
    triggerBtn.setAttribute('disabled', 'true');
    if (capAlert) capAlert.classList.remove('is-visible');
    if (manualBuyPrompt) manualBuyPrompt.classList.remove('is-visible');

    // Step 1: Entry Active
    highlightStation(0);
    if (statusPill) statusPill.textContent = `Package #${currentCycle} active · $300 entry`;

    // Step 2: Accumulating 20-Level Network Income
    highlightStation(1);
    const obj = { earnings: 0 };
    gsap.to(obj, {
      earnings: 7500,
      duration: 2.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        const pct = (obj.earnings / 7500) * 100;
        meterFill.style.width = `${pct}%`;
        meterVal.textContent = `$${Math.round(obj.earnings).toLocaleString()} / $7,500 USDT`;
      },
      onComplete: () => {
        // Step 3: 25x Cap Reached
        highlightStation(2);
        try { navigator.vibrate?.([30, 50, 30]); } catch { /* no vibration */ }
        if (capAlert) capAlert.classList.add('is-visible');
        if (statusPill) statusPill.textContent = `25× cap reached · $7,500 earned on this package`;

        // Step 4: Show Manual Re-Topup Option (No Auto-debits!)
        setTimeout(() => {
          highlightStation(3);
          if (manualBuyPrompt) manualBuyPrompt.classList.add('is-visible');
          if (statusPill) statusPill.textContent = `Ready for a $300 top-up from your wallet`;
        }, 800);
      },
    });
  };

  triggerBtn.addEventListener('click', runCycleSimulation);

  // Manual Buy Button Click -> Renew for next cycle without losing team
  if (manualBuyBtn) {
    manualBuyBtn.addEventListener('click', () => {
      try { navigator.vibrate?.(25); } catch { /* no vibration */ }
      currentCycle++;
      if (cycleCountBadge) cycleCountBadge.textContent = `PACKAGE #${currentCycle}`;
      if (capAlert) capAlert.classList.remove('is-visible');
      if (manualBuyPrompt) manualBuyPrompt.classList.remove('is-visible');
      triggerBtn.removeAttribute('disabled');

      // Reset progress to 0 for the fresh $7,500 room
      meterFill.style.width = '0%';
      meterVal.textContent = '$0 / $7,500 USDT';
      if (statusPill) statusPill.textContent = `Package #${currentCycle} active · new $7,500 cap · same ID and team`;
      highlightStation(0);

      gsap.fromTo(meterFill, { opacity: 0.3 }, { opacity: 1, duration: 0.4 });
      isRunning = false;
    });
  }
}
