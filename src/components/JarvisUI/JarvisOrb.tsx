// src/components/JarvisUI/JarvisOrb.tsx
// Canvas-анимация сферы Джарвиса

import { useRef, useEffect } from 'react';
import type { JarvisState } from '../../lib/jarvis/voice-service';

interface JarvisOrbProps {
  state: JarvisState;
  size?: number;
}

const STATE_COLORS: Record<JarvisState, string> = {
  idle:      '#4f46e5',
  listening: '#0ea5e9',
  thinking:  '#a855f7',
  executing: '#10b981',
  speaking:  '#f59e0b',
  error:     '#ef4444',
};

const STATE_LABELS: Record<JarvisState, string> = {
  idle:      'IDLE',
  listening: 'LISTENING',
  thinking:  'THINKING',
  executing: 'EXECUTING',
  speaking:  'SPEAKING',
  error:     'ERROR',
};

export function JarvisOrb({ state, size = 18 }: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const color = STATE_COLORS[state];
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    let frame = 0;

    const draw = () => {
      timeRef.current = frame;
      ctx.clearRect(0, 0, size, size);

      const t = frame / 60;

      // Glow outer ring
      const glowRadius = r + 2 + Math.sin(t * 2) * 1.5;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, glowRadius);
      grd.addColorStop(0, color + 'cc');
      grd.addColorStop(0.6, color + '44');
      grd.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Core sphere
      const sphereGrd = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      sphereGrd.addColorStop(0, '#ffffff88');
      sphereGrd.addColorStop(0.4, color + 'dd');
      sphereGrd.addColorStop(1, color + '88');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrd;
      ctx.fill();

      // Pulse rings for listening
      if (state === 'listening') {
        for (let i = 0; i < 2; i++) {
          const phase = (t * 1.5 + i * 0.5) % 1;
          const ringR = r + phase * r * 1.2;
          const alpha = Math.max(0, 1 - phase);
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}${Math.round(alpha * 200).toString(16).padStart(2, '0')}`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Rotating arc for thinking/executing
      if (state === 'thinking' || state === 'executing') {
        const arcStart = t * Math.PI * 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, arcStart, arcStart + Math.PI * 1.2);
        ctx.strokeStyle = color + 'cc';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Brightness pulse for speaking
      if (state === 'speaking') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `${color}${Math.round(pulse * 80).toString(16).padStart(2, '0')}`;
        ctx.fill();
      }

      // Error flash
      if (state === 'error') {
        const flash = Math.sin(t * 10) > 0 ? 1 : 0;
        if (flash) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ef444433';
          ctx.fill();
        }
      }

      frame++;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: 'block' }}
      title={`JARVIS: ${STATE_LABELS[state]}`}
    />
  );
}

export { STATE_LABELS };
