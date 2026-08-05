import { useEffect, useRef } from 'react';

/**
 * setInterval hook that respects a delay; when delay is null the interval is paused.
 * Cleanup happens automatically on unmount or when the delay changes.
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<() => void>(() => {});

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}