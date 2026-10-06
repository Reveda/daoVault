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

import * as THREE from 'three';
import { hasWebGL } from './core.ts';
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
  if (import.meta.env.DEV) (window as unknown as { __daovaultScene?: unknown }).__daovaultScene = ctrl;
  return ctrl;
}

/**
 * 2. Official 3D Animated DAOvault AI Logo Emblem (#heroCoreCanvas)
 * Replaces generic wireframe with the flagship DAOvault 3D Web3 Emblem:
 * - Beveled 24K Gold Hexagonal Cyber Vault Gate
 * - Inset Neon Cyan Energy Channels
 * - Concentric Rotating Mechanical Vault Lock Ring
 * - Sculpted 3D "DV" Monogram with Central Glowing AI Diamond Core
 * - Interactive Mouse Tilt & Metallic Specular Glints
 */
export function initHeroCore3D(): void {
  const canvas = document.getElementById('heroCoreCanvas') as HTMLCanvasElement | null;
  const container = canvas?.parentElement;
  if (!canvas || !container || !hasWebGL()) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const setSize = () => {
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    if (camera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };

  const width = container.clientWidth || 400;
  const height = container.clientHeight || 420;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  setSize();

  // Multi-Point Studio Lighting (Creates rich metallic reflections on 3D Gold)
  const keyLight = new THREE.DirectionalLight(0xfffaea, 3.4);
  keyLight.position.set(5, 7, 6);
  scene.add(keyLight);

  const cyanRim = new THREE.DirectionalLight(0x00f0ff, 2.6);
  cyanRim.position.set(-6, 4, -4);
  scene.add(cyanRim);

  const violetRim = new THREE.DirectionalLight(0xa855f7, 2.0);
  violetRim.position.set(4, -3, -3);
  scene.add(violetRim);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const centerPointLight = new THREE.PointLight(0x00f0ff, 2.2, 4.5);
  centerPointLight.position.set(0, 0, 0.6);
  scene.add(centerPointLight);

  // Materials
  const goldPbrMat = new THREE.MeshStandardMaterial({
    color: 0xffb800,
    metalness: 0.94,
    roughness: 0.15,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xfff08a,
    metalness: 0.96,
    roughness: 0.08,
  });

  const neonCyanMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00d4e6,
    emissiveIntensity: 0.65,
    metalness: 0.8,
    roughness: 0.18,
  });

  // Root DAOvault 3D Logo Group
  const logoGroup = new THREE.Group();
  scene.add(logoGroup);

  // -------------------------------------------------------------
  // A. Outer 3D Hexagonal Cyber Vault Gate Frame
  // -------------------------------------------------------------
  const hexShape = new THREE.Shape();
  const outerR = 2.05;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = Math.cos(angle) * outerR;
    const y = Math.sin(angle) * outerR;
    if (i === 0) hexShape.moveTo(x, y);
    else hexShape.lineTo(x, y);
  }
  hexShape.closePath();

  // Hollow cutout in center
  const holePath = new THREE.Path();
  const innerR = 1.72;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = Math.cos(angle) * innerR;
    const y = Math.sin(angle) * innerR;
    if (i === 0) holePath.moveTo(x, y);
    else holePath.lineTo(x, y);
  }
  holePath.closePath();
  hexShape.holes.push(holePath);

  const hexGeo = new THREE.ExtrudeGeometry(hexShape, {
    depth: 0.32,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  });
  hexGeo.center();
  const hexFrame = new THREE.Mesh(hexGeo, goldPbrMat);
  logoGroup.add(hexFrame);

  // Inset Neon Cyan Cyber Channel
  const cyberShape = new THREE.Shape();
  const cyberR = 1.68;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = Math.cos(angle) * cyberR;
    const y = Math.sin(angle) * cyberR;
    if (i === 0) cyberShape.moveTo(x, y);
    else cyberShape.lineTo(x, y);
  }
  cyberShape.closePath();

  const cyberHole = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = Math.cos(angle) * 1.61;
    const y = Math.sin(angle) * 1.61;
    if (i === 0) cyberHole.moveTo(x, y);
    else cyberHole.lineTo(x, y);
  }
  cyberHole.closePath();
  cyberShape.holes.push(cyberHole);

  const cyberHexGeo = new THREE.ExtrudeGeometry(cyberShape, {
    depth: 0.36,
    bevelEnabled: false,
  });
  cyberHexGeo.center();
  const cyberHex = new THREE.Mesh(cyberHexGeo, neonCyanMat);
  logoGroup.add(cyberHex);

  // -------------------------------------------------------------
  // B. Concentric Mechanical Vault Cog Dial (Rotating Bank Vault)
  // -------------------------------------------------------------
  const dialGroup = new THREE.Group();
  logoGroup.add(dialGroup);

  const dialRingGeo = new THREE.TorusGeometry(1.50, 0.032, 16, 60);
  const dialRing = new THREE.Mesh(dialRingGeo, goldTrimMat);
  dialGroup.add(dialRing);

  // 12 Vault Locking Cog Teeth
  for (let t = 0; t < 12; t++) {
    const angle = (t * Math.PI) / 6;
    const toothGeo = new THREE.BoxGeometry(0.07, 0.18, 0.10);
    const tooth = new THREE.Mesh(toothGeo, goldTrimMat);
    tooth.position.set(Math.cos(angle) * 1.50, Math.sin(angle) * 1.50, 0);
    tooth.rotation.z = angle;
    dialGroup.add(tooth);
  }

  // -------------------------------------------------------------
  // C. Sculpted 3D "DV" Monogram Emblem (Centerpiece of DAOvault)
  // -------------------------------------------------------------
  const dvGroup = new THREE.Group();
  logoGroup.add(dvGroup);

  // Letter "D" Assembly
  const dGroup = new THREE.Group();
  dGroup.position.set(-0.48, 0, 0.06);

  const dPillarGeo = new THREE.BoxGeometry(0.20, 1.25, 0.22);
  const dPillar = new THREE.Mesh(dPillarGeo, goldPbrMat);
  dPillar.position.set(-0.25, 0, 0);
  dGroup.add(dPillar);

  const dTopGeo = new THREE.BoxGeometry(0.34, 0.18, 0.22);
  const dTop = new THREE.Mesh(dTopGeo, goldPbrMat);
  dTop.position.set(-0.06, 0.535, 0);
  dGroup.add(dTop);

  const dBottomGeo = new THREE.BoxGeometry(0.34, 0.18, 0.22);
  const dBottom = new THREE.Mesh(dBottomGeo, goldPbrMat);
  dBottom.position.set(-0.06, -0.535, 0);
  dGroup.add(dBottom);

  const dCurveGeo = new THREE.TorusGeometry(0.535, 0.10, 16, 28, Math.PI);
  const dCurve = new THREE.Mesh(dCurveGeo, goldPbrMat);
  dCurve.position.set(-0.06, 0, 0);
  dCurve.rotation.z = -Math.PI / 2;
  dGroup.add(dCurve);

  dvGroup.add(dGroup);

  // Letter "V" Assembly
  const vGroup = new THREE.Group();
  vGroup.position.set(0.48, 0, 0.06);

  const vLeftGeo = new THREE.BoxGeometry(0.20, 1.30, 0.22);
  const vLeft = new THREE.Mesh(vLeftGeo, goldPbrMat);
  vLeft.position.set(-0.25, 0.04, 0);
  vLeft.rotation.z = -0.32;
  vGroup.add(vLeft);

  const vRightGeo = new THREE.BoxGeometry(0.20, 1.30, 0.22);
  const vRight = new THREE.Mesh(vRightGeo, goldPbrMat);
  vRight.position.set(0.25, 0.04, 0);
  vRight.rotation.z = 0.32;
  vGroup.add(vRight);

  const vApexGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const vApex = new THREE.Mesh(vApexGeo, goldTrimMat);
  vApex.position.set(0, -0.56, 0);
  vGroup.add(vApex);

  dvGroup.add(vGroup);

  // Pulsing Glowing AI Core Diamond (Nestled between the D and V)
  const coreDiamondGeo = new THREE.OctahedronGeometry(0.34, 0);
  const coreDiamond = new THREE.Mesh(coreDiamondGeo, neonCyanMat);
  coreDiamond.position.set(0, 0, 0.12);
  logoGroup.add(coreDiamond);

  // -------------------------------------------------------------
  // D. Ascending Golden Spark Embers
  // -------------------------------------------------------------
  const sparkCount = 90;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkSpeeds = new Float32Array(sparkCount);

  for (let i = 0; i < sparkCount; i++) {
    const i3 = i * 3;
    sparkPos[i3] = (Math.random() - 0.5) * 3.6;
    sparkPos[i3 + 1] = (Math.random() - 0.5) * 3.6;
    sparkPos[i3 + 2] = (Math.random() - 0.5) * 2.5;
    sparkSpeeds[i] = 0.008 + Math.random() * 0.015;
  }

  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffe082,
    size: 0.065,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  logoGroup.add(sparks);

  // -------------------------------------------------------------
  // E. Official DAOvault logo video. It replaces this whole emblem; the emblem
  //    only shows if the video cannot play (see mountLogoVideo).
  // -------------------------------------------------------------
  const updateLogoVideo = mountLogoVideo(logoGroup, container);

  // Interactive Mouse Tilt on Container Hover
  let targetRotX = 0;
  let targetRotY = 0;

  container.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    targetRotY = nx * 1.1;
    targetRotX = ny * 1.1;
  });

  container.addEventListener('mouseleave', () => {
    targetRotX = 0;
    targetRotY = 0;
  });

  // 60 FPS Render & Animation Loop
  const clock = new THREE.Clock();

  function renderLogo(): void {
    requestAnimationFrame(renderLogo);
    const dt = clock.getDelta();
    const time = clock.getElapsedTime();

    // Smooth inertia tilt towards cursor
    logoGroup.rotation.x += (targetRotX - logoGroup.rotation.x) * 0.055;
    logoGroup.rotation.y += (targetRotY - logoGroup.rotation.y) * 0.055;

    // Slow continuous 3D rotation oscillation showing off metallic gold bevels
    logoGroup.rotation.y = Math.sin(time * 0.75) * 0.32 + targetRotY * 0.55;
    logoGroup.rotation.x = Math.cos(time * 0.55) * 0.10 + targetRotX * 0.35;

    // Floating breathing levitation
    logoGroup.position.y = Math.sin(time * 1.6) * 0.09;

    // Mechanical vault dial counter-rotation
    dialGroup.rotation.z -= dt * 0.40;

    // keep the logo video readable (mirror past edge-on); nothing to draw while it plays
    updateLogoVideo(time, dt);
    if (!logoGroup.visible) return;

    // AI Core Diamond rotation & pulse
    coreDiamond.rotation.y += dt * 1.4;
    coreDiamond.rotation.z += dt * 0.9;
    const pulseScale = 1.0 + Math.sin(time * 3.5) * 0.09;
    coreDiamond.scale.set(pulseScale, pulseScale, pulseScale);

    // Rising Spark particles
    const positions = sparkGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < sparkCount; i++) {
      const i3 = i * 3;
      positions[i3 + 1] += sparkSpeeds[i];
      if (positions[i3 + 1] > 2.4) {
        positions[i3 + 1] = -2.4;
        positions[i3] = (Math.random() - 0.5) * 3.6;
        positions[i3 + 2] = (Math.random() - 0.5) * 2.5;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }
  renderLogo();

  window.addEventListener('resize', setSize);
  console.log('[DAOvault] Official 3D Animated DAOvault Logo Emblem Initialized (PBR WebGL 60 FPS)');
}

