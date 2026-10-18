/**
 * The DAOVAULT token (DV) as a small minted 3D coin (owner, 2026-10-15: "like the trophy, a real
 * token"): thick gold coin, the DV logo on both faces with "DAOVAULT · DV TOKEN" engraved around
 * it, a reeded edge, slow spin, float and a light that sweeps across. Used by the header "DV Token"
 * button and the DV allocation card (dashboard.ts initDvToken).
 * Phones in lite mode / no WebGL / reduced motion keep the flat logo with a CSS spin instead
 * (the slot gets .is-css). Renders only while visible and the tab is shown.
 */
import * as THREE from 'three';
import { LITE } from './perf.ts';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** quarter turn that makes the face texture upright on the coin's caps */
const FACE_TURN = Math.PI / 2;

let logo: Promise<HTMLImageElement> | null = null;
const loadLogo = () =>
  (logo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = '/favicon.png';
  }));

/** coin face: gold rim, engraved ring text, dark field, the DV logo in the middle */
function faceTexture(img: HTMLImageElement, engraved: boolean): THREE.CanvasTexture {
  const S = 512,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const R = S / 2;
  g.translate(R, R);
  const rim = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  rim.addColorStop(0, '#fff3b0');
  rim.addColorStop(0.45, '#e2b844');
  rim.addColorStop(0.8, '#a9781c');
  rim.addColorStop(1, '#6e4a0c');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  // raised inner ring
  g.lineWidth = S * 0.018;
  g.strokeStyle = '#fff1c2';
  g.beginPath();
  g.arc(0, 0, R * 0.86, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = S * 0.01;
  g.strokeStyle = '#7a520f';
  g.beginPath();
  g.arc(0, 0, R * 0.66, 0, Math.PI * 2);
  g.stroke();
  if (engraved) {
    g.fillStyle = '#5a3c08';
    g.font = `700 ${Math.round(S * 0.06)}px "Space Grotesk", Arial, sans-serif`;
    const text = 'DAOVAULT  ·  DV TOKEN  ·  BNB SMART CHAIN  ·  ';
    const step = (Math.PI * 2) / text.length;
    for (let i = 0; i < text.length; i++) {
      // 'DAOVAULT' centred over the top of the coin, reading clockwise
      g.save();
      g.rotate((i - 4) * step);
      g.translate(0, -R * 0.76);
      g.textAlign = 'center';
      g.fillText(text[i], 0, 0);
      g.restore();
    }
  }
  // dark field + logo
  g.fillStyle = '#0b0904';
  g.beginPath();
  g.arc(0, 0, R * 0.64, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(0, 0, R * 0.6, 0, Math.PI * 2);
  g.clip();
  const L = R * 1.18;
  g.drawImage(img, -L / 2, -L / 2, L, L);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the cylinder cap maps the canvas a quarter turn off: turn it back so the logo stands upright
  tex.center.set(0.5, 0.5);
  tex.rotation = FACE_TURN;
  return tex;
}

/** reeded (ridged) coin edge */
function edgeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 512; x += 8) {
    const gr = g.createLinearGradient(x, 0, x + 8, 0);
    gr.addColorStop(0, '#7a520f');
    gr.addColorStop(0.5, '#ffe28a');
    gr.addColorStop(1, '#7a520f');
    g.fillStyle = gr;
    g.fillRect(x, 0, 8, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * Mounts a 3D DV coin of `size` CSS px into `slot` (its <img> stays as the fallback). `engraved`
 * adds the ring text (worth it from about 60 px). Returns false when it fell back to CSS.
 */
export async function mountDvToken3D(
  slot: HTMLElement,
  size: number,
  engraved = false,
): Promise<boolean> {
  if (slot.dataset.dv3d) return true;
  slot.dataset.dv3d = '1';
  if (LITE || reduceMotion() || !hasWebGL()) {
    slot.classList.add('is-css');
    return false;
  }
  let img: HTMLImageElement;
  try {
    img = await loadLogo();
  } catch {
    slot.classList.add('is-css');
    return false;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'dv3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {
    slot.classList.add('is-css');
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  slot.appendChild(canvas);
  slot.classList.add('has-3d');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 5.4);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff1c1, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const sweep = new THREE.PointLight(0xffe08a, 6, 6); // the light that runs across the face
  scene.add(sweep);

  const face = faceTexture(img, engraved);
  const faceBack = face.clone();
  faceBack.needsUpdate = true;
  faceBack.center.set(0.5, 0.5);
  faceBack.rotation = -FACE_TURN; // the back cap is mirrored: the opposite quarter turn keeps it upright
  const faceMat = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map,
      metalness: 0.55,
      roughness: 0.32,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.32,
    });
  const edgeMat = new THREE.MeshStandardMaterial({
    map: edgeTexture(),
    metalness: 0.8,
    roughness: 0.25,
    emissive: 0x3a2a05,
    emissiveIntensity: 0.6,
  });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.26, 72, 1), [
    edgeMat,
    faceMat(face),
    faceMat(faceBack),
  ]);
  coin.rotation.x = Math.PI / 2; // faces toward the camera
  const pivot = new THREE.Group();
  pivot.add(coin);
  pivot.rotation.x = -0.12;
  scene.add(pivot);

  let visible = true;
  if ('IntersectionObserver' in window)
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    }).observe(slot);
  let hovered = false;
  const host = slot.closest('button, section') ?? slot;
  host.addEventListener('pointerenter', (e) => {
    if ((e as PointerEvent).pointerType !== 'touch') hovered = true;
  });
  host.addEventListener('pointerleave', () => {
    hovered = false;
  });

  let t = Math.random() * 6;
  let last = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (document.hidden || !visible || now - last < 30) return; // ~33 fps is plenty for a coin
    last = now;
    t += 0.033;
    // slow turn, a quicker half-flip now and then, a gentle float
    const flip = Math.max(0, Math.sin(t * 0.55) - 0.92) * 9;
    pivot.rotation.y += (hovered ? 0.06 : 0.018) + flip * 0.08;
    pivot.position.y = Math.sin(t * 1.8) * 0.06;
    sweep.position.set(Math.sin(t * 1.3) * 2.2, Math.cos(t * 0.9) * 1.2, 2.2);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
  return true;
}
