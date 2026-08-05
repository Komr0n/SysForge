import { useState } from 'react';
import { Button, Badge } from '../../components/ui';

const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  noAmbiguous: 'O0Il1|`\'"',
};

interface PasswordConfig {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
  noAmbiguous: boolean;
  count: number;
}

const EFF_WORDS = [
  'abacus', 'ability', 'absent', 'absorb', 'academy', 'accept', 'account', 'achieve', 'across', 'action',
  'active', 'actual', 'adapt', 'address', 'adjust', 'admin', 'advance', 'advice', 'affect', 'afford',
  'after', 'again', 'agency', 'agenda', 'agree', 'alarm', 'album', 'alert', 'alien', 'align',
  'alive', 'allow', 'alpha', 'alter', 'always', 'amazing', 'amount', 'anchor', 'angle', 'animal',
  'answer', 'anyone', 'apart', 'apple', 'apply', 'april', 'arena', 'argue', 'arise', 'armed',
  'array', 'arrow', 'artist', 'asleep', 'assist', 'assume', 'atlas', 'atomic', 'attach', 'attack',
  'attend', 'autumn', 'avenue', 'awake', 'award', 'aware', 'awful', 'bacon', 'badge', 'balance',
  'ballot', 'banana', 'bandit', 'banner', 'barrel', 'battle', 'beach', 'beacon', 'beauty', 'beaver',
  'become', 'bedroom', 'before', 'begin', 'behave', 'behind', 'belief', 'belong', 'benefit', 'best',
  'better', 'between', 'beyond', 'bicycle', 'bigger', 'billion', 'binary', 'birth', 'bishop', 'black',
  'blade', 'blank', 'blast', 'blend', 'blind', 'blink', 'block', 'blood', 'bloom', 'blossom',
  'bonus', 'bottle', 'bottom', 'bounce', 'branch', 'brand', 'brave', 'bread', 'breath', 'breeze',
  'brick', 'bridge', 'bright', 'brisk', 'broad', 'broken', 'bronze', 'brother', 'brown', 'brush',
  'bubble', 'bucket', 'budget', 'buffer', 'build', 'bullet', 'bundle', 'burden', 'button', 'cabin',
];

function entropyLength(pool: number): number {
  return pool > 0 ? Math.log2(pool) : 0;
}

export default function PasswordGenerator() {
  const [config, setConfig] = useState<PasswordConfig>({
    length: 16,
    upper: true,
    lower: true,
    numbers: true,
    symbols: true,
    noAmbiguous: false,
    count: 5,
  });
  const [passwords, setPasswords] = useState<string[]>([]);
  const [mode, setMode] = useState<'random' | 'passphrase'>('random');

  const charset = () => {
    let chars = '';
    if (config.upper) chars += CHARSETS.upper;
    if (config.lower) chars += CHARSETS.lower;
    if (config.numbers) chars += CHARSETS.numbers;
    if (config.symbols) chars += CHARSETS.symbols;
    if (config.noAmbiguous) {
      for (const c of CHARSETS.noAmbiguous) chars = chars.replaceAll(c, '');
    }
    return chars;
  };

  const generateRandom = (): string => {
    const chars = charset();
    if (!chars) return '';
    const arr = new Uint32Array(config.length);
    crypto.getRandomValues(arr);
    let pw = '';
    for (let i = 0; i < config.length; i++) {
      pw += chars[arr[i] % chars.length];
    }
    return pw;
  };

  const generatePassphrase = (): string => {
    const words: string[] = [];
    const count = Math.max(4, Math.min(8, Math.floor(config.length / 4)));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * EFF_WORDS.length);
      words.push(EFF_WORDS[idx]);
    }
    return words.join('-');
  };

  const generate = () => {
    const list: string[] = [];
    const n = Math.min(config.count, 100);
    for (let i = 0; i < n; i++) {
      list.push(mode === 'random' ? generateRandom() : generatePassphrase());
    }
    setPasswords(list);
  };

  const pool = charset().length;
  const entropyBits = mode === 'random'
    ? entropyLength(pool) * config.length
    : 13 * Math.max(4, Math.min(8, Math.floor(config.length / 4)));
  const strength = entropyBits < 40 ? 'Weak' : entropyBits < 60 ? 'Medium' : entropyBits < 90 ? 'Strong' : 'Very Strong';
  const strengthColor = entropyBits < 40 ? '#ef4444' : entropyBits < 60 ? '#f59e0b' : entropyBits < 90 ? '#0ea5e9' : '#00ff88';

  const copy = (pw: string) => navigator.clipboard?.writeText(pw);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      {/* Mode */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['random', 'passphrase'] as const).map((m) => (
          <Button key={m} variant={mode === m ? 'primary' : 'secondary'} size="sm" onClick={() => setMode(m)}>
            {m === 'random' ? 'Random' : 'Passphrase'}
          </Button>
        ))}
      </div>

      {/* Length slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>Length</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{config.length}</span>
        </div>
        <input
          type="range"
          min={8}
          max={64}
          value={config.length}
          onChange={(e) => setConfig({ ...config, length: Number(e.target.value) })}
          style={{ width: '100%', accentColor: '#00ff88' }}
        />
      </div>

      {/* Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {([
          ['upper', 'Uppercase (A-Z)'],
          ['lower', 'Lowercase (a-z)'],
          ['numbers', 'Numbers (0-9)'],
          ['symbols', 'Symbols (!@#$)'],
          ['noAmbiguous', 'No ambiguous chars'],
        ] as const).map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={config[key]}
              onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
              style={{ accentColor: '#00ff88' }}
            />
            {label}
          </label>
        ))}
      </div>

      {/* Count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quantity:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={config.count}
          onChange={(e) => setConfig({ ...config, count: Math.max(1, Math.min(100, Number(e.target.value))) })}
          style={{
            width: 60,
            background: 'rgba(2,6,23,0.6)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            padding: '4px 8px',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <Button variant="primary" size="sm" onClick={generate}>Generate</Button>
      </div>

      {/* Entropy */}
      {mode === 'random' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>ENTROPY</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: strengthColor }}>{entropyBits.toFixed(1)} BITS · {strength.toUpperCase()}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (entropyBits / 128) * 100)}%`,
                background: strengthColor,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {passwords.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {passwords.map((pw, i) => (
            <div
              key={i}
              className="data-flash"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'rgba(2,6,23,0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{String(i + 1).padStart(2, '0')}</span>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-primary)', wordBreak: 'break-all' }}>{pw}</code>
              <Badge color="#64748b">{pw.length} chars</Badge>
              <button onClick={() => copy(pw)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }} title="Copy">
                ⧉
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}