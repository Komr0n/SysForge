import { useState } from 'react';
import { X, Palette, Monitor, Cpu, Volume2, Key, LayoutGrid } from 'lucide-react';
import { useSettingsStore, BackgroundType, ThemeMode, MatrixColor } from '../../store/settingsStore';
import { BG_LABELS } from '../effects/BackgroundEffects';
import { MATRIX_COLOR_OPTIONS } from '../effects/matrixColors';
import { PRIMARY_THEME_OPTIONS, EXPERIMENTAL_THEME_OPTIONS } from './ThemeManager';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const FPS_OPTIONS = [24, 30, 60, 120];



const MATRIX_COLOR_LABELS: Record<MatrixColor, string> = {
  green: 'Green',
  red: 'Crimson',
  amber: 'Amber',
  gray: 'Gray',
  cyan: 'Ice',
  violet: 'Violet',
  darkgreen: 'Dark',
  white: 'Ghost',
};

const MATRIX_COLOR_PREVIEW: Record<MatrixColor, string> = {
  green: '#00ff88',
  red: '#ff2838',
  amber: '#ffbf00',
  gray: '#c8c8c8',
  cyan: '#38bdfe',
  violet: '#a855f7',
  darkgreen: '#007846',
  white: '#ffffff',
};

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const {
    theme,
    background,
    matrixColor,
    performance,
    widgets,
    audio,
    setTheme,
    setBackground,
    setMatrixColor,
    toggleReduceMotion,
    toggleLowPowerMode,
    toggleAudio,
    setVolume,
    setFpsCap,
    toggleWidget,
  } = useSettingsStore();

  const [section, setSection] = useState<'appearance' | 'performance' | 'widgets' | 'audio' | 'apikeys'>('appearance');

  if (!open) return null;

  const sections = [
    { id: 'appearance' as const, label: 'Appearance', icon: <Palette size={14} /> },
    { id: 'widgets' as const, label: 'Widgets', icon: <LayoutGrid size={14} /> },
    { id: 'performance' as const, label: 'Performance', icon: <Cpu size={14} /> },
    { id: 'audio' as const, label: 'Audio', icon: <Volume2 size={14} /> },
    { id: 'apikeys' as const, label: 'API Keys', icon: <Key size={14} /> },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="window-frame"
        style={{
          width: 680,
          height: 520,
          display: 'flex',
          flexDirection: 'row',
          padding: 0,
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: 160,
            borderRight: '1px solid var(--border-color)',
            background: 'rgba(2,6,23,0.6)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-muted)', padding: '8px 10px', textTransform: 'uppercase' }}>
            Settings
          </div>
          {sections.map((s) => (
            <div
              key={s.id}
              className={`sidebar-item ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
              style={{ padding: '8px 10px', fontSize: 12, gap: 8 }}
            >
              <span style={{ color: section === s.id ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Title bar */}
          <div className="window-titlebar">
            <div className="window-titlebar-left">
              <span className="text-accent-primary text-xs"><Monitor size={12} /></span>
              <span>Settings — {sections.find((s) => s.id === section)?.label}</span>
            </div>
            <div className="window-titlebar-right">
              <button className="window-btn window-btn-close" onClick={onClose} title="Close">
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {section === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Main Presets */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--accent-primary)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Primary Theme Presets
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {PRIMARY_THEME_OPTIONS.map((t) => (
                      <div
                        key={t.value}
                        onClick={() => setTheme(t.value)}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          border: `1px solid ${theme === t.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          background: theme === t.value ? 'rgba(0,255,136,0.08)' : 'rgba(2,6,23,0.6)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: t.preview, border: '1px solid var(--border-color)' }} />
                        <span style={{ fontSize: 11, color: theme === t.value ? 'var(--accent-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                          {t.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Experimental Themes */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                    Experimental Themes
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {EXPERIMENTAL_THEME_OPTIONS.map((t) => (
                      <div
                        key={t.value}
                        onClick={() => setTheme(t.value)}
                        style={{
                          padding: '8px 6px',
                          borderRadius: 6,
                          border: `1px solid ${theme === t.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          background: theme === t.value ? 'rgba(0,255,136,0.08)' : 'rgba(2,6,23,0.6)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.preview, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: theme === t.value ? 'var(--accent-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {t.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Background */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                    Background Effect
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {BG_LABELS.map((bg) => (
                      <div
                        key={bg.value}
                        onClick={() => setBackground(bg.value as BackgroundType)}
                        style={{
                          padding: '8px 6px',
                          borderRadius: 6,
                          border: `1px solid ${background === bg.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          background: background === bg.value ? 'rgba(0,255,136,0.08)' : 'rgba(2,6,23,0.6)',
                          cursor: 'pointer',
                          fontSize: 10,
                          color: background === bg.value ? 'var(--accent-primary)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          textAlign: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {bg.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Matrix color — only shown when matrix background is selected */}
                {background === 'matrix' && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                      Matrix Color
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {MATRIX_COLOR_OPTIONS.map((opt) => (
                        <div
                          key={opt.value}
                          onClick={() => setMatrixColor(opt.value as MatrixColor)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: 6,
                            border: `1px solid ${matrixColor === opt.value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                            background: matrixColor === opt.value ? 'rgba(0,255,136,0.08)' : 'rgba(2,6,23,0.6)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.15s',
                          }}
                          title={opt.label}
                        >
                          <span style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: MATRIX_COLOR_PREVIEW[opt.value as MatrixColor],
                            boxShadow: `0 0 6px ${MATRIX_COLOR_PREVIEW[opt.value as MatrixColor]}`,
                            flexShrink: 0,
                          }} />
                          <span style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: matrixColor === opt.value ? 'var(--accent-primary)' : 'var(--text-muted)',
                          }}>
                            {MATRIX_COLOR_LABELS[opt.value as MatrixColor]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {section === 'widgets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Bottom Telemetry Bar */}
                <div>
                  <div style={{ fontSize: 9, color: 'var(--accent-primary)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Bottom Bar (Telemetry Bar)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { key: 'systemVitals' as const, label: 'System Vitals', desc: 'Concentric rings: CPU / RAM / Disk / FPS' },
                      { key: 'miniTerminal' as const, label: 'Mini Terminal', desc: 'Interactive shell — type commands here' },
                    ]).map((w) => (
                      <ToggleRow key={w.key} label={w.label} desc={w.desc} value={widgets[w.key]} onChange={() => toggleWidget(w.key)} />
                    ))}
                  </div>
                </div>

                {/* Right Side Rail */}
                <div>
                  <div style={{ fontSize: 9, color: '#0ea5e9', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Right Side Rail (Instruments)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { key: 'networkMonitor' as const, label: 'Network Monitor', desc: 'Live upload / download traffic graph' },
                      { key: 'audioVisualizer' as const, label: 'Audio Spectrum', desc: 'Animated frequency-bar equalizer' },
                    ]).map((w) => (
                      <ToggleRow key={w.key} label={w.label} desc={w.desc} value={widgets[w.key]} onChange={() => toggleWidget(w.key)} />
                    ))}
                  </div>
                </div>

                {/* Desktop Overlay */}
                <div>
                  <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
                    Desktop Overlay (Draggable)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { key: 'clock' as const, label: 'Clock', desc: 'Large time/date display — drag anywhere' },
                      { key: 'globe' as const, label: 'Globe (3D)', desc: 'Interactive 3D rotating globe — drag anywhere' },
                    ]).map((w) => (
                      <ToggleRow key={w.key} label={w.label} desc={w.desc} value={widgets[w.key]} onChange={() => toggleWidget(w.key)} />
                    ))}
                  </div>
                </div>

              </div>
            )}

            {section === 'performance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ToggleRow label="Reduce Motion" desc="Minimize animations" value={performance.reduceMotion} onChange={toggleReduceMotion} />
                <ToggleRow label="Low Power Mode" desc="Static gradient background only" value={performance.lowPowerMode} onChange={toggleLowPowerMode} />

                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>FPS Cap</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {FPS_OPTIONS.map((fps) => (
                      <button
                        key={fps}
                        onClick={() => setFpsCap(fps)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          border: `1px solid ${performance.fpsCap === fps ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          background: performance.fpsCap === fps ? 'rgba(0,255,136,0.1)' : 'transparent',
                          color: performance.fpsCap === fps ? 'var(--accent-primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                        }}
                      >
                        {fps}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {section === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ToggleRow label="Audio Effects" desc="Tactile WebAudio sound feedback" value={audio.enabled} onChange={toggleAudio} />
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Master Volume ({Math.round((audio.volume ?? 0.5) * 100)}%)
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.volume ?? 0.5}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                  />
                </div>
              </div>
            )}

            {section === 'apikeys' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ApiKeyInput service="abuseipdb" label="AbuseIPDB" />
                <ApiKeyInput service="virustotal" label="VirusTotal" />
                <ApiKeyInput service="nvd" label="NVD (CVE)" />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                  Note: API keys are stored in-memory during session (not written unencrypted to disk).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 6,
        border: '1px solid var(--border-color)',
        background: 'rgba(2,6,23,0.6)',
        cursor: 'pointer',
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: value ? 'rgba(0,255,136,0.3)' : 'rgba(100,116,139,0.3)',
          border: `1px solid ${value ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          position: 'relative',
          transition: 'all 0.2s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 1,
            left: value ? 17 : 1,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: value ? 'var(--accent-primary)' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}
        />
      </div>
    </div>
  );
}

function ApiKeyInput({ service, label }: { service: 'abuseipdb' | 'virustotal' | 'nvd'; label: string }) {
  const apiKey = useSettingsStore((s) => s.apiKeys[service]);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(service, e.target.value)}
        placeholder={`Paste ${label} API key...`}
        style={{
          width: '100%',
          background: 'rgba(2,6,23,0.6)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          padding: '6px 10px',
          outline: 'none',
        }}
      />
    </label>
  );
}
