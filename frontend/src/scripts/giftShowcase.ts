/**
 * Landing #ranks "Apex Leadership Vault" card: the DAOvault reward box in place of the old Apex
 * trophy (trophy3d.ts, kept but no longer loaded). Same gold portal as the dashboard reward
 * overlay (giftBox.ts createPortal); the particles follow the shape of giftBox.ts makeBox.
 *
 * A gift made of particles (owner, 2026-10-12, like the logo of the page's particle scene): while
 * the section scrolls in, scattered particles swirl together into the gift (red body, white
 * ribbon and bow, gold seal rims, the DAOvault logo on the front); scrolling back up breaks it
 * apart again. When it is complete lightning strikes it and the card flashes. Particle VFX:
 * glowing twinkling dots, random flares, a band of light rising through it, gentle breathing,
 * a gold ring orbiting it; hover / tap pushes the particles out and they settle back. Renders
 * only while on screen; reduced motion shows the finished gift.
 */
import * as THREE from 'three';
import { hasWebGL } from './core.ts';
import { LITE } from './perf.ts';
import { createPortal } from './giftBox.ts';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);

type Rgb = [number, number, number];
// pure red: many glowing (additive) particles on top of each other must add up to red, not white
const RED: Rgb = [0.95, 0.04, 0.06];
const WHITE: Rgb = [1, 0.96, 0.88];
const GOLD: Rgb = [1, 0.78, 0.3];

/**
 * Points on the packed gift, in the box's own coordinates (giftBox.ts makeBox): body, ribbons,
 * lid, gold trim, seal rims, the box edges (they make the shape read crisp) and bow. The seals are
 * left empty here: the logo fills them on all four sides.
 */
function sampleGift(count: number): { pos: number[]; col: number[] } {
  const pos: number[] = [];
  const col: number[] = [];
  const push = (x: number, y: number, z: number, c: Rgb) => { pos.push(x, y, z); col.push(...c); };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const inSeal = (u: number, v: number, cy: number) => Math.hypot(u, v - cy) < 0.4;

  const bodyN = Math.round(count * 0.4);
  for (let i = 0; i < bodyN; i++) {
    const side = Math.floor(Math.random() * 4); // front, back, left, right
    const a = rnd(-1, 1), y = rnd(-1.1, 0.5);
    if (inSeal(a, y, -0.3)) { i--; continue; }
    const ribbon = Math.abs(a) < 0.17;
    if (side < 2) push(a, y, side === 0 ? 1.01 : -1.01, ribbon ? WHITE : RED);
    else push(side === 2 ? -1.01 : 1.01, y, a, ribbon ? WHITE : RED);
  }
  const lidN = Math.round(count * 0.22);
  for (let i = 0; i < lidN; i++) {
    const face = Math.random();
    if (face < 0.5) { // top
      const x = rnd(-1.09, 1.09), z = rnd(-1.09, 1.09);
      push(x, 0.94, z, Math.abs(x) < 0.18 || Math.abs(z) < 0.18 ? WHITE : RED);
    } else {
      const side = Math.floor(Math.random() * 4), a = rnd(-1.09, 1.09), y = rnd(0.51, 0.93);
      const c = y < 0.58 ? GOLD : Math.abs(a) < 0.18 ? WHITE : RED;
      if (side < 2) push(a, y, side === 0 ? 1.1 : -1.1, c);
      else push(side === 2 ? -1.1 : 1.1, y, a, c);
    }
  }
  // gold seal rims on all four sides
  const rimN = Math.round(count * 0.08);
  for (let i = 0; i < rimN; i++) {
    const t = Math.random() * Math.PI * 2, side = i % 4, u = Math.cos(t) * 0.37, v = -0.3 + Math.sin(t) * 0.37;
    if (side === 0) push(u, v, 1.05, GOLD);
    else if (side === 1) push(-u, v, -1.05, GOLD);
    else if (side === 2) push(-1.05, v, u, GOLD);
    else push(1.05, v, -u, GOLD);
  }
  // the edges of the body and the lid, a little denser so the outline reads crisp
  const edgeN = Math.round(count * 0.12);
  for (let i = 0; i < edgeN; i++) {
    const e = i % 6, a = rnd(-1, 1), sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1;
    if (e === 0) push(sx * 1.01, rnd(-1.1, 0.5), sz * 1.01, RED); // body uprights
    else if (e === 1) push(a, -1.1, sz * 1.01, Math.abs(a) < 0.17 ? WHITE : RED); // body bottom edges
    else if (e === 2) push(sx * 1.01, -1.1, a, Math.abs(a) < 0.17 ? WHITE : RED);
    else if (e === 3) push(a * 1.09, 0.94, sz * 1.1, Math.abs(a) < 0.17 ? WHITE : RED); // lid top edges
    else if (e === 4) push(sx * 1.1, 0.94, a * 1.09, Math.abs(a) < 0.17 ? WHITE : RED);
    else push(sx * 1.1, rnd(0.51, 0.94), sz * 1.1, RED); // lid corners
  }
  // bow: two loops (torus, squashed and tilted like makeBox) and the knot
  const bowN = count - bodyN - lidN - rimN - edgeN;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < bowN; i++) {
    if (i % 6 === 0) { // knot
      tmp.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiply(new THREE.Vector3(0.17, 0.14, 0.15));
      push(tmp.x, 1.04 + tmp.y, tmp.z, WHITE);
      continue;
    }
    const dir = i % 2 ? 1 : -1, u = Math.random() * Math.PI * 2, w = Math.random() * Math.PI * 2;
    tmp.set((0.34 + 0.085 * Math.cos(w)) * Math.cos(u), (0.34 + 0.085 * Math.cos(w)) * Math.sin(u) * 0.7, 0.085 * Math.sin(w));
    tmp.applyEuler(new THREE.Euler(0, dir * 0.35, dir * 0.38));
    push(tmp.x + dir * 0.36, tmp.y + 1.17, tmp.z, WHITE);
  }
  return { pos, col };
}

