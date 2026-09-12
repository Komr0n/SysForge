// src/lib/jarvis/session-history.ts
// Сессионная и долговременная история разговора с Джарвисом.

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Краткое описание выполненных действий (для контекста) */
  actions?: string[];
}

const MAX_MESSAGES = 20;
const STORAGE_KEY = 'sysforge_jarvis_history_log';

class SessionHistory {
  private messages: HistoryMessage[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.messages = parsed.slice(-MAX_MESSAGES);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private saveToStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
      }
    } catch {
      // ignore
    }
  }

  /** Добавить сообщение пользователя */
  addUser(text: string) {
    this.push({ role: 'user', content: text, timestamp: Date.now() });
  }

  /** Добавить ответ Джарвиса */
  addAssistant(text: string, actions?: string[]) {
    this.push({ role: 'assistant', content: text, timestamp: Date.now(), actions });
  }

  private push(msg: HistoryMessage) {
    this.messages.push(msg);
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
    this.saveToStorage();
  }

  /** Поиск по истории сообщений */
  search(query: string, limit = 50): HistoryMessage[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.messages.slice(-limit);
    return this.messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .slice(-limit);
  }

  /** Получить историю в формате OpenAI messages (без текущего сообщения) */
  toOpenAIMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.messages.map((m) => ({
      role: m.role,
      content: m.actions && m.actions.length > 0
        ? `${m.content}\n[Выполнено: ${m.actions.join(', ')}]`
        : m.content,
    }));
  }

  /** Получить сводку последних действий (для системного промпта) */
  getRecentContext(): string {
    if (this.messages.length === 0) return '';
    const recent = this.messages.slice(-6);
    const lines = recent.map((m) => {
      const who = m.role === 'user' ? 'Пользователь' : 'Джарвис';
      const act = m.actions?.length ? ` (выполнено: ${m.actions.join(', ')})` : '';
      return `${who}: ${m.content.slice(0, 100)}${act}`;
    });
    return `\n\nИстория последних обменов:\n${lines.join('\n')}`;
  }

  /** Сколько сообщений в истории */
  get length(): number {
    return this.messages.length;
  }

  /** Очистить историю */
  clear() {
    this.messages = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }

  /** Все сообщения (для отладки) */
  getAll(): HistoryMessage[] {
    return [...this.messages];
  }
}

// Синглтон — один на всё приложение
export const sessionHistory = new SessionHistory();
