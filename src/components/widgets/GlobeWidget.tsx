// src/components/widgets/GlobeWidget.tsx
// Высокодетализированный 3D-глобус Земли с реальными географическими материками (NASA Blue Marble),
// ночными огнями мегаполисов, атмосферным свечением, маяками городов, кибер-трассами и спутниками.
// Интегрирован с голосовым движком Jarvis: реагирует на речь и прослушивание пульсацией и сменой спектра.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSettingsStore } from '../../store/settingsStore';
import { createThrottledLoop } from '../../hooks/useCanvasLoop';
import { getVoiceService, JarvisState } from '../../lib/jarvis/voice-service';

interface GlobeWidgetProps {
  height?: number;
  style?: React.CSSProperties;
}

/** Преобразование географических координат (Широта, Долгота) в 3D Vector3 на сфере */
function latLonToVector3(lat: number, lon: number, radius = 1.01): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/** Создание дуги трафика данных между двумя точками на глобусе */
function createGreatArc(p1: THREE.Vector3, p2: THREE.Vector3, color: number): { line: THREE.Line; pulseMesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3 } {
  const dist = p1.distanceTo(p2);
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  // Поднимаем центр дуги пропорционально расстоянию
  const altitude = 1.0 + Math.min(0.35, dist * 0.18);
  mid.normalize().multiplyScalar(altitude);

  const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
  const points = curve.getPoints(40);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);

  // Светящийся импульс, бегущий по дуге
  const pulseGeo = new THREE.SphereGeometry(0.013, 8, 8);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);

  return { line, pulseMesh, curve };
}

