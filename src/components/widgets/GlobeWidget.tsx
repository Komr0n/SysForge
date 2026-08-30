import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/settingsStore';
import { createThrottledLoop } from '../../hooks/useCanvasLoop';

interface GlobeWidgetProps {
  style?: React.CSSProperties;
}

/**
 * Generate a procedural high-tech sci-fi Earth texture on an offscreen canvas.
 * Fully self-contained — no external image files or 404s.
 */
function createProceduralEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep space / ocean background
  ctx.fillStyle = '#020612';
  ctx.fillRect(0, 0, 1024, 512);

  // Lat / Long subtle coordinate grid
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }

  // Continent outlines & shapes in equirectangular projection (0..1024 x 0..512)
  const drawLandmass = (pts: [number, number][], fillColor: string, strokeColor: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = (x / 360) * 1024;
      const py = (y / 180) * 512;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  const landFill = 'rgba(14, 165, 233, 0.22)';
  const landStroke = '#00ff88';

  // North America
  drawLandmass([
    [40, 20], [80, 15], [100, 30], [110, 45], [95, 65], [85, 75],
    [70, 70], [60, 60], [45, 50], [30, 30]
  ], landFill, landStroke);

  // South America
  drawLandmass([
    [80, 75], [95, 80], [110, 95], [105, 130], [90, 155], [80, 160],
    [75, 140], [70, 105], [75, 85]
  ], landFill, landStroke);

  // Eurasia (Europe + Asia)
  drawLandmass([
    [160, 25], [180, 20], [210, 22], [260, 20], [310, 25], [320, 50],
    [300, 65], [280, 75], [250, 70], [220, 65], [190, 60], [170, 50], [155, 35]
  ], landFill, landStroke);

  // Africa
  drawLandmass([
    [165, 55], [195, 55], [215, 75], [210, 115], [195, 145], [180, 140],
    [165, 105], [155, 75]
  ], landFill, landStroke);

  // Australia
  drawLandmass([
    [290, 110], [325, 105], [335, 125], [325, 145], [295, 140], [285, 125]
  ], landFill, landStroke);

  // Antarctica
  drawLandmass([
    [20, 170], [100, 168], [200, 172], [300, 168], [340, 172], [350, 180],
    [10, 180]
  ], 'rgba(14, 165, 233, 0.15)', '#38bdf8');

  // Sci-fi dot matrix over landmasses
  ctx.fillStyle = '#00ff88';
  for (let x = 16; x < 1024; x += 16) {
    for (let y = 16; y < 512; y += 16) {
      const p = ctx.getImageData(x, y, 1, 1).data;
      if (p[0] > 0 || p[1] > 40 || p[2] > 40) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  // Glowing city nodes on map
  const cities: [number, number, string][] = [
    [75, 48, '#00ff88'],   // NYC
    [175, 38, '#0ea5e9'],  // London
    [310, 45, '#f59e0b'],  // Tokyo
    [295, 88, '#00ff88'],  // Singapore
    [190, 68, '#c084fc'],  // Dubai
    [95, 130, '#0ea5e9'],  // Sao Paulo
    [330, 135, '#00ff88'], // Sydney
  ];

  cities.forEach(([cx, cy, col]) => {
    const px = (cx / 360) * 1024;
    const py = (cy / 180) * 512;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export default function GlobeWidget({ style }: GlobeWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);

  useEffect(() => {
    if (reduceMotion || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 254;
    const height = 220;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(width, height);
    } catch (err) {
      console.warn('[SysForge] WebGL unavailable — globe widget disabled.', err);
      return;
    }
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'grab';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.2;

    scene.add(new THREE.AmbientLight(0xbfdcff, 1.1));
    const sun = new THREE.DirectionalLight(0x00ff88, 1.2);
    sun.position.set(-2, 1.5, 2.5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x0ea5e9, 1.0);
    rim.position.set(3, -1, -2);
    scene.add(rim);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ── Procedural Textured Earth ──
    const earthTex = createProceduralEarthTexture();
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      shininess: 15,
      specular: new THREE.Color(0x0ea5e9),
      emissive: new THREE.Color(0x021526),
      emissiveIntensity: 0.4,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), earthMat);
    globeGroup.add(earthMesh);

    // Outer HUD Graticule wireframe sphere
    const wireGeo = new THREE.SphereGeometry(1.02, 24, 24);
    const wireMat = new THREE.MeshBasicMaterial({
      wireframe: true, color: 0x0ea5e9, transparent: true, opacity: 0.12,
    });
    const wireSphere = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wireSphere);

    // Atmosphere halo
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9, transparent: true, opacity: 0.1, side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 32), atmosMat);
    globeGroup.add(atmosphere);

    // ── Orbiting Satellites with glowing trails ──
    interface Satellite {
      mesh: THREE.Mesh;
      ring: THREE.Line;
      trail: THREE.Line;
      trailPositions: Float32Array;
      speed: number; radius: number; tiltX: number; tiltZ: number; phase: number;
    }
    const satellites: Satellite[] = [];
    const satGeo = new THREE.OctahedronGeometry(0.035);
    const TRAIL_LEN = 20;

    const satSpecs = [
      { radius: 1.35, speed: 0.65, color: 0x00ff88 },
      { radius: 1.5, speed: -0.45, color: 0x0ea5e9 },
      { radius: 1.65, speed: 0.35, color: 0xf59e0b },
      { radius: 1.8, speed: -0.22, color: 0xc084fc },
    ];

    satSpecs.forEach((spec, i) => {
      // Orbit ring
      const ringPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 96; a++) {
        const ang = (a / 96) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(ang) * spec.radius, 0, Math.sin(ang) * spec.radius));
      }
      const ringMat = new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.18 });
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat);
      ring.rotation.x = (i * 0.45) - 0.6;
      ring.rotation.z = (i * 0.35) - 0.4;
      globeGroup.add(ring);

      // Satellite mesh
      const satMeshMat = new THREE.MeshBasicMaterial({ color: spec.color });
      const mesh = new THREE.Mesh(satGeo, satMeshMat);
      globeGroup.add(mesh);

      // Trail
      const trailPositions = new Float32Array(TRAIL_LEN * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMat = new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.4 });
      const trail = new THREE.Line(trailGeo, trailMat);
      globeGroup.add(trail);

      satellites.push({
        mesh, ring, trail, trailPositions,
        speed: spec.speed, radius: spec.radius,
        tiltX: ring.rotation.x, tiltZ: ring.rotation.z,
        phase: (i / satSpecs.length) * Math.PI * 2,
      });
    });

    // ── Interaction: drag rotate / wheel zoom / dblclick reset ──
    const rotationRef = { x: 0.25, y: 0 };
    const zoomRef = { z: 3.2 };
    const mouseRef = { isDown: false, lastX: 0, lastY: 0 };
    const velocityRef = { vx: 0.002, vy: 0 };

    const onMouseDown = (e: MouseEvent) => {
      mouseRef.isDown = true;
      mouseRef.lastX = e.clientX;
      mouseRef.lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseRef.isDown) return;
      const dx = e.clientX - mouseRef.lastX;
      const dy = e.clientY - mouseRef.lastY;
      velocityRef.vx = dx * 0.007;
      velocityRef.vy = dy * 0.007;
      rotationRef.y += dx * 0.007;
      rotationRef.x += dy * 0.007;
      rotationRef.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.x));
      mouseRef.lastX = e.clientX;
      mouseRef.lastY = e.clientY;
    };
    const onMouseUpWindow = () => {
      mouseRef.isDown = false;
      canvas.style.cursor = 'grab';
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.z = Math.max(1.8, Math.min(5.5, zoomRef.z + e.deltaY * 0.0025));
    };
    const onDblClick = () => {
      rotationRef.x = 0.25;
      rotationRef.y = 0;
      zoomRef.z = 3.2;
      velocityRef.vx = 0.002;
      velocityRef.vy = 0;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUpWindow);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);

    const satPosAt = (sat: Satellite, angle: number): THREE.Vector3 => {
      const x = Math.cos(angle) * sat.radius;
      const z = Math.sin(angle) * sat.radius;
      const v = new THREE.Vector3(x, 0, z);
      v.applyEuler(new THREE.Euler(sat.tiltX, 0, sat.tiltZ));
      return v;
    };

    const stopLoop = createThrottledLoop(
      (time) => {
        if (!mouseRef.isDown) {
          rotationRef.y += velocityRef.vx + 0.0018;
          rotationRef.x += velocityRef.vy;
          velocityRef.vx *= 0.95;
          velocityRef.vy *= 0.95;
        }
        globeGroup.rotation.y = rotationRef.y;
        globeGroup.rotation.x = rotationRef.x;

        camera.position.z += (zoomRef.z - camera.position.z) * 0.12;

        atmosMat.opacity = 0.08 + 0.03 * Math.sin(time * 0.001);

        satellites.forEach((sat) => {
          const angle = time * 0.001 * sat.speed + sat.phase;
          const pos = satPosAt(sat, angle);
          sat.mesh.position.copy(pos);
          sat.mesh.rotation.y = time * 0.002;
          sat.mesh.rotation.x = time * 0.001;

          const tp = sat.trailPositions;
          for (let i = TRAIL_LEN - 1; i > 0; i--) {
            tp[i * 3] = tp[(i - 1) * 3];
            tp[i * 3 + 1] = tp[(i - 1) * 3 + 1];
            tp[i * 3 + 2] = tp[(i - 1) * 3 + 2];
          }
          tp[0] = pos.x; tp[1] = pos.y; tp[2] = pos.z;
          (sat.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        });

        renderer.render(scene, camera);
      },
      { fpsCap }
    );

    return () => {
      stopLoop();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUpWindow);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
      renderer.dispose();
      earthTex.dispose();
      earthMat.dispose();
      wireGeo.dispose(); wireMat.dispose();
      atmosMat.dispose(); satGeo.dispose();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [fpsCap, reduceMotion]);

  if (reduceMotion) {
    return (
      <div style={{ width: '100%', height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b' }}>
        GLOBE (REDUCED MOTION)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 220,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 8.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 0 6px rgba(0, 255, 136, 0.4)',
        }}
      >
        EARTH 3D │ DRAG · ZOOM
      </div>
    </div>
  );
}
