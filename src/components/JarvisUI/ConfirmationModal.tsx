// src/components/JarvisUI/ConfirmationModal.tsx
// Модальное окно подтверждения деструктивных действий

import { useEffect } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  toolName: string;
  description: string;
  args: Record<string, unknown>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  toolName,
  description,
  args,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid #ef4444',
        borderRadius: 8,
        padding: '24px 28px',
        maxWidth: 440,
        width: '90%',
        fontFamily: 'var(--font-mono)',
        boxShadow: '0 0 30px #ef444444',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
            ТРЕБУЕТСЯ ПОДТВЕРЖДЕНИЕ
          </span>
        </div>

        {/* Description */}
        <div style={{ color: 'var(--text-primary)', fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
          {description}
        </div>

        {/* Tool info */}
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 4,
          padding: '8px 12px',
          fontSize: 11,
          marginBottom: 20,
        }}>
          <div style={{ color: '#ef4444', marginBottom: 4 }}>Инструмент: <strong>{toolName}</strong></div>
          {argsStr && (
            <div style={{ color: 'var(--text-muted)' }}>Параметры: {argsStr}</div>
          )}
        </div>

        {/* Warning */}
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 20 }}>
          ⚡ Это действие невозможно отменить. Вы уверены?
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            ОТМЕНА
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid #ef4444',
              borderRadius: 4,
              color: '#ef4444',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            ПОДТВЕРДИТЬ
          </button>
        </div>
      </div>
    </div>
  );
}
