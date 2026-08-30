import { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useTauri } from '../../hooks/useTauri';

interface IntelResult {
  ip: string;
  countryCode: string;
  countryName: string;
  isp: string;
  domain: string;
  usageType: string;
  abuseScore: number;
  isProxy: boolean;
  isTor: boolean;
  totalReports: number;
}

/**
 * IPIntelligence — real AbuseIPDB lookup via the Rust backend (avoids CORS).
 * The API key lives in settings (memory-only, never persisted).
 */
export default function IPIntelligence() {
  const { invoke, isAvailable } = useTauri();
  const abuseKey = useSettingsStore((s) => s.apiKeys.abuseipdb);
  const [ip, setIp] = useState('8.8.8.8');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntelResult | null>(null);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    if (!ip.trim()) return;
    if (!isAvailable) {
      setError('AbuseIPDB lookups require the desktop app (CORS blocks browser requests).');
      return;
    }
    if (!abuseKey) {
      setError('No AbuseIPDB API key set. Open Settings → API Keys and paste your free key from abuseipdb.com.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await invoke<Record<string, unknown>>('lookup_ip_intel', {
        ip: ip.trim(),
        apiKey: abuseKey,
      });
      const data = (res?.data ?? {}) as Record<string, unknown>;
      setResult({
        ip: String(data.ipAddress ?? ip),
        countryCode: String(data.countryCode ?? '—'),
        countryName: String(data.countryName ?? '—'),
        isp: String(data.isp ?? '—'),
        domain: String(data.domain ?? '—'),
        usageType: String(data.usageType ?? 'Unknown'),
        abuseScore: Number(data.abuseConfidenceScore ?? 0),
        isProxy: Boolean(data.isProxy),
        isTor: Boolean(data.isTor),
        totalReports: Number(data.totalReports ?? 0),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border-color)',
    borderRadius: 4,
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  };

  const scoreColor = result
    ? result.abuseScore >= 75 ? '#ef4444' : result.abuseScore >= 25 ? '#f59e0b' : '#00ff88'
    : '#64748b';

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>IP THREAT INTELLIGENCE · ABUSEIPDB</div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Enter IP address (e.g. 1.1.1.1)"
          style={inputStyle}
        />
        <button
          onClick={handleLookup}
          disabled={loading}
          style={{
            background: loading ? 'rgba(100,116,139,0.3)' : 'var(--accent-primary)',
            color: loading ? 'var(--text-muted)' : '#000',
            border: 'none', borderRadius: 4, padding: '6px 16px',
            fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'LOOKING UP…' : 'LOOKUP'}
        </button>
      </div>

      {error && (
        <div style={{
          color: error.includes('API key') ? '#f59e0b' : 'var(--danger)',
          fontSize: 11, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Abuse confidence gauge */}
          <div style={{
            background: 'rgba(2,6,23,0.6)', border: `1px solid ${scoreColor}`,
            borderRadius: 6, padding: 14, marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>ABUSE CONFIDENCE SCORE</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>{result.abuseScore}%</div>
            <div style={{
              height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 8, overflow: 'hidden',
            }}>
              <div style={{ width: `${result.abuseScore}%`, height: '100%', background: scoreColor, transition: 'width .5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
              <span style={{ color: result.isTor ? '#ef4444' : 'var(--text-muted)' }}>{result.isTor ? '⚠ TOR EXIT NODE' : 'Not Tor'}</span>
              <span style={{ color: result.isProxy ? '#ef4444' : 'var(--text-muted)' }}>{result.isProxy ? '⚠ PROXY/VPN' : 'Not a proxy'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{result.totalReports} reports (90d)</span>
            </div>
          </div>

          {[
            ['Country', `${result.countryName} (${result.countryCode})`],
            ['ISP', result.isp],
            ['Domain', result.domain],
            ['Usage type', result.usageType],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ width: 110, color: 'var(--text-muted)', flexShrink: 0 }}>{k}</span>
              <span style={{ wordBreak: 'break-all' }}>{v || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {!result && !error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
          Enter an IP and press LOOKUP
        </div>
      )}
    </div>
  );
}
