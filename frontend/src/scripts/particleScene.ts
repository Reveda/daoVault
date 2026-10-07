/**
 * DAOvault AI — Morphing Particle Scene (gold palette, DAOvault identity)
 *
 * One cloud of glowing gold particles sits behind the page. In the hero it is
 * loose dust; entering a section scatters it into a swirl and re-forms it into
 * the DAOvault logo itself (sampled from /assets/DAOlogo.jpg): the full logo,
 * the DV mark or the vault dial, beside that section's heading. Gold lightning
 * strikes the shape at irregular intervals and flashes the page.
 *
 * Sections opt in with `data-scene="<state>"`; see SCENE_STATES.
 */

import * as THREE from 'three';
import { LITE } from './perf.ts';

/** views of the DAOvault logo, sampled from the logo image */
type LogoShape = 'logo' | 'mark' | 'dial';
/** shapes built in code (`vault` also stands in until the logo image has loaded) */
type ProceduralShape = 'dust' | 'vault';
type ShapeName = LogoShape | ProceduralShape;

export interface SceneState {
  shape: ShapeName;
  /** horizontal centre as a fraction of half the viewport width (-1 left … 1 right) */
  x: number;
  /** vertical centre as a fraction of half the viewport height */
  y: number;
  s: number;
  op: number;
  /** how often lightning strikes (0 = never) */
  storm: number;
  /** overrides on narrow screens, where content fills the width */
  mx?: number;
  my?: number;
  mop?: number;
  /**
   * CSS selector of a layout slot the shape forms inside and follows while the
   * page scrolls. Falls back to x / y when the slot is hidden.
   */
  anchor?: string;
  /** how much of the slot the shape fills (1 = touches the slot's shorter side) */
  fit?: number;
}

export const SCENE_STATES: Record<string, SceneState> = {
  // landing, in page order. Hero: loose dust only (the logo video has the stage).
  hero:    { shape: 'dust', x: 0,     y: 0,    s: 1,    op: 0.4,  storm: 0.35, mop: 0.3 },
  metrics: { shape: 'dial', x: 0.56,  y: 0,    s: 0.95, op: 0.8,  storm: 0.5, anchor: '#heroMetrics .scene-slot', fit: 0.9 },
  vision:  { shape: 'mark', x: -0.58, y: 0,    s: 0.95, op: 0.85, storm: 0.6, anchor: '#vision .scene-slot' },
  ranks:   { shape: 'logo', x: 0.58,  y: 0,    s: 0.95, op: 0.85, storm: 0.8, anchor: '#ranks .scene-slot' },
  matrix:  { shape: 'dial', x: -0.58, y: 0,    s: 0.95, op: 0.8,  storm: 0.6, anchor: '#matrix .scene-slot' },
  about:   { shape: 'mark', x: 0.58,  y: 0,    s: 0.95, op: 0.8,  storm: 0.5, anchor: '#about .scene-slot', fit: 0.9 },
  compare: { shape: 'logo', x: -0.56, y: 0,    s: 0.85, op: 0.8,  storm: 0.6, anchor: '#compare .scene-slot' },
  how:     { shape: 'dial', x: 0.6,   y: 0,    s: 0.95, op: 0.8,  storm: 0.6, anchor: '#how .scene-slot' },
  join:    { shape: 'dial', x: 0,     y: 0.25, s: 1.1,  op: 0.7,  storm: 1.6, mop: 0.6, anchor: '#join .scene-slot', fit: 0.95 },
  quiz:    { shape: 'logo', x: -0.6,  y: -0.1, s: 0.95, op: 0.8,  storm: 1.4, mx: 0, my: -0.35, mop: 0.35, anchor: '#quiz .scene-slot' },
  footer:  { shape: 'dust', x: 0,     y: 0,    s: 1,    op: 0.35, storm: 0.2 },
  // dashboard: the logo forms while the wallet is checked, then calm dust
  vault:   { shape: 'logo', x: 0,     y: 0.05, s: 1.1,  op: 0.9,  storm: 1.0, mop: 0.7 },
  dash:    { shape: 'dust', x: 0,     y: 0,    s: 1,    op: 0.28, storm: 0.2, mop: 0.22 },
};

