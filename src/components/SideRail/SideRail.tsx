import { useState } from 'react';
import GlobeWidget from '../widgets/GlobeWidget';
import NetworkMonitor from '../widgets/NetworkMonitor';
import AudioVisualizer from '../widgets/AudioVisualizer';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * SideRail — right-side instruments panel.
 * Width 256px expanded, 22px when collapsed.
 * Houses 3D Globe, Network Monitor, and Audio Visualizer.
 */
export default function SideRail() {
  const [collapsed, setCollapsed] = useState(false);
  const widgets = useSettingsStore((s) => s.widgets);

  const anyVisible = widgets.globe || widgets.audioVisualizer || widgets.networkMonitor;

  if (collapsed) {
    return (
      <div
        style={{
          width: 22,
          background: 'rgba(8, 12, 22, 0.95)',
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 15,
          flexShrink: 0,
        }}
        onClick={() => setCollapsed(false)}
        title="Expand Instruments Panel"
      >
        <ChevronLeft size={14} style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (!anyVisible) {
    return (
      <aside style={{
        width: 256,
        background: 'rgba(8, 12, 22, 0.95)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 15,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', borderBottom: '1px solid var(--border-color)',
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: 1.5,
        }}>
          <span>INSTRUMENTS</span>
          <button onClick={() => setCollapsed(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
          All widgets off
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 256,
        background: 'rgba(8, 12, 22, 0.95)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(8px)',
        zIndex: 15,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderBottom: '1px solid var(--border-color)',
        fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        letterSpacing: 1.5, background: 'rgba(0,0,0,0.3)', flexShrink: 0,
      }}>
        <span>INSTRUMENTS</span>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          title="Collapse"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Widgets body — scrollable, each widget fills full width */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {widgets.globe && (
          <div style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
            <GlobeWidget height={240} />
          </div>
        )}
        {widgets.networkMonitor && (
          <div style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.15)' }}>
            <NetworkMonitor />
          </div>
        )}
        {widgets.audioVisualizer && (
          <div style={{ background: 'rgba(0,0,0,0.15)' }}>
            <AudioVisualizer />
          </div>
        )}
      </div>
    </aside>
  );
}
