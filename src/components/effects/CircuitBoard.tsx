import { useEffect, useRef } from 'react';

/**
 * CircuitBoard — animated digital circuit traces that grow across the screen.
 * Pulses of light travel along the traces periodically.
 */

interface Trace {
  points: { x: number; y: number }[];
  progress: number;
  speed: number;
  pulse: number;
  pulseSpeed: number;
  color: string;
}

const COLORS = [
  '0, 255, 136',
  '14, 165, 233',
  '56, 189, 248',
  '34, 197, 94',
];

function generateTrace(width: number, height: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  // Start at a random edge
  const edge = Math.floor(Math.random() * 4);
  let x: number, y: number;
  if (edge === 0) { x = Math.random() * width; y = 0; }
  else if (edge === 1) { x = width; y = Math.random() * height; }
  else if (edge === 2) { x = Math.random() * width; y = height; }
  else { x = 0; y = Math.random() * height; }

  points.push({ x, y });

  const segments = 6 + Math.floor(Math.random() * 8);
  let dir = Math.random() * Math.PI * 2;

  for (let i = 0; i < segments; i++) {
    // Snap to 0/90 degrees mostly for circuit look
    const useCardinal = Math.random() < 0.7;
    if (useCardinal) {
      dir = Math.floor(Math.random() * 4) * (Math.PI / 2);
    } else {
      dir += (Math.random() - 0.5) * Math.PI * 0.5;
    }
    const len = 40 + Math.random() * 120;
    x = x + Math.cos(dir) * len;
    y = y + Math.sin(dir) * len;
    points.push({ x, y });
  }

  return points;
}

export default function CircuitBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Generate traces
    const traces: Trace[] = [];
    for (let i = 0; i < 14; i++) {
      const pts = generateTrace(canvas.width, canvas.height);
      traces.push({
        points: pts,
        progress: Math.random(),
        speed: 0.0008 + Math.random() * 0.002,
        pulse: Math.random(),
        pulseSpeed: 0.005 + Math.random() * 0.01,
        color: COLORS[i % COLORS.length],
      });
    }

    // Junction nodes
    const nodes: { x: number; y: number; pulse: number; pulseSpeed: number; size: number }[] = [];
    for (const trace of traces) {
      for (const pt of trace.points) {
        if (Math.random() < 0.4) {
          nodes.push({
            x: pt.x,
            y: pt.y,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: 0.01 + Math.random() * 0.02,
            size: 1.5 + Math.random() * 2,
          });
        }
      }
    }

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 30;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      ctx.fillStyle = 'rgba(3, 6, 12, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw trace lines (dim base)
      ctx.globalCompositeOperation = 'lighter';

      for (const trace of traces) {
        const color = trace.color;

        // Base trace
        ctx.strokeStyle = `rgba(${color}, 0.08)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(trace.points[0].x, trace.points[0].y);
        for (let i = 1; i < trace.points.length; i++) {
          ctx.lineTo(trace.points[i].x, trace.points[i].y);
        }
        ctx.stroke();

        // Travelling pulse along the trace
        trace.progress += trace.speed;
        if (trace.progress > 1) trace.progress = 0;

        const totalLen = trace.points.reduce((acc, pt, i) => {
          if (i === 0) return 0;
          const dx = pt.x - trace.points[i - 1].x;
          const dy = pt.y - trace.points[i - 1].y;
          return acc + Math.sqrt(dx * dx + dy * dy);
        }, 0);

        const targetLen = totalLen * trace.progress;
        let accumLen = 0;
        let pulsePos = { x: trace.points[0].x, y: trace.points[0].y };

        for (let i = 1; i < trace.points.length; i++) {
          const dx = trace.points[i].x - trace.points[i - 1].x;
          const dy = trace.points[i].y - trace.points[i - 1].y;
          const segLen = Math.sqrt(dx * dx + dy * dy);
          if (accumLen + segLen >= targetLen) {
            const t = (targetLen - accumLen) / segLen;
            pulsePos = {
              x: trace.points[i - 1].x + dx * t,
              y: trace.points[i - 1].y + dy * t,
            };
            break;
          }
          accumLen += segLen;
        }

        // Pulse glow
        const pulseSize = 3 + Math.sin(time * 0.005) * 1;
        const grad = ctx.createRadialGradient(pulsePos.x, pulsePos.y, 0, pulsePos.x, pulsePos.y, 20);
        grad.addColorStop(0, `rgba(${color}, 0.8)`);
        grad.addColorStop(0.5, `rgba(${color}, 0.3)`);
        grad.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pulsePos.x, pulsePos.y, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${color}, 1)`;
        ctx.beginPath();
        ctx.arc(pulsePos.x, pulsePos.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Junction nodes
      for (const node of nodes) {
        node.pulse += node.pulseSpeed;
        const brightness = 0.3 + 0.5 * Math.abs(Math.sin(node.pulse));

        ctx.fillStyle = `rgba(0, 255, 136, ${brightness * 0.6})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fill();

        // Small square around node for circuit look
        ctx.strokeStyle = `rgba(0, 255, 136, ${brightness * 0.2})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(node.x - node.size * 2, node.y - node.size * 2, node.size * 4, node.size * 4);
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.75,
      }}
    />
  );
}
