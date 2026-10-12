/**
 * DAOvault AI — Interactive Leadership Rank Milestone Calculator
 * Allows users to simulate their expected team DAO volume and dynamically
 * view their unlocked leadership rank, instant cash reward, and cumulative payouts.
 */

import { gsap } from 'gsap';
import { RANK_DATA, selectRank } from './rankGameCard.ts';
import { getRankCrestSvg, RANK_CREST_METAS } from './rankCrests.ts';

export function initRankCalculator(): void {
  const slider = document.getElementById('rcalcSlider') as HTMLInputElement | null;
  const teamInput = document.getElementById('rcalcTeamInput') as HTMLInputElement | null;
  if (!slider) return;

  const sliderVal = document.getElementById('rcalcSliderVal');
  const rankTitle = document.getElementById('rcalcProjectedRank');
  const rankTier = document.getElementById('rcalcRankTier');
  const rewardVal = document.getElementById('rcalcRewardVal');
  const cumVal = document.getElementById('rcalcCumulativeVal');
  const nextTarget = document.getElementById('rcalcNextTarget');
  const crestPreview = document.getElementById('rcalcCrestPreview');
  const stepMinus = document.getElementById('rcalcStepMinus');
  const stepPlus = document.getElementById('rcalcStepPlus');

  // Pre-calculate cumulative rewards for each rank
  const cumulativeRewards: number[] = [];
  let runningTotal = 0;
  for (const rank of RANK_DATA) {
    runningTotal += rank.reward;
    cumulativeRewards.push(runningTotal);
  }

  // Interactive 360-degree spin on the 3D crest preview
  const spinPreviewCrest = () => {
    if (!crestPreview) return;
    try { navigator.vibrate?.(20); } catch { /* no vibration */ }
    const svg = crestPreview.querySelector('svg');
    if (svg) {
      gsap.fromTo(svg, { rotateY: 0 }, { rotateY: 360, duration: 1.0, ease: 'back.out(1.4)', clearProps: 'transform' });
      gsap.fromTo(svg, { scale: 1 }, { scale: 1.15, duration: 0.35, yoyo: true, repeat: 1, ease: 'power2.out' });
    }
  };

  if (crestPreview) {
    crestPreview.addEventListener('click', spinPreviewCrest);
    crestPreview.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        spinPreviewCrest();
      }
    });
  }

  const updateFromVolume = (volume: number, syncCard = true, updateInput = true): void => {
    const safeVol = Math.max(0, volume);
    if (slider) {
      slider.value = String(safeVol);
      // gold fill up to the thumb (CSS --fill)
      const max = Number(slider.max) || 1;
      slider.style.setProperty('--fill', `${Math.min(100, (safeVol / max) * 100)}%`);
    }
    if (updateInput && teamInput) {
      teamInput.value = String(safeVol * 2);
    }
    if (sliderVal) sliderVal.textContent = `${safeVol.toLocaleString()} DAO / side`;

    // Find highest rank achieved where rank.dao <= volume
    let achievedIndex = -1;
    for (let i = RANK_DATA.length - 1; i >= 0; i--) {
      if (safeVol >= RANK_DATA[i].dao) {
        achievedIndex = i;
        break;
      }
    }

    if (achievedIndex >= 0) {
      const rank = RANK_DATA[achievedIndex];
      const meta = RANK_CREST_METAS[achievedIndex] || RANK_CREST_METAS[0];
      if (rankTitle) rankTitle.textContent = `${rank.id}. ${rank.title}`;
      if (rankTier) rankTier.textContent = `Rank ${String(rank.id).padStart(2, '0')} of 11 • ${meta.metal}`;
      if (rewardVal) rewardVal.textContent = `$${rank.reward.toLocaleString()}.00`;
      if (cumVal) cumVal.textContent = `$${cumulativeRewards[achievedIndex].toLocaleString()}.00`;

      // Update 3D Crest SVG preview
      if (crestPreview) {
        crestPreview.innerHTML = getRankCrestSvg(achievedIndex);
        crestPreview.setAttribute('title', `Click to spin 3D ${rank.title} Crest (360°)`);
      }

      // Next rank target
      if (achievedIndex < RANK_DATA.length - 1) {
        const next = RANK_DATA[achievedIndex + 1];
        const needed = next.dao - safeVol;
        if (nextTarget) nextTarget.textContent = `Next: ${next.title} (needs +${needed.toLocaleString()} DAO on each side)`;
      } else {
        if (nextTarget) nextTarget.textContent = `Top rank reached: Crown President`;
      }

      if (syncCard) {
        selectRank(achievedIndex, false);
      }
    } else {
      // Below Starter (0 to 24 DAO)
      if (rankTitle) rankTitle.textContent = 'No rank yet';
      if (rankTier) rankTier.textContent = 'Rank 00 of 11';
      if (rewardVal) rewardVal.textContent = '$0.00';
      if (cumVal) cumVal.textContent = '$0.00';
      const needed = 25 - safeVol;
      if (nextTarget) nextTarget.textContent = `Next: Starter (needs +${needed} DAO on each side, $150 reward)`;

      if (crestPreview) {
        crestPreview.innerHTML = getRankCrestSvg(0);
      }
    }
  };

  // Slider change -> sync team input & calculate
  slider.addEventListener('input', () => {
    const val = parseInt(slider.value, 10) || 0;
    updateFromVolume(val, true, true);
  });

  // Direct Team Size input -> sync slider & calculate
  if (teamInput) {
    teamInput.addEventListener('input', () => {
      const team = parseInt(teamInput.value, 10) || 0;
      const vol = Math.floor(team / 2);
      updateFromVolume(vol, true, false);
    });
  }

  // Stepper buttons
  if (stepMinus) {
    stepMinus.addEventListener('click', () => {
      const currentTeam = parseInt(teamInput?.value || slider.value, 10) || 0;
      const newTeam = Math.max(0, currentTeam - 50);
      if (teamInput) teamInput.value = String(newTeam);
      updateFromVolume(Math.floor(newTeam / 2), true, false);
    });
  }

  if (stepPlus) {
    stepPlus.addEventListener('click', () => {
      const currentTeam = parseInt(teamInput?.value || slider.value, 10) || 0;
      const newTeam = currentTeam + 50;
      if (teamInput) teamInput.value = String(newTeam);
      updateFromVolume(Math.floor(newTeam / 2), true, false);
    });
  }

  // Preset quick-jump buttons
  document.querySelectorAll<HTMLButtonElement>('[data-rcalc-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetDao = parseInt(btn.dataset.rcalcSet || '25', 10);
      updateFromVolume(targetDao, true, true);
    });
  });

  // Initial calculation
  updateFromVolume(parseInt(slider.value, 10) || 25, false, true);
}

