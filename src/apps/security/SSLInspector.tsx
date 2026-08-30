import { useState } from 'react';
import { useTauri } from '../../hooks/useTauri';

interface CertDetails {
  domain: string;
  subject: string;
  issuer: string;
  validTo: string;
  daysRemaining: number;
  serialNumber: string;
  signatureAlgorithm: string;
}

/**
 * SSLInspector — real certificate check via Rust (PowerShell/.NET on Windows,
 * openssl on Linux/macOS). Browser mode is honestly disabled.
 */
export default function SSLInspector() {
  const { invoke, isAvailable } = useTauri();
  const [domain, setDomain] = useState('github.com');
  const [loading, setLoading] = useState(false);
  const [cert, setCert] = useState<CertDetails | null>(null);
  const [error, setError] = useState('');

  const handleInspect = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setError('');
    setCert(null);

    if (!isAvailable) {
      setError('TLS inspection requires the desktop app (needs access to the OS certificate APIs).');
      setLoading(false);
      return;
    }

    try {
      const out = await invoke<string>('inspect_ssl', { host: domain.trim() }) ?? '';
      // Parse KEY=VALUE lines
      const get = (key: string) => {
        const m = out.match(new RegExp(`${key}=(.*)`, 'i'));
        return m ? m[1].trim() : '';
      };
      const notAfterRaw = get('NOTAFTER');
      const validTo = notAfterRaw ? new Date(notAfterRaw) : null;
      const daysRemaining = validTo
        ? Math.floor((validTo.getTime() - Date.now()) / 86400000)
        : -1;

      // SAN line: "SAN=... DNS Name=github.com, DNS Name=www.github.com"
      setCert({
        domain: domain.trim(),
        subject: get('SUBJECT') || '—',
        issuer: get('ISSUER') || '—',
        validTo: validTo ? validTo.toISOString().split('T')[0] : '—',
        daysRemaining,
        serialNumber: get('SERIAL') || '—',
        signatureAlgorithm: get('SIGALG') || get('SIGALG').replace(/^(#|OID\.)*/, '') || '—',
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: 10, padding: '6px 0',
    borderBottom: '1px solid var(--border-color)', fontSize: 12,
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>SSL / TLS CERTIFICATE INSPECTOR</div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInspect()}
          placeholder="github.com"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)', borderRadius: 4,
            padding: '6px 10px', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <button
          onClick={handleInspect}
          disabled={loading}
          style={{
            background: loading ? 'rgba(100,116,139,0.3)' : 'var(--accent-primary)',
            color: loading ? 'var(--text-muted)' : '#000',
            border: 'none', borderRadius: 4, padding: '6px 16px',
            fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'INSPECTING…' : 'INSPECT'}
        </button>
      </div>

      {!isAvailable && (
        <div style={{ color: '#f59e0b', fontSize: 11 }}>
          ⚠ Requires the desktop app.
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

      {cert && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CERTIFICATE FOR {cert.domain.toUpperCase()}</span>
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontWeight: 700,
              background: cert.daysRemaining > 30 ? 'rgba(0,255,136,0.12)' : cert.daysRemaining > 0 ? 'rgba(250,204,21,0.15)' : 'rgba(239,68,68,0.15)',
              color: cert.daysRemaining > 30 ? '#00ff88' : cert.daysRemaining > 0 ? '#facc15' : '#ef4444',
            }}>
              {cert.daysRemaining > 0 ? `${cert.daysRemaining} DAYS LEFT` : 'EXPIRED'}
            </span>
          </div>
          {[['Subject', cert.subject], ['Issuer', cert.issuer], ['Valid to', cert.validTo], ['Serial', cert.serialNumber], ['Signature alg.', cert.signatureAlgorithm]].map(([k, v]) => (
            <div key={k} style={rowStyle}>
              <span style={{ width: 110, color: 'var(--text-muted)', flexShrink: 0 }}>{k}</span>
              <span style={{ wordBreak: 'break-all', color: 'var(--text-primary)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {!cert && !error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', fontSize: 12 }}>
          Enter a domain and press INSPECT
        </div>
      )}
    </div>
  );
}
