/**
 * DAOvault AI — 3D Ambient WebGL Stage for Connect Wallet Modal
 * Replaces clunky oversized cylinders with an executive, studio-lit Web3 backdrop:
 * - 350+ floating golden, cyan, and violet star embers
 * - Interactive mouse parallax with smooth spring damping
 * - Subtle gyroscopic holographic orbital rings
 * - Low-resource render loop that runs only while modal is open
 */

import * as THREE from 'three';
import { hasWebGL } from './core.ts';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animFrameId: number | null = null;
let isRunning = false;

// 3D Floating Coins & Particles
let coinsGroup: THREE.Group | null = null;
interface FloatingCoinItem {
  group: THREE.Group;
  baseX: number;
  baseY: number;
  baseZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  floatOffset: number;
  floatSpeed: number;
}
let floatingCoins: FloatingCoinItem[] = [];
let particlePoints: THREE.Points | null = null;
let particlePositions: Float32Array | null = null;
let particleSpeeds: Float32Array | null = null;

// Mouse Parallax tracking
let targetRotX = 0;
let targetRotY = 0;
let currentRotX = 0;
let currentRotY = 0;
let mouseListenerAttached = false;

export function initWalletDialog3D(): void {
  const canvas = document.getElementById('wallet3DCanvas') as HTMLCanvasElement | null;
  if (!canvas || !hasWebGL()) return;

  // 1. WebGL Renderer Setup
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 2. Scene & Camera Setup
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 16);

  // 3. Studio Lighting
  const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambLight);

  const cyanRimLight = new THREE.DirectionalLight(0x00f0ff, 3.5);
  cyanRimLight.position.set(-12, 8, 10);
  scene.add(cyanRimLight);

  const goldKeyLight = new THREE.DirectionalLight(0xffb800, 3.5);
  goldKeyLight.position.set(12, 10, 10);
  scene.add(goldKeyLight);

  const violetBackLight = new THREE.PointLight(0xa855f7, 3.0, 30);
  violetBackLight.position.set(0, -10, 5);
  scene.add(violetBackLight);

  // 4. Floating 3D Rotating Gold Crypto Coins (Replaces solar system rings)
  coinsGroup = new THREE.Group();
  scene.add(coinsGroup);

  const goldCoinMat = new THREE.MeshStandardMaterial({
    color: 0xffb800,
    metalness: 0.92,
    roughness: 0.22,
  });

  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xffd54f,
    metalness: 0.95,
    roughness: 0.18,
  });

  const coinConfigs = [
    { x: -6.0, y: 3.4, z: -2.2, scale: 1.15, rx: 0.016, ry: 0.024, rz: 0.008, offset: 0, speed: 1.4 },
    { x: 5.8, y: 3.6, z: -2.8, scale: 1.05, rx: -0.018, ry: 0.022, rz: 0.010, offset: 1.8, speed: 1.2 },
    { x: -5.6, y: -3.3, z: -1.8, scale: 0.98, rx: 0.022, ry: -0.018, rz: 0.006, offset: 3.2, speed: 1.6 },
    { x: 6.0, y: -3.1, z: -2.4, scale: 1.18, rx: -0.015, ry: -0.024, rz: 0.009, offset: 4.5, speed: 1.3 },
    { x: -1.8, y: 4.6, z: -5.0, scale: 0.82, rx: 0.012, ry: 0.018, rz: 0.005, offset: 2.1, speed: 1.1 },
    { x: 2.4, y: -4.4, z: -4.8, scale: 0.88, rx: -0.014, ry: 0.020, rz: 0.007, offset: 5.0, speed: 1.5 },
  ];

  floatingCoins = coinConfigs.map((cfg) => {
    const coinGroup = new THREE.Group();
    coinGroup.position.set(cfg.x, cfg.y, cfg.z);
    coinGroup.scale.setScalar(cfg.scale);

    // Main Coin Cylinder
    const cylGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.14, 42);
    const cylMesh = new THREE.Mesh(cylGeo, goldCoinMat);
    cylMesh.rotation.x = Math.PI / 2; // Face forward
    coinGroup.add(cylMesh);

    // Embossed Gold Rims (Front & Back)
    const rimGeo = new THREE.TorusGeometry(0.82, 0.038, 12, 42);
    const rimFront = new THREE.Mesh(rimGeo, goldRimMat);
    rimFront.position.z = 0.072;
    coinGroup.add(rimFront);

    const rimBack = new THREE.Mesh(rimGeo, goldRimMat);
    rimBack.position.z = -0.072;
    coinGroup.add(rimBack);

    // Center Gold Star/Diamond Emblem (Front & Back)
    const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
    const coreFront = new THREE.Mesh(coreGeo, goldRimMat);
    coreFront.position.z = 0.074;
    coreFront.scale.set(1, 1, 0.35);
    coinGroup.add(coreFront);

    const coreBack = new THREE.Mesh(coreGeo, goldRimMat);
    coreBack.position.z = -0.074;
    coreBack.scale.set(1, 1, 0.35);
    coinGroup.add(coreBack);

    // Initial random rotation angles
    coinGroup.rotation.x = Math.random() * Math.PI;
    coinGroup.rotation.y = Math.random() * Math.PI;

    if (coinsGroup) {
      coinsGroup.add(coinGroup);
    }

    return {
      group: coinGroup,
      baseX: cfg.x,
      baseY: cfg.y,
      baseZ: cfg.z,
      rotSpeedX: cfg.rx,
      rotSpeedY: cfg.ry,
      rotSpeedZ: cfg.rz,
      floatOffset: cfg.offset,
      floatSpeed: cfg.speed,
    };
  });

  // 5. Ambient Floating Cosmic Embers
  const particleCount = 280;
  particlePositions = new Float32Array(particleCount * 3);
  particleSpeeds = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);

  const colorPalette = [
    new THREE.Color(0xffb800), // Gold
    new THREE.Color(0x00f0ff), // Cyan
    new THREE.Color(0xa855f7), // Purple
    new THREE.Color(0xffffff), // Sparkle White
  ];

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 28;
    particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 22;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;

    particleSpeeds[i * 3 + 0] = (Math.random() - 0.5) * 0.006;
    particleSpeeds[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
    particleSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 0.004;

    const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    particleColors[i * 3 + 0] = col.r;
    particleColors[i * 3 + 1] = col.g;
    particleColors[i * 3 + 2] = col.b;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

  const pMat = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
  });

  particlePoints = new THREE.Points(pGeo, pMat);
  scene.add(particlePoints);

  // 6. Interactive Mouse Parallax Listener
  if (!mouseListenerAttached) {
    window.addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        targetRotX = ny * 0.18;
        targetRotY = nx * 0.22;
      },
      { passive: true }
    );

    window.addEventListener(
      'resize',
      () => {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      },
      { passive: true }
    );

    mouseListenerAttached = true;
  }
}

