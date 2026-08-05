import { useRef, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';
import { useWindowStore, WindowState } from '../../store/windowStore';
import { getAppComponent } from '../../apps/registry';

const HEADER_HEIGHT = 44;
const TASKBAR_HEIGHT = 40;

interface WindowFrameProps {
  window: WindowState;
}

export default function WindowFrame({ window: win }: WindowFrameProps) {
  const {
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    bringToFront,
    updatePosition,
    updateSize,
  } = useWindowStore();
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDragStop = useCallback(
    (_e: any, d: { x: number; y: number }) => {
      updatePosition(win.id, { x: d.x, y: d.y });
    },
    [win.id, updatePosition]
  );

  const handleResizeStop = useCallback(
    (_e: any, _dir: any, ref: HTMLElement, _delta: any, position: { x: number; y: number }) => {
      updateSize(win.id, { w: parseInt(ref.style.width), h: parseInt(ref.style.height) });
      updatePosition(win.id, position);
    },
    [win.id, updateSize, updatePosition]
  );

  const handleFocus = useCallback(() => {
    bringToFront(win.id);
  }, [win.id, bringToFront]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeWindow(win.id);
    },
    [win.id, closeWindow]
  );

  const handleMinimize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      minimizeWindow(win.id);
    },
    [win.id, minimizeWindow]
  );

  const handleMaximize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (win.isMaximized) {
        restoreWindow(win.id);
      } else {
        maximizeWindow(win.id);
      }
    },
    [win.id, win.isMaximized, maximizeWindow, restoreWindow]
  );

  // Double-click titlebar to toggle maximize
  const handleTitlebarDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (win.isMaximized) {
        restoreWindow(win.id);
      } else {
        maximizeWindow(win.id);
      }
    },
    [win.id, win.isMaximized, maximizeWindow, restoreWindow]
  );

  if (win.isMinimized) return null;

  // Use the saved position/size, but if maximized fill the workspace
  const isMax = win.isMaximized;
  const size = isMax
    ? { width: '100%', height: window.innerHeight - HEADER_HEIGHT - TASKBAR_HEIGHT }
    : { width: win.size.w, height: win.size.h };
  const position = isMax ? { x: 0, y: 0 } : win.position;

  return (
    <Rnd
      size={size}
      position={position}
      onDragStart={handleFocus}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={300}
      minHeight={200}
      bounds="parent"
      enableResizing={!isMax}
      disableDragging={isMax}
      dragHandleClassName="window-titlebar"
      style={{ zIndex: win.zIndex, position: 'absolute' }}
    >
      <div
        className="window-frame"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: isMax ? 0 : 8,
          overflow: 'hidden',
        }}
        onMouseDown={handleFocus}
      >
        {/* Title bar */}
        <div className="window-titlebar" onDoubleClick={handleTitlebarDblClick}>
          <div className="window-titlebar-left">
            <span className="text-accent-primary text-xs">{win.icon}</span>
            <span>{win.title}</span>
          </div>
          <div className="window-titlebar-right">
            <button className="window-btn" onClick={handleMinimize} title="Minimize">
              <Minus size={12} />
            </button>
            <button className="window-btn" onClick={handleMaximize} title={isMax ? 'Restore' : 'Maximize'}>
              {isMax ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            <button className="window-btn window-btn-close" onClick={handleClose} title="Close">
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="window-body"
          style={{
            height: 'calc(100% - 37px)',
            background: 'var(--bg-surface)',
          }}
        >
          {(() => {
            const AppComponent = getAppComponent(win.component);
            return <AppComponent />;
          })()}
        </div>
      </div>
    </Rnd>
  );
}
