import React, { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

/* ---------- Card ---------- */
export function Card({ title, children, style }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'rgba(17, 24, 39, 0.8)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: 12,
        ...style,
      }}
    >
      {title && (
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------- Button ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}
export function Button({ variant = 'secondary', size = 'md', style, children, ...rest }: BtnProps) {
  const palettes: Record<string, React.CSSProperties> = {
    primary: { background: 'rgba(0, 255, 136, 0.15)', borderColor: 'rgba(0, 255, 136, 0.4)', color: 'var(--accent-primary)' },
    secondary: { background: 'rgba(30, 41, 59, 0.8)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' },
    danger: { background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)' },
    ghost: { background: 'transparent', borderColor: 'transparent', color: 'var(--text-muted)' },
  };
  const base: React.CSSProperties = {
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    transition: 'box-shadow 0.2s, background 0.2s',
    padding: size === 'sm' ? '3px 8px' : '6px 12px',
    fontSize: size === 'sm' ? 11 : 12,
    ...palettes[variant],
  };
  return (
    <button {...rest} style={{ ...base, ...style }}>
      {children}
    </button>
  );
}

/* ---------- Input ---------- */
interface InpProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  mono?: boolean;
}
export function Input({ label, mono, style, ...rest }: InpProps) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
          {label}
        </span>
      )}
      <input
        {...rest}
        style={{
          width: '100%',
          background: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
          fontSize: 12,
          padding: '6px 10px',
          outline: 'none',
          transition: 'border-color 0.2s',
          ...style,
        }}
      />
    </label>
  );
}

/* ---------- Textarea ---------- */
interface TaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  mono?: boolean;
}
export function Textarea({ label, mono, style, ...rest }: TaProps) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
          {label}
        </span>
      )}
      <textarea
        {...rest}
        style={{
          width: '100%',
          background: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
          fontSize: 12,
          padding: 8,
          outline: 'none',
          resize: 'vertical',
          transition: 'border-color 0.2s',
          ...style,
        }}
      />
    </label>
  );
}

/* ---------- Select ---------- */
interface SelProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}
export function Select({ label, options, style, ...rest }: SelProps) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>
          {label}
        </span>
      )}
      <select
        {...rest}
        style={{
          width: '100%',
          background: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          padding: '6px 10px',
          outline: 'none',
          ...style,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#0a0e1a' }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Badge ---------- */
export function Badge({ color = '#00ff88', children }: { color?: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
      }}
    >
      {children}
    </span>
  );
}

/* ---------- Small Section ---------- */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}