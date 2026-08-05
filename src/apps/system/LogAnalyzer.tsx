import { useState, DragEvent } from 'react';

interface ParsedLogLine {
  id: number;
  raw: string;
  type: 'error' | 'warn' | 'info' | 'debug';
}

const SAMPLE_LOG = `Aug 05 14:22:01 server-01 CRON[1234]: (root) CMD (test -x /usr/sbin/anacron || out)
Aug 05 14:22:15 server-01 kernel: [UFW BLOCK] IN=eth0 OUT= MAC=00:15:5d:01:02 SRC=185.220.101.45 DST=192.168.1.100 PROTO=TCP
Aug 05 14:22:30 server-01 sshd[5678]: Failed password for invalid user admin from 185.220.101.45 port 44210 ssh2
Aug 05 14:22:32 server-01 sshd[5678]: Failed password for invalid user root from 185.220.101.45 port 44212 ssh2
Aug 05 14:22:35 server-01 sshd[5678]: Failed password for invalid user root from 185.220.101.45 port 44214 ssh2
Aug 05 14:22:38 server-01 sshd[5680]: Accepted publickey for sysadmin from 10.0.0.5 port 52140 ssh2: RSA SHA256:abc123xyz
Aug 05 14:23:01 server-01 nginx: 192.168.1.50 - - [05/Aug/2026:14:23:01] "GET /api/v1/health HTTP/1.1" 200 45 "-"
Aug 05 14:23:05 server-01 nginx: 185.220.101.45 - - [05/Aug/2026:14:23:05] "POST /admin/login HTTP/1.1" 403 120 "-"
Aug 05 14:23:10 server-01 systemd[1]: auth-service.service: Main process exited, code=exited, status=1/FAILURE
Aug 05 14:23:11 server-01 systemd[1]: auth-service.service: Failed with result 'exit-code'.`;

export default function LogAnalyzer() {
  const [logText, setLogText] = useState(SAMPLE_LOG);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [search, setSearch] = useState('');

  const parseLines = (text: string): ParsedLogLine[] => {
    return text.split('\n').map((line, idx) => {
      const lower = line.toLowerCase();
      let type: ParsedLogLine['type'] = 'info';
      if (lower.includes('error') || lower.includes('failed') || lower.includes('failure') || lower.includes('block')) {
        type = 'error';
      } else if (lower.includes('warn') || lower.includes('invalid') || lower.includes('restart')) {
        type = 'warn';
      }
      return { id: idx, raw: line, type };
    });
  };

  const lines = parseLines(logText);

  const filteredLines = lines.filter((l) => {
    if (filter === 'error' && l.type !== 'error') return false;
    if (filter === 'warn' && l.type !== 'warn' && l.type !== 'error') return false;
    if (search && !l.raw.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const errorCount = lines.filter((l) => l.type === 'error').length;
  const warnCount = lines.filter((l) => l.type === 'warn').length;

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setLogText(String(ev.target.result));
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}
    >
      {/* Controls & Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <input
          type="text"
          placeholder="Filter logs by keyword / IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${filter === 'all' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: filter === 'all' ? 'rgba(0,255,136,0.1)' : 'transparent',
              color: filter === 'all' ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            ALL ({lines.length})
          </button>
          <button
            onClick={() => setFilter('error')}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${filter === 'error' ? 'var(--danger)' : 'var(--border-color)'}`,
              background: filter === 'error' ? 'rgba(239,68,68,0.1)' : 'transparent',
              color: filter === 'error' ? 'var(--danger)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            ERRORS ({errorCount})
          </button>
        </div>
      </div>

      {/* Log Output Area */}
      <div
        style={{
          flex: 1,
          background: 'rgba(0,0,0,0.5)',
          border: '1px dashed var(--border-color)',
          borderRadius: 4,
          padding: 10,
          overflowY: 'auto',
          lineHeight: 1.6,
        }}
      >
        {filteredLines.map((l) => (
          <div
            key={l.id}
            style={{
              color: l.type === 'error' ? 'var(--danger)' : l.type === 'warn' ? 'var(--warning)' : 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {l.raw}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
        Tip: Drag & Drop any .log or .txt file directly into this window.
      </div>
    </div>
  );
}
