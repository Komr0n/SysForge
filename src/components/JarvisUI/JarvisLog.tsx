// src/components/JarvisUI/JarvisLog.tsx
// HUD-лог последних команд (показывается под StatusBar)

import { useEffect, useRef } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'user' | 'jarvis' | 'system' | 'error';
  text: string;
  matchedVia?: 'embedding' | 'llm' | 'skill' | 'direct';
}

interface JarvisLogProps {
  entries: LogEntry[];
  maxEntries?: number;
  visible: boolean;
}

const TYPE_COLORS = {
  user:   'var(--accent-secondary)',
  jarvis: 'var(--accent-primary)',
  system: 'var(--text-muted)',
  error:  '#ef4444',
};

const TYPE_PREFIX = {
  user:   '▶',
  jarvis: '◀',
  system: '●',
  error:  '✕',
};

const VIA_BADGE: Record<string, string> = {
  embedding: '⚡',
  llm:       '🧠',
  skill:     '🔧',
  direct:    '→',
};

export function JarvisLog({ entries, maxEntries = 10, visible }: JarvisLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const displayEntries = entries.slice(-maxEntries);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  if (!visible || displayEntries.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 230,
        left: 220,
        right: 260,
        zIndex: 200,
        pointerEvents: 'none',
        padding: '0 12px',
      }}
    >
      <div style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        padding: '6px 10px',
        maxHeight: 180,
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        {displayEntries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              marginBottom: 3,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.4,
            }}
          >
            {/* Prefix */}
            <span style={{
              color: TYPE_COLORS[entry.type],
              flexShrink: 0,
              fontSize: 10,
              marginTop: 1,
            }}>
              {TYPE_PREFIX[entry.type]}
            </span>

            {/* Text */}
            <span style={{ color: TYPE_COLORS[entry.type], flex: 1, wordBreak: 'break-word' }}>
              {entry.text}
            </span>

            {/* Via badge */}
            {entry.matchedVia && (
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}
                title={`matched via: ${entry.matchedVia}`}>
                {VIA_BADGE[entry.matchedVia] ?? ''}
              </span>
            )}

            {/* Timestamp */}
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 9, marginTop: 1 }}>
              {entry.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
