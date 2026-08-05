import { useState } from 'react';

export default function APITester() {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/todos/1');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [response, setResponse] = useState<string>('');

  const handleSend = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setStatus(null);
    setResponse('');

    try {
      const startTime = performance.now();
      const res = await fetch(url.trim(), { method });
      const elapsed = Math.round(performance.now() - startTime);

      setStatus(`${res.status} ${res.statusText} (${elapsed} ms)`);
      const data = await res.text();

      try {
        setResponse(JSON.stringify(JSON.parse(data), null, 2));
      } catch (_) {
        setResponse(data);
      }
    } catch (err) {
      setStatus('ERROR');
      setResponse(`Request Failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--accent-primary)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter API endpoint URL..."
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          style={{
            background: loading ? 'rgba(100,116,139,0.3)' : 'var(--accent-primary)',
            color: loading ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: 4,
            padding: '6px 16px',
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'SENDING...' : 'SEND'}
        </button>
      </div>

      {status && (
        <div style={{ color: status.startsWith('2') ? 'var(--accent-primary)' : 'var(--danger)', fontSize: 11 }}>
          STATUS: {status}
        </div>
      )}

      <textarea
        readOnly
        value={response}
        placeholder="Response payload will be rendered here..."
        style={{
          flex: 1,
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
  );
}
