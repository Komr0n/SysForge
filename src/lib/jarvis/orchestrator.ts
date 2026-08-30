// src/lib/jarvis/orchestrator.ts
// LLM Orchestrator с поддержкой пула провайдеров, автоматического Fallback
// и передачей истории сессии для полноценного multi-turn диалога.

import { JARVIS_TOOLS, toOpenAIToolSchema } from './tools-schema';
import { skillRegistry } from './skill-registry';
import { CloudProviderProfile } from '../../store/settingsStore';

export interface AIProviderConfig {
  provider: 'local' | 'cloud';
  local: { ollamaUrl: string; model: string };
  cloud: { apiKey: string; model: string; baseUrl?: string };
  cloudProviders?: CloudProviderProfile[];
  activeCloudProviderId?: string;
  autoFallbackOnRateLimit?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrchestratorResult {
  response: string;
  actions: Array<{ toolName: string; args: Record<string, unknown> }>;
  providerUsed?: string;
}

const JARVIS_SYSTEM_PROMPT = `Ты — Джарвис (J.A.R.V.I.S.), голосовой тактический ассистент SysForge. Ты создан в стиле персонажа из фильмов Marvel — умный, лаконичный, всегда вежлив и профессионален.

Правила:
- Отвечай **кратко и по делу** (1-2 предложения максимум, если не запрошено длинное объяснение).
- Обращайся к пользователю «сэр».
- Вызывай инструменты только когда нужно выполнить конкретное действие.
- Для опасных действий (kill_process, delete_file, lock_screen) объясни, что требуется подтверждение.
- Если загружен из истории разговора — помни что было сказано ранее и ссылайся на это.
- Не повторяй вопрос пользователя.
- Отвечай на том же языке, на котором написан вопрос.`;

export class JarvisOrchestrator {
  private config: AIProviderConfig;
  private abortController: AbortController | null = null;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  updateConfig(config: AIProviderConfig) {
    this.config = config;
  }

  abort() {
    this.abortController?.abort();
  }

  /**
   * Обработать команду пользователя.
   * @param userText — текст команды
   * @param conversationHistory — история диалога для контекста (последние N сообщений)
   */
  async processCommand(
    userText: string,
    conversationHistory: ConversationMessage[] = []
  ): Promise<OrchestratorResult> {
    const skills = await skillRegistry.listSkills().catch(() => []);
    const builtins = skillRegistry.getBuiltinSkills();
    const allSkills = [...builtins, ...skills];
    const skillsDesc = allSkills.length
      ? '\n\nДоступные навыки:\n' +
        allSkills.map((s) => `- ${s.id}: ${s.displayName} — ${s.description}`).join('\n')
      : '';

    const systemPrompt = JARVIS_SYSTEM_PROMPT + skillsDesc;
    const tools = JARVIS_TOOLS.map(toOpenAIToolSchema);

    this.abortController = new AbortController();

    try {
      const hasCloudKeys = this.getOrderedProviderChain().length > 0;

      if (this.config.provider === 'local') {
        try {
          return await this.callOllama(userText, systemPrompt, tools, conversationHistory);
        } catch (ollamaErr) {
          // Если Ollama недоступна, но есть настроенные облачные API — используем их
          if (hasCloudKeys) {
            console.warn('[Jarvis] Ollama unavailable, falling back to Cloud AI...', (ollamaErr as Error).message);
            return await this.callCloudWithFallback(userText, systemPrompt, tools, conversationHistory);
          }
          throw new Error(`Локальная модель Ollama недоступна (${(ollamaErr as Error).message}). Запустите Ollama или добавьте API-ключ (Gemini, Groq) в настройках Джарвиса ⚙️.`);
        }
      } else {
        try {
          return await this.callCloudWithFallback(userText, systemPrompt, tools, conversationHistory);
        } catch (cloudErr) {
          // Если облако упало, пробуем локальную Ollama как fallback
          try {
            console.warn('[Jarvis] Cloud AI failed, attempting Ollama fallback...');
            return await this.callOllama(userText, systemPrompt, tools, conversationHistory);
          } catch {
            throw cloudErr;
          }
        }
      }
    } finally {
      this.abortController = null;
    }
  }

  private async callOllama(
    userText: string,
    systemPrompt: string,
    tools: ReturnType<typeof toOpenAIToolSchema>[],
    history: ConversationMessage[]
  ): Promise<OrchestratorResult> {
    let baseUrl = this.config.local.ollamaUrl.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText },
    ];

    const body = {
      model: this.config.local.model || 'llama3.2',
      messages,
      tools,
      tool_choice: 'auto',
      stream: false,
      temperature: 0.3,
      max_tokens: 512,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
    const parsed = this.parseOpenAIResponse(data);
    return { ...parsed, providerUsed: 'Ollama (Local)' };
  }

