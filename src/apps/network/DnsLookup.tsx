import { useState } from 'react';
import { Button, Input, Select, Textarea, Badge } from '../../components/ui';
import { useTauri } from '../../hooks/useTauri';

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string;
}

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'PTR', 'SOA'];

// Deterministic pseudo-random generator seeded from domain+type so the same
// query yields stable mock results (feels like real DNS data).
function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

function mockRecord(domain: string, type: string): DnsRecord {
  const rand = seeded(`${domain}:${type}`);
  const base = domain.replace(/^www\./, '');
  const ip = `${Math.floor(rand() * 220) + 10}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 250) + 1}`;
  const values: Record<string, string> = {
    A: ip,
    AAAA: `${rand().toFixed(4).replace('0.', '')}:${rand().toFixed(4).replace('0.', '')}:${rand().toFixed(4).replace('0.', '')}::1`,
    MX: `10 aspmx.l.google.com.`,
    TXT: `"v=spf1 include:_spf.google.com ~all"`,
    CNAME: `ghs.googlehosted.com.`,
    NS: `ns${Math.floor(rand() * 3) + 1}.${base}.`,
    PTR: `dns.google.`,
    SOA: `ns1.${base}. hostmaster.${base}. 2024010101 7200 3600 1209600 300`,
  };
  return {
    type,
    name: type === 'PTR' ? `${ip}.in-addr.arpa.` : domain,
    value: values[type] ?? '—',
    ttl: String(300 + Math.floor(rand() * 6900)),
  };
}

export default function DnsLookup() {
  const { invoke, isAvailable } = useTauri();
  const [domain, setDomain] = useState('example.com');
  const [recordType, setRecordType] = useState('A');
  const [server, setServer] = useState('8.8.8.8');
  const [bulkText, setBulkText] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /** Parse nslookup output into records (real backend mode). */
  function parseNslookup(output: string, _type: string, queriedName: string): DnsRecord[] {
    const records: DnsRecord[] = [];
    const lines = output.split(/\r?\n/);    let currentName = queriedName;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Section header like "example.com  MX preference = 10, mail exchanger = ..."
      if (/^(\S+\.[A-Za-z0-9-]+)\s+text\s*=/.test(line) || /^\s*text\s*=/.test(line)) {
        const m = line.match(/^(?:(\S+\.[A-Za-z0-9-]+)\s+)?text\s*=\s*(.+)$/i);
        if (m) records.push({ type: 'TXT', name: m[1] ?? currentName, value: `"${m[2].trim()}"`, ttl: '—' });
        continue;
      }
      const mailEx = line.match(/^(?:(\S+\.[A-Za-z0-9-]+)\s+)?MX preference = (\d+), mail exchanger = (\S+)/i);
      if (mailEx) {
        records.push({ type: 'MX', name: mailEx[1] ?? currentName, value: `${mailEx[2]} ${mailEx[3]}`, ttl: '—' });
        continue;
      }
      const nameserver = line.match(/nameserver = (\S+)/i);
      if (nameserver) {
        records.push({ type: 'NS', name: currentName, value: nameserver[1], ttl: '—' });
        continue;
      }
      const cname = line.match(/canonical name = (\S+)/i);
      if (cname) {
        records.push({ type: 'CNAME', name: currentName, value: cname[1], ttl: '—' });
        continue;
      }
      const soa = line.match(/origin = (\S+)/i);
      if (soa) {
        records.push({ type: 'SOA', name: currentName, value: soa[1], ttl: '—' });
        continue;
      }
      // A/AAAA addresses
      const addrMatch = line.match(/^(?:(\S+)\s+)?Address:\s*([0-9a-fA-F:.]+)\s*$/);
      if (addrMatch) {
        const ip = addrMatch[2];
        if (ip === server) continue; // the resolver's own address echoed by nslookup
        records.push({
          type: ip.includes(':') ? 'AAAA' : 'A',
          name: addrMatch[1] ?? currentName,
          value: ip,
          ttl: '—',
        });
      }
      const nameLine = line.match(/^(\S+\.[A-Za-z0-9-]+)\s*$/);
      if (nameLine) currentName = nameLine[1];
    }
    return records;
  }

  const lookup = async (domainName: string) => {
    if (!domainName.trim()) return;
    setLoading(true);
    setError('');

    try {
      if (isAvailable) {
        // Real lookup via Rust → nslookup. For bulk mode query each domain.
        const domains = domainName.split('\n').map((d) => d.trim()).filter(Boolean);
        const all: DnsRecord[] = [];
        for (const d of domains) {
          try {
            const out = await invoke<string>('dns_lookup', { host: d, queryType: recordType });
            all.push(...parseNslookup(out ?? '', recordType, d));
          } catch (e) {
            setError(`Lookup failed for ${d}: ${String(e)}`);
          }
        }
        setRecords(all);
      } else {
        // Browser fallback: deterministic mock data
        await new Promise((r) => setTimeout(r, 400));
        if (bulkMode && domainName.includes('\n')) {
          const domains = domainName.split('\n').filter((d) => d.trim());
          setRecords(domains.flatMap((d) => mockRecord(d.trim(), recordType)));
        } else {
          setRecords([mockRecord(domainName.trim(), recordType)]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBulkChange = (text: string) => {
    setBulkText(text);
    const parts = text.split('\n').filter((l) => l.trim());
    if (parts.length > 1) {
      setBulkMode(true);
      setRecords(parts.map((d) => mockRecord(d.trim(), recordType)));
    } else {
      setBulkMode(false);
      setDomain(parts[0] ?? '');
    }
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Input
            label={bulkMode ? 'Domains (one per line)' : 'Domain'}
            mono
            placeholder="example.com"
            value={bulkMode ? bulkText : domain}
            onChange={(e) => (bulkMode ? handleBulkChange(e.target.value) : setDomain(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && !bulkMode && lookup(domain)}
          />
        </div>
        <div style={{ width: 110 }}>
          <Select
            label="Record"
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            options={RECORD_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div style={{ width: 130 }}>
          <Input label="DNS Server" mono value={server} onChange={(e) => setServer(e.target.value)} />
        </div>
        <Button variant="primary" onClick={() => lookup(bulkMode ? bulkText : domain)} disabled={loading} style={{ marginBottom: 8 }}>
          {loading ? 'Querying...' : 'Lookup'}
        </Button>
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

      {/* Bulk mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={bulkMode} onChange={(e) => setBulkMode(e.target.checked)} />
          Bulk lookup (paste list)
        </label>
        {bulkMode && (
          <div style={{ flex: 1 }}>
            <Textarea
              placeholder={'example.com\ngoogle.com\ngithub.com'}
              mono
              rows={3}
              value={bulkText}
              onChange={(e) => handleBulkChange(e.target.value)}
              style={{ fontSize: 11 }}
            />
          </div>
        )}
      </div>

      {/* Results table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {records.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Value</th>
                <th style={thStyle}>TTL</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.name}</span></td>
                  <td style={tdStyle}><Badge color="#0ea5e9">{r.type}</Badge></td>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{r.value}</span></td>
                  <td style={tdStyle}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.ttl}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {loading ? 'QUERYING ' + server + '...' : 'Enter a domain to look up records'}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        RESOLVER: {server} · {records.length} RECORD{records.length !== 1 ? 'S' : ''} · STATUS: {loading ? 'QUERY' : records.length ? 'NOERROR' : 'IDLE'}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '4px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: '6px 8px' };