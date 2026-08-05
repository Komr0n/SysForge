import { useState } from 'react';
import { Button, Input, Select, Badge } from '../../components/ui';

interface PortResult {
  port: number;
  state: 'open' | 'closed';
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

export default function PortScanner() {
  const [host, setHost] = useState('127.0.0.1');
  const [range, setRange] = useState<[number, number]>([1, 100]);
  const [preset, setPreset] = useState('common');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PortResult[]>([]);
  const [openCount, setOpenCount] = useState(0);

  const getPorts = (): number[] => {
    switch (preset) {
      case 'common': return COMMON_PORTS;
      case 'web': return WEB_PORTS;
      case 'range': {
        const [s, e] = range;
        const arr: number[] = [];
        for (let p = s; p <= Math.min(e, 10000); p++) arr.push(p);
        return arr;
      }
      default: return COMMON_PORTS;
    }
  };

  const runScan = async () => {
    setScanning(true);
    setResults([]);
    setOpenCount(0);
    setProgress(0);
    const ports = getPorts();
    const found: PortResult[] = [];

    for (let i = 0; i < ports.length; i += 5) {
      const chunk = ports.slice(i, i + 5);
      for (const port of chunk) {
        const isOpen = Math.random() < 0.18;
        if (isOpen) {
          found.push({ port, state: 'open', service: SERVICES[port] ?? 'unknown' });
        }
      }
      setProgress(Math.round(((i + chunk.length) / ports.length) * 100));
      await new Promise((r) => setTimeout(r, 25));
    }

    const closed = ports.filter((p) => !found.some((f) => f.port === p)).slice(0, 20).map((port) => ({
      port,
      state: 'closed' as const,
      service: SERVICES[port] ?? '—',
    }));

    setResults([...found, ...closed].sort((a, b) => a.port - b.port));
    setOpenCount(found.length);
    setScanning(false);
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
              { value: 'range', label: 'Custom range' },
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
          {scanning ? 'Scanning...' : 'Scan'}
        </Button>
        {results.length > 0 && (
          <Button variant="secondary" onClick={exportCsv} style={{ marginBottom: 8 }}>Export CSV</Button>
        )}
      </div>

      {scanning && (
        <div>
          <div style={{ height: 4, background: 'rgba(0,255,136,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-primary)', boxShadow: '0 0 8px var(--accent-primary)', transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>SCANNING... {progress}%</div>
        </div>
      )}

      {!scanning && results.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge color="#00ff88">{openCount} OPEN</Badge>
          <Badge color="#64748b">{results.length - openCount} CLOSED</Badge>
          <Badge color="#0ea5e9">{host}</Badge>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {results.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={thStyle}>Port</th>
                <th style={thStyle}>State</th>
                <th style={thStyle}>Service</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.port} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)' }}>{r.port}</span></td>
                  <td style={tdStyle}>
                    <Badge color={r.state === 'open' ? '#00ff88' : '#64748b'}>
                      {r.state.toUpperCase()}
                    </Badge>
                  </td>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)', color: r.state === 'open' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.service}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {scanning ? 'Scanning...' : 'Configure and run a scan to see results'}
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '4px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 8px' };