import { useEffect } from 'react';
import { useSettingsStore, ThemeMode } from '../../store/settingsStore';

/**
 * ThemeManager — applies the selected theme to the document root
 * by overriding CSS custom properties (--accent-primary, --bg-primary, etc.)
 *
 * This is what actually makes themes WORK. Without it, the theme setting
 * in the store had no visible effect.
 */

const THEMES: Record<ThemeMode, Record<string, string>> = {
  dark: {
    '--bg-primary': '#0a0e1a',
    '--bg-surface': '#111827',
    '--accent-primary': '#00ff88',
    '--accent-secondary': '#0ea5e9',
    '--danger': '#ef4444',
    '--warning': '#f59e0b',
    '--text-primary': '#e2e8f0',
    '--text-muted': '#64748b',
    '--border-color': '#1e293b',
  },
  cyber: {
    '--bg-primary': '#050a05',
    '--bg-surface': '#0a1a0a',
    '--accent-primary': '#00ff66',
    '--accent-secondary': '#22ff88',
    '--danger': '#ff3366',
    '--warning': '#ffcc00',
    '--text-primary': '#aaffaa',
    '--text-muted': '#4a8a4a',
    '--border-color': '#1a3a1a',
  },
  crimson: {
    '--bg-primary': '#120404',
    '--bg-surface': '#1f0808',
    '--accent-primary': '#ff2838',
    '--accent-secondary': '#ff6b6b',
    '--danger': '#ff4444',
    '--warning': '#ffaa00',
    '--text-primary': '#ffd0d0',
    '--text-muted': '#8a4a4a',
    '--border-color': '#3a1212',
  },
  noir: {
    '--bg-primary': '#000000',
    '--bg-surface': '#0a0a0a',
    '--accent-primary': '#e2e8f0',
    '--accent-secondary': '#94a3b8',
    '--danger': '#ef4444',
    '--warning': '#f59e0b',
    '--text-primary': '#f1f5f9',
    '--text-muted': '#475569',
    '--border-color': '#1f2937',
  },
  amber: {
    '--bg-primary': '#100a02',
    '--bg-surface': '#1a1208',
    '--accent-primary': '#ffbf00',
    '--accent-secondary': '#ffd966',
    '--danger': '#ff4444',
    '--warning': '#ff8800',
    '--text-primary': '#ffe8a8',
    '--text-muted': '#8a7440',
    '--border-color': '#3a2c10',
  },
  graphite: {
    '--bg-primary': '#0d0f12',
    '--bg-surface': '#161a20',
    '--accent-primary': '#94a3b8',
    '--accent-secondary': '#cbd5e1',
    '--danger': '#ef4444',
    '--warning': '#f59e0b',
    '--text-primary': '#e2e8f0',
    '--text-muted': '#64748b',
    '--border-color': '#2a2f38',
  },
  emerald: {
    '--bg-primary': '#02100a',
    '--bg-surface': '#082014',
    '--accent-primary': '#10d97e',
    '--accent-secondary': '#34d399',
    '--danger': '#ef4444',
    '--warning': '#f59e0b',
    '--text-primary': '#c8f0d8',
    '--text-muted': '#4a7a5a',
    '--border-color': '#103020',
  },
  ice: {
    '--bg-primary': '#020e16',
    '--bg-surface': '#061826',
    '--accent-primary': '#38bdf8',
    '--accent-secondary': '#7dd3fc',
    '--danger': '#ef4444',
    '--warning': '#f59e0b',
    '--text-primary': '#c8e8f8',
    '--text-muted': '#4a6a8a',
    '--border-color': '#0e2a3a',
  },
  light: {
    '--bg-primary': '#f1f5f9',
    '--bg-surface': '#ffffff',
    '--accent-primary': '#059669',
    '--accent-secondary': '#0284c7',
    '--danger': '#dc2626',
    '--warning': '#d97706',
    '--text-primary': '#0f172a',
    '--text-muted': '#64748b',
    '--border-color': '#cbd5e1',
  },
};

export default function ThemeManager() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const vars = THEMES[theme] ?? THEMES.dark;
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [theme]);

  return null;
}

export const THEME_OPTIONS: { value: ThemeMode; label: string; preview: string }[] = [
  { value: 'dark', label: 'Dark', preview: '#00ff88' },
  { value: 'cyber', label: 'Cyber Green', preview: '#00ff66' },
  { value: 'crimson', label: 'Crimson', preview: '#ff2838' },
  { value: 'noir', label: 'Noir Black', preview: '#e2e8f0' },
  { value: 'amber', label: 'Amber', preview: '#ffbf00' },
  { value: 'graphite', label: 'Graphite', preview: '#94a3b8' },
  { value: 'emerald', label: 'Emerald', preview: '#10d97e' },
  { value: 'ice', label: 'Ice', preview: '#38bdf8' },
  { value: 'light', label: 'Light', preview: '#059669' },
];
