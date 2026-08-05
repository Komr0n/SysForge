import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useTauri } from '../../hooks/useTauri';

interface LogLine {
  id: string;
  type: 'cmd' | 'output' | 'error' | 'info';
  text: string;
}

export default function MiniTerminal() {
  const { invoke, isAvailable } = useTauri();
  const [history, setHistory] = useState<LogLine[]>([
    { id: '1', type: 'info', text: 'SysForge Terminal v1.0 — type "help" for commands' },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isExec, setIsExec] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, isExec]);

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const nextIdx = historyIdx < cmdHistory.length - 1 ? historyIdx + 1 : historyIdx;
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[cmdHistory.length - 1 - nextIdx] || '');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[cmdHistory.length - 1 - nextIdx] || '');
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
      return;
    }

    if (e.key === 'Enter') {
      const command = inputVal.trim();
      if (!command) return;

      setInputVal('');
      setHistoryIdx(-1);
      setCmdHistory((prev) => [...prev, command]);

      if (command.toLowerCase() === 'cls' || command.toLowerCase() === 'clear') {
        setHistory([]);
        return;
      }

      setHistory((prev) => [...prev, { id: String(Date.now()), type: 'cmd', text: `$ ${command}` }]);
      setIsExec(true);

      if (isAvailable) {
        try {
          const res = await invoke<string>('run_terminal_command', { command });
          setHistory((prev) => [...prev, { id: String(Date.now() + 1), type: 'output', text: res || '(empty output)' }]);
        } catch (err) {
          setHistory((prev) => [...prev, { id: String(Date.now() + 1), type: 'error', text: String(err) }]);
        }
      } else {
        await new Promise((r) => setTimeout(r, 200));
        const mockResp = getMockResponse(command);
        setHistory((prev) => [...prev, { id: String(Date.now() + 1), type: mockResp.type, text: mockResp.text }]);
      }

      setIsExec(false);
    }
  };

  function getMockResponse(cmd: string): { type: 'output' | 'error'; text: string } {
    const parts = cmd.toLowerCase().split(' ');
    switch (parts[0]) {
      case 'help':
        return { type: 'output', text: 'Commands: ping, tracert, nslookup, netstat, ipconfig, whoami, uptime, echo, cls, help' };
      case 'whoami':
        return { type: 'output', text: 'sysforge\\administrator' };
      case 'uptime':
        return { type: 'output', text: 'Uptime: 4d 12h 34m 22s' };
      case 'ping':
        return { type: 'output', text: `Pinging ${parts[1] || 'localhost'} [127.0.0.1]:\nReply: bytes=32 time<1ms TTL=128\nReply: bytes=32 time<1ms TTL=128\nLost = 0 (0% loss)` };
      case 'echo':
        return { type: 'output', text: parts.slice(1).join(' ') || '' };
      case 'ipconfig':
        return { type: 'output', text: 'IPv4: 192.168.1.100  Mask: 255.255.255.0\nGateway: 192.168.1.1  DNS: 8.8.8.8' };
      case 'netstat':
        return { type: 'output', text: 'Proto  Local          Foreign        State\nTCP    0.0.0.0:80     *:*            LISTENING\nTCP    0.0.0.0:443    *:*            LISTENING' };
      default:
        return { type: 'error', text: `'${parts[0]}': command not found. Type 'help'.` };
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#030608',
        color: '#e2e8f0',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        overflow: 'hidden',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Title bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.4)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1.5 }}>TERMINAL</span>
        <span style={{ fontSize: 9, color: isAvailable ? 'var(--accent-primary)' : '#f59e0b' }}>
          {isAvailable ? '● LIVE' : '● MOCK'}
        </span>
      </div>

      {/* Output scroll area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px', lineHeight: 1.55 }}>
        {history.map((h) => (
          <div
            key={h.id}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color:
                h.type === 'cmd' ? 'var(--accent-primary)'
                : h.type === 'error' ? '#ef4444'
                : h.type === 'info' ? '#0ea5e9'
                : 'var(--text-primary)',
              marginBottom: 1,
            }}
          >
            {h.text}
          </div>
        ))}
        {isExec && <div style={{ color: '#f59e0b' }}>running...</div>}
      </div>

      {/* Input row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px 4px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}>
        <span style={{ color: 'var(--accent-primary)', fontWeight: 700, flexShrink: 0 }}>$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExec}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            caretColor: 'var(--accent-primary)',
          }}
          placeholder="type command..."
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
