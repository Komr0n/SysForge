// src/lib/jarvis/audit-logger.ts
// Аудит-логирование всех команд с побочным эффектом

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export interface AuditEntry {
  timestamp: string;
  toolName?: string;
  action?: string;
  args?: unknown;
  params?: unknown;
  status: 'started' | 'completed' | 'error' | 'attempted' | 'success' | 'denied';
  matchedVia?: 'embedding' | 'llm' | 'skill' | 'direct' | 'keyword';
  triggeredBy?: 'embedding' | 'llm' | 'skill' | 'direct' | 'keyword';
  sandboxLevel?: string;
  reason?: string;
  result?: string;
  error?: string;
  skillName?: string;
}

const AUDIT_KEY = 'jarvis-audit-log';
const MAX_MEMORY_ENTRIES = 500;

/** Буфер в памяти для быстрого доступа в UI */
let memoryLog: AuditEntry[] = [];

async function appendToFile(entry: AuditEntry): Promise<void> {
  if (!isTauri) return;
  try {
    const { appDataDir } = await import('@tauri-apps/api/path');
    const { writeTextFile, readTextFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    const logDir = `${dir}sysforge`;
    const logPath = `${logDir}/jarvis-audit.log`;

    // Создаём директорию если не существует
    const dirExists = await exists(logDir);
    if (!dirExists) await mkdir(logDir, { recursive: true });

    const line = JSON.stringify(entry) + '\n';

    try {
      const existing = await readTextFile(logPath);
      await writeTextFile(logPath, existing + line);
    } catch {
      await writeTextFile(logPath, line);
    }
  } catch (e) {
    console.warn('[AuditLog] Failed to write to file:', e);
  }
}

function appendToLocalStorage(entry: AuditEntry): void {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const entries: AuditEntry[] = raw ? JSON.parse(raw) : [];
    entries.push(entry);
    // Храним последние 200 записей в localStorage
    if (entries.length > 200) entries.splice(0, entries.length - 200);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries));
  } catch {
    // Игнорируем ошибки localStorage
  }
}

export const auditLog = {
  logCommand(entry: AuditEntry): void {
    memoryLog.push(entry);
    if (memoryLog.length > MAX_MEMORY_ENTRIES) {
      memoryLog = memoryLog.slice(-MAX_MEMORY_ENTRIES);
    }

    if (isTauri) {
      appendToFile(entry).catch(() => {});
    } else {
      appendToLocalStorage(entry);
    }
  },

  log(entry: Partial<AuditEntry>): void {
    const fullEntry: AuditEntry = {
      timestamp: entry.timestamp || new Date().toISOString(),
      toolName: entry.toolName || entry.action || 'unknown',
      action: entry.action || entry.toolName || 'unknown',
      args: entry.args || entry.params,
      params: entry.params || entry.args,
      status: entry.status || 'attempted',
      matchedVia: entry.matchedVia || entry.triggeredBy || 'direct',
      triggeredBy: entry.triggeredBy || entry.matchedVia || 'direct',
      sandboxLevel: entry.sandboxLevel || 'standard',
      reason: entry.reason,
      result: entry.result,
      error: entry.error,
      skillName: entry.skillName,
    };
    this.logCommand(fullEntry);
  },

  getMemoryLog(): AuditEntry[] {
    return [...memoryLog];
  },

  async getFullLog(): Promise<AuditEntry[]> {
    if (!isTauri) {
      const raw = localStorage.getItem(AUDIT_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    try {
      const { appDataDir } = await import('@tauri-apps/api/path');
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const dir = await appDataDir();
      const logPath = `${dir}sysforge/jarvis-audit.log`;
      const fileExists = await exists(logPath);
      if (!fileExists) return [];
      const content = await readTextFile(logPath);
      return content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  },

  clear(): void {
    memoryLog = [];
    localStorage.removeItem(AUDIT_KEY);
  },
};
