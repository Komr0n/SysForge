import { useEffect, useRef, useState } from 'react';

interface SystemVitalsProps {
  style?: React.CSSProperties;
}

interface VitalsData {
  cpu: number;
  ram: number;
  disk: number;
  fps: number;
}

const SVG_SIZE = 220;
const CENTER = SVG_SIZE / 2;
const RADIUS = 85;
const STROKE_WIDTH = 10;
const GAP = 18;

export default function SystemVitals({ style }: SystemVitalsProps) {
  const [data, setData] = useState<VitalsData>({ cpu: 0, ram: 0, disk: 0, fps: 0 });
  const [time, setTime] = useState(new Date());
  const fpsRef = useRef(0);
  const framesRef = useRef(0);
  const lastFpsUpdate = useRef(performance.now());

  // FPS counter
  useEffect(() => {
    let rafId: number;
    const loop = () => {
      framesRef.current++;
      const now = performance.now();
      const elapsed = now - lastFpsUpdate.current;
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((framesRef.current * 1000) / elapsed);
        framesRef.current = 0;
        lastFpsUpdate.current = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Vitals + time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => ({
        cpu: Math.min(100, Math.max(0, prev.cpu + (Math.random() - 0.5) * 10)),
        ram: 45 + Math.random() * 20,
        disk: 30 + Math.random() * 15,
        fps: fpsRef.current,
      }));
    }, 2000);

    const timeInterval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);

  const rings = [
    {
      label: 'CPU',
      value: Math.round(data.cpu),
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.1)',
      radius: RADIUS,
    },
    {
      label: 'RAM',
      value: Math.round(data.ram),
      color: '#0ea5e9',
      bgColor: 'rgba(14, 165, 233, 0.1)',
      radius: RADIUS - GAP,
    },
    {
      label: 'DISK',
      value: Math.round(data.disk),
      color: '#00ff88',
      bgColor: 'rgba(0, 255, 136, 0.1)',
      radius: RADIUS - GAP * 2,
    },
    {
      label: 'FPS',
      value: Math.min(120, data.fps),
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.1)',
      radius: RADIUS - GAP * 3,
    },
  ];

  const circumference = (r: number) => 2 * Math.PI * r;
  const fpsMax = 120;

  return (
    <div style={{ width: SVG_SIZE, height: SVG_SIZE + 80, ...style }}>
      <div style={{ position: 'relative', width: SVG_SIZE, height: SVG_SIZE }}>
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}
        >
          {rings.map((ring, i) => {
            const circ = circumference(ring.radius);
            const ratio = ring.label === 'FPS' ? ring.value / fpsMax : ring.value / 100;
            const offset = circ - ratio * circ;
            return (
              <g key={i}>
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={ring.radius}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  stroke={ring.bgColor}
                />
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={ring.radius}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  stroke={ring.color}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  style={{
                    transition: 'stroke-dashoffset 0.8s ease',
                    filter: `drop-shadow(0 0 4px ${ring.color}40)`,
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Center text */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 300, color: '#e2e8f0', letterSpacing: 2 }}>
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>
      </div>

      {/* Labels below the ring chart */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '6px 14px',
        padding: '8px 4px 0',
        fontFamily: 'var(--font-mono)',
      }}>
        {rings.map((ring, i) => (
          <div key={i} style={{ fontSize: 9, color: ring.color, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: ring.color,
              boxShadow: `0 0 4px ${ring.color}60`,
            }} />
            <span style={{ color: '#64748b' }}>{ring.label}</span>
            <span>{ring.value}{ring.label === 'FPS' ? '' : '%'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
