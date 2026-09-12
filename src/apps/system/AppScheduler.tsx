// src/apps/system/AppScheduler.tsx
// Монитор и планировщик автозакрытия приложений Windows

import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface ScheduledTask {
  id: string;
  appName: string;
  firesAtMs: number;
}

interface ProcessItem {
  pid: number;
  name: string;
  cpu_usage: number;
}

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export default function AppScheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>(() => {
    try {
      const saved = localStorage.getItem('sysforge_scheduled_tasks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [customMinutes, setCustomMinutes] = useState('15');
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Save tasks to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sysforge_scheduled_tasks', JSON.stringify(tasks));
    } catch { /* ignore */ }
  }, [tasks]);

  // Clock tick every 1s for live countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter expired tasks
  useEffect(() => {
    setTasks((prev) => prev.filter((t) => t.firesAtMs > currentTime));
  }, [currentTime]);

  // Listen to Tauri timer-fired event
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('jarvis:timer-fired', (event) => {
        setStatusMsg({ type: 'ok', text: `Приложение "${event.payload}" закрыто по расписанию.` });
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, []);

  // Fetch running processes
  const fetchProcesses = useCallback(async () => {
    setLoadingProcs(true);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const list = await invoke<ProcessItem[]>('get_processes');
        const unique = Array.from(new Map(list.map((p) => [p.name.toLowerCase(), p])).values());
        unique.sort((a, b) => a.name.localeCompare(b.name));
        setProcesses(unique);
        if (!selectedApp && unique.length > 0) {
          setSelectedApp(unique[0].name);
        }
      } catch (err) {
        console.warn('Failed to load processes:', err);
      } finally {
        setLoadingProcs(false);
      }
    } else {
      // Mock for browser dev mode
      setProcesses([
        { pid: 101, name: 'chrome.exe', cpu_usage: 2.5 },
        { pid: 102, name: 'telegram.exe', cpu_usage: 0.8 },
        { pid: 103, name: 'code.exe', cpu_usage: 4.1 },
        { pid: 104, name: 'notepad.exe', cpu_usage: 0.1 },
        { pid: 105, name: 'spotify.exe', cpu_usage: 1.2 },
      ]);
      setSelectedApp('chrome.exe');
      setLoadingProcs(false);
    }
  }, [selectedApp]);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Schedule task
  const handleSchedule = async (mins: number) => {
    const targetName = selectedApp.trim();
    if (!targetName) {
      setStatusMsg({ type: 'err', text: 'Выберите или укажите имя процесса.' });
      return;
    }

    const delaySeconds = Math.max(1, Math.round(mins * 60));
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{ id: string; app_name: string; fires_at_ms: number }>('schedule_close_app', {
          appName: targetName,
          delaySeconds,
        });
        setTasks((prev) => [...prev, { id: res.id, appName: res.app_name, firesAtMs: res.fires_at_ms }]);
        setStatusMsg({ type: 'ok', text: `Таймер установлен: "${targetName}" закроется через ${mins} мин.` });
      } catch (e) {
        setStatusMsg({ type: 'err', text: `Ошибка: ${(e as Error).message}` });
      }
    } else {
      const mockId = Math.random().toString(36).slice(2);
      const firesAtMs = Date.now() + delaySeconds * 1000;
      setTasks((prev) => [...prev, { id: mockId, appName: targetName, firesAtMs }]);
      setStatusMsg({ type: 'ok', text: `[Dev] Таймер установлен на ${mins} мин.` });
    }
  };

  // Cancel task
  const handleCancel = async (id: string, name: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('cancel_scheduled_close', { id });
      } catch (e) {
        console.warn('Failed to cancel on backend:', e);
      }
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setStatusMsg({ type: 'ok', text: `Таймер для "${name}" отменён.` });
  };

  const formatRemaining = (firesAt: number) => {
    const diff = Math.max(0, Math.floor((firesAt - currentTime) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}м ${s < 10 ? '0' : ''}${s}с`;
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      padding: '16px',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: 12,
      }}>
        <Clock size={20} color="var(--accent-primary)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 14, letterSpacing: 1 }}>ПЛАНИРОВЩИК АВТОЗАКРЫТИЯ</h2>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Автоматическое завершение приложений Windows по таймеру
          </div>
        </div>
      </div>

      {/* Status banner */}
      {statusMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          marginBottom: 14,
          borderRadius: 4,
          fontSize: 11,
          background: statusMsg.type === 'ok' ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${statusMsg.type === 'ok' ? 'rgba(0,255,136,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: statusMsg.type === 'ok' ? '#00ff88' : '#ef4444',
        }}>
          {statusMsg.type === 'ok' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Form: Create new timer */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: '14px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 12, letterSpacing: 0.5 }}>
          НОВЫЙ ТАЙМЕР ЗАКРЫТИЯ
        </div>

        {/* Process Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Выберите запущенный процесс:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={selectedApp}
                onChange={(e) => setSelectedApp(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  padding: '6px 10px',
                }}
              >
                {processes.map((p) => (
                  <option key={p.pid} value={p.name}>
                    {p.name} (PID: {p.pid})
                  </option>
                ))}
              </select>
              <button
                onClick={fetchProcesses}
                disabled={loadingProcs}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  color: 'var(--text-muted)',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Обновить список процессов"
              >
                <RefreshCw size={13} className={loadingProcs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Manual Process Name Input if needed */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Или введите имя процесса вручную:
          </label>
          <input
            type="text"
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            placeholder="например: chrome, telegram, notepad"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '6px 10px',
            }}
          />
        </div>

        {/* Presets & Custom Minutes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Быстрый выбор:</span>
          {[15, 30, 60].map((m) => (
            <button
              key={m}
              onClick={() => handleSchedule(m)}
              style={{
                background: 'rgba(0,255,136,0.08)',
                border: '1px solid rgba(0,255,136,0.3)',
                borderRadius: 4,
                color: '#00ff88',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '5px 12px',
                cursor: 'pointer',
              }}
            >
              +{m} мин
            </button>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <input
              type="number"
              min="1"
              max="1440"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              style={{
                width: 60,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: '4px 6px',
                textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>мин</span>
            <button
              onClick={() => handleSchedule(parseFloat(customMinutes) || 15)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 4,
                color: '#000',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 11,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Установить
            </button>
          </div>
        </div>
      </div>

      {/* Active Timers List */}
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
            АКТИВНЫЕ ТАЙМЕРЫ ({tasks.length})
          </span>
        </div>

        {tasks.length === 0 ? (
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            border: '1px dashed var(--border-color)',
            borderRadius: 6,
            padding: '32px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 11,
          }}>
            Нет запланированных закрытий. Выберите программу выше и установите таймер.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#00ff88',
                    boxShadow: '0 0 8px #00ff88',
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {task.appName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Закрытие в: {new Date(task.firesAtMs).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#00d4ff',
                    letterSpacing: 1,
                  }}>
                    {formatRemaining(task.firesAtMs)}
                  </span>

                  <button
                    onClick={() => handleCancel(task.id, task.appName)}
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 4,
                      color: '#ef4444',
                      padding: '5px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                    }}
                    title="Отменить закрытие"
                  >
                    <Trash2 size={12} /> Отмена
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
