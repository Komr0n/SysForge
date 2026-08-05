import { useEffect, useRef, useState } from 'react';

/**
 * CpuRamGraph — fluid-width scrolling line chart.
 * Adapts to its container width automatically.
 */

const H = 100;
const HISTORY_LEN = 60;

export default function CpuRamGraph() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cpu, setCpu] = useState(0);
  const [ram, setRam] = useState(0);
  const cpuHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const ramHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const stateRef = useRef({ cpu: 20, ram: 45 });

  const draw = (ctx: CanvasRenderingContext2D, W: number) => {
    ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const drawLine = (hist: number[], color: string, fill: string) => {
      const stepX = W / (HISTORY_LEN - 1);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; i < HISTORY_LEN; i++) {
        ctx.lineTo(i * stepX, H - (hist[i] / 100) * H);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX;
        const y = H - (hist[i] / 100) * H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawLine(ramHistRef.current, '#0ea5e9', 'rgba(14, 165, 233, 0.12)');
    drawLine(cpuHistRef.current, '#00ff88', 'rgba(0, 255, 136, 0.15)');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
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
      const s = stateRef.current;
      s.cpu += (Math.random() - 0.5) * 15;
      if (Math.random() < 0.07) s.cpu += 25;
      s.cpu = Math.max(2, Math.min(98, s.cpu));
      s.ram += (Math.random() - 0.5) * 4;
      s.ram = Math.max(35, Math.min(85, s.ram));
      setCpu(s.cpu);
      setRam(s.ram);
      cpuHistRef.current = [...cpuHistRef.current.slice(1), s.cpu];
      ramHistRef.current = [...ramHistRef.current.slice(1), s.ram];
      const W = wrap.clientWidth || 200;
      draw(ctx, W);
    }, 1000);

    return () => { clearInterval(interval); ro.disconnect(); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', padding: '6px 8px', minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>PERFORMANCE</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>60s</span>
      </div>

      <div ref={wrapRef} style={{ flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: H, display: 'block' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        <div>
          <span style={{ color: '#00ff88' }}>● CPU </span>
          <span style={{ color: '#e2e8f0' }}>{cpu.toFixed(0)}%</span>
        </div>
        <div>
          <span style={{ color: '#0ea5e9' }}>● RAM </span>
          <span style={{ color: '#e2e8f0' }}>{ram.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
