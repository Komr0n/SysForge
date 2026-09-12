import { useState } from 'react';
import { Input, Badge, Card } from '../../components/ui';

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(n: number): string {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

function maskFromCidr(cidr: number): number {
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

export default function SubnetCalc() {
  const [ip, setIp] = useState('192.168.1.0');
  const [cidr, setCidr] = useState(24);
  const [splitCount, setSplitCount] = useState(4);

  const ipInt = ipToInt(ip);
  const mask = maskFromCidr(cidr);
  const network = ipInt !== null ? (ipInt & mask) >>> 0 : 0;
  const broadcast = ipInt !== null ? ((ipInt & mask) | (~mask >>> 0)) >>> 0 : 0;
  const totalHosts = Math.pow(2, 32 - cidr);
  const usableHosts = totalHosts > 2 ? totalHosts - 2 : totalHosts === 2 ? 2 : 1;
  const firstHost = cidr >= 31 ? network : (network + 1) >>> 0;
  const lastHost = cidr >= 31 ? broadcast : (broadcast - 1) >>> 0;

  const ipBits = (n: number) =>
    Array.from({ length: 4 }, (_, i) => ((n >>> (24 - i * 8)) & 255).toString(2).padStart(8, '0')).join('.');

  const subnets: { net: number; bcast: number }[] = [];
  if (ipInt !== null && splitCount >= 2 && splitCount <= 64) {
    const bits = Math.ceil(Math.log2(splitCount));
    const newPrefix = cidr + bits;
    if (newPrefix <= 30) {
      const subnetSize = Math.pow(2, 32 - newPrefix);
      const actual = Math.pow(2, bits);
      for (let i = 0; i < actual; i++) {
        const sNet = (network + i * subnetSize) >>> 0;
        subnets.push({ net: sNet, bcast: (sNet + subnetSize - 1) >>> 0 });
      }
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input label="IP Address" mono value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.0" />
        </div>
        <div style={{ width: 120 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            CIDR
          </label>
          <input
            type="range"
            min={0}
            max={32}
            value={cidr}
            onChange={(e) => setCidr(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#00ff88' }}
          />
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>
            /{cidr}
          </div>
        </div>
      </div>

      {ipInt === null ? (
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>INVALID IP ADDRESS</div>
      ) : (
        <>
          {/* Results */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Card>
              <div style={row}>Network Address</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-primary)' }}>{intToIp(network)}</div>
            </Card>
            <Card>
              <div style={row}>Broadcast</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-secondary)' }}>{intToIp(broadcast)}</div>
            </Card>
            <Card>
              <div style={row}>First Host</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{intToIp(firstHost)}</div>
            </Card>
            <Card>
              <div style={row}>Last Host</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{intToIp(lastHost)}</div>
            </Card>
            <Card>
              <div style={row}>Total Hosts</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{totalHosts.toLocaleString()}</div>
            </Card>
            <Card>
              <div style={row}>Usable Hosts</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{usableHosts.toLocaleString()}</div>
            </Card>
          </div>

          {/* Binary representation */}
          <Card title="Binary">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8 }}>
              <div>IP: <span style={{ color: 'var(--text-primary)' }}>{ipBits(ipInt)}</span></div>
              <div>MSK: <span style={{ color: 'var(--accent-secondary)' }}>{ipBits(mask)}</span></div>
            </div>
          </Card>

          {/* Subnet splitter */}
          <Card title="Subnet Splitter">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Split /{cidr} into:</label>
              <input
                type="number"
                min={2}
                max={64}
                value={splitCount}
                onChange={(e) => setSplitCount(Math.max(2, Math.min(64, Number(e.target.value))))}
                style={{ width: 60, background: 'rgba(2,6,23,0.6)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>subnets</span>
            </div>
            {subnets.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Cannot split — {splitCount} subnets requires /{cidr + Math.ceil(Math.log2(splitCount))} which exceeds /30.
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {subnets.map((s, i) => (
                <div key={i} style={{ padding: '4px 8px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 6 }}>
                  <Badge color="#0ea5e9">#{i + 1}</Badge>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}> {intToIp(s.net)} → {intToIp(s.bcast)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const row: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };