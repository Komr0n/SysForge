import { useState } from 'react';

export default function DiffViewer() {
  const [textA, setTextA] = useState('server {\n  listen 80;\n  server_name sysforge.local;\n  root /var/www/html;\n}');
  const [textB, setTextB] = useState('server {\n  listen 443 ssl;\n  server_name sysforge.local;\n  root /var/www/sysforge;\n  ssl_certificate /etc/ssl/cert.pem;\n}');

  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const maxLines = Math.max(linesA.length, linesB.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ORIGINAL TEXT (A)</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MODIFIED TEXT (B)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, height: 120 }}>
        <textarea
          value={textA}
          onChange={(e) => setTextA(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
        />
        <textarea
          value={textB}
          onChange={(e) => setTextB(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
        />
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: 4, background: 'rgba(0,0,0,0.5)', overflowY: 'auto', padding: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>DIFF COMPARISON:</div>
        {Array.from({ length: maxLines }).map((_, i) => {
          const a = linesA[i] ?? '';
          const b = linesB[i] ?? '';
          const isDiff = a !== b;

          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
              <div style={{ background: isDiff && a ? 'rgba(239,68,68,0.15)' : 'transparent', color: isDiff && a ? 'var(--danger)' : 'var(--text-muted)', padding: '1px 4px' }}>
                {a || <span style={{ opacity: 0.3 }}>-</span>}
              </div>
              <div style={{ background: isDiff && b ? 'rgba(0,255,136,0.15)' : 'transparent', color: isDiff && b ? 'var(--accent-primary)' : 'var(--text-muted)', padding: '1px 4px' }}>
                {b || <span style={{ opacity: 0.3 }}>-</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
