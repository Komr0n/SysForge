// src/lib/jarvis/session-history.ts
// Сессионная история разговора с Джарвисом.
// Хранит последние N сообщений в памяти для передачи в LLM как conversation context.

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Краткое описание выполненных действий (для контекста) */
  actions?: string[];
}

const MAX_MESSAGES = 20;

class SessionHistory {
  private messages: HistoryMessage[] = [];

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
    // Держим только последние MAX_MESSAGES
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
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
  }

  /** Все сообщения (для отладки) */
  getAll(): HistoryMessage[] {
    return [...this.messages];
  }
}

// Синглтон — один на всё приложение
export const sessionHistory = new SessionHistory();
