import { Rnd } from 'react-rnd';
import { useCallback, useMemo } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * DraggableWidget — wraps any widget so it can be dragged around the workspace.
 * Position is persisted in settingsStore.widgetPositions.
 */

interface DraggableWidgetProps {
  id: string;
  initialX?: number;
  initialY?: number;
  /** Place widget in a corner or center when no saved position exists */
  anchor?: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'center';
  width?: number;
  height?: number;
  title?: string;
  children: React.ReactNode;
}

export default function DraggableWidget({
  id,
  initialX = 16,
  initialY = 16,
  anchor,
  width = 280,
  title,
  children,
}: DraggableWidgetProps) {
  const savedPos = useSettingsStore((s) => s.widgetPositions[id]);
  const setWidgetPosition = useSettingsStore((s) => s.setWidgetPosition);

  const resolveDefault = useMemo(() => {
    const parent = document.querySelector('[data-workspace]') as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    const margin = 16;

    switch (anchor) {
      case 'center':
        return {
          x: Math.max(margin, Math.round((pw - width) / 2)),
          y: Math.max(margin, Math.round((ph - 380) / 2)),
        };
      case 'top-right':
        return { x: pw - width - margin, y: margin };
      case 'bottom-right':
        return { x: pw - width - margin, y: ph - 340 - margin };
      case 'bottom-left':
        return { x: margin, y: ph - 340 - margin };
      default:
        return { x: initialX, y: initialY };
    }
  }, [anchor, initialX, initialY, width]);

  const position = savedPos ?? resolveDefault;

  const handleDragStop = useCallback(
    (_e: unknown, d: { x: number; y: number }) => {
      setWidgetPosition(id, { x: d.x, y: d.y });
    },
    [id, setWidgetPosition]
  );

  return (
    <Rnd
      size={{ width, height: 'auto' }}
      position={position}
      onDragStop={handleDragStop}
      bounds="parent"
      enableResizing={false}
      dragHandleClassName={title ? 'widget-drag-handle' : undefined}
      style={{
        zIndex: 5, // widgets live below windows (windows start at zIndex 1+ but are raised on focus)
        cursor: title ? 'default' : 'grab',
      }}
    >
      <div
        style={{
          background: 'transparent',
          borderRadius: 10,
          userSelect: 'none',
        }}
      >
        {title && (
          <div
            className="widget-drag-handle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 10px',
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid var(--border-color)',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'grab',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-primary)',
              letterSpacing: 1.5,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span>{title.toUpperCase()}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>⋮⋮</span>
          </div>
        )}
        <div
          style={{
            background: 'rgba(3, 6, 12, 0.65)',
            borderRadius: title ? '0 0 8px 8px' : 8,
            border: '1px solid var(--border-color)',
            borderTop: title ? 'none' : '1px solid var(--border-color)',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)',
          }}
        >
          {children}
        </div>
      </div>
    </Rnd>
  );
}
