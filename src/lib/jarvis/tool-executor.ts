// src/lib/jarvis/tool-executor.ts
// Единая точка выполнения всех инструментов Джарвиса с безопасным роутингом и аудитом

import { findTool } from './tools-schema';
import { auditLog } from './audit-logger';
import { skillRegistry } from './skill-registry';

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
  userConfirmedDestructive?: boolean;
  matchedVia: 'embedding' | 'llm' | 'skill' | 'direct' | 'keyword';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
      const rawId = (args.appId as string) || (args.program as string) || 'calculator';
      // Маппинг для толерантности
      let appId = rawId.toLowerCase();
      if (appId.includes('calc')) appId = 'calculator';
      else if (appId.includes('notepad')) appId = 'notepad';
      else if (appId.includes('explorer')) appId = 'explorer';
      else if (appId.includes('taskmgr') || appId.includes('task_manager')) appId = 'task_manager';
      else if (appId.includes('paint') || appId.includes('mspaint')) appId = 'paint';
      else if (appId.includes('powershell')) appId = 'powershell';
      else if (appId.includes('cmd')) appId = 'cmd';

      const displayName = (args.displayName as string) || appId;

      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const res = await invoke<string>('jarvis_open_system_app', { appId });
          return { success: true, message: `${res}, сэр.` };
        } catch (e) {
          return { success: false, message: `Не удалось запустить ${displayName}: ${(e as Error).message}` };
        }
      }
      return {
        success: true,
        message: `Запуск системного приложения ${displayName} (${appId}).`,
      };
    }

    // ── App Discovery & Launch ───────────────────────────────────────────────
    case 'discover_app': {
      const query = (args.query as string) || '';
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const candidates = await invoke<Array<{ display_name: string; exe_path: string }>>('jarvis_find_app', { query });
          if (candidates.length === 0) {
            return { success: true, data: [], message: `Программа "${query}" не найдена в реестре Windows.` };
          }
          const list = candidates.map((c) => `• ${c.display_name} (${c.exe_path})`).join('\n');
          return { success: true, data: candidates, message: `Найдено:\n${list}` };
        } catch (e) {
          return { success: false, message: `Ошибка поиска программы: ${(e as Error).message}` };
        }
      }
      return { success: true, message: `Поиск программ доступен только в десктопном режиме Tauri.` };
    }

    case 'launch_registered_app': {
      const exePath = (args.exePath as string) || '';
      const displayName = (args.displayName as string) || exePath;
      if (isTauri) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const res = await invoke<string>('jarvis_launch_registered_app', { exePath, displayName });
          return { success: true, message: res };
        } catch (e) {
          return { success: false, message: `Не удалось запустить: ${(e as Error).message}` };
        }
      }
      return { success: true, message: `Запускаю ${displayName}.` };
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
        message: 'Статус системы (в браузерном режиме): CPU: ~15%, RAM: ~42%',
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
      return { success: true, message: `Ping ${host} (симуляция): 4 пакета отправлено, задержка 18ms.` };
    }

    case 'traceroute_host': {
      const host = args.host as string;
      const maxHops = (args.maxHops as number) ?? 30;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('traceroute_host', { host, maxHops });
        return { success: true, data: result, message: result };
      }
      return { success: true, message: `Traceroute ${host} доступен в десктопном режиме.` };
    }

    // ── Full (деструктивные) ─────────────────────────────────────────────────
    case 'kill_process': {
      const pid = args.pid as number;
      const target = args.target as string | number;
      const resolvedPid = typeof target === 'number' ? target : pid || parseInt(String(target), 10);

      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        if (resolvedPid && !isNaN(resolvedPid)) {
          const result = await invoke<string>('kill_process', { pid: resolvedPid });
          return { success: true, message: result };
        }
        return { success: false, message: `Некорректный PID процесса.` };
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

    // ── Skills & Proposals ───────────────────────────────────────────────────
    case 'load_skill': {
      const skillId = args.skillId as string;
      const skill = (await skillRegistry.loadSkill(skillId))
        ?? skillRegistry.getBuiltinSkills().find((s) => s.id === skillId)
        ?? null;

      if (!skill) return { success: false, message: `Навык "${skillId}" не найден.` };

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

        // Выполняем каждый шаг через executeTool (с аудитом и проверкой подтверждений)
        const stepResult = await executeTool({
          toolName: step.tool,
          args: slotArgs,
          userConfirmedDestructive: step.requires_confirmation
            ? Boolean(args.userConfirmedDestructive)
            : true,
          matchedVia: 'skill',
          skillName: skill.displayName,
        });

        if (stepResult.requiresConfirmation) {
          return {
            success: false,
            requiresConfirmation: true,
            message: `Навык "${skill.displayName}" требует подтверждения для шага "${step.tool}".`,
          };
        }

        if (stepResult.message) results.push(stepResult.message);
      }

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

    case 'propose_new_skill': {
      return {
        success: true,
        data: args,
        message: `Предложено создать навык: ${args.requestedAction}`,
      };
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
    auditLog.log({
      action: request.toolName,
      params: request.args,
      status: 'attempted',
      sandboxLevel: toolDef.safetyLevel === 'requires_confirmation' ? 'full' : 'standard',
      triggeredBy: request.matchedVia,
      skillName: request.skillName,
    });
  }

  try {
    const result = await dispatchToolCall(request.toolName, request.args);

    if (toolDef?.requiresAudit && result.success) {
      auditLog.log({
        action: request.toolName,
        params: request.args,
        status: 'success',
        sandboxLevel: toolDef.safetyLevel === 'requires_confirmation' ? 'full' : 'standard',
        triggeredBy: request.matchedVia,
        skillName: request.skillName,
      });
    }

    return result;
  } catch (err) {
    const errorMsg = (err as Error).message;
    if (toolDef?.requiresAudit) {
      auditLog.log({
        action: request.toolName,
        params: request.args,
        status: 'denied',
        reason: errorMsg,
        sandboxLevel: toolDef.safetyLevel === 'requires_confirmation' ? 'full' : 'standard',
        triggeredBy: request.matchedVia,
        skillName: request.skillName,
      });
    }
    return { success: false, message: `Ошибка выполнения ${request.toolName}: ${errorMsg}` };
  }
}
