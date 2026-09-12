import { useState, useCallback } from 'react';
import { Button, Textarea, Input, Badge } from '../../components/ui';

type HashAlgo = 'MD5' | 'SHA1' | 'SHA256' | 'SHA512' | 'CRC32';

const ALGOS: HashAlgo[] = ['MD5', 'SHA1', 'SHA256', 'SHA512', 'CRC32'];

// Browser-side hashing via Web Crypto. CRC32 implemented manually.
async function shaHex(algo: 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function md5Bytes(bytes: Uint8Array | number[]): string {
  const len = bytes.length;
  const bitLen = len * 8;

  // Pad
  const padded = Array.from(bytes);
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  for (let i = 0; i < 8; i++) padded.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K: number[] = [];
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  }

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c));

  for (let i = 0; i < padded.length; i += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) {
      M[j] =
        padded[i + j * 4] |
        (padded[i + j * 4 + 1] << 8) |
        (padded[i + j * 4 + 2] << 16) |
        (padded[i + j * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let j = 0; j < 64; j++) {
      let F: number, g: number;
      if (j < 16) { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * j) % 16; }
      F = (F + A + K[j] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, s[j])) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const toHex = (n: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return s;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

export function md5(text: string): string {
  const utf8 = unescape(encodeURIComponent(text));
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  return md5Bytes(bytes);
}

function crc32(text: string): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc = table[(crc ^ text.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function identifyHash(hash: string): string {
  const h = hash.trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(h)) return 'MD5 (32 hex chars)';
  if (/^[0-9a-f]{40}$/.test(h)) return 'SHA1 (40 hex chars)';
  if (/^[0-9a-f]{56}$/.test(h)) return 'SHA224 (56 hex chars)';
  if (/^[0-9a-f]{64}$/.test(h)) return 'SHA256 (64 hex chars)';
  if (/^[0-9a-f]{96}$/.test(h)) return 'SHA384 (96 hex chars)';
  if (/^[0-9a-f]{128}$/.test(h)) return 'SHA512 (128 hex chars)';
  if (/^[0-9a-f]{8}$/.test(h)) return 'CRC32 (8 hex chars)';
  return 'Unknown format';
}

export default function HashTool() {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<HashAlgo[]>(['MD5', 'SHA256']);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [expected, setExpected] = useState('');
  const [identifyInput, setIdentifyInput] = useState('');

  const compute = useCallback(async () => {
    if (!text) return;
    const result: Record<string, string> = {};
    if (selected.includes('MD5')) result.MD5 = md5(text);
    if (selected.includes('SHA1')) result.SHA1 = await shaHex('SHA-1', text);
    if (selected.includes('SHA256')) result.SHA256 = await shaHex('SHA-256', text);
    if (selected.includes('SHA512')) result.SHA512 = await shaHex('SHA-512', text);
    if (selected.includes('CRC32')) result.CRC32 = (crc32(text) >>> 0).toString(16).padStart(8, '0');
    setHashes(result);
  }, [text, selected]);

  const toggleAlgo = (algo: HashAlgo) => {
    setSelected((prev) => (prev.includes(algo) ? prev.filter((a) => a !== algo) : [...prev, algo]));
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value);
  };

  const matches = expected.trim() && Object.values(hashes).some((h) => h === expected.trim().toLowerCase());

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      <div>
        <Textarea
          label="Input text"
          mono
          rows={4}
          placeholder="Type or paste text to hash..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Algorithm selection */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ALGOS.map((algo) => (
          <label
            key={algo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              border: `1px solid ${selected.includes(algo) ? 'rgba(0,255,136,0.5)' : 'var(--border-color)'}`,
              background: selected.includes(algo) ? 'rgba(0,255,136,0.08)' : 'transparent',
              cursor: 'pointer',
              fontSize: 11,
              color: selected.includes(algo) ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(algo)}
              onChange={() => toggleAlgo(algo)}
              style={{ accentColor: '#00ff88' }}
            />
            {algo}
          </label>
        ))}
        <Button variant="primary" size="sm" onClick={compute}>Compute</Button>
      </div>

      {/* Results */}
      {Object.keys(hashes).length > 0 && (
        <div className="data-flash" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(hashes).map(([algo, value]) => (
            <div key={algo} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge color="#0ea5e9">{algo}</Badge>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{value}</code>
              <button
                onClick={() => copy(value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                title="Copy"
              >
                ⧉
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Verify mode */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
        <Input
          label="Verify — paste expected hash"
          mono
          placeholder="e.g. 5d41402abc4b2a76b9719d911017c592"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
        {expected && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {matches === undefined ? (
              <span style={{ color: 'var(--text-muted)' }}>Compute hashes to verify…</span>
            ) : matches ? (
              <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>✓ MATCH — hash verified</span>
            ) : (
              <span style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>✕ NO MATCH</span>
            )}
          </div>
        )}
      </div>

      {/* Hash identifier */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
        <Input
          label="Hash identifier — paste unknown hash"
          mono
          placeholder="Paste any hash..."
          value={identifyInput}
          onChange={(e) => setIdentifyInput(e.target.value)}
        />
        {identifyInput.trim() && (
          <div style={{ fontSize: 12, color: 'var(--accent-secondary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            → {identifyHash(identifyInput)}
          </div>
        )}
      </div>
    </div>
  );
}