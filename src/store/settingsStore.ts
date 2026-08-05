import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { tauriStorageAdapter } from '../lib/tauriStorage';

export type PrimaryThemeMode = 'terminal-green' | 'holo-cyan' | 'light';
export type ExperimentalThemeMode = 'dark' | 'cyber' | 'crimson' | 'noir' | 'amber' | 'graphite' | 'emerald' | 'ice';
export type ThemeMode = PrimaryThemeMode | ExperimentalThemeMode;

export type BackgroundType = 'grid' | 'matrix' | 'particles' | 'none' | 'gradient' | 'stars' | 'nebula' | 'storm' | 'circuit' | 'hexagon' | 'aurora' | 'plasma';
export type MatrixColor = 'green' | 'red' | 'amber' | 'gray' | 'cyan' | 'violet' | 'darkgreen' | 'white';

export interface SettingsState {
  theme: ThemeMode;
  background: BackgroundType;
  matrixColor: MatrixColor;
  apiKeys: {
    abuseipdb: string;
    virustotal: string;
    nvd: string;
  };
  preferences: {
    defaultInterface: string;
    updateInterval: number;
  };
  performance: {
    particleNetwork: boolean;
    matrixRain: boolean;
    fpsCap: number;
    reduceMotion: boolean;
    lowPowerMode: boolean;
  };
  widgets: {
    clock: boolean;
    systemVitals: boolean;
    globe: boolean;
    networkMonitor: boolean;
    audioVisualizer: boolean;
    miniTerminal: boolean;
    cpuRamGraph: boolean;
    activityHistory: boolean;
  };
  widgetPositions: Record<string, { x: number; y: number }>;
  audio: {
    enabled: boolean;
    volume: number;
  };
  toggleParticleNetwork: () => void;
  toggleMatrixRain: () => void;
  toggleReduceMotion: () => void;
  toggleLowPowerMode: () => void;
  toggleAudio: () => void;
  setVolume: (volume: number) => void;
  setFpsCap: (cap: number) => void;
  setApiKey: (service: 'abuseipdb' | 'virustotal' | 'nvd', key: string) => void;
  setBackground: (bg: BackgroundType) => void;
  setMatrixColor: (color: MatrixColor) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleWidget: (key: keyof SettingsState['widgets']) => void;
  setWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'terminal-green',
      background: 'grid',
      matrixColor: 'green',
      apiKeys: {
        abuseipdb: '',
        virustotal: '',
        nvd: '',
      },
      preferences: {
        defaultInterface: '',
        updateInterval: 2000,
      },
      performance: {
        particleNetwork: true,
        matrixRain: false,
        fpsCap: 30,
        reduceMotion: false,
        lowPowerMode: false,
      },
      widgets: {
        clock: true,
        systemVitals: true,
        globe: false,
        networkMonitor: true,
        audioVisualizer: false,
        miniTerminal: true,
        cpuRamGraph: true,
        activityHistory: true,
      },
      widgetPositions: {},
      audio: {
        enabled: true,
        volume: 0.5,
      },
      toggleParticleNetwork: () =>
        set((state) => ({
          performance: { ...state.performance, particleNetwork: !state.performance.particleNetwork },
        })),
      toggleMatrixRain: () =>
        set((state) => ({
          performance: { ...state.performance, matrixRain: !state.performance.matrixRain },
        })),
      toggleReduceMotion: () =>
        set((state) => ({
          performance: { ...state.performance, reduceMotion: !state.performance.reduceMotion },
        })),
      toggleLowPowerMode: () =>
        set((state) => ({
          performance: { ...state.performance, lowPowerMode: !state.performance.lowPowerMode },
        })),
      toggleAudio: () =>
        set((state) => ({
          audio: { ...state.audio, enabled: !state.audio.enabled },
        })),
      setVolume: (volume: number) =>
        set((state) => ({
          audio: { ...state.audio, volume },
        })),
      setFpsCap: (cap: number) =>
        set((state) => ({
          performance: { ...state.performance, fpsCap: cap },
        })),
      setApiKey: (service, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [service]: key },
        })),
      setBackground: (bg) =>
        set(() => ({
          background: bg,
        })),
      setMatrixColor: (color) =>
        set(() => ({
          matrixColor: color,
        })),
      setTheme: (theme) =>
        set(() => ({
          theme,
        })),
      toggleWidget: (key) =>
        set((state) => ({
          widgets: { ...state.widgets, [key]: !state.widgets[key] },
        })),
      setWidgetPosition: (id, pos) =>
        set((state) => ({
          widgetPositions: { ...state.widgetPositions, [id]: pos },
        })),
    }),
    {
      name: 'sysforge-settings',
      storage: createJSONStorage(() => tauriStorageAdapter),
      // Exclude unencrypted API keys from persistent disk storage for security (kept in memory)
      partialize: (state) => {
        const { apiKeys, ...rest } = state;
        return rest;
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> & {
          performance?: Partial<SettingsState['performance']> & { globeWidget?: boolean };
        };
        const merged = { ...current, ...saved };

        // Migrate legacy performance.globeWidget → widgets.globe
        if (saved.performance?.globeWidget && !saved.widgets?.globe) {
          merged.widgets = { ...merged.widgets, globe: true };
        }

        if (saved.performance) {
          const { globeWidget: _legacyGlobe, ...performance } = saved.performance as SettingsState['performance'] & {
            globeWidget?: boolean;
          };
          merged.performance = { ...current.performance, ...performance };
        }

        if (saved.widgets) {
          merged.widgets = { ...current.widgets, ...saved.widgets };
        }

        if (saved.widgetPositions) {
          merged.widgetPositions = { ...current.widgetPositions, ...saved.widgetPositions };
        }

        return merged;
      },
    }
  )
);
