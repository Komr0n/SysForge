import CpuRamGraph from '../widgets/CpuRamGraph';
import SystemVitals from '../widgets/SystemVitals';
import MiniTerminal from '../widgets/MiniTerminal';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * TelemetryBar — bottom fixed HUD panel.
 * Houses CpuRamGraph, SystemVitals (compact), and MiniTerminal.
 * Height is fixed at 150px to stay within HUD proportions.
 */
export default function TelemetryBar() {
  const widgets = useSettingsStore((s) => s.widgets);

  // Count visible panels to distribute space
  const hasGraph = widgets.cpuRamGraph;
  const hasVitals = widgets.systemVitals;
  const hasTerminal = widgets.miniTerminal;

  const anyVisible = hasGraph || hasVitals || hasTerminal;
  if (!anyVisible) return null;

  return (
    <div
      style={{
        height: 148,
        background: 'rgba(8, 12, 22, 0.97)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        zIndex: 15,
        backdropFilter: 'blur(8px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Performance Graph — takes flexible space */}
      {hasGraph && (
        <div style={{
          flex: 2,
          minWidth: 180,
          borderRight: (hasVitals || hasTerminal) ? '1px solid var(--border-color)' : 'none',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'stretch',
          overflow: 'hidden',
        }}>
          <CpuRamGraph />
        </div>
      )}

      {/* System Vitals Ring — fixed compact size */}
      {hasVitals && (
        <div style={{
          flexShrink: 0,
          borderRight: hasTerminal ? '1px solid var(--border-color)' : 'none',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 6px',
        }}>
          <SystemVitals compact={true} />
        </div>
      )}

      {/* Interactive MiniTerminal — takes remaining space */}
      {hasTerminal && (
        <div style={{
          flex: 3,
          minWidth: 220,
          background: 'rgba(0,0,0,0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'stretch',
        }}>
          <MiniTerminal />
        </div>
      )}
    </div>
  );
}
