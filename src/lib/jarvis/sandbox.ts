// src/lib/jarvis/sandbox.ts
// Уровни доступа (sandbox) для инструментов и навыков

export enum SandboxLevel {
  Minimal = 'minimal',   // UI SysForge: open_app, set_theme, set_background, open_url
  Standard = 'standard', // + readonly-система: get_system_status, get_process_list, ping_host, traceroute_host
  Full = 'full',         // + побочный эффект: kill_process, delete_file, lock_screen
}

export const TOOL_MIN_SANDBOX: Record<string, SandboxLevel> = {
  open_app:              SandboxLevel.Minimal,
  close_app:             SandboxLevel.Minimal,
  set_theme:             SandboxLevel.Minimal,
  set_background:        SandboxLevel.Minimal,
  open_url:              SandboxLevel.Minimal,
  load_skill:            SandboxLevel.Minimal,
  list_available_skills: SandboxLevel.Minimal,

  get_system_status:     SandboxLevel.Standard,
  get_process_list:      SandboxLevel.Standard,
  ping_host:             SandboxLevel.Standard,
  traceroute_host:       SandboxLevel.Standard,

  kill_process:          SandboxLevel.Full,
  delete_file:           SandboxLevel.Full,
  lock_screen:           SandboxLevel.Full,
};

function sandboxRank(l: SandboxLevel): number {
  return { minimal: 0, standard: 1, full: 2 }[l];
}

export interface SkillStep {
  tool: string;
  args: Record<string, unknown>;
  requires_confirmation?: boolean;
}

export interface Skill {
  id: string;
  displayName: string;
  description: string;
  category: string;
  createdBy: 'user' | 'system';
  sandbox: SandboxLevel;
  phrases: { ru: string[]; en: string[] };
  slots: Record<string, SlotDefinition>;
  steps: SkillStep[];
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
}

export interface SlotDefinition {
  default?: string;
  contextWords?: string[];
  pattern?: string;
  description?: string;
}

export function validateSkillSandbox(skill: Skill): { valid: boolean; violatingTool?: string } {
  for (const step of skill.steps) {
    const required = TOOL_MIN_SANDBOX[step.tool];
    if (!required) continue; // неизвестный инструмент — пропускаем
    if (sandboxRank(required) > sandboxRank(skill.sandbox)) {
      return { valid: false, violatingTool: step.tool };
    }
  }
  return { valid: true };
}

/** Автоматически вычислить минимально необходимый sandbox для набора шагов */
export function computeRequiredSandbox(steps: SkillStep[]): SandboxLevel {
  let maxRank = 0;
  for (const step of steps) {
    const required = TOOL_MIN_SANDBOX[step.tool];
    if (required && sandboxRank(required) > maxRank) {
      maxRank = sandboxRank(required);
    }
  }
  return ([SandboxLevel.Minimal, SandboxLevel.Standard, SandboxLevel.Full] as const)[maxRank];
}

export function sandboxLabel(level: SandboxLevel): string {
  return { minimal: '🟢 Minimal', standard: '🟡 Standard', full: '🔴 Full' }[level];
}
