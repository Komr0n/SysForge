// src/lib/jarvis/tools-schema.ts
// Схемы инструментов Джарвиса в формате OpenAI function calling

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string; properties?: Record<string, unknown> };
  properties?: Record<string, unknown>;
}

export interface JarvisTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  safetyLevel: 'safe' | 'requires_confirmation';
  requiresAudit: boolean;
}

export const JARVIS_TOOLS: JarvisTool[] = [
  // ── Minimal (UI SysForge) ──────────────────────────────────────────────────
  {
    name: 'open_app',
    description: 'Открыть мини-программу SysForge в окне',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        appId: {
          type: 'string',
          description: 'ID приложения',
          enum: [
            'ping', 'traceroute', 'port-scanner', 'bandwidth', 'dns', 'ssh', 'wol',
            'hash', 'ssl', 'password', 'ip-intel', 'subnet', 'jwt', 'cve',
            'processes', 'system-overview', 'logs', 'file-hash',
            'api-tester', 'formatter', 'encoder', 'regex', 'snippets', 'diff',
            'app-scheduler', 'net-processes',
            'terminal', 'startup-manager', 'disk-analyzer', 'duplicate-finder', 'file-explorer',
          ],
        },
      },
      required: ['appId'],
    },
  },
  {
    name: 'close_app',
    description: 'Закрыть открытое окно мини-программы SysForge',
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
    name: 'close_os_app',
    description: 'Закрыть запущенное приложение Windows по имени процесса (chrome, telegram, calculator и т.д.) — в отличие от close_app, это закрывает саму программу в ОС, а не окно мини-программы SysForge',
    safetyLevel: 'requires_confirmation',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        appName: { type: 'string', description: 'Имя или часть имени процесса для закрытия' },
      },
      required: ['appName'],
    },
  },
  {
    name: 'schedule_close_app',
    description: 'Запланировать закрытие приложения через заданное время',
    safetyLevel: 'safe',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        appName: { type: 'string', description: 'Имя или часть имени процесса для закрытия' },
        delayMinutes: { type: 'number', description: 'Задержка в минутах перед закрытием' },
      },
      required: ['appName', 'delayMinutes'],
    },
  },
  {
    name: 'set_theme',
    description: 'Изменить цветовую тему интерфейса SysForge',
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
        url: { type: 'string', description: 'URL для открытия (должен начинаться с https:// или http://)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_system_app',
    description: 'Запустить системное приложение Windows из доверенного списка (калькулятор, блокнот, проводник, cmd, диспетчер задач, paint, powershell)',
    safetyLevel: 'safe',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        appId: {
          type: 'string',
          description: 'Идентификатор системного приложения',
          enum: ['calculator', 'notepad', 'explorer', 'task_manager', 'paint', 'cmd', 'powershell'],
        },
        displayName: { type: 'string', description: 'Понятное название программы (Калькулятор, Блокнот и т.д.)' },
      },
      required: ['appId'],
    },
  },

  // ── Discovery & App Registry ───────────────────────────────────────────────
  {
    name: 'discover_app',
    description: 'Найти установленную в Windows программу по имени (например: photoshop, blender, telegram, vlc, discord, steam)',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Имя программы для поиска' },
      },
      required: ['query'],
    },
  },
  {
    name: 'launch_registered_app',
    description: 'Запустить пользовательское зарегистрированное приложение по проверенному пути',
    safetyLevel: 'safe',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        exePath: { type: 'string', description: 'Полный путь к .exe файлу' },
        displayName: { type: 'string', description: 'Название программы' },
      },
      required: ['exePath', 'displayName'],
    },
  },

  // ── Standard (System Read-only) ───────────────────────────────────────────
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
        maxHops: { type: 'number', description: 'Максимальное число прыжков (по умолчанию 15)' },
      },
      required: ['host'],
    },
  },

  // ── Full (Destructive / Confirmation required) ────────────────────────────
  {
    name: 'kill_process',
    description: 'Завершить процесс по имени или PID (требует подтверждения)',
    safetyLevel: 'requires_confirmation',
    requiresAudit: true,
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Имя процесса или PID' },
        isPid: { type: 'boolean', description: 'true если target это PID' },
      },
      required: ['target'],
    },
  },
  {
    name: 'lock_screen',
    description: 'Заблокировать экран Windows (требует подтверждения)',
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
  {
    name: 'propose_new_skill',
    description: 'Вызывается, когда для запроса пользователя ещё нет навыка. Не выполняет действие — предлагает создать новый навык.',
    safetyLevel: 'safe',
    requiresAudit: false,
    parameters: {
      type: 'object',
      properties: {
        requestedAction: { type: 'string', description: 'Описание действия' },
        suggestedSteps: {
          type: 'array',
          description: 'Предлагаемые шаги',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              args: { type: 'object' },
            },
          },
        },
      },
      required: ['requestedAction', 'suggestedSteps'],
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
