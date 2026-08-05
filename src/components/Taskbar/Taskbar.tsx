import { useState, useEffect } from 'react';
import { useWindowStore } from '../../store/windowStore';

export default function Taskbar() {
  const windows = useWindowStore((s) => s.windows);
  const bringToFront = useWindowStore((s) => s.bringToFront);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const openWindows = Array.from(windows.values()).filter((w) => !w.isMinimized);
  const minimizedWindows = Array.from(windows.values()).filter((w) => w.isMinimized);

  const handleClick = (id: string, isMinimized: boolean) => {
    if (isMinimized) {
      restoreWindow(id);
    } else {
      bringToFront(id);
    }
  };

  return (
    <div className="taskbar">
      {/* Quick-launch area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8, borderRight: '1px solid var(--border-color)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
          SYSFORGE
        </span>
      </div>

      {/* Minimized windows */}
      {minimizedWindows.map((win) => (
        <div
          key={win.id}
          className="taskbar-item"
          onClick={() => handleClick(win.id, true)}
          title={win.title}
        >
          <span style={{ fontSize: 10 }}>{win.icon || '📋'}</span>
          <span className="truncate">{win.title}</span>
        </div>
      ))}

      {/* Open windows */}
      {openWindows.map((win) => (
        <div
          key={win.id}
          className="taskbar-item active"
          onClick={() => handleClick(win.id, false)}
          title={win.title}
        >
          <span style={{ fontSize: 10 }}>{win.icon || '📋'}</span>
          <span className="truncate">{win.title}</span>
        </div>
      ))}

      <div style={{ flex: 1 }} />

      {/* System tray area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        <span>{windows.size} window{windows.size !== 1 ? 's' : ''}</span>
        <span style={{ color: 'var(--border-color)' }}>│</span>
        <span>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
    </div>
  );
}
