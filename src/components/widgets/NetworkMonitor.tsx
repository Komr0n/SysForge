import { useEffect, useRef, useState } from 'react';
import { useTauri } from '../../hooks/useTauri';

/**
 * NetworkMonitor — fluid-width network traffic widget.
 * Real per-interface throughput via Rust get_network_stats (sysinfo).
 * Active telemetry simulation when running in web browser dev mode.
 */

const H = 80;
const HISTORY_LEN = 60;

interface InterfaceStats {
  name: string;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  total_rx_bytes: number;
  total_tx_bytes: number;
}

function fmtRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return bytesPerSec.toFixed(0) + ' B/s';
}

export default function NetworkMonitor() {
  const { invoke, isAvailable } = useTauri();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downBytes, setDownBytes] = useState(0);
  const [upBytes, setUpBytes] = useState(0);
  const downHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));
  const upHistRef = useRef<number[]>(new Array(HISTORY_LEN).fill(0));

  const draw = (ctx: CanvasRenderingContext2D, W: number) => {
    const downHist = downHistRef.current;
    const upHist = upHistRef.current;

    ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const peak = Math.max(...downHist, ...upHist, 1024);
    const stepX = W / (HISTORY_LEN - 1);

    const plotLine = (hist: number[], stroke: string, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = 0; i < HISTORY_LEN; i++) ctx.lineTo(i * stepX, H - Math.min(1, hist[i] / peak) * (H - 4));
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < HISTORY_LEN; i++) {
        const x = i * stepX, y = H - Math.min(1, hist[i] / peak) * (H - 4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    plotLine(upHist, '#00ff88', 'rgba(0, 255, 136, 0.12)');
    plotLine(downHist, '#0ea5e9', 'rgba(14, 165, 233, 0.18)');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled || document.hidden) return;

      if (isAvailable) {
        try {
          const stats = await invoke<{ interfaces: InterfaceStats[] }>('get_network_stats');
          if (!stats?.interfaces) return;
          let rx = 0, tx = 0;
          for (const itf of stats.interfaces) {
            if (/^lo/i.test(itf.name)) continue;
            rx += itf.rx_bytes_per_sec || 0;
            tx += itf.tx_bytes_per_sec || 0;
          }
          setDownBytes(rx);
          setUpBytes(tx);
          downHistRef.current = [...downHistRef.current.slice(1), rx];
          upHistRef.current = [...upHistRef.current.slice(1), tx];
          const W = wrap.clientWidth || 200;
          draw(ctx, W);
        } catch { /* retry */ }
      } else {
        // Browser Mode telemetry simulation
        const rx = Math.floor(1024 * 12 + Math.random() * 1024 * 48);
        const tx = Math.floor(1024 * 4 + Math.random() * 1024 * 16);
        setDownBytes(rx);
        setUpBytes(tx);
        downHistRef.current = [...downHistRef.current.slice(1), rx];
        upHistRef.current = [...upHistRef.current.slice(1), tx];
        const W = wrap.clientWidth || 200;
        draw(ctx, W);
      }
    };

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
    poll();
    const interval = setInterval(poll, 1000);

    return () => { cancelled = true; clearInterval(interval); ro.disconnect(); };
  }, [isAvailable]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#64748b', letterSpacing: 1.5 }}>
          NETWORK TRAFFIC
        </span>
        <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <span style={{ color: '#0ea5e9' }}>↓ {fmtRate(downBytes)}</span>
          <span style={{ color: '#00ff88' }}>↑ {fmtRate(upBytes)}</span>
        </div>
      </div>
      <div ref={wrapRef} style={{ width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: H, display: 'block' }} />
      </div>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>{isAvailable ? '● REAL-TIME TAURI' : '● SIMULATED WEB TELEMETRY'}</span>
        <span>RATE: 1.0s</span>
      </div>
    </div>
  );
}
