// src/lib/jarvis/direct-commands.ts
// Таблица прямых команд, которые выполняются МГНОВЕННО без вызова LLM.
// Обрабатывает фразы на русском и английском, автоматически очищает wake words и обращения.

export interface DirectCommandMatch {
  toolName: string;
  args: Record<string, unknown>;
  confidence: number;
  displayText: string;
}

interface DirectCommandPattern {
  patterns: RegExp[];
  handler: (match: RegExpMatchArray, cleanText: string) => Omit<DirectCommandMatch, 'confidence'>;
}

function prog(pattern: string): RegExp {
  return new RegExp(pattern, 'i');
}

// ─── Таблица команд ───────────────────────────────────────────────────────────

const DIRECT_COMMANDS: DirectCommandPattern[] = [

  // ── Диалоговые фразы / Приветствия / Статус ──────────────────────────────────
  {
    patterns: [
      prog('^(привет|здравствуй|здравствуйте|добрый день|добрый вечер|доброе утро|салют|хай|hello|hi|hey)$'),
      prog('^(ты (тут|здесь|на связи)|are you there|you there)$'),
    ],
    handler: () => ({
      toolName: 'system_info_echo',
      args: {},
      displayText: 'Приветствую вас, сэр. Все системы функционируют в штатном режиме. Чем могу помочь?',
    }),
  },
  {
    patterns: [
      prog('^(как дела|как ты|как поживаешь|how are you|how is it going)$'),
      prog('^(как самочувствие|все системы в норме|состояние)$'),
    ],
    handler: () => ({
      toolName: 'system_info_echo',
      args: {},
      displayText: 'Все системы работают стабильно, сэр. Нагрузка в пределах нормы, готов к выполнению задач.',
    }),
  },
  {
    patterns: [
      prog('^(кто ты|ты кто|что ты такое|представься|who are you|what are you)$'),
    ],
    handler: () => ({
      toolName: 'system_info_echo',
      args: {},
      displayText: 'Я J.A.R.V.I.S. — ваш персональный тактический ассистент и бортовой ИИ системы SysForge.',
    }),
  },
  {
    patterns: [
      prog('^(спасибо|благодарю|от души|thank you|thanks)$'),
    ],
    handler: () => ({
      toolName: 'system_info_echo',
      args: {},
      displayText: 'Всегда к вашим услугам, сэр.',
    }),
  },
  {
    patterns: [
      prog('^(отмена|стоп|замолчи|молчи|тишина|stop|cancel|quiet|shut up)$'),
    ],
    handler: () => ({
      toolName: 'system_info_echo',
      args: {},
      displayText: 'Вас понял, сэр. Перехожу в режим ожидания.',
    }),
  },

  // ── Системные приложения Windows ─────────────────────────────────────────────
  {
    patterns: [
      prog('(открой|запусти|старт|launch|open)\\s+(калькулятор|calculator|calc)'),
      prog('^(калькулятор|кальк|calculator|calc)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'calc.exe', displayName: 'Калькулятор' },
      displayText: 'Открываю калькулятор, сэр.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(блокнот|notepad|текстовый редактор)'),
      prog('^(блокнот|notepad)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'notepad.exe', displayName: 'Блокнот' },
      displayText: 'Открываю блокнот.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(проводник|explorer|файловый менеджер|файлы|папки)'),
      prog('^(проводник|explorer)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'explorer.exe', displayName: 'Проводник' },
      displayText: 'Открываю проводник Windows.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(командная строка|cmd|command prompt|консоль)'),
      prog('^(cmd|командная строка)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'cmd.exe', displayName: 'Командная строка' },
      displayText: 'Открываю командную строку.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(powershell|пауэршелл)'),
      prog('^(powershell)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'powershell.exe', displayName: 'PowerShell' },
      displayText: 'Открываю PowerShell.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(диспетчер задач|task manager|taskmgr)'),
      prog('^(диспетчер задач|task manager|taskmgr)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'taskmgr.exe', displayName: 'Диспетчер задач' },
      displayText: 'Открываю диспетчер задач Windows.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(браузер|browser|edge|chrome|firefox)'),
      prog('^(браузер|browser)$'),
    ],
    handler: () => ({
      toolName: 'open_url',
      args: { url: 'https://google.com' },
      displayText: 'Открываю браузер.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|launch|open)\\s+(paint|паинт|рисовалку|mspaint)'),
      prog('^(paint|паинт)$'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'mspaint.exe', displayName: 'Paint' },
      displayText: 'Открываю Paint.',
    }),
  },
  {
    patterns: [
      prog('(настройки|параметры системы|system settings|settings)'),
    ],
    handler: () => ({
      toolName: 'open_system_app',
      args: { program: 'ms-settings:', displayName: 'Настройки Windows' },
      displayText: 'Открываю настройки Windows.',
    }),
  },

  // ── Веб-ресурсы ──────────────────────────────────────────────────────────────
  {
    patterns: [
      prog('(открой|перейди|launch|go to|open)\\s+(ютуб|youtube)'),
      prog('^(ютуб|youtube)$'),
    ],
    handler: () => ({
      toolName: 'open_url',
      args: { url: 'https://youtube.com' },
      displayText: 'Перехожу на YouTube.',
    }),
  },
  {
    patterns: [
      prog('(открой|перейди|open)\\s+(гитхаб|github)'),
      prog('^(гитхаб|github)$'),
    ],
    handler: () => ({
      toolName: 'open_url',
      args: { url: 'https://github.com' },
      displayText: 'Открываю GitHub.',
    }),
  },
  {
    patterns: [
      prog('(открой|перейди|open)\\s+(гугл|google)'),
      prog('^(гугл|google)$'),
    ],
    handler: () => ({
      toolName: 'open_url',
      args: { url: 'https://google.com' },
      displayText: 'Открываю Google.',
    }),
  },
  {
    patterns: [
      prog('(открой|перейди|open)\\s+(вики|wikipedia|википедию)'),
      prog('^(вики|wikipedia)$'),
    ],
    handler: () => ({
      toolName: 'open_url',
      args: { url: 'https://wikipedia.org' },
      displayText: 'Открываю Wikipedia.',
    }),
  },
  {
    patterns: [
      prog('(поищи|поиск|найди|search for|google for)\\s+(.+)'),
    ],
    handler: (m) => {
      const query = (m[2] || '').trim();
      return {
        toolName: 'open_url',
        args: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
        displayText: `Ищу в Google: ${query}`,
      };
    },
  },

  // ── Приложения SysForge ───────────────────────────────────────────────────────
  {
    patterns: [
      prog('(открой|запусти|покажи|open)\\s+(процессы|менеджер процессов)'),
      prog('^(процессы|processes)$'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'processes' },
      displayText: 'Открываю менеджер процессов SysForge.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|покажи|open)\\s+(обзор системы|системный обзор|system overview|информация о системе)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'system-overview' },
      displayText: 'Открываю системный обзор.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(пинг|ping)'),
      prog('^(инструмент пинг|утилита пинг)$'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'ping' },
      displayText: 'Открываю инструмент Ping.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(трассировку|traceroute)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'traceroute' },
      displayText: 'Открываю Traceroute.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(сканер портов|port scanner)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'port-scanner' },
      displayText: 'Открываю сканер портов.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(мониторинг (трафика|сети|bandwidth)|bandwidth)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'bandwidth' },
      displayText: 'Открываю монитор трафика.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(dns|DNS)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'dns' },
      displayText: 'Открываю DNS инструмент.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(уязвимости|cve|CVE|безопасность)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'cve' },
      displayText: 'Открываю базу уязвимостей CVE.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(ssh|SSH)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'ssh' },
      displayText: 'Открываю SSH клиент.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(логи|журнал|logs|log viewer)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'log' },
      displayText: 'Открываю просмотрщик логов.',
    }),
  },
  {
    patterns: [
      prog('(открой|запусти|open)\\s+(генератор паролей|password|пароли)'),
    ],
    handler: () => ({
      toolName: 'open_app',
      args: { appId: 'password' },
      displayText: 'Открываю генератор паролей.',
    }),
  },

  // ── Системная информация ──────────────────────────────────────────────────────
  {
    patterns: [
      prog('(статус|состояние|как|how is|status of)\\s+(система|system|cpu|процессор|память|озу)'),
      prog('(что с (железом|системой)|system status|покажи систему)'),
      prog('^(статус|состояние системы)$'),
    ],
    handler: () => ({
      toolName: 'get_system_status',
      args: {},
      displayText: 'Проверяю состояние системы, сэр.',
    }),
  },
  {
    patterns: [
      prog('(покажи|список|покажи список|show)\\s+(процессы|processes|программы)'),
    ],
    handler: () => ({
      toolName: 'get_process_list',
      args: { limit: 10 },
      displayText: 'Получаю список активных процессов.',
    }),
  },

  // ── Темы и фон ────────────────────────────────────────────────────────────────
  {
    patterns: [
      prog('(тема|смени тему|set theme|change theme)\\s+(зелен|terminal.?green)'),
    ],
    handler: () => ({
      toolName: 'set_theme',
      args: { theme: 'terminal-green' },
      displayText: 'Переключаю тему на Terminal Green.',
    }),
  },
  {
    patterns: [
      prog('(тема|смени тему)\\s+(голубой|cyan|holo)'),
    ],
    handler: () => ({
      toolName: 'set_theme',
      args: { theme: 'holo-cyan' },
      displayText: 'Переключаю тему на Holo Cyan.',
    }),
  },
  {
    patterns: [
      prog('(тема|смени тему)\\s+(кибер|cyber|синий)'),
    ],
    handler: () => ({
      toolName: 'set_theme',
      args: { theme: 'cyber' },
      displayText: 'Переключаю тему на Cyber Blue.',
    }),
  },
  {
    patterns: [
      prog('(тема|смени тему)\\s+(тёмн|dark|ночн)'),
      prog('^(тёмная тема|dark theme)$'),
    ],
    handler: () => ({
      toolName: 'set_theme',
      args: { theme: 'dark' },
      displayText: 'Переключаю на тёмную тему.',
    }),
  },
  {
    patterns: [
      prog('(тема|смени тему)\\s+(красн|crimson|красный)'),
    ],
    handler: () => ({
      toolName: 'set_theme',
      args: { theme: 'crimson' },
      displayText: 'Переключаю тему на Crimson.',
    }),
  },
  {
    patterns: [
      prog('(фон|смени фон|set background)\\s+(матриц|matrix)'),
      prog('^(включи матрицу|фон матрица|matrix background)$'),
    ],
    handler: () => ({
      toolName: 'set_background',
      args: { background: 'matrix' },
      displayText: 'Активирую фоновый эффект Matrix Rain.',
    }),
  },
  {
    patterns: [
      prog('(фон|смени фон)\\s+(звёзды|stars|космос)'),
    ],
    handler: () => ({
      toolName: 'set_background',
      args: { background: 'stars' },
      displayText: 'Переключаю фон на звёздное небо.',
    }),
  },
  {
    patterns: [
      prog('(фон|смени фон)\\s+(частицы|particles)'),
    ],
    handler: () => ({
      toolName: 'set_background',
      args: { background: 'particles' },
      displayText: 'Активирую частицы.',
    }),
  },
  {
    patterns: [
      prog('(фон|смени фон)\\s+(сетка|grid|решётка)'),
    ],
    handler: () => ({
      toolName: 'set_background',
      args: { background: 'grid' },
      displayText: 'Переключаю фон на сетку.',
    }),
  },
  {
    patterns: [
      prog('(фон|смени фон)\\s+(аврора|aurora|северное сияние)'),
    ],
    handler: () => ({
      toolName: 'set_background',
      args: { background: 'aurora' },
      displayText: 'Активирую северное сияние.',
    }),
  },

  // ── Пинг ─────────────────────────────────────────────────────────────────────
  {
    patterns: [
      prog('(пингани|пинг|ping)\\s+(шлюз|gateway|роутер|192\\.168\\.)'),
    ],
    handler: () => ({
      toolName: 'ping_host',
      args: { host: '192.168.1.1', count: 4 },
      displayText: 'Пингую шлюз, сэр.',
    }),
  },
  {
    patterns: [
      prog('(пингани|пинг|ping)\\s+(гугл|google|8\\.8\\.8\\.8|dns)'),
    ],
    handler: () => ({
      toolName: 'ping_host',
      args: { host: '8.8.8.8', count: 4 },
      displayText: 'Пингую DNS Google (8.8.8.8).',
    }),
  },
  {
    patterns: [
      prog('(пингани|пинг|ping)\\s+([\\w\\d.-]+\\.[a-z]{2,})'),
      prog('ping\\s+([\\d.]+)'),
    ],
    handler: (m) => {
      const host = m[2] || m[1] || '8.8.8.8';
      return {
        toolName: 'ping_host',
        args: { host, count: 4 },
        displayText: `Пингую ${host}.`,
      };
    },
  },

  // ── Справка ───────────────────────────────────────────────────────────────────
  {
    patterns: [
      prog('(что ты умеешь|что ты можешь|what can you do|помощь|help|справка|команды)'),
    ],
    handler: () => ({
      toolName: 'list_available_skills',
      args: {},
      displayText: 'Показываю доступные навыки и команды, сэр.',
    }),
  },
];

