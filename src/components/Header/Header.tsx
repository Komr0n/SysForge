import { useState, useEffect } from 'react';
import { Terminal, Settings, Clock, Maximize, Minimize } from 'lucide-react';
import SettingsPanel from '../Settings/SettingsPanel';

export default function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Track fullscreen state changes (F11 / Esc)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[SysForge] Fullscreen toggle failed:', err);
    }
  };

  // Listen for F11 keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Terminal size={18} className="text-accent-primary" />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--accent-primary)',
              letterSpacing: 2,
              textShadow: '0 0 10px rgba(0, 255, 136, 0.3)',
            }}
          >
            SysForge
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <Clock size={14} />
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        {/* Fullscreen toggle */}
        <button
          className="neon-glow"
          onClick={toggleFullscreen}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: '4px 8px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            transition: 'all 0.2s',
          }}
          title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
        >
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>

        <button
          className="neon-glow"
          onClick={() => setSettingsOpen(true)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: '4px 10px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            transition: 'all 0.2s',
          }}
          title="Settings"
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </header>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
