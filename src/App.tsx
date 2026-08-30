import { useState, lazy, Suspense, useCallback } from 'react';
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
import { useWindowStore } from './store/windowStore';
import { useSettingsStore } from './store/settingsStore';
import { getVoiceService, JarvisState } from './lib/jarvis/voice-service';

import GlobeWidget from './components/widgets/GlobeWidget';
const ClockWidget = lazy(() => import('./components/widgets/ClockWidget'));

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);
  const [jarvisChatOpen, setJarvisChatOpen] = useState(false);
  const [jarvisSettingsOpen, setJarvisSettingsOpen] = useState(false);
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [hudLogs, setHudLogs] = useState<LogEntry[]>([]);

  const windows = useWindowStore((s) => s.windows);
  const widgets = useSettingsStore((s) => s.widgets);

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
    setHudLogs((prev) => [...prev.slice(-19), entry]);
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

      {/* Top eDEX-UI Status Bar with Jarvis HUD */}
      <ErrorBoundary fallback={null}>
        <StatusBar
          jarvisState={jarvisState}
          isChatOpen={jarvisChatOpen}
          onToggleChat={() => setJarvisChatOpen((v) => !v)}
          onToggleMic={handleToggleJarvisMic}
          onOpenJarvisSettings={() => setJarvisSettingsOpen(true)}
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

          {widgets.globe && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              {/* pointer-events re-enabled inside the widget itself; the wrapper
                  keeps the layer below windows (windows raise their z on focus) */}
              <div style={{ pointerEvents: 'auto' }}>
                <DraggableWidget id="globe" anchor="bottom-right" width={300} title="Globe">
                  <ErrorBoundary>
                    <Suspense fallback={<div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b' }}>LOADING GLOBE…</div>}>
                      <GlobeWidget />
                    </Suspense>
                  </ErrorBoundary>
                </DraggableWidget>
              </div>
            </div>
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

      {/* Jarvis HUD floating log overlay (bottom area) */}
      <ErrorBoundary fallback={null}>
        <JarvisLog entries={hudLogs} visible={!jarvisChatOpen} />
      </ErrorBoundary>

      {/* Jarvis slide-up / floating chat interface */}
      <ErrorBoundary fallback={null}>
        <JarvisChat
          isOpen={jarvisChatOpen}
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