/** Natural motion per shape: continuous spin, or a gentle sway for flat shapes. */
const SHAPE_META: Record<ShapeName, { spin: number; sway: number; tilt: number }> = {
  dust:  { spin: 0.015, sway: 0,    tilt: 0 },
  vault: { spin: 0,     sway: 0.32, tilt: 0 },
  logo:  { spin: 0,     sway: 0.4,  tilt: 0 },
  mark:  { spin: 0,     sway: 0.45, tilt: 0 },
  dial:  { spin: 0,     sway: 0.35, tilt: 0 },
};

const TAU = Math.PI * 2;
const MORPH_SECONDS = 2.4;
/** rough radius every shape fills at scale 1 (world units) */
const SHAPE_RADIUS = 7.5;
const NARROW_QUERY = '(max-width: 900px)';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** soft bell-shaped jitter in roughly [-s, s] */
const jit = (s: number) => (Math.random() + Math.random() + Math.random() - 1.5) * s * 0.66;

/* ------------------------------------------------------------------ procedural shapes */
// Every generator fills exactly n points (radius roughly 7 world units).

type Pt = [number, number];

function pathSampler(pts: Pt[], closed: boolean): (t: number) => Pt {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  return (t: number): Pt => {
    const d = t * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k];
  };
}

const SHAPES: Record<ProceduralShape, (n: number, out: Float32Array) => void> = {
  // ambient dust spread across the whole view
  dust(n, out) {
    for (let i = 0; i < n; i++) {
      out[i * 3] = rand(-32, 32);
      out[i * 3 + 1] = rand(-18, 18);
      out[i * 3 + 2] = rand(-12, 8);
    }
  },

  // the DAOvault vault: pointy-top hexagon frame, inner hexagon, cog dial, glowing core
  vault(n, out) {
    const hex = (R: number): Pt[] =>
      Array.from({ length: 6 }, (_, k) => {
        const a = Math.PI / 2 + (k * TAU) / 6;
        return [Math.cos(a) * R, Math.sin(a) * R] as Pt;
      });
    const outer = pathSampler(hex(7.2), true);
    const inner = pathSampler(hex(5.6), true);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      let x: number, y: number, z: number;
      if (u < 0.42) {
        [x, y] = outer(Math.random());
        x += jit(0.25); y += jit(0.25); z = jit(0.8);
      } else if (u < 0.58) {
        [x, y] = inner(Math.random());
        z = jit(0.4);
      } else if (u < 0.8) {
        const a = Math.random() * TAU;
        const r = 3.6 + (Math.sin(a * 12) > 0.3 ? 0.4 : 0) + jit(0.12);
        x = Math.cos(a) * r; y = Math.sin(a) * r; z = jit(0.3);
      } else {
        const a = Math.random() * TAU, b = Math.acos(rand(-1, 1));
        const r = 1.7 * Math.cbrt(Math.random());
        x = Math.sin(b) * Math.cos(a) * r; y = Math.cos(b) * r; z = Math.sin(b) * Math.sin(a) * r;
      }
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
  },
};

/* ------------------------------------------------------------------ the DAOvault logo, in particles */

const LOGO_URL = '/assets/DAOlogo.jpg';
/** regions of DAOlogo.jpg as [left, top, right, bottom] fractions of the image */
const LOGO_REGIONS: Record<LogoShape, [number, number, number, number]> = {
  logo: [0.13, 0.15, 0.87, 0.82],   // DV mark + "DAOVault"
  mark: [0.26, 0.16, 0.76, 0.62],   // the DV mark
  dial: [0.335, 0.25, 0.51, 0.51],  // the vault dial inside the D
};
const LOGO_SHAPES = Object.keys(LOGO_REGIONS) as LogoShape[];
const isLogoShape = (name: ShapeName): name is LogoShape => name in LOGO_REGIONS;

/** world-space x/y of every bright logo pixel, per region (pairs of floats) */
type LogoPools = Record<LogoShape, Float32Array>;

