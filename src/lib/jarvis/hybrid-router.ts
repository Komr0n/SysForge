// src/lib/jarvis/hybrid-router.ts
// Гибридный роутер: direct → embedding → LLM fallback

import { directMatch } from './direct-commands';
import { executeTool, ToolResult } from './tool-executor';
import { getOrchestrator } from './orchestrator';
import { skillRegistry } from './skill-registry';
import { sessionHistory } from './session-history';
import { findTool } from './tools-schema';
import { fuzzyMatch } from './fuzzy-matcher';
import { extractSlotsForSkill } from './slot-extractor';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface CommandResult {
  response: string;
  toolResults: ToolResult[];
  matchedVia: 'direct' | 'embedding' | 'llm' | 'skill' | 'keyword';
  skillId?: string;
  pendingConfirmation?: {
    toolName: string;
    args: Record<string, unknown>;
    description: string;
  };
  providerUsed?: string;
}

export interface EmbeddingMatch {
  skill_id: string;
  confidence: number;
  extracted_slots: Record<string, string>;
}

export interface RoutingDiagnostic {
  input: string;
  timestamp: string;
  direct?: { matched: boolean; toolName?: string };
  fuzzy?: { matched: boolean; skillId?: string; score: number; phrase?: string };
  embedding?: { matched: boolean; skillId?: string; confidence: number };
  chosenTier: 'direct' | 'fuzzy-high' | 'embedding' | 'fuzzy-med' | 'llm';
}

export const routingDiagnostics: RoutingDiagnostic[] = [];

// ─── Keyword-матчер (fallback без ONNX) ──────────────────────────────────────

const STOP_VERBS = new Set([
  'открой', 'запусти', 'старт', 'включи', 'launch', 'open', 'start',
  'закрой', 'заверши', 'убей', 'останови', 'выключи', 'kill', 'close', 'stop', 'quit',
  'покажи', 'показать', 'сделай', 'do', 'show',
]);
const CLOSE_INTENT = /\b(закрой|заверши|убей|останови|выключи|kill|close|stop|quit)\b/i;
const OPEN_INTENT  = /\b(открой|запусти|старт|включи|launch|open|start)\b/i;

function keywordMatch(text: string): EmbeddingMatch | null {
  const lower = text.toLowerCase();
  const builtins = skillRegistry.getBuiltinSkills();
  const userWantsClose = CLOSE_INTENT.test(lower);
  const userWantsOpen = OPEN_INTENT.test(lower);
  let bestMatch: { skillId: string; score: number } | null = null;

  for (const skill of builtins) {
    if (userWantsClose && skill.steps.some((s) => s.tool === 'open_system_app' || s.tool === 'open_url')) {
      continue;
    }
    if (userWantsOpen && skill.steps.some((s) => s.tool === 'close_os_app')) {
      continue;
    }

    const phrases = [...(skill.phrases.ru || []), ...(skill.phrases.en || [])];
    for (const phrase of phrases) {
      const phraseLower = phrase.toLowerCase();
      if (userWantsClose && OPEN_INTENT.test(phraseLower) && !CLOSE_INTENT.test(phraseLower)) continue;
      if (userWantsOpen && CLOSE_INTENT.test(phraseLower) && !OPEN_INTENT.test(phraseLower)) continue;

      const words = phraseLower.split(' ');
      let score = 0;
      let matches = 0;
      for (const word of words) {
        if (word.length > 2 && !STOP_VERBS.has(word) && lower.includes(word)) {
          matches++;
          score += word.length;
        }
      }
      if (matches > 0) {
        const confidence = score / (phraseLower.length + 1);
        if (!bestMatch || confidence > bestMatch.score) {
          bestMatch = { skillId: skill.id, score: confidence };
        }
      }
    }
  }

  if (bestMatch && bestMatch.score >= 0.15) {
    return {
      skill_id: bestMatch.skillId,
      confidence: bestMatch.score,
      extracted_slots: {},
    };
  }
  return null;
}

// ─── ONNX матчер (только Tauri) ───────────────────────────────────────────────

