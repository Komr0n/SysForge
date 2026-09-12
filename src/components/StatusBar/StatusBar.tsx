import { useState, useEffect } from 'react';
import { Terminal, Settings, Maximize, Minimize, Wifi, Mic, MicOff, MessageSquare, Bot, FileText } from 'lucide-react';
import SettingsPanel from '../Settings/SettingsPanel';
import { useTauri } from '../../hooks/useTauri';
import { JarvisOrb, STATE_LABELS } from '../JarvisUI/JarvisOrb';
import type { JarvisState } from '../../lib/jarvis/voice-service';

interface StatusBarProps {
  jarvisState?: JarvisState;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onToggleMic?: () => void;
  onOpenJarvisSettings?: () => void;
  onToggleLog?: () => void;
  isLogOpen?: boolean;
}

export default function StatusBar({
  jarvisState = 'idle',
  isChatOpen = false,
  onToggleChat,
  onToggleMic,
  onOpenJarvisSettings,
  onToggleLog,
  isLogOpen = false,
}: StatusBarProps) {
  const { invoke, isAvailable } = useTauri();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cpuUsage, setCpuUsage] = useState<number>(12);
  const [ramUsage, setRamUsage] = useState<number>(38);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchVitals = async () => {
      // Skip polling when the app is hidden — saves IPC + CPU
      if (document.hidden) return;
      if (isAvailable) {
        try {
          const info = await invoke<any>('get_system_info');
          if (info) {
            setCpuUsage(info.cpu_usage);
            setRamUsage((info.used_memory_bytes / info.total_memory_bytes) * 100);
          }
        } catch (_) {}
      } else {
        setCpuUsage(15 + Math.random() * 20);
        setRamUsage(40 + Math.random() * 10);
      }
    };

    const onVisible = () => { if (!document.hidden) fetchVitals(); };
    document.addEventListener('visibilitychange', onVisible);
    fetchVitals();
    const interval = setInterval(fetchVitals, 5000);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAvailable]);

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
    } catch (_) {}
  };

  return (
    <>
      <header className="header" style={{ height: 38, padding: '0 12px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
        {/* Left: Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={15} className="text-accent-primary" />
          <span style={{ fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: 2, textShadow: '0 0 8px rgba(0,255,136,0.3)' }}>
            SYSFORGE
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 3, padding: '1px 4px' }}>
            HUD v1.0
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />

        {/* Center-Left: System Vitals Quick View */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
          <div>
            CPU: <span style={{ color: cpuUsage > 80 ? 'var(--danger)' : 'var(--accent-primary)' }}>{cpuUsage.toFixed(0)}%</span>
          </div>
          <div>
            RAM: <span style={{ color: 'var(--accent-secondary)' }}>{ramUsage.toFixed(0)}%</span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Center: Jarvis Interactive Indicator */}
        <div
          onClick={onToggleChat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: isChatOpen ? 'rgba(79,70,229,0.2)' : 'rgba(0,0,0,0.4)',
            border: `1px solid ${isChatOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            borderRadius: 14,
            padding: '2px 10px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          title="Нажмите для открытия чата Джарвиса"
        >
          <JarvisOrb state={jarvisState} size={14} />
          <span style={{ fontSize: 10, color: 'var(--text-primary)', letterSpacing: 1, fontWeight: 600 }}>
            JARVIS: {STATE_LABELS[jarvisState]}
          </span>
          <MessageSquare size={11} style={{ opacity: isChatOpen ? 1 : 0.6, color: 'var(--accent-primary)' }} />
        </div>

        <div style={{ flex: 1 }} />

        {/* Center-Right: Network Status & Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)' }}>
            <Wifi size={12} />
            <span style={{ fontSize: 10 }}>ONLINE</span>
          </div>
          <span style={{ color: 'var(--text-primary)', letterSpacing: 1 }}>
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Jarvis Log Toggle */}
          {onToggleLog && (
            <button
              onClick={onToggleLog}
              style={{
                background: isLogOpen ? 'rgba(79,70,229,0.2)' : 'transparent',
                border: `1px solid ${isLogOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                borderRadius: 4,
                padding: '3px 6px',
                color: isLogOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Журнал команд Джарвиса"
            >
              <FileText size={12} />
            </button>
          )}

          {/* Quick Jarvis Mic Trigger */}
          {onToggleMic && (
            <button
              onClick={onToggleMic}
              style={{
                background: jarvisState === 'listening' ? 'rgba(14,165,233,0.2)' : 'transparent',
                border: `1px solid ${jarvisState === 'listening' ? '#0ea5e9' : 'var(--border-color)'}`,
                borderRadius: 4,
                padding: '3px 6px',
                color: jarvisState === 'listening' ? '#0ea5e9' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title={jarvisState === 'listening' ? 'Остановить прослушивание' : 'Голосовой ввод Джарвиса'}
            >
              {jarvisState === 'listening' ? <MicOff size={12} /> : <Mic size={12} />}
            </button>
          )}

          {/* Jarvis AI Settings */}
          {onOpenJarvisSettings && (
            <button
              onClick={onOpenJarvisSettings}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '3px 6px',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Настройки ИИ Джарвиса"
            >
              <Bot size={12} />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '3px 6px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Toggle Fullscreen (F11)"
          >
            {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '3px 6px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Settings"
          >
            <Settings size={12} />
          </button>
        </div>
      </header>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
