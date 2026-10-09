/**
 * DAOvault AI — Dashboard motion layer (TPR World member-area patterns, gold palette)
 * - Cards cascade in once the loader clears
 * - Numbers roll from what is on screen to each new value
 * - A soft light follows the pointer across every glass card
 * - Small 3D objects live in the four metric cards
 * - A gold confetti burst celebrates on-chain activation
 */

import * as THREE from 'three';
import { hasWebGL } from './core.ts';
import { LITE } from './perf.ts';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ entrance */

const REVEAL_SELECTORS = [
  '.dash-header',
  '.metrics-grid > .metric-card',
  '.dash-shell .rewards-card',
  '.dash-shell .border-beam-card',
  '.dash-shell .ref-box-card',
  '.dash-content-grid > div > .glass',
];

/** Hides the dashboard cards until revealDashboard() runs (called before the loader clears). */
export function prepareDashboardReveal(): void {
  if (reduceMotion()) return;
  document.querySelectorAll<HTMLElement>(REVEAL_SELECTORS.join(',')).forEach((el, i) => {
    el.classList.add('fx-pre');
    el.style.setProperty('--fx-i', String(i));
  });
}

export function revealDashboard(): void {
  const items = document.querySelectorAll<HTMLElement>('.fx-pre');
  items.forEach((el) => {
    el.classList.add('fx-in');
    const delay = Math.min(Number(el.style.getPropertyValue('--fx-i')) * 70, 700);
    window.setTimeout(() => {
      el.classList.remove('fx-pre', 'fx-in');
      el.style.removeProperty('--fx-i');
    }, delay + 1000);
  });
}

/* ------------------------------------------------------------------ numbers */

type RollEl = HTMLElement & { _rollRaf?: number; _rollShown?: number };

/**
 * Rolls an element's number from the value currently shown to `to`
 * (cubic ease-out). A newer value arriving mid-roll takes over.
 */
export function rollNumber(el: HTMLElement | null, to: number, format: (n: number) => string, ms?: number): void {
  if (!el) return;
  const node = el as RollEl;
  const from = node._rollShown ?? 0;
  if (node._rollRaf) cancelAnimationFrame(node._rollRaf);
  if (reduceMotion() || from === to) {
    node._rollShown = to;
    node.textContent = format(to);
    return;
  }
  node.classList.remove('fx-bump');
  void node.offsetWidth;
  node.classList.add('fx-bump');
  const duration = ms ?? Math.min(1600, 600 + Math.abs(to - from) * 2);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const v = t < 1 ? from + (to - from) * (1 - Math.pow(1 - t, 3)) : to;
    node._rollShown = v;
    node.textContent = format(v);
    if (t < 1) node._rollRaf = requestAnimationFrame(step);
  };
  node._rollRaf = requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ spotlight */

/** Drives the .glass rim light (--mouse-x / --mouse-y) from one pointer listener. */
export function initCardSpotlight(): void {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let lastCard: HTMLElement | null = null;
  document.addEventListener('pointermove', (e) => {
    const card = (e.target as Element | null)?.closest<HTMLElement>('.glass, .border-beam-card') ?? null;
    if (lastCard && lastCard !== card) {
      lastCard.style.setProperty('--mouse-x', '-999px');
      lastCard.style.setProperty('--mouse-y', '-999px');
    }
    lastCard = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
  }, { passive: true });
}

/* ------------------------------------------------------------------ 3D metric icons */

type IconKind = 'network' | 'coin' | 'infinity' | 'trophy';

function goldMaterial(emissive = 0x3a2a05, intensity = 0.45): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.22, emissive, emissiveIntensity: intensity });
}

