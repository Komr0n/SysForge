import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { createThrottledLoop } from '../../hooks/useCanvasLoop';

const COLUMN_WIDTH = 18;
const FPS = 15;

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>{}[]=/\\|+-*';

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

// Color palette presets. [head, bright, mid, dim, fade]
// head = leading character (usually white-ish), bright = near head,
// mid = middle of trail, dim = fading, fade = deep tail.
type Palette = {
  name: string;
  head: [number, number, number];
  bright: [number, number, number];
  mid: [number, number, number];
  dim: [number, number, number];
};

const PALETTES: Record<string, Palette> = {
  green: {
    name: 'Classic Green',
    head: [200, 255, 220],
    bright: [0, 255, 136],
    mid: [0, 200, 100],
    dim: [0, 100, 50],
  },
  red: {
    name: 'Crimson',
    head: [255, 220, 220],
    bright: [255, 40, 60],
    mid: [200, 20, 40],
    dim: [100, 10, 20],
  },
  amber: {
    name: 'Amber',
    head: [255, 245, 210],
    bright: [255, 191, 0],
    mid: [204, 140, 0],
    dim: [102, 70, 0],
  },
  gray: {
    name: 'Monochrome',
    head: [255, 255, 255],
    bright: [200, 200, 200],
    mid: [130, 130, 130],
    dim: [60, 60, 60],
  },
  cyan: {
    name: 'Ice',
    head: [220, 250, 255],
    bright: [56, 189, 248],
    mid: [14, 116, 144],
    dim: [8, 50, 64],
  },
  violet: {
    name: 'Neon Violet',
    head: [240, 220, 255],
    bright: [168, 85, 247],
    mid: [126, 34, 206],
    dim: [55, 16, 90],
  },
  darkgreen: {
    name: 'Dark Matrix',
    head: [150, 200, 170],
    bright: [0, 120, 70],
    mid: [0, 80, 45],
    dim: [0, 40, 22],
  },
  white: {
    name: 'Ghost',
    head: [255, 255, 255],
    bright: [220, 220, 220],
    mid: [160, 160, 160],
    dim: [80, 80, 80],
  },
};

export const MATRIX_COLOR_OPTIONS = Object.keys(PALETTES).map((key) => ({
  value: key,
  label: PALETTES[key].name,
}));

export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const matrixColor = useSettingsStore((s) => s.matrixColor);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = PALETTES[matrixColor] ?? PALETTES.green;
    const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const columns: Column[] = [];
    const numCols = Math.ceil(canvas.width / COLUMN_WIDTH);

    const makeCol = (i: number): Column => {
      const length = 10 + Math.floor(Math.random() * 18);
      const chars: string[] = [];
      for (let j = 0; j < length; j++) {
        chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
      }
      return {
        x: i * COLUMN_WIDTH,
        y: -length * COLUMN_WIDTH - Math.random() * canvas.height,
        speed: 1.5 + Math.random() * 3,
        chars,
        length,
      };
    };

    for (let i = 0; i < numCols; i++) columns.push(makeCol(i));

    const draw = (_time: number) => {
      // Solid dark wash for clean trails (no distortion from over-blending)
      ctx.fillStyle = 'rgba(2, 4, 8, 0.13)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = '15px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';

      for (const col of columns) {
        col.y += col.speed;

        if (col.y - col.length * COLUMN_WIDTH > canvas.height) {
          const fresh = makeCol(Math.floor(col.x / COLUMN_WIDTH));
          col.y = -col.length * COLUMN_WIDTH * Math.random();
          col.speed = fresh.speed;
          col.chars = fresh.chars;
          col.length = fresh.length;
        }

        for (let j = 0; j < col.length; j++) {
          const y = col.y - j * COLUMN_WIDTH;
          if (y < -COLUMN_WIDTH || y > canvas.height + COLUMN_WIDTH) continue;

          if (Math.random() < 0.02) {
            col.chars[j] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }

          const ratio = 1 - j / col.length;

          if (j === 0) {
            ctx.shadowColor = rgba(palette.bright, 0.8);
            ctx.shadowBlur = 10;
            ctx.fillStyle = rgba(palette.head, 0.98);
          } else if (j < 3) {
            ctx.shadowColor = rgba(palette.bright, 0.4);
            ctx.shadowBlur = 6;
            ctx.fillStyle = rgba(palette.bright, 0.9 * ratio);
          } else if (j < col.length * 0.4) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = rgba(palette.mid, 0.65 * ratio);
          } else if (j < col.length * 0.75) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = rgba(palette.mid, 0.3 * ratio);
          } else {
            ctx.shadowBlur = 0;
            ctx.fillStyle = rgba(palette.dim, 0.18 * ratio);
          }

          ctx.fillText(col.chars[j], col.x, y);
        }
      }

      ctx.shadowBlur = 0;
    };

    const stopLoop = createThrottledLoop(draw, { fpsCap: Math.min(fpsCap, FPS) });

    return () => {
      stopLoop();
      window.removeEventListener('resize', resize);
    };
  }, [matrixColor, fpsCap]);

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
