import { create } from 'zustand';

export type BackgroundType = 'matrix' | 'grid' | 'gradient' | 'stars' | 'particles' | 'nebula' | 'storm' | 'circuit' | 'hexagon' | 'aurora' | 'plasma' | 'none';
export type ThemeMode = 'dark' | 'light' | 'cyber' | 'crimson' | 'noir' | 'amber' | 'graphite' | 'emerald' | 'ice';
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
    globeWidget: boolean;
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
  audio: {
    enabled: boolean;
  };
  toggleParticleNetwork: () => void;
  toggleMatrixRain: () => void;
  toggleGlobeWidget: () => void;
  toggleReduceMotion: () => void;
  toggleLowPowerMode: () => void;
  toggleAudio: () => void;
  setFpsCap: (cap: number) => void;
  setApiKey: (service: 'abuseipdb' | 'virustotal' | 'nvd', key: string) => void;
  setBackground: (bg: BackgroundType) => void;
  setMatrixColor: (color: MatrixColor) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleWidget: (key: keyof SettingsState['widgets']) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  background: 'matrix',
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
    globeWidget: true,
    fpsCap: 30,
    reduceMotion: false,
    lowPowerMode: false,
  },
  widgets: {
    clock: true,
    systemVitals: true,
    globe: true,
    networkMonitor: true,
    audioVisualizer: true,
    miniTerminal: true,
    cpuRamGraph: true,
    activityHistory: true,
  },
  audio: {
    enabled: false,
  },
  toggleParticleNetwork: () =>
    set((state) => ({
      performance: { ...state.performance, particleNetwork: !state.performance.particleNetwork },
    })),
  toggleMatrixRain: () =>
    set((state) => ({
      performance: { ...state.performance, matrixRain: !state.performance.matrixRain },
    })),
  toggleGlobeWidget: () =>
    set((state) => ({
      performance: { ...state.performance, globeWidget: !state.performance.globeWidget },
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
      audio: { enabled: !state.audio.enabled },
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
}));
