import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/settingsStore';
import { createThrottledLoop } from '../../hooks/useCanvasLoop';

interface GlobeWidgetProps {
  style?: React.CSSProperties;
}

export default function GlobeWidget({ style }: GlobeWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);

  useEffect(() => {
    if (reduceMotion || !containerRef.current) return;

    const container = containerRef.current;
    const width = 300;
    const height = 300;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(width, height);
    } catch (err) {
      console.warn('[SysForge] WebGL unavailable — globe widget disabled.', err);
      return;
    }
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.2;

    // Ambient lighting for atmosphere
    const ambientLight = new THREE.AmbientLight(0x0ea5e9, 0.3);
    scene.add(ambientLight);

    // Create wireframe sphere — higher detail
    const sphereGeo = new THREE.SphereGeometry(1, 40, 40);
    const sphereMat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.12,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Atmosphere glow shell
    const atmosGeo = new THREE.SphereGeometry(1.08, 32, 32);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    // Latitude lines — brighter grid
    const latLines: THREE.Line[] = [];
    for (let lat = -80; lat <= 80; lat += 20) {
      const points: THREE.Vector3[] = [];
      const phi = (90 - lat) * (Math.PI / 180);
      for (let lng = 0; lng <= 360; lng += 3) {
        const theta = lng * (Math.PI / 180);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);
        points.push(new THREE.Vector3(x, y, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: lat === 0 ? 0x00ff88 : 0x0ea5e9,
        transparent: true,
        opacity: lat === 0 ? 0.25 : 0.1,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      latLines.push(line);
    }

    // Longitude lines
    const lngLines: THREE.Line[] = [];
    for (let lng = 0; lng < 360; lng += 20) {
      const points: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 3) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = lng * (Math.PI / 180);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);
        points.push(new THREE.Vector3(x, y, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: lng === 0 ? 0x00ff88 : 0x0ea5e9,
        transparent: true,
        opacity: lng === 0 ? 0.25 : 0.1,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      lngLines.push(line);
    }

    // Random "city" glow dots on the globe surface
    const glowLines: THREE.Line[] = [];
    const cityPoints = [
      { lat: 40.7, lng: -74 },    // New York
      { lat: 51.5, lng: -0.1 },    // London
      { lat: 35.7, lng: 139.7 },  // Tokyo
      { lat: -33.9, lng: 151.2 }, // Sydney
      { lat: 55.8, lng: 37.6 },   // Moscow
      { lat: 22.3, lng: 114.2 },  // Hong Kong
      { lat: -23.5, lng: -46.6 }, // São Paulo
      { lat: 1.3, lng: 103.8 },   // Singapore
      { lat: 48.9, lng: 2.35 },   // Paris
      { lat: 37.6, lng: 127 },    // Seoul
      { lat: 28.6, lng: 77.2 },   // Delhi
      { lat: -1.3, lng: 36.8 },   // Nairobi
    ];

    for (const city of cityPoints) {
      const phi = (90 - city.lat) * (Math.PI / 180);
      const theta = city.lng * (Math.PI / 180);
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);

      // Small glow spike
      const spikePoints = [
        new THREE.Vector3(x * 1.0, y * 1.0, z * 1.0),
        new THREE.Vector3(x * 1.15, y * 1.15, z * 1.15),
      ];
      const spikeGeo = new THREE.BufferGeometry().setFromPoints(spikePoints);
      const spikeMat = new THREE.LineBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.4,
      });
      const spikeLine = new THREE.Line(spikeGeo, spikeMat);
      scene.add(spikeLine);
      glowLines.push(spikeLine);

      // City dot
      const dotGeo = new THREE.SphereGeometry(0.015, 6, 6);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(x, y, z);
      scene.add(dot);
    }

    // Orbiting signal dots with trails
    const orbitDots: { mesh: THREE.Mesh; speed: number; tilt: number; phase: number }[] = [];
    const dotGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < 8; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat.clone());
      scene.add(dot);
      orbitDots.push({
        mesh: dot,
        speed: 0.3 + Math.random() * 0.4,
        tilt: (Math.PI / 6) * (Math.random() - 0.5),
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Mouse interaction state
    const rotationRef = { x: 0.2, y: 0 };
    const mouseRef = { isDown: false, lastX: 0, lastY: 0 };
    const velocityRef = { vx: 0.003, vy: 0 };

    const handleMouseDown = (e: MouseEvent) => {
      mouseRef.isDown = true;
      mouseRef.lastX = e.clientX;
      mouseRef.lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.isDown) return;
      const dx = e.clientX - mouseRef.lastX;
      const dy = e.clientY - mouseRef.lastY;
      mouseRef.lastX = e.clientX;
      mouseRef.lastY = e.clientY;
      velocityRef.vx = dx * 0.008;
      velocityRef.vy = dy * 0.008;
    };

    const handleMouseUp = () => {
      mouseRef.isDown = false;
    };

    // Mouse wheel zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(2, Math.min(6, camera.position.z + e.deltaY * 0.002));
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Touch support
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        mouseRef.isDown = true;
        mouseRef.lastX = e.touches[0].clientX;
        mouseRef.lastY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!mouseRef.isDown || e.touches.length !== 1) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - mouseRef.lastX;
      const dy = e.touches[0].clientY - mouseRef.lastY;
      mouseRef.lastX = e.touches[0].clientX;
      mouseRef.lastY = e.touches[0].clientY;
      velocityRef.vx = dx * 0.008;
      velocityRef.vy = dy * 0.008;
    };

    const handleTouchEnd = () => {
      mouseRef.isDown = false;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    const applyRotation = () => {
      sphere.rotation.y = rotationRef.y;
      sphere.rotation.x = rotationRef.x;
      for (const line of latLines) {
        line.rotation.y = rotationRef.y;
        line.rotation.x = rotationRef.x;
      }
      for (const line of lngLines) {
        line.rotation.y = rotationRef.y;
        line.rotation.x = rotationRef.x;
      }
      atmosphere.rotation.y = rotationRef.y;
      atmosphere.rotation.x = rotationRef.x;
      for (const glowLine of glowLines) {
        glowLine.rotation.y = rotationRef.y;
        glowLine.rotation.x = rotationRef.x;
      }
    };

    const stopLoop = createThrottledLoop(
      (time) => {
        rotationRef.y += velocityRef.vx;
        rotationRef.x += velocityRef.vy;
        velocityRef.vx *= 0.95;
        velocityRef.vy *= 0.95;

        if (Math.abs(velocityRef.vx) < 0.0003 && Math.abs(velocityRef.vy) < 0.0003) {
          rotationRef.y += 0.003;
        }
        rotationRef.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, rotationRef.x));
        applyRotation();

        for (const dot of orbitDots) {
          const angle = time * 0.001 * dot.speed + dot.phase;
          const radius = 1.35;
          const cosT = Math.cos(dot.tilt);
          const sinT = Math.sin(dot.tilt);
          dot.mesh.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius * sinT,
            Math.sin(angle) * radius * cosT
          );
          const pulse = 0.6 + 0.4 * Math.sin(time * 0.003 + dot.phase);
          (dot.mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
        }

        renderer.render(scene, camera);
      },
      { fpsCap }
    );

    return () => {
      stopLoop();
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      renderer.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      dotGeo.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [fpsCap, reduceMotion]);

  if (reduceMotion) {
    return (
      <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b' }}>
        GLOBE (REDUCED MOTION)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: 300,
        height: 300,
        position: 'relative',
        cursor: 'grab',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: '#64748b',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 0 6px rgba(0, 255, 136, 0.3)',
        }}
      >
        GLOBAL NODES: 847 │ DRAG TO ROTATE
      </div>
    </div>
  );
}
