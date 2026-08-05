import { useEffect, useRef, useState } from 'react';

/**
 * NetworkMonitor — animated network traffic monitor widget.
 * Shows live up/down bandwidth with a scrolling area chart.
 * Uses simulated data (smooth random walk) since real network stats
 * require Tauri backend calls.
 */

const W = 240;
const H = 120;
const HISTORY_LEN = 60;

export default function NetworkMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downMbps, setDownMbps] = useState(0);
  const [upMbps, setUpMbps] = useState(0);
  const downHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const upHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const phaseRef = useRef({ down: 25, up: 8, t: 0 });

  // Update data every second
  useEffect(() => {
    const interval = setInterval(() => {
      const p = phaseRef.current;
      p.t += 1;

      // Smooth random walk
      p.down += (Math.random() - 0.5) * 20;
      p.down = Math.max(2, Math.min(120, p.down));
      p.up += (Math.random() - 0.5) * 8;
      p.up = Math.max(0.5, Math.min(40, p.up));

      // Occasional spike
      if (Math.random() < 0.08) p.down *= 1.6;

      setDownMbps(p.down);
      setUpMbps(p.up);

      downHistRef.current = [...downHistRef.current.slice(1), p.down];
      upHistRef.current = [...upHistRef.current.slice(1), p.up];
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Render chart
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

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const downHist = downHistRef.current;
      const upHist = upHistRef.current;

      // Clear
      ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (H / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      const maxVal = 130;
      const stepX = W / (HISTORY_LEN - 1);

      // Download area (cyan)
      ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (downHist[i] / maxVal) * H;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Download line
      ctx.beginPath();
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (downHist[i] / maxVal) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Upload area (green)
      ctx.fillStyle = 'rgba(0, 255, 136, 0.12)';
      ctx.strokeStyle = '#00ff88';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (upHist[i] / maxVal) * H;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Upload line
      ctx.beginPath();
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (upHist[i] / maxVal) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div style={{ width: W, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>NETWORK</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>eth0</span>
      </div>

      <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <div>
          <span style={{ color: '#0ea5e9' }}>↓</span>{' '}
          <span style={{ color: '#e2e8f0' }}>{downMbps.toFixed(1)}</span>
          <span style={{ color: '#64748b', fontSize: 9 }}> MB/s</span>
        </div>
        <div>
          <span style={{ color: '#00ff88' }}>↑</span>{' '}
          <span style={{ color: '#e2e8f0' }}>{upMbps.toFixed(1)}</span>
          <span style={{ color: '#64748b', fontSize: 9 }}> MB/s</span>
        </div>
      </div>
    </div>
  );
}
