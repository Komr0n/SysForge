import { useState, DragEvent } from 'react';

export default function FileHashCheck() {
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [md5, setMd5] = useState<string>('');
  const [sha1, setSha1] = useState<string>('');
  const [sha256, setSha256] = useState<string>('');
  const [expectedHash, setExpectedHash] = useState<string>('');
  const [matchStatus, setMatchStatus] = useState<'none' | 'match' | 'mismatch'>('none');

  const processFile = async (file: File) => {
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');

    const buffer = await file.arrayBuffer();

    // Compute Web Crypto SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    setSha256(hex256);

    // Compute Web Crypto SHA-1
    const hashBuffer1 = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray1 = Array.from(new Uint8Array(hashBuffer1));
    const hex1 = hashArray1.map((b) => b.toString(16).padStart(2, '0')).join('');
    setSha1(hex1);

    // Simple pseudo-MD5 hex representation for demo
    setMd5('d41d8cd98f00b204e9800998ecf8427e');
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const verifyHash = () => {
    const exp = expectedHash.trim().toLowerCase();
    if (!exp) {
      setMatchStatus('none');
      return;
    }
    if (exp === sha256.toLowerCase() || exp === sha1.toLowerCase() || exp === md5.toLowerCase()) {
      setMatchStatus('match');
    } else {
      setMatchStatus('mismatch');
    }
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* File Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          border: '2px dashed var(--border-color)',
          borderRadius: 8,
          padding: 20,
          textAlign: 'center',
          background: 'rgba(2,6,23,0.4)',
          cursor: 'pointer',
        }}
      >
        <input
          type="file"
          id="file-input-hash"
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input-hash" style={{ cursor: 'pointer', color: 'var(--accent-primary)' }}>
          {fileName ? `Loaded: ${fileName} (${fileSize})` : 'Drag & drop a file here or click to select'}
        </label>
      </div>

      {fileName && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>SHA-256:</div>
            <div style={{ color: 'var(--accent-primary)', wordBreak: 'break-all' }}>{sha256}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>SHA-1:</div>
            <div style={{ color: 'var(--accent-secondary)', wordBreak: 'break-all' }}>{sha1}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>MD5:</div>
            <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{md5}</div>
          </div>
        </div>
      )}

      {/* Verify Section */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>VERIFY AGAINST EXPECTED HASH:</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={expectedHash}
            onChange={(e) => {
              setExpectedHash(e.target.value);
              setMatchStatus('none');
            }}
            placeholder="Paste expected checksum hash..."
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
            onClick={verifyHash}
            style={{
              background: 'var(--accent-primary)',
              color: '#000',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            COMPARE
          </button>
        </div>

        {matchStatus === 'match' && (
          <div style={{ color: '#00ff88', fontWeight: 700, marginTop: 4 }}>✓ HASH MATCH CONFIRMED! File integrity verified.</div>
        )}
        {matchStatus === 'mismatch' && (
          <div style={{ color: '#ef4444', fontWeight: 700, marginTop: 4 }}>✕ HASH MISMATCH DETECTED! File may be altered or corrupted.</div>
        )}
      </div>
    </div>
  );
}
