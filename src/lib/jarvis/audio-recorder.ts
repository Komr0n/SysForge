// src/lib/jarvis/audio-recorder.ts
// Запись аудио с микрофона + анализатор громкости (AudioContext) + VAD (детектор тишины)

export interface AudioRecorderEvents {
  onVolume?: (volume: number) => void; // 0..100
  onSilence?: () => void;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private animFrameId: number | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecording = false;

  get recording(): boolean {
    return this.isRecording;
  }

  async start(events: AudioRecorderEvents = {}): Promise<boolean> {
    if (this.isRecording) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.warn('[AudioRecorder] getUserMedia error:', err);
      return false;
    }

    this.chunks = [];
    this.isRecording = true;

    // 1. MediaRecorder
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.start(100);
    } catch (e) {
      console.warn('[AudioRecorder] MediaRecorder init failed:', e);
    }

    // 2. AudioContext + Analyser для визуализации громкости и VAD
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let hasUserSpoken = false;

      const updateMeter = () => {
        if (!this.isRecording || !this.analyser) return;

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const volume = Math.min(100, Math.round((avg / 128) * 100));

        events.onVolume?.(volume);

        // VAD: порог человеческой речи
        if (volume > 8) {
          hasUserSpoken = true;
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
        } else if (hasUserSpoken && !this.silenceTimer) {
          // Тишина ПОСЛЕ того как пользователь заговорил — ставим таймер на 1.4 сек
          this.silenceTimer = setTimeout(() => {
            if (this.isRecording) {
              events.onSilence?.();
            }
          }, 1400);
        }

        this.animFrameId = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (e) {
      console.warn('[AudioRecorder] AudioContext meter failed:', e);
    }

    return true;
  }

  async stop(): Promise<Blob | null> {
    if (!this.isRecording) return null;
    this.isRecording = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    return new Promise((resolve) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          this.cleanup();
          resolve(blob);
        };
        try {
          this.mediaRecorder.stop();
        } catch {
          this.cleanup();
          resolve(null);
        }
      } else {
        this.cleanup();
        resolve(null);
      }
    });
  }

  cancel() {
    this.isRecording = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    } catch { /* ok */ }
    this.cleanup();
  }

  private cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch { /* ok */ }
      this.audioCtx = null;
    }
    this.analyser = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
