import { useState, useEffect } from 'react';
import { Terminal, Settings, Maximize, Minimize, Wifi } from 'lucide-react';
import SettingsPanel from '../Settings/SettingsPanel';
import { useTauri } from '../../hooks/useTauri';

export default function StatusBar() {
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

    fetchVitals();
    const interval = setInterval(fetchVitals, 5000);
    return () => clearInterval(interval);
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

        {/* Center: Jarvis Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '2px 8px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 6px var(--accent-primary)' }} className="animate-pulse" />
          <span style={{ fontSize: 10, color: 'var(--text-primary)', letterSpacing: 1 }}>JARVIS: IDLE</span>
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
