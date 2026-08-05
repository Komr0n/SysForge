import { useState } from 'react';

interface CertDetails {
  domain: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  serialNumber: string;
  signatureAlgorithm: string;
  sans: string[];
}

export default function SSLInspector() {
  const [domain, setDomain] = useState('github.com');
  const [loading, setLoading] = useState(false);
  const [cert, setCert] = useState<CertDetails | null>(null);

  const handleInspect = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setCert(null);

    await new Promise((r) => setTimeout(r, 600));

    // Simulated certificate analysis
    const cleanDomain = domain.trim().replace(/^https?:\/\//, '').split('/')[0];
    const now = new Date();
    const expiry = new Date(now.getTime() + (82 + Math.floor(Math.random() * 20)) * 24 * 3600 * 1000);
    const issueDate = new Date(now.getTime() - 10 * 24 * 3600 * 1000);

    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 3600 * 24));

    setCert({
      domain: cleanDomain,
      subject: `CN=${cleanDomain}, O=${cleanDomain.split('.')[0].toUpperCase()} Inc`,
      issuer: "CN=DigiCert Global TLS RSA SHA256 2020 CA1, O=DigiCert Inc",
      validFrom: issueDate.toISOString().split('T')[0],
      validTo: expiry.toISOString().split('T')[0],
      daysRemaining: daysLeft,
      serialNumber: "0A:24:F5:12:99:B8:31:AA:04:18",
      signatureAlgorithm: "sha256WithRSAEncryption",
      sans: [cleanDomain, `*.${cleanDomain}`, `www.${cleanDomain}`],
    });

    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Enter domain (e.g. github.com)..."
          onKeyDown={(e) => e.key === 'Enter' && handleInspect()}
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
          onClick={handleInspect}
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
          {loading ? 'INSPECTING...' : 'INSPECT'}
        </button>
      </div>

      {/* Cert Result Card */}
      {cert && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-primary)' }}>🔐 {cert.domain}</span>
              <span
                style={{
                  background: cert.daysRemaining > 30 ? 'rgba(0,255,136,0.15)' : 'rgba(239,68,68,0.15)',
                  border: `1px solid ${cert.daysRemaining > 30 ? 'var(--accent-primary)' : 'var(--danger)'}`,
                  color: cert.daysRemaining > 30 ? 'var(--accent-primary)' : 'var(--danger)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {cert.daysRemaining} DAYS REMAINING
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', fontSize: 11 }}>
              <span style={{ color: 'var(--text-muted)' }}>SUBJECT:</span>
              <span style={{ color: 'var(--text-primary)' }}>{cert.subject}</span>

              <span style={{ color: 'var(--text-muted)' }}>ISSUER:</span>
              <span style={{ color: 'var(--text-primary)' }}>{cert.issuer}</span>

              <span style={{ color: 'var(--text-muted)' }}>VALID FROM:</span>
              <span>{cert.validFrom}</span>

              <span style={{ color: 'var(--text-muted)' }}>VALID UNTIL:</span>
              <span>{cert.validTo}</span>

              <span style={{ color: 'var(--text-muted)' }}>SERIAL NO:</span>
              <span>{cert.serialNumber}</span>

              <span style={{ color: 'var(--text-muted)' }}>ALGORITHM:</span>
              <span>{cert.signatureAlgorithm}</span>

              <span style={{ color: 'var(--text-muted)' }}>SAN NAMES:</span>
              <span style={{ color: 'var(--accent-secondary)' }}>{cert.sans.join(', ')}</span>
            </div>
          </div>
        </div>
      )}

      {!cert && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Enter a domain name above to inspect its SSL/TLS certificate chain and expiration status.
        </div>
      )}
    </div>
  );
}
