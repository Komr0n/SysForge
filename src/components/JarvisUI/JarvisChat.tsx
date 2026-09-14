// src/components/JarvisUI/JarvisChat.tsx
// Главный компонент чата Джарвиса с голосовым вводом, визуальным индикатором громкости,
// историей сессии, прямыми командами, созданием навыков и перетаскиванием

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { routeCommand, CommandResult } from '../../lib/jarvis/hybrid-router';
import { getOrchestrator } from '../../lib/jarvis/orchestrator';
import { getVoiceService, JarvisState } from '../../lib/jarvis/voice-service';
import { sessionHistory } from '../../lib/jarvis/session-history';
import { JarvisOrb, STATE_LABELS } from './JarvisOrb';
import { ConfirmationModal } from './ConfirmationModal';
import { ProviderFallbackModal } from './ProviderFallbackModal';
import { JarvisSettings } from './JarvisSettings';
import { SkillCreator } from './SkillCreator';
import { LogEntry } from './JarvisLog';
import { registerUICallbacks } from '../../lib/jarvis/tool-executor';
import { useWindowStore } from '../../store/windowStore';
import { Skill, SandboxLevel } from '../../lib/jarvis/sandbox';

// App icons mapping
const APP_ICONS: Record<string, string> = {
  ping: '📡', traceroute: '🛤️', 'port-scanner': '🔌', bandwidth: '📊',
  dns: '🌐', ssh: '💻', wol: '⚡', hash: '#️⃣', ssl: '🔒',
  password: '🔑', 'ip-intel': '🕵️', subnet: '🖧', jwt: '🎫', cve: '🐛',
  processes: '⚙️', 'system-overview': '💾', logs: '📋', 'file-hash': '🔍',
  'api-tester': '🧪', formatter: '{ }', encoder: '🔢', regex: '🔤',
  snippets: '📝', diff: '↔️',
};

const APP_IDS = Object.keys(APP_ICONS);

interface PendingConfirmation {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'jarvis' | 'system';
  text: string;
  time: Date;
  matchedVia?: 'direct' | 'embedding' | 'llm' | 'skill' | 'keyword';
  providerUsed?: string;
  canSaveAsSkill?: boolean;
}

interface JarvisChatProps {
  isOpen: boolean;
  onClose: () => void;
  onStateChange?: (state: JarvisState) => void;
  onNewLog?: (entry: LogEntry) => void;
}

