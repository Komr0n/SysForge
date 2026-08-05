import { useEffect, useState, useRef } from 'react';

/**
 * MiniTerminal — cinematic typing terminal widget.
 * Cycles through sysadmin-style command sequences with typewriter effect.
 */

interface Line {
  type: 'cmd' | 'out' | 'ok' | 'warn';
  text: string;
}

const SEQUENCES: Line[][] = [
  [
    { type: 'cmd', text: '$ nmap -sV 10.0.0.0/24' },
    { type: 'out', text: 'Starting Nmap 7.94 ( https://nmap.org )' },
    { type: 'out', text: 'Discovered 14 hosts on subnet' },
    { type: 'ok', text: '10.0.0.1    22/tcp   open  ssh     OpenSSH 9.0' },
    { type: 'ok', text: '10.0.0.5    80/tcp   open  http    nginx 1.25' },
    { type: 'ok', text: '10.0.0.5    443/tcp  open  https   nginx 1.25' },
    { type: 'warn', text: '10.0.0.12   3389/tcp open  ms-wbt  risky' },
    { type: 'out', text: 'Scan done: 14 hosts in 4.21s' },
  ],
  [
    { type: 'cmd', text: '$ ssh admin@prod-server-01' },
    { type: 'out', text: 'Welcome to Ubuntu 22.04.3 LTS' },
    { type: 'ok', text: '● System load:   0.23 0.18 0.15' },
    { type: 'ok', text: '● Memory:        4.2G / 32G' },
    { type: 'ok', text: '● Disk usage:    41% / 512G' },
    { type: 'warn', text: '● Updates:       12 pending' },
    { type: 'out', text: 'Last login: 14:32 from 10.0.0.42' },
  ],
  [
    { type: 'cmd', text: '$ docker ps --format "{{.Names}}"' },
    { type: 'ok', text: 'nginx-proxy     running   ↑ 32d' },
    { type: 'ok', text: 'postgres-db     running   ↑ 18d' },
    { type: 'ok', text: 'redis-cache     running   ↑ 18d' },
    { type: 'warn', text: 'auth-service    restart   ✗' },
    { type: 'out', text: '4 containers, 3 healthy' },
  ],
  [
    { type: 'cmd', text: '$ tail -f /var/log/auth.log' },
    { type: 'ok', text: 'accepted password for root from 10.0.0.5' },
    { type: 'warn', text: 'failed password from 185.x.x.x port 22' },
    { type: 'warn', text: 'failed password from 185.x.x.x port 22' },
    { type: 'ok', text: 'blocked: 185.x.x.x after 5 attempts' },
    { type: 'out', text: 'monitoring active...' },
  ],
];

const COLORS: Record<Line['type'], string> = {
  cmd: '#00ff88',
  out: '#94a3b8',
  ok: '#22d3ee',
  warn: '#f59e0b',
};

const W = 280;

export default function MiniTerminal() {
  const [lines, setLines] = useState<Line[]>([]);
  const [currentText, setCurrentText] = useState('');
  const seqIdxRef = useRef(0);
  const lineIdxRef = useRef(0);
  const charIdxRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      while (!cancelled) {
        const seq = SEQUENCES[seqIdxRef.current];
        if (lineIdxRef.current >= seq.length) {
          // Sequence done — pause, then reset
          await wait(2200);
          if (cancelled) return;
          seqIdxRef.current = (seqIdxRef.current + 1) % SEQUENCES.length;
          lineIdxRef.current = 0;
          setLines([]);
          continue;
        }

        const line = seq[lineIdxRef.current];

        // Type out the line character-by-character
        for (charIdxRef.current = 0; charIdxRef.current <= line.text.length; charIdxRef.current++) {
          if (cancelled) return;
          setCurrentText(line.text.slice(0, charIdxRef.current));
          // Faster for output, slower for commands
          await wait(line.type === 'cmd' ? 35 : 12);
        }

        // Commit the line
        setLines((prev) => [...prev, line]);
        setCurrentText('');
        lineIdxRef.current++;
        await wait(line.type === 'cmd' ? 400 : 150);
      }
    };

    tick();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, currentText]);

  const currentLine = SEQUENCES[seqIdxRef.current][lineIdxRef.current];

  return (
    <div style={{ width: W, overflow: 'hidden' }}>
      {/* Terminal body */}
      <div ref={scrollRef} style={{
        padding: 10,
        height: 180,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1.6,
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: COLORS[l.type], whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {l.text}
          </div>
        ))}
        {currentText !== '' && (
          <div style={{ color: COLORS[currentLine.type], whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {currentText}<span className="animate-pulse" style={{ opacity: 0.7 }}>▊</span>
          </div>
        )}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
