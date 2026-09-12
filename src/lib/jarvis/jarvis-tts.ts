// src/lib/jarvis/jarvis-tts.ts
// JARVIS-style TTS — офлайн, без внешних зависимостей.
// Автоматически подбирает правильный мужской/глубокий голос под язык текста (русский/английский)
// и применяет JARVIS-параметры (pitch, rate).

export interface JarvisTTSConfig {
  ttsVoice?: string;   // voiceURI из speechSynthesis
  ttsRate?: number;
  ttsPitch?: number;
  ttsEnabled?: boolean;
  language?: string;
}

const JARVIS_VOICES_RU = [
  'Microsoft Pavel',
  'Microsoft Dmitri',
  'Pavel',
  'Dmitri',
  'Microsoft Irina',
  'Google русский',
  'ru-RU',
  'ru',
];

const JARVIS_VOICES_EN = [
  'Microsoft David',
  'Microsoft Mark',
  'Microsoft George',
  'Microsoft Richard',
  'Daniel',
  'Google UK English Male',
  'Google US English',
  'en-US',
  'en-GB',
];

/** Выбрать лучший голос под язык текста */
export function selectJarvisVoice(text: string, preferredUri?: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const isRussian = /[а-яёА-ЯЁ]/i.test(text);

  // 1. Явно указанный пользователем голос
  if (preferredUri) {
    const found = voices.find((v) => v.voiceURI === preferredUri);
    if (found) {
      // Проверяем, подходит ли голос под язык текста
      if (isRussian && found.lang.startsWith('ru')) return found;
      if (!isRussian && !found.lang.startsWith('ru')) return found;
    }
  }

  // 2. Поиск по приоритетному списку под язык
  const priorityList = isRussian ? JARVIS_VOICES_RU : JARVIS_VOICES_EN;
  for (const name of priorityList) {
    const found = voices.find((v) =>
      v.name.toLowerCase().includes(name.toLowerCase()) ||
      v.lang.toLowerCase().includes(name.toLowerCase())
    );
    if (found) return found;
  }

  // 3. Fallback: любой подходящий голос по языку
  const langMatch = voices.find((v) =>
    isRussian ? v.lang.toLowerCase().startsWith('ru') : v.lang.toLowerCase().startsWith('en')
  );
  if (langMatch) return langMatch;

  // 4. Крайний fallback — системный голос по умолчанию
  return voices.find((v) => v.default) || voices[0] || null;
}

export class JarvisTTS {
  private config: Required<JarvisTTSConfig>;
  private _isSpeaking = false;

  constructor(cfg: JarvisTTSConfig = {}) {
    this.config = {
      ttsVoice: cfg.ttsVoice ?? '',
      ttsRate: cfg.ttsRate ?? 1.0,
      ttsPitch: cfg.ttsPitch ?? 1.0,
      ttsEnabled: cfg.ttsEnabled ?? true,
      language: cfg.language ?? 'ru-RU',
    };
  }

  updateConfig(cfg: Partial<JarvisTTSConfig>) {
    this.config = { ...this.config, ...cfg };
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  /** Произнести текст с параметрами JARVIS */
  speak(text: string, opts: { quick?: boolean; onEnd?: () => void } = {}): Promise<void> {
    return new Promise((resolve) => {
      if (!this.config.ttsEnabled || !('speechSynthesis' in window) || !text.trim()) {
        opts.onEnd?.();
        resolve();
        return;
      }

      try {
        window.speechSynthesis.cancel();
      } catch { /* ok */ }

      this._isSpeaking = true;

      const isRussian = /[а-яёА-ЯЁ]/i.test(text);
      const voice = selectJarvisVoice(text, this.config.ttsVoice || undefined);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isRussian ? 'ru-RU' : 'en-US';

      // Pitch 0.90 — чуть ниже обычного для солидного тембра JARVIS
      // Rate 1.08 — уверенный темп
      utterance.pitch = opts.quick ? 0.95 : (this.config.ttsPitch > 0 ? this.config.ttsPitch * 0.90 : 0.90);
      utterance.rate = opts.quick ? 1.25 : Math.max(0.9, this.config.ttsRate * 1.06);
      utterance.volume = 1.0;

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this._isSpeaking = false;
        try { opts.onEnd?.(); } catch { /* ok */ }
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('[JarvisTTS] Speech error:', e.error);
        }
        finish();
      };

      // Защитный таймаут: речь не должна блокировать интерфейс если SpeechSynthesis завис
      const maxDurationMs = Math.max(3000, text.length * 120 + 3000);
      const safetyTimer = setTimeout(() => {
        if (!finished) {
          try { window.speechSynthesis.cancel(); } catch { /* ok */ }
          finish();
        }
      }, maxDurationMs);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[JarvisTTS] speak call failed:', err);
        clearTimeout(safetyTimer);
        finish();
      }
    });
  }

  stop() {
    try { window.speechSynthesis?.cancel(); } catch { /* ok */ }
    this._isSpeaking = false;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis?.getVoices() ?? [];
  }
}

// ─── Синглтон ────────────────────────────────────────────────────────────────

let _tts: JarvisTTS | null = null;

export function getJarvisTTS(cfg?: Partial<JarvisTTSConfig>): JarvisTTS {
  if (!_tts) {
    _tts = new JarvisTTS(cfg);
  } else if (cfg) {
    _tts.updateConfig(cfg);
  }
  return _tts;
}

// ─── Фразы приветствия (wake word) ────────────────────────────────────────────

const WAKE_RESPONSES_RU = [
  'Да, сэр?',
  'Жду ваших команд, сэр.',
  'Что прикажете, сэр?',
  'Слушаю вас, сэр.',
  'К вашим услугам.',
  'Всегда к вашим услугам, сэр.',
  'Готов к работе.',
  'Джарвис на связи, сэр.',
  'Какова задача, сэр?',
  'Что пожелаете?',
];

const WAKE_RESPONSES_EN = [
  'At your service, sir.',
  'Yes, sir?',
  'Awaiting your command, sir.',
  'Online and ready.',
  'How may I assist you?',
  'Ready for your command.',
  'Standing by, sir.',
];

/** Получить случайную приветственную фразу после wake word */
export function getWakePhrase(lang: string): string {
  const pool = lang.startsWith('ru') ? WAKE_RESPONSES_RU : WAKE_RESPONSES_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Утилита быстрого озвучивания текста голосом Джарвиса */
export async function speakText(text: string): Promise<void> {
  return getJarvisTTS().speak(text);
}
