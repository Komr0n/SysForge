import { useState } from 'react';
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
import GlobeWidget from './components/widgets/GlobeWidget';
import ClockWidget from './components/widgets/ClockWidget';
import DraggableWidget from './components/widgets/DraggableWidget';
import { useWindowStore } from './store/windowStore';
import { useSettingsStore } from './store/settingsStore';

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);
  const windows = useWindowStore((s) => s.windows);
  const widgets = useSettingsStore((s) => s.widgets);

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

      {/* Top eDEX-UI Status Bar */}
      <StatusBar />

      {/* Center workspace section */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left navigation sidebar */}
        <Sidebar />

        {/* Desktop window area */}
        <div data-workspace style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Optional Ambient Clock & Globe */}
          {widgets.clock && (
            <DraggableWidget id="clock" anchor="top-right" width={220} title="Clock">
              <ClockWidget />
            </DraggableWidget>
          )}

          {widgets.globe && (
            <DraggableWidget id="globe" anchor="bottom-right" width={300} title="Globe">
              <ErrorBoundary>
                <GlobeWidget />
              </ErrorBoundary>
            </DraggableWidget>
          )}

          {/* Windows layer */}
          <ErrorBoundary>
            {Array.from(windows.values()).map((win) => (
              <WindowFrame key={win.id} window={win} />
            ))}
          </ErrorBoundary>
        </div>

        {/* Right side telemetry rail */}
        <SideRail />
      </div>

      {/* Bottom Telemetry Bar */}
      <TelemetryBar />

      {/* Bottom Taskbar */}
      <Taskbar />
    </div>
  );
}
