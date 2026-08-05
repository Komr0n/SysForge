import { useState } from 'react';

interface Snippet {
  id: string;
  title: string;
  lang: string;
  code: string;
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: '1', title: 'Docker Clean All', lang: 'bash', code: 'docker system prune -a --volumes -f' },
  { id: '2', title: 'Nginx Reverse Proxy', lang: 'nginx', code: 'location /api/ {\n  proxy_pass http://127.0.0.1:8080/;\n  proxy_set_header Host $host;\n}' },
  { id: '3', title: 'UFW Firewall Setup', lang: 'bash', code: 'ufw default deny incoming\nufw default allow outgoing\nufw allow 22/tcp\nufw enable' },
];

export default function SnippetManager() {
  const [snippets, setSnippets] = useState<Snippet[]>(DEFAULT_SNIPPETS);
  const [activeId, setActiveId] = useState<string>('1');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeSnippet = snippets.find((s) => s.id === activeId) || snippets[0];

  const handleCopy = (snip: Snippet) => {
    navigator.clipboard.writeText(snip.code);
    setCopiedId(snip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'flex', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Sidebar List */}
      <div style={{ width: 180, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>SNIPPETS</div>
        {snippets.map((s) => (
          <div
            key={s.id}
            onClick={() => setActiveId(s.id)}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: `1px solid ${activeId === s.id ? 'var(--accent-primary)' : 'transparent'}`,
              background: activeId === s.id ? 'rgba(0,255,136,0.1)' : 'transparent',
              color: activeId === s.id ? 'var(--accent-primary)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.title}
          </div>
        ))}
      </div>

      {/* Code Editor Preview */}
      {activeSnippet && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' }}>{activeSnippet.title}</span>
            <button
              onClick={() => handleCopy(activeSnippet)}
              style={{
                background: copiedId === activeSnippet.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                color: copiedId === activeSnippet.id ? '#000' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {copiedId === activeSnippet.id ? 'COPIED!' : 'COPY CODE'}
            </button>
          </div>

          <textarea
            value={activeSnippet.code}
            onChange={(e) => {
              const updated = e.target.value;
              setSnippets((prev) => prev.map((item) => (item.id === activeSnippet.id ? { ...item, code: updated } : item)));
            }}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: 10,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              outline: 'none',
              resize: 'none',
              lineHeight: 1.5,
            }}
          />
        </div>
      )}
    </div>
  );
}
