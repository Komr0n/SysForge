import { useEffect, useRef, useState } from 'react';

/**
 * CpuRamGraph — scrolling line chart showing CPU and RAM usage over time.
 * Each line keeps a rolling window of the last 60 seconds.
 */

const W = 240;
const H = 120;
const HISTORY_LEN = 60;

export default function CpuRamGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cpu, setCpu] = useState(0);
  const [ram, setRam] = useState(0);
  const cpuHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const ramHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const stateRef = useRef({ cpu: 20, ram: 45 });

  useEffect(() => {
    const interval = setInterval(() => {
      const s = stateRef.current;
      // CPU random walk with occasional spikes
      s.cpu += (Math.random() - 0.5) * 15;
      if (Math.random() < 0.07) s.cpu += 25;
      s.cpu = Math.max(2, Math.min(98, s.cpu));
      // RAM slower, more stable
      s.ram += (Math.random() - 0.5) * 4;
      s.ram = Math.max(35, Math.min(85, s.ram));

      setCpu(s.cpu);
      setRam(s.ram);
      cpuHistRef.current = [...cpuHistRef.current.slice(1), s.cpu];
      ramHistRef.current = [...ramHistRef.current.slice(1), s.ram];
    }, 1000);
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

    const drawLine = (hist: number[], color: string, fillColor: string) => {
      const stepX = W / (HISTORY_LEN - 1);
      // Fill area
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (hist[i] / 100) * H;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (hist[i] / 100) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (H / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      drawLine(ramHistRef.current, '#0ea5e9', 'rgba(14, 165, 233, 0.12)');
      drawLine(cpuHistRef.current, '#00ff88', 'rgba(0, 255, 136, 0.15)');
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div style={{ width: W, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>PERFORMANCE</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>60s</span>
      </div>

      <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <div>
          <span style={{ color: '#00ff88' }}>●</span> CPU{' '}
          <span style={{ color: '#e2e8f0' }}>{cpu.toFixed(0)}%</span>
        </div>
        <div>
          <span style={{ color: '#0ea5e9' }}>●</span> RAM{' '}
          <span style={{ color: '#e2e8f0' }}>{ram.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
