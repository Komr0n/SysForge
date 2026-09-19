// src/lib/jarvis/fuzzy-matcher.ts
// Нечёткий матчер команд Jarvis (Level 2 каскада)
// Устойчив к опечаткам, ошибкам STT распознавания и русской морфологии.

import { Skill, SkillStep } from './sandbox';

export interface FuzzyMatch {
  skillId: string;
  score: number; // 0..100
  matchedPhrase: string;
}

const CLOSE_INTENT = /\b(закрой|заверши|убей|останови|выключи|kill|close|stop|quit|выруби)\b/i;
const OPEN_INTENT = /\b(открой|запусти|старт|включи|launch|open|start|вруби)\b/i;

/**
 * Расчёт коэффициента схожести строк по расстоянию Левенштейна (0..100).
 */
export function ratio(a: string, b: string): number {
  if (a === b) return 100;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return (1 - prev[n] / Math.max(m, n)) * 100;
}

/**
 * Для русской морфологии: «калькулятору» / «калькулятором» — сравниваем основы.
 */
export function stemRatio(a: string, b: string): number {
  const direct = ratio(a, b);
  if (a.length > 5 && b.length > 5) {
    return Math.max(direct, ratio(a.slice(0, 5), b.slice(0, 5)) * 0.95);
  }
  return direct;
}

/**
 * Оценка пересечения слов запроса и команды.
 */
export function wordOverlapScore(inputWords: string[], cmdWords: string[]): number {
  if (!inputWords.length || !cmdWords.length) return 0;
  let matched = 0;
  for (const iw of inputWords) {
    if (iw.length <= 2) continue;
    const best = Math.max(...cmdWords.map((cw) => stemRatio(iw, cw)));
    if (best > 70) {
      matched += best / 100;
    }
  }
  return (matched / Math.max(inputWords.length, cmdWords.length)) * 100;
}

/**
 * Поиск наилучшего совпадения навыка по нечёткому сравнению.
 */
export function fuzzyMatch(text: string, skills: Skill[]): FuzzyMatch | null {
  const phrase = text.trim().toLowerCase();
  if (!phrase) return null;
  const phraseWords = phrase.split(/\s+/);
  const wantsClose = CLOSE_INTENT.test(phrase);
  const wantsOpen = OPEN_INTENT.test(phrase);

  let best: FuzzyMatch | null = null;
  let bestScore = 65; // Минимальный порог отсечения шума

  for (const skill of skills) {
    // Предфильтр по противоположному намерению — не путать "открой" и "закрой"
    if (
      wantsClose &&
      skill.steps.some((s: SkillStep) => s.tool === 'open_system_app' || s.tool === 'open_url')
    ) {
      continue;
    }
    if (wantsOpen && skill.steps.some((s: SkillStep) => s.tool === 'close_os_app')) {
      continue;
    }

    const phrases = [...(skill.phrases.ru || []), ...(skill.phrases.en || [])];
    for (const cmdPhrase of phrases) {
      const cp = cmdPhrase.trim().toLowerCase();
      const score =
        ratio(phrase, cp) * 0.6 + wordOverlapScore(phraseWords, cp.split(/\s+/)) * 0.4;

      if (score >= 99) {
        return { skillId: skill.id, score, matchedPhrase: cmdPhrase };
      }
      if (score > bestScore) {
        bestScore = score;
        best = { skillId: skill.id, score, matchedPhrase: cmdPhrase };
      }
    }
  }

  return best;
}
