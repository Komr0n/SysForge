import { useState } from 'react';
import BootScreen from './components/BootScreen/BootScreen';
import BackgroundEffects from './components/effects/BackgroundEffects';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Taskbar from './components/Taskbar/Taskbar';
import WindowFrame from './components/WindowFrame/WindowFrame';
import ThemeManager from './components/Settings/ThemeManager';
import ClockWidget from './components/widgets/ClockWidget';
import SystemVitals from './components/widgets/SystemVitals';
import GlobeWidget from './components/widgets/GlobeWidget';
import NetworkMonitor from './components/widgets/NetworkMonitor';
import AudioVisualizer from './components/widgets/AudioVisualizer';
import MiniTerminal from './components/widgets/MiniTerminal';
import CpuRamGraph from './components/widgets/CpuRamGraph';
import ActivityHistory from './components/widgets/ActivityHistory';
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
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Applies the selected theme's CSS variables */}
      <ThemeManager />

      {/* Background effects layer */}
      <ErrorBoundary fallback={<div className="animated-gradient" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />}>
        <BackgroundEffects />
      </ErrorBoundary>

      {/* Header */}
      <Header />

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <Sidebar />

        {/* Workspace */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* ===== Fixed ambient widgets (right side, non-draggable) ===== */}
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1, pointerEvents: 'none' }}>
            {widgets.clock && <ClockWidget />}
          </div>

          <div style={{ position: 'absolute', bottom: 60, right: 20, zIndex: 1, pointerEvents: 'none' }}>
            {widgets.systemVitals && <SystemVitals />}
          </div>

          <div style={{ position: 'absolute', bottom: 340, right: 20, zIndex: 1, pointerEvents: 'auto' }}>
            <ErrorBoundary>
              <GlobeWidget />
            </ErrorBoundary>
          </div>

          {/* ===== Draggable data widgets (left side, movable) ===== */}
          {widgets.activityHistory && (
            <ErrorBoundary>
              <DraggableWidget id="activity" title="Activity" initialX={16} initialY={16} width={300}>
                <ActivityHistory />
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {widgets.cpuRamGraph && (
            <ErrorBoundary>
              <DraggableWidget id="cpuram" title="Performance" initialX={16} initialY={300} width={260}>
                <CpuRamGraph />
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {widgets.networkMonitor && (
            <ErrorBoundary>
              <DraggableWidget id="network" title="Network" initialX={16} initialY={520} width={260}>
                <NetworkMonitor />
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {widgets.audioVisualizer && (
            <ErrorBoundary>
              <DraggableWidget id="audio" title="Spectrum" initialX={286} initialY={520} width={260}>
                <AudioVisualizer />
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {widgets.miniTerminal && (
            <ErrorBoundary>
              <DraggableWidget id="terminal" title="Terminal" initialX={286} initialY={300} width={300}>
                <MiniTerminal />
              </DraggableWidget>
            </ErrorBoundary>
          )}

          {/* Open windows */}
          <ErrorBoundary>
            {Array.from(windows.values()).map((win) => (
              <WindowFrame key={win.id} window={win} />
            ))}
          </ErrorBoundary>
        </div>
      </div>

      {/* Taskbar */}
      <Taskbar />
    </div>
  );
}
