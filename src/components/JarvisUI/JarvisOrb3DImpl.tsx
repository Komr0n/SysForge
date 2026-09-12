// src/components/JarvisUI/JarvisOrb3DImpl.tsx
// Высокодетализированный голографический Arc Reactor / 3D HUD с геодезической сферой,
// сегментированным турбинным кольцом и волновым полем частиц в стиле J.A.R.V.I.S.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { JarvisState } from '../../lib/jarvis/voice-service';

interface JarvisOrb3DImplProps {
  state: JarvisState;
  size?: number;
  isFollowUp?: boolean;
}

interface Palette {
  primary: number;     // Основной неоновый свет
  secondary: number;   // Глубокий оттенок реактора
  accent: number;      // Яркий контурный блик
  core: number;        // Тёмный фон сферы
}

const STATE_PALETTES: Record<JarvisState, Palette> = {
  idle: {
    primary: 0x00f0ff,
    secondary: 0x007799,
    accent: 0xe0ffff,
    core: 0x01131d,
  },
  listening: {
    primary: 0x00ffff,
    secondary: 0x00a8cc,
    accent: 0xffffff,
    core: 0x011b27,
  },
  thinking: {
    primary: 0xc084fc,
    secondary: 0x6b21a8,
    accent: 0xf5d0fe,
    core: 0x160826,
  },
  executing: {
    primary: 0x38bdf8,
    secondary: 0x0369a1,
    accent: 0xe0f2fe,
    core: 0x021727,
  },
  speaking: {
    primary: 0xffaa00, // Солнечно-янтарный реактор при речи
    secondary: 0xd97706,
    accent: 0xffedd5,
    core: 0x221302,
  },
  error: {
    primary: 0xef4444,
    secondary: 0x991b1b,
    accent: 0xfee2e2,
    core: 0x220505,
  },
};

