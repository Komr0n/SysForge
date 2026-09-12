import { useState } from 'react';
import { useTauri } from '../../hooks/useTauri';

export default function Traceroute() {
  const { invoke, isAvailable } = useTauri();
  const [host, setHost] = useState('8.8.8.8');
  const [maxHops, setMaxHops] = useState<number>(30);
  const [noDns, setNoDns] = useState<boolean>(true); // -d flag on Windows
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>('');

  const handleTrace = async () => {
    if (!host.trim()) return;
    setLoading(true);
    setOutput('Initiating route trace...\n');

    if (isAvailable) {
      try {
        const res = await invoke<string>('traceroute_host', {
          host: host.trim(),
          maxHops: maxHops,
          noFragment: noDns,
        });
        setOutput(res || 'Traceroute completed with no output.');
      } catch (err) {
        setOutput(`Error: ${String(err)}`);
      }
    } else {
      // Mock traceroute simulation for browser mode
      const flags = `${noDns ? ' -d' : ''} -h ${maxHops}`;
      let lines = [`Tracing route to ${host} over a maximum of ${maxHops} hops (flags:${flags}):\n`];
      setOutput(lines.join('\n'));

      const mockHops = [
        '1    <1 ms    <1 ms    <1 ms  192.168.1.1',
        '2    8 ms     7 ms     9 ms   10.0.0.1',
        '3    12 ms    11 ms    14 ms  ' + (noDns ? '185.220.101.1' : 'provider-gateway.net [185.220.101.1]'),
        '4    18 ms    17 ms    19 ms  ' + (noDns ? '195.12.50.2' : 'core-router-01.net [195.12.50.2]'),
        '5    25 ms    24 ms    26 ms  ' + (noDns ? '142.250.160.1' : 'edge-switch-02.net [142.250.160.1]'),
        '6    24 ms    23 ms    25 ms  ' + (noDns ? '8.8.8.8' : 'dns.google [8.8.8.8]'),
      ];

      for (let i = 0; i < mockHops.length; i++) {
        await new Promise((r) => setTimeout(r, 300));
        lines.push(mockHops[i]);
        setOutput(lines.join('\n'));
      }
      lines.push('\nTrace complete.');
      setOutput(lines.join('\n'));
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Target input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="Enter target IP or hostname (e.g. 8.8.8.8)"
          onKeyDown={(e) => e.key === 'Enter' && handleTrace()}
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
          onClick={handleTrace}
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
          {loading ? 'TRACING...' : 'TRACE'}
        </button>
      </div>

      {/* Flag Controls Bar (-d, -h) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border-color)', fontSize: 11 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
          <input
            type="checkbox"
            checked={noDns}
            onChange={(e) => setNoDns(e.target.checked)}
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <span>Do not resolve addresses (-d / -n) <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>(faster)</span></span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)' }}>Max Hops (-h):</span>
          <select
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.target.value))}
            style={{
              background: '#040810',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 3,
              padding: '2px 6px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              outline: 'none',
            }}
          >
            <option value={15}>15 hops</option>
            <option value={30}>30 hops</option>
            <option value={60}>60 hops</option>
          </select>
        </div>
      </div>

      {/* Output Console */}
      <div
        style={{
          flex: 1,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid var(--border-color)',
          borderRadius: 4,
          padding: 10,
          whiteSpace: 'pre-wrap',
          overflowY: 'auto',
          lineHeight: 1.6,
          color: 'var(--accent-primary)',
        }}
      >
        {output || 'Click TRACE to start network path diagnostics.'}
      </div>
    </div>
  );
}