export function JarvisChat({ isOpen, onClose, onStateChange, onNewLog }: JarvisChatProps) {
  const { jarvis, setJarvisConfig, setTheme, setBackground } = useSettingsStore((s) => ({
    jarvis: s.jarvis,
    setJarvisConfig: s.setJarvisConfig,
    setTheme: s.setTheme,
    setBackground: s.setBackground,
  }));

  const { openWindow, closeWindow } = useWindowStore((s) => ({
    openWindow: s.openWindow,
    closeWindow: s.closeWindow,
  }));

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'jarvis',
      text: 'Система J.A.R.V.I.S. активна. Все системы функционируют в штатном режиме. Чем могу помочь, сэр?',
      time: new Date(),
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillCreatorOpen, setSkillCreatorOpen] = useState(false);
  const [newSkillDraft, setNewSkillDraft] = useState<Skill | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [providerFallback, setProviderFallback] = useState<{
    currentProvider: 'local' | 'cloud';
    errorMessage?: string;
  } | null>(null);
  const [micVolume, setMicVolume] = useState(0);
  const [interimText, setInterimText] = useState('');
  const [isFollowUp, setIsFollowUp] = useState(false);

  // Drag state for chat window
  const [chatPos, setChatPos] = useState({ x: -1, y: -1 }); // -1 = use default position
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  // Регистрация UI callbacks для выполнения действий
  useEffect(() => {
    registerUICallbacks({
      openApp: (appId: string) => {
        if (APP_IDS.includes(appId)) {
          openWindow(appId, appId.toUpperCase(), APP_ICONS[appId] || '💻', appId);
        }
      },
      closeApp: (appId: string) => {
        closeWindow(appId);
      },
      setTheme: (theme: string) => {
        setTheme(theme as any);
      },
      setBackground: (bg: string) => {
        setBackground(bg as any);
      },
    });
  }, [openWindow, closeWindow, setTheme, setBackground]);

  // Уведомление родителя о смене состояния
  useEffect(() => {
    onStateChange?.(jarvisState);
  }, [jarvisState, onStateChange]);

  // Автоскролл сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  // Фокус на инпут при открытии
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Синхронизация конфига AI Orchestrator
  useEffect(() => {
    const orchestrator = getOrchestrator();
    orchestrator.updateConfig({
      provider: jarvis.provider,
      local: jarvis.local,
      cloud: jarvis.cloud,
      cloudProviders: jarvis.cloudProviders,
      activeCloudProviderId: jarvis.activeCloudProviderId,
      autoFallbackOnRateLimit: jarvis.autoFallbackOnRateLimit,
    });
  }, [
    jarvis.provider,
    jarvis.local,
    jarvis.cloud,
    jarvis.cloudProviders,
    jarvis.activeCloudProviderId,
    jarvis.autoFallbackOnRateLimit,
  ]);

  const addMessage = useCallback((role: ChatMessage['role'], text: string, extra?: Partial<ChatMessage>) => {
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      role,
      text,
      time: new Date(),
      ...extra,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const handleSaveAsSkill = useCallback((msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    const draft: Skill = {
      id: 'custom-' + Date.now(),
      displayName: 'Пользовательский навык',
      description: msg.text.slice(0, 80),
      category: 'automation',
      createdBy: 'user',
      sandbox: SandboxLevel.Minimal,
      phrases: { ru: [], en: [] },
      slots: {},
      steps: [],
      executionCount: 0,
      createdAt: new Date().toISOString(),
    };
    setNewSkillDraft(draft);
    setSkillCreatorOpen(true);
  }, [messages]);

  const handleCommand = useCallback(async (text: string, wasVoiceTriggered = false) => {
    if (!text.trim()) return;
    if (processingRef.current) {
      console.warn('[JarvisChat] Command already processing, ignoring');
      return;
    }
    processingRef.current = true;

    addMessage('user', text);
    onNewLog?.({ id: Date.now().toString(), timestamp: new Date(), type: 'user', text });
    setJarvisState('thinking');

    try {
      const result: CommandResult = await routeCommand(text, {
        confidenceThreshold: jarvis.confidenceThreshold,
      });

      // Проверка на ошибку провайдера
      if (result.response.includes('Ошибка LLM') || result.response.includes('Ошибка AI:')) {
        if (jarvis.fallbackMode === 'manual') {
          setProviderFallback({
            currentProvider: jarvis.provider,
            errorMessage: result.response,
          });
        }
      }

      // Проверка на подтверждение опасных операций
      if (result.pendingConfirmation) {
        setPendingConfirmation(result.pendingConfirmation);
        addMessage('jarvis', `Требуется подтверждение для: ${result.pendingConfirmation.description}`);
        setJarvisState('idle');
        processingRef.current = false;
        return;
      }

      // Проверка на предложение нового навыка (propose_new_skill)
      const proposalResult = result.toolResults.find(
        (r) => r.data && typeof r.data === 'object' && 'requestedAction' in (r.data as Record<string, unknown>)
      );
      if (proposalResult && proposalResult.data) {
        const data = proposalResult.data as { requestedAction: string; suggestedSteps?: any[] };
        const draft: Skill = {
          id: 'skill-' + Date.now(),
          displayName: data.requestedAction || 'Новый навык',
          description: data.requestedAction || 'Пользовательский навык',
          category: 'automation',
          createdBy: 'user',
          sandbox: SandboxLevel.Minimal,
          phrases: { ru: [data.requestedAction], en: [] },
          slots: {},
          steps: data.suggestedSteps || [],
          executionCount: 0,
          createdAt: new Date().toISOString(),
        };
        setNewSkillDraft(draft);
        setSkillCreatorOpen(true);
      }

      setJarvisState('executing');

      const canSave = result.matchedVia === 'llm' && result.toolResults.length > 0;

      const jarvisMsg = addMessage('jarvis', result.response, {
        matchedVia: result.matchedVia,
        providerUsed: result.providerUsed,
        canSaveAsSkill: canSave,
      });

      onNewLog?.({
        id: jarvisMsg.id,
        timestamp: jarvisMsg.time,
        type: 'jarvis',
        text: result.response.slice(0, 120),
        matchedVia: result.matchedVia,
      });

      // TTS (JARVIS voice) & Follow-up listening
      if (result.response) {
        const vs = getVoiceService();
        if (jarvis.voice.ttsEnabled) {
          // Set pending follow-up flag BEFORE speaking so speak.onEnd doesn't restart wake-word
          if (wasVoiceTriggered && (result.matchedVia as string) !== 'llm-error' && jarvis.voice.followUpListening !== false) {
            vs.setPendingFollowUp(true);
          }
          await vs.speak(result.response);
        }
        // Start follow-up listening after TTS completes
        if (wasVoiceTriggered && (result.matchedVia as string) !== 'llm-error' && jarvis.voice.followUpListening !== false) {
          // Small delay for audio cleanup before starting mic again
          await new Promise((r) => setTimeout(r, 250));
          vs.startFollowUpListening(jarvis.voice.followUpWindowMs || 4000);
        } else {
          setJarvisState('idle');
        }
      } else {
        setJarvisState('idle');
      }
    } catch (e) {
      const errMsg = `Ошибка: ${(e as Error).message}`;
      addMessage('system', errMsg);
      setJarvisState('error');
      setTimeout(() => setJarvisState('idle'), 2500);
    } finally {
      processingRef.current = false;
    }
  }, [addMessage, jarvis, onNewLog, setJarvisState]);

  // Ref для стабильной ссылки внутри useEffect
  const handleCommandRef = useRef(handleCommand);
  useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  // Голосовой сервис
  useEffect(() => {
    const vs = getVoiceService();

    vs.updateConfig({
      language: jarvis.voice.language,
      wakeWord: jarvis.voice.wakeWord,
      continuousWakeWord: jarvis.voice.continuousWakeWord,
      ttsEnabled: jarvis.voice.ttsEnabled,
      ttsVoice: jarvis.voice.ttsVoice,
      ttsRate: jarvis.voice.ttsRate,
      ttsPitch: jarvis.voice.ttsPitch,
      sttEnabled: jarvis.voice.sttEnabled,
      followUpListening: jarvis.voice.followUpListening,
      followUpWindowMs: jarvis.voice.followUpWindowMs,
      cloudProviders: jarvis.cloudProviders,
    });

    const removeStateListener = vs.onStateChange((state) => {
      setJarvisState(state);
    });

    const removeVolumeListener = vs.onVolume((vol: number) => {
      setMicVolume(vol);
    });

    const removeTranscriptListener = vs.onTranscript((text: string, isFinal: boolean) => {
      setInterimText(text);
      if (isFinal) setInterimText('');
    });

    const removeFollowUpListener = vs.onFollowUpChange((active) => {
      setIsFollowUp(active);
    });

    const removeCommandListener = vs.onCommand((cmd: string) => {
      setInterimText('');
      handleCommandRef.current(cmd, true);
    });

    const removeErrorListener = vs.onError((msg: string) => {
      addMessage('system', msg);
    });

    if (jarvis.voice.continuousWakeWord) {
      vs.startWakeWordListening().catch(() => {});
    }

    return () => {
      removeStateListener();
      removeVolumeListener();
      removeTranscriptListener();
      removeFollowUpListener();
      removeCommandListener();
      removeErrorListener();
    };
  }, [jarvis.voice, jarvis.cloudProviders, addMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    handleCommand(text);
  };

  const handleMicClick = async () => {
    const vs = getVoiceService();
    if (jarvisState === 'listening') {
      vs.stopListening();
      setJarvisState('idle');
    } else {
      try {
        await vs.startListening();
      } catch (err) {
        addMessage('system', `Ошибка активации микрофона: ${(err as Error).message}`);
      }
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingConfirmation) return;
    const { toolName, args } = pendingConfirmation;
    setPendingConfirmation(null);

    setJarvisState('executing');
    try {
      const result = await routeCommand('', {
        userConfirmedDestructive: true,
        pendingToolName: toolName,
        pendingToolArgs: args,
      });
      addMessage('jarvis', result.response);
      const vs = getVoiceService();
      await vs.speak(result.response);
    } catch (e) {
      addMessage('system', `Ошибка: ${(e as Error).message}`);
    } finally {
      setJarvisState('idle');
    }
  };

  // Drag handlers for chat window
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = (e.target as HTMLElement).closest('[data-chat-container]') as HTMLElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const currentX = chatPos.x < 0 ? rect.left : chatPos.x;
    const currentY = chatPos.y < 0 ? rect.top : chatPos.y;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: currentX, originY: currentY };

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setChatPos({
        x: dragRef.current.originX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (ev.clientY - dragRef.current.startY),
      });
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [chatPos]);

  const msgColors = {
    user: 'var(--accent-primary)',
    jarvis: 'var(--text-primary)',
    system: '#ef4444',
  };

  const volBars = Math.min(10, Math.round(micVolume / 10));

  // Chat position: default to bottom-right if not dragged yet
  const chatStyle: React.CSSProperties = chatPos.x >= 0
    ? { position: 'fixed', left: chatPos.x, top: chatPos.y }
    : { position: 'fixed', bottom: 230, right: 16 };

  return (
    <>
      <div
        data-chat-container
        style={{
          ...chatStyle,
          width: 'clamp(280px, 30vw, 380px)',
          height: 'clamp(320px, 60vh, 520px)',
          maxHeight: 'calc(100vh - 60px)',
          zIndex: 5000,
          background: 'rgba(8,10,16,0.94)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          display: isOpen ? 'flex' : 'none',
          flexDirection: 'column',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.65)',
          fontFamily: 'var(--font-mono)',
        }}>
        {/* Header - draggable */}
        <div
          onMouseDown={handleDragStart}
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0,
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <JarvisOrb state={jarvisState} size={18} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'var(--accent-primary)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              JARVIS
            </span>
            <span style={{ color: isFollowUp ? '#00ffff' : 'var(--text-muted)', fontSize: 9.5 }}>
              {isFollowUp ? 'Жду продолжения…' : STATE_LABELS[jarvisState]}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              sessionHistory.clear();
              setMessages([{
                id: 'init', role: 'jarvis', text: 'История сессии очищена, сэр. Чем могу помочь?', time: new Date(),
              }]);
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
            title="Очистить историю сессии"
          >
            🧹
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
            title="Настройки"
          >⚙️</button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
          >✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
            }}>
              <div style={{
                background: msg.role === 'user' ? 'rgba(14,165,233,0.12)' : 'rgba(79,70,229,0.1)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(14,165,233,0.25)' : 'rgba(79,70,229,0.2)'}`,
                borderRadius: msg.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                padding: '6px 10px',
                fontSize: 11,
                color: msgColors[msg.role],
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>

              {/* Badges & Meta */}
              <div style={{
                fontSize: 8.5, color: 'var(--text-muted)', marginTop: 2,
                display: 'flex', alignItems: 'center', gap: 6,
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <span>{msg.time.toLocaleTimeString('en-US', { hour12: false })}</span>
                {msg.matchedVia === 'direct' && (
                  <span style={{ color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '0 4px', borderRadius: 2 }}>
                    ⚡ Прямая команда
                  </span>
                )}
                {msg.matchedVia === 'embedding' && (
                  <span style={{ color: '#0ea5e9', background: 'rgba(14,165,233,0.1)', padding: '0 4px', borderRadius: 2 }}>
                    🧠 Навык
                  </span>
                )}
                {msg.matchedVia === 'keyword' && (
                  <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0 4px', borderRadius: 2 }}>
                    🔤 Ключевые слова
                  </span>
                )}
                {msg.matchedVia === 'llm' && (
                  <span style={{ color: '#c084fc', background: 'rgba(192,132,252,0.1)', padding: '0 4px', borderRadius: 2 }}>
                    ☁️ {msg.providerUsed || 'AI Cloud'}
                  </span>
                )}
                {msg.canSaveAsSkill && (
                  <button
                    onClick={() => handleSaveAsSkill(msg.id)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--accent-primary)',
                      borderRadius: 2,
                      color: 'var(--accent-primary)',
                      fontSize: 8.5,
                      padding: '0 4px',
                      cursor: 'pointer',
                    }}
                    title="Запомнить эту последовательность действий как навык"
                  >
                    💾 Запомнить
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Interim transcript & Live audio meter */}
          {jarvisState === 'listening' && (
            <div style={{
              color: '#00ff88',
              fontSize: 10,
              fontStyle: 'italic',
              alignSelf: 'flex-start',
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid rgba(0,255,136,0.2)',
              borderRadius: 4,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>🎤 {interimText || 'Слушаю ваш голос...'}</span>
              <span style={{ fontFamily: 'monospace', letterSpacing: 1, color: micVolume > 20 ? '#00ff88' : 'var(--text-muted)' }}>
                {'█'.repeat(volBars) + '░'.repeat(10 - volBars)}
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: 6, alignItems: 'center',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={handleMicClick}
            style={{
              background: jarvisState === 'listening' ? 'rgba(0,255,136,0.25)' : 'transparent',
              border: `1px solid ${jarvisState === 'listening' ? '#00ff88' : 'var(--border-color)'}`,
              borderRadius: 4,
              color: jarvisState === 'listening' ? '#00ff88' : 'var(--text-muted)',
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: jarvisState === 'listening' ? '0 0 8px rgba(0,255,136,0.4)' : 'none',
              transition: 'all 0.2s ease',
            }}
            title={jarvisState === 'listening' ? 'Остановить прослушивание' : 'Голосовой ввод'}
          >
            🎤
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Спросите или введите команду..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '5px 8px',
              fontSize: 11,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />

          <button
            type="submit"
            style={{
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 4,
              color: '#000',
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ↵
          </button>
        </form>
      </div>

      {/* Confirmation Modal */}
      {pendingConfirmation && (
        <ConfirmationModal
          isOpen={!!pendingConfirmation}
          toolName={pendingConfirmation.toolName}
          description={pendingConfirmation.description}
          args={pendingConfirmation.args}
          onConfirm={handleConfirmAction}
          onCancel={() => setPendingConfirmation(null)}
        />
      )}

      {/* Provider Fallback Modal */}
      {providerFallback && (
        <ProviderFallbackModal
          isOpen={!!providerFallback}
          currentProvider={providerFallback.currentProvider}
          errorMessage={providerFallback.errorMessage}
          onSwitch={() => {
            const next = providerFallback.currentProvider === 'local' ? 'cloud' : 'local';
            setJarvisConfig({ ...jarvis, provider: next });
            setProviderFallback(null);
            addMessage('system', `AI-провайдер переключён на ${next}.`);
          }}
          onCancel={() => setProviderFallback(null)}
        />
      )}

      {/* Settings Modal */}
      <JarvisSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Skill Creator Modal */}
      <SkillCreator
        isOpen={skillCreatorOpen}
        initialSkill={newSkillDraft}
        onClose={() => {
          setSkillCreatorOpen(false);
          setNewSkillDraft(null);
        }}
        onSave={(skill: Skill) => {
          addMessage('jarvis', `Навык "${skill.displayName}" успешно сохранён, сэр.`);
          setSkillCreatorOpen(false);
          setNewSkillDraft(null);
        }}
      />
    </>
  );
}
