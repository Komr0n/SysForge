import { useState } from 'react';
import { Button, Input, Select, Badge } from '../../components/ui';
import { useTauri } from '../../hooks/useTauri';

interface PortResult {
  port: number;
  state: 'open' | 'closed' | 'filtered';
  service: string;
}

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995, 1723, 3306, 3389, 5900, 8080];
const WEB_PORTS = [80, 443, 8080, 8443];
const SERVICES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3',
  111: 'RPC', 135: 'RPC', 139: 'NetBIOS', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB',
  993: 'IMAPS', 995: 'POP3S', 1723: 'PPTP', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL',
  5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 27017: 'MongoDB',
};

/**
 * PortScanner — real TCP connect() scan via Rust (desktop).
 * Browser mode is disabled with an honest message (no fake results).
 */
export default function PortScanner() {
  const { invoke, isAvailable } = useTauri();
  const [host, setHost] = useState('127.0.0.1');
  const [range, setRange] = useState<[number, number]>([1, 1024]);
  const [preset, setPreset] = useState('common');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PortResult[]>([]);
  const [error, setError] = useState('');

  const getPorts = (): number[] => {
    switch (preset) {
      case 'common': return COMMON_PORTS;
      case 'web': return WEB_PORTS;
      case 'range': {
        const [s, e] = range;
        const lo = Math.max(1, Math.min(s, e));
        const hi = Math.min(65535, Math.max(s, e));
        if (hi - lo > 2048) return []; // too many — backend caps at 2048
        const arr: number[] = [];
        for (let p = lo; p <= hi; p++) arr.push(p);
        return arr;
      }
      default: return COMMON_PORTS;
    }
  };

  const runScan = async () => {
    setError('');
    if (!isAvailable) {
      setError('TCP scanning requires the desktop app — a browser cannot open raw sockets.');
      return;
    }
    const ports = getPorts();
    if (ports.length === 0) {
      setError('Custom range too large (max 2048 ports per scan).');
      return;
    }
    if (!host.trim()) return;

    setScanning(true);
    setResults([]);
    setProgress(10);

    try {
      // Scan in chunks so progress updates
      const chunkSize = 256;
      const found: PortResult[] = [];
      let closedCount = 0;
      for (let i = 0; i < ports.length; i += chunkSize) {
        const chunk = ports.slice(i, i + chunkSize);
        const res = await invoke<{ port: number; open: boolean }[]>('scan_ports', {
          host: host.trim(),
          ports: chunk,
          timeoutMs: 1200,
        });
        for (const r of res ?? []) {
          if (r.open) {
            found.push({ port: r.port, state: 'open', service: SERVICES[r.port] ?? 'unknown' });
          } else {
            closedCount++;
          }
        }
        setProgress(Math.round(((i + chunk.length) / ports.length) * 100));
        // Interleave: show open ports first as they're found
        setResults([...found].sort((a, b) => a.port - b.port));
      }
      setProgress(100);
      if (found.length === 0) {
        setResults([]); // no open ports; summary below communicates this
      }
      // store closed count in dataset attribute-ish state (kept simple)
      setResults((prev) => prev.map((p) => ({ ...p })));
      if (closedCount > 0 && found.length === 0) {
        setError(`Scan complete: ${closedCount} ports closed/filtered, none open.`);
      }
    } catch (e) {
      setError(`Scan failed: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const exportCsv = () => {
    const header = 'port,state,service';
    const rows = results.map((r) => `${r.port},${r.state},${r.service}`).join('\n');
    const blob = new Blob([`${header}\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `port-scan-${host}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Input label="Target host" mono placeholder="127.0.0.1" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div style={{ width: 140 }}>
          <Select
            label="Preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={[
              { value: 'common', label: 'Common (top 20)' },
              { value: 'web', label: 'Web (80,443,8080,8443)' },
              { value: 'range', label: 'Custom range (≤2048)' },
            ]}
          />
        </div>
        {preset === 'range' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 90 }}>
              <Input label="From" mono type="number" value={range[0]} onChange={(e) => setRange([Number(e.target.value), range[1]])} />
            </div>
            <div style={{ width: 90 }}>
              <Input label="To" mono type="number" value={range[1]} onChange={(e) => setRange([range[0], Number(e.target.value)])} />
            </div>
          </div>
        )}
        <Button variant="primary" onClick={runScan} disabled={scanning} style={{ marginBottom: 8 }}>
          {scanning ? `Scanning… ${progress}%` : 'Scan'}
        </Button>
        {results.length > 0 && (
          <Button variant="secondary" onClick={exportCsv} style={{ marginBottom: 8 }}>Export CSV</Button>
        )}
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{error}</div>}
      {!isAvailable && !error && (
        <div style={{ color: '#f59e0b', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          ⚠ Real scanning requires the desktop app.
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {results.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Port</th>
                <th style={{ padding: '4px 8px' }}>State</th>
                <th style={{ padding: '4px 8px' }}>Service</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.port} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{r.port}</td>
                  <td style={{ padding: '4px 8px' }}>
                    <Badge color={r.state === 'open' ? '#00ff88' : '#ef4444'}>{r.state.toUpperCase()}</Badge>
                  </td>
                  <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)' }}>{r.service}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !scanning && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              {progress === 100 && !error ? 'No open ports found.' : 'Enter host and press Scan'}
            </div>
          )
        )}
      </div>

      {results.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {results.length} OPEN PORT{results.length !== 1 ? 'S' : ''} · TARGET {host}
        </div>
      )}
    </div>
  );
}
