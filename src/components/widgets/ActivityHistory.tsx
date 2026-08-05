import { useEffect, useRef, useState } from 'react';

/**
 * ActivityHistory — system usage history bar chart.
 * Modes: Weekday (7 bars) or Monthly (12 bars).
 * Click a bar to select it; selected bar shows full value below the chart.
 * Now includes axis grid lines with % labels, a clear legend, and tooltips.
 */

type Mode = 'day' | 'month';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function genData(seed: number, count: number): number[] {
  const data: number[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    data.push(Math.round(20 + r * 75));
  }
  return data;
}

// Tooltip state
interface Tooltip {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  value: number;
}

export default function ActivityHistory() {
  const [mode, setMode] = useState<Mode>('day');
  const todayIdx = mode === 'day' ? (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) : new Date().getMonth();
  const [selected, setSelected] = useState<number>(todayIdx);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>({ visible: false, x: 0, y: 0, label: '', value: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const labels = mode === 'day' ? WEEKDAYS : MONTHS;
  const data = mode === 'day' ? genData(42, 7) : genData(137, 12);

  useEffect(() => {
    setSelected(mode === 'day' ? (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) : new Date().getMonth());
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let frameId: number;
    let animProgress = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      if (animProgress < 1) animProgress = Math.min(1, animProgress + 0.05);

      ctx.clearRect(0, 0, W, H);

      // Chart area
      const chartLeft = 30;
      const chartRight = W - 8;
      const chartTop = 8;
      const chartBottom = H - 24;
      const chartW = chartRight - chartLeft;
      const chartH = chartBottom - chartTop;

      // Y-axis grid lines + labels (0%, 25%, 50%, 75%, 100%)
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.7)';
      ctx.fillStyle = '#475569';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = chartTop + (chartH / 4) * i;
        const val = 100 - i * 25;
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
        ctx.fillText(`${val}`, chartLeft - 4, y + 3);
      }

      // Bars
      const barCount = data.length;
      const barSpace = chartW / barCount;
      const barW = barSpace * 0.55;

      for (let i = 0; i < barCount; i++) {
        const val = data[i];
        const fullH = (val / 100) * chartH * animProgress;
        const x = chartLeft + i * barSpace + (barSpace - barW) / 2;
        const y = chartBottom - fullH;
        const isSel = i === selected;
        const isToday =
          (mode === 'day' && i === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)) ||
          (mode === 'month' && i === new Date().getMonth());
        const isHover = i === hovered;

        // Bar gradient
        const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
        if (isSel) {
          grad.addColorStop(0, '#00ff88');
          grad.addColorStop(1, 'rgba(0, 255, 136, 0.15)');
        } else if (isHover) {
          grad.addColorStop(0, '#22d3ee');
          grad.addColorStop(1, 'rgba(34, 211, 238, 0.15)');
        } else if (isToday) {
          grad.addColorStop(0, '#facc15');
          grad.addColorStop(1, 'rgba(250, 204, 21, 0.1)');
        } else {
          grad.addColorStop(0, 'rgba(14, 165, 233, 0.75)');
          grad.addColorStop(1, 'rgba(14, 165, 233, 0.1)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, fullH);

        // Outline on selected
        if (isSel) {
          ctx.shadowColor = '#00ff88';
          ctx.shadowBlur = 10;
          ctx.fillRect(x, y, barW, fullH);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - 0.5, y - 0.5, barW + 1, fullH + 1);
        }

        // X-axis labels
        ctx.fillStyle = isSel ? '#00ff88' : isToday ? '#facc15' : '#64748b';
        ctx.font = `${isSel ? 'bold ' : ''}9px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, chartBottom + 14);
      }

      ctx.textAlign = 'left';
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [mode, selected, hovered, data, labels]);

  const getBarIdx = (clientX: number, clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const W = rect.width;
    const chartLeft = 30;
    const chartRight = W - 8;
    const chartW = chartRight - chartLeft;
    const barSpace = chartW / data.length;
    const idx = Math.floor((x - chartLeft) / barSpace);
    if (idx < 0 || idx >= data.length) return -1;
    return idx;
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = getBarIdx(e.clientX, e.clientY);
    setHovered(idx >= 0 ? idx : null);
    if (idx >= 0) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setTooltip({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        label: labels[idx],
        value: data[idx],
      });
    } else {
      setTooltip((t) => ({ ...t, visible: false }));
    }
  };

  const handleLeave = () => {
    setHovered(null);
    setTooltip((t) => ({ ...t, visible: false }));
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = getBarIdx(e.clientX, e.clientY);
    if (idx >= 0) setSelected(idx);
  };

  const avg = Math.round(data.reduce((a, b) => a + b, 0) / data.length);
  const max = Math.max(...data);
  const maxLabel = labels[data.indexOf(max)];

  return (
    <div style={{ width: 280, padding: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
          System Activity
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['day', 'month'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '2px 8px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                borderRadius: 4,
                cursor: 'pointer',
                border: `1px solid ${mode === m ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: mode === m ? 'rgba(0, 255, 136, 0.1)' : 'transparent',
                color: mode === m ? 'var(--accent-primary)' : 'var(--text-muted)',
                letterSpacing: 1,
              }}
            >
              {m === 'day' ? 'WEEK' : 'MONTH'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
        Avg CPU usage by {mode === 'day' ? 'weekday' : 'month'} · click bar to select
      </div>

      {/* Chart canvas */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          onClick={handleClick}
          style={{ width: '100%', height: 140, display: 'block', cursor: 'pointer' }}
        />
        {/* Tooltip */}
        {tooltip.visible && (
          <div
            style={{
              position: 'absolute',
              left: tooltip.x + 10,
              top: tooltip.y - 30,
              background: 'rgba(2, 6, 23, 0.95)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 4,
              padding: '3px 7px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {tooltip.label}: <span style={{ color: 'var(--accent-primary)' }}>{tooltip.value}%</span>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--border-color)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Selected: </span>
          <span style={{ color: 'var(--accent-primary)' }}>{labels[selected]} {data[selected]}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Peak: </span>
          <span style={{ color: '#facc15' }}>{maxLabel} {max}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Avg: </span>
          <span style={{ color: '#0ea5e9' }}>{avg}%</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9 }}>
        <LegendDot color="#00ff88" label="Selected" />
        <LegendDot color="#facc15" label="Today" />
        <LegendDot color="#0ea5e9" label="Data" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, boxShadow: `0 0 4px ${color}80` }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
