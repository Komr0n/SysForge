// src/components/JarvisUI/JarvisSettings.tsx
// Настройки AI-провайдеров с пулом API и авто-переключением при исчерпании лимитов

import { useState, useEffect } from 'react';
import { useSettingsStore, CloudProviderProfile } from '../../store/settingsStore';
import { getOrchestrator } from '../../lib/jarvis/orchestrator';
import { isSpeechRecognitionSupported, isSpeechSynthesisSupported } from '../../lib/jarvis/voice-service';
import { auditLog } from '../../lib/jarvis/audit-logger';
import { skillRegistry } from '../../lib/jarvis/skill-registry';
import { SkillCreator } from './SkillCreator';
import { Skill, sandboxLabel } from '../../lib/jarvis/sandbox';
import { routingDiagnostics } from '../../lib/jarvis/hybrid-router';

interface JarvisSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--border-color)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '5px 9px',
  width: '100%',
  boxSizing: 'border-box',
};

type Tab = 'provider' | 'voice' | 'thresholds' | 'skills' | 'audit' | 'diagnostics';

export function JarvisSettings({ isOpen, onClose }: JarvisSettingsProps) {
  const { jarvis, setJarvisConfig, updateCloudProvider } = useSettingsStore((s) => ({
    jarvis: s.jarvis,
    setJarvisConfig: s.setJarvisConfig,
    updateCloudProvider: s.updateCloudProvider,
  }));

  const [tab, setTab] = useState<Tab>('provider');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [auditEntries, setAuditEntries] = useState<ReturnType<typeof auditLog.getMemoryLog>>([]);
  const [skillCreatorOpen, setSkillCreatorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(jarvis.activeCloudProviderId || 'gemini');

  useEffect(() => {
    if (!isOpen) return;
    const loadVoices = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    skillRegistry.listSkills().then(setSkills);
    setAuditEntries(auditLog.getMemoryLog());

    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const cfg = jarvis;
  const providers = cfg.cloudProviders || [];
  const activeProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];

  const update = (patch: Partial<typeof cfg>) => setJarvisConfig({ ...cfg, ...patch });
  const updateLocal = (patch: Partial<typeof cfg.local>) => update({ local: { ...cfg.local, ...patch } });
  const updateVoice = (patch: Partial<typeof cfg.voice>) => update({ voice: { ...cfg.voice, ...patch } });

  const testProvider = async (profile: CloudProviderProfile) => {
    setTestingId(profile.id);
    const orch = getOrchestrator({
      provider: 'cloud',
      local: cfg.local,
      cloud: { apiKey: profile.apiKey, model: profile.model, baseUrl: profile.baseUrl },
      cloudProviders: providers,
      activeCloudProviderId: profile.id,
    });
    const result = await orch.checkAvailability(profile);
    setTestResults((prev) => ({
      ...prev,
      [profile.id]: {
        ok: result.available,
        msg: result.error ?? (result.available ? 'Соединение успешно' : 'Недоступен'),
      },
    }));
    setTestingId(null);
  };

  const testLocalOllama = async () => {
    setTestingId('local');
    const orch = getOrchestrator({
      provider: 'local',
      local: cfg.local,
      cloud: cfg.cloud,
    });
    const result = await orch.checkAvailability();
    setTestResults((prev) => ({
      ...prev,
      local: {
        ok: result.available,
        msg: result.error ?? (result.available ? 'Ollama доступен' : 'Ollama не отвечает'),
      },
    }));
    setTestingId(null);
  };

  const deleteSkill = async (id: string) => {
    if (!confirm(`Удалить навык "${id}"?`)) return;
    await skillRegistry.deleteSkill(id);
    setSkills(await skillRegistry.listSkills());
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'provider', label: '🧠 ИИ Провайдеры' },
    { id: 'voice', label: '🎙️ Голос' },
    { id: 'skills', label: '🔧 Навыки' },
    { id: 'audit', label: '📋 Аудит' },
    { id: 'diagnostics', label: '📊 Диагностика' },
  ];

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          width: '94%', maxWidth: 680, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 18px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            background: 'rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 14 }}>⚙️</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
              НАСТРОЙКИ ДЖАРВИСА
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
            }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border-color)',
            flexShrink: 0, background: 'rgba(0,0,0,0.2)',
          }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '9px 4px', fontSize: 11,
                  background: tab === t.id ? 'rgba(79,70,229,0.15)' : 'transparent',
                  border: 'none',
                  borderBottom: tab === t.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: tab === t.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  fontWeight: tab === t.id ? 700 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

            {/* ── Provider Tab ── */}
            {tab === 'provider' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Main mode switch: Local vs Cloud */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['local', 'cloud'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => update({ provider: p })}
                      style={{
                        flex: 1, padding: '8px 0', fontSize: 11,
                        background: cfg.provider === p ? 'rgba(79,70,229,0.25)' : 'rgba(0,0,0,0.3)',
                        border: `1px solid ${cfg.provider === p ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        borderRadius: 4, color: cfg.provider === p ? 'var(--accent-primary)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', cursor: 'pointer', fontWeight: cfg.provider === p ? 700 : 400,
                      }}
                    >
                      {p === 'local' ? '💻 Локальный ИИ (Ollama)' : '☁️ Облачные API (Gemini / Groq / OpenAI)'}
                    </button>
                  ))}
                </div>

                {cfg.provider === 'local' ? (
                  /* Local Ollama */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600 }}>ЛОКАЛЬНЫЙ OLLAMA СЕРВЕР</div>
                    <Field label="Ollama Base URL">
                      <input style={inputStyle} value={cfg.local.ollamaUrl}
                        onChange={(e) => updateLocal({ ollamaUrl: e.target.value })} />
                    </Field>
                    <Field label="Модель (llama3.2, qwen2.5-coder, mistral, deepseek-r1)">
                      <input style={inputStyle} value={cfg.local.model}
                        onChange={(e) => updateLocal({ model: e.target.value })} />
                    </Field>
                    <div>
                      <button
                        onClick={testLocalOllama}
                        disabled={testingId === 'local'}
                        style={{
                          padding: '6px 14px', background: 'rgba(79,70,229,0.15)',
                          border: '1px solid var(--accent-primary)', borderRadius: 4,
                          color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)',
                          fontSize: 11, cursor: testingId === 'local' ? 'wait' : 'pointer',
                        }}
                      >
                        {testingId === 'local' ? '⏳ Проверка...' : '⚡ Проверить Ollama'}
                      </button>
                      {testResults.local && (
                        <span style={{ marginLeft: 10, fontSize: 11, color: testResults.local.ok ? '#10b981' : '#ef4444' }}>
                          {testResults.local.ok ? '✓ ' : '✗ '}{testResults.local.msg}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Cloud Provider Pool with Fallback */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Auto-Fallback toggle banner */}
                    <div style={{
                      background: 'rgba(14, 165, 233, 0.08)',
                      border: '1px solid rgba(14, 165, 233, 0.3)',
                      borderRadius: 6,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                      <input
                        type="checkbox"
                        id="autoFallback"
                        checked={cfg.autoFallbackOnRateLimit ?? true}
                        onChange={(e) => update({ autoFallbackOnRateLimit: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="autoFallback" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>
                        <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Автоматический Fallback:</span> если на одном API закончится лимит (429 / Quota Exceeded), Джарвис мгновенно переключится на следующий доступный провайдер.
                      </label>
                    </div>

                    {/* Providers selector list */}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                      Облачные провайдеры (выберите для настройки и приоритета):
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {providers.map((p) => {
                        const isSelected = p.id === selectedProviderId;
                        const isPrimary = p.id === cfg.activeCloudProviderId;
                        const hasKey = p.apiKey.trim().length > 0;
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedProviderId(p.id);
                              update({ activeCloudProviderId: p.id });
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 6,
                              border: `1px solid ${isSelected ? 'var(--accent-primary)' : isPrimary ? '#0ea5e9' : 'var(--border-color)'}`,
                              background: isSelected ? 'rgba(0,255,136,0.1)' : 'rgba(0,0,0,0.3)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                                {p.name}
                              </span>
                              {isPrimary && (
                                <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(14,165,233,0.2)', color: '#0ea5e9', border: '1px solid #0ea5e988' }}>
                                  PRIORITY
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: hasKey ? '#10b981' : 'var(--text-muted)' }}>
                              {hasKey ? '● Ключ задан' : '○ Ключ не задан'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Active Provider Configuration Card */}
                    {activeProvider && (
                      <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--accent-primary)', fontSize: 12, fontWeight: 700 }}>
                            Настройка: {activeProvider.name}
                          </span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={activeProvider.enabled}
                              onChange={(e) => updateCloudProvider(activeProvider.id, { enabled: e.target.checked })}
                            />
                            Включен в пул fallback
                          </label>
                        </div>

                        {activeProvider.description && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {activeProvider.description}
                          </div>
                        )}

                        <Field label="API Ключ">
                          <input
                            style={inputStyle}
                            type="password"
                            value={activeProvider.apiKey}
                            onChange={(e) => updateCloudProvider(activeProvider.id, { apiKey: e.target.value })}
                            placeholder={activeProvider.id === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                          />
                        </Field>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                          <Field label="Base URL">
                            <input
                              style={inputStyle}
                              value={activeProvider.baseUrl}
                              onChange={(e) => updateCloudProvider(activeProvider.id, { baseUrl: e.target.value })}
                            />
                          </Field>
                          <Field label="Модель">
                            <input
                              style={inputStyle}
                              value={activeProvider.model}
                              onChange={(e) => updateCloudProvider(activeProvider.id, { model: e.target.value })}
                            />
                          </Field>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          <button
                            onClick={() => testProvider(activeProvider)}
                            disabled={testingId === activeProvider.id || !activeProvider.apiKey}
                            style={{
                              padding: '6px 14px',
                              background: 'rgba(79,70,229,0.18)',
                              border: '1px solid var(--accent-primary)',
                              borderRadius: 4,
                              color: 'var(--accent-primary)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              cursor: testingId === activeProvider.id ? 'wait' : !activeProvider.apiKey ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {testingId === activeProvider.id ? '⏳ Проверка...' : `⚡ Проверить ${activeProvider.name}`}
                          </button>
                          {testResults[activeProvider.id] && (
                            <span style={{
                              fontSize: 11,
                              color: testResults[activeProvider.id].ok ? '#10b981' : '#ef4444',
                            }}>
                              {testResults[activeProvider.id].ok ? '✓ ' : '✗ '}{testResults[activeProvider.id].msg}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Common NLU Parameters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                  <Field label={`Порог embedding confidence: ${cfg.confidenceThreshold}`}>
                    <input type="range" min={0.5} max={0.99} step={0.01}
                      value={cfg.confidenceThreshold}
                      onChange={(e) => update({ confidenceThreshold: parseFloat(e.target.value) })}
                      style={{ width: '100%' }} />
                  </Field>

                  <Field label="Fallback-режим между Local и Cloud">
                    <select style={inputStyle} value={cfg.fallbackMode}
                      onChange={(e) => update({ fallbackMode: e.target.value as 'auto' | 'manual' })}>
                      <option value="manual">manual — спрашивать перед переключением между Local и Cloud</option>
                      <option value="auto">auto — переключать автоматически</option>
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {/* ── Voice Tab ── */}
            {tab === 'voice' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* STT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1 }}>РАСПОЗНАВАНИЕ РЕЧИ (STT)</div>
                  {!isSpeechRecognitionSupported && (
                    <div style={{ color: '#f59e0b', fontSize: 11 }}>
                      ⚠️ Web Speech API не поддерживается текущим браузером. Используйте Chrome или Edge.
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.voice.sttEnabled}
                      onChange={(e) => updateVoice({ sttEnabled: e.target.checked })} />
                    Включить голосовой ввод (STT)
                  </label>
                  <Field label="Язык распознавания">
                    <select style={inputStyle} value={cfg.voice.language}
                      onChange={(e) => updateVoice({ language: e.target.value })}>
                      <option value="ru-RU">Русский (ru-RU)</option>
                      <option value="en-US">English (en-US)</option>
                    </select>
                  </Field>
                  <Field label="Wake word">
                    <input style={inputStyle} value={cfg.voice.wakeWord}
                      onChange={(e) => updateVoice({ wakeWord: e.target.value })}
                      placeholder="джарвис" />
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.voice.continuousWakeWord}
                      onChange={(e) => updateVoice({ continuousWakeWord: e.target.checked })} />
                    Непрерывное фоновое прослушивание (wake word)
                  </label>
                </div>

                {/* TTS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1 }}>СИНТЕЗ РЕЧИ (TTS)</div>
                  {!isSpeechSynthesisSupported && (
                    <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠️ Speech Synthesis не поддерживается.</div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.voice.ttsEnabled}
                      onChange={(e) => updateVoice({ ttsEnabled: e.target.checked })} />
                    Включить голосовые ответы Джарвиса (TTS)
                  </label>
                  <Field label="Голос">
                    <select style={inputStyle} value={cfg.voice.ttsVoice ?? ''}
                      onChange={(e) => updateVoice({ ttsVoice: e.target.value })}>
                      <option value="">— по умолчанию —</option>
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Скорость речи: ${cfg.voice.ttsRate.toFixed(1)}`}>
                    <input type="range" min={0.5} max={2} step={0.1} value={cfg.voice.ttsRate}
                      onChange={(e) => updateVoice({ ttsRate: parseFloat(e.target.value) })}
                      style={{ width: '100%' }} />
                  </Field>
                  <Field label={`Тональность: ${cfg.voice.ttsPitch.toFixed(1)}`}>
                    <input type="range" min={0} max={2} step={0.1} value={cfg.voice.ttsPitch}
                      onChange={(e) => updateVoice({ ttsPitch: parseFloat(e.target.value) })}
                      style={{ width: '100%' }} />
                  </Field>
                </div>

                {/* Follow-up Listening Window */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1 }}>ОКНО ОЖИДАНИЯ ПРОДОЛЖЕНИЯ (FOLLOW-UP)</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.voice.followUpListening ?? true}
                      onChange={(e) => updateVoice({ followUpListening: e.target.checked })} />
                    Слушать продолжение после выполнения команды (без слова "Джарвис")
                  </label>
                  <Field label={`Длительность ожидания: ${((cfg.voice.followUpWindowMs ?? 4000) / 1000).toFixed(1)} сек`}>
                    <input type="range" min={2000} max={8000} step={500} value={cfg.voice.followUpWindowMs ?? 4000}
                      onChange={(e) => updateVoice({ followUpWindowMs: parseInt(e.target.value, 10) })}
                      style={{ width: '100%' }} />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Thresholds Tab ── */}
            {tab === 'thresholds' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: 1 }}>
                  ПОРОГОВЫЕ ГОЛОСОВЫЕ ПРЕДУПРЕЖДЕНИЯ СИСТЕМЫ
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cfg.thresholds?.enabled ?? true}
                    onChange={(e) => update({
                      thresholds: {
                        ...(cfg.thresholds || { cpuPercent: 90, ramPercent: 90, diskPercent: 90, cooldownMs: 300000 }),
                        enabled: e.target.checked,
                      },
                    })}
                  />
                  Включить автоматический мониторинг перегрузки CPU / RAM / Диска
                </label>

                <Field label={`Порог загрузки CPU: ${cfg.thresholds?.cpuPercent ?? 90}%`}>
                  <input
                    type="range"
                    min={50}
                    max={99}
                    step={5}
                    value={cfg.thresholds?.cpuPercent ?? 90}
                    onChange={(e) => update({
                      thresholds: {
                        ...(cfg.thresholds || { ramPercent: 90, diskPercent: 90, cooldownMs: 300000, enabled: true }),
                        cpuPercent: parseInt(e.target.value, 10),
                      },
                    })}
                    style={{ width: '100%' }}
                  />
                </Field>

                <Field label={`Порог заполнения RAM: ${cfg.thresholds?.ramPercent ?? 90}%`}>
                  <input
                    type="range"
                    min={50}
                    max={99}
                    step={5}
                    value={cfg.thresholds?.ramPercent ?? 90}
                    onChange={(e) => update({
                      thresholds: {
                        ...(cfg.thresholds || { cpuPercent: 90, diskPercent: 90, cooldownMs: 300000, enabled: true }),
                        ramPercent: parseInt(e.target.value, 10),
                      },
                    })}
                    style={{ width: '100%' }}
                  />
                </Field>

                <Field label={`Порог заполнения диска: ${cfg.thresholds?.diskPercent ?? 90}%`}>
                  <input
                    type="range"
                    min={50}
                    max={99}
                    step={5}
                    value={cfg.thresholds?.diskPercent ?? 90}
                    onChange={(e) => update({
                      thresholds: {
                        ...(cfg.thresholds || { cpuPercent: 90, ramPercent: 90, cooldownMs: 300000, enabled: true }),
                        diskPercent: parseInt(e.target.value, 10),
                      },
                    })}
                    style={{ width: '100%' }}
                  />
                </Field>

                <Field label={`Интервал повтора предупреждений: ${Math.round((cfg.thresholds?.cooldownMs ?? 300000) / 60000)} мин`}>
                  <input
                    type="range"
                    min={60000}
                    max={900000}
                    step={60000}
                    value={cfg.thresholds?.cooldownMs ?? 300000}
                    onChange={(e) => update({
                      thresholds: {
                        ...(cfg.thresholds || { cpuPercent: 90, ramPercent: 90, diskPercent: 90, enabled: true }),
                        cooldownMs: parseInt(e.target.value, 10),
                      },
                    })}
                    style={{ width: '100%' }}
                  />
                </Field>
              </div>
            )}

            {/* ── Skills Tab ── */}
            {tab === 'skills' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>РЕЕСТР НАВЫКОВ ДЖАРВИСА</span>
                  <div style={{ flex: 1 }} />
                  <label
                    style={{
                      padding: '5px 10px', background: 'transparent',
                      border: '1px solid var(--border-color)', borderRadius: 4,
                      color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                      fontSize: 11, cursor: 'pointer',
                    }}
                    title="Импортировать навык из JSON"
                  >
                    📥 Импорт
                    <input
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const text = await file.text();
                          try {
                            await skillRegistry.importSkillFromContent(text);
                            const list = await skillRegistry.listSkills();
                            setSkills(list);
                          } catch (err) {
                            alert((err as Error).message);
                          }
                        }
                      }}
                    />
                  </label>
                  <button
                    onClick={() => { setEditingSkill(null); setSkillCreatorOpen(true); }}
                    style={{
                      padding: '5px 12px', background: 'rgba(79,70,229,0.15)',
                      border: '1px solid var(--accent-primary)', borderRadius: 4,
                      color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)',
                      fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    + Создать навык
                  </button>
                </div>

                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>ВСТРОЕННЫЕ НАВЫКИ</div>
                {skillRegistry.getBuiltinSkills().map((s) => (
                  <SkillRow key={s.id} skill={s} onEdit={undefined} onDelete={undefined} />
                ))}

                <div style={{ color: 'var(--text-muted)', fontSize: 10, margin: '14px 0 6px' }}>ВАШИ НАВЫКИ</div>
                {skills.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Навыков пока нет. Создайте первый!</div>
                ) : (
                  skills.map((s) => (
                    <SkillRow
                      key={s.id} skill={s}
                      onEdit={() => { setEditingSkill(s); setSkillCreatorOpen(true); }}
                      onDelete={() => deleteSkill(s.id).then(() => skillRegistry.listSkills().then(setSkills))}
                    />
                  ))
                )}
              </div>
            )}

            {/* ── Audit Tab ── */}
            {tab === 'audit' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>ЖУРНАЛ АУДИТА ДЕЙСТВИЙ ({auditEntries.length})</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => { auditLog.clear(); setAuditEntries([]); }}
                    style={{
                      padding: '4px 10px', background: 'transparent',
                      border: '1px solid #ef4444', borderRadius: 3,
                      color: '#ef4444', fontFamily: 'var(--font-mono)',
                      fontSize: 10, cursor: 'pointer',
                    }}
                  >
                    Очистить
                  </button>
                </div>
                {auditEntries.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Журнал пуст.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[...auditEntries].reverse().map((e, i) => (
                      <div key={i} style={{
                        fontSize: 10, padding: '6px 8px',
                        background: e.status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.25)',
                        borderRadius: 3, border: '1px solid var(--border-color)',
                      }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: e.status === 'completed' ? '#10b981' : e.status === 'error' ? '#ef4444' : '#f59e0b' }}>
                            {e.status === 'completed' ? '✓' : e.status === 'error' ? '✗' : '⏳'}
                          </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{e.toolName}</strong>
                          <span style={{ color: 'var(--text-muted)' }}>via: {e.matchedVia}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {new Date(e.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {e.error && <div style={{ color: '#ef4444', marginTop: 2 }}>{e.error}</div>}
                        {e.result && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{e.result.slice(0, 100)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === 'diagnostics' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
                    Диагностика каскада роутера (Direct → Fuzzy → Embedding → LLM)
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Всего запросов: {routingDiagnostics.length}
                  </span>
                </div>

                {routingDiagnostics.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: '30px 10px' }}>
                    Запросов ещё не поступало. Произнесите или отправьте команду Джарвису.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '60vh', overflowY: 'auto' }}>
                    {routingDiagnostics.map((d, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 10.5,
                          padding: '8px 10px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 4,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#00f0ff', fontWeight: 600 }}>«{d.input}»</span>
                          <span style={{ color: 'var(--text-muted)' }}>{d.timestamp}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 6, borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
                          <div>
                            1. Direct: {d.direct?.matched ? <span style={{ color: '#10b981' }}>✓ Совпало ({d.direct.toolName})</span> : <span style={{ color: 'var(--text-muted)' }}>— нет</span>}
                          </div>
                          <div>
                            2. Fuzzy: {d.fuzzy?.matched ? (
                              <span style={{ color: (d.fuzzy.score >= 85 ? '#10b981' : d.fuzzy.score >= 70 ? '#f59e0b' : 'var(--text-muted)') }}>
                                {d.fuzzy.skillId} ({d.fuzzy.score.toFixed(1)}%) {d.fuzzy.phrase && `~ «${d.fuzzy.phrase}»`}
                              </span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>— нет</span>}
                          </div>
                          <div>
                            3. Embedding: {d.embedding?.matched ? (
                              <span style={{ color: (d.embedding.confidence >= 0.70 ? '#10b981' : '#f59e0b') }}>
                                {d.embedding.skillId} ({(d.embedding.confidence * 100).toFixed(1)}%)
                              </span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>— нет</span>}
                          </div>
                        </div>

                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Выполнено через:</span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontSize: 9.5,
                              fontWeight: 700,
                              background:
                                d.chosenTier === 'direct'
                                  ? 'rgba(16,185,129,0.2)'
                                  : d.chosenTier.startsWith('fuzzy')
                                  ? 'rgba(0,240,255,0.2)'
                                  : d.chosenTier === 'embedding'
                                  ? 'rgba(139,92,246,0.2)'
                                  : 'rgba(245,158,11,0.2)',
                              color:
                                d.chosenTier === 'direct'
                                  ? '#10b981'
                                  : d.chosenTier.startsWith('fuzzy')
                                  ? '#00f0ff'
                                  : d.chosenTier === 'embedding'
                                  ? '#a78bfa'
                                  : '#f59e0b',
                            }}
                          >
                            {d.chosenTier.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SkillCreator
        isOpen={skillCreatorOpen}
        initialSkill={editingSkill}
        onSave={() => { setSkillCreatorOpen(false); skillRegistry.listSkills().then(setSkills); }}
        onClose={() => setSkillCreatorOpen(false)}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SkillRow({
  skill, onEdit, onDelete,
}: {
  skill: Skill;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const handleExport = () => {
    const data = JSON.stringify(skill, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', marginBottom: 4,
      border: '1px solid var(--border-color)', borderRadius: 4,
      background: 'rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontSize: 10 }}>{sandboxLabel(skill.sandbox)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 11 }}>{skill.displayName}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {skill.id} · {skill.steps.length} шаг(а/ов) · выполнен {skill.executionCount} раз
        </div>
      </div>
      <button onClick={handleExport} title="Экспортировать навык в JSON" style={{
        padding: '3px 8px', background: 'transparent',
        border: '1px solid var(--border-color)', borderRadius: 3,
        color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        fontSize: 10, cursor: 'pointer',
      }}>💾</button>
      {onEdit && (
        <button onClick={onEdit} style={{
          padding: '3px 8px', background: 'transparent',
          border: '1px solid var(--border-color)', borderRadius: 3,
          color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          fontSize: 10, cursor: 'pointer',
        }}>✏️</button>
      )}
      {onDelete && (
        <button onClick={onDelete} style={{
          padding: '3px 8px', background: 'transparent',
          border: '1px solid #ef444455', borderRadius: 3,
          color: '#ef4444', fontFamily: 'var(--font-mono)',
          fontSize: 10, cursor: 'pointer',
        }}>🗑️</button>
      )}
    </div>
  );
}
