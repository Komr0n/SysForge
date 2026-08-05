import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * AudioVisualizer — fluid-width frequency-bar equalizer widget.
 */

const NUM_BARS = 24;
const H = 80;

export default function AudioVisualizer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);
  const [peakDb, setPeakDb] = useState(-30);
  const barsRef = useRef<number[]>(new Array(NUM_BARS).fill(0.1));
  const peaksRef = useRef<number[]>(new Array(NUM_BARS).fill(0));
  const peakHoldRef = useRef<number[]>(new Array(NUM_BARS).fill(0));
  const tRef = useRef(0);

  const draw = (ctx: CanvasRenderingContext2D, W: number) => {
    const bars = barsRef.current;
    const peaks = peaksRef.current;
    const barW = W / NUM_BARS;

    ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < NUM_BARS; i++) {
      const v = bars[i];
      const barH = v * (H - 8);
      const x = i * barW + 1;
      const y = H - barH - 3;
      const w = barW - 2;

      const grad = ctx.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, '#00ff88');
      grad.addColorStop(0.5, '#facc15');
      grad.addColorStop(0.85, '#f97316');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, barH);

      const peakY = H - peaks[i] * (H - 8) - 3;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.fillRect(x, peakY - 1, w, 2);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const W = wrap.clientWidth || 200;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      draw(ctx, W);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const interval = setInterval(() => {
      if (document.hidden) return;
      tRef.current += 0.18;
      const t = tRef.current;
      let maxV = 0;
      for (let i = 0; i < NUM_BARS; i++) {
        const freqFactor = 1 - (i / NUM_BARS) * 0.6;
        const base = 0.45 + 0.3 * Math.sin(t * 1.3 + i * 0.4) + 0.2 * Math.sin(t * 2.7 + i * 0.7) + 0.15 * Math.sin(t * 4.1 + i * 1.1);
        const noise = (Math.random() - 0.5) * 0.25;
        const target = Math.max(0.05, Math.min(1, base * freqFactor + noise));
        barsRef.current[i] = target;
        if (target > maxV) maxV = target;
        if (target > peaksRef.current[i]) {
          peaksRef.current[i] = target;
          peakHoldRef.current[i] = 18;
        } else if (peakHoldRef.current[i] > 0) {
          peakHoldRef.current[i]--;
        } else {
          peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 0.03);
        }
      }
      setPeakDb(Math.round(20 * Math.log10(Math.max(0.001, maxV))));
      const W = wrap.clientWidth || 200;
      draw(ctx, W);
    }, 100);

    return () => { clearInterval(interval); ro.disconnect(); };
  }, [reduceMotion]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>SPECTRUM</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>{peakDb} dB</span>
      </div>
      <div ref={wrapRef} style={{ width: '100%' }}>
        {reduceMotion
          ? <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>MOTION DISABLED</div>
          : <canvas ref={canvasRef} style={{ width: '100%', height: H, display: 'block' }} />
        }
      </div>
    </div>
  );
}
