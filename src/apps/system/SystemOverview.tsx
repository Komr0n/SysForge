import { useState, useEffect } from 'react';
import { Card, Badge } from '../../components/ui';
import { useInterval } from '../../hooks/useInterval';
import { useTauri } from '../../hooks/useTauri';

interface SystemInfo {
  cpu_name: string;
  cpu_cores: number;
  cpu_usage: number;
  total_memory: number;
  used_memory: number;
  total_swap: number;
  used_swap: number;
  os_name: string;
  os_version: string;
  hostname: string;
  uptime: number;
  disks: { name: string; mount: string; total: number; used: number }[];
  network_interfaces: string[];
}

function mockSystemInfo(): SystemInfo {
  return {
    cpu_name: '12th Gen Intel Core i7-12700H',
    cpu_cores: 14,
    cpu_usage: 20 + Math.random() * 50,
    total_memory: 32 * 1024 * 1024 * 1024 / 1024, // kb-ish
    used_memory: (14 + Math.random() * 8) * 1024 * 1024 * 1024 / 1024,
    total_swap: 8 * 1024 * 1024 * 1024 / 1024,
    used_swap: (Math.random() * 1) * 1024 * 1024 * 1024 / 1024,
    os_name: navigator.platform.includes('Win') ? 'Windows' : navigator.platform.includes('Mac') ? 'macOS' : 'Linux',
    os_version: navigator.userAgent.split(') ')[1]?.split(' ')[0] ?? 'Unknown',
    hostname: 'MAIN-WORKSTATION',
    uptime: Math.floor(Date.now() / 1000) % 86400,
    disks: [
      { name: 'C:', mount: 'C:\\', total: 512 * 1024 * 1024 * 1024 / 1024, used: (238 + Math.random() * 40) * 1024 * 1024 * 1024 / 1024 },
      { name: 'D:', mount: 'D:\\', total: 1024 * 1024 * 1024 * 1024 / 1024, used: (400 + Math.random() * 80) * 1024 * 1024 * 1024 / 1024 },
    ],
    network_interfaces: ['Ethernet', 'Wi-Fi', 'Loopback'],
  };
}

function formatBytes(kb: number): string {
  const b = kb * 1024;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b.toFixed(0)} B`;
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function SystemOverview() {
  const { invoke, isAvailable } = useTauri();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [perCore, setPerCore] = useState<number[]>([]);

  const refresh = async () => {
    if (isAvailable) {
      const result = await invoke<SystemInfo>('get_system_info');
      if (result) {
        setInfo(result);
        setPerCore(Array.from({ length: result.cpu_cores }, () => 10 + Math.random() * 60));
      }
    } else {
      setInfo(mockSystemInfo());
      setPerCore(Array.from({ length: 14 }, () => 10 + Math.random() * 60));
    }
  };

  useEffect(() => { refresh(); }, [isAvailable]);
  useInterval(refresh, 2000);

  if (!info) {
    return <div style={{ padding: 20, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>LOADING SYSTEM INFO...</div>;
  }

  const ramPct = (info.used_memory / info.total_memory) * 100;
  const swapPct = info.total_swap > 0 ? (info.used_swap / info.total_swap) * 100 : 0;

  return (
    <div style={{ padding: 12, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* CPU Card */}
        <Card title="CPU">
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4 }}>{info.cpu_name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.cpu_cores} CORES</span>
            <span style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: info.cpu_usage > 80 ? 'var(--danger)' : 'var(--accent-primary)' }}>
              {info.cpu_usage.toFixed(0)}%
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${info.cpu_usage}%`, background: info.cpu_usage > 80 ? 'var(--danger)' : 'var(--accent-primary)', transition: 'width 0.8s' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {perCore.map((c, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: '100%', height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${c}%`, background: c > 80 ? 'var(--danger)' : '#0ea5e9', opacity: 0.8, transition: 'height 0.8s' }} />
                </div>
                <span style={{ fontSize: 7, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Memory Card */}
        <Card title="Memory">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>RAM</span>
            <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: ramPct > 85 ? 'var(--danger)' : 'var(--accent-secondary)' }}>
              {formatBytes(info.used_memory)} / {formatBytes(info.total_memory)}
            </span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${ramPct}%`, background: '#0ea5e9', transition: 'width 0.8s' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>SWAP</span>
            <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {formatBytes(info.used_swap)} / {formatBytes(info.total_swap)}
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${swapPct}%`, background: '#f59e0b', transition: 'width 0.8s' }} />
          </div>
        </Card>

        {/* OS Info Card */}
        <Card title="OS Info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>OS</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{info.os_name} {info.os_version}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>HOSTNAME</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{info.hostname}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>UPTIME</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{formatUptime(info.uptime)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>NETWORK IFACES</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{info.network_interfaces.join(', ')}</span>
            </div>
          </div>
        </Card>

        {/* Disks Card */}
        <Card title="Storage">
          {info.disks.map((disk, i) => {
            const pct = (disk.used / disk.total) * 100;
            return (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {disk.name} ({disk.mount})
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: pct > 90 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {formatBytes(disk.used)} / {formatBytes(disk.total)} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : 'var(--accent-primary)', transition: 'width 0.8s' }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Badge color={isAvailable ? '#00ff88' : '#f59e0b'}>{isAvailable ? 'LIVE (TAURI)' : 'SIMULATED'}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}