function buildIcon(kind: IconKind, root: THREE.Group): (t: number, speed: number) => void {
  if (kind === 'network') {
    // two interlocking links with a spark orbiting their junction
    const geo = new THREE.TorusGeometry(0.78, 0.2, 18, 40);
    const a = new THREE.Mesh(geo, goldMaterial());
    a.position.set(-0.36, 0.12, 0);
    a.rotation.set(0.2, 0.3, Math.PI * 0.25);
    const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xfff1c1, metalness: 0.7, roughness: 0.2, emissive: 0x5a4512, emissiveIntensity: 0.4 }));
    b.position.set(0.36, -0.12, 0);
    b.rotation.set(Math.PI * 0.5 + 0.2, 0.3, Math.PI * 0.25);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    root.add(a, b, spark);
    root.rotation.x = 0.35;
    return (t, speed) => {
      root.rotation.y += 0.022 * speed;
      root.position.y = Math.sin(t * 2.2) * 0.1;
      const ang = t * 3 * speed;
      spark.position.set(Math.cos(ang) * 0.95, Math.sin(ang * 1.5) * 0.5, Math.sin(ang) * 0.95);
    };
  }

  if (kind === 'coin') {
    // a minted gold coin that flips and glints
    const coin = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.24, 48), goldMaterial(0x4a3306, 0.5));
    face.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 10, 48), goldMaterial(0x6b4c0a, 0.7));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xfff4c8 }));
    inner.position.z = 0.13;
    const inner2 = inner.clone();
    inner2.position.z = -0.13;
    coin.add(face, rim, inner, inner2);
    root.add(coin);
    return (t, speed) => {
      coin.rotation.y += 0.035 * speed;
      coin.position.y = Math.sin(t * 2.4) * 0.12;
    };
  }

  if (kind === 'infinity') {
    // the 25x cap: an endless knot that reads as "infinity"
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.72, 0.2, 96, 12, 2, 3), goldMaterial(0x4a3306, 0.55));
    root.add(knot);
    return (t, speed) => {
      knot.rotation.y += 0.02 * speed;
      knot.rotation.x = Math.sin(t * 1.3) * 0.3;
      (knot.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + Math.sin(t * 3) * 0.2;
    };
  }

  // trophy: cup, handles, stem, base and a floating gem
  const mat = goldMaterial(0xd97706, 0.5);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 1.1, 20), mat);
  cup.position.y = 0.35;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 10, 24), new THREE.MeshBasicMaterial({ color: 0xfff9c4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.9;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 12), mat);
  stem.position.y = -0.4;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.35, 20), mat);
  base.position.y = -0.75;
  const handleGeo = new THREE.TorusGeometry(0.35, 0.08, 8, 16, Math.PI);
  const handleL = new THREE.Mesh(handleGeo, mat);
  handleL.position.set(-0.75, 0.35, 0);
  handleL.rotation.z = Math.PI / 2;
  const handleR = new THREE.Mesh(handleGeo, mat);
  handleR.position.set(0.75, 0.35, 0);
  handleR.rotation.z = -Math.PI / 2;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xfffbeb }));
  gem.position.y = 1.22;
  root.add(cup, rim, stem, base, handleL, handleR, gem);
  root.rotation.x = 0.2;
  return (t, speed) => {
    root.rotation.y += 0.022 * speed;
    root.position.y = Math.sin(t * 2.5) * 0.08;
    gem.rotation.y -= 0.04 * speed;
    gem.position.y = 1.22 + Math.sin(t * 3.5) * 0.06;
    mat.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.15;
  };
}

/**
 * Puts a small animated 3D object in each metric card's icon slot:
 * directs → linked rings, earned → gold coin, cap → infinity knot, rank → trophy.
 * Each renders only while its card is on screen; hovering speeds it up and tilts it.
 */
export function initMetricIcons3D(): void {
  // phones keep the plain gold glyphs: four extra WebGL renderers are too heavy there
  if (!hasWebGL() || reduceMotion() || LITE) return;
  const kinds: IconKind[] = ['network', 'coin', 'infinity', 'trophy'];
  document.querySelectorAll<HTMLElement>('.metrics-grid .metric-card').forEach((card, idx) => {
    const slot = card.querySelector<HTMLElement>('.metric-icon');
    if (!slot || slot.querySelector('canvas')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'metric-3d-icon';
    slot.appendChild(canvas);
    slot.classList.add('has-3d');

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      canvas.remove();
      slot.classList.remove('has-3d');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(46, 46, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.set(0, 0, 5.2);
    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const key = new THREE.DirectionalLight(0xfff1c1, 2.4);
    key.position.set(2, 4, 3);
    scene.add(key);
    const warm = new THREE.PointLight(0xffd76a, 2.2, 8);
    warm.position.set(-1.5, 0.5, 2.5);
    scene.add(warm);

    const root = new THREE.Group();
    scene.add(root);
    const update = buildIcon(kinds[idx] ?? 'network', root);

    let hovered = false;
    let visible = true;
    // mouse only: a finger dragging over the card (while scrolling) twisted the icon
    card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') hovered = true; });
    card.addEventListener('pointerleave', () => { hovered = false; scene.rotation.set(0, 0, 0); });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = card.getBoundingClientRect();
      scene.rotation.y = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
      scene.rotation.x = -((e.clientY - r.top) / r.height - 0.5) * 0.7;
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(card);
    }

    let t = Math.random() * 10;
    const loop = () => {
      requestAnimationFrame(loop);
      if (document.hidden || !visible) return;
      t += 0.016;
      update(t, hovered ? 2.5 : 1);
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
  });
}

/* ------------------------------------------------------------------ celebration */

/** A short burst of gold confetti from an element (or the screen centre). */
export function celebrate(from?: HTMLElement | null, count = 110): void {
  if (reduceMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const r = from?.getBoundingClientRect();
  const ox = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const oy = r ? r.top + r.height / 2 : window.innerHeight / 2;
  const colors = ['#fff4b2', '#ffd76a', '#d4af37', '#ffffff', '#b8860b'];
  const bits = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      w: 4 + Math.random() * 6, h: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      c: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const start = performance.now();
  const step = (now: number) => {
    const age = (now - start) / 1000;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1) / 0.8);
    bits.forEach((b) => {
      b.vy += 0.35;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot * 2)));
      ctx.restore();
    });
    if (age < 1.8) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}
