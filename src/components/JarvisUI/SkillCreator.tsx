// src/components/JarvisUI/SkillCreator.tsx
// Визуальная редакция навыка перед сохранением

import { useState, useEffect } from 'react';
import { Skill, SandboxLevel, computeRequiredSandbox, sandboxLabel, SkillStep } from '../../lib/jarvis/sandbox';
import { skillRegistry } from '../../lib/jarvis/skill-registry';
import { SkillStepEditor } from './SkillStepEditor';

interface SkillCreatorProps {
  isOpen: boolean;
  initialSkill?: Skill | null;
  onSave: (skill: Skill) => void;
  onClose: () => void;
}

const CATEGORIES = ['general', 'network', 'system', 'developer', 'security', 'automation'];

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--border-color)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '5px 9px',
  width: '100%',
  boxSizing: 'border-box',
};

export function SkillCreator({ isOpen, initialSkill, onSave, onClose }: SkillCreatorProps) {
  const [skill, setSkill] = useState<Skill>(() => initialSkill ?? skillRegistry.createEmpty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [phrasesRu, setPhrasesRu] = useState('');
  const [phrasesEn, setPhrasesEn] = useState('');

  useEffect(() => {
    if (initialSkill) {
      setSkill(initialSkill);
      setPhrasesRu(initialSkill.phrases.ru.join('\n'));
      setPhrasesEn(initialSkill.phrases.en.join('\n'));
    } else {
      const empty = skillRegistry.createEmpty();
      setSkill(empty);
      setPhrasesRu('');
      setPhrasesEn('');
    }
    setError('');
  }, [initialSkill, isOpen]);

  if (!isOpen) return null;

  // Автовычисление sandbox
  const autoSandbox = computeRequiredSandbox(skill.steps);

  const updateField = <K extends keyof Skill>(key: K, value: Skill[K]) => {
    setSkill((s) => ({ ...s, [key]: value }));
  };

  const updateStep = (index: number, step: SkillStep) => {
    const steps = [...skill.steps];
    steps[index] = step;
    setSkill((s) => ({ ...s, steps, sandbox: computeRequiredSandbox(steps) }));
  };

  const addStep = () => {
    const steps = [...skill.steps, { tool: '', args: {} }];
    setSkill((s) => ({ ...s, steps }));
  };

  const removeStep = (index: number) => {
    const steps = skill.steps.filter((_, i) => i !== index);
    setSkill((s) => ({ ...s, steps, sandbox: computeRequiredSandbox(steps) }));
  };

  const moveStep = (index: number, dir: 1 | -1) => {
    const steps = [...skill.steps];
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setSkill((s) => ({ ...s, steps }));
  };

  const handleSave = async () => {
    setError('');
    if (!skill.displayName.trim()) { setError('Введите название навыка.'); return; }
    if (skill.steps.length === 0) { setError('Добавьте хотя бы один шаг.'); return; }
    if (skill.steps.some((s) => !s.tool)) { setError('Выберите инструмент для каждого шага.'); return; }

    // Применяем фразы
    const finalSkill: Skill = {
      ...skill,
      sandbox: autoSandbox,
      phrases: {
        ru: phrasesRu.split('\n').map((s) => s.trim()).filter(Boolean),
        en: phrasesEn.split('\n').map((s) => s.trim()).filter(Boolean),
      },
    };

    setSaving(true);
    try {
      await skillRegistry.saveSkill(finalSkill);
      onSave(finalSkill);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sandboxColors: Record<SandboxLevel, string> = {
    minimal: '#10b981',
    standard: '#f59e0b',
    full: '#ef4444',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        width: '90%',
        maxWidth: 640,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>🔧</span>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
            {initialSkill ? 'РЕДАКТИРОВАТЬ НАВЫК' : 'СОЗДАТЬ НАВЫК'}
          </span>
          <div style={{ flex: 1 }} />
          {/* Sandbox indicator */}
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: sandboxColors[autoSandbox],
            border: `1px solid ${sandboxColors[autoSandbox]}55`,
            borderRadius: 4, padding: '2px 8px',
          }}>
            {sandboxLabel(autoSandbox)}
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                Название *
              </label>
              <input
                style={inputStyle}
                value={skill.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                placeholder="Например: Пинг шлюза"
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                ID навыка
              </label>
              <input
                style={inputStyle}
                value={skill.id}
                onChange={(e) => updateField('id', e.target.value.replace(/\s+/g, '-').toLowerCase())}
                placeholder="ping-gateway"
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                Описание
              </label>
              <input
                style={inputStyle}
                value={skill.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Что делает этот навык?"
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                Категория
              </label>
              <select
                style={inputStyle}
                value={skill.category}
                onChange={(e) => updateField('category', e.target.value)}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Phrases */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                Фразы для активации (RU, каждая с новой строки)
              </label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={phrasesRu}
                onChange={(e) => setPhrasesRu(e.target.value)}
                placeholder={'пингани шлюз\nпроверь пинг'}
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
                Фразы для активации (EN)
              </label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={phrasesEn}
                onChange={(e) => setPhrasesEn(e.target.value)}
                placeholder={'ping the gateway\ncheck gateway latency'}
              />
            </div>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>ШАГИ ({skill.steps.length})</span>
            </div>
            {skill.steps.map((step, i) => (
              <SkillStepEditor
                key={i}
                step={step}
                index={i}
                onChange={(s) => updateStep(i, s)}
                onRemove={() => removeStep(i)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
                isFirst={i === 0}
                isLast={i === skill.steps.length - 1}
              />
            ))}
            <button
              onClick={addStep}
              style={{
                padding: '7px 14px',
                background: 'rgba(79,70,229,0.15)',
                border: '1px dashed var(--accent-primary)',
                borderRadius: 4,
                color: 'var(--accent-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              + Добавить шаг
            </button>
          </div>

          {error && (
            <div style={{
              color: '#ef4444', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4,
              padding: '8px 12px', fontSize: 11, marginBottom: 12,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--border-color)',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px 0',
            background: 'transparent', border: '1px solid var(--border-color)',
            borderRadius: 4, color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
          }}>
            ОТМЕНА
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '8px 0',
              background: saving ? 'rgba(79,70,229,0.1)' : 'rgba(79,70,229,0.2)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 4, color: 'var(--accent-primary)',
              fontFamily: 'var(--font-mono)', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {saving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ НАВЫК'}
          </button>
        </div>
      </div>
    </div>
  );
}
