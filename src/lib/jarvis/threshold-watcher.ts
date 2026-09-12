// src/lib/jarvis/threshold-watcher.ts
// Автоматический мониторинг порогов CPU/RAM/Диска с голосовым оповещением

import { speakText } from './jarvis-tts';

export interface ThresholdConfig {
  enabled: boolean;
  cpuPercent?: number;      // например, 90
  ramPercent?: number;      // например, 90
  diskPercent?: number;     // например, 90
  cooldownMs: number;       // по умолчанию 5 минут (300 000 мс)
}

interface SystemStatusResponse {
  cpu_usage: number;
  total_memory_bytes: number;
  used_memory_bytes: number;
  disks: Array<{ total_bytes: number; used_bytes: number }>;
}

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export class ThresholdWatcher {
  private lastFired: Record<string, number> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: ThresholdConfig = {
    enabled: true,
    cpuPercent: 90,
    ramPercent: 90,
    diskPercent: 90,
    cooldownMs: 5 * 60 * 1000,
  };

  start(config?: Partial<ThresholdConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (!this.config.enabled) return;

    // Опрос каждые 5 секунд
    this.timer = setInterval(() => this.check(), 5000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateConfig(config: Partial<ThresholdConfig>) {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.stop();
    } else if (!this.timer) {
      this.start();
    }
  }

  private async check() {
    if (!isTauri || !this.config.enabled) return;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const status = await invoke<SystemStatusResponse>('get_system_info');
      const now = Date.now();

      const cpuUsage = status.cpu_usage;
      const ramUsagePct = status.total_memory_bytes > 0
        ? (status.used_memory_bytes / status.total_memory_bytes) * 100
        : 0;

      // Максимальное заполнение среди дисков
      let maxDiskPct = 0;
      if (status.disks && status.disks.length > 0) {
        for (const d of status.disks) {
          if (d.total_bytes > 0) {
            const pct = (d.used_bytes / d.total_bytes) * 100;
            if (pct > maxDiskPct) maxDiskPct = pct;
          }
        }
      }

      const checks: [string, number | undefined, number, string][] = [
        ['cpu', this.config.cpuPercent, cpuUsage, `Внимание, сэр. Загрузка процессора превысила ${this.config.cpuPercent} процентов.`],
        ['ram', this.config.ramPercent, ramUsagePct, `Внимание, сэр. Память заполнена более чем на ${this.config.ramPercent} процентов.`],
        ['disk', this.config.diskPercent, maxDiskPct, `Внимание, сэр. Дисковое пространство заполнено более чем на ${this.config.diskPercent} процентов.`],
      ];

      for (const [key, threshold, value, message] of checks) {
        if (threshold == null) continue;
        if (value >= threshold && (now - (this.lastFired[key] ?? 0)) > this.config.cooldownMs) {
          this.lastFired[key] = now;
          speakText(message);
          console.warn(`[ThresholdWatcher] ${message} (Value: ${value.toFixed(1)}%)`);
        }
      }
    } catch {
      // Игнорируем сетевые или системные ошибки опроса
    }
  }
}

let _thresholdWatcher: ThresholdWatcher | null = null;
export function getThresholdWatcher(config?: Partial<ThresholdConfig>): ThresholdWatcher {
  if (!_thresholdWatcher) {
    _thresholdWatcher = new ThresholdWatcher();
    _thresholdWatcher.start(config);
  } else if (config) {
    _thresholdWatcher.updateConfig(config);
  }
  return _thresholdWatcher;
}
