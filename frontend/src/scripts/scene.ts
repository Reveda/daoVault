/**
 * DAOvault AI — Soothing 3D Visual Architecture (TypeScript / Three.js)
 * 1. Background: morphing particle cloud, one shape per section (see particleScene.ts)
 * 2. Official 3D Animated DAOvault Logo Emblem:
 *    - Polished 24K Gold Beveled Hexagonal Cyber Vault Frame
 *    - Inset Neon Cyan Cyber Energy Channels
 *    - Rotating Concentric Mechanical Vault Cog Dial
 *    - Sculpted 3D "DV" Monogram Emblem with Pulsing AI Core Diamond
 *    - Rising Golden Sparks, with the official logo animation at its centre
 *    - Multi-Source Studio Lighting & Interactive Mouse Parallax Tilt
 */

import { hasWebGL } from './core.ts';
import { mountDvLogo } from './dvLogo.ts';
import { createParticleScene, bindSectionScenes, type ParticleSceneController } from './particleScene.ts';

/**
 * 1. Background scene (#sceneCanvas): the TPR-style morphing particle cloud.
 * Each [data-scene] section re-forms the cloud into its own shape; pages with
 * no sections (the dashboard) drive it through the returned controller.
 */
export function init3DScene(initialScene = 'hero'): ParticleSceneController | null {
  const canvas = document.getElementById('sceneCanvas') as HTMLCanvasElement | null;
  if (!canvas || !hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    return null;
  }

  let flashEl = document.getElementById('sceneFlash');
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.id = 'sceneFlash';
    flashEl.className = 'scene-flash';
    flashEl.setAttribute('aria-hidden', 'true');
    canvas.insertAdjacentElement('afterend', flashEl);
  }

  const ctrl = createParticleScene(canvas, { scene: initialScene, flashEl });
  if (ctrl) bindSectionScenes(ctrl);
  if (ctrl && initialScene === 'hero') heroShowcase(ctrl);
  if (import.meta.env.DEV) (window as unknown as { __daovaultScene?: unknown }).__daovaultScene = ctrl;
  return ctrl;
}

/**
 * Hero background (owner, 2026-10-09): a lightning burst as the site opens, then, while the
 * hero is on screen, the particle cloud re-forms every 6s - DAOVAULT logo -> DV mark ->
 * vault dial - like the shapes behind the other sections (setScene strikes on each change).
 * Uses the existing particle canvas; nothing runs once another section has the cloud.
 */
const HERO_CYCLE = ['hero', 'heroMark', 'heroDial'];
const HERO_CYCLE_MS = 6000;

function heroShowcase(ctrl: ParticleSceneController): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const burst = () => [0, 260, 640].forEach((ms) => window.setTimeout(() => ctrl.strike(), ms));

  // after the splash screen, so the visitor actually sees it
  const started = Date.now();
  const whenReady = () => {
    if (document.body.classList.contains('ready')) window.setTimeout(burst, 350);
    else if (Date.now() - started < 15000) window.setTimeout(whenReady, 200);
  };
  whenReady();

  window.setInterval(() => {
    if (document.hidden) return;
    const at = HERO_CYCLE.indexOf(ctrl.current);
    if (at < 0) return; // another section has the cloud
    ctrl.setScene(HERO_CYCLE[(at + 1) % HERO_CYCLE.length]);
  }, HERO_CYCLE_MS);
}

/**
 * 2. Hero logo (#heroCoreCanvas stage): the animated DAOVAULT logo (dvLogo.ts, pure CSS).
 * The old WebGL vault emblem was removed: it never showed any more and its renderer still
 * cost a GPU context on every visit (noticeable on phones).
 */
export function initHeroCore3D(): void {
  const canvas = document.getElementById('heroCoreCanvas');
  const container = canvas?.parentElement;
  if (!canvas || !container) return;
  canvas.remove();
  mountLogoVideo(container);
}

/**
 * Hero logo: the animated DAOVAULT logo (dvLogo.ts, a port of
 * public/DAOVault logo animation.html) replaces the old video in the brand lockup:
 * the gold DV emblem sways in 3D, the key turns and the vault door opens on a loop.
 * It is pure CSS, so it can't fail to play; the modelled 3D vault stays hidden.
 */
function mountLogoVideo(container: HTMLElement): void {
  const lockup = container.querySelector<HTMLElement>('.hero-brand-lockup');
  if (!lockup) return;

  const stage = document.createElement('span');
  stage.className = 'hero-logo-stage hero-logo-stage--anim';
  const logo = document.createElement('span');
  logo.className = 'hero-dv-logo';
  logo.setAttribute('aria-label', 'DAOVAULT logo');
  stage.appendChild(logo);
  lockup.prepend(stage);
  mountDvLogo(logo, { word: true });

  container.classList.add('has-video-logo', 'logo-playing');
}
