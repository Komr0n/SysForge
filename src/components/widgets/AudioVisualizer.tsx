import { useEffect, useRef, useState } from 'react';

/**
 * AudioVisualizer — animated frequency-bar equalizer widget.
 * Uses simulated frequency data (no microphone permission needed).
 * Bars react with realistic decaying peaks.
 */

const NUM_BARS = 24;
const W = 240;
const H = 100;

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakDb, setPeakDb] = useState(-30);
  const barsRef = useRef<number[]>(new Array(NUM_BARS).fill(0.1));
  const peaksRef = useRef<number[]>(new Array(NUM_BARS).fill(0));
  const peakHoldRef = useRef<number[]>(new Array(NUM_BARS).fill(0));
  const tRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      tRef.current += 0.18;
      const t = tRef.current;
      let maxV = 0;

      for (let i = 0; i < NUM_BARS; i++) {
        // Layered sines + noise for realistic spectrum
        const freqFactor = 1 - i / NUM_BARS * 0.6; // lows louder
        const base =
          0.45 +
          0.3 * Math.sin(t * 1.3 + i * 0.4) +
          0.2 * Math.sin(t * 2.7 + i * 0.7) +
          0.15 * Math.sin(t * 4.1 + i * 1.1);
        const noise = (Math.random() - 0.5) * 0.25;
        const target = Math.max(0.05, Math.min(1, base * freqFactor + noise));
        barsRef.current[i] = target;
        if (target > maxV) maxV = target;

        // Peak hold with gravity
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
    }, 80);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let frameId: number;
    const barW = W / NUM_BARS;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
      ctx.fillRect(0, 0, W, H);

      const bars = barsRef.current;
      const peaks = peaksRef.current;

      for (let i = 0; i < NUM_BARS; i++) {
        const v = bars[i];
        const barH = v * (H - 10);
        const x = i * barW + 1;
        const y = H - barH - 4;
        const w = barW - 2;

        // Vertical gradient: green bottom -> yellow mid -> red top
        const grad = ctx.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, '#00ff88');
        grad.addColorStop(0.5, '#facc15');
        grad.addColorStop(0.85, '#f97316');
        grad.addColorStop(1, '#ef4444');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, barH);

        // Glow on loud bars
        if (v > 0.7) {
          ctx.shadowColor = '#00ff88';
          ctx.shadowBlur = 6;
          ctx.fillRect(x, y, w, barH);
          ctx.shadowBlur = 0;
        }

        // Peak marker
        const peakY = H - peaks[i] * (H - 10) - 4;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
        ctx.fillRect(x, peakY - 1, w, 2);
      }
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div style={{ width: W, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>SPECTRUM</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>{peakDb} dB</span>
      </div>
      <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />
    </div>
  );
}
