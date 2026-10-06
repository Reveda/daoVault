/**
 * DAOvault AI — Rank reward surprise box (TPR World's gift box, rebuilt for DAOvault)
 *
 * A black vault box with gold trim, ribbon and the DV mark drops in and idles.
 * Opening it: it shakes harder and harder while gold light charges inside, the
 * lid blows off, beams and sparks burst out, coins rise, and the reward counts
 * up. A sealed (locked) box only rattles and says what unlocks it, with an
 * optional preview of the opening. Nothing here pays anything: the reveal says
 * rewards are credited after on-chain verification.
 */

import * as THREE from 'three';
import { hasWebGL } from './core.ts';

export interface GiftBoxOptions {
  rank: string;
  reward: number;
  /** what unlocks it, e.g. "25 DAO team volume" */
  requirement: string;
  /** 'ready' opens for real, 'locked' rattles (with a preview option), 'opened' replays the reveal */
  mode: 'ready' | 'locked' | 'opened';
  /** called once the box has burst open (mode 'ready') */
  onOpened?: () => void;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

let overlay: HTMLElement | null = null;

function buildOverlay(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gift-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Rank reward box');
  el.innerHTML = `
    <div class="gift-rays" aria-hidden="true"></div>
    <div class="gift-stage">
      <button class="gift-close" type="button" aria-label="Close">&times;</button>
      <p class="gift-kicker mono"></p>
      <h3 class="gift-title"></h3>
      <canvas class="gift-canvas" aria-hidden="true"></canvas>
      <div class="gift-reveal" hidden>
        <span class="gift-reveal-label mono"></span>
        <span class="gift-amount">$0</span>
        <p class="gift-note"></p>
      </div>
      <div class="gift-actions"></div>
    </div>
    <div class="gift-flash" aria-hidden="true"></div>`;
  document.body.appendChild(el);
  return el;
}

/** the vault box, built in code: black body, gold trim and ribbon, DV mark on the front */
function makeBox(logo: THREE.Texture | null) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.22, emissive: 0x5a3f06, emissiveIntensity: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, metalness: 0.7, roughness: 0.35 });
  const box = new THREE.Group();

  const body = new THREE.Group();
  body.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), black));
  // gold frame along the body's edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.02, 1.62, 2.02)), new THREE.LineBasicMaterial({ color: 0xffe08a }));
  body.add(edges);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.62, 0.3), gold));
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.62, 2.04), gold));
  if (logo) {
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: logo, transparent: true }));
    front.position.set(0, 0.02, 1.025);
    body.add(front);
  }
  body.position.y = -0.3;
  box.add(body);

  const lid = new THREE.Group();
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.42, 2.18), black));
  lid.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 0.44, 2.2)), new THREE.LineBasicMaterial({ color: 0xffe08a })));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.44, 0.32), gold));
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 2.22), gold));
  const bowGeo = new THREE.TorusGeometry(0.32, 0.09, 10, 24);
  const bowL = new THREE.Mesh(bowGeo, gold);
  bowL.position.set(-0.28, 0.42, 0);
  bowL.rotation.set(Math.PI / 2.4, 0.5, 0);
  const bowR = bowL.clone();
  bowR.position.x = 0.28;
  bowR.rotation.y = -0.5;
  lid.add(bowL, bowR);
  lid.position.y = 0.72;
  box.add(lid);

  return { box, body, lid, gold };
}

