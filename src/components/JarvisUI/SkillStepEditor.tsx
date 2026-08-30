// src/components/JarvisUI/SkillStepEditor.tsx
// Редактор шага навыка

import { SkillStep } from '../../lib/jarvis/sandbox';
import { JARVIS_TOOLS } from '../../lib/jarvis/tools-schema';

interface SkillStepEditorProps {
  step: SkillStep;
  index: number;
  onChange: (step: SkillStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--border-color)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '4px 8px',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-color)',
  borderRadius: 3,
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '3px 7px',
  cursor: 'pointer',
  flexShrink: 0,
};

export function SkillStepEditor({
  step, index, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: SkillStepEditorProps) {
  const selectedTool = JARVIS_TOOLS.find((t) => t.name === step.tool);

  const setTool = (tool: string) => {
    onChange({ ...step, tool, args: {} });
  };

  const setArgValue = (key: string, value: string) => {
    onChange({ ...step, args: { ...step.args, [key]: value } });
  };

  const addArg = () => {
    const key = prompt('Имя параметра:');
    if (key) onChange({ ...step, args: { ...step.args, [key]: '' } });
  };

  const removeArg = (key: string) => {
    const { [key]: _, ...rest } = step.args;
    onChange({ ...step, args: rest });
  };

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 5,
      padding: '10px 12px',
      marginBottom: 8,
      background: 'rgba(0,0,0,0.25)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
          ШАГ {index + 1}
        </span>
        <div style={{ flex: 1 }} />
        <button style={btnStyle} onClick={onMoveUp} disabled={isFirst} title="Вверх">▲</button>
        <button style={btnStyle} onClick={onMoveDown} disabled={isLast} title="Вниз">▼</button>
        <button
          style={{ ...btnStyle, color: '#ef4444', borderColor: '#ef444455' }}
          onClick={onRemove}
          title="Удалить шаг"
        >✕</button>
      </div>

      {/* Tool selector */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 3 }}>
          Инструмент
        </label>
        <select
          value={step.tool}
          onChange={(e) => setTool(e.target.value)}
          style={{ ...inputStyle }}
        >
          <option value="">— выбрать —</option>
          {JARVIS_TOOLS.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} {t.safetyLevel === 'requires_confirmation' ? '⚠️' : ''}
            </option>
          ))}
        </select>
        {selectedTool && (
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>
            {selectedTool.description}
          </div>
        )}
      </div>

      {/* Args */}
      {selectedTool && (
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>Параметры</div>
          {/* Known params from schema */}
          {Object.entries(selectedTool.parameters.properties).map(([key, schema]) => (
            <div key={key} style={{ marginBottom: 5 }}>
              <label style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', marginBottom: 2 }}>
                {key} <span style={{ opacity: 0.5 }}>— {schema.description}</span>
              </label>
              {schema.enum ? (
                <select
                  value={(step.args[key] as string) ?? ''}
                  onChange={(e) => setArgValue(key, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— выбрать —</option>
                  {schema.enum.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={(step.args[key] as string) ?? ''}
                  onChange={(e) => setArgValue(key, e.target.value)}
                  placeholder={`{slot_name} или значение`}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          {/* Extra args */}
          {Object.keys(step.args).filter(
            (k) => !(k in selectedTool.parameters.properties)
          ).map((key) => (
            <div key={key} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
              <input
                type="text"
                value={(step.args[key] as string) ?? ''}
                onChange={(e) => setArgValue(key, e.target.value)}
                placeholder={key}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                style={{ ...btnStyle, color: '#ef4444', flexShrink: 0 }}
                onClick={() => removeArg(key)}
              >✕</button>
            </div>
          ))}

          <button
            style={{ ...btnStyle, fontSize: 10, marginTop: 4 }}
            onClick={addArg}
          >+ Параметр</button>
        </div>
      )}

      {/* Confirmation toggle for destructive */}
      {selectedTool?.safetyLevel === 'requires_confirmation' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <input
            type="checkbox"
            id={`confirm-${index}`}
            checked={step.requires_confirmation ?? true}
            onChange={(e) => onChange({ ...step, requires_confirmation: e.target.checked })}
          />
          <label htmlFor={`confirm-${index}`} style={{ color: '#f59e0b', fontSize: 10 }}>
            ⚠️ Требовать подтверждения
          </label>
        </div>
      )}
    </div>
  );
}
