import { useState, useRef, useCallback } from 'react';
import { Button, Input, Select, Badge, Card } from '../../components/ui';
import { useInterval } from '../../hooks/useInterval';

interface PingEntry {
  id: string;
  host: string;
  latency: number | null;
  success: boolean;
  min: number;
  max: number;
  loss: number;
  history: number[];
}

let pingId = 0;

function simulatePing(host: string): Promise<number> {
  return new Promise((resolve) => {
    const base = host.length * 5 + Math.random() * 60;
    const jitter = Math.random() * 40;
    const latency = Math.max(5, base + jitter);
    setTimeout(() => resolve(latency), 200 + Math.random() * 300);
  });
}

export default function PingMonitor() {
  const [hosts, setHosts] = useState<string[]>(['8.8.8.8']);
  const [hostInput, setHostInput] = useState('');
  const [intervalMs, setIntervalMs] = useState(2000);
  const [entries, setEntries] = useState<Record<string, PingEntry>>({});
  const [paused, setPaused] = useState(false);
  const [runningCount, setRunningCount] = useState(0);

  const pingAll = useCallback(async () => {
    if (paused) return;
    const results: PingEntry[] = await Promise.all(
      hosts.map(async (host) => {
        try {
          const latency = await simulatePing(host);
          const prev = entries[host];
          const history = [...(prev?.history ?? []), latency].slice(-30);
          return {
            id: `row-${pingId++}`,
            host,
            latency,
            success: true,
            min: prev ? Math.min(prev.min, latency) : latency,
            max: prev ? Math.max(prev.max, latency) : latency,
            loss: prev ? prev.loss : 0,
            history,
          };
        } catch {
          const prev = entries[host];
          return {
            id: `row-${pingId++}`,
            host,
            latency: null,
            success: false,
            min: prev?.min ?? 0,
            max: prev?.max ?? 0,
            loss: Math.min(100, (prev?.loss ?? 0) + 20),
            history: [...(prev?.history ?? []), -1].slice(-30),
          };
        }
      })
    );

    setRunningCount(results.length);
    const next: Record<string, PingEntry> = {};
    results.forEach((r) => (next[r.host] = r));
    setEntries((prev) => ({ ...prev, ...next }));
  }, [hosts, entries, paused]);

  useInterval(pingAll, intervalMs);

  const addHost = () => {
    const h = hostInput.trim();
    if (h && !hosts.includes(h)) {
      setHosts([...hosts, h]);
      setHostInput('');
    }
  };

  const removeHost = (host: string) => {
    setHosts(hosts.filter((h) => h !== host));
    setEntries((prev) => {
      const next = { ...prev };
      delete next[host];
      return next;
    });
  };

  const latencyColor = (l: number | null) => {
    if (l === null) return '#ef4444';
    if (l < 50) return '#00ff88';
    if (l < 150) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            label="Host / IP"
            placeholder="e.g. 8.8.8.8"
            mono
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHost()}
          />
        </div>
        <Button variant="primary" onClick={addHost} style={{ marginBottom: 8 }}>Add</Button>
        <div style={{ width: 110, marginBottom: 8 }}>
          <Select
            label="Interval"
            value={String(intervalMs)}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            options={[
              { value: '1000', label: '1s' },
              { value: '2000', label: '2s' },
              { value: '5000', label: '5s' },
              { value: '10000', label: '10s' },
            ]}
          />
        </div>
        <Button variant={paused ? 'primary' : 'secondary'} onClick={() => setPaused(!paused)} style={{ marginBottom: 8 }}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {/* Hosts row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {hosts.map((h) => (
          <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(2,6,23,0.6)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{h}</span>
            <span
              style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
              onClick={() => removeHost(h)}
              title="Remove"
            >
              ✕
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={thStyle}>Host</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Latency</th>
              <th style={thStyle}>Min</th>
              <th style={thStyle}>Max</th>
              <th style={thStyle}>Loss %</th>
              <th style={thStyle}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((host) => {
              const e = entries[host];
              return (
                <tr key={host} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)' }}>{host}</span></td>
                  <td style={tdStyle}>
                    {!e ? (
                      <Badge color="#64748b">WAITING</Badge>
                    ) : e.success ? (
                      <Badge color="#00ff88">ONLINE</Badge>
                    ) : (
                      <Badge color="#ef4444">TIMEOUT</Badge>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: e ? latencyColor(e.latency) : 'var(--text-muted)' }}>
                      {e?.success ? `${e.latency?.toFixed(1)} ms` : '—'}
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)' }}>{e?.min.toFixed(1) ?? '—'}</span></td>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)' }}>{e?.max.toFixed(1) ?? '—'}</span></td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: e && e.loss > 20 ? '#ef4444' : 'var(--text-muted)' }}>
                      {e?.loss.toFixed(0) ?? '0'}%
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {e && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 24 }}>
                        {e.history.map((v, i) => (
                          <div
                            key={i}
                            style={{
                              width: 3,
                              height: v === -1 ? 2 : Math.max(2, (v / 200) * 24),
                              background: v === -1 ? '#ef4444' : latencyColor(v),
                              opacity: 0.6 + (i / e.history.length) * 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        MONITORING {hosts.length} HOST{hosts.length !== 1 ? 'S' : ''} · {runningCount > 0 ? `LAST CYCLE: ${runningCount} OK` : 'AWAITING FIRST CYCLE'}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '4px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 8px' };