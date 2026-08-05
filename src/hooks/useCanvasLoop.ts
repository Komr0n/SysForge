import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export interface ThrottledLoopOptions {
  fpsCap: number;
  pauseWhenHidden?: boolean;
}

/**
 * Imperative throttled RAF loop for canvas/WebGL effects inside useEffect.
 * Returns a stop function. Pauses when document is hidden by default.
 */
export function createThrottledLoop(
  draw: (time: number) => void,
  { fpsCap, pauseWhenHidden = true }: ThrottledLoopOptions
): () => void {
  let frameId = 0;
  let lastTime = 0;
  let running = true;
  const frameInterval = 1000 / Math.max(1, fpsCap);

  const loop = (time: number) => {
    if (!running) return;
    if (pauseWhenHidden && document.hidden) return;

    frameId = requestAnimationFrame(loop);

    const delta = time - lastTime;
    if (delta < frameInterval) return;
    lastTime = time - (delta % frameInterval);

    draw(time);
  };

  const start = () => {
    if (!running || (pauseWhenHidden && document.hidden)) return;
    lastTime = 0;
    frameId = requestAnimationFrame(loop);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(frameId);
  };

  const onVisibility = () => {
    cancelAnimationFrame(frameId);
    if (!document.hidden) start();
  };

  start();
  if (pauseWhenHidden) {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    stop();
    if (pauseWhenHidden) {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

/**
 * React hook wrapper — throttled RAF for functional components.
 * Respects fpsCap, reduceMotion, and pauses when the tab is hidden.
 */
export function useCanvasLoop(draw: (time: number) => void, deps: unknown[] = []) {
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);
  const fpsCap = useSettingsStore((s) => s.performance.fpsCap);
  const drawRef = useRef(draw);

  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    if (reduceMotion) return;

    return createThrottledLoop((time) => drawRef.current(time), { fpsCap });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, fpsCap, ...deps]);
}
