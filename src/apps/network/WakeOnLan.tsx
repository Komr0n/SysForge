import { useState } from 'react';
import { useTauri } from '../../hooks/useTauri';

/**
 * WakeOnLan — real magic packet via Rust UDP broadcast (desktop) or
 * honest "unavailable" message in browser mode.
 */
export default function WakeOnLan() {
  const { invoke, isAvailable } = useTauri();
  const [mac, setMac] = useState('00:11:22:33:44:55');
  const [broadcastIp, setBroadcastIp] = useState('255.255.255.255');
  const [port, setPort] = useState('9');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const sendMagicPacket = async () => {
    const cleanedMac = mac.replace(/[:-]/g, '');
    if (cleanedMac.length !== 12 || !/^[0-9a-fA-F]+$/.test(cleanedMac)) {
      setStatus({ ok: false, text: 'Error: Invalid MAC address format. Expected XX:XX:XX:XX:XX:XX' });
      return;
    }
    const portNum = parseInt(port, 10);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setStatus({ ok: false, text: 'Error: Invalid UDP port.' });
      return;
    }

    if (!isAvailable) {
      setStatus({ ok: false, text: 'UDP sockets require the desktop app — browser cannot send magic packets.' });
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      const msg = await invoke<string>('send_wol_packet', {
        mac: mac.trim(),
        broadcast: broadcastIp.trim() || '255.255.255.255',
        port: portNum,
      });
      setStatus({ ok: true, text: `SUCCESS: ${msg}` });
    } catch (e) {
      setStatus({ ok: false, text: `FAILED: ${String(e)}` });
    } finally {
      setSending(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border-color)',
    borderRadius: 4,
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>WAKE-ON-LAN (WOL) MAGIC PACKET SENDER</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(2,6,23,0.6)', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>TARGET MAC ADDRESS:</span>
          <input type="text" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="00:11:22:33:44:55" style={inputStyle} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>BROADCAST IP:</span>
            <input type="text" value={broadcastIp} onChange={(e) => setBroadcastIp(e.target.value)} placeholder="255.255.255.255" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PORT:</span>
            <input type="text" value={port} onChange={(e) => setPort(e.target.value)} placeholder="9" style={inputStyle} />
          </label>
        </div>

        <button
          onClick={sendMagicPacket}
          disabled={sending}
          style={{
            background: sending ? 'rgba(100,116,139,0.3)' : 'var(--accent-primary)',
            color: sending ? 'var(--text-muted)' : '#000',
            border: 'none', borderRadius: 4, padding: '8px 16px',
            fontWeight: 700, cursor: sending ? 'default' : 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {sending ? 'SENDING…' : 'SEND MAGIC PACKET'}
        </button>

        {status && (
          <div style={{
            padding: 10, borderRadius: 4, border: `1px solid ${status.ok ? '#00ff88' : '#ef4444'}`,
            background: status.ok ? 'rgba(0,255,136,0.06)' : 'rgba(239,68,68,0.08)',
            color: status.ok ? '#00ff88' : '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {status.text}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>
        The target machine must have Wake-on-LAN enabled in its BIOS/UEFI and network driver settings.
        Default ports: 9 (discard) or 7 (echo).
      </div>
    </div>
  );
}
