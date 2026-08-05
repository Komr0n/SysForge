/**
 * Browser stub for @tauri-apps/plugin-store
 * Used during `npm run dev` in web-only mode when the real Tauri plugin is not available.
 * All operations silently fall back to localStorage.
 */

class StubStore {
  private prefix: string;

  constructor(filename: string) {
    this.prefix = `__stub_store__${filename}__`;
  }

  async get(key: string): Promise<unknown> {
    const raw = localStorage.getItem(this.prefix + key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }

  async save(): Promise<void> {
    // no-op in stub — localStorage writes are synchronous
  }
}

export const Store = {
  load: async (filename: string) => new StubStore(filename),
};