function sampleLogo(img: HTMLImageElement): LogoPools | null {
  // fine enough that the small dial crop has no visible pixel grid
  const W = 1024;
  const H = Math.round((W * img.naturalHeight) / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, W, H);
  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, W, H).data;
  } catch {
    return null;
  }
  const pools = {} as LogoPools;
  LOGO_SHAPES.forEach((name) => {
    const [l, t, r, b] = LOGO_REGIONS[name];
    const x0 = Math.floor(l * W), x1 = Math.ceil(r * W), y0 = Math.floor(t * H), y1 = Math.ceil(b * H);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const unit = (2 * 7.2) / Math.max(x1 - x0, y1 - y0);
    // the dial is round: leave out the corners of the D around it
    const maxR = name === 'dial' ? Math.min(x1 - x0, y1 - y0) / 2 : Infinity;
    const pts: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (Math.hypot(x - cx, y - cy) > maxR) continue;
        const k = (y * W + x) * 4;
        const lum = (data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11) / 255;
        if (lum > 0.28) pts.push((x - cx) * unit, (cy - y) * unit);
      }
    }
    pools[name] = new Float32Array(pts);
  });
  return pools;
}

/** n particles on the logo's bright pixels, with a front and back face for depth */
function fillFromLogo(pool: Float32Array, n: number, out: Float32Array): void {
  const m = pool.length / 2;
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * m);
    out[i * 3] = pool[j * 2] + jit(0.07);
    out[i * 3 + 1] = pool[j * 2 + 1] + jit(0.07);
    out[i * 3 + 2] = (Math.random() < 0.5 ? 0.4 : -0.4) + jit(0.15);
  }
}

/* ------------------------------------------------------------------ shaders */

const CLOUD_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uMix;
  uniform float uPx;
  uniform float uSize;
  uniform float uFlash;
  uniform float uOpacity;
  uniform float uShimmer;
  attribute vec3 aTo;
  attribute vec4 aSeed;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 goldRamp(float t) {
    vec3 a = vec3(1.0, 0.96, 0.82);
    vec3 b = vec3(0.98, 0.80, 0.32);
    vec3 c = vec3(0.83, 0.63, 0.17);
    vec3 d = vec3(0.56, 0.41, 0.10);
    if (t < 0.33) return mix(a, b, t / 0.33);
    if (t < 0.66) return mix(b, c, (t - 0.33) / 0.33);
    return mix(c, d, (t - 0.66) / 0.34);
  }

  void main() {
    // each particle leaves a little later than the last, so the shape flows apart
    float t = clamp(uMix * 1.35 - aSeed.w * 0.35, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aTo, t);

    // mid-morph swirl: scatter outward and twist around the vertical axis
    float sc = sin(3.14159265 * t);
    float ang = sc * (1.2 + aSeed.x * 1.6);
    float cs = cos(ang);
    float sn = sin(ang);
    p.xz = mat2(cs, sn, -sn, cs) * p.xz;
    p += aSeed.xyz * sc * 4.5;

    float ph = aSeed.w * 6.2831853;
    p += vec3(sin(uTime * 0.8 + ph), cos(uTime * 0.67 + ph * 1.3), sin(uTime * 0.73 + ph * 0.7)) * uShimmer;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = clamp(40.0 / -mv.z, 0.4, 2.2);
    gl_PointSize = aSize * uSize * uPx * depth * (1.0 + uFlash * 0.6);

    vColor = mix(goldRamp(aSeed.z * 0.5 + 0.5), vec3(1.0), uFlash * 0.55 + sc * 0.25);
    float twinkle = 0.65 + 0.35 * sin(uTime * 1.6 + ph * 3.0);
    vAlpha = uOpacity * twinkle * (0.55 + 0.45 * clamp((p.z + 8.0) / 16.0, 0.0, 1.0)) * (1.0 + uFlash * 0.8);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float glow = exp(-d * 18.0);
    float core = exp(-d * 90.0) * 0.6;
    gl_FragColor = vec4(vColor * (glow + core), (glow + core) * vAlpha);
  }
`;

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPx;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.6 * uPx * (60.0 / -mv.z);
    vAlpha = 0.25 + 0.25 * sin(uTime * 0.5 + aPhase);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * exp(-d * 30.0), vAlpha);
  }
`;

/* ------------------------------------------------------------------ lightning */

