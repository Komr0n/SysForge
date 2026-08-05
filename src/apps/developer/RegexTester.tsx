import { useState } from 'react';

export default function RegexTester() {
  const [pattern, setPattern] = useState('\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b');
  const [flags, setFlags] = useState('g');
  const [testText, setTestText] = useState('Contact support@sysforge.app or admin@domain.org for help.');
  const [matches, setMatches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleTest = () => {
    try {
      if (!pattern) {
        setMatches([]);
        setError(null);
        return;
      }
      const regex = new RegExp(pattern, flags);
      const m = testText.match(regex) || [];
      setMatches(m);
      setError(null);
    } catch (err) {
      setError(String(err));
      setMatches([]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Pattern Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="Regex Pattern..."
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--accent-primary)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
        <input
          type="text"
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
          placeholder="Flags (gi)"
          style={{
            width: 60,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            textAlign: 'center',
            outline: 'none',
          }}
        />
        <button
          onClick={handleTest}
          style={{ background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 700, cursor: 'pointer' }}
        >
          TEST REGEX
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</div>}

      <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10, minHeight: 0 }}>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Test string..."
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: 10,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            outline: 'none',
            resize: 'none',
          }}
        />
        <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 10, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>MATCHES FOUND ({matches.length}):</div>
          {matches.map((m, i) => (
            <div key={i} style={{ color: 'var(--accent-primary)', marginBottom: 4 }}>
              Match #{i + 1}: <span style={{ background: 'rgba(0,255,136,0.15)', padding: '2px 4px', borderRadius: 2 }}>{m}</span>
            </div>
          ))}
          {matches.length === 0 && !error && <div style={{ color: 'var(--text-muted)' }}>No matches found.</div>}
        </div>
      </div>
    </div>
  );
}
