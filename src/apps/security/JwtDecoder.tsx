import { useState } from 'react';
import { Textarea, Badge, Card } from '../../components/ui';

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(padded);
  }
}

interface DecodedToken {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  expired: boolean;
  expDate: Date | null;
  expValid: boolean;
}

function decodeJwt(token: string): DecodedToken | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const exp = payload.exp as number | undefined;
    const expDate = exp ? new Date(exp * 1000) : null;
    const expired = exp ? exp * 1000 < Date.now() : false;
    return {
      header,
      payload,
      signature: parts[2],
      expired,
      expDate,
      expValid: exp !== undefined,
    };
  } catch {
    return null;
  }
}

const algColors: Record<string, string> = {
  HS256: '#00ff88',
  HS384: '#00ff88',
  HS512: '#00ff88',
  RS256: '#0ea5e9',
  RS384: '#0ea5e9',
  RS512: '#0ea5e9',
  ES256: '#f59e0b',
  ES384: '#f59e0b',
  ES512: '#f59e0b',
};

export default function JwtDecoder() {
  const [token, setToken] = useState('');
  const decoded = token.trim() ? decodeJwt(token.trim()) : null;

  const pretty = (obj: Record<string, unknown>) => JSON.stringify(obj, null, 2);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      <Textarea
        label="Paste JWT token"
        mono
        rows={4}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={{ fontSize: 11 }}
      />

      {!decoded && token.trim() && (
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          INVALID TOKEN — expected 3 parts (header.payload.signature)
        </div>
      )}

      {decoded && (
        <>
          {/* Expiry status */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge color={algColors[String(decoded.header.alg)] ?? '#64748b'}>
              {String(decoded.header.alg ?? 'UNKNOWN')}
            </Badge>
            <Badge color="#0ea5e9">{String(decoded.header.typ ?? 'JWT')}</Badge>
            {decoded.expValid ? (
              decoded.expired ? (
                <Badge color="#ef4444">EXPIRED</Badge>
              ) : (
                <Badge color="#00ff88">VALID</Badge>
              )
            ) : (
              <Badge color="#64748b">NO EXP</Badge>
            )}
          </div>

          {/* Header */}
          <Card title="Header">
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {pretty(decoded.header)}
            </pre>
          </Card>

          {/* Payload */}
          <Card title="Payload">
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {pretty(decoded.payload)}
            </pre>
            {decoded.expDate && (
              <div style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: decoded.expired ? 'var(--danger)' : 'var(--accent-primary)' }}>
                {decoded.expired ? '⚠ ' : '✓ '}exp: {decoded.expDate.toLocaleString()} ({decoded.expired ? 'PAST' : 'FUTURE'})
              </div>
            )}
          </Card>

          {/* Signature */}
          <Card title="Signature">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {decoded.signature}
              </code>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}