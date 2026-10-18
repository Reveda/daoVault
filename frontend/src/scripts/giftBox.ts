/**
 * DAOvault AI — Rank reward surprise box (TPR World's gift box, rebuilt for DAOvault)
 *
 * A red gift box is packed in front of the member (body rises, ribbon wraps, lid lands, seals
 * and bow pop) with the DAOvault seal on every side, then idles over a gold portal.
 * Opening it: it shakes harder and harder while gold light charges inside, the
 * lid blows off, beams and sparks burst out, coins rise, and the reward counts
 * up. A sealed (locked) box only rattles and says what unlocks it, with an
 * optional preview of the opening. Nothing here pays anything: the reveal says
 * rewards are credited after on-chain verification.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
    <div class="gift-scroll">
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
    </div>
    <div class="gift-flash" aria-hidden="true"></div>`;
  document.body.appendChild(el);
  return el;
}

/**
 * The reward box, built in code (owner, 2026-10-09): glossy red body and lid, white satin
 * ribbon with a bow, a gold-rimmed DAOvault seal on all four sides and a gold lid trim.
 */
export function makeBox(logo: THREE.Texture | null) {
  const red = new THREE.MeshPhysicalMaterial({
    color: 0xe8101c,
    metalness: 0.05,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.4,
    sheenColor: 0xff5a5a,
    emissive: 0x7a0008,
    emissiveIntensity: 0.35,
  }); // bright gift-wrap red
  const ribbon = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.32,
    emissive: 0xffffff,
    emissiveIntensity: 0.14,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.9,
    roughness: 0.22,
    emissive: 0x5a3f06,
    emissiveIntensity: 0.25,
  });
  const box = new THREE.Group();

  // parts the packing intro animates one by one (owner, 2026-10-11)
  const parts = {
    bodyRibbons: [] as THREE.Object3D[],
    seals: [] as THREE.Object3D[],
    lidRibbons: [] as THREE.Object3D[],
    bow: [] as THREE.Object3D[],
  };

  const body = new THREE.Group();
  body.add(new THREE.Mesh(new RoundedBoxGeometry(2, 1.6, 2, 4, 0.07), red));
  for (const geo of [
    new THREE.BoxGeometry(2.03, 1.6, 0.34),
    new THREE.BoxGeometry(0.34, 1.6, 2.03),
  ]) {
    const band = new THREE.Mesh(geo, ribbon);
    body.add(band);
    parts.bodyRibbons.push(band);
  }

  // the DAOvault seal on every side, sitting on the ribbon
  const sealFace = new THREE.MeshBasicMaterial({ color: logo ? 0xffffff : 0x111111, map: logo });
  const sealDisc = new THREE.CircleGeometry(0.36, 48);
  const sealRim = new THREE.TorusGeometry(0.37, 0.035, 12, 48);
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = (i * Math.PI) / 2;
    const face = new THREE.Mesh(sealDisc, sealFace);
    face.position.z = 1.04;
    const rim = new THREE.Mesh(sealRim, gold);
    rim.position.z = 1.04;
    side.add(face, rim);
    body.add(side);
    parts.seals.push(face, rim);
  }
  body.position.y = -0.3;
  box.add(body);

  const lid = new THREE.Group();
  lid.add(new THREE.Mesh(new RoundedBoxGeometry(2.18, 0.42, 2.18, 4, 0.07), red));
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.2), gold);
  trim.position.y = -0.17;
  lid.add(trim);
  for (const geo of [
    new THREE.BoxGeometry(2.21, 0.43, 0.36),
    new THREE.BoxGeometry(0.36, 0.43, 2.21),
  ]) {
    const band = new THREE.Mesh(geo, ribbon);
    lid.add(band);
    parts.lidRibbons.push(band);
  }

  // bow: two loops, a knot and two tails resting on the lid
  const loopGeo = new THREE.TorusGeometry(0.34, 0.085, 14, 36);
  loopGeo.scale(1, 0.7, 1);
  for (const dir of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, ribbon);
    loop.position.set(dir * 0.36, 0.45, 0);
    loop.rotation.set(0, dir * 0.35, dir * 0.38);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.62), ribbon);
    tail.position.set(dir * 0.16, 0.235, 0.36);
    tail.rotation.y = -dir * 0.5;
    lid.add(loop, tail);
    parts.bow.push(loop, tail);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), ribbon);
  knot.scale.set(1, 0.8, 0.9);
  knot.position.y = 0.32;
  lid.add(knot);
  parts.bow.push(knot);
  lid.position.y = 0.72;
  box.add(lid);

  return { box, body, lid, parts, glow: { red, ribbon, gold } };
}

