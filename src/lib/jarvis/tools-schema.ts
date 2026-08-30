// src/lib/jarvis/tools-schema.ts
// Полная схема всех инструментов Джарвиса для LLM function calling и валидации навыков

export type SafetyLevel = 'safe' | 'requires_confirmation';

export interface JarvisTool {
  name: string;
  description: string;
  safetyLevel: SafetyLevel;
  requiresAudit: boolean;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export const JARVIS_TOOLS: JarvisTool[] = [
  // ── Minimal ──────────────────────────────────────────────────────────────
  {
    name: 'open_app',
    description: 'Открыть мини-приложение SysForge по его ID (ping, traceroute, processes и т.д.)',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'ID приложения: ping, traceroute, port-scanner, bandwidth, dns, ssh, wol, hash, ssl, password, ip-intel, subnet, jwt, cve, processes, system-overview, log, file-hash, api-tester, formatter, encoder, regex, snippets, diff' },
      },
      required: ['appId'],
    },
  },
  {
    name: 'close_app',
    description: 'Закрыть открытое мини-приложение SysForge по его ID',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'ID приложения для закрытия' },
      },
      required: ['appId'],
    },
  },
  {
    name: 'set_theme',
    description: 'Изменить тему интерфейса SysForge',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          description: 'Название темы',
          enum: ['terminal-green', 'holo-cyan', 'light', 'dark', 'cyber', 'crimson', 'noir', 'amber', 'graphite', 'emerald', 'ice'],
        },
      },
      required: ['theme'],
    },
  },
  {
    name: 'set_background',
    description: 'Изменить фоновый эффект SysForge',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        background: {
          type: 'string',
          description: 'Тип фона',
          enum: ['grid', 'matrix', 'particles', 'none', 'gradient', 'stars', 'nebula', 'storm', 'circuit', 'hexagon', 'aurora', 'plasma'],
        },
      },
      required: ['background'],
    },
  },
  {
    name: 'open_url',
    description: 'Открыть URL в браузере по умолчанию',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL для открытия (должен начинаться с https://)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_system_app',
    description: 'Запустить системное приложение Windows (калькулятор, блокнот, проводник, cmd, диспетчер задач и т.д.)',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Имя исполняемого файла или команды (например: calc.exe, notepad.exe, explorer.exe, taskmgr.exe, cmd.exe, mspaint.exe)' },
        displayName: { type: 'string', description: 'Понятное название программы (Калькулятор, Блокнот и т.д.)' },
      },
      required: ['program'],
    },
  },

  // ── Standard ─────────────────────────────────────────────────────────────
  {
    name: 'get_system_status',
    description: 'Получить текущее состояние системы: CPU, RAM, диски',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_process_list',
    description: 'Получить список запущенных процессов (топ по CPU)',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Максимальное количество процессов (по умолчанию 20)' },
      },
    },
  },
  {
    name: 'ping_host',
    description: 'Пингануть хост и получить задержку',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'IP-адрес или доменное имя' },
        count: { type: 'number', description: 'Количество пакетов (по умолчанию 4)' },
      },
      required: ['host'],
    },
  },
  {
    name: 'traceroute_host',
    description: 'Трассировка маршрута до хоста',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'IP-адрес или доменное имя' },
        maxHops: { type: 'number', description: 'Максимальное число хопов (по умолчанию 30)' },
      },
      required: ['host'],
    },
  },

  // ── Full (деструктивные — требуют подтверждения) ──────────────────────────
  {
    name: 'kill_process',
    description: 'Принудительно завершить процесс по PID или имени. ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ПОЛЬЗОВАТЕЛЯ.',
    safetyLevel: 'requires_confirmation',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'PID процесса для завершения' },
        processName: { type: 'string', description: 'Имя процесса (альтернатива PID)' },
      },
    },
  },
  {
    name: 'delete_file',
    description: 'Удалить файл по пути. ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ПОЛЬЗОВАТЕЛЯ.',
    safetyLevel: 'requires_confirmation',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь к файлу для удаления' },
      },
      required: ['path'],
    },
  },
  {
    name: 'lock_screen',
    description: 'Заблокировать экран рабочей станции. ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ПОЛЬЗОВАТЕЛЯ.',
    safetyLevel: 'requires_confirmation',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ── Skill operations ──────────────────────────────────────────────────────
  {
    name: 'load_skill',
    description: 'Выполнить сохранённый навык по его ID',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        skillId: { type: 'string', description: 'ID навыка для выполнения' },
        slots: { type: 'object', description: 'Параметры для подстановки в шаги навыка' },
      },
      required: ['skillId'],
    },
  },
  {
    name: 'list_available_skills',
    description: 'Получить список всех доступных сохранённых навыков',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/** Конвертация схемы инструментов в формат OpenAI function calling */
export function toOpenAIToolSchema(tool: JarvisTool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/** Поиск инструмента по имени */
export function findTool(name: string): JarvisTool | undefined {
  return JARVIS_TOOLS.find((t) => t.name === name);
}
