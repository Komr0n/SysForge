import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/settingsStore';

const MAX_PARTICLES = 70;
const CONNECTION_DISTANCE = 120;
const MAX_CONNECTIONS = 400;
const DRIFT_SPEED = 0.02;

export default function ParticleNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);
  const enabled = useSettingsStore((s) => s.performance.particleNetwork);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Setup renderer — wrap in try/catch so missing WebGL support
    // doesn't crash the whole OS shell (white/black screen after boot).
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(width, height);
    } catch (err) {
      console.warn('[SysForge] WebGL unavailable — particle network disabled.', err);
      return;
    }
    container.appendChild(renderer.domElement);

    // Setup scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 300;

    // Create particles
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const velocities: { x: number; y: number }[] = [];

    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * width;
      positions[i * 3 + 1] = (Math.random() - 0.5) * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      velocities.push({
        x: (Math.random() - 0.5) * DRIFT_SPEED,
        y: (Math.random() - 0.5) * DRIFT_SPEED,
      });
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      color: 0x0ea5e9,
      size: 2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Create connection lines (LineSegments)
    const linePositions = new Float32Array(MAX_PARTICLES * MAX_PARTICLES * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Animation loop
    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / fpsCap;

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      // Update particle positions
      const pos = particleGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        pos[i * 3] += velocities[i].x;
        pos[i * 3 + 1] += velocities[i].y;

        // Wrap around
        if (pos[i * 3] > width / 2) pos[i * 3] = -width / 2;
        if (pos[i * 3] < -width / 2) pos[i * 3] = width / 2;
        if (pos[i * 3 + 1] > height / 2) pos[i * 3 + 1] = -height / 2;
        if (pos[i * 3 + 1] < -height / 2) pos[i * 3 + 1] = height / 2;
      }
      particleGeometry.attributes.position.needsUpdate = true;

      // Recalculate connections on a throttled cadence using a spatial grid
      if (Math.floor(time / 48) % 4 === 0) {
        const linePos = lineGeometry.attributes.position.array as Float32Array;
        let lineIndex = 0;
        const grid = new Map<string, number[]>();
        const cellSize = CONNECTION_DISTANCE;

        for (let i = 0; i < MAX_PARTICLES; i++) {
          const cx = Math.floor(pos[i * 3] / cellSize);
          const cy = Math.floor(pos[i * 3 + 1] / cellSize);
          const key = `${cx},${cy}`;
          const bucket = grid.get(key);
          if (bucket) bucket.push(i);
          else grid.set(key, [i]);
        }

        outer: for (let i = 0; i < MAX_PARTICLES; i++) {
          const cx = Math.floor(pos[i * 3] / cellSize);
          const cy = Math.floor(pos[i * 3 + 1] / cellSize);

          for (let gx = cx - 1; gx <= cx + 1; gx++) {
            for (let gy = cy - 1; gy <= cy + 1; gy++) {
              const neighbors = grid.get(`${gx},${gy}`);
              if (!neighbors) continue;

              for (const j of neighbors) {
                if (j <= i) continue;
                const dx = pos[i * 3] - pos[j * 3];
                const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
                const distSq = dx * dx + dy * dy;

                if (distSq < CONNECTION_DISTANCE * CONNECTION_DISTANCE && lineIndex < MAX_CONNECTIONS) {
                  linePos[lineIndex * 3] = pos[i * 3];
                  linePos[lineIndex * 3 + 1] = pos[i * 3 + 1];
                  linePos[lineIndex * 3 + 2] = pos[i * 3 + 2];
                  linePos[lineIndex * 3 + 3] = pos[j * 3];
                  linePos[lineIndex * 3 + 4] = pos[j * 3 + 1];
                  linePos[lineIndex * 3 + 5] = pos[j * 3 + 2];
                  lineIndex++;
                  if (lineIndex >= MAX_CONNECTIONS) break outer;
                }
              }
            }
          }
        }

        lineGeometry.setDrawRange(0, lineIndex * 2);
        lineGeometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animate);

    // Handle visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
      } else {
        frameId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Handle resize
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      particleGeometry.dispose();
      lineGeometry.dispose();
      particleMaterial.dispose();
      lineMaterial.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [enabled, fpsCap]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}