import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
  color: string;
}

const NUM_STARS = 350;
const MAX_DEPTH = 1000;

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

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

    // Color palette for stars
    const starColors = [
      '14, 165, 233',   // cyan blue
      '0, 255, 136',    // neon green
      '226, 232, 240',  // white
      '139, 92, 246',   // violet
      '56, 189, 248',   // sky blue
    ];

    const cx = () => canvas.width / 2;
    const cy = () => canvas.height / 2;

    const stars: Star[] = [];
    for (let i = 0; i < NUM_STARS; i++) {
      stars.push({
        x: (Math.random() - 0.5) * canvas.width,
        y: (Math.random() - 0.5) * canvas.height,
        z: Math.random() * MAX_DEPTH,
        size: 0.3 + Math.random() * 2,
        speed: 0.8 + Math.random() * 2.5,
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    // Track mouse for parallax
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX - canvas.width / 2) * 0.15;
      mouseRef.current.y = (e.clientY - canvas.height / 2) * 0.15;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 30;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      ctx.fillStyle = 'rgba(5, 10, 20, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = cx() + mouseRef.current.x;
      const centerY = cy() + mouseRef.current.y;

      for (const star of stars) {
        star.z -= star.speed;
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * canvas.width;
          star.y = (Math.random() - 0.5) * canvas.height;
          star.z = MAX_DEPTH;
          star.color = starColors[Math.floor(Math.random() * starColors.length)];
        }

        const k = 128 / star.z;
        const px = star.x * k + centerX;
        const py = star.y * k + centerY;

        if (px < -10 || px >= canvas.width + 10 || py < -10 || py >= canvas.height + 10) continue;

        const size = star.size * (1 - star.z / MAX_DEPTH);
        const opacity = Math.pow(1 - star.z / MAX_DEPTH, 1.5);

        // Tail — longer and more visible
        const prevK = 128 / (star.z + star.speed * 6);
        const prevPx = star.x * prevK + centerX;
        const prevPy = star.y * prevK + centerY;

        const grad = ctx.createLinearGradient(prevPx, prevPy, px, py);
        grad.addColorStop(0, `rgba(${star.color}, 0)`);
        grad.addColorStop(1, `rgba(${star.color}, ${opacity * 0.5})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = size * 0.8;
        ctx.beginPath();
        ctx.moveTo(prevPx, prevPy);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Head glow
        if (opacity > 0.4) {
          ctx.shadowColor = `rgba(${star.color}, ${opacity * 0.6})`;
          ctx.shadowBlur = 4;
        }

        // Head
        ctx.fillStyle = `rgba(${star.color}, ${opacity})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
      }

      // Occasional bright flash streak
      if (Math.random() < 0.003) {
        const fx = Math.random() * canvas.width;
        const fy = Math.random() * canvas.height;
        const fl = 30 + Math.random() * 60;
        const angle = Math.random() * Math.PI * 2;

        const flashGrad = ctx.createLinearGradient(
          fx, fy,
          fx + Math.cos(angle) * fl, fy + Math.sin(angle) * fl
        );
        flashGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        flashGrad.addColorStop(0.3, 'rgba(14, 165, 233, 0.4)');
        flashGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');

        ctx.strokeStyle = flashGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(angle) * fl, fy + Math.sin(angle) * fl);
        ctx.stroke();
      }
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
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
