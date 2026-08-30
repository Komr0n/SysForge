// src/components/JarvisUI/JarvisChat.tsx
// Главный компонент чата Джарвиса с голосовым вводом, визуальным индикатором громкости,
// историей сессии и прямыми командами

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
import { Skill } from '../../lib/jarvis/sandbox';

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
  matchedVia?: 'direct' | 'embedding' | 'llm' | 'skill';
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

  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'init', role: 'jarvis', text: 'Всегда к вашим услугам, сэр. Скажите «Джарвис» или нажмите 🎤 для голосового ввода.', time: new Date(),
  }]);

  const [input, setInput] = useState('');
  const [jarvisState, setJarvisStateLocal] = useState<JarvisState>('idle');
  const [interimText, setInterimText] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillCreatorOpen, setSkillCreatorOpen] = useState(false);
  const [newSkillDraft, setNewSkillDraft] = useState<Skill | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [providerFallback, setProviderFallback] = useState<{
    currentProvider: 'local' | 'cloud'; errorMessage: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const addMessage = useCallback((
    role: 'user' | 'jarvis' | 'system',
    text: string,
    extra?: Partial<ChatMessage>
  ) => {
    const entry: ChatMessage = {
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      role,
      text,
      time: new Date(),
      ...extra,
    };
    setMessages((prev) => [...prev.slice(-49), entry]);
    return entry;
  }, []);

  const setJarvisState = useCallback((state: JarvisState) => {
    setJarvisStateLocal(state);
    onStateChange?.(state);
  }, [onStateChange]);

  // Регистрируем UI callbacks для tool-executor
  useEffect(() => {
    registerUICallbacks({
      openApp: (appId) => {
        const title = appId.charAt(0).toUpperCase() + appId.slice(1);
        const icon = APP_ICONS[appId] ?? '📦';
        if (APP_IDS.includes(appId)) {
          openWindow(appId, title, icon, appId);
        }
      },
      closeApp: (appId) => closeWindow(appId),
      setTheme: (theme) => setTheme(theme as Parameters<typeof setTheme>[0]),
      setBackground: (bg) => setBackground(bg as Parameters<typeof setBackground>[0]),
    });
  }, [openWindow, closeWindow, setTheme, setBackground]);

  // Обновляем оркестратор при изменении настроек
  useEffect(() => {
    getOrchestrator({
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

  const handleCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (processingRef.current) {
      console.warn('[JarvisChat] Command already processing');
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

      // TTS (JARVIS voice)
      if (result.response) {
        const vs = getVoiceService();
        await vs.speak(result.response);
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
    const vs = getVoiceService({
      ...jarvis.voice,
      cloudProviders: jarvis.cloudProviders,
    });

    const offState = vs.onStateChange((state) => {
      setJarvisState(state);
      if (state !== 'listening') setMicVolume(0);
    });

    const offTranscript = vs.onTranscript((text, isFinal) => {
      if (!isFinal) setInterimText(text);
      else setInterimText('');
    });

    const offCommand = vs.onCommand((text) => {
      setInterimText('');
      setMicVolume(0);
      handleCommandRef.current(text);
    });

    const offError = vs.onError((errText) => {
      addMessage('system', `⚠️ ${errText}`);
    });

    const offVolume = vs.onVolume((vol) => {
      setMicVolume(vol);
    });

    // Запускаем wake word если включён
    if (jarvis.voice.continuousWakeWord && jarvis.voice.sttEnabled) {
      vs.startWakeWordListening();
    }

    return () => {
      offState();
      offTranscript();
      offCommand();
      offError();
      offVolume();
    };
  }, [jarvis.voice, jarvis.cloudProviders, setJarvisState, addMessage]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    handleCommand(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleVoice = async () => {
    const vs = getVoiceService();
    if (jarvisState === 'listening') {
      await vs.stopListening();
      setJarvisState('idle');
    } else {
      await vs.startListening();
    }
  };

  const handleConfirm = async () => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    setJarvisState('executing');

    const result = await routeCommand('подтверждаю', {
      userConfirmedDestructive: true,
      pendingToolName: pendingConfirmation.toolName,
      pendingToolArgs: pendingConfirmation.args,
    });

    addMessage('jarvis', result.response);
    if (result.response) await getVoiceService().speak(result.response);
    else setJarvisState('idle');
  };

  const handleFallbackSwitch = () => {
    if (!providerFallback) return;
    const newProvider = providerFallback.currentProvider === 'local' ? 'cloud' : 'local';
    setJarvisConfig({ ...jarvis, provider: newProvider });
    setProviderFallback(null);
    addMessage('system', `Переключился на ${newProvider === 'local' ? 'локальный' : 'облачный'} провайдер.`);
  };

  if (!isOpen) return null;

  const msgColors = { user: 'var(--accent-secondary)', jarvis: 'var(--accent-primary)', system: 'var(--text-muted)' };

  // Индикатор громкости звука (0..10 делений)
  const volBars = Math.min(10, Math.round(micVolume / 10));

  return (
    <>
      {/* Chat panel */}
      <div style={{
        position: 'fixed',
        bottom: 230,
        right: 16,
        width: 350,
        height: 480,
        zIndex: 5000,
        background: 'rgba(8,10,16,0.94)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.65)',
        fontFamily: 'var(--font-mono)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <JarvisOrb state={jarvisState} size={16} />
          <span style={{ color: 'var(--accent-primary)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
            JARVIS
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {STATE_LABELS[jarvisState]}
          </span>
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
                {msg.matchedVia === 'llm' && (
                  <span style={{ color: '#c084fc', background: 'rgba(192,132,252,0.1)', padding: '0 4px', borderRadius: 2 }}>
                    ☁️ {msg.providerUsed || 'AI Cloud'}
                  </span>
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

        {/* Input */}
        <div style={{
          padding: '8px 10px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: 6, flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите команду (напр: открой калькулятор)..."
            disabled={jarvisState === 'thinking' || jarvisState === 'executing'}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '6px 10px',
              outline: 'none',
            }}
          />
          {/* Mic button */}
          <button
            onClick={toggleVoice}
            title={jarvisState === 'listening' ? 'Остановить запись' : 'Голосовой ввод'}
            style={{
              padding: '6px 8px',
              background: jarvisState === 'listening' ? 'rgba(0,255,136,0.25)' : 'transparent',
              border: `1px solid ${jarvisState === 'listening' ? '#00ff88' : 'var(--border-color)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
              color: jarvisState === 'listening' ? '#00ff88' : 'var(--text-muted)',
              boxShadow: jarvisState === 'listening' ? '0 0 10px rgba(0,255,136,0.4)' : undefined,
              transition: 'all 0.15s ease',
            }}
          >
            {jarvisState === 'listening' ? '⏹' : '🎤'}
          </button>
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || jarvisState === 'thinking' || jarvisState === 'executing'}
            style={{
              padding: '6px 10px',
              background: 'rgba(79,70,229,0.2)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 4,
              color: 'var(--accent-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ▶
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!pendingConfirmation}
        toolName={pendingConfirmation?.toolName ?? ''}
        description={pendingConfirmation?.description ?? ''}
        args={pendingConfirmation?.args ?? {}}
        onConfirm={handleConfirm}
        onCancel={() => { setPendingConfirmation(null); setJarvisState('idle'); }}
      />

      <ProviderFallbackModal
        isOpen={!!providerFallback}
        currentProvider={providerFallback?.currentProvider ?? 'local'}
        errorMessage={providerFallback?.errorMessage}
        onSwitch={handleFallbackSwitch}
        onCancel={() => setProviderFallback(null)}
      />

      <JarvisSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <SkillCreator
        isOpen={skillCreatorOpen}
        initialSkill={newSkillDraft}
        onSave={() => setSkillCreatorOpen(false)}
        onClose={() => setSkillCreatorOpen(false)}
      />
    </>
  );
}
