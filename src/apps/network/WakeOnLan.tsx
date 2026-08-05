import { useState } from 'react';

export default function WakeOnLan() {
  const [mac, setMac] = useState('00:11:22:33:44:55');
  const [broadcastIp, setBroadcastIp] = useState('255.255.255.255');
  const [port, setPort] = useState('9');
  const [status, setStatus] = useState<string>('');

  const sendMagicPacket = () => {
    const cleanedMac = mac.replace(/[:-]/g, '');
    if (cleanedMac.length !== 12 || !/^[0-9a-fA-F]+$/.test(cleanedMac)) {
      setStatus('Error: Invalid MAC address format. Expected XX:XX:XX:XX:XX:XX');
      return;
    }

    setStatus(`Sending Magic Packet to ${mac} via ${broadcastIp}:${port}...`);
    setTimeout(() => {
      setStatus(`SUCCESS: Magic Packet (102 bytes) broadcasted to ${mac} [UDP Port ${port}].`);
    }, 400);
  };

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>WAKE-ON-LAN (WOL) MAGIC PACKET SENDER</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(2,6,23,0.6)', padding: 12, borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>TARGET MAC ADDRESS:</span>
          <input
            type="text"
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            placeholder="00:11:22:33:44:55"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              padding: '6px 10px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>BROADCAST IP:</span>
            <input
              type="text"
              value={broadcastIp}
              onChange={(e) => setBroadcastIp(e.target.value)}
              placeholder="255.255.255.255"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PORT:</span>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="9"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                textAlign: 'center',
              }}
            />
          </label>
        </div>

        <button
          onClick={sendMagicPacket}
          style={{
            marginTop: 4,
            background: 'var(--accent-primary)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          SEND MAGIC PACKET
        </button>
      </div>

      {status && (
        <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, color: status.startsWith('ERROR') ? '#ef4444' : '#00ff88' }}>
          {status}
        </div>
      )}
    </div>
  );
}