/**
 * 60 FPS Render Loop while Modal is Active
 */
function animateStage(time: number): void {
  if (!isRunning || !renderer || !scene || !camera) return;

  animFrameId = requestAnimationFrame(animateStage);

  const t = time * 0.001;

  // Smooth mouse parallax damping
  currentRotX += (targetRotX - currentRotX) * 0.05;
  currentRotY += (targetRotY - currentRotY) * 0.05;

  // Animate 3D Floating Gold Coins
  if (floatingCoins.length) {
    floatingCoins.forEach((coin) => {
      coin.group.rotation.x += coin.rotSpeedX;
      coin.group.rotation.y += coin.rotSpeedY;
      coin.group.rotation.z += coin.rotSpeedZ;
      
      // Floating vertical bobbing
      coin.group.position.y = coin.baseY + Math.sin(t * coin.floatSpeed + coin.floatOffset) * 0.35 + -currentRotX * 1.6;
      coin.group.position.x = coin.baseX + currentRotY * 1.8;
    });
  }

  // Drift floating particles
  if (particlePoints && particlePositions && particleSpeeds) {
    const pos = particlePoints.geometry.attributes.position.array as Float32Array;
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] += particleSpeeds[i * 3 + 0];
      pos[i * 3 + 1] += particleSpeeds[i * 3 + 1];
      pos[i * 3 + 2] += particleSpeeds[i * 3 + 2];

      if (pos[i * 3 + 1] > 11) pos[i * 3 + 1] = -11;
      if (pos[i * 3 + 1] < -11) pos[i * 3 + 1] = 11;
      if (pos[i * 3 + 0] > 14) pos[i * 3 + 0] = -14;
      if (pos[i * 3 + 0] < -14) pos[i * 3 + 0] = 14;
    }

    particlePoints.geometry.attributes.position.needsUpdate = true;
  }

  renderer.render(scene, camera);
}

export function startWalletDialog3D(): void {
  if (isRunning) return;
  if (!scene) {
    initWalletDialog3D();
  }
  isRunning = true;
  animFrameId = requestAnimationFrame(animateStage);
}

export function stopWalletDialog3D(): void {
  isRunning = false;
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}
