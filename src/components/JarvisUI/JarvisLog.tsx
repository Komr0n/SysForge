// src/components/JarvisUI/JarvisLog.tsx
// HUD-лог последних команд (показывается под StatusBar)

import { useEffect, useRef } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'user' | 'jarvis' | 'system' | 'error';
  text: string;
  matchedVia?: 'embedding' | 'llm' | 'skill' | 'direct' | 'keyword';
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
  keyword:   '🔤',
};

export function JarvisLog({ entries, maxEntries = 3, visible }: JarvisLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const recent = entries.slice(-maxEntries);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  if (!visible || recent.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 38,
        left: 0,
        right: 0,
        zIndex: 4000,
        background: 'rgba(8,10,16,0.92)',
        borderBottom: '1px solid var(--border-color)',
        padding: '3px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        maxHeight: 70,
        overflowY: 'hidden',
        pointerEvents: 'none',
        backdropFilter: 'blur(4px)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {recent.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            lineHeight: '16px',
            color: TYPE_COLORS[entry.type],
            opacity: 0.9,
          }}
        >
          {/* Time */}
          <span style={{ color: 'var(--text-muted)', fontSize: 9, flexShrink: 0 }}>
            {entry.timestamp.toLocaleTimeString('en-US', { hour12: false })}
          </span>

          {/* Type prefix */}
          <span style={{ flexShrink: 0, fontWeight: 700 }}>
            {TYPE_PREFIX[entry.type]}
          </span>

          {/* Matched via badge */}
          {entry.matchedVia && (
            <span
              style={{
                fontSize: 8,
                padding: '0 3px',
                border: '1px solid currentColor',
                borderRadius: 2,
                flexShrink: 0,
                opacity: 0.7,
              }}
            >
              {VIA_BADGE[entry.matchedVia] || entry.matchedVia}
            </span>
          )}

          {/* Text */}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '80vw',
            }}
          >
            {entry.text}
          </span>
        </div>
      ))}
    </div>
  );
}
