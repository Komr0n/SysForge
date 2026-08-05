import { Rnd } from 'react-rnd';
import { useRef, useCallback } from 'react';

/**
 * DraggableWidget — wraps any widget so it can be dragged around the workspace.
 * Uses react-rnd (same library as windows) but styled as a compact widget.
 * Provides a small drag handle (the title bar at the top) so users can move it.
 */

interface DraggableWidgetProps {
  /** Stable id for this widget instance */
  id: string;
  /** Initial position */
  initialX?: number;
  initialY?: number;
  /** Widget width — defaults to 280 */
  width?: number;
  /** Optional title shown in the drag handle. If omitted, no handle bar is rendered
   *  and the whole widget body becomes the drag surface. */
  title?: string;
  children: React.ReactNode;
}

export default function DraggableWidget({
  id,
  initialX = 16,
  initialY = 16,
  width = 280,
  title,
  children,
}: DraggableWidgetProps) {
  // Track position via a ref so re-renders of the parent don't reset position
  const posRef = useRef({ x: initialX, y: initialY });

  const handleDragStop = useCallback((_e: any, d: { x: number; y: number }) => {
    posRef.current = { x: d.x, y: d.y };
  }, []);

  return (
    <Rnd
      key={id}
      size={{ width, height: 'auto' }}
      position={posRef.current}
      onDragStop={handleDragStop}
      bounds="parent"
      enableResizing={false}
      dragHandleClassName={title ? 'widget-drag-handle' : undefined}
      style={{
        zIndex: 5,
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
