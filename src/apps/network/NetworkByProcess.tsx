// src/apps/network/NetworkByProcess.tsx
// Сетевая активность по процессам: сокеты, удалённые хосты, реальный сетевой трафик (RX / TX)

import { useState, useEffect, useCallback } from 'react';
import { Network, RefreshCw, Search, ShieldAlert, ArrowUpRight, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface ProcessConnectionInfo {
  pid: number;
  name: string;
  connection_count: number;
  established_count: number;
  remote_endpoints: string[];
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  io_read_bytes_per_sec?: number;
  io_write_bytes_per_sec?: number;
}

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const POLL_INTERVAL = 3000;

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

export default function NetworkByProcess() {
  const [connections, setConnections] = useState<ProcessConnectionInfo[]>([]);
  const [ifaceTraffic, setIfaceTraffic] = useState<{ rx: number; tx: number }>({ rx: 0, tx: 0 });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const [connData, netData] = await Promise.all([
          invoke<ProcessConnectionInfo[]>('get_network_connections_by_process'),
          invoke<{ interfaces: { rx_bytes_per_sec: number; tx_bytes_per_sec: number }[] }>('get_network_stats').catch(() => null),
        ]);
        setConnections(connData);
        if (netData?.interfaces) {
          const rx = netData.interfaces.reduce((acc, i) => acc + i.rx_bytes_per_sec, 0);
          const tx = netData.interfaces.reduce((acc, i) => acc + i.tx_bytes_per_sec, 0);
          setIfaceTraffic({ rx, tx });
        }
      } catch (err) {
        setErrorMsg(`Ошибка загрузки сетевых соединений: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    } else {
      // Mock data for dev mode with genuine network traffic metrics
      const mockData: ProcessConnectionInfo[] = [
        { pid: 1420, name: 'chrome.exe', connection_count: 18, established_count: 12, remote_endpoints: ['142.250.180.206:443', '172.217.16.206:443', '140.82.121.4:443'], rx_bytes_per_sec: 148576, tx_bytes_per_sec: 18432 },
        { pid: 3892, name: 'telegram.exe', connection_count: 6, established_count: 5, remote_endpoints: ['149.154.167.92:443', '91.108.56.165:443'], rx_bytes_per_sec: 32768, tx_bytes_per_sec: 4096 },
        { pid: 8124, name: 'code.exe', connection_count: 4, established_count: 3, remote_endpoints: ['20.189.173.12:443', '13.107.42.16:443'], rx_bytes_per_sec: 8192, tx_bytes_per_sec: 2048 },
        { pid: 9940, name: 'spotify.exe', connection_count: 3, established_count: 2, remote_endpoints: ['35.186.224.25:443'], rx_bytes_per_sec: 98304, tx_bytes_per_sec: 1024 },
        { pid: 4420, name: 'discord.exe', connection_count: 2, established_count: 2, remote_endpoints: ['162.159.130.233:443'], rx_bytes_per_sec: 12288, tx_bytes_per_sec: 3072 },
      ];
      setConnections(mockData);
      setIfaceTraffic({ rx: 299928, tx: 28672 });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchConnections();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchConnections]);

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    String(c.pid).includes(filter) ||
    c.remote_endpoints.some((e) => e.includes(filter))
  );

  const totalSockets = connections.reduce((acc, c) => acc + c.connection_count, 0);
  const procDownload = connections.reduce((acc, c) => acc + (c.rx_bytes_per_sec ?? c.io_read_bytes_per_sec ?? 0), 0);
  const procUpload = connections.reduce((acc, c) => acc + (c.tx_bytes_per_sec ?? c.io_write_bytes_per_sec ?? 0), 0);
  const totalDownload = Math.max(procDownload, ifaceTraffic.rx);
  const totalUpload = Math.max(procUpload, ifaceTraffic.tx);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      padding: '16px',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: 12,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Network size={20} color="var(--accent-primary)" />
          <div>
            <h2 style={{ margin: 0, fontSize: 14, letterSpacing: 1 }}>СЕТЕВАЯ АКТИВНОСТЬ ПРОЦЕССОВ</h2>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 3 }}>
              <span>Процессов: {connections.length}</span>
              <span>Сокетов: {totalSockets}</span>
              <span style={{ color: '#00d4ff', fontWeight: 600 }}>↓ {formatSpeed(totalDownload)}</span>
              <span style={{ color: '#00ff88', fontWeight: 600 }}>↑ {formatSpeed(totalUpload)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Авто (3с)
          </label>

          <button
            onClick={fetchConnections}
            disabled={loading}
            style={{
              background: 'rgba(0,255,136,0.1)',
              border: '1px solid rgba(0,255,136,0.3)',
              borderRadius: 4,
              color: 'var(--accent-primary)',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>
        </div>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 4,
          color: '#ef4444',
          fontSize: 11,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}>
          <ShieldAlert size={14} />
          {errorMsg}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 4,
        padding: '6px 10px',
        marginBottom: 12,
        flexShrink: 0,
      }}>
        <Search size={14} color="var(--text-muted)" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Фильтр по имени процесса, PID или удалённому IP..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            outline: 'none',
          }}
        />
        {filter && (
          <button
            onClick={() => setFilter('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
          >✕</button>
        )}
      </div>

      {/* Table Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        background: 'var(--bg-secondary)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{
              background: 'rgba(0,0,0,0.4)',
              borderBottom: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              textAlign: 'left',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              <th style={{ padding: '8px 12px' }}>ПРОЦЕСС</th>
              <th style={{ padding: '8px 12px', width: 70 }}>PID</th>
              <th style={{ padding: '8px 12px', width: 100 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ArrowDownCircle size={11} color="#00d4ff" /> СЕТЬ ВХОД
                </span>
              </th>
              <th style={{ padding: '8px 12px', width: 100 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ArrowUpCircle size={11} color="#00ff88" /> СЕТЬ ВЫХОД
                </span>
              </th>
              <th style={{ padding: '8px 12px', width: 80 }}>СОКЕТЫ</th>
              <th style={{ padding: '8px 12px' }}>УДАЛЁННЫЕ ХОСТЫ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Сканирование активных TCP сокетов...' : 'Активных сетевых соединений не найдено.'}
                </td>
              </tr>
            ) : (
              filtered.map((proc) => {
                const rxSpeed = proc.rx_bytes_per_sec ?? proc.io_read_bytes_per_sec ?? 0;
                const txSpeed = proc.tx_bytes_per_sec ?? proc.io_write_bytes_per_sec ?? 0;
                const hasTraffic = (rxSpeed + txSpeed) > 0;

                return (
                  <tr
                    key={proc.pid}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: hasTraffic ? '#00ff88' : 'rgba(255,255,255,0.2)',
                          boxShadow: hasTraffic ? '0 0 6px #00ff88' : 'none',
                        }} />
                        {proc.name}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                      {proc.pid}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        color: rxSpeed > 0 ? '#00d4ff' : 'var(--text-muted)',
                        fontWeight: rxSpeed > 0 ? 700 : 400,
                        fontSize: 10,
                      }}>
                        {formatSpeed(rxSpeed)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        color: txSpeed > 0 ? '#00ff88' : 'var(--text-muted)',
                        fontWeight: txSpeed > 0 ? 700 : 400,
                        fontSize: 10,
                      }}>
                        {formatSpeed(txSpeed)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        background: 'rgba(0,212,255,0.1)',
                        border: '1px solid rgba(0,212,255,0.2)',
                        padding: '2px 6px',
                        borderRadius: 3,
                        color: '#00d4ff',
                        fontWeight: 700,
                      }}>
                        {proc.connection_count}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {proc.remote_endpoints.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          proc.remote_endpoints.map((ep, i) => (
                            <span
                              key={i}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-color)',
                                padding: '1px 6px',
                                borderRadius: 3,
                                fontSize: 9.5,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <ArrowUpRight size={9} color="var(--accent-primary)" />
                              {ep}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
