import { useEffect, useRef } from 'react';

/**
 * AuroraEffect — flowing aurora borealis waves across the top of the screen.
 * Uses layered sine waves with color gradients that drift slowly.
 */

export default function AuroraEffect() {
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

    // Aurora color bands
    const bands = [
      { color1: '0, 255, 136', color2: '0, 200, 100', yBase: 0.2, amp: 60, freq: 0.008, speed: 0.0005, opacity: 0.18 },
      { color1: '14, 165, 233', color2: '59, 130, 246', yBase: 0.25, amp: 80, freq: 0.006, speed: 0.0007, opacity: 0.15 },
      { color1: '139, 92, 246', color2: '168, 85, 247', yBase: 0.15, amp: 50, freq: 0.01, speed: 0.0004, opacity: 0.12 },
      { color1: '236, 72, 153', color2: '244, 114, 182', yBase: 0.3, amp: 70, freq: 0.007, speed: 0.0006, opacity: 0.1 },
      { color1: '34, 197, 94', color2: '132, 204, 22', yBase: 0.22, amp: 90, freq: 0.005, speed: 0.0008, opacity: 0.13 },
    ];

    // Background stars
    const stars: { x: number; y: number; size: number; twinkle: number; twinkleSpeed: number }[] = [];
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 0.3 + Math.random() * 1.3,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.002 + Math.random() * 0.005,
      });
    }

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 30;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      // Dark gradient background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, 'rgba(2, 4, 12, 1)');
      bgGrad.addColorStop(0.6, 'rgba(5, 8, 18, 1)');
      bgGrad.addColorStop(1, 'rgba(2, 4, 8, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw stars first
      for (const star of stars) {
        star.twinkle += star.twinkleSpeed;
        const brightness = 0.3 + 0.5 * Math.abs(Math.sin(star.twinkle));
        ctx.fillStyle = `rgba(226, 232, 240, ${brightness * 0.6})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw aurora bands
      ctx.globalCompositeOperation = 'screen';

      for (const band of bands) {
        const yCenter = canvas.height * band.yBase;

        // Build wave path
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);

        for (let x = 0; x <= canvas.width; x += 4) {
          const wave1 = Math.sin(x * band.freq + time * band.speed) * band.amp;
          const wave2 = Math.sin(x * band.freq * 2.3 + time * band.speed * 1.7) * band.amp * 0.4;
          const wave3 = Math.sin(x * band.freq * 0.5 + time * band.speed * 0.6) * band.amp * 0.6;
          const y = yCenter + wave1 + wave2 + wave3;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();

        // Vertical gradient for the band
        const grad = ctx.createLinearGradient(0, yCenter - band.amp, 0, canvas.height);
        grad.addColorStop(0, `rgba(${band.color1}, 0)`);
        grad.addColorStop(0.3, `rgba(${band.color1}, ${band.opacity})`);
        grad.addColorStop(0.6, `rgba(${band.color2}, ${band.opacity * 0.5})`);
        grad.addColorStop(1, `rgba(${band.color2}, 0)`);

        ctx.fillStyle = grad;
        ctx.fill();
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
        opacity: 0.85,
      }}
    />
  );
}
