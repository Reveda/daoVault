/**
 * DAOvault AI — Solid 3D Championship Trophy (TypeScript / Three.js)
 * High-definition PBR Metallic Architecture inspired by Tier-1 Web3 Award Cups
 * 
 * Features:
 * - Solid, physical 3D geometry: Stepped obsidian & gold pedestal, ornamental stem, flared chalice cup, and sculpted twin handles
 * - Hyper-realistic PBR materials: Polished 24K Solar Gold with metallic sheen & specular reflections
 * - Multi-source studio lighting: Warm golden key light, electric cyan rim light, and royal violet fill light
 * - Floating, rotating diamond crest inside cup
 * - Gyroscopic holographic orbital ring
 * - Ascending golden spark embers
 * - Interactive cursor-following 3D parallax tilt & 360° rotation (60 FPS)
 */

import * as THREE from 'three';
import lottie, { type AnimationItem } from 'lottie-web';
import { hasWebGL } from './core.ts';

let lottieInstance: AnimationItem | null = null;

/**
 * Loads and runs the official Lottie Trophy animation (/assets/trophy-lottie.json)
 * with interactive 3D gyroscopic cursor parallax tilt.
 */
export function initTrophyLottie(): void {
  const container = document.getElementById('trophyLottie');
  if (!container) return;

  if (lottieInstance) {
    lottieInstance.destroy();
    lottieInstance = null;
  }

  try {
    // REAL ORIGINAL TROPHY ANIMATION:
    // Natural continuous loop with full grand entrance, shimmering stars, and coin reveal
    lottieInstance = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: '/assets/trophy-lottie.json',
    });

    // 1.2x playback speed for crisp, energetic motion
    lottieInstance.setSpeed(1.2);

    // Interactive 3D gyroscopic cursor parallax tilt & click to replay
    const stage = document.getElementById('trophyVisual');
    if (stage) {
      stage.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = stage.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        container.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.05)`;
      });

      stage.addEventListener('mouseleave', () => {
        container.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg) scale(1)';
      });

      // Click or tap replays the grand assembly from beginning
      stage.addEventListener('click', () => {
        lottieInstance?.goToAndPlay(0, true);
      });
    }

    console.log('[DAOvault] Trophy Lottie: Real original animation restored and looping smoothly ✓');
  } catch (err) {
    console.error('[DAOvault] Error loading Lottie trophy animation:', err);
  }
}

export function initTrophy3D(): void {
  const canvas = document.getElementById('trophyCanvas') as HTMLCanvasElement | null;
  const container = document.getElementById('trophyVisual') as HTMLElement | null;
  if (!canvas || !container || !hasWebGL()) return;

  // 1. WebGL Renderer Setup with Anti-Aliasing
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const updateSize = () => {
    const width = container.clientWidth || 380;
    const height = container.clientHeight || 440;
    renderer.setSize(width, height);
    if (camera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  };

  const width = container.clientWidth || 380;
  const height = container.clientHeight || 440;

  // 2. Scene & Camera Setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0.15, 6.2);

  updateSize();

  // 3. Multi-Source Studio Lighting System (Essential for Metallic Reflections)
  // Key Light: Warm golden sunlight from top-right
  const keyLight = new THREE.DirectionalLight(0xfffaea, 3.2);
  keyLight.position.set(5, 7, 5);
  scene.add(keyLight);

  // Rim Light 1: Electric Cyber Cyan from back-left (Creates gorgeous high-tech edge sheen)
  const cyanRim = new THREE.DirectionalLight(0x00f0ff, 2.4);
  cyanRim.position.set(-6, 4, -4);
  scene.add(cyanRim);

  // Rim Light 2: Royal Violet from back-right
  const violetRim = new THREE.DirectionalLight(0xa855f7, 2.0);
  violetRim.position.set(4, -3, -4);
  scene.add(violetRim);

  // Ambient Fill Light: Soft neutral base illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  // Core Point Light: Glowing warm amber light nestled inside the chalice
  const cupCoreLight = new THREE.PointLight(0xffb800, 2.0, 4.0);
  cupCoreLight.position.set(0, 1.2, 0);
  scene.add(cupCoreLight);

  // 4. PBR Materials (24K Gold, Polished Rim, Obsidian Plinth)
  const goldBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffb800,        // 24K Solar Gold
    metalness: 0.92,
    roughness: 0.16,
  });

  const goldHighlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff08a,        // Brilliant Sunlight White-Gold
    metalness: 0.96,
    roughness: 0.10,
  });

  const darkPlinthMat = new THREE.MeshStandardMaterial({
    color: 0x0f111a,        // Obsidian Composite Marble
    metalness: 0.45,
    roughness: 0.30,
  });

  const innerCupMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,        // Warm Burnished Bronze Inner Cavity
    metalness: 0.85,
    roughness: 0.35,
    side: THREE.BackSide,
  });

  const diamondCrestMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xff9900,
    emissiveIntensity: 0.35,
    metalness: 0.92,
    roughness: 0.08,
  });

  // 5. Procedural 3D Trophy Construction
  const trophyGroup = new THREE.Group();
  scene.add(trophyGroup);

  // -----------------------------------------------------------------
  // A. Heavy Stepped Pedestal Base
  // -----------------------------------------------------------------
  // Bottom Step (Obsidian plinth)
  const basePlinthGeo = new THREE.CylinderGeometry(1.30, 1.48, 0.26, 36);
  const basePlinth = new THREE.Mesh(basePlinthGeo, darkPlinthMat);
  basePlinth.position.y = -1.65;
  trophyGroup.add(basePlinth);

  // Golden Ring around Bottom Plinth
  const baseRingGeo = new THREE.TorusGeometry(1.44, 0.038, 16, 48);
  const baseRing = new THREE.Mesh(baseRingGeo, goldHighlightMat);
  baseRing.position.y = -1.75;
  baseRing.rotation.x = Math.PI / 2;
  trophyGroup.add(baseRing);

  // Middle Beveled Step (Gold)
  const midBaseGeo = new THREE.CylinderGeometry(1.05, 1.25, 0.20, 36);
  const midBase = new THREE.Mesh(midBaseGeo, goldBodyMat);
  midBase.position.y = -1.44;
  trophyGroup.add(midBase);

  // Upper Base Collar (Gold)
  const topBaseGeo = new THREE.CylinderGeometry(0.80, 1.0, 0.16, 36);
  const topBase = new THREE.Mesh(topBaseGeo, goldHighlightMat);
  topBase.position.y = -1.28;
  trophyGroup.add(topBase);

  // Engraved Golden Nameplate / Badge on Base
  const plaqueGeo = new THREE.BoxGeometry(0.75, 0.14, 0.06);
  const plaque = new THREE.Mesh(plaqueGeo, goldHighlightMat);
  plaque.position.set(0, -1.65, 1.40);
  trophyGroup.add(plaque);

  // -----------------------------------------------------------------
  // B. Ornamental Stem & Central Golden Knot Sphere
  // -----------------------------------------------------------------
  // Lower Stem Flange
  const stemLowerGeo = new THREE.CylinderGeometry(0.24, 0.48, 0.42, 32);
  const stemLower = new THREE.Mesh(stemLowerGeo, goldBodyMat);
  stemLower.position.y = -1.02;
  trophyGroup.add(stemLower);

  // Central Ornamental Knot Sphere
  const stemSphereGeo = new THREE.SphereGeometry(0.38, 32, 24);
  const stemSphere = new THREE.Mesh(stemSphereGeo, goldHighlightMat);
  stemSphere.position.y = -0.65;
  trophyGroup.add(stemSphere);

  // Ornamental Torus Ring encircling the Sphere
  const stemKnotRingGeo = new THREE.TorusGeometry(0.42, 0.05, 16, 32);
  const stemKnotRing = new THREE.Mesh(stemKnotRingGeo, goldHighlightMat);
  stemKnotRing.position.y = -0.65;
  stemKnotRing.rotation.x = Math.PI / 2;
  trophyGroup.add(stemKnotRing);

  // Upper Stem Flare
  const stemUpperGeo = new THREE.CylinderGeometry(0.46, 0.24, 0.42, 32);
  const stemUpper = new THREE.Mesh(stemUpperGeo, goldBodyMat);
  stemUpper.position.y = -0.28;
  trophyGroup.add(stemUpper);

  // -----------------------------------------------------------------
  // C. Sculpted Chalice Cup (Royal Flared Bowl)
  // -----------------------------------------------------------------
  // Cup Base Collar
  const cupCollarGeo = new THREE.CylinderGeometry(0.70, 0.46, 0.20, 36);
  const cupCollar = new THREE.Mesh(cupCollarGeo, goldHighlightMat);
  cupCollar.position.y = 0.0;
  trophyGroup.add(cupCollar);

  // Cup Lower Bowl Curve
  const cupLowerGeo = new THREE.CylinderGeometry(1.18, 0.70, 0.65, 36);
  const cupLower = new THREE.Mesh(cupLowerGeo, goldBodyMat);
  cupLower.position.y = 0.38;
  trophyGroup.add(cupLower);

  // Cup Main Flared Body
  const cupMidGeo = new THREE.CylinderGeometry(1.46, 1.18, 0.65, 36);
  const cupMid = new THREE.Mesh(cupMidGeo, goldBodyMat);
  cupMid.position.y = 0.98;
  trophyGroup.add(cupMid);

  // Cup Upper Flare Lip
  const cupUpperGeo = new THREE.CylinderGeometry(1.58, 1.46, 0.35, 36);
  const cupUpper = new THREE.Mesh(cupUpperGeo, goldBodyMat);
  cupUpper.position.y = 1.45;
  trophyGroup.add(cupUpper);

  // Thick Rounded Polished Gold Rim
  const rimGeo = new THREE.TorusGeometry(1.58, 0.07, 16, 48);
  const rim = new THREE.Mesh(rimGeo, goldHighlightMat);
  rim.position.y = 1.62;
  rim.rotation.x = Math.PI / 2;
  trophyGroup.add(rim);

  // Cup Inner Cavity (BackSide mesh for realistic hollow interior)
  const cupInnerGeo = new THREE.CylinderGeometry(1.52, 0.65, 1.62, 36, 1, true);
  const cupInner = new THREE.Mesh(cupInnerGeo, innerCupMat);
  cupInner.position.y = 0.85;
  trophyGroup.add(cupInner);

  // -----------------------------------------------------------------
  // D. Twin Sculpted Royal Handles (Left & Right)
  // -----------------------------------------------------------------
  const handleGeo = new THREE.TorusGeometry(0.68, 0.075, 16, 36, Math.PI * 1.35);

  // Right Handle
  const rightHandle = new THREE.Mesh(handleGeo, goldHighlightMat);
  rightHandle.position.set(1.48, 0.95, 0);
  rightHandle.rotation.z = -Math.PI * 0.18;
  trophyGroup.add(rightHandle);

  // Left Handle
  const leftHandle = new THREE.Mesh(handleGeo, goldHighlightMat);
  leftHandle.position.set(-1.48, 0.95, 0);
  leftHandle.rotation.z = Math.PI * 0.18;
  leftHandle.scale.x = -1;
  trophyGroup.add(leftHandle);

  // Handle Mounting Accents (Small golden connector globes)
  const anchorGeo = new THREE.SphereGeometry(0.10, 16, 16);
  const anchorR1 = new THREE.Mesh(anchorGeo, goldHighlightMat);
  anchorR1.position.set(1.52, 1.40, 0);
  trophyGroup.add(anchorR1);

  const anchorR2 = new THREE.Mesh(anchorGeo, goldHighlightMat);
  anchorR2.position.set(0.92, 0.42, 0);
  trophyGroup.add(anchorR2);

  const anchorL1 = new THREE.Mesh(anchorGeo, goldHighlightMat);
  anchorL1.position.set(-1.52, 1.40, 0);
  trophyGroup.add(anchorL1);

  const anchorL2 = new THREE.Mesh(anchorGeo, goldHighlightMat);
  anchorL2.position.set(-0.92, 0.42, 0);
  trophyGroup.add(anchorL2);

  // -----------------------------------------------------------------
  // E. Floating Prestige Diamond Crest (Hovering in Cup Center)
  // -----------------------------------------------------------------
  const crestGeo = new THREE.OctahedronGeometry(0.40, 0);
  const crestMesh = new THREE.Mesh(crestGeo, diamondCrestMat);
  crestMesh.position.set(0, 1.35, 0);
  trophyGroup.add(crestMesh);

  // -----------------------------------------------------------------
  // F. Orbiting Gyroscopic Hologram Ring (Web3 Prestige)
  // -----------------------------------------------------------------
  const holoRingGeo = new THREE.TorusGeometry(2.15, 0.018, 16, 64);
  const holoRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.55,
  });
  const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
  holoRing.position.set(0, 0.8, 0);
  holoRing.rotation.x = Math.PI / 3.2;
  trophyGroup.add(holoRing);

  // -----------------------------------------------------------------
  // G. Ascending Golden Spark Embers (60 Floating Sparks)
  // -----------------------------------------------------------------
  const sparkCount = 60;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkSpeeds = new Float32Array(sparkCount);

  for (let s = 0; s < sparkCount; s++) {
    const s3 = s * 3;
    sparkPos[s3] = (Math.random() - 0.5) * 1.6;
    sparkPos[s3 + 1] = 0.8 + Math.random() * 2.2;
    sparkPos[s3 + 2] = (Math.random() - 0.5) * 1.6;
    sparkSpeeds[s] = 0.008 + Math.random() * 0.014;
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
  trophyGroup.add(sparks);

  // 6. Interactive Mouse Hover Tilt Physics
  let mouseTiltX = 0;
  let mouseTiltY = 0;
  let targetTiltX = 0;
  let targetTiltY = 0;

  const parentCard = container.closest('.feature') || container;
  parentCard.addEventListener('mousemove', (e: Event) => {
    const me = e as MouseEvent;
    const rect = parentCard.getBoundingClientRect();
    mouseTiltX = ((me.clientX - rect.left) / rect.width - 0.5) * 2;
    mouseTiltY = ((me.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  parentCard.addEventListener('mouseleave', () => {
    mouseTiltX = 0;
    mouseTiltY = 0;
  });

  // 7. 60 FPS Smooth Render Loop
  const clock = new THREE.Clock();

  function animate(): void {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Smooth inertia tilt towards cursor
    targetTiltX += (mouseTiltX - targetTiltX) * 0.055;
    targetTiltY += (mouseTiltY - targetTiltY) * 0.055;

    // Continuous 360° rotation showing off metallic PBR highlights
    trophyGroup.rotation.y = elapsedTime * 0.40 + targetTiltX * 0.55;
    trophyGroup.rotation.x = 0.06 - targetTiltY * 0.35;
    trophyGroup.rotation.z = -targetTiltX * 0.12;

    // Gentle floating breathing hover
    trophyGroup.position.y = Math.sin(elapsedTime * 1.8) * 0.08 - 0.02;

    // Counter-rotate diamond crest
    crestMesh.rotation.y -= dt * 1.2;
    crestMesh.rotation.x += dt * 0.8;
    crestMesh.position.y = 1.35 + Math.sin(elapsedTime * 2.5) * 0.08;

    // Rotate holographic ring
    holoRing.rotation.z += dt * 0.6;
    holoRing.rotation.y += dt * 0.3;

    // Ascend spark embers
    const posArr = sparkGeo.attributes.position.array as Float32Array;
    for (let s = 0; s < sparkCount; s++) {
      const s3 = s * 3;
      posArr[s3 + 1] += sparkSpeeds[s];
      if (posArr[s3 + 1] > 3.0) {
        posArr[s3 + 1] = 0.8 + Math.random() * 0.4;
        posArr[s3] = (Math.random() - 0.5) * 1.4;
        posArr[s3 + 2] = (Math.random() - 0.5) * 1.4;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }
  animate();

  // 8. Responsive Resize Observer
  const resizeObserver = new ResizeObserver(() => {
    updateSize();
  });
  resizeObserver.observe(container);

  console.log('[DAOvault] Solid 3D Championship Trophy Initialized (PBR Metallic WebGL)');
}
