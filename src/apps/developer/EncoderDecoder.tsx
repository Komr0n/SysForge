import { useState } from 'react';
import { Button, Textarea, Badge } from '../../components/ui';

type Op = 'b64e' | 'b64d' | 'urle' | 'urld' | 'hexe' | 'hexd' | 'rote' | 'rotd' | 'htmle' | 'htmld';

const OPS: { id: Op; label: string }[] = [
  { id: 'b64e', label: 'Base64 Encode' },
  { id: 'b64d', label: 'Base64 Decode' },
  { id: 'urle', label: 'URL Encode' },
  { id: 'urld', label: 'URL Decode' },
  { id: 'hexe', label: 'Hex Encode' },
  { id: 'hexd', label: 'Hex Decode' },
  { id: 'rote', label: 'ROT13' },
  { id: 'rotd', label: 'ROT13 (reverse)' },
  { id: 'htmle', label: 'HTML Escape' },
  { id: 'htmld', label: 'HTML Unescape' },
];

function applyOp(input: string, op: Op): string {
  try {
    switch (op) {
      case 'b64e': return btoa(unescape(encodeURIComponent(input)));
      case 'b64d': return decodeURIComponent(escape(atob(input.trim())));
      case 'urle': return encodeURIComponent(input);
      case 'urld': return decodeURIComponent(input);
      case 'hexe': return Array.from(new TextEncoder().encode(input)).map((b) => b.toString(16).padStart(2, '0')).join('');
      case 'hexd': {
        const clean = input.replace(/\s/g, '');
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
        return new TextDecoder().decode(bytes);
      }
      case 'rote': return input.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13)));
      case 'rotd': return input.replace(/[a-zA-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() >= 'n' ? -13 : 13)));
      case 'htmle': return input
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;')
        .replace(/'/g, '&#' + '39;');
      case 'htmld': {
        const el = document.createElement('textarea');
        el.innerHTML = input;
        return el.value;
      }
    }
  } catch (e) {
    return `ERROR: ${(e as Error).message}`;
  }
  return '';
}

export default function EncoderDecoder() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [lastOp, setLastOp] = useState<Op | null>(null);
  const [error, setError] = useState('');

  const runOp = (op: Op) => {
    setLastOp(op);
    const result = applyOp(input, op);
    if (result.startsWith('ERROR:')) {
      setError(result);
      setOutput('');
    } else {
      setError('');
      setOutput(result);
    }
  };

  const swap = () => {
    setInput(output);
    setOutput('');
  };

  const label = lastOp ? OPS.find((o) => o.id === lastOp)?.label : '';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
      <Textarea label="Input" mono rows={5} value={input} onChange={(e) => setInput(e.target.value)} style={{ fontSize: 11 }} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OPS.map((op) => (
          <Button key={op.id} size="sm" variant={lastOp === op.id ? 'primary' : 'secondary'} onClick={() => runOp(op.id)}>
            {op.label}
          </Button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{error}</div>}

      {label && <Badge color="#0ea5e9">{label.toUpperCase()}</Badge>}

      <Textarea label="Output" mono rows={5} value={output} onChange={(e) => setOutput(e.target.value)} style={{ fontSize: 11 }} />

      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="secondary" size="sm" onClick={swap}>⇄ Swap to input</Button>
        <Button variant="ghost" size="sm" onClick={() => { setInput(''); setOutput(''); setError(''); setLastOp(null); }}>Clear</Button>
      </div>
    </div>
  );
}