export function openGiftBox(opts: GiftBoxOptions): void {
  overlay ??= buildOverlay();
  const el = overlay;
  const canvas = el.querySelector<HTMLCanvasElement>('.gift-canvas');
  const kicker = el.querySelector<HTMLElement>('.gift-kicker');
  const title = el.querySelector<HTMLElement>('.gift-title');
  const reveal = el.querySelector<HTMLElement>('.gift-reveal');
  const label = el.querySelector<HTMLElement>('.gift-reveal-label');
  const amount = el.querySelector<HTMLElement>('.gift-amount');
  const note = el.querySelector<HTMLElement>('.gift-note');
  const actions = el.querySelector<HTMLElement>('.gift-actions');
  const flash = el.querySelector<HTMLElement>('.gift-flash');
  if (!canvas || !kicker || !title || !reveal || !label || !amount || !note || !actions || !flash) return;

  kicker.textContent = opts.mode === 'locked' ? 'SEALED REWARD BOX' : 'RANK REWARD BOX';
  title.textContent = opts.rank;
  reveal.hidden = true;
  el.classList.remove('is-burst', 'is-locked-shake');
  actions.innerHTML = '';
  el.classList.add('show');
  document.body.classList.add('gift-open');

  let alive = true;
  let raf = 0;
  const cleanups: (() => void)[] = [];
  const close = () => {
    alive = false;
    cancelAnimationFrame(raf);
    cleanups.forEach((fn) => fn());
    el.classList.remove('show', 'is-burst', 'is-locked-shake');
    document.body.classList.remove('gift-open');
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  const closeBtn = el.querySelector<HTMLButtonElement>('.gift-close');
  if (closeBtn) closeBtn.onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };

  const button = (text: string, cls: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = text;
    b.onclick = onClick;
    actions.appendChild(b);
    return b;
  };

  const showReveal = (preview: boolean) => {
    reveal.hidden = false;
    label.textContent = preview ? `PREVIEW · ${opts.rank.toUpperCase()} REWARD` : `${opts.rank.toUpperCase()} REWARD`;
    note.textContent = preview
      ? `Unlocks at ${opts.requirement}. This was a preview: the box opens for real once you reach the rank.`
      : 'Reward unlocked. It is credited to your balance after on-chain rank verification.';
    // count the amount up
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      amount.textContent = money(opts.reward * (1 - Math.pow(1 - t, 3)));
      if (t < 1 && alive) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    actions.innerHTML = '';
    button(preview ? 'Got it' : 'Collect', 'btn-grad', close);
  };

  /* ---------- no WebGL / reduced motion: the reveal on its own */
  if (!hasWebGL() || reduceMotion()) {
    canvas.hidden = true;
    if (opts.mode === 'locked') {
      reveal.hidden = false;
      label.textContent = 'SEALED';
      amount.textContent = money(opts.reward);
      note.textContent = `Unlocks at ${opts.requirement}.`;
      button('Got it', 'btn-grad', close);
    } else {
      showReveal(false);
      if (opts.mode === 'ready') opts.onOpened?.();
    }
    return;
  }
  canvas.hidden = false;

  /* ---------- the 3D stage */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    canvas.hidden = true;
    showReveal(opts.mode === 'locked');
    return;
  }
  const size = () => {
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 300;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.1, 7.2);
  camera.lookAt(0, 0.2, 0);
  size();
  window.addEventListener('resize', size);
  cleanups.push(() => { window.removeEventListener('resize', size); renderer.dispose(); });

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xfff1c1, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const inner = new THREE.PointLight(0xffd76a, 0, 9);
  inner.position.set(0, 0.6, 0.6);
  scene.add(inner);

  const logo = new THREE.TextureLoader().load('/favicon.png');
  logo.colorSpace = THREE.SRGBColorSpace;
  const { box, lid, gold } = makeBox(logo);
  scene.add(box);

  // burst pieces, hidden until the box opens
  const sparkCount = 260;
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkVel = new Float32Array(sparkCount * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.07, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.visible = false;
  scene.add(sparks);

  const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.95, roughness: 0.18, emissive: 0x6b4c0a, emissiveIntensity: 0.4 });
  const coins = Array.from({ length: 9 }, (_, i) => {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.visible = false;
    c.userData = { a: (i / 9) * Math.PI * 2, speed: 0.7 + Math.random() * 0.6, lift: 1.4 + Math.random() * 1.2 };
    scene.add(c);
    return c;
  });

  const beams = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff1c1, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 2.6;
    beam.rotation.z = (i - 3) * 0.24;
    beam.rotation.x = Math.PI;
    beams.add(beam);
  }
  beams.position.y = 0.3;
  scene.add(beams);

  /* ---------- timeline */
  type Phase = 'drop' | 'idle' | 'shake' | 'burst' | 'rattle';
  let phase: Phase = 'drop';
  let phaseStart = performance.now();
  const setPhase = (p: Phase) => { phase = p; phaseStart = performance.now(); };
  let lidVel = new THREE.Vector3();
  let lidSpin = 0;

  const startOpening = (preview: boolean) => {
    actions.innerHTML = '';
    setPhase('shake');
    (box.userData as { preview?: boolean }).preview = preview;
  };

  const burst = () => {
    setPhase('burst');
    el.classList.add('is-burst');
    lidVel = new THREE.Vector3((Math.random() - 0.5) * 2, 7.5, 2.2);
    lidSpin = (Math.random() < 0.5 ? -1 : 1) * 6;
    sparks.visible = true;
    for (let i = 0; i < sparkCount; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 1.2;
      sparkPos[i * 3 + 1] = 0.6;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      const a = Math.random() * Math.PI * 2, up = 3 + Math.random() * 5, out = 1 + Math.random() * 3;
      sparkVel[i * 3] = Math.cos(a) * out;
      sparkVel[i * 3 + 1] = up;
      sparkVel[i * 3 + 2] = Math.sin(a) * out;
    }
    coins.forEach((c) => { c.visible = true; c.position.set(0, 0.4, 0); });
    const preview = !!(box.userData as { preview?: boolean }).preview;
    window.setTimeout(() => { if (alive) showReveal(preview); }, 650);
    if (!preview) opts.onOpened?.();
  };

  // what the visitor can do before opening
  if (opts.mode === 'locked') {
    window.setTimeout(() => {
      if (!alive) return;
      setPhase('rattle');
      el.classList.add('is-locked-shake');
      reveal.hidden = false;
      label.textContent = 'SEALED';
      amount.textContent = money(opts.reward);
      note.textContent = `Unlocks at ${opts.requirement}.`;
      button('Preview the opening', 'btn-line', () => { reveal.hidden = true; el.classList.remove('is-locked-shake'); startOpening(true); });
      button('Got it', 'btn-grad', close);
    }, 900);
  } else if (opts.mode === 'opened') {
    window.setTimeout(() => { if (alive) startOpening(false); }, 700);
  } else {
    button('Open box', 'btn-grad', () => startOpening(false));
  }

  let last = performance.now();
  const loop = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - phaseStart) / 1000;

    if (phase === 'drop') {
      const k = Math.min(1, t / 0.9);
      box.position.y = 3.5 * (1 - easeOutBack(k));
      box.rotation.y = -0.6 + 0.6 * k;
      if (k >= 1) setPhase('idle');
    } else if (phase === 'idle' || phase === 'rattle') {
      box.position.y = Math.sin(now / 600) * 0.06;
      box.rotation.y += dt * 0.35;
      if (phase === 'rattle' && t < 0.6) {
        const s = Math.sin(t * 60) * 0.06 * (1 - t / 0.6);
        box.rotation.z = s;
      } else box.rotation.z = 0;
    } else if (phase === 'shake') {
      // harder and harder, while gold light charges inside
      const k = Math.min(1, t / 1.7);
      const amp = 0.02 + k * k * 0.16;
      box.rotation.z = Math.sin(t * 55) * amp;
      box.rotation.x = Math.cos(t * 47) * amp * 0.6;
      box.position.y = Math.abs(Math.sin(t * 30)) * amp * 0.8;
      inner.intensity = k * 6;
      gold.emissiveIntensity = 0.25 + k * 1.4;
      flash.style.opacity = String(k * 0.15);
      if (k >= 1) burst();
    } else if (phase === 'burst') {
      box.rotation.z *= 0.9;
      box.rotation.x *= 0.9;
      // lid flies off
      lidVel.y -= 9.8 * dt;
      lid.position.addScaledVector(lidVel, dt);
      lid.rotation.x += lidSpin * dt;
      lid.rotation.z += lidSpin * 0.4 * dt;
      // sparks under gravity
      for (let i = 0; i < sparkCount; i++) {
        sparkVel[i * 3 + 1] -= 6 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      (sparks.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - t / 2.2);
      // coins rise and circle above the box
      coins.forEach((c) => {
        const { a, speed, lift } = c.userData as { a: number; speed: number; lift: number };
        const k = Math.min(1, t / 1.2);
        const ang = a + t * speed;
        c.position.set(Math.cos(ang) * 1.3 * k, 0.4 + lift * easeOutBack(k), Math.sin(ang) * 1.3 * k);
        c.rotation.x = t * 3 * speed;
        c.rotation.z = Math.PI / 2;
      });
      // light beams flare then settle
      beams.children.forEach((b, i) => {
        const m = (b as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = Math.max(0.08, Math.min(0.55, t * 2) * (1 - Math.min(1, t / 3)) + 0.08) * (0.7 + 0.3 * Math.sin(now / 200 + i));
      });
      beams.rotation.y += dt * 0.4;
      inner.intensity = 4 + Math.sin(now / 150) * 1.5;
      flash.style.opacity = String(Math.max(0, 0.6 - t * 1.2));
      box.rotation.y += dt * 0.25;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
}
