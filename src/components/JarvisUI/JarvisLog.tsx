// src/components/JarvisUI/JarvisLog.tsx
// Модальное окно лога команд Джарвиса с поиском, перетаскиванием и прокруткой

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

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
  onClose: () => void;
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

export function JarvisLog({ entries, maxEntries = 50, visible, onClose }: JarvisLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Drag state
  const [pos, setPos] = useState({ x: 100, y: 60 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Debounce search query 200ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const filteredEntries = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return entries.slice(-maxEntries);
    }
    const q = debouncedQuery.toLowerCase();
    return entries.filter((e) => e.text.toLowerCase().includes(q)).slice(-maxEntries);
  }, [entries, debouncedQuery, maxEntries]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEntries]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
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
  }, [pos]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 'clamp(320px, 40vw, 600px)',
        height: 'clamp(200px, 35vh, 400px)',
        zIndex: 6000,
        background: 'rgba(8,10,16,0.96)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.65)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Header - draggable */}
      <div
        onMouseDown={handleDragStart}
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'grab',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--accent-primary)', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          📋 JARVIS LOG
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {entries.length} записей
        </span>
        <div style={{ flex: 1 }} />

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск..."
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 140,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '2px 6px',
            outline: 'none',
          }}
        />

        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
        >✕</button>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {filteredEntries.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 10, padding: 16, textAlign: 'center' }}>
            {entries.length === 0 ? 'Лог пуст. Начните диалог с Джарвисом.' : 'Ничего не найдено.'}
          </div>
        ) : (
          filteredEntries.map((entry) => (
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
                  flex: 1,
                }}
              >
                {entry.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