function boltPath(a: THREE.Vector3, b: THREE.Vector3, depth: number, rough: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  let off = a.distanceTo(b) * rough;
  for (let d = 0; d < depth; d++) {
    const next: THREE.Vector3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const mid = pts[i - 1].clone().add(pts[i]).multiplyScalar(0.5);
      mid.x += (Math.random() - 0.5) * off;
      mid.y += (Math.random() - 0.5) * off;
      mid.z += (Math.random() - 0.5) * off * 0.5;
      next.push(mid, pts[i]);
    }
    pts = next;
    off *= 0.52;
  }
  return pts;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,248,220,1)');
    grd.addColorStop(0.25, 'rgba(255,214,110,0.55)');
    grd.addColorStop(1, 'rgba(212,175,55,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

interface Bolt {
  group: THREE.Group;
  materials: (THREE.LineBasicMaterial | THREE.PointsMaterial)[];
  born: number;
  life: number;
}

/* ------------------------------------------------------------------ the scene */

export interface ParticleSceneController {
  setScene(name: string): void;
  strike(): void;
  readonly current: string;
}

export function createParticleScene(
  canvas: HTMLCanvasElement,
  opts: { scene?: string; flashEl?: HTMLElement | null } = {},
): ParticleSceneController | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('[DAOvault] Particle scene unavailable:', err);
    return null;
  }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia(NARROW_QUERY);
  // lite (phones): far fewer particles, 1x pixels, 30fps (see frame())
  const COUNT = LITE ? 1300 : window.innerWidth < 760 ? 2600 : 5200;
  const px = () => (LITE ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
  let skip = false;

  renderer.setPixelRatio(px());
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 40);

  // distant star dust, so the page never feels empty between shapes
  const starCount = 260;
  const starPos = new Float32Array(starCount * 3);
  const starPhase = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = rand(-90, 90);
    starPos[i * 3 + 1] = rand(-55, 55);
    starPos[i * 3 + 2] = rand(-90, -30);
    starPhase[i] = Math.random() * TAU;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: px() } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // the morphing cloud
  const cache = new Map<ShapeName, Float32Array>();
  let logoPools: LogoPools | null = null;
  const shapeData = (name: ShapeName): Float32Array => {
    // until the logo image has been sampled, its shapes show the vault instead
    if (isLogoShape(name) && !logoPools) return shapeData('vault');
    let data = cache.get(name);
    if (!data) {
      data = new Float32Array(COUNT * 3);
      if (isLogoShape(name)) fillFromLogo((logoPools as LogoPools)[name], COUNT, data);
      else SHAPES[name](COUNT, data);
      cache.set(name, data);
    }
    return data;
  };

  const seeds = new Float32Array(COUNT * 4);
  const sizes = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    seeds[i * 4] = rand(-1, 1);
    seeds[i * 4 + 1] = rand(-1, 1);
    seeds[i * 4 + 2] = rand(-1, 1);
    seeds[i * 4 + 3] = Math.random();
    sizes[i] = Math.random() < 0.04 ? 2.4 : rand(0.6, 1.6);
  }

  const initialName = opts.scene && SCENE_STATES[opts.scene] ? opts.scene : 'hero';
  let state = SCENE_STATES[initialName];
  let currentName = initialName;
  let currentShape: ShapeName = state.shape;

  const fromArr = new Float32Array(shapeData(currentShape));
  const toArr = new Float32Array(shapeData(currentShape));
  const geo = new THREE.BufferGeometry();
  const fromAttr = new THREE.BufferAttribute(fromArr, 3);
  const toAttr = new THREE.BufferAttribute(toArr, 3);
  geo.setAttribute('position', fromAttr);
  geo.setAttribute('aTo', toAttr);
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);

  const uniforms = {
    uTime: { value: 0 },
    uMix: { value: 1 },
    uPx: { value: px() },
    uSize: { value: window.innerWidth < 760 ? 2.6 : 2.2 },
    uFlash: { value: 0 },
    uOpacity: { value: 0 },
    uShimmer: { value: reduceMotion ? 0.03 : 0.07 },
  };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(geo, cloudMat);
  const holder = new THREE.Group();
  holder.add(cloud);
  scene.add(holder);

  // smoothed presentation values (they chase the active state)
  const view = { x: 0, y: 0, s: 0.6, op: 0, tilt: SHAPE_META[currentShape].tilt, rotY: 0 };
  let spinBase = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const halfSize = () => {
    const halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { halfH, halfW: halfH * camera.aspect };
  };

  const anchors = new Map<string, Element | null>();
  const anchorRect = (): DOMRect | null => {
    if (!state.anchor) return null;
    if (!anchors.has(state.anchor)) anchors.set(state.anchor, document.querySelector(state.anchor));
    const r = anchors.get(state.anchor)?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? r : null;
  };

  const target = () => {
    const small = narrow.matches;
    const { halfH, halfW } = halfSize();
    const r = anchorRect();
    if (r) {
      // follow the slot: pixel centre -> world units at the z = 0 plane
      const pxPerUnit = window.innerHeight / 2 / halfH;
      return {
        x: (r.left + r.width / 2 - window.innerWidth / 2) / pxPerUnit,
        y: (window.innerHeight / 2 - (r.top + r.height / 2)) / pxPerUnit,
        s: (Math.min(r.width, r.height) / 2 / pxPerUnit / SHAPE_RADIUS) * (state.fit ?? 1),
        op: small ? state.mop ?? state.op * 0.7 : state.op,
        anchored: true,
      };
    }
    return {
      x: (small ? state.mx ?? 0 : state.x) * halfW,
      y: (small ? state.my ?? state.y : state.y) * halfH,
      s: state.s * (small ? 0.8 : 1),
      op: small ? state.mop ?? state.op * 0.55 : state.op,
      anchored: false,
    };
  };
  let switchedAt = -10;
  {
    const t0 = target();
    view.x = t0.x; view.y = t0.y;
  }

  const clock = new THREE.Clock();
  let last = 0;

  /* ---------------- lightning */
  const glowTex = glowTexture();
  const bolts: Bolt[] = [];
  let nextStrike = performance.now() / 1000 + rand(2.5, 5);
  const flashEl = opts.flashEl ?? null;

  const scheduleStrike = (now: number) => {
    const storm = Math.max(state.storm, 0.01);
    nextStrike = now + rand(3.5, 9) / storm;
  };

  function strike(): void {
    if (reduceMotion) return;
    holder.updateMatrixWorld(true);
    const j = Math.floor(Math.random() * COUNT);
    const end = new THREE.Vector3(toArr[j * 3], toArr[j * 3 + 1], toArr[j * 3 + 2]);
    cloud.localToWorld(end);
    const dir = new THREE.Vector3(rand(-1, 1), rand(0.4, 1), rand(-0.3, 0.3)).normalize();
    const start = end.clone().addScaledVector(dir, rand(14, 22));
    const main = boltPath(start, end, 5, 0.2);

    const group = new THREE.Group();
    const materials: Bolt['materials'] = [];
    const addLine = (pts: THREE.Vector3[], color: number) => {
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      materials.push(mat);
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      const glow = new THREE.PointsMaterial({ size: 1.1, map: glowTex, color: 0xffd76a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      materials.push(glow);
      group.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), glow));
    };
    addLine(main, 0xfff4c8);
    // one or two side branches
    const branches = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branches; b++) {
      const from = main[8 + Math.floor(Math.random() * 16)];
      const toward = from.clone().add(new THREE.Vector3(rand(-6, 6), rand(-7, -2), rand(-2, 2)));
      addLine(boltPath(from, toward, 3, 0.25), 0xd4af37);
    }
    scene.add(group);
    bolts.push({ group, materials, born: clock.getElapsedTime(), life: 0.42 });
    uniforms.uFlash.value = 1;
  }

  function updateBolts(t: number): void {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const age = t - b.born;
      if (age > b.life) {
        scene.remove(b.group);
        b.group.traverse((o) => {
          if (o instanceof THREE.Line || o instanceof THREE.Points) o.geometry.dispose();
        });
        b.materials.forEach((m) => m.dispose());
        bolts.splice(i, 1);
        continue;
      }
      const flicker = age < 0.08 ? 1 : age % 0.06 < 0.03 ? 0.55 : 1;
      const fade = Math.pow(1 - age / b.life, 1.4) * flicker;
      b.materials.forEach((m) => { m.opacity = fade; });
    }
  }

  /* ---------------- morphing */
  /** Freezes every particle where it is right now, then sends it to `shape`. */
  function morphTo(shape: ShapeName): void {
    const mix = uniforms.uMix.value;
    if (mix < 1) {
      for (let i = 0; i < COUNT; i++) {
        let t = Math.min(1, Math.max(0, mix * 1.35 - seeds[i * 4 + 3] * 0.35));
        t = t * t * (3 - 2 * t);
        for (let k = 0; k < 3; k++) {
          const idx = i * 3 + k;
          fromArr[idx] += (toArr[idx] - fromArr[idx]) * t;
        }
      }
    } else {
      fromArr.set(toArr);
    }
    toArr.set(shapeData(shape));
    fromAttr.needsUpdate = true;
    toAttr.needsUpdate = true;
    uniforms.uMix.value = 0;
  }

  function setScene(name: string): void {
    const next = SCENE_STATES[name];
    if (!next || name === currentName) return;
    currentName = name;
    state = next;
    switchedAt = clock.getElapsedTime();
    if (next.shape !== currentShape) {
      morphTo(next.shape);
      const meta = SHAPE_META[next.shape];
      spinBase = meta.sway > 0 ? Math.round(view.rotY / TAU) * TAU : view.rotY;
      currentShape = next.shape;
      // a strike lands as the new shape settles
      if (next.storm > 0.3 && !reduceMotion) window.setTimeout(strike, MORPH_SECONDS * 650);
    }
    scheduleStrike(clock.getElapsedTime());
  }

  // sample the DAOvault logo once; a logo shape already on screen re-forms from it
  const logoImage = new Image();
  logoImage.decoding = 'async';
  logoImage.onload = () => {
    logoPools = sampleLogo(logoImage);
    if (logoPools && isLogoShape(currentShape)) morphTo(currentShape);
  };
  logoImage.src = LOGO_URL;

  /* ---------------- loop */
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function frame(): void {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (LITE && (skip = !skip)) return; // 30fps on phones
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last);
    last = t;

    const goal = target();
    const k = 1 - Math.exp(-dt * 2.2);
    // an anchored shape keeps up with scrolling, but glides there after a scene change
    const kPos = goal.anchored && t - switchedAt > 1 ? 1 - Math.exp(-dt * 12) : k;
    view.x += (goal.x - view.x) * kPos;
    view.y += (goal.y - view.y) * kPos;
    view.s += (goal.s - view.s) * k;
    view.op += (goal.op - view.op) * (1 - Math.exp(-dt * 1.6));

    const meta = SHAPE_META[currentShape];
    view.tilt += (meta.tilt - view.tilt) * k;
    if (meta.sway > 0) {
      const goalY = spinBase + Math.sin(t * 0.45) * meta.sway;
      view.rotY += (goalY - view.rotY) * k;
    } else {
      spinBase += meta.spin * dt * (reduceMotion ? 0.4 : 1);
      view.rotY += (spinBase - view.rotY) * k;
    }

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;

    holder.position.set(view.x, view.y, 0);
    holder.scale.setScalar(view.s);
    holder.rotation.set(view.tilt + pointer.y * 0.12, view.rotY + pointer.x * 0.25, 0);

    if (uniforms.uMix.value < 1) {
      uniforms.uMix.value = Math.min(1, uniforms.uMix.value + dt / (reduceMotion ? MORPH_SECONDS * 1.5 : MORPH_SECONDS));
    }
    uniforms.uTime.value = t;
    uniforms.uOpacity.value = view.op;
    uniforms.uFlash.value *= Math.exp(-dt * 7);
    starMat.uniforms.uTime.value = t;
    stars.rotation.y = t * 0.006;

    if (!reduceMotion && state.storm > 0.01 && t > nextStrike) {
      strike();
      scheduleStrike(t);
    }
    updateBolts(t);
    if (flashEl) flashEl.style.opacity = (uniforms.uFlash.value * 0.22).toFixed(3);

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(px());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    uniforms.uPx.value = px();
    starMat.uniforms.uPx.value = px();
  });

  scheduleStrike(0);
  requestAnimationFrame(frame);

  return {
    setScene,
    strike,
    get current() { return currentName; },
  };
}

/**
 * Switches the scene as each `[data-scene]` section crosses the middle of the
 * screen (the same band TPR uses, so a section counts once it fills the view).
 */
export function bindSectionScenes(ctrl: ParticleSceneController): void {
  const sections = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const name = (entry.target as HTMLElement).dataset.scene;
      if (entry.isIntersecting && name) ctrl.setScene(name);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
}
