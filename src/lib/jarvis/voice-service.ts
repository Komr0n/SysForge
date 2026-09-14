// src/lib/jarvis/voice-service.ts
// Гибридный голосовой сервис: Web Speech API + AudioRecorder (MediaRecorder + Web Audio RMS) + Whisper STT fallback

import { getJarvisTTS, getWakePhrase } from './jarvis-tts';
import { AudioRecorder } from './audio-recorder';
import { transcribeAudioBlob } from './whisper-stt';
import { CloudProviderProfile } from '../../store/settingsStore';

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'executing' | 'speaking' | 'error';

export interface VoiceServiceConfig {
  language: string;          // 'ru-RU' | 'en-US'
  wakeWord: string;          // 'джарвис' | 'jarvis'
  continuousWakeWord: boolean;
  ttsEnabled: boolean;
  ttsVoice?: string;
  ttsRate: number;
  ttsPitch: number;
  sttEnabled: boolean;
  followUpListening?: boolean;
  followUpWindowMs?: number;
  cloudProviders?: CloudProviderProfile[];
}

type StateChangeListener = (state: JarvisState) => void;
type TranscriptListener = (text: string, isFinal: boolean) => void;
type CommandListener = (text: string) => void;
type ErrorListener = (message: string) => void;
type VolumeListener = (volume: number) => void;

interface ISpeechRecognitionEvent {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface ISpeechRecognitionErrorEvent { error: string; }

interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor { new (): ISpeechRecognition; }

const SpeechRecognitionClass: SpeechRecognitionConstructor | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
    : undefined;

export const isSpeechRecognitionSupported = !!SpeechRecognitionClass;
export const isSpeechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

const COMMAND_WAIT_MS = 4500;
const SPEECH_END_MS = 1600;

export class VoiceService {
  private config: VoiceServiceConfig;
  private recognition: ISpeechRecognition | null = null;
  private audioRecorder = new AudioRecorder();

  private isWakeWordMode = false;
  private isCommandMode = false;
  private micPermissionGranted = false;
  private lastCapturedText = '';

  private commandWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private speechEndTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private maxCommandTimer: ReturnType<typeof setTimeout> | null = null;
  public isFollowUpWindow = false;
  private _pendingFollowUp = false;
  private followUpListeners: ((isFollowUp: boolean) => void)[] = [];
  private interimAccumulator = '';

  private stateListeners: StateChangeListener[] = [];
  private transcriptListeners: TranscriptListener[] = [];
  private commandListeners: CommandListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private volumeListeners: VolumeListener[] = [];

  private _state: JarvisState = 'idle';

  constructor(config: VoiceServiceConfig) {
    this.config = config;
  }

  get state(): JarvisState { return this._state; }

  updateConfig(config: Partial<VoiceServiceConfig>) {
    this.config = { ...this.config, ...config };
    getJarvisTTS({
      ttsVoice: this.config.ttsVoice,
      ttsRate: this.config.ttsRate,
      ttsPitch: this.config.ttsPitch,
      ttsEnabled: this.config.ttsEnabled,
      language: this.config.language,
    });
  }

  // ─── Event listeners ────────────────────────────────────────────────────────

  onStateChange(listener: StateChangeListener) {
    this.stateListeners.push(listener);
    return () => { this.stateListeners = this.stateListeners.filter((l) => l !== listener); };
  }

  onTranscript(listener: TranscriptListener) {
    this.transcriptListeners.push(listener);
    return () => { this.transcriptListeners = this.transcriptListeners.filter((l) => l !== listener); };
  }

  onCommand(listener: CommandListener) {
    this.commandListeners.push(listener);
    return () => { this.commandListeners = this.commandListeners.filter((l) => l !== listener); };
  }

  onError(listener: ErrorListener) {
    this.errorListeners.push(listener);
    return () => { this.errorListeners = this.errorListeners.filter((l) => l !== listener); };
  }

  onFollowUpChange(listener: (isFollowUp: boolean) => void) {
    this.followUpListeners.push(listener);
    return () => { this.followUpListeners = this.followUpListeners.filter((l) => l !== listener); };
  }

  /** Set pending follow-up flag — prevents speak().onEnd from restarting wake word */
  setPendingFollowUp(pending: boolean) {
    this._pendingFollowUp = pending;
  }

