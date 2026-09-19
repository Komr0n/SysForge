import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import BootScreen from './components/BootScreen/BootScreen';
import BackgroundEffects from './components/effects/BackgroundEffects';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import StatusBar from './components/StatusBar/StatusBar';
import Sidebar from './components/Sidebar/Sidebar';
import SideRail from './components/SideRail/SideRail';
import TelemetryBar from './components/TelemetryBar/TelemetryBar';
import Taskbar from './components/Taskbar/Taskbar';
import WindowFrame from './components/WindowFrame/WindowFrame';
import ThemeManager from './components/Settings/ThemeManager';
import DraggableWidget from './components/widgets/DraggableWidget';
import { JarvisChat } from './components/JarvisUI/JarvisChat';
import { JarvisLog, LogEntry } from './components/JarvisUI/JarvisLog';
import { JarvisSettings } from './components/JarvisUI/JarvisSettings';
import { JarvisOrb3D } from './components/JarvisUI/JarvisOrb3D';
import { useWindowStore } from './store/windowStore';
import { useSettingsStore } from './store/settingsStore';
import { getVoiceService, JarvisState } from './lib/jarvis/voice-service';

import { registerUICallbacks } from './lib/jarvis/tool-executor';
import { getThresholdWatcher } from './lib/jarvis/threshold-watcher';
const ClockWidget = lazy(() => import('./components/widgets/ClockWidget'));

const APP_ICONS: Record<string, string> = {
  ping: '📡', traceroute: '🛤️', 'port-scanner': '🔌', bandwidth: '📊',
  dns: '🌐', ssh: '💻', wol: '⚡', hash: '#️⃣', ssl: '🔒',
  password: '🔑', 'ip-intel': '🕵️', subnet: '🖧', jwt: '🎫', cve: '🐛',
  processes: '⚙️', 'system-overview': '💾', logs: '📋', 'file-hash': '🔍', 'app-scheduler': '⏱️', 'net-processes': '🌐',
  'api-tester': '🧪', formatter: '{ }', encoder: '🔢', regex: '🔤',
  snippets: '📝', diff: '↔️',
  // Patch v5
  terminal: '⬛', 'startup-manager': '🚀', 'disk-analyzer': '💿', 'duplicate-finder': '🗂️', 'file-explorer': '🔎',
};

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);
  const [jarvisChatOpen, setJarvisChatOpen] = useState(false);
  const [jarvisSettingsOpen, setJarvisSettingsOpen] = useState(false);
  const [jarvisLogOpen, setJarvisLogOpen] = useState(false);
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [hudLogs, setHudLogs] = useState<LogEntry[]>([]);

  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const widgets = useSettingsStore((s) => s.widgets);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setBackground = useSettingsStore((s) => s.setBackground);
  const jarvisConfig = useSettingsStore((s) => s.jarvis);

  useEffect(() => {
    if (jarvisConfig?.thresholds) {
      getThresholdWatcher(jarvisConfig.thresholds);
    }
  }, [jarvisConfig?.thresholds]);

  useEffect(() => {
    registerUICallbacks({
      openApp: (appId: string) => {
        if (APP_ICONS[appId]) {
          openWindow(appId, appId.toUpperCase(), APP_ICONS[appId], appId);
        }
      },
      closeApp: (appId: string) => {
        closeWindow(appId);
      },
      setTheme: (theme: string) => {
        setTheme(theme as any);
      },
      setBackground: (bg: string) => {
        setBackground(bg as any);
      },
    });
  }, [openWindow, closeWindow, setTheme, setBackground]);

  const handleToggleJarvisMic = useCallback(() => {
    const vs = getVoiceService();
    if (jarvisState === 'listening') {
      vs.stopListening();
      setJarvisState('idle');
    } else {
      setJarvisChatOpen(true);
      vs.startListening();
    }
  }, [jarvisState]);

  const handleNewLog = useCallback((entry: LogEntry) => {
    setHudLogs((prev) => [...prev.slice(-49), entry]);
  }, []);

  if (!bootComplete) {
    return <BootScreen onComplete={() => setBootComplete(true)} />;
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Dynamic CSS theme manager */}
      <ThemeManager />

      {/* Background effects layer */}
      <ErrorBoundary fallback={<div className="animated-gradient" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />}>
        <BackgroundEffects />
      </ErrorBoundary>

      {/* Ambient 3D Jarvis Orb (centered background layer) */}
      <ErrorBoundary fallback={null}>
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          pointerEvents: 'none',
          opacity: jarvisState === 'speaking' ? 0.95 : 0.65,
          transition: 'opacity 0.4s ease',
        }}>
          <JarvisOrb3D state={jarvisState} size={520} isFollowUp={false} />
        </div>
      </ErrorBoundary>

      {/* Top eDEX-UI Status Bar with Jarvis HUD */}
      <ErrorBoundary fallback={null}>
        <StatusBar
          jarvisState={jarvisState}
          isChatOpen={jarvisChatOpen}
          onToggleChat={() => setJarvisChatOpen((v) => !v)}
          onToggleMic={handleToggleJarvisMic}
          onOpenJarvisSettings={() => setJarvisSettingsOpen(true)}
          onToggleLog={() => setJarvisLogOpen((v) => !v)}
          isLogOpen={jarvisLogOpen}
        />
      </ErrorBoundary>

      {/* Center workspace section */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left navigation sidebar */}
        <ErrorBoundary fallback={null}>
          <Sidebar />
        </ErrorBoundary>

        {/* Desktop window area */}
        <div data-workspace style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Optional Ambient Clock & Globe */}
          {widgets.clock && (
            <ErrorBoundary fallback={null}>
              <DraggableWidget id="clock" anchor="top-right" width={280} title="Clock">
                <Suspense fallback={null}>
                  <ClockWidget />
                </Suspense>
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {/* Windows layer */}
          <ErrorBoundary>
            {Array.from(windows.values()).map((win) => (
              <WindowFrame key={win.id} window={win} />
            ))}
          </ErrorBoundary>
        </div>

        {/* Right side telemetry rail */}
        <ErrorBoundary fallback={null}>
          <SideRail />
        </ErrorBoundary>
      </div>

      {/* Bottom Telemetry Bar */}
      <ErrorBoundary fallback={null}>
        <TelemetryBar />
      </ErrorBoundary>

      {/* Bottom Taskbar */}
      <ErrorBoundary fallback={null}>
        <Taskbar />
      </ErrorBoundary>

      {/* Jarvis Log Modal (opened via button in StatusBar) */}
      <ErrorBoundary fallback={null}>
        <JarvisLog
          entries={hudLogs}
          visible={jarvisLogOpen}
          onClose={() => setJarvisLogOpen(false)}
        />
      </ErrorBoundary>

      {/* Jarvis slide-up / floating chat interface */}
      <ErrorBoundary fallback={null}>
        <JarvisChat
          isOpen={jarvisChatOpen}
          onOpen={() => setJarvisChatOpen(true)}
          onClose={() => setJarvisChatOpen(false)}
          onStateChange={setJarvisState}
          onNewLog={handleNewLog}
        />
      </ErrorBoundary>

      {/* Jarvis standalone settings dialog */}
      <ErrorBoundary fallback={null}>
        <JarvisSettings
          isOpen={jarvisSettingsOpen}
          onClose={() => setJarvisSettingsOpen(false)}
        />
      </ErrorBoundary>
    </div>
  );
}
