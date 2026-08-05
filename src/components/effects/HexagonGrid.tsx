import { useEffect, useRef } from 'react';

/**
 * HexagonGrid — pulsating hexagonal honeycomb grid.
 * Each hex pulses independently with a wave that travels outward from center.
 */

export default function HexagonGrid() {
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

    const HEX_SIZE = 28;
    const HEX_W = HEX_SIZE * Math.sqrt(3);
    const HEX_H = HEX_SIZE * 1.5;

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 30;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      ctx.fillStyle = 'rgba(3, 6, 12, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const cols = Math.ceil(canvas.width / HEX_W) + 2;
      const rows = Math.ceil(canvas.height / HEX_H) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          const x = col * HEX_W + (row % 2 === 0 ? 0 : HEX_W / 2);
          const y = row * HEX_H;

          // Distance from center for wave propagation
          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Wave traveling from center
          const wave = Math.sin(dist * 0.015 - time * 0.002);
          const brightness = (wave + 1) / 2; // 0..1

          // Color shift based on distance
          const colorMix = Math.min(1, dist / 600);

          const r = Math.round(0 + colorMix * 14);
          const g = Math.round(255 - colorMix * 90);
          const b = Math.round(136 + colorMix * 117);
          const alpha = 0.04 + brightness * 0.15;

          // Draw hexagon outline
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.lineWidth = 1 + brightness * 0.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const px = x + Math.cos(angle) * HEX_SIZE * 0.9;
            const py = y + Math.sin(angle) * HEX_SIZE * 0.9;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();

          // Center dot on bright hexes
          if (brightness > 0.7) {
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(brightness - 0.7) * 1.5})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
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