/** Очистить фразу от wake words, обращений и вежливых слов */
function cleanQuery(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // Удаляем начальные обращения: джарвис, jarvis, жарвис, эй, слушай
    .replace(/^(эй\s+|hey\s+)?(джарвис|jarvis|жарвис|jarvis:)\s*[,:\s]*/i, '')
    // Удаляем вежливые вводные
    .replace(/^(пожалуйста|пж|пожалуйсто|please|can you|could you)\s+/i, '')
    .replace(/\s+(пожалуйста|пж|please)$/i, '')
    .trim();
}

// ─── Основная функция матчинга ────────────────────────────────────────────────

export function directMatch(text: string): DirectCommandMatch | null {
  const raw = text.trim().toLowerCase();
  const cleaned = cleanQuery(text);

  const candidates = cleaned !== raw ? [cleaned, raw] : [raw];

  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const cmd of DIRECT_COMMANDS) {
      for (const pattern of cmd.patterns) {
        const m = candidate.match(pattern);
        if (m) {
          const result = cmd.handler(m, candidate);
          return { ...result, confidence: 1.0 };
        }
      }
    }
  }

  return null;
}

export function getDirectCommandExamples(): string[] {
  return [
    'джарвис, открой калькулятор',
    'открой браузер',
    'открой блокнот',
    'открой проводник',
    'диспетчер задач',
    'статус системы',
    'покажи процессы',
    'пингани шлюз',
    'поищи <запрос>',
    'смени тему на dark',
    'включи матрицу',
    'как дела',
    'что ты умеешь',
  ];
}
