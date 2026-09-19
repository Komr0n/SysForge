// src/lib/jarvis/skill-registry.ts
// Реестр навыков: CRUD + localStorage/Tauri FS хранение

import { Skill, SandboxLevel, validateSkillSandbox } from './sandbox';
export type { Skill };

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
const LS_KEY = 'jarvis-skills';

// ─── Сериализация ─────────────────────────────────────────────────────────────

function serializeSkill(skill: Skill): string {
  return JSON.stringify(skill, null, 2);
}

function deserializeSkill(raw: string): Skill {
  return JSON.parse(raw) as Skill;
}

// ─── Tauri FS операции ────────────────────────────────────────────────────────

async function getTauriSkillsDir(): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path');
  const base = await appDataDir();
  return `${base}sysforge/skills`;
}

async function tauriSaveSkill(skill: Skill): Promise<void> {
  const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
  const dir = await getTauriSkillsDir();
  const dirExists = await exists(dir);
  if (!dirExists) await mkdir(dir, { recursive: true });
  await writeTextFile(`${dir}/${skill.id}.json`, serializeSkill(skill));
}

async function tauriLoadSkill(id: string): Promise<Skill | null> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const dir = await getTauriSkillsDir();
    const path = `${dir}/${id}.json`;
    const fileExists = await exists(path);
    if (!fileExists) return null;
    const raw = await readTextFile(path);
    return deserializeSkill(raw);
  } catch {
    return null;
  }
}

async function tauriListSkills(): Promise<Skill[]> {
  try {
    const { readDir, readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const dir = await getTauriSkillsDir();
    const dirExists = await exists(dir);
    if (!dirExists) return [];
    const entries = await readDir(dir);
    const skills: Skill[] = [];
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const raw = await readTextFile(`${dir}/${entry.name}`);
          skills.push(deserializeSkill(raw));
        } catch { /* пропускаем битые файлы */ }
      }
    }
    return skills;
  } catch {
    return [];
  }
}

async function tauriDeleteSkill(id: string): Promise<void> {
  const { remove, exists } = await import('@tauri-apps/plugin-fs');
  const dir = await getTauriSkillsDir();
  const path = `${dir}/${id}.json`;
  const fileExists = await exists(path);
  if (fileExists) await remove(path);
}

// ─── localStorage операции ────────────────────────────────────────────────────

function lsGetAll(): Record<string, Skill> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function lsSetAll(skills: Record<string, Skill>): void {
  localStorage.setItem(LS_KEY, JSON.stringify(skills));
}

// ─── SkillRegistry ────────────────────────────────────────────────────────────

