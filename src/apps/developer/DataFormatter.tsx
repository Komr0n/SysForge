import { useState } from 'react';

export default function DataFormatter() {
  const [input, setInput] = useState('{"name":"SysForge","version":"1.0","active":true,"features":["network","security","system","developer"]}');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err) {
      setError(`Invalid JSON: ${String(err)}`);
    }
  };

  const handleMinify = () => {
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      setError(null);
    } catch (err) {
      setError(`Invalid JSON: ${String(err)}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleFormat}
          style={{ background: 'var(--accent-primary)', color: '#000', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 700, cursor: 'pointer' }}
        >
          FORMAT JSON
        </button>
        <button
          onClick={handleMinify}
          style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}
        >
          MINIFY
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</div>}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minHeight: 0 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste raw JSON here..."
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
        <textarea
          readOnly
          value={output}
          placeholder="Formatted result will appear here..."
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: 10,
            color: 'var(--accent-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            outline: 'none',
            resize: 'none',
          }}
        />
      </div>
    </div>
  );
}