  private async callCloudWithFallback(
    userText: string,
    systemPrompt: string,
    tools: ReturnType<typeof toOpenAIToolSchema>[],
    history: ConversationMessage[]
  ): Promise<OrchestratorResult> {
    const providers = this.getOrderedProviderChain();

    if (providers.length === 0) {
      throw new Error('Не настроен API-ключ ИИ. Откройте настройки ⚙️ и введите ключ Google Gemini или Groq.');
    }

    const errors: string[] = [];

    for (let i = 0; i < providers.length; i++) {
      const p = providers[i];
      try {
        const res = await this.callSingleProvider(p, userText, systemPrompt, tools, history);
        return { ...res, providerUsed: p.name };
      } catch (err) {
        const msg = (err as Error).message || String(err);
        errors.push(`${p.name}: ${msg}`);
        console.warn(`[Jarvis Fallback] Provider ${p.name} failed: ${msg}`);

        if (this.config.autoFallbackOnRateLimit === false) throw err;

        if (i < providers.length - 1) {
          console.info(`[Jarvis Fallback] Switching to next provider: ${providers[i + 1].name}...`);
        }
      }
    }

    throw new Error(`Все AI провайдеры вернули ошибку:\n${errors.join('\n')}`);
  }

  private getOrderedProviderChain(): CloudProviderProfile[] {
    const all = this.config.cloudProviders || [];
    const enabledWithKeys = all.filter((p) => p.enabled && p.apiKey && p.apiKey.trim().length > 0);

    if (enabledWithKeys.length === 0) {
      if (this.config.cloud?.apiKey?.trim()) {
        return [{
          id: 'default', name: 'Default Cloud AI', enabled: true,
          apiKey: this.config.cloud.apiKey.trim(),
          baseUrl: this.config.cloud.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai',
          model: this.config.cloud.model || 'gemini-1.5-flash',
        }];
      }
      return [];
    }

    const activeId = this.config.activeCloudProviderId || 'gemini';
    const active = enabledWithKeys.find((p) => p.id === activeId);
    const others = enabledWithKeys.filter((p) => p.id !== activeId);
    return active ? [active, ...others] : enabledWithKeys;
  }

  private async callSingleProvider(
    profile: CloudProviderProfile,
    userText: string,
    systemPrompt: string,
    tools: ReturnType<typeof toOpenAIToolSchema>[],
    history: ConversationMessage[]
  ): Promise<OrchestratorResult> {
    let baseUrl = profile.baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta/openai';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const apiKey = profile.apiKey.trim();
    const isGemini = baseUrl.includes('generativelanguage.googleapis.com') || apiKey.startsWith('AIzaSy');
    const model = profile.model.trim() || (isGemini ? 'gemini-1.5-flash' : 'gpt-4o-mini');
    const url = `${baseUrl}/chat/completions`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userText },
    ];

    const body = {
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 512,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    if (isGemini) headers['x-goog-api-key'] = apiKey;
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://sysforge.local';
      headers['X-Title'] = 'SysForge Jarvis';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
    return this.parseOpenAIResponse(data);
  }

  private parseOpenAIResponse(data: { choices: Array<{ message: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> }): OrchestratorResult {
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Пустой ответ от LLM');

    const response = message.content ?? '';
    const actions: OrchestratorResult['actions'] = [];

    if (message.tool_calls) {
      for (const call of message.tool_calls) {
        try {
          const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
          actions.push({ toolName: call.function.name, args });
        } catch {
          console.warn('[Orchestrator] Failed to parse tool call args:', call.function.arguments);
        }
      }
    }

    return { response, actions };
  }

  async checkAvailability(providerProfile?: CloudProviderProfile): Promise<{ available: boolean; error?: string }> {
    try {
      if (this.config.provider === 'local' && !providerProfile) {
        const response = await fetch(`${this.config.local.ollamaUrl}/models`, {
          signal: AbortSignal.timeout(3000),
        });
        return { available: response.ok };
      }

      const p = providerProfile || this.getOrderedProviderChain()[0];
      if (!p || !p.apiKey) return { available: false, error: 'API ключ не задан' };

      let baseUrl = p.baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta/openai';
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

      const apiKey = p.apiKey.trim();
      const isGemini = baseUrl.includes('generativelanguage.googleapis.com') || apiKey.startsWith('AIzaSy');

      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
      if (isGemini) headers['x-goog-api-key'] = apiKey;
      if (baseUrl.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://sysforge.local';
        headers['X-Title'] = 'SysForge Jarvis';
      }

      const response = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) return { available: true };
      const errText = await response.text().catch(() => response.statusText);
      return { available: false, error: `HTTP ${response.status}: ${errText.slice(0, 150)}` };
    } catch (e) {
      return { available: false, error: (e as Error).message };
    }
  }
}

// ─── Синглтон ─────────────────────────────────────────────────────────────────

let _orchestrator: JarvisOrchestrator | null = null;

export function getOrchestrator(config?: AIProviderConfig): JarvisOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new JarvisOrchestrator(
      config ?? {
        provider: 'cloud',
        local: { ollamaUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
        cloud: { apiKey: '', model: 'gemini-1.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
      }
    );
  } else if (config) {
    _orchestrator.updateConfig(config);
  }
  return _orchestrator;
}