export class SkillRegistry {
  async saveSkill(skill: Skill): Promise<void> {
    const validation = validateSkillSandbox(skill);
    if (!validation.valid) {
      throw new Error(
        `Навык "${skill.id}" требует sandbox выше указанного ` +
          `(инструмент "${validation.violatingTool}" превышает "${skill.sandbox}")`
      );
    }

    if (isTauri) {
      await tauriSaveSkill(skill);
      // Запросить перестройку индекса если ONNX доступен
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('jarvis_reindex_skill', { skillId: skill.id }).catch(() => {});
      } catch { /* ONNX может быть недоступен */ }
    } else {
      const all = lsGetAll();
      all[skill.id] = skill;
      lsSetAll(all);
    }
  }

  async loadSkill(id: string): Promise<Skill | null> {
    if (isTauri) {
      return tauriLoadSkill(id);
    }
    const all = lsGetAll();
    return all[id] ?? null;
  }

  async listSkills(): Promise<Skill[]> {
    if (isTauri) {
      return tauriListSkills();
    }
    return Object.values(lsGetAll());
  }

  async deleteSkill(id: string): Promise<void> {
    if (isTauri) {
      await tauriDeleteSkill(id);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('jarvis_reindex_skill', { skillId: id }).catch(() => {});
      } catch { /* ok */ }
    } else {
      const all = lsGetAll();
      delete all[id];
      lsSetAll(all);
    }
  }

  async exportSkill(id: string): Promise<string> {
    const skill = await this.loadSkill(id);
    if (!skill) {
      const builtin = this.getBuiltinSkills().find((s) => s.id === id);
      if (builtin) return JSON.stringify(builtin, null, 2);
      throw new Error(`Навык "${id}" не найден.`);
    }
    return JSON.stringify(skill, null, 2);
  }

  async importSkillFromContent(content: string): Promise<Skill> {
    const skill = JSON.parse(content) as Skill;
    if (!skill.id || !skill.displayName || !Array.isArray(skill.steps)) {
      throw new Error('Некорректная структура файла навыка (отсутствуют id, displayName или steps).');
    }
    const validation = validateSkillSandbox(skill);
    if (!validation.valid) {
      throw new Error(`Импорт отклонён: навык требует уровень безопасности выше заявленного (${validation.violatingTool})`);
    }
    await this.saveSkill(skill);
    return skill;
  }

  /** Создать новый навык с дефолтными значениями */
  createEmpty(): Skill {
    return {
      id: `skill-${Date.now()}`,
      displayName: 'Новый навык',
      description: '',
      category: 'general',
      createdBy: 'user',
      sandbox: SandboxLevel.Minimal,
      phrases: { ru: [], en: [] },
      slots: {},
      steps: [],
      executionCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /** Встроенные системные навыки */
  getBuiltinSkills(): Skill[] {
    return [
      {
        id: 'builtin-ping-gateway',
        displayName: 'Пинг шлюза',
        description: 'Пингует 192.168.1.1 и возвращает результат',
        category: 'network',
        createdBy: 'system',
        sandbox: SandboxLevel.Standard,
        phrases: {
          ru: [
            'пингани шлюз',
            'проверь пинг до роутера',
            'пингуй гейтвей',
            'какой пинг',
            'проверь задержку сети',
            'пропингуй шлюз',
            'проверь соединение со шлюзом',
          ],
          en: ['ping the gateway', 'check gateway latency', 'test router ping', 'ping network gateway'],
        },
        slots: { host: { default: '192.168.1.1', pattern: 'ip_or_hostname' } },
        steps: [{ tool: 'ping_host', args: { host: '{host}' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-system-status',
        displayName: 'Статус системы',
        description: 'Показывает CPU, RAM и состояние системы',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Standard,
        phrases: {
          ru: [
            'статус системы',
            'как система',
            'покажи состояние',
            'что с железом',
            'нагрузка на систему',
            'состояние пк',
            'мониторинг системы',
          ],
          en: ['system status', 'show system info', 'how is the system', 'hardware load', 'pc status'],
        },
        slots: {},
        steps: [{ tool: 'get_system_status', args: {} }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-open-processes',
        displayName: 'Диспетчер задач',
        description: 'Открывает менеджер процессов',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'открой процессы',
            'диспетчер задач',
            'покажи процессы',
            'запущенные программы',
            'список процессов',
            'управление процессами',
            'менеджер задач',
          ],
          en: ['open processes', 'task manager', 'show processes', 'running programs', 'process manager'],
        },
        slots: {},
        steps: [{ tool: 'open_app', args: { appId: 'processes' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-open-calc',
        displayName: 'Калькулятор Windows',
        description: 'Запускает системный калькулятор',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'калькулятор',
            'открой калькулятор',
            'посчитай',
            'запусти калькулятор',
            'включи калькулятор',
            'запусти расчет',
            'вызови калькулятор',
          ],
          en: ['calculator', 'open calculator', 'launch calc', 'start calculator'],
        },
        slots: {},
        steps: [{ tool: 'open_system_app', args: { program: 'calc.exe', displayName: 'Калькулятор' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-close-calc',
        displayName: 'Закрыть калькулятор',
        description: 'Завершает работу процесса калькулятора',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Standard,
        phrases: {
          ru: [
            'закрой калькулятор',
            'заверши калькулятор',
            'выключи калькулятор',
            'убери калькулятор',
            'выруби кальк',
            'закрой расчет',
          ],
          en: ['close calculator', 'quit calculator', 'kill calc', 'exit calculator'],
        },
        slots: {},
        steps: [{ tool: 'close_os_app', args: { processName: 'CalculatorApp.exe' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-open-notepad',
        displayName: 'Блокнот',
        description: 'Открывает текстовый редактор Блокнот',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'блокнот',
            'открой блокнот',
            'запусти блокнот',
            'текстовый документ',
            'создай заметку',
            'включи блокнот',
            'открой текстовый редактор',
          ],
          en: ['notepad', 'open notepad', 'launch notepad', 'text editor', 'new note'],
        },
        slots: {},
        steps: [{ tool: 'open_system_app', args: { program: 'notepad.exe', displayName: 'Блокнот' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-close-notepad',
        displayName: 'Закрыть блокнот',
        description: 'Завершает процесс Блокнота',
        category: 'system',
        createdBy: 'system',
        sandbox: SandboxLevel.Standard,
        phrases: {
          ru: [
            'закрой блокнот',
            'заверши блокнот',
            'выключи блокнот',
            'убери блокнот',
            'выруби блокнот',
            'закрой редактор заметок',
          ],
          en: ['close notepad', 'quit notepad', 'kill notepad', 'exit notepad'],
        },
        slots: {},
        steps: [{ tool: 'close_os_app', args: { processName: 'notepad.exe' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-open-browser',
        displayName: 'Браузер',
        description: 'Открывает веб-браузер',
        category: 'general',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'браузер',
            'открой браузер',
            'в интернет',
            'интернет',
            'запусти веб-браузер',
            'открой хром',
            'выйди в сеть',
          ],
          en: ['browser', 'open browser', 'web', 'launch browser', 'open web'],
        },
        slots: { url: { default: 'https://google.com', pattern: 'url' } },
        steps: [{ tool: 'open_url', args: { url: '{url}' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-theme-dark',
        displayName: 'Тёмная тема',
        description: 'Переключает тему на Dark',
        category: 'general',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'тёмная тема',
            'включи тёмную тему',
            'ночной режим',
            'сделай темно',
            'переключи на темную',
            'темный стиль оформления',
          ],
          en: ['dark theme', 'set dark theme', 'night mode', 'dark mode', 'switch to dark'],
        },
        slots: {},
        steps: [{ tool: 'set_theme', args: { theme: 'dark' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'builtin-bg-matrix',
        displayName: 'Фон Матрица',
        description: 'Устанавливает анимированный фон Matrix Rain',
        category: 'general',
        createdBy: 'system',
        sandbox: SandboxLevel.Minimal,
        phrases: {
          ru: [
            'фон матрица',
            'включи матрицу',
            'матричный фон',
            'анимация матрицы',
            'зеленый код матрицы',
            'эффект дождя матрицы',
          ],
          en: ['matrix background', 'set matrix bg', 'matrix mode', 'matrix rain', 'matrix wallpaper'],
        },
        slots: {},
        steps: [{ tool: 'set_background', args: { background: 'matrix' } }],
        executionCount: 0,
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

export const skillRegistry = new SkillRegistry();
