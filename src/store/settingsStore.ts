import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { tauriStorageAdapter } from '../lib/tauriStorage';

export type PrimaryThemeMode = 'terminal-green' | 'holo-cyan' | 'light';
export type ExperimentalThemeMode = 'dark' | 'cyber' | 'crimson' | 'noir' | 'amber' | 'graphite' | 'emerald' | 'ice';
export type ThemeMode = PrimaryThemeMode | ExperimentalThemeMode;

export type BackgroundType = 'grid' | 'matrix' | 'particles' | 'none' | 'gradient' | 'stars' | 'nebula' | 'storm' | 'circuit' | 'hexagon' | 'aurora' | 'plasma';
export type MatrixColor = 'green' | 'red' | 'amber' | 'gray' | 'cyan' | 'violet' | 'darkgreen' | 'white';

export interface CloudProviderProfile {
  id: string;
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  description?: string;
}

export interface JarvisConfig {
  provider: 'local' | 'cloud';
  local: {
    ollamaUrl: string;
    model: string;
  };
  cloud: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  cloudProviders: CloudProviderProfile[];
  activeCloudProviderId: string;
  autoFallbackOnRateLimit: boolean;
  fallbackMode: 'auto' | 'manual';
  confidenceThreshold: number;
  voice: {
    language: string;
    wakeWord: string;
    continuousWakeWord: boolean;
    ttsEnabled: boolean;
    ttsVoice?: string;
    ttsRate: number;
    ttsPitch: number;
    sttEnabled: boolean;
  };
}

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
  };
  widgetPositions: Record<string, { x: number; y: number }>;
  audio: {
    enabled: boolean;
    volume: number;
  };
  jarvis: JarvisConfig;
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
  setJarvisConfig: (cfg: JarvisConfig) => void;
  updateCloudProvider: (id: string, patch: Partial<CloudProviderProfile>) => void;
}

export const DEFAULT_CLOUD_PROVIDERS: CloudProviderProfile[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
    description: 'Ultra-fast multimodal AI from Google with generous free tier',
  },
  {
    id: 'groq',
    name: 'Groq (Llama 3.3)',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    description: 'Blazing-fast LPU inference (500+ tokens/sec) with Meta Llama models',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    description: 'Efficient European frontier models (Mistral, Codestral)',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Llama / DeepSeek)',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    description: 'Unified gateway to 100+ AI models including Meta Llama and DeepSeek',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    enabled: true,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: 'Official OpenAI GPT-4o and GPT-4o-mini models',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    enabled: false,
    apiKey: '',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    description: 'Local LM Studio, LocalAI, vLLM or custom proxy server',
  },
];

export const DEFAULT_JARVIS_CONFIG: JarvisConfig = {
  provider: 'local',
  local: {
    ollamaUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
  },
  cloud: {
    apiKey: '',
    model: 'gemini-1.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  cloudProviders: DEFAULT_CLOUD_PROVIDERS,
  activeCloudProviderId: 'gemini',
  autoFallbackOnRateLimit: true,
  fallbackMode: 'manual',
  confidenceThreshold: 0.82,
  voice: {
    language: 'ru-RU',
    wakeWord: 'джарвис',
    continuousWakeWord: false,
    ttsEnabled: true,
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    sttEnabled: true,
  },
};

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
        globe: true,
        networkMonitor: true,
        audioVisualizer: false,
        miniTerminal: true,
      },
      widgetPositions: {},
      audio: {
        enabled: true,
        volume: 0.5,
      },
      jarvis: DEFAULT_JARVIS_CONFIG,
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
      setJarvisConfig: (cfg) =>
        set(() => ({
          jarvis: cfg,
        })),
      updateCloudProvider: (id, patch) =>
        set((state) => {
          const list = state.jarvis.cloudProviders || DEFAULT_CLOUD_PROVIDERS;
          const updated = list.map((p) => (p.id === id ? { ...p, ...patch } : p));
          const currentActive = updated.find((p) => p.id === (state.jarvis.activeCloudProviderId || id));
          return {
            jarvis: {
              ...state.jarvis,
              cloudProviders: updated,
              cloud: currentActive
                ? { apiKey: currentActive.apiKey, model: currentActive.model, baseUrl: currentActive.baseUrl }
                : state.jarvis.cloud,
            },
          };
        }),
    }),
    {
      name: 'sysforge-settings',
      storage: createJSONStorage(() => tauriStorageAdapter),
      partialize: (state) => state,
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> & {
          performance?: Partial<SettingsState['performance']>;
          widgets?: Partial<SettingsState['widgets']>;
          apiKeys?: Partial<SettingsState['apiKeys']>;
          jarvis?: Partial<JarvisConfig>;
        };
        const merged = { ...current, ...saved };

        if (saved.performance) {
          merged.performance = { ...current.performance, ...saved.performance };
        }

        if (saved.widgets) {
          merged.widgets = {
            ...current.widgets,
            ...saved.widgets,
            globe: saved.widgets.globe ?? true,
          };
        }

        if (saved.apiKeys) {
          merged.apiKeys = { ...current.apiKeys, ...saved.apiKeys };
        }

        if (saved.widgetPositions) {
          merged.widgetPositions = { ...current.widgetPositions, ...saved.widgetPositions };
        }

        if (saved.jarvis) {
          const currentProviders = current.jarvis.cloudProviders || DEFAULT_CLOUD_PROVIDERS;
          const savedProviders = saved.jarvis.cloudProviders && saved.jarvis.cloudProviders.length > 0
            ? DEFAULT_CLOUD_PROVIDERS.map((def) => {
                const foundSaved = saved.jarvis?.cloudProviders?.find((p) => p.id === def.id);
                const foundCurrent = currentProviders.find((p) => p.id === def.id);
                return {
                  ...def,
                  ...foundSaved,
                  apiKey: foundSaved?.apiKey || foundCurrent?.apiKey || '',
                };
              })
            : currentProviders;

          merged.jarvis = {
            ...DEFAULT_JARVIS_CONFIG,
            ...saved.jarvis,
            local: { ...DEFAULT_JARVIS_CONFIG.local, ...saved.jarvis.local },
            cloud: {
              ...DEFAULT_JARVIS_CONFIG.cloud,
              ...saved.jarvis.cloud,
              apiKey: saved.jarvis.cloud?.apiKey || current.jarvis.cloud.apiKey || '',
            },
            voice: { ...DEFAULT_JARVIS_CONFIG.voice, ...saved.jarvis.voice },
            cloudProviders: savedProviders,
            autoFallbackOnRateLimit: saved.jarvis.autoFallbackOnRateLimit ?? true,
            activeCloudProviderId: saved.jarvis.activeCloudProviderId ?? 'gemini',
          };
        }

        return merged;
      },
    }
  )
);
