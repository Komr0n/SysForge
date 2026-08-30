// src/lib/jarvis/tool-executor.ts
// Единая точка выполнения всех инструментов Джарвиса

import { findTool } from './tools-schema';
import { auditLog } from './audit-logger';
import { skillRegistry } from './skill-registry';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
  userConfirmedDestructive?: boolean;
  matchedVia: 'embedding' | 'llm' | 'skill' | 'direct';
  skillName?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  message?: string;
  requiresConfirmation?: boolean;
}

// Callback для обновления windowStore (устанавливается из App.tsx)
let _openAppFn: ((appId: string) => void) | null = null;
let _closeAppFn: ((appId: string) => void) | null = null;
let _setThemeFn: ((theme: string) => void) | null = null;
let _setBackgroundFn: ((bg: string) => void) | null = null;

export function registerUICallbacks(callbacks: {
  openApp: (appId: string) => void;
  closeApp: (appId: string) => void;
  setTheme: (theme: string) => void;
  setBackground: (bg: string) => void;
}) {
  _openAppFn = callbacks.openApp;
  _closeAppFn = callbacks.closeApp;
  _setThemeFn = callbacks.setTheme;
  _setBackgroundFn = callbacks.setBackground;
}

async function dispatchToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (toolName) {
    // ── UI / Minimal ─────────────────────────────────────────────────────────
    case 'open_app': {
      const appId = args.appId as string;
      if (_openAppFn) _openAppFn(appId);
      return { success: true, message: `Открываю ${appId}` };
    }

    case 'close_app': {
      const appId = args.appId as string;
      if (_closeAppFn) _closeAppFn(appId);
      return { success: true, message: `Закрываю ${appId}` };
    }

    case 'set_theme': {
      const theme = args.theme as string;
      if (_setThemeFn) _setThemeFn(theme);
      return { success: true, message: `Тема изменена на ${theme}` };
    }

    case 'set_background': {
      const bg = args.background as string;
      if (_setBackgroundFn) _setBackgroundFn(bg);
      return { success: true, message: `Фон изменён на ${bg}` };
    }

    case 'open_url': {
      let url = args.url as string;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('jarvis_open_url', { url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return { success: true, message: `Открываю ${url}` };
    }

    case 'open_system_app': {
      const program = (args.program as string) || 'calc.exe';
      const displayName = (args.displayName as string) || program;
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('jarvis_open_system_app', { program });
          return { success: true, message: `Запускаю ${displayName}, сэр.` };
        } catch (e) {
          return { success: false, message: `Не удалось запустить ${displayName}: ${(e as Error).message}` };
        }
      }
      return {
        success: true,
        message: `Запуск системного приложения ${displayName} (${program}) активирован (в режиме рабочего стола).`,
      };
    }

    // ── Standard ─────────────────────────────────────────────────────────────
    case 'get_system_status': {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<Record<string, unknown>>('get_system_info');
        const cpu = (info.cpu_usage as number).toFixed(1);
        const ramTotal = info.total_memory_bytes as number;
        const ramUsed = info.used_memory_bytes as number;
        const ramPct = ((ramUsed / ramTotal) * 100).toFixed(1);
        return {
          success: true,
          data: info,
          message: `CPU: ${cpu}%, RAM: ${ramPct}% (${formatBytes(ramUsed)} / ${formatBytes(ramTotal)})`,
        };
      }
      return {
        success: true,
        message: 'Статус системы недоступен в браузерном режиме — запустите Tauri.',
      };
    }

    case 'get_process_list': {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const limit = (args.limit as number) ?? 10;
        const processes = await invoke<unknown[]>('get_processes');
        const top = (processes as Array<{ name: string; cpu_usage: number; pid: number }>)
          .slice(0, limit)
          .map((p) => `${p.name} (PID ${p.pid}, CPU ${p.cpu_usage.toFixed(1)}%)`)
          .join('\n');
        return { success: true, data: processes, message: `Топ процессов:\n${top}` };
      }
      return { success: true, message: 'Список процессов доступен только в Tauri-режиме.' };
    }

    case 'ping_host': {
      const host = args.host as string;
      const count = (args.count as number) ?? 4;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('ping_host', { host, count });
        return { success: true, data: result, message: result };
      }
      return { success: true, message: `Ping ${host} — доступен только в Tauri-режиме.` };
    }

    case 'traceroute_host': {
      const host = args.host as string;
      const maxHops = (args.maxHops as number) ?? 30;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('traceroute_host', { host, maxHops });
        return { success: true, data: result, message: result };
      }
      return { success: true, message: `Traceroute ${host} — доступен только в Tauri-режиме.` };
    }

    // ── Full (деструктивные) ─────────────────────────────────────────────────
    case 'kill_process': {
      const pid = args.pid as number;
      const processName = args.processName as string | undefined;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        if (pid) {
          const result = await invoke<string>('kill_process', { pid });
          return { success: true, message: result };
        }
        return { success: false, message: `Процесс ${processName} не найден (нужен PID).` };
      }
      return { success: false, message: 'kill_process доступен только в Tauri-режиме.' };
    }

    case 'delete_file': {
      const path = args.path as string;
      if (isTauri) {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path);
        return { success: true, message: `Файл удалён: ${path}` };
      }
      return { success: false, message: 'delete_file доступен только в Tauri-режиме.' };
    }

    case 'lock_screen': {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('jarvis_lock_screen');
        return { success: true, message: 'Экран заблокирован.' };
      }
      return { success: false, message: 'lock_screen доступен только в Tauri-режиме.' };
    }

    // ── Skills ───────────────────────────────────────────────────────────────
    case 'load_skill': {
      const skillId = args.skillId as string;
      const skill = await skillRegistry.loadSkill(skillId);
      if (!skill) return { success: false, message: `Навык "${skillId}" не найден.` };
      // Выполнение шагов навыка
      const results: string[] = [];
      for (const step of skill.steps) {
        const slotArgs = { ...step.args };
        // Подставляем слоты
        for (const [k, v] of Object.entries(slotArgs)) {
          if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
            const slotKey = v.slice(1, -1);
            slotArgs[k] = (args.slots as Record<string, string>)?.[slotKey]
              ?? skill.slots[slotKey]?.default
              ?? v;
          }
        }
        const stepResult = await dispatchToolCall(step.tool, slotArgs);
        if (stepResult.message) results.push(stepResult.message);
      }
      // Обновить счётчик выполнения
      skill.executionCount = (skill.executionCount || 0) + 1;
      skill.lastExecutedAt = new Date().toISOString();
      await skillRegistry.saveSkill(skill).catch(() => {});
      return { success: true, message: results.join('\n') };
    }

    case 'list_available_skills': {
      const [user, builtin] = await Promise.all([
        skillRegistry.listSkills(),
        Promise.resolve(skillRegistry.getBuiltinSkills()),
      ]);
      const all = [...builtin, ...user];
      const names = all.map((s) => `• ${s.displayName} (${s.id})`).join('\n');
      return { success: true, data: all, message: `Доступные навыки:\n${names}` };
    }

    default:
      return { success: false, message: `Неизвестный инструмент: ${toolName}` };
  }
}

