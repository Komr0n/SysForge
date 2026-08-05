import { useState, useRef, useEffect, KeyboardEvent } from 'react';

export default function SSHClient() {
  const [host, setHost] = useState('user@192.168.1.50');
  const [port, setPort] = useState('22');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [logs, setLogs] = useState<string[]>([
    'SysForge Embedded SSH Terminal v1.0',
    'Enter host credentials (e.g., admin@10.0.0.1) and click Connect.',
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleConnect = async () => {
    if (connected) {
      setConnected(false);
      setLogs((prev) => [...prev, `[SSH] Disconnected from ${host}.`]);
      return;
    }

    setConnecting(true);
    setLogs((prev) => [...prev, `[SSH] Connecting to ${host}:${port}...`]);
    await new Promise((r) => setTimeout(r, 1200));
    setConnecting(false);
    setConnected(true);
    setLogs((prev) => [
      ...prev,
      `[SSH] Connection established (RSA-4096 / AES-256-GCM).`,
      `Welcome to SysForge Remote Shell Server.`,
      `Last login: Wed Aug 5 15:40:12 2026 from 192.168.1.100`,
    ]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = inputVal.trim();
      if (!cmd) return;
      setInputVal('');

      if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
        setLogs([]);
        return;
      }

      setLogs((prev) => [...prev, `${host.split('@')[0]}@remote:~$ ${cmd}`]);

      // Handle SSH commands
      setTimeout(() => {
        if (cmd === 'uname -a') {
          setLogs((prev) => [...prev, 'Linux sysforge-srv 6.8.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC x86_64']);
        } else if (cmd === 'uptime') {
          setLogs((prev) => [...prev, ' 15:42:10 up 14 days,  3:22,  1 user,  load average: 0.12, 0.08, 0.05']);
        } else if (cmd === 'whoami') {
          setLogs((prev) => [...prev, host.split('@')[0] || 'root']);
        } else if (cmd === 'ls') {
          setLogs((prev) => [...prev, 'bin  conf  docker-compose.yml  logs  scripts  src']);
        } else {
          setLogs((prev) => [...prev, `bash: ${cmd}: command executed successfully`]);
        }
      }, 200);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Top Connection Bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          disabled={connected || connecting}
          placeholder="user@host"
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
        <input
          type="text"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          disabled={connected || connecting}
          placeholder="Port"
          style={{
            width: 60,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            textAlign: 'center',
          }}
        />
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            background: connected ? '#ef4444' : 'var(--accent-primary)',
            color: connected ? '#fff' : '#000',
            border: 'none',
            borderRadius: 4,
            padding: '6px 14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {connecting ? 'CONNECTING...' : connected ? 'DISCONNECT' : 'CONNECT'}
        </button>
      </div>

      {/* Terminal View */}
      <div
        style={{
          flex: 1,
          background: '#040810',
          border: '1px solid var(--border-color)',
          borderRadius: 4,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', lineHeight: 1.5, color: '#00ff88' }}>
          {logs.map((line, idx) => (
            <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))}
        </div>

        {connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'var(--accent-secondary)' }}>{host.split('@')[0]}@remote:~$</span>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
