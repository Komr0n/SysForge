// src/components/JarvisUI/JarvisOrb3DImpl.tsx
// Высокодетализированная 3D Wireframe-сфера J.A.R.V.I.S. на Three.js

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { JarvisState } from '../../lib/jarvis/voice-service';

interface JarvisOrb3DImplProps {
  state: JarvisState;
  size?: number;
  isFollowUp?: boolean;
}

const STATE_COLORS: Record<JarvisState, number> = {
  idle: 0x00ff88,
  listening: 0x00ffff,
  thinking: 0xc084fc,
  executing: 0xf59e0b,
  speaking: 0xffaa00, // Яркий солнечный янтарно-золотой свет при речи Джарвиса
  error: 0xef4444,
};

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
    camera.position.z = 6.2;

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 3. Central Wireframe Icosahedron
    const coreGeo = new THREE.IcosahedronGeometry(1.6, 3);
    const coreMat = new THREE.MeshBasicMaterial({
      color: STATE_COLORS[stateRef.current],
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // 4. Inner glowing sphere
    const innerGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: STATE_COLORS[stateRef.current],
      transparent: true,
      opacity: 0.12,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    // 5. Orbiting Rings
    const ringGroup = new THREE.Group();
    const ringConfigs = [
      { inner: 2.1, outer: 2.14, rotX: 0.5, rotY: 0.2, speed: 0.012 },
      { inner: 2.45, outer: 2.49, rotX: 1.2, rotZ: 0.4, speed: -0.009 },
      { inner: 2.75, outer: 2.78, rotY: 0.9, rotZ: 1.1, speed: 0.007 },
    ];

    const ringMeshes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; speed: number }[] = [];

    ringConfigs.forEach((cfg) => {
      const rGeo = new THREE.RingGeometry(cfg.inner, cfg.outer, 48);
      const rMat = new THREE.MeshBasicMaterial({
        color: STATE_COLORS[stateRef.current],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.rotation.x = cfg.rotX || 0;
      rMesh.rotation.y = cfg.rotY || 0;
      rMesh.rotation.z = cfg.rotZ || 0;
      ringGroup.add(rMesh);
      ringMeshes.push({ mesh: rMesh, mat: rMat, speed: cfg.speed });
    });
    scene.add(ringGroup);

    // 6. Particle dust field
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      // Random points on sphere shell between r=1.9 and r=3.2
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 1.9 + Math.random() * 1.3;
      const sinPhi = Math.sin(phi);
      posArray[i] = r * sinPhi * Math.cos(theta);
      posArray[i + 1] = r * sinPhi * Math.sin(theta);
      posArray[i + 2] = r * Math.cos(phi);
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.05,
      color: STATE_COLORS[stateRef.current],
      transparent: true,
      opacity: 0.65,
    });
    const particleMesh = new THREE.Points(particleGeo, particleMat);
    scene.add(particleMesh);

    // 7. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();
      const currentState = stateRef.current;
      const isFollowUp = isFollowUpRef.current;

      // Determine target color
      let targetHex = STATE_COLORS[currentState] || 0x00ff88;
      if (isFollowUp) {
        targetHex = 0x00ffff;
      }

      // Smooth color interpolation
      const targetColor = new THREE.Color(targetHex);
      coreMat.color.lerp(targetColor, 0.1);
      innerMat.color.lerp(targetColor, 0.1);
      particleMat.color.lerp(targetColor, 0.1);
      ringMeshes.forEach((r) => r.mat.color.lerp(targetColor, 0.1));

      // Speed & Scale multipliers based on state
      let speedMult = 1.0;
      let pulseAmp = 0.04;
      let pulseFreq = 3;
      let baseScale = 1.0;

      if (currentState === 'speaking') {
        // Увеличенный масштаб и активная пульсация при речи
        baseScale = 1.25;
        speedMult = 2.4;
        pulseAmp = 0.14;
        pulseFreq = 8;
      } else if (currentState === 'thinking') {
        speedMult = 2.4;
        pulseAmp = 0.08;
        pulseFreq = 6;
      } else if (currentState === 'listening' || isFollowUp) {
        speedMult = 1.5;
        pulseAmp = 0.1;
        pulseFreq = 5;
        baseScale = 1.06;
      }

      // Sphere rotations
      coreMesh.rotation.y += 0.008 * speedMult;
      coreMesh.rotation.x += 0.004 * speedMult;

      // Particle cloud rotation
      particleMesh.rotation.y -= 0.003 * speedMult;
      particleMesh.rotation.z += 0.002 * speedMult;

      // Pulsing dynamic scale applied to all components
      const currentScale = baseScale * (1.0 + Math.sin(elapsedTime * pulseFreq) * pulseAmp);
      coreMesh.scale.set(currentScale, currentScale, currentScale);
      innerMesh.scale.set(currentScale, currentScale, currentScale);
      ringGroup.scale.set(currentScale, currentScale, currentScale);
      particleMesh.scale.set(currentScale, currentScale, currentScale);

      // Rings counter-rotation
      ringMeshes.forEach((r) => {
        r.mesh.rotation.z += r.speed * speedMult;
      });

      renderer.render(scene, camera);
    };

    animate();

    // 8. Cleanup
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
        overflow: 'hidden',
      }}
    />
  );
}