async function onnxMatch(text: string, threshold: number): Promise<EmbeddingMatch | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<EmbeddingMatch | null>('jarvis_match_intent', { text });
    if (result && result.confidence >= threshold) return result;
  } catch {
    // ONNX может быть недоступен
  }
  return null;
}

// ─── Основной роутер ─────────────────────────────────────────────────────────

export async function routeCommand(
  text: string,
  opts: {
    confidenceThreshold?: number;
    userConfirmedDestructive?: boolean;
    pendingToolName?: string;
    pendingToolArgs?: Record<string, unknown>;
  } = {}
): Promise<CommandResult> {
  const threshold = opts.confidenceThreshold ?? 0.70;

  // Сохраняем сообщение пользователя в историю
  sessionHistory.addUser(text);

  const diag: RoutingDiagnostic = {
    input: text,
    timestamp: new Date().toLocaleTimeString(),
    chosenTier: 'llm',
  };

  // ─── 0. Выполнение ожидающего подтверждения ──────────────────────────────
  if (opts.pendingToolName && opts.userConfirmedDestructive) {
    const result = await executeTool({
      toolName: opts.pendingToolName,
      args: opts.pendingToolArgs ?? {},
      userConfirmedDestructive: true,
      matchedVia: 'direct',
    });
    const response = result.message ?? 'Выполнено, сэр.';
    sessionHistory.addAssistant(response, [opts.pendingToolName]);
    return { response, toolResults: [result], matchedVia: 'direct' };
  }

  // ─── 1. ПРЯМОЙ МАТЧИНГ (Regex) — мгновенно, без LLM ────────────────────
  const direct = directMatch(text);
  diag.direct = { matched: !!direct, toolName: direct?.toolName };
  if (direct) {
    diag.chosenTier = 'direct';
    routingDiagnostics.unshift(diag);
    if (routingDiagnostics.length > 50) routingDiagnostics.pop();

    let toolResult: ToolResult = { success: true, message: direct.displayText };
    if (direct.toolName !== 'system_info_echo') {
      toolResult = await executeTool({
        toolName: direct.toolName,
        args: direct.args,
        userConfirmedDestructive: false,
        matchedVia: 'direct',
      });
    }

    const response = (direct.toolName === 'close_os_app' || direct.toolName === 'close_app')
      ? (toolResult.message || direct.displayText)
      : direct.displayText;
    sessionHistory.addAssistant(response, [direct.toolName]);

    return {
      response,
      toolResults: [toolResult],
      matchedVia: 'direct',
    };
  }

  const allSkills = skillRegistry.getBuiltinSkills();

  // ─── 2. НЕЧЁТКИЙ МАТЧЕР ВЫСОКОЙ УВЕРЕННОСТИ (Score >= 85) ─────────────
  const fuzzy = fuzzyMatch(text, allSkills);
  diag.fuzzy = {
    matched: !!fuzzy,
    skillId: fuzzy?.skillId,
    score: fuzzy?.score ?? 0,
    phrase: fuzzy?.matchedPhrase,
  };

  if (fuzzy && fuzzy.score >= 85) {
    diag.chosenTier = 'fuzzy-high';
    routingDiagnostics.unshift(diag);
    if (routingDiagnostics.length > 50) routingDiagnostics.pop();

    const skill = allSkills.find((s) => s.id === fuzzy.skillId);
    if (skill) {
      const slots = extractSlotsForSkill(text, skill.slots as any);
      const result = await executeTool({
        toolName: 'load_skill',
        args: { skillId: skill.id, slots },
        matchedVia: 'keyword',
        skillName: skill.displayName,
      });
      const response = result.message ?? 'Выполнено по нечёткому соответствию.';
      sessionHistory.addAssistant(response, [skill.id]);
      return { response, toolResults: [result], matchedVia: 'keyword', skillId: skill.id };
    }
  }

  // ─── 3. СЕМАНТИЧЕСКИЙ МАТЧ (ONNX / FastEmbed, Confidence >= 0.70) ───────
  const semantic = await onnxMatch(text, threshold);
  diag.embedding = {
    matched: !!semantic,
    skillId: semantic?.skill_id,
    confidence: semantic?.confidence ?? 0,
  };

  if (semantic) {
    diag.chosenTier = 'embedding';
    routingDiagnostics.unshift(diag);
    if (routingDiagnostics.length > 50) routingDiagnostics.pop();

    const skill =
      await skillRegistry.loadSkill(semantic.skill_id) ??
      allSkills.find((s) => s.id === semantic.skill_id) ?? null;

    if (skill) {
      const result = await executeTool({
        toolName: 'load_skill',
        args: { skillId: skill.id, slots: semantic.extracted_slots },
        matchedVia: 'embedding',
        skillName: skill.displayName,
      });
      const response = result.message ?? 'Навык выполнен, сэр.';
      sessionHistory.addAssistant(response, [skill.id]);
      return { response, toolResults: [result], matchedVia: 'embedding', skillId: skill.id };
    }
  }

  // ─── 4. НЕЧЁТКИЙ МАТЧЕР СРЕДНЕЙ УВЕРЕННОСТИ (Score >= 70) ─────────────
  if (fuzzy && fuzzy.score >= 70) {
    diag.chosenTier = 'fuzzy-med';
    routingDiagnostics.unshift(diag);
    if (routingDiagnostics.length > 50) routingDiagnostics.pop();

    const skill = allSkills.find((s) => s.id === fuzzy.skillId);
    if (skill) {
      const slots = extractSlotsForSkill(text, skill.slots as any);
      const result = await executeTool({
        toolName: 'load_skill',
        args: { skillId: skill.id, slots },
        matchedVia: 'keyword',
        skillName: skill.displayName,
      });
      const response = result.message ?? 'Выполнено, сэр.';
      sessionHistory.addAssistant(response, [skill.id]);
      return { response, toolResults: [result], matchedVia: 'keyword', skillId: skill.id };
    }
  }

  // ─── 5. Keyword fallback ────────────────────────────────────────────────
  const kw = keywordMatch(text);
  if (kw) {
    const skill = allSkills.find((s) => s.id === kw.skill_id);
    if (skill) {
      const result = await executeTool({
        toolName: 'load_skill',
        args: { skillId: skill.id, slots: kw.extracted_slots },
        matchedVia: 'keyword',
        skillName: skill.displayName,
      });
      const response = result.message ?? 'Выполнено по ключевым словам.';
      sessionHistory.addAssistant(response, [skill.id]);
      return { response, toolResults: [result], matchedVia: 'keyword', skillId: skill.id };
    }
  }

  diag.chosenTier = 'llm';
  routingDiagnostics.unshift(diag);
  if (routingDiagnostics.length > 50) routingDiagnostics.pop();

  // ─── 5. LLM fallback ───────────────────────────────────────────────────
  const orchestrator = getOrchestrator();
  let llmResult;
  try {
    const history = sessionHistory.toOpenAIMessages().slice(0, -1);
    llmResult = await orchestrator.processCommand(text, history);
  } catch (e) {
    const errorMsg = (e as Error).message;
    sessionHistory.addAssistant(errorMsg);
    return {
      response: errorMsg,
      toolResults: [],
      matchedVia: 'llm',
    };
  }

  const toolResults: ToolResult[] = [];
  let pendingConfirmation: CommandResult['pendingConfirmation'];
  const executedTools: string[] = [];

  for (const action of llmResult.actions) {
    const result = await executeTool({
      toolName: action.toolName,
      args: action.args,
      userConfirmedDestructive: false,
      matchedVia: 'llm',
    });

    toolResults.push(result);
    executedTools.push(action.toolName);

    if (result.requiresConfirmation) {
      const tool = findTool(action.toolName);
      pendingConfirmation = {
        toolName: action.toolName,
        args: action.args,
        description: tool?.description ?? action.toolName,
      };
      break;
    }
  }

  const toolMessages = toolResults
    .filter((r) => r.message && !r.requiresConfirmation)
    .map((r) => r.message)
    .join('\n');

  const finalResponse = [llmResult.response, toolMessages].filter(Boolean).join('\n');

  sessionHistory.addAssistant(finalResponse || 'Понял.', executedTools);

  return {
    response: finalResponse || 'Понял.',
    toolResults,
    matchedVia: 'llm',
    pendingConfirmation,
    providerUsed: llmResult.providerUsed,
  };
}