/**
 * The DAOvault logo from favicon.png as points on all four seals (bright pixels only), turned like
 * the seal meshes of makeBox: front (z+), right (x+), back (z-), left (x-).
 */
function logoPoints(img: HTMLImageElement | null, count: number): { pos: number[]; col: number[] } {
  const pos: number[] = [];
  const col: number[] = [];
  let px: Array<[number, number, Rgb]> = [];
  if (img) {
    const n = 72;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0, n, n);
      const d = g.getImageData(0, 0, n, n).data;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const k = (y * n + x) * 4, r = d[k], gg = d[k + 1], b = d[k + 2];
        if (d[k + 3] > 120 && r + gg + b > 330) px.push([x / n - 0.5, y / n - 0.5, [r / 255, gg / 255, b / 255]]);
      }
    }
  }
  if (!px.length) px = Array.from({ length: 200 }, () => [Math.random() - 0.5, Math.random() - 0.5, GOLD] as [number, number, Rgb]);
  for (let i = 0; i < count; i++) {
    const [u, v, c] = px[Math.floor(Math.random() * px.length)];
    const x = u * 0.6, y = -v * 0.6;
    if (Math.hypot(x, y) > 0.35) { i--; continue; }
    const side = i % 4, yy = -0.3 + y;
    if (side === 0) pos.push(x, yy, 1.06);
    else if (side === 1) pos.push(1.06, yy, -x);
    else if (side === 2) pos.push(-x, yy, -1.06);
    else pos.push(-1.06, yy, x);
    col.push(...c);
  }
  return { pos, col };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    window.setTimeout(() => resolve(null), 2500);
  });
}

