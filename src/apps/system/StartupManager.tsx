// src/apps/system/StartupManager.tsx
// Менеджер автозагрузки Windows — Part P

import { useState, useEffect, useCallback } from 'react';
import { Power, PowerOff, RefreshCw, Shield, AlertTriangle } from 'lucide-react';

interface StartupEntry {
  name: string;
  command: string;
  location: string;
  enabled: boolean;
}

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export default function StartupManager() {
  const [entries, setEntries] = useState<StartupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<StartupEntry[]>('list_startup_entries');
        setEntries(result);
      } else {
        // Demo data for browser mode
        setEntries([
          { name: 'OneDrive', command: '"C:\\Program Files\\OneDrive\\OneDrive.exe"', location: 'HKCU', enabled: true },
          { name: 'Discord', command: 'C:\\Users\\user\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', location: 'HKCU', enabled: true },
          { name: 'Teams', command: '"C:\\Program Files\\Microsoft Teams\\current\\Teams.exe"', location: 'HKCU', enabled: false },
        ]);
      }
    } catch (e) {
      setError(`Ошибка загрузки: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleEntry = async (entry: StartupEntry) => {
    const key = `${entry.location}::${entry.name}`;
    setToggling(key);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_startup_entry', {
          hiveName: entry.location,
          name: entry.name,
          enable: !entry.enabled,
        });
        setEntries((prev) =>
          prev.map((e) =>
            e.name === entry.name && e.location === entry.location
              ? { ...e, enabled: !e.enabled }
              : e
          )
        );
        setStatusMsg(`${entry.name}: ${!entry.enabled ? 'включён' : 'отключён'}`);
        setTimeout(() => setStatusMsg(null), 2500);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Access') || msg.includes('denied') || msg.includes('5')) {
        setError(`Нет прав на изменение HKLM-записи "${entry.name}". Запустите SysForge от имени администратора.`);
      } else {
        setError(`Ошибка: ${msg}`);
      }
    } finally {
      setToggling(null);
    }
  };

  const hiveColor = (loc: string) =>
    loc === 'HKLM' ? '#ff9f0a' : '#00ff9c';

  const truncate = (str: string, max = 60) =>
    str.length > max ? str.slice(0, max) + '…' : str;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0e12', color: '#c0caf5', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 10px', borderBottom: '1px solid rgba(0,255,156,0.12)' }}>
        <Power size={18} color="#00ff9c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#00ff9c', letterSpacing: 1 }}>STARTUP MANAGER</span>
        <span style={{ fontSize: 11, color: '#4a5568', marginLeft: 4 }}>Windows Autorun Entries</span>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{ marginLeft: 'auto', background: 'rgba(0,255,156,0.08)', border: '1px solid rgba(0,255,156,0.2)', borderRadius: 6, padding: '4px 10px', color: '#00ff9c', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '10px 16px 0', padding: '8px 12px', background: 'rgba(255,63,63,0.1)', border: '1px solid rgba(255,63,63,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Status */}
      {statusMsg && (
        <div style={{ margin: '8px 16px 0', padding: '6px 12px', background: 'rgba(0,255,156,0.08)', border: '1px solid rgba(0,255,156,0.2)', borderRadius: 6, color: '#00ff9c', fontSize: 12 }}>
          ✓ {statusMsg}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 18px', fontSize: 11, color: '#4a5568', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span>
          <span style={{ color: '#00ff9c', fontWeight: 700 }}>HKCU</span> — текущий пользователь
        </span>
        <span>
          <span style={{ color: '#ff9f0a', fontWeight: 700 }}>HKLM</span> — все пользователи (нужны права)
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4a5568', paddingTop: 40, fontSize: 13 }}>Загрузка записей автозагрузки…</div>
        )}
        {!loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4a5568', paddingTop: 40, fontSize: 13 }}>Записи автозагрузки не найдены</div>
        )}
        {entries.map((entry) => {
          const key = `${entry.location}::${entry.name}`;
          const isToggling = toggling === key;
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                opacity: entry.enabled ? 1 : 0.55,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Toggle */}
              <button
                onClick={() => void toggleEntry(entry)}
                disabled={isToggling}
                title={entry.enabled ? 'Отключить' : 'Включить'}
                style={{
                  background: entry.enabled ? 'rgba(0,255,156,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${entry.enabled ? 'rgba(0,255,156,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  padding: '5px 7px',
                  cursor: isToggling ? 'wait' : 'pointer',
                  color: entry.enabled ? '#00ff9c' : '#4a5568',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                }}
              >
                {entry.enabled ? <Power size={14} /> : <PowerOff size={14} />}
              </button>

              {/* Hive badge */}
              <span style={{ fontSize: 10, fontWeight: 700, color: hiveColor(entry.location), background: `${hiveColor(entry.location)}18`, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
                {entry.location}
              </span>

              {/* Name and command */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: entry.enabled ? '#c0caf5' : '#4a5568', marginBottom: 2 }}>
                  {entry.name}
                </div>
                <div style={{ fontSize: 11, color: '#4a5568', wordBreak: 'break-all' }}>
                  {truncate(entry.command)}
                </div>
              </div>

              {/* HKLM admin hint */}
              {entry.location === 'HKLM' && (
                <span title="Требуются права администратора для изменения">
                  <Shield size={13} color="#ff9f0a" />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 18px', borderTop: '1px solid rgba(0,255,156,0.08)', fontSize: 11, color: '#2d3748', display: 'flex', justifyContent: 'space-between' }}>
        <span>Всего записей: {entries.length}</span>
        <span>Активных: {entries.filter((e) => e.enabled).length}</span>
      </div>
    </div>
  );
}
