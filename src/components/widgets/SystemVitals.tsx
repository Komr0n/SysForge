import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * SystemVitals — compact concentric ring chart.
 * Two modes via `compact` prop:
 *   compact=true  → small version for TelemetryBar (fits 140px height)
 *   compact=false → full version for standalone (default)
 */

interface SystemVitalsProps {
  style?: React.CSSProperties;
  compact?: boolean;
}

interface VitalsData {
  cpu: number;
  ram: number;
  disk: number;
  fps: number;
}

export default function SystemVitals({ style, compact = false }: SystemVitalsProps) {
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);
  const [data, setData] = useState<VitalsData>({ cpu: 0, ram: 0, disk: 0, fps: 0 });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => ({
        cpu: Math.min(100, Math.max(0, prev.cpu + (Math.random() - 0.5) * 10)),
        ram: 45 + Math.random() * 20,
        disk: 30 + Math.random() * 15,
        fps: reduceMotion ? 0 : prev.fps,
      }));
    }, 2000);
    const timeInterval = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(timeInterval); };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    let frames = 0, last = performance.now(), rafId = 0;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (document.hidden) return;
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setData((prev) => ({ ...prev, fps: Math.round((frames * 1000) / (now - last)) }));
        frames = 0;
        last = now;
      }
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [reduceMotion]);

  // Compact mode: smaller rings, no labels below, clock in center
  const SVG_SIZE = compact ? 128 : 200;
  const CENTER = SVG_SIZE / 2;
  const BASE_R = compact ? 52 : 80;
  const STROKE_W = compact ? 7 : 10;
  const GAP = compact ? 12 : 16;

  const rings = [
    { label: 'CPU', value: Math.round(data.cpu), color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)', radius: BASE_R },
    { label: 'RAM', value: Math.round(data.ram), color: '#0ea5e9', bgColor: 'rgba(14, 165, 233, 0.1)', radius: BASE_R - GAP },
    { label: 'DISK', value: Math.round(data.disk), color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.1)', radius: BASE_R - GAP * 2 },
    { label: 'FPS', value: Math.min(120, data.fps), color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', radius: BASE_R - GAP * 3 },
  ];

  const circumference = (r: number) => 2 * Math.PI * r;
  const fpsMax = 120;

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: compact ? 8 : 0, ...style }}>
      <div style={{ position: 'relative', width: SVG_SIZE, height: SVG_SIZE, flexShrink: 0 }}>
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
                <circle cx={CENTER} cy={CENTER} r={ring.radius} strokeWidth={STROKE_W} fill="none" stroke={ring.bgColor} />
                <circle
                  cx={CENTER} cy={CENTER} r={ring.radius}
                  strokeWidth={STROKE_W} fill="none" stroke={ring.color}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 3px ${ring.color}40)` }}
                />
              </g>
            );
          })}
        </svg>

        {/* Center: time */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          <div style={{ fontSize: compact ? 13 : 20, fontWeight: 300, color: '#e2e8f0', letterSpacing: 1 }}>
            {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
          </div>
          {!compact && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, letterSpacing: 1 }}>
              {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Labels — side in compact, below in full */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
        gap: compact ? '4px 0' : '4px 12px',
        fontFamily: 'var(--font-mono)',
        padding: compact ? '0 4px' : '6px 0 0',
      }}>
        {rings.map((ring, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: compact ? 9 : 10, minWidth: compact ? 70 : 'auto' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ring.color, boxShadow: `0 0 4px ${ring.color}80`, flexShrink: 0 }} />
            <span style={{ color: '#64748b' }}>{ring.label}</span>
            <span style={{ color: ring.color, marginLeft: 'auto', minWidth: 28, textAlign: 'right' }}>
              {ring.value}{ring.label === 'FPS' ? '' : '%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
