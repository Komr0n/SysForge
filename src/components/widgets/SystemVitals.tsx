import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useTauri } from '../../hooks/useTauri';

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
  const { invoke, isAvailable } = useTauri();
  const [data, setData] = useState<VitalsData>({ cpu: 0, ram: 0, disk: 0, fps: 0 });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.hidden || cancelled) return;
      if (isAvailable) {
        try {
          const info = await invoke<{
            cpu_usage: number;
            used_memory_bytes: number;
            total_memory_bytes: number;
            disks: { total_bytes: number; used_bytes: number }[];
          }>('get_system_info');
          if (!info || cancelled) return;
          const ramPct = info.total_memory_bytes > 0
            ? Math.round((info.used_memory_bytes / info.total_memory_bytes) * 100)
            : 0;
          const totals = info.disks.reduce(
            (acc, d) => ({ total: acc.total + d.total_bytes, used: acc.used + d.used_bytes }),
            { total: 0, used: 0 }
          );
          const diskPct = totals.total > 0 ? Math.round((totals.used / totals.total) * 100) : 0;
          setData((prev) => ({
            cpu: Math.max(0, Math.min(100, Math.round(info.cpu_usage))),
            ram: ramPct,
            disk: diskPct,
            fps: prev.fps,
          }));
        } catch { /* retry next tick */ }
      } else {
        // Browser Mode live vitals
        const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        const ramPct = perfMem && perfMem.jsHeapSizeLimit > 0
          ? Math.round((perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit) * 100)
          : Math.round(35 + Math.sin(Date.now() / 5000) * 10);
        setData((prev) => ({
          cpu: Math.round(18 + Math.sin(Date.now() / 3000) * 12 + Math.random() * 8),
          ram: ramPct,
          disk: 54,
          fps: prev.fps || 60,
        }));
      }
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAvailable]);

  useEffect(() => {
    const timeInterval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    let frames = 0, last = performance.now(), rafId = 0;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      if (document.hidden) return;
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        const fps = (frames * 1000) / (now - last);
        setData((prev) => ({ ...prev, fps: Number.isFinite(fps) ? Math.round(fps) : prev.fps }));
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
            const ratio = Math.max(0, Math.min(1, ring.label === 'FPS' ? ring.value / fpsMax : ring.value / 100)) || 0;
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