    onVolume(listener: VolumeListener) {
    this.volumeListeners.push(listener);
    return () => { this.volumeListeners = this.volumeListeners.filter((l) => l !== listener); };
  }

  private setState(state: JarvisState) {
    this._state = state;
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('set_tray_icon', { active: state === 'listening' }).catch(() => {});
      }).catch(() => {});
    }
    this.stateListeners.forEach((l) => l(state));
  }

  private notifyError(msg: string) {
    this.errorListeners.forEach((l) => l(msg));
  }

  private notifyVolume(vol: number) {
    this.volumeListeners.forEach((l) => l(vol));
  }

  // ─── Разрешение микрофона ──────────────────────────────────────────────────

  async requestMicPermission(): Promise<boolean> {
    if (this.micPermissionGranted) return true;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        this.micPermissionGranted = true;
        return true;
      } catch (err) {
        console.warn('[VoiceService] Mic permission failed:', err);
        this.notifyError('Доступ к микрофону заблокирован в системе. Разрешите доступ к микрофону.');
        return false;
      }
    }
    return true;
  }

  // ─── Wake Word Mode ─────────────────────────────────────────────────────────

  async startWakeWordListening() {
    if (!this.config.sttEnabled) return;

    await this.requestMicPermission();

    this.stopAllTimers();
    this.destroyRecognition();
    this.audioRecorder.cancel();

    this.isWakeWordMode = true;
    this.isCommandMode = false;
    this.initRecognition(true /* continuous */);
    this.setState('idle');
  }

  // ─── Manual Listen (кнопка 🎤) ──────────────────────────────────────────────

  async startFollowUpListening(windowMs?: number) {
    if (this.config.sttEnabled === false) return;
    if (this.config.followUpListening === false) return;

    // Ensure mic access before starting
    const permitted = await this.requestMicPermission();
    if (!permitted) {
      this._pendingFollowUp = false;
      this.setState('idle');
      return;
    }

    const duration = windowMs ?? this.config.followUpWindowMs ?? 4000;

    this.stopAllTimers();
    this.destroyRecognition();
    this.lastCapturedText = '';
    this.interimAccumulator = '';
    this.isWakeWordMode = false;
    this.isCommandMode = true;
    this.isFollowUpWindow = true;
    this._pendingFollowUp = false;
    this.setState('listening');
    this.followUpListeners.forEach((l) => l(true));

    this.followUpTimer = setTimeout(() => {
      if (this.isCommandMode && !this.lastCapturedText && !this.interimAccumulator) {
        this.isFollowUpWindow = false;
        this.followUpListeners.forEach((l) => l(false));
        this.stopListening();
      }
    }, duration);

    await this.audioRecorder.start({
      onVolume: (vol) => this.notifyVolume(vol),
      onSilence: () => {
        if (this.isCommandMode && (this.lastCapturedText || this.interimAccumulator)) {
          this.isFollowUpWindow = false;
          this.followUpListeners.forEach((l) => l(false));
          this.stopListening();
        }
      },
    });

    if (isSpeechRecognitionSupported) {
      this.initRecognition(false);
    }
  }

    async startListening() {
    if (!this.config.sttEnabled) {
      this.notifyError('Голосовой ввод отключён в настройках.');
      return;
    }

    const permitted = await this.requestMicPermission();
    if (!permitted) {
      this.setState('error');
      setTimeout(() => this.setState('idle'), 2500);
      return;
    }

    this.stopAllTimers();
    this.destroyRecognition();
    this.lastCapturedText = '';
    this.interimAccumulator = '';

    this.isWakeWordMode = false;
    this.isCommandMode = true;
    this.setState('listening');

    // 1. Запускаем AudioRecorder с анализатором громкости и VAD
    await this.audioRecorder.start({
      onVolume: (vol) => this.notifyVolume(vol),
      onSilence: () => {
        // При наступлении тишины после речи финализируем запись
        if (this.isCommandMode) {
          this.stopListening();
        }
      },
    });

    // Максимальный таймаут записи (7.5 секунд), предотвращающий зависание в режиме слушания
    this.maxCommandTimer = setTimeout(() => {
      if (this.isCommandMode) {
        this.stopListening();
      }
    }, 7500);

    // 2. Если Web Speech API доступен — запускаем параллельно
    if (isSpeechRecognitionSupported) {
      this.initRecognition(false);
    }
  }

  async stopListening() {
    this.stopAllTimers();
    this.destroyRecognition();
    this.notifyVolume(0);

    const wasCommandMode = this.isCommandMode;
    this.isCommandMode = false;
    this.isWakeWordMode = false;
    if (this.isFollowUpWindow) {
      this.isFollowUpWindow = false;
      this.followUpListeners.forEach((l) => l(false));
    }

    // Останавливаем аудио-запись
    const audioBlob = await this.audioRecorder.stop();

    if (this._state === 'listening') {
      this.setState('idle');
    }

    if (wasCommandMode) {
      const captured = (this.lastCapturedText || this.interimAccumulator).trim();

      if (captured) {
        this.onCommandReceived(captured);
      } else if (audioBlob && audioBlob.size > 2000) {
        // Задействуем транскрипцию через Gemini / Groq / OpenAI
        this.setState('thinking');
        const transcribedText = await transcribeAudioBlob(audioBlob, this.config.cloudProviders);
        if (transcribedText) {
          this.onCommandReceived(transcribedText);
        } else {
          this.setState('idle');
          this.notifyError('Голос записан, но распознать текст не удалось. Убедитесь, что настроен API-ключ Gemini или Groq.');
          if (this.config.continuousWakeWord) {
            setTimeout(() => this.startWakeWordListening(), 400);
          }
        }
      } else {
        this.setState('idle');
        this.notifyError('Голос не обнаружен. Нажмите микрофон и произнесите команду.');
        if (this.config.continuousWakeWord) {
          setTimeout(() => this.startWakeWordListening(), 400);
        }
      }
    }
  }

  // ─── Internal Recognition ───────────────────────────────────────────────────

  private destroyRecognition() {
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* ok */ }
      this.recognition = null;
    }
  }

  private stopAllTimers() {
    if (this.commandWaitTimer) { clearTimeout(this.commandWaitTimer); this.commandWaitTimer = null; }
    if (this.speechEndTimer) { clearTimeout(this.speechEndTimer); this.speechEndTimer = null; }
    if (this.followUpTimer) { clearTimeout(this.followUpTimer); this.followUpTimer = null; }
    if (this.maxCommandTimer) { clearTimeout(this.maxCommandTimer); this.maxCommandTimer = null; }
  }

  private initRecognition(continuous: boolean) {
    if (!SpeechRecognitionClass) return;

    const rec = new SpeechRecognitionClass();
    rec.lang = this.config.language || 'ru-RU';
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: ISpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      if (!result || !result[0]) return;
      const transcript = result[0].transcript.trim();
      const isFinal = result.isFinal;

      this.transcriptListeners.forEach((l) => l(transcript, isFinal));

      if (this.isWakeWordMode) {
        const lower = transcript.toLowerCase();
        const wakeWords = [
          this.config.wakeWord.toLowerCase(),
          'джарвис', 'жарвис', 'jarvis',
        ];

        const match = wakeWords.find((w) => lower.includes(w));
        if (match) {
          const idx = lower.indexOf(match);
          const after = transcript.slice(idx + match.length).replace(/^[,:\s]+/, '').trim();

          if (after.length >= 3) {
            this.stopAllTimers();
            this.destroyRecognition();
            this.isWakeWordMode = false;
            this.onCommandReceived(after);
          } else {
            this.onWakeWordDetected();
          }
        }
      } else if (this.isCommandMode) {
        this.lastCapturedText = transcript;

        if (this.commandWaitTimer) {
          clearTimeout(this.commandWaitTimer);
          this.commandWaitTimer = null;
        }

        if (isFinal) {
          if (this.speechEndTimer) { clearTimeout(this.speechEndTimer); this.speechEndTimer = null; }
          const text = transcript.trim();
          if (text) {
            this.stopListening();
          }
        } else {
          this.interimAccumulator = transcript;
          if (this.speechEndTimer) clearTimeout(this.speechEndTimer);
          this.speechEndTimer = setTimeout(() => {
            if (this.isCommandMode && (this.lastCapturedText || this.interimAccumulator)) {
              this.stopListening();
            }
          }, SPEECH_END_MS);
        }
      }
    };

    rec.onerror = (event: ISpeechRecognitionErrorEvent) => {
      const err = event.error;
      const ignoredErrors = ['no-speech', 'aborted'];
      if (ignoredErrors.includes(err)) {
        if (this.isWakeWordMode) {
          setTimeout(() => {
            if (this.isWakeWordMode) this.startWakeWordListening();
          }, 400);
        }
        return;
      }

      console.warn('[VoiceService] Recognition error:', err);

      if (err === 'not-allowed') {
        this.notifyError('Доступ к микрофону заблокирован.');
      }

      // Не прерываем запись AudioRecorder при ошибке Web Speech API — AudioRecorder продолжит слушать!
      if (!this.audioRecorder.recording) {
        this.setState('error');
        setTimeout(() => {
          if (this._state === 'error') {
            this.setState('idle');
            if (this.isWakeWordMode && this.config.continuousWakeWord) {
              this.startWakeWordListening();
            }
          }
        }, 2000);
      }
    };

    rec.onend = () => {
      if (this.isWakeWordMode) {
        setTimeout(() => {
          if (this.isWakeWordMode) this.startWakeWordListening();
        }, 250);
      }
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn('[VoiceService] Failed to start Web Speech recognition (using AudioRecorder):', e);
    }
  }

  private async onWakeWordDetected() {
    this.stopAllTimers();
    this.destroyRecognition();
    this.audioRecorder.cancel();
    this.isWakeWordMode = false;

    const phrase = getWakePhrase(this.config.language);
    this.setState('speaking');

    const tts = getJarvisTTS({
      ttsVoice: this.config.ttsVoice,
      ttsRate: this.config.ttsRate,
      ttsPitch: this.config.ttsPitch,
      ttsEnabled: this.config.ttsEnabled,
      language: this.config.language,
    });

    await tts.speak(phrase, { quick: true });

    // Слушаем команду
    await this.startListening();

    this.commandWaitTimer = setTimeout(() => {
      if (this.isCommandMode && !this.lastCapturedText && !this.interimAccumulator) {
        this.stopListening();
      }
    }, COMMAND_WAIT_MS);
  }

  private onCommandReceived(text: string) {
    this.stopAllTimers();
    this.destroyRecognition();
    this.audioRecorder.cancel();
    this.isCommandMode = false;
    if (this.isFollowUpWindow) {
      this.isFollowUpWindow = false;
      this.followUpListeners.forEach((l) => l(false));
    }
    this.interimAccumulator = '';
    this.lastCapturedText = '';
    this.commandListeners.forEach((l) => l(text));
  }

  // ─── TTS ────────────────────────────────────────────────────────────────────

  speak(text: string, opts: { quick?: boolean } = {}): Promise<void> {
    const tts = getJarvisTTS({
      ttsVoice: this.config.ttsVoice,
      ttsRate: this.config.ttsRate,
      ttsPitch: this.config.ttsPitch,
      ttsEnabled: this.config.ttsEnabled,
      language: this.config.language,
    });

    if (!opts.quick) this.setState('speaking');

    return tts.speak(text, {
      quick: opts.quick,
      onEnd: () => {
        if (!opts.quick) this.setState('idle');
        // Don't restart wake word if follow-up listening is pending
        if (!this._pendingFollowUp && this.config.continuousWakeWord) {
          setTimeout(() => this.startWakeWordListening(), 400);
        }
      },
    });
  }

  stopSpeaking() {
    getJarvisTTS().stop();
    if (this._state === 'speaking') this.setState('idle');
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis?.getVoices() ?? [];
  }

  destroy() {
    this.stopAllTimers();
    this.destroyRecognition();
    this.audioRecorder.cancel();
    getJarvisTTS().stop();
    this.stateListeners = [];
    this.transcriptListeners = [];
    this.commandListeners = [];
    this.errorListeners = [];
    this.volumeListeners = [];
  }
}

// ─── Синглтон ─────────────────────────────────────────────────────────────────

let _voiceService: VoiceService | null = null;

export function getVoiceService(config?: Partial<VoiceServiceConfig>): VoiceService {
  if (!_voiceService) {
    _voiceService = new VoiceService({
      language: 'ru-RU',
      wakeWord: 'джарвис',
      continuousWakeWord: true,
      ttsEnabled: true,
      ttsRate: 1.0,
      ttsPitch: 1.0,
      sttEnabled: true,
      ...config,
    });
  } else if (config) {
    _voiceService.updateConfig(config);
  }
  return _voiceService;
}
