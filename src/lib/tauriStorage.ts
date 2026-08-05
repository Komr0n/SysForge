import { StateStorage } from 'zustand/middleware';
import { Store } from '@tauri-apps/plugin-store';

/**
 * Custom StateStorage adapter for Zustand persist.
 *
 * In Tauri desktop mode:  uses @tauri-apps/plugin-store → $APPDATA/sysforge/settings.json
 * In web / dev mode:      Store calls will throw (Tauri IPC not present) and the
 *                         catch block transparently falls back to localStorage.
 *
 * Writes are debounced (300 ms) to avoid blocking the UI on every state change.
 * NOTE: API keys are excluded from persistence via settingsStore's `partialize` option.
 */

let _store: Store | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const _pending = new Map<string, string>();

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load('settings.json');
  }
  return _store;
}

async function flushPending(): Promise<void> {
  if (_pending.size === 0) return;

  const batch = new Map(_pending);
  _pending.clear();

  try {
    const store = await getStore();
    for (const [name, value] of batch) {
      await store.set(name, value);
    }
    await store.save();
  } catch {
    for (const [name, value] of batch) {
      localStorage.setItem(name, value);
    }
  }
}

function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    void flushPending();
  }, 300);
}

export const tauriStorageAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const pending = _pending.get(name);
    if (pending !== undefined) return pending;

    try {
      const store = await getStore();
      const val = await store.get<string>(name);
      return val ?? null;
    } catch {
      return localStorage.getItem(name);
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    _pending.set(name, value);
    scheduleSave();
  },

  removeItem: async (name: string): Promise<void> => {
    _pending.delete(name);
    try {
      const store = await getStore();
      await store.delete(name);
      await store.save();
    } catch {
      localStorage.removeItem(name);
    }
  },
};