/* ---------- particle look (same glow + core as the page's particle scene, particleScene.ts) */
const GIFT_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPx;
  uniform float uSize;
  uniform float uForm;
  uniform float uSweep;
  uniform float uBurst;
  uniform float uFlash;
  uniform float uNear;
  attribute float aSeed;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float ph = aSeed * 6.2831853;
    // the formed gift breathes; hover / tap pushes the particles out a little
    p += vec3(sin(uTime * 1.6 + ph * 3.0), sin(uTime * 1.2 + ph * 5.0), cos(uTime * 1.4 + ph * 2.0)) * 0.022 * uForm;
    p += normalize(p - vec3(0.0, -0.1, 0.0) + 0.0001) * uBurst * (0.35 + aSeed * 0.5);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // a band of light rises through the gift; a few particles flare now and then
    float sweep = smoothstep(0.32, 0.0, abs(p.y - uSweep)) * uForm;
    float flare = step(0.975, fract(sin(floor(uTime * 2.5) * 12.9898 + aSeed * 78.233) * 43758.5453)) * uForm;
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.4 + ph * 4.0);

    vColor = mix(color, vec3(1.0, 0.93, 0.62), clamp(sweep * 0.75 + flare * 0.85 + uFlash * 0.7, 0.0, 1.0));
    // depth: particles on the far side of the gift are dimmer, so it reads solid and 3D
    float far = clamp((-mv.z - uNear) / 2.2, 0.0, 1.0);
    vAlpha = twinkle * (1.0 + sweep * 0.9 + flare * 1.4 + uFlash) * (1.0 - far * 0.85 * uForm);
    float depth = clamp(9.0 / -mv.z, 0.55, 1.8);
    gl_PointSize = aSize * uSize * uPx * depth * (1.0 + sweep * 0.7 + flare * 1.6 + uFlash * 0.5);
  }
`;
const GIFT_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float glow = exp(-d * 16.0);
    float core = exp(-d * 85.0) * 0.5;
    gl_FragColor = vec4(vColor * (glow + core), (glow + core) * vAlpha * uOpacity);
  }
`;

function giftMaterial(size: number) {
  return new THREE.ShaderMaterial({
    vertexShader: GIFT_VERT,
    fragmentShader: GIFT_FRAG,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPx: { value: 1 }, uSize: { value: size }, uForm: { value: 0 },
      uSweep: { value: -2 }, uBurst: { value: 0 }, uFlash: { value: 0 }, uOpacity: { value: 1 }, uNear: { value: 6.5 },
    },
  });
}

