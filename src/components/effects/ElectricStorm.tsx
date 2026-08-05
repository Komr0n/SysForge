import { useEffect, useRef } from 'react';

/**
 * ElectricStorm — lightning bolt effect with branching arcs.
 * Periodically generates lightning that fades out.
 */

interface LightningBolt {
  points: { x: number; y: number }[];
  branches: { points: { x: number; y: number }[] }[];
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

function generateBolt(x1: number, y1: number, x2: number, y2: number, depth: number): { points: { x: number; y: number }[]; branches: { points: { x: number; y: number }[] }[] } {
  const points: { x: number; y: number }[] = [{ x: x1, y: y1 }];
  const branches: { points: { x: number; y: number }[] }[] = [];
  const segments = 8 + Math.floor(Math.random() * 8);
  const dx = (x2 - x1) / segments;
  const dy = (y2 - y1) / segments;

  for (let i = 1; i < segments; i++) {
    const jitter = (Math.random() - 0.5) * 80 * (1 - depth * 0.3);
    points.push({
      x: x1 + dx * i + jitter,
      y: y1 + dy * i + (Math.random() - 0.5) * 20,
    });

    // Random branch
    if (depth < 2 && Math.random() < 0.25) {
      const bx = points[points.length - 1].x;
      const by = points[points.length - 1].y;
      const bLen = 30 + Math.random() * 80;
      const bAngle = (Math.random() - 0.5) * Math.PI * 0.5 + Math.atan2(dy, dx);
      const branch = generateBolt(bx, by, bx + Math.cos(bAngle) * bLen, by + Math.sin(bAngle) * bLen, depth + 1);
      branches.push(...branch.branches);
      branches.push({ points: branch.points });
    }
  }
  points.push({ x: x2, y: y2 });

  return { points, branches };
}

export default function ElectricStorm() {
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

    const bolts: LightningBolt[] = [];
    const colors = [
      '14, 165, 233',    // cyan
      '0, 255, 136',     // neon green
      '139, 92, 246',    // violet
      '56, 189, 248',    // sky
    ];

    let frameId: number;
    let lastTime = 0;
    let nextBoltTime = 0;

    const frameInterval = 1000 / 30;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      // Fade background
      ctx.fillStyle = 'rgba(5, 5, 15, 0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Spawn new bolts periodically
      if (time > nextBoltTime) {
        const startX = Math.random() * canvas.width;
        const startY = Math.random() * canvas.height * 0.3;
        const endX = startX + (Math.random() - 0.5) * 400;
        const endY = canvas.height * 0.5 + Math.random() * canvas.height * 0.4;
        const bolt = generateBolt(startX, startY, endX, endY, 0);
        const color = colors[Math.floor(Math.random() * colors.length)];

        bolts.push({
          points: bolt.points,
          branches: bolt.branches,
          life: 1,
          maxLife: 0.5 + Math.random() * 0.5,
          color,
          width: 1 + Math.random() * 2,
        });

        nextBoltTime = time + 800 + Math.random() * 2000;
      }

      // Draw and age bolts
      ctx.globalCompositeOperation = 'screen';

      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i];
        bolt.life -= 0.016;
        if (bolt.life <= 0) {
          bolts.splice(i, 1);
          continue;
        }

        const alpha = bolt.life / bolt.maxLife;

        // Glow layer
        ctx.shadowColor = `rgba(${bolt.color}, ${alpha * 0.5})`;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(${bolt.color}, ${alpha * 0.3})`;
        ctx.lineWidth = bolt.width * 4;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let j = 1; j < bolt.points.length; j++) {
          ctx.lineTo(bolt.points[j].x, bolt.points[j].y);
        }
        ctx.stroke();

        // Core layer
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(${bolt.color}, ${alpha * 0.9})`;
        ctx.lineWidth = bolt.width;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let j = 1; j < bolt.points.length; j++) {
          ctx.lineTo(bolt.points[j].x, bolt.points[j].y);
        }
        ctx.stroke();

        // Bright core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.lineWidth = bolt.width * 0.3;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let j = 1; j < bolt.points.length; j++) {
          ctx.lineTo(bolt.points[j].x, bolt.points[j].y);
        }
        ctx.stroke();

        // Draw branches
        for (const branch of bolt.branches) {
          ctx.shadowColor = `rgba(${bolt.color}, ${alpha * 0.3})`;
          ctx.shadowBlur = 6;
          ctx.strokeStyle = `rgba(${bolt.color}, ${alpha * 0.5})`;
          ctx.lineWidth = bolt.width * 0.5;
          ctx.beginPath();
          ctx.moveTo(branch.points[0].x, branch.points[0].y);
          for (let j = 1; j < branch.points.length; j++) {
            ctx.lineTo(branch.points[j].x, branch.points[j].y);
          }
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
      }

      ctx.globalCompositeOperation = 'source-over';

      // Ambient particles
      for (let i = 0; i < 2; i++) {
        const px = Math.random() * canvas.width;
        const py = Math.random() * canvas.height;
        ctx.fillStyle = `rgba(14, 165, 233, ${0.1 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.5 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
      }
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
        opacity: 0.7,
      }}
    />
  );
}
