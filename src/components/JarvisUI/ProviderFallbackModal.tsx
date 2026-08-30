// src/components/JarvisUI/ProviderFallbackModal.tsx
// Модал при недоступности AI-провайдера

interface ProviderFallbackModalProps {
  isOpen: boolean;
  currentProvider: 'local' | 'cloud';
  errorMessage?: string;
  onSwitch: () => void;
  onCancel: () => void;
}

export function ProviderFallbackModal({
  isOpen,
  currentProvider,
  errorMessage,
  onSwitch,
  onCancel,
}: ProviderFallbackModalProps) {
  if (!isOpen) return null;

  const fallbackProvider = currentProvider === 'local' ? 'облачный' : 'локальный';
  const currentProviderLabel = currentProvider === 'local' ? 'Локальный (Ollama)' : 'Облачный (OpenAI)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10001,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid #f59e0b',
        borderRadius: 8,
        padding: '24px 28px',
        maxWidth: 420,
        width: '90%',
        fontFamily: 'var(--font-mono)',
        boxShadow: '0 0 30px #f59e0b33',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>🔌</span>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            ПРОВАЙДЕР НЕДОСТУПЕН
          </span>
        </div>

        <div style={{ color: 'var(--text-primary)', fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
          <strong>{currentProviderLabel}</strong> не отвечает.
        </div>

        {errorMessage && (
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 16,
            wordBreak: 'break-word',
          }}>
            {errorMessage}
          </div>
        )}

        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 20 }}>
          Переключиться на <strong style={{ color: 'var(--text-primary)' }}>{fallbackProvider}</strong> провайдер?
          Автоматическое переключение запрещено.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '8px 0',
              background: 'transparent', border: '1px solid var(--border-color)',
              borderRadius: 4, color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              cursor: 'pointer', letterSpacing: 1,
            }}
          >
            ОТМЕНА
          </button>
          <button
            onClick={onSwitch}
            style={{
              flex: 1, padding: '8px 0',
              background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b',
              borderRadius: 4, color: '#f59e0b',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              cursor: 'pointer', letterSpacing: 1, fontWeight: 700,
            }}
          >
            ПЕРЕКЛЮЧИТЬ
          </button>
        </div>
      </div>
    </div>
  );
}
