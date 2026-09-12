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

// ─── Нормализация речи (фонетические ошибки распознавания) ─────────────────

const SPEECH_FIXES: [RegExp, string][] = [
  // Частые ошибки распознавания русской речи
  [/калькулятар/gi, 'калькулятор'],
  [/калкулятор/gi, 'калькулятор'],
  [/кальк[уі]лятор/gi, 'калькулятор'],
  [/блакнот/gi, 'блокнот'],
  [/блокнод/gi, 'блокнот'],
  [/праводник/gi, 'проводник'],
  [/телеграмм?а?/gi, 'телеграм'],
  [/діспетчер/gi, 'диспетчер'],
  [/диспечер/gi, 'диспетчер'],
  [/паинт/gi, 'paint'],
  [/кальк/gi, 'калькулятор'],
  // Ошибки в глаголах
  [/аткрой/gi, 'открой'],
  [/закрый/gi, 'закрой'],
  [/запусті/gi, 'запусти'],
  [/пакажи/gi, 'покажи'],
  [/поіщи/gi, 'поищи'],
  // Ютуб варианты
  [/ютюб/gi, 'ютуб'],
  [/ю[тд]у[бп]/gi, 'ютуб'],
];

function normalizeSpeech(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SPEECH_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── Таблица команд ───────────────────────────────────────────────────────────

interface AppDef {
  appId: string;
  displayName: string;
  aliases: string[];
  /** Имена процессов Windows для команды закрытия */
  processNames: string[];
  kind: 'system_app' | 'url';
  urlOrNothing?: string;
}

const APPS: AppDef[] = [
  {
    appId: 'calculator', displayName: 'Калькулятор',
    aliases: ['калькулятор', 'калькулятора', 'калькуляторы', 'калькулятором', 'кальк', 'calculator', 'calc'],
    processNames: ['CalculatorApp.exe', 'calc.exe', 'calculatorapp', 'calc', 'calculator', 'win32calc'],
    kind: 'system_app',
  },
  {
    appId: 'notepad', displayName: 'Блокнот',
    aliases: ['блокнот', 'блокнота', 'блокноты', 'notepad'],
    processNames: ['notepad.exe', 'notepad'],
    kind: 'system_app',
  },
  {
    appId: 'explorer', displayName: 'Проводник',
    aliases: ['проводник', 'проводника', 'explorer'],
    processNames: ['explorer.exe', 'explorer'],
    kind: 'system_app',
  },
  {
    appId: 'task_manager', displayName: 'Диспетчер задач',
    aliases: ['диспетчер задач', 'диспетчер', 'task manager', 'taskmgr'],
    processNames: ['Taskmgr.exe', 'taskmgr'],
    kind: 'system_app',
  },
  {
    appId: 'paint', displayName: 'Paint',
    aliases: ['paint', 'паинт', 'пэйнт'],
    processNames: ['mspaint.exe', 'mspaint'],
    kind: 'system_app',
  },
  {
    appId: 'chrome', displayName: 'Chrome',
    aliases: ['хром', 'хрома', 'chrome', 'гугл хром', 'google chrome'],
    processNames: ['chrome.exe', 'chrome'],
    kind: 'url', urlOrNothing: 'https://google.com',
  },
  {
    appId: 'telegram', displayName: 'Telegram',
    aliases: ['телеграм', 'телеграма', 'телега', 'telegram'],
    processNames: ['telegram.exe', 'telegram'],
    kind: 'system_app',
  },
  {
    appId: 'cmd', displayName: 'Командная строка',
    aliases: ['командная строка', 'командную строку', 'cmd', 'command prompt'],
    processNames: ['cmd.exe', 'cmd'],
    kind: 'system_app',
  },
  {
    appId: 'powershell', displayName: 'PowerShell',
    aliases: ['powershell', 'пауэршелл', 'пауэршел'],
    processNames: ['powershell.exe', 'powershell'],
    kind: 'system_app',
  },
];

const OPEN_VERBS = 'открой|запусти|старт|включи|launch|open|start';
const CLOSE_VERBS = 'закрой|заверши|убей|останови|выключи|ликвидируй|погаси|kill|close|stop|quit';

function buildAppCommands(): DirectCommandPattern[] {
  const result: DirectCommandPattern[] = [];
  for (const app of APPS) {
    const aliasGroup = app.aliases.join('|');
    result.push({
      patterns: [
        prog(`(${OPEN_VERBS})\\s+(?:все\\s+)?(?:программ[ууы]\\s+|приложени[ея]\\s+|окн[оа]\\s+)?(${aliasGroup})`),
        prog(`^(${aliasGroup})$`),
        prog(`(${OPEN_VERBS})\\s+.*\\b(${aliasGroup})`),
      ],
      handler: () => ({
        toolName: app.kind === 'url' ? 'open_url' : 'open_system_app',
        args: app.kind === 'url' ? { url: app.urlOrNothing } : { appId: app.appId, displayName: app.displayName },
        displayText: `Открываю ${app.displayName.toLowerCase()}, сэр.`,
      }),
    });
    result.push({
      patterns: [
        prog(`(${CLOSE_VERBS})\\s+(?:все\\s+)?(?:программы?\\s+|приложени[ея]\\s+|окн[оа]\\s+)?(?:процесс[ыа]?\\s+)?(${aliasGroup})`),
        prog(`(${CLOSE_VERBS})\\s+.*\\b(${aliasGroup})`),
        prog(`\\b(${aliasGroup})\\b.*\\s+(${CLOSE_VERBS})`),
      ],
      handler: () => ({
        toolName: 'close_os_app',
        args: { appName: app.processNames[0], allProcessNames: app.processNames },
        displayText: `Закрываю ${app.displayName.toLowerCase()}, сэр.`,
      }),
    });
  }
  return result;
}

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

  ...buildAppCommands(),

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
    .replace(/^(эй\s+|hey\s+)?(джарвис|джарвес|дарвис|jarvis|жарвис|джарвіс|jarvis:)\s*[,:\s]*/i, '')
    // Удаляем вежливые вводные
    .replace(/^(пожалуйста|пж|пожалуйсто|please|can you|could you)\s+/i, '')
    .replace(/\s+(пожалуйста|пж|please)$/i, '')
    .trim();
}

// ─── Основная функция матчинга ────────────────────────────────────────────────

export function directMatch(text: string): DirectCommandMatch | null {
  const raw = text.trim().toLowerCase();
  const cleaned = cleanQuery(text);
  // Normalize common speech recognition errors
  const normalizedRaw = normalizeSpeech(raw);
  const normalizedCleaned = normalizeSpeech(cleaned);

  // Try all variants: cleaned+normalized first (most specific), then raw
  const candidates = new Set([normalizedCleaned, normalizedRaw, cleaned, raw].filter(Boolean));

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
    'закрой калькулятор',
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
