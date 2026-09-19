// src/lib/jarvis/slot-extractor.ts
// Извлечение параметров (слотов) из текстовых команд пользователя

export interface SlotDef {
  default?: string;
  contextWords?: string[];
  pattern?: string; // 'ip_or_hostname' | 'number' | 'duration' | 'rest_of_phrase'
}

export function extractDurationMinutes(input: string): number | null {
  const lower = input.toLowerCase();

  // Словарные вербальные формы (русский)
  if (lower.includes('через полтора часа') || lower.includes('полтора часа')) return 90;
  if (lower.includes('через два с половиной часа')) return 150;
  if (lower.includes('через полчаса') || lower.includes('полчаса')) return 30;
  if (lower.includes('через час') || lower.includes('на час')) return 60;
  if (lower.includes('через два часа') || lower.includes('на два часа')) return 120;
  if (lower.includes('через три часа') || lower.includes('на три часа')) return 180;

  // Английские вербальные формы
  if (lower.includes('half an hour') || lower.includes('in 30 mins')) return 30;
  if (lower.includes('in an hour') || lower.includes('one hour')) return 60;
  if (lower.includes('in two hours')) return 120;

  // Регулярные выражения для минут
  const minMatch = lower.match(/(?:через|на|in)\s+(\d+)\s*(?:минут|минуты|минуту|мин|mins?|minutes?)/i);
  if (minMatch) return parseInt(minMatch[1], 10);

  // Регулярные выражения для часов
  const hourMatch = lower.match(/(?:через|на|in)\s+(\d+)\s*(?:час|часа|часов|hours?|hrs?)/i);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  // Регулярные выражения для секунд (переводим в доли минут или минимум 1)
  const secMatch = lower.match(/(?:через|на|in)\s+(\d+)\s*(?:секунд|секунды|секунду|сек|secs?|seconds?)/i);
  if (secMatch) return Math.max(1, Math.round(parseInt(secMatch[1], 10) / 60));

  // Просто число перед единицами
  const genericMatch = lower.match(/\b(\d+)\s*(?:м|min|m)\b/i);
  if (genericMatch) return parseInt(genericMatch[1], 10);

  return null;
}

export function extractIpOrHostname(input: string): string | null {
  // IPv4
  const ipMatch = input.match(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/);
  if (ipMatch) return ipMatch[0];

  // Domain / Hostname
  const hostMatch = input.match(/\b([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?::\d+)?)\b/);
  if (hostMatch) return hostMatch[1];

  return null;
}

export function extractNumber(input: string): string | null {
  const match = input.match(/\b(\d+)\b/);
  return match ? match[1] : null;
}

export function extractAfterContext(input: string, contextWords: string[]): string | null {
  const lower = input.toLowerCase();
  for (const cw of contextWords) {
    const idx = lower.indexOf(cw.toLowerCase());
    if (idx !== -1) {
      const rest = input.slice(idx + cw.length).trim();
      if (rest) return rest;
    }
  }
  return null;
}

export function extractSlotsForSkill(
  input: string,
  schema: Record<string, SlotDef>
): Record<string, string> {
  const extracted: Record<string, string> = {};

  for (const [name, def] of Object.entries(schema)) {
    let val: string | null = null;

    if (def.contextWords && def.contextWords.length > 0) {
      val = extractAfterContext(input, def.contextWords);
    }

    if (!val && def.pattern) {
      switch (def.pattern) {
        case 'duration': {
          const mins = extractDurationMinutes(input);
          if (mins !== null) val = String(mins);
          break;
        }
        case 'ip_or_hostname':
          val = extractIpOrHostname(input);
          break;
        case 'number':
          val = extractNumber(input);
          break;
        case 'rest_of_phrase':
          if (def.contextWords) {
            val = extractAfterContext(input, def.contextWords);
          }
          break;
      }
    }

    if (!val && def.default) {
      val = def.default;
    }

    if (val) {
      extracted[name] = val;
    }
  }

  return extracted;
}