/** Floor of the gift scene: the portal sits here and the box body stands on it. */
export const GIFT_FLOOR = -1.15;
/** Length of the packing intro, seconds. */
export const GIFT_PACK_S = 2.3;

/**
 * Gold portal under the box (glow pool, three turning rings, a dashed rune ring) and gold dust
 * drifting up around it. update(charge 0..1) speeds it up while the box charges. Shared by the
 * reward overlay and the landing page showcase (giftShowcase.ts).
 */
export function createPortal(scene: THREE.Scene) {
  const FLOOR = GIFT_FLOOR;
  const additive = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const glowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,226,140,1)');
    grad.addColorStop(0.35, 'rgba(212,175,55,0.45)');
    grad.addColorStop(1, 'rgba(212,175,55,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  // portal: glow pool + three rings + a dashed rune ring, turning in opposite directions
  const portal = new THREE.Group();
  portal.position.y = FLOOR;
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  portal.add(pool);
  const portalRings = (
    [
      [1.22, 1.3, 0.85],
      [1.52, 1.56, 0.5],
      [1.84, 1.86, 0.32],
    ] as const
  ).map(([r1, r2, o]) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 96), additive(0xffc94a, o));
    ring.rotation.x = -Math.PI / 2;
    portal.add(ring);
    return ring;
  });
  const runes = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(2.02, 2.1, 8, 1, (i / 12) * Math.PI * 2, 0.32),
      additive(0xffe08a, 0.45),
    );
    arc.rotation.x = -Math.PI / 2;
    runes.add(arc);
  }
  portal.add(runes);
  scene.add(portal);

  // gold dust drifting up around the box
  const dustCount = 70;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = Array.from({ length: dustCount }, () => ({
    a: Math.random() * Math.PI * 2,
    r: 1.1 + Math.random() * 1.6,
    y: Math.random() * 4,
    v: 0.25 + Math.random() * 0.45,
  }));
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffd76a,
    size: 0.05,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  const update = (now: number, dt: number, charge: number) => {
    const spin = 0.25 + charge * 2.2;
    portalRings.forEach((ring, i) => {
      ring.rotation.z += dt * spin * (i % 2 ? -1 : 1) * (1 + i * 0.3);
      (ring.material as THREE.MeshBasicMaterial).opacity =
        (0.32 + i * -0.06 + 0.25 * Math.sin(now / 420 + i)) * (1 + charge * 1.4);
    });
    runes.rotation.y -= dt * (0.15 + charge * 1.6);
    (pool.material as THREE.MeshBasicMaterial).opacity =
      0.45 + charge * 0.5 + 0.08 * Math.sin(now / 300);
    pool.scale.setScalar(1 + charge * 0.25);

    for (let i = 0; i < dustCount; i++) {
      const d = dustSeed[i];
      d.y += dt * d.v * (1 + charge * 3);
      if (d.y > 4.2) d.y = 0;
      const ang = d.a + (now / 4000) * d.v;
      dustPos[i * 3] = Math.cos(ang) * d.r;
      dustPos[i * 3 + 1] = FLOOR + d.y;
      dustPos[i * 3 + 2] = Math.sin(ang) * d.r;
    }
    dustGeo.attributes.position.needsUpdate = true;
  };
  const dispose = () => glowTexture.dispose();
  return { update, dispose };
}