// ─── Публичный API ────────────────────────────────────────────────────────────

export async function executeTool(request: ToolRequest): Promise<ToolResult> {
  const toolDef = findTool(request.toolName);

  if (toolDef?.safetyLevel === 'requires_confirmation' && !request.userConfirmedDestructive) {
    return {
      success: false,
      requiresConfirmation: true,
      message: `Требуется подтверждение: ${toolDef.description}`,
    };
  }

  // Аудит — старт
  if (toolDef?.requiresAudit) {
    auditLog.logCommand({
      timestamp: new Date().toISOString(),
      toolName: request.toolName,
      args: request.args,
      status: 'started',
      matchedVia: request.matchedVia,
      skillName: request.skillName,
    });
  }

  try {
    const result = await dispatchToolCall(request.toolName, request.args);

    if (toolDef?.requiresAudit) {
      auditLog.logCommand({
        timestamp: new Date().toISOString(),
        toolName: request.toolName,
        args: request.args,
        status: 'completed',
        matchedVia: request.matchedVia,
        skillName: request.skillName,
        result: result.message?.slice(0, 500),
      });
    }

    return result;
  } catch (error) {
    const errMsg = (error as Error).message;

    if (toolDef?.requiresAudit) {
      auditLog.logCommand({
        timestamp: new Date().toISOString(),
        toolName: request.toolName,
        args: request.args,
        status: 'error',
        matchedVia: request.matchedVia,
        skillName: request.skillName,
        error: errMsg,
      });
    }

    return { success: false, message: `Ошибка: ${errMsg}` };
  }
}

// Утилита форматирования байт
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
