import { StateStorage } from 'zustand/middleware';
import { Store } from '@tauri-apps/plugin-store';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Custom StateStorage adapter for Zustand persist.
 *
 * In Tauri desktop mode:  uses @tauri-apps/plugin-store → $APPDATA/sysforge/settings.json
 * In web / dev mode:      Store calls will throw (Tauri IPC not present) and the
 *                         catch block transparently falls back to localStorage.
 *
 * Writes are debounced (300 ms) to avoid blocking the UI on every state change.
 *
 * Part A: API keys are encrypted with AES-256-GCM before being written to disk,
 * and decrypted transparently on read. Everything in-memory stays as plaintext.
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

// ── Part A: Encryption helpers ──────────────────────────────────────────────

const ENC_PREFIX = 'enc:aes256:';

async function encryptField(value: string): Promise<string> {
  if (!isTauri || !value || typeof value !== 'string' || value.startsWith(ENC_PREFIX)) return value;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const encrypted = await invoke<string>('encrypt_secret', { plaintext: value });
    return encrypted ? `${ENC_PREFIX}${encrypted}` : value;
  } catch {
    return value; // fallback: store plaintext if encryption unavailable
  }
}

async function decryptField(value: string): Promise<string> {
  if (!isTauri || !value || typeof value !== 'string') return value;
  if (!value.startsWith(ENC_PREFIX)) {
    // Unencrypted legacy key — return as is!
    return value;
  }
  const cipherB64 = value.slice(ENC_PREFIX.length);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const decrypted = await invoke<string>('decrypt_secret', {
      ciphertextB64: cipherB64,
      ciphertext_b64: cipherB64,
      ciphertext: cipherB64,
    });
    return decrypted || value;
  } catch {
    return value; // fallback: return as-is, never wipe key
  }
}

async function encryptApiKeys(parsed: any): Promise<any> {
  if (!parsed?.state) return parsed;
  // Encrypt top-level apiKey (legacy field)
  if (parsed.state.jarvis?.cloud?.apiKey) {
    parsed.state.jarvis.cloud.apiKey = await encryptField(parsed.state.jarvis.cloud.apiKey);
  }
  // Encrypt per-provider keys in cloudProviders array
  if (Array.isArray(parsed.state.jarvis?.cloudProviders)) {
    for (const p of parsed.state.jarvis.cloudProviders) {
      if (p.apiKey) {
        p.apiKey = await encryptField(p.apiKey);
      }
    }
  }
  // Encrypt security API keys
  if (parsed.state.apiKeys) {
    for (const k of ['abuseipdb', 'virustotal', 'nvd'] as const) {
      if (parsed.state.apiKeys[k]) {
        parsed.state.apiKeys[k] = await encryptField(parsed.state.apiKeys[k]);
      }
    }
  }
  return parsed;
}

async function decryptApiKeys(parsed: any): Promise<any> {
  if (!parsed?.state) return parsed;
  if (parsed.state.jarvis?.cloud?.apiKey) {
    parsed.state.jarvis.cloud.apiKey = await decryptField(parsed.state.jarvis.cloud.apiKey);
  }
  if (Array.isArray(parsed.state.jarvis?.cloudProviders)) {
    for (const p of parsed.state.jarvis.cloudProviders) {
      if (p.apiKey) {
        p.apiKey = await decryptField(p.apiKey);
      }
    }
  }
  if (parsed.state.apiKeys) {
    for (const k of ['abuseipdb', 'virustotal', 'nvd'] as const) {
      if (parsed.state.apiKeys[k]) {
        parsed.state.apiKeys[k] = await decryptField(parsed.state.apiKeys[k]);
      }
    }
  }
  return parsed;
}

// ── Storage flush ────────────────────────────────────────────────────────────

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
    if (pending !== undefined) {
      // Pending in-memory write — decrypt keys on the way out
      try {
        const parsed = JSON.parse(pending);
        const decrypted = await decryptApiKeys(parsed);
        return JSON.stringify(decrypted);
      } catch {
        return pending;
      }
    }

    try {
      const store = await getStore();
      const val = await store.get<string>(name);
      if (!val) return null;
      // val may be raw JSON string or a parsed object from the store
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      const decrypted = await decryptApiKeys(parsed);
      return JSON.stringify(decrypted);
    } catch {
      return localStorage.getItem(name);
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      const encrypted = await encryptApiKeys(parsed);
      _pending.set(name, JSON.stringify(encrypted));
    } catch {
      _pending.set(name, value);
    }
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

