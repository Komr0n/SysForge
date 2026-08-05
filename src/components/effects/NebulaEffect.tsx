import { useEffect, useRef } from 'react';

/**
 * Nebula — animated flowing nebula clouds using canvas.
 * Creates soft, slowly-moving color blobs that blend together.
 */

interface Blob {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  color: [number, number, number];
  opacity: number;
  phase: number;
  phaseSpeed: number;
}

export default function NebulaEffect() {
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

    // Create blobs
    const blobs: Blob[] = [];
    const colors: [number, number, number][] = [
      [14, 165, 233],    // cyan
      [0, 255, 136],     // green
      [139, 92, 246],    // violet
      [6, 182, 212],     // teal
      [236, 72, 153],    // pink
      [59, 130, 246],    // blue
    ];

    for (let i = 0; i < 12; i++) {
      const c = colors[i % colors.length];
      blobs.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 150 + Math.random() * 300,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        color: c,
        opacity: 0.04 + Math.random() * 0.06,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.001 + Math.random() * 0.002,
      });
    }

    // Small particle stars
    const stars: { x: number; y: number; size: number; twinkle: number; twinkleSpeed: number }[] = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.002 + Math.random() * 0.005,
      });
    }

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 24;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      // Dark background with slight fade
      ctx.fillStyle = 'rgba(5, 5, 15, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw nebula blobs
      ctx.globalCompositeOperation = 'screen';

      for (const blob of blobs) {
        blob.x += blob.vx + Math.sin(time * blob.phaseSpeed) * 0.2;
        blob.y += blob.vy + Math.cos(time * blob.phaseSpeed * 0.7) * 0.2;
        blob.phase += blob.phaseSpeed;

        // Wrap around
        if (blob.x < -blob.radius) blob.x = canvas.width + blob.radius;
        if (blob.x > canvas.width + blob.radius) blob.x = -blob.radius;
        if (blob.y < -blob.radius) blob.y = canvas.height + blob.radius;
        if (blob.y > canvas.height + blob.radius) blob.y = -blob.radius;

        // Pulsating radius
        const r = blob.radius + Math.sin(blob.phase) * 30;
        const opacity = blob.opacity + Math.sin(blob.phase * 1.5) * 0.02;

        const grad = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, r);
        grad.addColorStop(0, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${opacity})`);
        grad.addColorStop(0.4, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${opacity * 0.5})`);
        grad.addColorStop(1, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';

      // Draw twinkling stars
      for (const star of stars) {
        star.twinkle += star.twinkleSpeed;
        const brightness = 0.3 + 0.7 * Math.abs(Math.sin(star.twinkle));

        ctx.fillStyle = `rgba(226, 232, 240, ${brightness * 0.6})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * brightness, 0, Math.PI * 2);
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
        opacity: 0.85,
      }}
    />
  );
}