async function build(stage: HTMLElement, slot: HTMLElement): Promise<void> {
  if (!hasWebGL()) { stage.classList.add('is-static'); return; }

  const canvas = document.createElement('canvas');
  canvas.className = 'gift-showcase-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  slot.appendChild(canvas);
  const flash = document.createElement('div');
  flash.className = 'gift-thunder';
  flash.setAttribute('aria-hidden', 'true');
  stage.appendChild(flash);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    stage.classList.add('is-static');
    return;
  }
  const px = Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2);
  renderer.setPixelRatio(px);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const size = () => {
    const w = slot.clientWidth || 360, h = slot.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow cards: step back so the gift and its portal stay in frame
    const dist = camera.aspect < 1 ? 7.6 / Math.max(0.62, camera.aspect) : 7.6;
    camera.position.set(0, 1.25 * (dist / 7.6), dist);
    // the near face of the gift sits about one unit in front of the centre: depth shading starts there
    for (const m of shaded) m.uniforms.uNear.value = dist - 1.2;
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();
  };
  const portal = createPortal(scene);
  const shaded: THREE.ShaderMaterial[] = []; // gift + ring materials (depth shading follows the camera)

  /* ---------- the particle gift (red body, white ribbon + bow, gold seal rims, the DV logo) */
  const total = LITE ? 2600 : 4200;
  const logoCount = Math.round(total * 0.2); // shared by the four seals
  const giftPts = sampleGift(total - logoCount);
  const logoPts = logoPoints(await loadImage('/favicon.png'), logoCount);
  const target = new Float32Array([...giftPts.pos, ...logoPts.pos]);
  const colors = new Float32Array([...giftPts.col, ...logoPts.col]);
  const count = target.length / 3;
  const start = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const swirl = new Float32Array(count);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // scattered in a wide shell around the gift, a little above it
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), r = 3.2 + Math.random() * 3.4;
    start[i * 3] = r * Math.sin(ph) * Math.cos(th);
    start[i * 3 + 1] = r * Math.cos(ph) * 0.7 + 0.8;
    start[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    delay[i] = Math.random() * 0.35;
    swirl[i] = (1.4 + Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1);
    seeds[i] = Math.random();
    sizes[i] = 0.7 + Math.random() * 0.6;
  }
  const live = new Float32Array(start);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(live, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = giftMaterial(LITE ? 4.4 : 3.6);
  mat.uniforms.uPx.value = px;
  shaded.push(mat);
  const gift = new THREE.Points(geo, mat);
  gift.scale.setScalar(0.92);
  scene.add(gift);

  // a ring of gold particles orbiting the gift once it is formed
  const ringCount = LITE ? 110 : 180;
  const ringPos = new Float32Array(ringCount * 3);
  const ringCol = new Float32Array(ringCount * 3);
  const ringSeed = new Float32Array(ringCount);
  const ringSize = new Float32Array(ringCount);
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2, r = 1.95 + (Math.random() - 0.5) * 0.18;
    ringPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.08, Math.sin(a) * r], i * 3);
    ringCol.set([1, 0.8 + Math.random() * 0.15, 0.35], i * 3);
    ringSeed[i] = Math.random();
    ringSize[i] = 0.5 + Math.random() * 0.6;
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3));
  ringGeo.setAttribute('aSeed', new THREE.BufferAttribute(ringSeed, 1));
  ringGeo.setAttribute('aSize', new THREE.BufferAttribute(ringSize, 1));
  const ringMat = giftMaterial(LITE ? 4.4 : 3.8);
  ringMat.uniforms.uPx.value = px;
  shaded.push(ringMat);
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.rotation.x = 0.32;
  ring.position.y = 0.05;
  scene.add(ring);

  /* ---------- lightning when it is complete */
  const BOLT_POINTS = 12;
  const strikeX = [-1.4, 0.2, 1.5];
  const bolts = strikeX.map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.visible = false;
    scene.add(line);
    return line;
  });
  const rebuildBolts = () => bolts.forEach((line, b) => {
    const arr = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < BOLT_POINTS; i++) {
      const k = i / (BOLT_POINTS - 1);
      const jitter = i === 0 || i === BOLT_POINTS - 1 ? 0 : 0.32;
      arr[i * 3] = strikeX[b] * (1 - k) + (Math.random() - 0.5) * jitter;
      arr[i * 3 + 1] = 5 - (5 - 1.15) * k;
      arr[i * 3 + 2] = 0.3 * (1 - k) + (Math.random() - 0.5) * jitter;
    }
    line.geometry.attributes.position.needsUpdate = true;
  });

  /* ---------- scroll progress: 0 = section just below the screen, 1 = card well in view */
  const progress = () => {
    const r = stage.getBoundingClientRect(), vh = window.innerHeight || 800;
    return clamp01((vh * 0.92 - r.top) / (vh * 0.55));
  };

  const still = reduceMotion();
  let formed = false;
  let formedAmount = still ? 1 : 0; // eases the "formed" effects in and out
  let strikeAt = -1;
  let boltAt = 0;
  let burstAt = -1;
  let visible = false;
  let raf = 0;
  let last = performance.now();
  let lastP = -1;

  const place = (p: number) => {
    for (let i = 0; i < count; i++) {
      const k = easeInOut(clamp01((p - delay[i]) / 0.65));
      const ang = (1 - k) * swirl[i];
      const c = Math.cos(ang), s = Math.sin(ang);
      const sx = start[i * 3] * c - start[i * 3 + 2] * s, sz = start[i * 3] * s + start[i * 3 + 2] * c;
      live[i * 3] = sx + (target[i * 3] - sx) * k;
      live[i * 3 + 1] = start[i * 3 + 1] + (target[i * 3 + 1] - start[i * 3 + 1]) * k;
      live[i * 3 + 2] = sz + (target[i * 3 + 2] - sz) * k;
    }
    geo.attributes.position.needsUpdate = true;
  };

  const frame = (now: number) => {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    const p = still ? 1 : progress();
    if (Math.abs(p - lastP) > 0.0005) { place(p); lastP = p; }

    if (!still) {
      // complete: lightning and a flash; back up: it breaks apart again
      if (!formed && p >= 0.995) {
        formed = true;
        strikeAt = now;
        flash.classList.remove('is-strike');
        void flash.offsetWidth;
        flash.classList.add('is-strike');
      } else if (formed && p < 0.95) {
        formed = false;
        strikeAt = -1;
      }
      const since = strikeAt < 0 ? -1 : now - strikeAt;
      const boltsOn = since >= 0 && since < 520;
      if (boltsOn && now - boltAt > 60) { rebuildBolts(); boltAt = now; }
      bolts.forEach((l) => {
        l.visible = boltsOn;
        (l.material as THREE.LineBasicMaterial).opacity = boltsOn && Math.random() < 0.8 ? 0.95 : 0;
      });
      mat.uniforms.uFlash.value = since >= 0 ? Math.max(0, 1 - since / 700) : 0;
    }
    formedAmount += ((formed || still ? 1 : 0) - formedAmount) * Math.min(1, dt * 3);

    for (const m of [mat, ringMat]) {
      m.uniforms.uTime.value = time;
      m.uniforms.uForm.value = formedAmount;
    }
    // a band of light rises through the gift every ~3 s
    mat.uniforms.uSweep.value = -1.6 + ((time * 0.9) % 3.2);
    // hover / tap: the particles push out and settle back
    const b = burstAt < 0 ? 0 : (now - burstAt) / 900;
    mat.uniforms.uBurst.value = b > 0 && b < 1 ? Math.sin(b * Math.PI) * 0.6 : 0;
    // the formed gift turns slowly; while forming it stays square to the camera
    gift.rotation.y = formed ? gift.rotation.y + dt * 0.25 : gift.rotation.y * 0.9;
    gift.position.y = Math.sin(now / 650) * 0.06 * formedAmount;
    ring.rotation.y += dt * 0.6;
    ringMat.uniforms.uOpacity.value = formedAmount;
    ring.visible = formedAmount > 0.02;

    portal.update(now, dt, still ? 0 : (formed ? 0.15 : p * 0.4));
    renderer.render(scene, camera);
    if (!still) raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  size();
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) run(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }).observe(stage);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { size(); if (!raf) renderer.render(scene, camera); }).observe(slot);
  }

  const burst = () => { if (formed || still) burstAt = performance.now(); run(); };
  stage.addEventListener('pointerenter', burst);
  stage.addEventListener('click', burst);
}

/** Builds the box only when its section comes near the screen (lite devices: while idle). */
export function initGiftShowcase(): void {
  const stage = document.getElementById('giftShowcase');
  const slot = document.getElementById('giftShowcaseSlot');
  if (!stage || !slot) return;
  const go = () => { build(stage, slot).catch(() => stage.classList.add('is-static')); };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (LITE) {
    if (idle) idle(go, { timeout: 1200 }); else window.setTimeout(go, 300);
    return;
  }
  if (!('IntersectionObserver' in window)) { go(); return; }
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    if (idle) idle(go, { timeout: 600 }); else window.setTimeout(go, 0);
  }, { rootMargin: '700px 0px' });
  io.observe(stage);
}