/** Создание мягкой текстуры свечения для частиц */
function createGlowDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Создание текстуры сегментированного реактора / HUD кольца */
function createReactorRingTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // 1. Внутренние технические дорожки
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 270, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 285, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Деления (тикеры) по кругу
  const tickCount = 144;
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * Math.PI * 2;
    const isMajor = i % 4 === 0;
    const r1 = 286;
    const r2 = isMajor ? 302 : 294;
    ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = isMajor ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.stroke();
  }

  // 3. Сегментированные энергоблоки реактора (как на референсе)
  const segments = 36;
  const blockInner = 330;
  const blockOuter = 440;
  const gap = 0.035; // угловой зазор между блоками

  for (let i = 0; i < segments; i++) {
    const startAngle = (i / segments) * Math.PI * 2 + gap;
    const endAngle = ((i + 1) / segments) * Math.PI * 2 - gap;

    ctx.beginPath();
    ctx.arc(cx, cy, blockOuter, startAngle, endAngle, false);
    ctx.arc(cx, cy, blockInner, endAngle, startAngle, true);
    ctx.closePath();

    // Разная яркость для эффекта живой энергии
    const alpha = (i % 3 === 0) ? 0.75 : (i % 2 === 0 ? 0.55 : 0.4);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();

    // Обводка блока
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // 4. Внешний обод с акцентами
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 455, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 475, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function JarvisOrb3DImpl({ state, size = 64, isFollowUp = false }: JarvisOrb3DImplProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const isFollowUpRef = useRef(isFollowUp);

  useEffect(() => {
    stateRef.current = state;
    isFollowUpRef.current = isFollowUp;
  }, [state, isFollowUp]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 10.0;

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const palette = STATE_PALETTES[stateRef.current] || STATE_PALETTES.idle;

    // 3. Central Geodesic Wireframe Sphere (Icosphere)
    // Лицевая полусфера с треугольной сеткой высокой чёткости
    const coreGeo = new THREE.IcosahedronGeometry(1.22, 3);
    const coreMat = new THREE.MeshBasicMaterial({
      color: palette.accent,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Внутреннее затемняющее ядро (скрывает обратную сторону сетки, создавая объём как на фото)
    const innerCoreGeo = new THREE.SphereGeometry(1.19, 36, 36);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: palette.core,
      transparent: true,
      opacity: 0.88,
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    scene.add(innerCoreMesh);

    // 4. Яркий белый светящийся обод силуэта (Silhouette Rim)
    const rimGeo = new THREE.RingGeometry(1.20, 1.26, 96);
    const rimMat = new THREE.MeshBasicMaterial({
      color: palette.accent,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.z = 0.04;
    scene.add(rimMesh);

    // Дополнительный тонкий внешний обод
    const rim2Geo = new THREE.RingGeometry(1.29, 1.31, 96);
    const rim2Mat = new THREE.MeshBasicMaterial({
      color: palette.primary,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const rim2Mesh = new THREE.Mesh(rim2Geo, rim2Mat);
    rim2Mesh.position.z = 0.03;
    scene.add(rim2Mesh);

    // 5. Внутреннее скопление звёздной энергии ядра
    const innerDustCount = 140;
    const innerDustPos = new Float32Array(innerDustCount * 3);
    for (let i = 0; i < innerDustCount * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 0.35 + Math.random() * 0.75;
      innerDustPos[i] = r * Math.sin(phi) * Math.cos(theta);
      innerDustPos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      innerDustPos[i + 2] = r * Math.cos(phi);
    }
    const innerDustGeo = new THREE.BufferGeometry();
    innerDustGeo.setAttribute('position', new THREE.BufferAttribute(innerDustPos, 3));
    const innerDustMat = new THREE.PointsMaterial({
      size: 0.04,
      color: palette.primary,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const innerDustMesh = new THREE.Points(innerDustGeo, innerDustMat);
    scene.add(innerDustMesh);

    // 6. Сегментированное кольцо реактора (Segmented Arc Reactor HUD Dial)
    const dialTexture = createReactorRingTexture();
    const dialGeo = new THREE.RingGeometry(1.58, 2.52, 96);
    const dialMat = new THREE.MeshBasicMaterial({
      map: dialTexture,
      color: palette.primary,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    scene.add(dialMesh);

    // Тонкое обратное технологическое кольцо
    const subRingGeo = new THREE.RingGeometry(1.42, 1.45, 72);
    const subRingMat = new THREE.MeshBasicMaterial({
      color: palette.primary,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const subRingMesh = new THREE.Mesh(subRingGeo, subRingMat);
    scene.add(subRingMesh);

    // 7. Внешняя волновая вуаль из частиц (Organic Fluid Wave Curtain)
    const waveDotTexture = createGlowDotTexture();
    const waveCount = 2000;
    const waveBaseData = new Float32Array(waveCount * 3); // theta, baseRadius, phase
    const wavePositions = new Float32Array(waveCount * 3);

    for (let i = 0; i < waveCount; i++) {
      const theta = (i / waveCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      // Слои радиуса от 2.65 до 3.30
      const layer = Math.random();
      const baseRadius = 2.68 + layer * 0.58;
      const phase = Math.random() * Math.PI * 2;

      waveBaseData[i * 3] = theta;
      waveBaseData[i * 3 + 1] = baseRadius;
      waveBaseData[i * 3 + 2] = phase;

      wavePositions[i * 3] = baseRadius * Math.cos(theta);
      wavePositions[i * 3 + 1] = baseRadius * Math.sin(theta);
      wavePositions[i * 3 + 2] = 0;
    }

    const waveGeo = new THREE.BufferGeometry();
    const wavePosAttr = new THREE.BufferAttribute(wavePositions, 3);
    waveGeo.setAttribute('position', wavePosAttr);

    const waveMat = new THREE.PointsMaterial({
      size: 0.065,
      map: waveDotTexture,
      color: palette.primary,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const waveMesh = new THREE.Points(waveGeo, waveMat);
    scene.add(waveMesh);

    // 8. Анимационный цикл
    let animId: number;
    const clock = new THREE.Clock();

    const targetPrimaryColor = new THREE.Color();
    const targetAccentColor = new THREE.Color();
    const targetCoreColor = new THREE.Color();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const currentState = stateRef.current;
      const isFollowUp = isFollowUpRef.current;

      const p = STATE_PALETTES[currentState] || STATE_PALETTES.idle;
      const primaryHex = isFollowUp ? 0x00ffff : p.primary;
      const accentHex = isFollowUp ? 0xffffff : p.accent;

      targetPrimaryColor.setHex(primaryHex);
      targetAccentColor.setHex(accentHex);
      targetCoreColor.setHex(p.core);

      // Плавная интерполяция цветов
      coreMat.color.lerp(targetAccentColor, 0.08);
      innerCoreMat.color.lerp(targetCoreColor, 0.08);
      rimMat.color.lerp(targetAccentColor, 0.08);
      rim2Mat.color.lerp(targetPrimaryColor, 0.08);
      dialMat.color.lerp(targetPrimaryColor, 0.08);
      subRingMat.color.lerp(targetPrimaryColor, 0.08);
      waveMat.color.lerp(targetPrimaryColor, 0.08);
      innerDustMat.color.lerp(targetPrimaryColor, 0.08);

      // Модификаторы скорости и масштаба от состояния
      let speedMult = 1.0;
      let waveAmpMult = 1.0;
      let pulseAmp = 0.03;
      let pulseFreq = 3;
      let baseScale = 1.0;

      if (currentState === 'speaking') {
        baseScale = 1.08;
        speedMult = 2.0;
        waveAmpMult = 1.8;
        pulseAmp = 0.08;
        pulseFreq = 6;
      } else if (currentState === 'thinking') {
        speedMult = 2.4;
        waveAmpMult = 1.4;
        pulseAmp = 0.06;
        pulseFreq = 5;
        baseScale = 1.04;
      } else if (currentState === 'listening' || isFollowUp) {
        speedMult = 1.4;
        waveAmpMult = 1.25;
        pulseAmp = 0.05;
        pulseFreq = 4;
        baseScale = 1.03;
      }

      // Вращение геодезической сферы
      coreMesh.rotation.y += 0.007 * speedMult;
      coreMesh.rotation.x += 0.003 * speedMult;

      // Вращение внутренней пыли
      innerDustMesh.rotation.y -= 0.004 * speedMult;
      innerDustMesh.rotation.z += 0.002 * speedMult;

      // Вращение кольца реактора и суб-кольца
      dialMesh.rotation.z -= 0.003 * speedMult;
      subRingMesh.rotation.z += 0.005 * speedMult;

      // Динамическая волновая деформация наружного облака частиц (Organic Ribbon Wave)
      const t = elapsedTime * speedMult;
      const positions = wavePosAttr.array as Float32Array;

      for (let i = 0; i < waveCount; i++) {
        const theta = waveBaseData[i * 3];
        const baseR = waveBaseData[i * 3 + 1];
        const phase = waveBaseData[i * 3 + 2];

        // Синусоидальные гармоники волны
        const wave1 = Math.sin(theta * 5.0 + t * 1.8) * 0.12 * waveAmpMult;
        const wave2 = Math.cos(theta * 8.0 - t * 2.4) * 0.07 * waveAmpMult;
        const wave3 = Math.sin(theta * 12.0 + t * 3.2) * 0.04 * waveAmpMult;
        const curR = baseR + wave1 + wave2 + wave3;

        // Волна по оси Z (глубина 3D)
        const zWave = Math.sin(theta * 4.0 + t * 1.5 + phase) * 0.28 * waveAmpMult;

        positions[i * 3] = curR * Math.cos(theta);
        positions[i * 3 + 1] = curR * Math.sin(theta);
        positions[i * 3 + 2] = zWave;
      }
      wavePosAttr.needsUpdate = true;

      // Пульсация масштаба
      const currentScale = baseScale * (1.0 + Math.sin(elapsedTime * pulseFreq) * pulseAmp);
      scene.scale.set(currentScale, currentScale, currentScale);

      renderer.render(scene, camera);
    };

    animate();

    // 9. Очистка ресурсов Three.js
    return () => {
      cancelAnimationFrame(animId);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });

      dialTexture.dispose();
      waveDotTexture.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'visible',
      }}
    />
  );
}
