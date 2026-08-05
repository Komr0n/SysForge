import { useState, useEffect, useMemo } from 'react';
import { useTauri } from '../../hooks/useTauri';
import { useInterval } from '../../hooks/useInterval';
import { formatBytes } from './SystemOverview';

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_bytes: number;
  status: string;
  user: string;
}

function mockProcesses(): ProcessInfo[] {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  return [
    { pid: 4, name: 'System', cpu_usage: 0.1, memory_bytes: 120 * mb, status: 'Run', user: 'SYSTEM' },
    { pid: 1420, name: 'sysforge.exe', cpu_usage: 1.8 + Math.random() * 2, memory_bytes: 180 * mb, status: 'Run', user: 'Admin' },
    { pid: 3412, name: 'chrome.exe', cpu_usage: 4.2 + Math.random() * 8, memory_bytes: 1.2 * gb, status: 'Run', user: 'Admin' },
    { pid: 5120, name: 'code.exe', cpu_usage: 2.1 + Math.random() * 3, memory_bytes: 850 * mb, status: 'Run', user: 'Admin' },
    { pid: 6890, name: 'explorer.exe', cpu_usage: 0.5, memory_bytes: 210 * mb, status: 'Run', user: 'Admin' },
    { pid: 7412, name: 'node.exe', cpu_usage: 0.8, memory_bytes: 140 * mb, status: 'Run', user: 'Admin' },
    { pid: 8900, name: 'svchost.exe', cpu_usage: 0.2, memory_bytes: 45 * mb, status: 'Run', user: 'SYSTEM' },
    { pid: 9410, name: 'discord.exe', cpu_usage: 1.1 + Math.random(), memory_bytes: 380 * mb, status: 'Run', user: 'Admin' },
    { pid: 10214, name: 'spotify.exe', cpu_usage: 0.6, memory_bytes: 260 * mb, status: 'Run', user: 'Admin' },
    { pid: 11450, name: 'taskmgr.exe', cpu_usage: 1.2, memory_bytes: 65 * mb, status: 'Run', user: 'Admin' },
  ];
}

type SortField = 'pid' | 'name' | 'cpu_usage' | 'memory_bytes' | 'status';

export default function ProcessManager() {
  const { invoke, isAvailable } = useTauri();
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu_usage');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchProcesses = async () => {
    if (isAvailable) {
      const res = await invoke<ProcessInfo[]>('get_processes');
      if (res) {
        setProcesses(res);
      }
    } else {
      setProcesses(mockProcesses());
    }
  };

  useEffect(() => {
    fetchProcesses();
  }, [isAvailable]);

  useInterval(fetchProcesses, 5000);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredProcesses = useMemo(() => {
    let list = processes.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) || p.pid.toString().includes(search)
    );

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [processes, search, sortField, sortAsc]);

  const handleKill = async () => {
    if (!selectedProcess) return;
    const target = selectedProcess;
    setSelectedProcess(null);

    if (isAvailable) {
      try {
        const msg = await invoke<string>('kill_process', { pid: target.pid });
        setActionMessage({ text: msg || `Terminated ${target.name}`, isError: false });
        fetchProcesses();
      } catch (err) {
        setActionMessage({ text: String(err), isError: true });
      }
    } else {
      setProcesses((prev) => prev.filter((p) => p.pid !== target.pid));
      setActionMessage({ text: `Simulated termination of ${target.name} (PID ${target.pid})`, isError: false });
    }

    setTimeout(() => setActionMessage(null), 4000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {/* Top Bar: Search & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <input
          type="text"
          placeholder="Filter by process name or PID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            padding: '6px 10px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          TOTAL: {processes.length} | SHOWN: {filteredProcesses.length}
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 4,
            background: actionMessage.isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 255, 136, 0.2)',
            border: `1px solid ${actionMessage.isError ? 'var(--danger)' : 'var(--accent-primary)'}`,
            color: actionMessage.isError ? 'var(--danger)' : 'var(--accent-primary)',
            fontSize: 11,
          }}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => handleSort('pid')}>
                PID {sortField === 'pid' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => handleSort('name')}>
                PROCESS NAME {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => handleSort('cpu_usage')}>
                CPU % {sortField === 'cpu_usage' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => handleSort('memory_bytes')}>
                MEMORY {sortField === 'memory_bytes' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => handleSort('status')}>
                STATUS {sortField === 'status' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredProcesses.map((proc) => (
              <tr
                key={proc.pid}
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  transition: 'background 0.15s',
                }}
                className="neon-glow-row"
              >
                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{proc.pid}</td>
                <td style={{ padding: '6px 10px', color: 'var(--accent-primary)', fontWeight: 600 }}>{proc.name}</td>
                <td style={{ padding: '6px 10px', color: proc.cpu_usage > 10 ? 'var(--warning)' : 'var(--text-primary)' }}>
                  {proc.cpu_usage.toFixed(1)}%
                </td>
                <td style={{ padding: '6px 10px', color: 'var(--accent-secondary)' }}>{formatBytes(proc.memory_bytes)}</td>
                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{proc.status}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                  <button
                    onClick={() => setSelectedProcess(proc)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid var(--danger)',
                      color: 'var(--danger)',
                      borderRadius: 3,
                      padding: '2px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                    title="Terminate Process"
                  >
                    KILL
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kill Modal Confirmation */}
      {selectedProcess && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--danger)',
              borderRadius: 8,
              padding: 20,
              maxWidth: 400,
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>
              ⚠️ TERMINATE PROCESS CONFIRMATION
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Are you sure you want to kill <strong>{selectedProcess.name}</strong> (PID: {selectedProcess.pid})?
              <br />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Unsaved data in this process will be lost.
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => setSelectedProcess(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  borderRadius: 4,
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleKill}
                style={{
                  background: 'var(--danger)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '6px 14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                KILL PROCESS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
