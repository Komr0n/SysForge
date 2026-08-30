import SystemVitals from '../widgets/SystemVitals';
import MiniTerminal from '../widgets/MiniTerminal';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * TelemetryBar — bottom fixed HUD panel.
 * Houses SystemVitals (compact ring indicators) and interactive MiniTerminal.
 * Height is fixed at 148px to stay within HUD proportions.
 */
export default function TelemetryBar() {
  const widgets = useSettingsStore((s) => s.widgets);

  const hasVitals = widgets.systemVitals;
  const hasTerminal = widgets.miniTerminal;

  const anyVisible = hasVitals || hasTerminal;
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
      {/* System Vitals Concentric Ring & Clock — fixed compact size */}
      {hasVitals && (
        <div style={{
          flexShrink: 0,
          borderRight: hasTerminal ? '1px solid var(--border-color)' : 'none',
          background: 'rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 14px',
        }}>
          <SystemVitals compact={true} />
        </div>
      )}

      {/* Interactive MiniTerminal — takes full remaining workspace width */}
      {hasTerminal && (
        <div style={{
          flex: 1,
          minWidth: 280,
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