export default function GlobeWidget({ height: propHeight = 350, style }: GlobeWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);

  useEffect(() => {
    if (reduceMotion || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 380;
    const height = propHeight || container.clientHeight || 350;

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
    // FOV 45, Z = 3.6 обеспечивает полное отображение сферы и всех спутниковых орбит без обрезания рамками
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.6;

    // Освещение сцены
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0x00f0ff, 1.4);
    sun.position.set(-3, 2, 3);
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    rimLight.position.set(3, -1, -2.5);
    scene.add(rimLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ── 1. Реальная географическая Земля с материками (NASA Satellite Map) ──
    const texLoader = new THREE.TextureLoader();
    const earthTex = texLoader.load('/earth.jpg');
    const lightsTex = texLoader.load('/earth_lights.png');
    earthTex.colorSpace = THREE.SRGBColorSpace;
    lightsTex.colorSpace = THREE.SRGBColorSpace;

    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      emissiveMap: lightsTex,
      emissive: new THREE.Color(0x00d4aa),
      emissiveIntensity: 0.95,
      shininess: 25,
      specular: new THREE.Color(0x0ea5e9),
    });

    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
    globeGroup.add(earthMesh);

    // ── 2. Тактическая координатная сетка (Graticule) ──
    const wireGeo = new THREE.SphereGeometry(1.008, 36, 18);
    const wireMat = new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0x00ff88,
      transparent: true,
      opacity: 0.08,
    });
    const wireSphere = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wireSphere);

    // ── 3. Атмосферный ореол свечения Земли (Atmosphere Halo) ──
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.15, 48, 48), atmosMat);
    globeGroup.add(atmosphere);

    // ── 4. Реальные ключевые узлы городов и кибер-маяки ──
    interface CityInfo {
      name: string;
      lat: number;
      lon: number;
      color: number;
    }

    const CITIES: CityInfo[] = [
      { name: 'NYC', lat: 40.71, lon: -74.00, color: 0x00ff88 },
      { name: 'SFO', lat: 37.77, lon: -122.41, color: 0x00ffaa },
      { name: 'CHI', lat: 41.88, lon: -87.63, color: 0x38bdf8 },
      { name: 'TOR', lat: 43.65, lon: -79.38, color: 0x38bdf8 },
      { name: 'LAX', lat: 34.05, lon: -118.24, color: 0x00ffaa },
      { name: 'SAO', lat: -23.55, lon: -46.63, color: 0xfacc15 },
      { name: 'BUE', lat: -34.60, lon: -58.38, color: 0xf59e0b },
      { name: 'RIO', lat: -22.90, lon: -43.17, color: 0xfacc15 },
      { name: 'LON', lat: 51.50, lon: -0.12, color: 0x38bdf8 },
      { name: 'PAR', lat: 48.85, lon: 2.35, color: 0x00f0ff },
      { name: 'BER', lat: 52.52, lon: 13.40, color: 0x00ff88 },
      { name: 'ROM', lat: 41.90, lon: 12.49, color: 0x00f0ff },
      { name: 'MAD', lat: 40.41, lon: -3.70, color: 0xfacc15 },
      { name: 'MOW', lat: 55.75, lon: 37.61, color: 0xc084fc },
      { name: 'TAS', lat: 41.29, lon: 69.24, color: 0x00f0ff },
      { name: 'DXB', lat: 25.20, lon: 55.27, color: 0xf43f5e },
      { name: 'CAI', lat: 30.04, lon: 31.23, color: 0xfacc15 },
      { name: 'JNB', lat: -26.20, lon: 28.04, color: 0x10b981 },
      { name: 'CPT', lat: -33.92, lon: 18.42, color: 0x06b6d4 },
      { name: 'DEL', lat: 28.61, lon: 77.21, color: 0xf59e0b },
      { name: 'BOM', lat: 19.07, lon: 72.87, color: 0xf59e0b },
      { name: 'SIN', lat: 1.35, lon: 103.81, color: 0x10b981 },
      { name: 'BKK', lat: 13.75, lon: 100.50, color: 0x00ffaa },
      { name: 'TYO', lat: 35.67, lon: 139.65, color: 0xf59e0b },
      { name: 'BEI', lat: 39.90, lon: 116.40, color: 0xf43f5e },
      { name: 'SHA', lat: 31.23, lon: 121.47, color: 0x38bdf8 },
      { name: 'SEO', lat: 37.56, lon: 126.97, color: 0x00f0ff },
      { name: 'HKG', lat: 22.31, lon: 114.17, color: 0x38bdf8 },
      { name: 'SYD', lat: -33.86, lon: 151.20, color: 0x06b6d4 },
      { name: 'MEL', lat: -37.81, lon: 144.96, color: 0x00ff88 },
      { name: 'AKL', lat: -36.85, lon: 174.76, color: 0x00ff88 },
    ];

    const cityPoints: { [key: string]: THREE.Vector3 } = {};
    const cityDotGeo = new THREE.SphereGeometry(0.014, 12, 12);
    const beaconGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.065, 6);

    CITIES.forEach((city) => {
      const pos = latLonToVector3(city.lat, city.lon, 1.012);
      cityPoints[city.name] = pos;

      // Точка на поверхности
      const dotMat = new THREE.MeshBasicMaterial({
        color: city.color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const dot = new THREE.Mesh(cityDotGeo, dotMat);
      dot.position.copy(pos);
      globeGroup.add(dot);

      // Радиальный луч маяка, направленный от центра Земли
      const beaconMat = new THREE.MeshBasicMaterial({
        color: city.color,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);

      // Ориентируем луч радиально
      const normal = pos.clone().normalize();
      beacon.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.032)));
      beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      globeGroup.add(beacon);
    });

    // ── 5. Дуги передачи данных (Global Cyber Traffic Beams) ──
    const ARC_ROUTES: [string, string, number][] = [
      // Трансатлантические и европейские магистрали
      ['NYC', 'LON', 0x00f0ff],
      ['TOR', 'LON', 0x38bdf8],
      ['BUE', 'SAO', 0xfacc15],
      ['SAO', 'RIO', 0xf59e0b],
      ['RIO', 'NYC', 0x00ff88],
      ['SAO', 'NYC', 0x38bdf8],
      ['LON', 'PAR', 0x00ff88],
      ['PAR', 'BER', 0x00f0ff],
      ['BER', 'MOW', 0xc084fc],
      ['PAR', 'MAD', 0xfacc15],
      ['MAD', 'ROM', 0x00f0ff],
      ['ROM', 'CAI', 0xf59e0b],
      ['MOW', 'TAS', 0x00ff88],
      ['LON', 'DXB', 0x38bdf8],
      ['DXB', 'TAS', 0x00f0ff],
      // Азиатско-Тихоокеанские и ближневосточные
      ['TAS', 'DEL', 0x00ffaa],
      ['DEL', 'BOM', 0xf59e0b],
      ['BOM', 'DXB', 0xf43f5e],
      ['DEL', 'SIN', 0x10b981],
      ['SIN', 'BKK', 0x00ff88],
      ['BKK', 'HKG', 0x00f0ff],
      ['SIN', 'HKG', 0x38bdf8],
      ['HKG', 'SHA', 0x00ff88],
      ['SHA', 'BEI', 0xf43f5e],
      ['HKG', 'TYO', 0xf59e0b],
      ['BEI', 'SEO', 0x00f0ff],
      ['SEO', 'TYO', 0x38bdf8],
      // Транстихоокеанские и американские
      ['TYO', 'SFO', 0x00e5ff],
      ['TYO', 'LAX', 0x38bdf8],
      ['SFO', 'CHI', 0x00ffaa],
      ['LAX', 'CHI', 0x00f0ff],
      ['CHI', 'TOR', 0x38bdf8],
      ['CHI', 'NYC', 0x38bdf8],
      ['SFO', 'NYC', 0x00ff88],
      // Южное полушарие и Африка
      ['SIN', 'SYD', 0x06b6d4],
      ['SYD', 'MEL', 0x00f0ff],
      ['MEL', 'AKL', 0x00ff88],
      ['CAI', 'DXB', 0xfacc15],
      ['CAI', 'JNB', 0x10b981],
      ['JNB', 'CPT', 0x06b6d4],
      ['CPT', 'LON', 0x38bdf8],
      ['JNB', 'DXB', 0xf43f5e],
    ];

    const trafficArcs: Array<{
      line: THREE.Line;
      pulseMesh: THREE.Mesh;
      curve: THREE.QuadraticBezierCurve3;
      speed: number;
      offset: number;
    }> = [];

    ARC_ROUTES.forEach(([c1, c2, color], idx) => {
      const p1 = cityPoints[c1];
      const p2 = cityPoints[c2];
      if (p1 && p2) {
        const arc = createGreatArc(p1, p2, color);
        globeGroup.add(arc.line);
        globeGroup.add(arc.pulseMesh);
        trafficArcs.push({
          ...arc,
          speed: 0.22 + (idx % 4) * 0.08,
          offset: (idx / ARC_ROUTES.length),
        });
      }
    });

    // ── 6. Орбитальные спутники (радиусы сбалансированы 1.18 - 1.45, без выхода за границы) ──
    interface Satellite {
      mesh: THREE.Mesh;
      ring: THREE.Line;
      trail: THREE.Line;
      trailPositions: Float32Array;
      speed: number;
      radius: number;
      tiltX: number;
      tiltZ: number;
      phase: number;
    }

    const satellites: Satellite[] = [];
    const satGeo = new THREE.OctahedronGeometry(0.024);
    const TRAIL_LEN = 20;

    const satSpecs = [
      { radius: 1.18, speed: 0.72, color: 0x00ff88, tiltX: -0.55, tiltZ: 0.30 },
      { radius: 1.22, speed: -0.62, color: 0x00f0ff, tiltX: 0.40, tiltZ: -0.45 },
      { radius: 1.26, speed: 0.52, color: 0xf59e0b, tiltX: 1.10, tiltZ: 0.15 },  // Полярная орбита
      { radius: 1.30, speed: -0.44, color: 0xc084fc, tiltX: -0.25, tiltZ: -0.65 },
      { radius: 1.34, speed: 0.38, color: 0x38bdf8, tiltX: 0.75, tiltZ: 0.50 },
      { radius: 1.38, speed: -0.32, color: 0xf43f5e, tiltX: -0.95, tiltZ: -0.20 }, // Ретроградная
      { radius: 1.42, speed: 0.26, color: 0x10b981, tiltX: 0.20, tiltZ: 0.80 },
      { radius: 1.45, speed: -0.22, color: 0xfacc15, tiltX: -0.45, tiltZ: 0.35 },  // Внешняя высокая
    ];

    satSpecs.forEach((spec, i) => {
      // Орбитальное кольцо
      const ringPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 96; a++) {
        const ang = (a / 96) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(ang) * spec.radius, 0, Math.sin(ang) * spec.radius));
      }
      const ringMat = new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.18 });
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat);
      ring.rotation.x = spec.tiltX;
      ring.rotation.z = spec.tiltZ;
      globeGroup.add(ring);

      // Спутник
      const satMeshMat = new THREE.MeshBasicMaterial({ color: spec.color });
      const mesh = new THREE.Mesh(satGeo, satMeshMat);
      globeGroup.add(mesh);

      // Хвост спутника
      const trailPositions = new Float32Array(TRAIL_LEN * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      globeGroup.add(trail);

      satellites.push({
        mesh, ring, trail, trailPositions,
        speed: spec.speed, radius: spec.radius,
        tiltX: spec.tiltX, tiltZ: spec.tiltZ,
        phase: (i / satSpecs.length) * Math.PI * 2,
      });
    });

    // ── 7. Реактивность на состояние голосового помощника Jarvis ──
    let currentJarvisState: JarvisState = 'idle';
    let currentVolume = 0;

    const vs = getVoiceService();
    currentJarvisState = vs.state;

    const unsubState = vs.onStateChange((state) => {
      currentJarvisState = state;
    });
    const unsubVol = vs.onVolume?.((vol) => {
      currentVolume = vol;
    });

    // ── 8. Интерактивное управление: вращение мышью / зум колесом / сброс ──
    const rotationRef = { x: 0.25, y: 0 };
    const zoomRef = { z: 3.6 };
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
      zoomRef.z = Math.max(2.2, Math.min(5.0, zoomRef.z + e.deltaY * 0.0025));
    };

    const onDblClick = () => {
      rotationRef.x = 0.25;
      rotationRef.y = 0;
      zoomRef.z = 3.6;
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

    // ── 9. Цикл анимации с реакцией на голос ──
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

        // Расчёт целевого масштаба и свечения на основе JarvisState
        let targetScale = 1.0;
        let targetEmissive = 0x00d4aa;
        let targetEmissiveIntensity = 0.95;
        let targetAtmosColor = 0x00e5ff;
        let pulseFreq = 0.0012;

        if (currentJarvisState === 'speaking') {
          targetScale = 1.06 + Math.min(0.04, currentVolume * 0.08);
          targetEmissive = 0x00f0ff;
          targetEmissiveIntensity = 1.5;
          targetAtmosColor = 0x38bdf8;
          pulseFreq = 0.0035;
        } else if (currentJarvisState === 'listening') {
          targetScale = 1.03 + Math.min(0.03, currentVolume * 0.06);
          targetEmissive = 0x38bdf8;
          targetEmissiveIntensity = 1.25;
          targetAtmosColor = 0x00ff88;
          pulseFreq = 0.0025;
        } else if (currentJarvisState === 'thinking' || currentJarvisState === 'executing') {
          targetScale = 1.02;
          targetEmissive = 0xf59e0b;
          targetEmissiveIntensity = 1.15;
          targetAtmosColor = 0xfacc15;
          pulseFreq = 0.002;
        }

        // Плавная интерполяция размера сферы
        globeGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

        // Атмосферная пульсация
        atmosMat.opacity = 0.14 + (currentJarvisState !== 'idle' ? 0.10 : 0.04) * Math.sin(time * pulseFreq);
        atmosMat.color.lerp(new THREE.Color(targetAtmosColor), 0.06);

        // Интерполяция ночных огней и материала Земли
        earthMat.emissive.lerp(new THREE.Color(targetEmissive), 0.06);
        earthMat.emissiveIntensity = THREE.MathUtils.lerp(earthMat.emissiveIntensity, targetEmissiveIntensity, 0.08);

        // Анимация бегущих импульсов данных по дугам городов
        const speedBoost = currentJarvisState === 'speaking' ? 1.8 : (currentJarvisState === 'listening' ? 1.4 : 1.0);
        trafficArcs.forEach((arc) => {
          const t = ((time * 0.0006 * arc.speed * speedBoost + arc.offset) % 1);
          const p = arc.curve.getPoint(t);
          arc.pulseMesh.position.copy(p);
        });

        // Анимация спутников
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
          tp[0] = pos.x;
          tp[1] = pos.y;
          tp[2] = pos.z;
          (sat.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        });

        renderer.render(scene, camera);
      },
      { fpsCap }
    );

    return () => {
      stopLoop();
      unsubState?.();
      unsubVol?.();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUpWindow);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);

      // Полная очистка ресурсов Three.js
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      earthTex.dispose();
      lightsTex.dispose();
      renderer.dispose();

      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [fpsCap, reduceMotion, propHeight]);

  if (reduceMotion) {
    return (
      <div style={{ width: '100%', height: propHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b' }}>
        GLOBE (REDUCED MOTION)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: propHeight,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 6,
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
        EARTH 3D │ DRAG · ZOOM · JARVIS REACTIVE
      </div>
    </div>
  );
}