/**
 * Packing intro (owner, 2026-10-11): out of the portal the red body rises, the white ribbon wraps
 * it, the lid lands with a bounce, the four DAOvault seals press on one by one and the bow pops,
 * with a gold glint at the end. Returns frame(t) for t = 0..GIFT_PACK_S seconds.
 */
export function makePacker({ box, body, lid, parts, glow }: ReturnType<typeof makeBox>) {
  const PACK_S = GIFT_PACK_S;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
  const easeOutCubic = (v: number) => 1 - Math.pow(1 - v, 3);
  const easeOutBounce = (v: number) => {
    const n = 7.5625,
      d = 2.75;
    if (v < 1 / d) return n * v * v;
    if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
    if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
    return n * (v -= 2.625 / d) * v + 0.984375;
  };
  const bowScale = parts.bow.map((p) => p.scale.clone());
  const BODY_Y = body.position.y;
  const LID_Y = lid.position.y;
  const tiny = 0.0001;
  const packFrame = (t: number) => {
    // 1. the body rises out of the portal (bottom stays on the floor)
    const rise = easeOutBack(span(t, 0, 0.6));
    const sy = Math.max(tiny, rise);
    body.scale.set(Math.max(tiny, 0.7 + 0.3 * rise), sy, Math.max(tiny, 0.7 + 0.3 * rise));
    body.position.y = BODY_Y - 0.8 * (1 - sy);
    // 2. the ribbon wraps it, top to bottom
    const wrap = easeOutCubic(span(t, 0.5, 1.0));
    parts.bodyRibbons.forEach((r, i) => {
      r.scale.y = Math.max(tiny, clamp01(wrap * 1.15 - i * 0.15));
      r.position.y = 0.8 * (1 - r.scale.y);
    });
    // 3. the lid lands with a bounce, its ribbon already on
    const land = span(t, 0.95, 1.55);
    lid.visible = t >= 0.95;
    lid.position.y = LID_Y + 2.6 * (1 - easeOutBounce(land));
    lid.rotation.y = (1 - land) * 0.6;
    parts.lidRibbons.forEach((r) => {
      r.scale.x = r.scale.z = Math.max(tiny, easeOutCubic(span(t, 0.95, 1.35)));
    });
    // 4. the seals press on one by one, then the bow pops
    parts.seals.forEach((s, i) =>
      s.scale.setScalar(
        Math.max(
          tiny,
          easeOutBack(span(t, 1.3 + Math.floor(i / 2) * 0.1, 1.6 + Math.floor(i / 2) * 0.1)),
        ),
      ),
    );
    const pop = easeOutBack(span(t, 1.65, 2.05));
    parts.bow.forEach((p, i) => p.scale.copy(bowScale[i]).multiplyScalar(Math.max(tiny, pop)));
    // the box turns to the camera while it is wrapped; a gold glint when it is done
    box.rotation.y = -0.9 * (1 - easeOutCubic(span(t, 0, PACK_S)));
    box.position.y = 0;
    const glint = span(t, 1.95, 2.3);
    glow.gold.emissiveIntensity = 0.25 + Math.sin(glint * Math.PI) * 1.4;
    glow.ribbon.emissiveIntensity = 0.14 + Math.sin(glint * Math.PI) * 0.5;
  };
  return packFrame;
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
  if (!canvas || !kicker || !title || !reveal || !label || !amount || !note || !actions || !flash)
    return;

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
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  const closeBtn = el.querySelector<HTMLButtonElement>('.gift-close');
  if (closeBtn) closeBtn.onclick = close;
  el.onclick = (e) => {
    if (e.target === el || (e.target as HTMLElement).classList.contains('gift-scroll')) close();
  };

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
    label.textContent = preview
      ? `PREVIEW · ${opts.rank.toUpperCase()} REWARD`
      : `${opts.rank.toUpperCase()} REWARD`;
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
    const w = canvas.clientWidth || 360,
      h = canvas.clientHeight || 300;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow phone canvases: step the camera back so the whole box (and the flying lid) stays in frame
    const dist = camera.aspect < 1.15 ? 7.2 * Math.min(1.35, 1.15 / camera.aspect) : 7.2;
    camera.position.set(0, 1.1 * (dist / 7.2), dist);
    camera.lookAt(0, 0.2, 0);
    camera.updateProjectionMatrix();
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.1, 7.2);
  camera.lookAt(0, 0.2, 0);
  size();
  window.addEventListener('resize', size);
  cleanups.push(() => {
    window.removeEventListener('resize', size);
    renderer.dispose();
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a0a0a, 0.8));
  const rimLight = new THREE.DirectionalLight(0xffc46b, 1.6);
  rimLight.position.set(-4, 3, -4);
  scene.add(rimLight);
  const key = new THREE.DirectionalLight(0xfff8ec, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const inner = new THREE.PointLight(0xffd76a, 0, 9);
  inner.position.set(0, 0.6, 0.6);
  scene.add(inner);

  const logo = new THREE.TextureLoader().load('/favicon.png');
  logo.colorSpace = THREE.SRGBColorSpace;
  // the square logo inside the round seal: shrink it so its corners are not cut (the edge pixels are black)
  logo.repeat.set(1.3, 1.3);
  logo.offset.set(-0.15, -0.15);
  const built = makeBox(logo);
  const { box, lid, glow } = built;
  scene.add(box);

  // burst pieces, hidden until the box opens
  const sparkCount = 260;
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkVel = new Float32Array(sparkCount * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: 0xffe08a,
      size: 0.07,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sparks.visible = false;
  scene.add(sparks);

  const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28);
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffcf4a,
    metalness: 0.95,
    roughness: 0.18,
    emissive: 0x6b4c0a,
    emissiveIntensity: 0.4,
  });
  const coins = Array.from({ length: 9 }, (_, i) => {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.visible = false;
    c.userData = {
      a: (i / 9) * Math.PI * 2,
      speed: 0.7 + Math.random() * 0.6,
      lift: 1.4 + Math.random() * 1.2,
    };
    scene.add(c);
    return c;
  });

  const beams = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 5, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff1c1,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 2.6;
    beam.rotation.z = (i - 3) * 0.24;
    beam.rotation.x = Math.PI;
    beams.add(beam);
  }
  beams.position.y = 0.3;
  scene.add(beams);

  /* ---------- VFX (owner, 2026-10-11, TPR-style but in our gold): a portal under the box,
     gold dust in the air, energy pouring in from four sides with lightning while it charges,
     and a shockwave when the lid blows off */
  const FLOOR = GIFT_FLOOR;
  const additive = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const portalFx = createPortal(scene); // portal rings + gold dust
  cleanups.push(portalFx.dispose);

  // energy from four sides: particles stream along curves into the box while it charges
  const EMITTERS = [
    new THREE.Vector3(-4.6, 2.2, 0.6),
    new THREE.Vector3(4.6, 2.2, 0.6),
    new THREE.Vector3(-4.2, -1.6, 1.4),
    new THREE.Vector3(4.2, -1.6, 1.4),
  ];
  const CORE = new THREE.Vector3(0, 0.35, 0);
  const PER_STREAM = 60;
  const streamCount = EMITTERS.length * PER_STREAM;
  const streamPos = new Float32Array(streamCount * 3);
  const streamSeed = Array.from({ length: streamCount }, (_, i) => ({
    side: Math.floor(i / PER_STREAM),
    t: Math.random(),
    v: 0.55 + Math.random() * 0.6,
    swirl: (Math.random() - 0.5) * 2.4,
    lift: (Math.random() - 0.5) * 1.6,
  }));
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
  const streamMat = new THREE.PointsMaterial({
    color: 0xffe9a8,
    size: 0.09,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const streams = new THREE.Points(streamGeo, streamMat);
  scene.add(streams);
  const bez = new THREE.Vector3();
  const ctrl = new THREE.Vector3();

  // lightning from the same four sides (jagged lines rebuilt a few times a second)
  const BOLT_POINTS = 14;
  const bolts = EMITTERS.map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0xfff3c4,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(line);
    return line;
  });
  let boltAt = 0;
  const rebuildBolts = () => {
    bolts.forEach((line, s) => {
      const from = EMITTERS[s];
      const arr = (line.geometry.attributes.position as THREE.BufferAttribute)
        .array as Float32Array;
      for (let i = 0; i < BOLT_POINTS; i++) {
        const k = i / (BOLT_POINTS - 1);
        const jitter = i === 0 || i === BOLT_POINTS - 1 ? 0 : 0.35 * Math.sin(k * Math.PI);
        arr[i * 3] = from.x + (CORE.x - from.x) * k + (Math.random() - 0.5) * jitter;
        arr[i * 3 + 1] = from.y + (CORE.y + 0.4 - from.y) * k + (Math.random() - 0.5) * jitter;
        arr[i * 3 + 2] = from.z + (CORE.z - from.z) * k + (Math.random() - 0.5) * jitter;
      }
      line.geometry.attributes.position.needsUpdate = true;
    });
  };

  // shockwave when the lid blows off: one ring along the floor, one facing the camera
  const floorWave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96), additive(0xfff1c1, 0));
  floorWave.rotation.x = -Math.PI / 2;
  floorWave.position.y = FLOOR + 0.02;
  const airWave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), additive(0xffd76a, 0));
  airWave.position.set(0, 0.4, 0.4);
  scene.add(floorWave, airWave);

  /** portal, dust, energy, lightning and shockwave for this frame; charge 0..1 while shaking */
  const animateVfx = (now: number, dt: number, charge: number, sinceBurst: number) => {
    portalFx.update(now, dt, charge);

    const streaming = charge > 0 && sinceBurst < 0;
    streamMat.opacity = streaming
      ? Math.min(1, charge * 2.2)
      : Math.max(0, streamMat.opacity - dt * 3);
    if (streamMat.opacity > 0) {
      for (let i = 0; i < streamCount; i++) {
        const p = streamSeed[i];
        p.t += dt * p.v * (0.6 + charge * 1.6);
        if (p.t >= 1) p.t -= 1;
        const from = EMITTERS[p.side];
        ctrl.set(
          (from.x + CORE.x) / 2 + p.swirl * 0.4,
          (from.y + CORE.y) / 2 + 1.2 + p.lift,
          (from.z + CORE.z) / 2 + p.swirl,
        );
        const e = p.t * p.t; // accelerates into the box
        bez
          .copy(from)
          .multiplyScalar((1 - e) * (1 - e))
          .addScaledVector(ctrl, 2 * (1 - e) * e)
          .addScaledVector(CORE, e * e);
        streamPos[i * 3] = bez.x;
        streamPos[i * 3 + 1] = bez.y;
        streamPos[i * 3 + 2] = bez.z;
      }
      streamGeo.attributes.position.needsUpdate = true;
    }

    const boltLevel = streaming && charge > 0.35 ? (charge - 0.35) / 0.65 : 0;
    if (boltLevel > 0 && now - boltAt > 70) {
      rebuildBolts();
      boltAt = now;
    }
    bolts.forEach((line, s) => {
      (line.material as THREE.LineBasicMaterial).opacity =
        boltLevel > 0 && Math.random() < 0.55 + boltLevel * 0.4 ? 0.4 + boltLevel * 0.6 : 0;
      line.visible = boltLevel > 0 || s < 0;
    });

    if (sinceBurst >= 0) {
      const k = Math.min(1, sinceBurst / 1.1);
      floorWave.scale.setScalar(1 + k * 4.5);
      (floorWave.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      airWave.scale.setScalar(0.6 + k * 4);
      (airWave.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.75;
    }
  };
  let burstAt = -1;

  /* ---------- timeline */
  type Phase = 'pack' | 'idle' | 'shake' | 'burst' | 'rattle';
  let phase: Phase = 'pack';

  /**
   * Packing intro (owner, 2026-10-11): the box is wrapped in front of the member before it can
   * be opened. Out of the portal the red body rises, the white ribbon wraps it, the lid lands
   * with a bounce, the four DAOvault seals press on one by one and the bow pops, with a gold
   * glint at the end. PACK_S seconds; the buttons appear afterwards.
   */
  const PACK_S = GIFT_PACK_S;
  const packFrame = makePacker(built);
  packFrame(0);
  let phaseStart = performance.now();
  const setPhase = (p: Phase) => {
    phase = p;
    phaseStart = performance.now();
  };
  let lidVel = new THREE.Vector3();
  let lidSpin = 0;

  const startOpening = (preview: boolean) => {
    actions.innerHTML = '';
    setPhase('shake');
    (box.userData as { preview?: boolean }).preview = preview;
  };

  const burst = () => {
    setPhase('burst');
    burstAt = performance.now();
    el.classList.add('is-burst');
    lidVel = new THREE.Vector3((Math.random() - 0.5) * 2, 7.5, 2.2);
    lidSpin = (Math.random() < 0.5 ? -1 : 1) * 6;
    sparks.visible = true;
    for (let i = 0; i < sparkCount; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 1.2;
      sparkPos[i * 3 + 1] = 0.6;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      const a = Math.random() * Math.PI * 2,
        up = 3 + Math.random() * 5,
        out = 1 + Math.random() * 3;
      sparkVel[i * 3] = Math.cos(a) * out;
      sparkVel[i * 3 + 1] = up;
      sparkVel[i * 3 + 2] = Math.sin(a) * out;
    }
    coins.forEach((c) => {
      c.visible = true;
      c.position.set(0, 0.4, 0);
    });
    const preview = !!(box.userData as { preview?: boolean }).preview;
    window.setTimeout(() => {
      if (alive) showReveal(preview);
    }, 650);
    if (!preview) opts.onOpened?.();
  };

  // what the visitor can do before opening
  if (opts.mode === 'locked') {
    window.setTimeout(
      () => {
        if (!alive) return;
        setPhase('rattle');
        el.classList.add('is-locked-shake');
        reveal.hidden = false;
        label.textContent = 'SEALED';
        amount.textContent = money(opts.reward);
        note.textContent = `Unlocks at ${opts.requirement}.`;
        button('Preview the opening', 'btn-line', () => {
          reveal.hidden = true;
          el.classList.remove('is-locked-shake');
          startOpening(true);
        });
        button('Got it', 'btn-grad', close);
      },
      PACK_S * 1000 + 250,
    );
  } else if (opts.mode === 'opened') {
    window.setTimeout(
      () => {
        if (alive) startOpening(false);
      },
      PACK_S * 1000 + 300,
    );
  } else {
    // the button appears once the box is packed
    window.setTimeout(() => {
      if (alive) button('Open box', 'btn-grad', () => startOpening(false));
    }, PACK_S * 1000);
  }

  let last = performance.now();
  const loop = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - phaseStart) / 1000;
    const charge = phase === 'shake' ? Math.min(1, t / 1.7) : phase === 'burst' ? 1 : 0;
    animateVfx(now, dt, charge, burstAt < 0 ? -1 : (now - burstAt) / 1000);

    if (phase === 'pack') {
      packFrame(t);
      if (t >= PACK_S) {
        packFrame(PACK_S);
        setPhase('idle');
      }
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
      glow.gold.emissiveIntensity = 0.25 + k * 1.4;
      glow.ribbon.emissiveIntensity = 0.14 + k * 0.6;
      glow.red.emissiveIntensity = 0.35 + k * 1.6; // the box glows red-hot before it bursts
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
        c.position.set(
          Math.cos(ang) * 1.3 * k,
          0.4 + lift * easeOutBack(k),
          Math.sin(ang) * 1.3 * k,
        );
        c.rotation.x = t * 3 * speed;
        c.rotation.z = Math.PI / 2;
      });
      // light beams flare then settle
      beams.children.forEach((b, i) => {
        const m = (b as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity =
          Math.max(0.08, Math.min(0.55, t * 2) * (1 - Math.min(1, t / 3)) + 0.08) *
          (0.7 + 0.3 * Math.sin(now / 200 + i));
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
