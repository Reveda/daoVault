/**
 * DAOvault AI — our own 3D Apex trophy (replaces the third-party Lottie trophy)
 *
 * Built in three.js with real metallic reflections (RoomEnvironment):
 *  - a lathe-turned gold chalice with two curved handles and a DAOvault medallion
 *  - an obsidian stepped base with gold rings and a DV plaque
 *  - DV coins orbiting the trophy and spinning coins popping out of the cup (instanced),
 *    gold sparkles rising, a soft floor glow; a lighter build on phones
 *  - rises in with a gold burst when the section scrolls in; sways and leans toward
 *    the pointer; a click spins it and fires another burst
 * Renders only while on screen. Without WebGL the stage shows the DAOVAULT logo.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { hasWebGL } from './core.ts';
import { LITE } from './perf.ts';

const GOLD = 0xd9ad3c;
const GOLD_LIGHT = 0xffe08a;

function loadTexture(src: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** round gold-on-black DV medallion face, drawn once on a canvas */
function medallionTexture(logo: HTMLImageElement | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(220, 200, 20, 256, 256, 256);
  grad.addColorStop(0, '#2a2210');
  grad.addColorStop(1, '#050505');
  g.fillStyle = grad;
  g.beginPath(); g.arc(256, 256, 256, 0, Math.PI * 2); g.fill();
  g.lineWidth = 18; g.strokeStyle = '#e8b830';
  g.beginPath(); g.arc(256, 256, 240, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (logo) {
    const draw = () => {
      g.save();
      g.beginPath(); g.arc(256, 256, 214, 0, Math.PI * 2); g.clip();
      g.drawImage(logo, 256 - 190, 256 - 190, 380, 380);
      g.restore();
      tex.needsUpdate = true;
    };
    if (logo.complete && logo.naturalWidth) draw(); else logo.addEventListener('load', draw, { once: true });
  }
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 214, 110, 0.9)');
  grad.addColorStop(0.4, 'rgba(212, 175, 55, 0.35)');
  grad.addColorStop(1, 'rgba(212, 175, 55, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildApexTrophy(): void {
  const stage = document.getElementById('trophyVisual');
  const slot = document.getElementById('trophyLottie');
  if (!stage || !slot) return;
  slot.innerHTML = '';
  slot.classList.add('trophy-3d-slot');

  if (!hasWebGL()) {
    // no WebGL: a still render of this same trophy (captured from the 3D scene)
    slot.innerHTML = '<img class="trophy-canvas trophy-static" src="/assets/trophy-static.webp" alt="" width="435" height="490" decoding="async" loading="lazy" />';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'trophy-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  slot.appendChild(canvas);

  // phones / low-core devices get a lighter build (fewer segments, coins, sparkles, lower pixel ratio)
  const lite = window.matchMedia('(max-width: 900px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  if (lite) {
    // phones: no reflection map (building it stalls the page); a studio light rig makes the gold read instead
    scene.add(new THREE.HemisphereLight(0xfff4d6, 0x2a1d05, 1.6));
    const fill = new THREE.DirectionalLight(0xffe9b0, 1.4);
    fill.position.set(-4, 2, 3);
    scene.add(fill);
  } else {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.6, 8.0);
  camera.lookAt(0, 0.35, 0);

  // warm studio light so the gold reads as gold, plus a moving glint light
  scene.add(new THREE.AmbientLight(0xfff3d6, 0.35));
  const key = new THREE.DirectionalLight(0xfff1cc, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const glint = new THREE.PointLight(0xffe7a0, 18, 9, 1.6);
  scene.add(glint);

  // without a reflection map (phones) fully metallic gold looks dark, so it is less metallic there
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: lite ? 0.55 : 1, roughness: lite ? 0.32 : 0.2, envMapIntensity: 1.25 });
  const goldLight = new THREE.MeshStandardMaterial({ color: GOLD_LIGHT, metalness: lite ? 0.5 : 1, roughness: lite ? 0.25 : 0.12, envMapIntensity: 1.4 });
  const goldInner = new THREE.MeshStandardMaterial({ color: 0xa8761b, metalness: 1, roughness: 0.35, side: THREE.BackSide });
  const obsidian = new THREE.MeshStandardMaterial({ color: 0x0b0a08, metalness: 0.6, roughness: 0.28, envMapIntensity: 0.9 });

  const trophy = new THREE.Group();
  const rig = new THREE.Group();     // entrance / pointer tilt
  rig.add(trophy);
  scene.add(rig);

  // ── chalice: one lathe profile from stem to rim ──
  const profile = [
    [0.0, -0.78], [0.2, -0.78], [0.17, -0.66], [0.12, -0.42], [0.1, -0.18], [0.16, -0.06], [0.3, 0.02],
    [0.2, 0.1], [0.24, 0.22], [0.46, 0.36], [0.72, 0.62], [0.88, 0.95], [0.95, 1.28], [0.98, 1.5], [1.03, 1.58], [1.0, 1.63],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, lite ? 48 : 96), gold);
  trophy.add(cup);
  const innerProfile = [[0.0, 0.5], [0.42, 0.56], [0.7, 0.9], [0.86, 1.25], [0.93, 1.58]].map(([x, y]) => new THREE.Vector2(x, y));
  trophy.add(new THREE.Mesh(new THREE.LatheGeometry(innerProfile, lite ? 48 : 96), goldInner));
  // polished rim and knot rings
  const ring = (r: number, t: number, y: number, mat = goldLight) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 16, 96), mat);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    trophy.add(m);
  };
  ring(1.0, 0.045, 1.62);
  ring(0.29, 0.04, 0.02);
  ring(0.9, 0.025, 1.05);

  // handles
  for (const side of [1, -1]) {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0.92 * side, 1.32, 0),
      new THREE.Vector3(1.62 * side, 1.42, 0),
      new THREE.Vector3(1.55 * side, 0.62, 0),
      new THREE.Vector3(0.7 * side, 0.6, 0),
    );
    trophy.add(new THREE.Mesh(new THREE.TubeGeometry(curve, lite ? 28 : 48, 0.065, lite ? 10 : 14, false), gold));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), goldLight);
    cap.position.copy(curve.getPoint(0.42));
    trophy.add(cap);
  }

  // DAOvault medallion on the cup front
  const logoImg = new Image();
  logoImg.src = '/favicon.png';
  const medalTex = medallionTexture(logoImg);
  const medal = new THREE.Mesh(new THREE.CircleGeometry(0.36, 64), new THREE.MeshStandardMaterial({ map: medalTex, metalness: 0.55, roughness: 0.35 }));
  medal.position.set(0, 1.0, 0.905);
  medal.rotation.x = -0.2;
  trophy.add(medal);
  const medalRing = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 12, 64), goldLight);
  medalRing.position.copy(medal.position);
  medalRing.rotation.x = -0.2;
  trophy.add(medalRing);

  // stepped obsidian base with gold rings and a plaque
  const base = new THREE.Group();
  base.position.y = -0.78;
  const step = (rTop: number, rBot: number, h: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 64), mat);
    m.position.y = y;
    base.add(m);
  };
  step(0.42, 0.5, 0.12, -0.06, gold);
  step(0.62, 0.7, 0.36, -0.3, obsidian);
  step(0.8, 0.86, 0.16, -0.56, obsidian);
  const baseRing = (r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 12, 96), goldLight);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    base.add(m);
  };
  baseRing(0.665, -0.12);
  baseRing(0.705, -0.48);
  baseRing(0.86, -0.64);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.02), goldLight);
  plaque.position.set(0, -0.3, 0.67);
  plaque.rotation.x = -0.11;
  base.add(plaque);
  const plaqueLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({ map: loadTexture('/favicon.png'), transparent: true }));
  plaqueLogo.position.set(0, -0.3, 0.682);
  plaqueLogo.rotation.x = -0.11;
  base.add(plaqueLogo);
  trophy.add(base);
  trophy.position.y = -0.15;

  // DV coins: a ring of coins orbiting the trophy + a fountain of coins popping out of the cup.
  // Both are InstancedMeshes (one draw call each), so this stays light on phones.
  const coinTex = loadTexture('/favicon.png');
  const faceMat = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.6, roughness: 0.3 });
  const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.035, lite ? 20 : 32);
  const ORBIT = lite ? 8 : 12;
  const FOUNT = lite ? 6 : 10;
  const orbitCoins = new THREE.InstancedMesh(coinGeo, [gold, faceMat, faceMat], ORBIT);
  const fountCoins = new THREE.InstancedMesh(coinGeo, [gold, faceMat, faceMat], FOUNT);
  rig.add(orbitCoins, fountCoins);
  const tmp = new THREE.Object3D();
  // fountain state: position, velocity, spin, delay
  const fPos = new Float32Array(FOUNT * 3);
  const fVel = new Float32Array(FOUNT * 3);
  const fSpin = new Float32Array(FOUNT);
  const fWait = new Float32Array(FOUNT);
  const CUP_Y = 1.45;
  const launch = (i: number) => {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 0.7;
    fPos.set([Math.cos(a) * 0.3, CUP_Y, Math.sin(a) * 0.3], i * 3);
    fVel.set([Math.cos(a) * s, 2.6 + Math.random() * 0.8, Math.sin(a) * s * 0.7], i * 3);
    fSpin[i] = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6);
  };
  for (let i = 0; i < FOUNT; i++) { launch(i); fWait[i] = i * (2.4 / FOUNT); }
  const updateCoins = (t: number, dt: number) => {
    for (let i = 0; i < ORBIT; i++) {
      const a = (i / ORBIT) * Math.PI * 2 + t * 0.55;
      tmp.position.set(Math.cos(a) * 1.75, 0.55 + Math.sin(a * 2 + i) * 0.28, Math.sin(a) * 1.0);
      tmp.rotation.set(Math.PI / 2, 0, 0);
      tmp.rotateZ(-a + t * 2.4 + i);      // each coin spins as it circles
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      orbitCoins.setMatrixAt(i, tmp.matrix);
    }
    orbitCoins.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < FOUNT; i++) {
      if (fWait[i] > 0) {
        fWait[i] -= dt;
        tmp.scale.setScalar(0.0001);
      } else {
        fVel[i * 3 + 1] -= 5.2 * dt;
        fPos[i * 3] += fVel[i * 3] * dt;
        fPos[i * 3 + 1] += fVel[i * 3 + 1] * dt;
        fPos[i * 3 + 2] += fVel[i * 3 + 2] * dt;
        if (fPos[i * 3 + 1] < -1.5) { launch(i); fWait[i] = Math.random() * 0.8; }
        // grow out of the cup mouth
        const born = Math.min(1, (fPos[i * 3 + 1] - CUP_Y + 0.6) / 0.6);
        tmp.scale.setScalar(Math.max(0.0001, fVel[i * 3 + 1] > 0 ? born : 1));
      }
      tmp.position.set(fPos[i * 3], fPos[i * 3 + 1] - 0.15, fPos[i * 3 + 2]);
      tmp.rotation.set(t * fSpin[i] * 0.3, t * fSpin[i], 0);
      tmp.updateMatrix();
      fountCoins.setMatrixAt(i, tmp.matrix);
    }
    fountCoins.instanceMatrix.needsUpdate = true;
  };

  // floor glow + glow at the cup mouth
  const glowTex = glowTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  rig.add(floor);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
  halo.scale.set(2.2, 1.2, 1);
  halo.position.y = 1.5;
  trophy.add(halo);

  // rising sparkles
  const N = lite ? 60 : 140;
  const pos = new Float32Array(N * 3);
  const speed = new Float32Array(N);
  const resetSpark = (i: number, anywhere: boolean) => {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 1.7;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = anywhere ? -1.6 + Math.random() * 4.4 : -1.6;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.6;
    speed[i] = 0.25 + Math.random() * 0.6;
  };
  for (let i = 0; i < N; i++) resetSpark(i, true);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    map: glowTex, size: 0.09, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  rig.add(sparks);

  // gold burst (entrance + click)
  const BURST = 70;
  const burstPos = new Float32Array(BURST * 3);
  const burstVel = new Float32Array(BURST * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burstMat = new THREE.PointsMaterial({ map: glowTex, size: 0.16, color: 0xfff1b8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  rig.add(new THREE.Points(burstGeo, burstMat));
  let burstT = -1;
  const burst = () => {
    for (let i = 0; i < BURST; i++) {
      burstPos.set([0, 1.1, 0], i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 0.4;
      const s = 2 + Math.random() * 2.6;
      burstVel.set([Math.cos(a) * s, up * s * 0.7 + 1.2, Math.sin(a) * s * 0.6], i * 3);
    }
    burstT = 0;
  };

  // sizing
  const resize = () => {
    const w = slot.clientWidth || 380;
    const h = slot.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(slot);
  resize();

  // pointer lean + click spin
  let leanX = 0, leanY = 0, spin = 0;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    leanY = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
    leanX = ((e.clientY - r.top) / r.height - 0.5) * 0.25;
  });
  stage.addEventListener('pointerleave', () => { leanX = 0; leanY = 0; });
  stage.addEventListener('click', () => { spin += Math.PI * 2; burst(); });

  // entrance when the section scrolls in (once)
  let entered = -1;
  let visible = false;
  let raf = 0;
  const clock = new THREE.Clock();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let spun = 0;

  const frame = () => {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // entrance: rise + grow with an overshoot, burst at the top
    if (entered >= 0 && entered < 1) {
      entered = Math.min(1, entered + dt / 1.6);
      const e = entered;
      const ease = 1 - Math.pow(1 - e, 3);
      const over = Math.sin(e * Math.PI) * 0.08;
      rig.position.y = -2.4 * (1 - ease);
      rig.scale.setScalar(0.55 + 0.45 * ease + over);
      if (e >= 0.62 && burstT < 0) burst();
    }

    // idle sway (keeps the DAOvault medallion mostly facing the viewer) + click spins
    spun += (spin - spun) * Math.min(1, dt * 3);
    const sway = reduce ? 0 : Math.sin(t * 0.55) * 0.55;
    trophy.rotation.y = sway + spun;
    rig.rotation.y += (leanY - rig.rotation.y) * 0.08;
    rig.rotation.x += (leanX - rig.rotation.x) * 0.08;
    trophy.position.y = -0.15 + (reduce ? 0 : Math.sin(t * 1.2) * 0.05);

    updateCoins(t, dt);
    glint.position.set(Math.cos(t * 0.8) * 2.6, 1.6 + Math.sin(t * 1.3) * 0.6, 2.4 + Math.sin(t * 0.8) * 0.8);

    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] += speed[i] * dt;
      if (pos[i * 3 + 1] > 2.9) resetSpark(i, false);
    }
    sparkGeo.attributes.position.needsUpdate = true;

    if (burstT >= 0) {
      burstT += dt;
      for (let i = 0; i < BURST; i++) {
        burstVel[i * 3 + 1] -= 4.2 * dt;
        burstPos[i * 3] += burstVel[i * 3] * dt;
        burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
        burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
      }
      burstGeo.attributes.position.needsUpdate = true;
      burstMat.opacity = Math.max(0, 1 - burstT / 1.4);
      if (burstT > 1.4) { burstT = -1; burstMat.opacity = 0; }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  if (reduce) entered = 1;
  rig.position.y = reduce ? 0 : -2.4;
  rig.scale.setScalar(reduce ? 1 : 0.55);

  // compile the materials off the main frame first (parallel shader compile where the
  // GPU supports it); the first draw used to stall the page for ~0.9s
  let compiled = false;
  const start = () => {
    if (!compiled || !visible) return;
    if (entered < 0) entered = 0;
    clock.getDelta();
    if (!raf) raf = requestAnimationFrame(frame);
  };
  renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
    // one warm-up draw right away: uploads the textures to the GPU now (during the splash
    // on lite devices) instead of on the first visible frame
    renderer.render(scene, camera);
    compiled = true;
    start();
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  }, { threshold: 0.2 }).observe(stage);
}

/**
 * Builds the trophy only when its section comes near the screen, so none of the 3D
 * setup (reflections, geometry, shaders) competes with the page load.
 */
export function initApexTrophy(): void {
  const stage = document.getElementById('trophyVisual');
  if (!stage) return;
  // Lite devices (phones, low-power): build the 3D trophy during the splash screen, while
  // the visitor waits anyway. Building it on scroll-in (creating WebGL + compiling the
  // shaders) froze the page for ~0.5-0.9s right as Rank Rewards came on screen. The frame
  // loop still only runs while the trophy is visible.
  if (LITE) {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(() => buildApexTrophy(), { timeout: 1200 }); else window.setTimeout(buildApexTrophy, 300);
    return;
  }
  if (!('IntersectionObserver' in window)) { buildApexTrophy(); return; }
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(() => buildApexTrophy(), { timeout: 600 }); else window.setTimeout(buildApexTrophy, 0);
  }, { rootMargin: '600px 0px' });
  io.observe(stage);
}
