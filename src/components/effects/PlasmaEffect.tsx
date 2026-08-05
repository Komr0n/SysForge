import { useEffect, useRef } from 'react';

/**
 * PlasmaEffect — classic demoscene-style plasma using layered sine waves.
 * Smooth, flowing color fields that morph continuously.
 */

export default function PlasmaEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Lower resolution for performance, then scaled up
    const SCALE = 4;
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth / SCALE);
      canvas.height = Math.floor(window.innerHeight / SCALE);
    };
    resize();
    window.addEventListener('resize', resize);

    const imgData = ctx.createImageData(canvas.width, canvas.height);

    let frameId: number;
    let lastTime = 0;
    const frameInterval = 1000 / 24;

    const draw = (time: number) => {
      frameId = requestAnimationFrame(draw);

      const delta = time - lastTime;
      if (delta < frameInterval) return;
      lastTime = time - (delta % frameInterval);

      const w = canvas.width;
      const h = canvas.height;
      const t = time * 0.0006;
      const data = imgData.data;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Layered sine waves — the plasma formula
          const v1 = Math.sin(x * 0.04 + t);
          const v2 = Math.sin((x * 0.03 + y * 0.04 + t * 1.3) * 1.0);
          const v3 = Math.sin(Math.sqrt((x - w / 2) * (x - w / 2) + (y - h / 2) * (y - h / 2)) * 0.03 - t * 2);
          const v4 = Math.sin((x * 0.06 - y * 0.04 + t * 0.7));
          const v = (v1 + v2 + v3 + v4) / 4; // -1..1

          // Map to neon cyber palette (cyan -> green -> blue -> violet)
          const n = (v + 1) / 2; // 0..1
          let r, g, b;
          if (n < 0.25) {
            // deep blue -> cyan
            const k = n / 0.25;
            r = 8 + k * 6;
            g = 30 + k * 130;
            b = 80 + k * 175;
          } else if (n < 0.5) {
            // cyan -> green
            const k = (n - 0.25) / 0.25;
            r = 14 + k * 0;
            g = 160 + k * 95;
            b = 255 - k * 200;
          } else if (n < 0.75) {
            // green -> teal/dark
            const k = (n - 0.5) / 0.25;
            r = 14 + k * 30;
            g = 255 - k * 150;
            b = 55 + k * 70;
          } else {
            // dark -> violet accent
            const k = (n - 0.75) / 0.25;
            r = 44 + k * 100;
            g = 105 - k * 50;
            b = 125 + k * 120;
          }

          const idx = (y * w + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 90; // low alpha so it blends with background
        }
      }

      ctx.putImageData(imgData, 0, 0);
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
        opacity: 0.55,
        imageRendering: 'auto',
        filter: 'blur(3px)',
      }}
    />
  );
}