const LOGO_VIDEO_SRC = '/assets/daoAnimation.MP4';

/**
 * Hero logo: only the official video (/assets/daoAnimation.MP4) is shown, flat
 * and sharp in the brand lockup, with no other animation around it. It plays the
 * whole clip exactly as made, on an endless loop. The modelled 3D vault stays
 * hidden and only comes back (with the flat logo image) if the video cannot play.
 * Returns the per-frame hook (nothing to do while the video plays).
 */
function mountLogoVideo(group: THREE.Group, container: HTMLElement): (time: number, dt: number) => void {
  const lockup = container.querySelector<HTMLElement>('.hero-brand-lockup');
  if (!lockup) return () => {};

  const stage = document.createElement('span');
  stage.className = 'hero-logo-stage';
  const video = document.createElement('video');
  video.className = 'hero-logo-video';
  video.src = LOGO_VIDEO_SRC;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-label', 'DAOvault logo');
  stage.appendChild(video);
  lockup.prepend(stage);

  // the video alone has the stage: no vault, no sparks
  group.visible = false;
  container.classList.add('has-video-logo');

  let failed = false;
  let onScreen = true;
  const restoreVault = () => {
    if (failed) return;
    failed = true;
    stage.remove();
    container.classList.remove('has-video-logo', 'logo-playing');
    group.visible = true;
  };
  const play = () => {
    if (failed || !onScreen || document.hidden) return;
    video.play().catch((err: unknown) => {
      // a play() cut short by pause() (scrolled away, tab hidden) is not a failure
      if (err instanceof DOMException && err.name === 'AbortError') return;
      restoreVault();
    });
  };

  video.addEventListener('playing', () => container.classList.add('logo-playing'), { once: true });
  video.addEventListener('error', restoreVault);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) play(); else video.pause();
    }).observe(container);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else play(); });
  play();

  return () => {};
}
