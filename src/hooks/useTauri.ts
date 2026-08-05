import { useCallback } from 'react';

/**
 * Provides a typed wrapper around Tauri's invoke() with a non-Tauri fallback.
 * In a plain browser context (e.g. `npm run dev` for the web app) it returns undefined
 * so components can degrade gracefully, while in the desktop shell it calls Rust commands.
 */
export function useTauri() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const invoke = useCallback(
    async <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> => {
      if (!isTauri) {
        console.warn(`[SysForge] Tauri command "${cmd}" invoked in browser — returning undefined.`);
        return undefined;
      }
      // Dynamic import keeps the plain web bundle free of @tauri-apps/api
      const { invoke: invokeTauri } = await import('@tauri-apps/api/core');
      return invokeTauri<T>(cmd, args);
    },
    [isTauri]
  );

  const isAvailable = isTauri;
  return { invoke, isAvailable };
}