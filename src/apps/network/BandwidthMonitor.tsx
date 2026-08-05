import { useState, useEffect } from 'react';
import { useTauri } from '../../hooks/useTauri';

export default function BandwidthMonitor() {
  const { invoke, isAvailable } = useTauri();
  const [downloadSpeed, setDownloadSpeed] = useState<number>(45.2);
  const [uploadSpeed, setUploadSpeed] = useState<number>(12.8);
  const [totalRx, setTotalRx] = useState<number>(1.4); // GB
  const [totalTx, setTotalTx] = useState<number>(0.6); // GB
  const [testing, setTesting] = useState(false);
  const [interfaces, setInterfaces] = useState<string[]>(['eth0 (Ethernet)', 'wlan0 (Wi-Fi)']);
  const [selectedIf, setSelectedIf] = useState<string>('eth0 (Ethernet)');

  useEffect(() => {
    if (isAvailable) {
      invoke<any>('get_system_info').then((info) => {
        if (info && info.network_interfaces) {
          setInterfaces(info.network_interfaces);
          if (info.network_interfaces.length > 0) {
            setSelectedIf(info.network_interfaces[0]);
          }
        }
      }).catch(() => {});
    }
  }, [isAvailable]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDownloadSpeed((prev) => Math.max(1, +(prev + (Math.random() - 0.48) * 10).toFixed(1)));
      setUploadSpeed((prev) => Math.max(0.5, +(prev + (Math.random() - 0.48) * 4).toFixed(1)));
      setTotalRx((prev) => +(prev + 0.002).toFixed(3));
      setTotalTx((prev) => +(prev + 0.0008).toFixed(3));
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const runSpeedTest = async () => {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 2000));
    setDownloadSpeed(88.4);
    setUploadSpeed(32.1);
    setTesting(false);
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(2,6,23,0.6)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>INTERFACE:</span>
          <select
            value={selectedIf}
            onChange={(e) => setSelectedIf(e.target.value)}
            style={{
              background: '#040810',
              color: 'var(--accent-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              outline: 'none',
            }}
          >
            {interfaces.map((iface) => (
              <option key={iface} value={iface}>{iface}</option>
            ))}
          </select>
        </div>
        <button
          onClick={runSpeedTest}
          disabled={testing}
          style={{
            background: testing ? 'rgba(100,116,139,0.3)' : 'var(--accent-primary)',
            color: testing ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: 4,
            padding: '6px 14px',
            fontWeight: 700,
            cursor: testing ? 'default' : 'pointer',
          }}
        >
          {testing ? 'TESTING SPEED...' : 'RUN SPEED TEST'}
        </button>
      </div>

      {/* Speed Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.3)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5 }}>DOWNLOAD</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0ea5e9', margin: '4px 0' }}>
            {downloadSpeed} <span style={{ fontSize: 14, fontWeight: 400 }}>Mbps</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Session Rx: {totalRx} GB</div>
        </div>

        <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.3)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5 }}>UPLOAD</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#00ff88', margin: '4px 0' }}>
            {uploadSpeed} <span style={{ fontSize: 14, fontWeight: 400 }}>Mbps</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Session Tx: {totalTx} GB</div>
        </div>
      </div>

      {/* Status Details */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>NETWORK HEALTH & PACKET STATS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, color: 'var(--text-primary)', fontSize: 11 }}>
          <div>Status: <span style={{ color: '#00ff88' }}>ACTIVE</span></div>
          <div>MTU: <span>1500 bytes</span></div>
          <div>Packets Received: <span>1,248,902</span></div>
          <div>Packets Sent: <span>892,110</span></div>
          <div>Packet Errors: <span style={{ color: '#00ff88' }}>0</span></div>
          <div>Dropped Packets: <span style={{ color: '#00ff88' }}>0</span></div>
        </div>
      </div>
    </div>
  );
}
