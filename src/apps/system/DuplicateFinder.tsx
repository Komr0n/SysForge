// src/apps/system/DuplicateFinder.tsx
// Поиск дублирующихся файлов (размер → BLAKE3) — Part O

import { useState } from 'react';
import { Copy, Trash2, FolderOpen, AlertTriangle, CheckSquare, Square, RefreshCw } from 'lucide-react';

interface DuplicateGroup {
  hash: string;
  size: number;
  paths: string[];
}

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function DuplicateFinder() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [rootPath, setRootPath] = useState('');

  const scan = async (root: string) => {
    setLoading(true);
    setError(null);
    setGroups([]);
    setSelectedPaths(new Set());
    setDeletedCount(0);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<DuplicateGroup[]>('find_duplicate_files', { root });
        setGroups(result);
        setRootPath(root);
      } else {
        // Demo
        setGroups([
          { hash: 'abc123', size: 4 * 1024 * 1024, paths: ['C:\\Users\\user\\Documents\\report.pdf', 'C:\\Users\\user\\Downloads\\report.pdf', 'C:\\Backup\\report.pdf'] },
          { hash: 'def456', size: 2 * 1024 * 1024, paths: ['C:\\Photos\\IMG_001.jpg', 'C:\\Photos\\backup\\IMG_001.jpg'] },
        ]);
        setRootPath(root);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pickAndScan = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true });
        if (selected && typeof selected === 'string') await scan(selected);
      } catch {
        await scan('C:\\Users');
      }
    } else {
      await scan('C:\\Users');
    }
  };

  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAllDuplicates = () => {
    // For each group, select all but the first (keep one copy)
    const toSelect = new Set<string>();
    groups.forEach((g) => g.paths.slice(1).forEach((p) => toSelect.add(p)));
    setSelectedPaths(toSelect);
  };

  const deleteSelected = async () => {
    setDeleting(true);
    let count = 0;
    try {
      if (isTauri) {
        const { remove } = await import('@tauri-apps/plugin-fs');
        for (const path of selectedPaths) {
          try {
            await remove(path);
            count++;
          } catch {
            // Continue on individual failures
          }
        }
      } else {
        count = selectedPaths.size;
      }
      setDeletedCount(count);
      // Remove deleted paths from groups
      setGroups((prev) =>
        prev
          .map((g) => ({ ...g, paths: g.paths.filter((p) => !selectedPaths.has(p)) }))
          .filter((g) => g.paths.length > 1)
      );
      setSelectedPaths(new Set());
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const totalWasted = groups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  const selectedWasted = groups.reduce((s, g) => s + g.size * g.paths.filter((p) => selectedPaths.has(p)).length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0e12', color: '#c0caf5', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid rgba(0,255,156,0.12)' }}>
        <Copy size={18} color="#00ff9c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#00ff9c', letterSpacing: 1 }}>DUPLICATE FINDER</span>
        <button
          onClick={pickAndScan}
          disabled={loading}
          style={{ marginLeft: 'auto', background: 'rgba(0,255,156,0.1)', border: '1px solid rgba(0,255,156,0.3)', borderRadius: 6, padding: '5px 12px', color: '#00ff9c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <FolderOpen size={13} />
          Сканировать папку
        </button>
      </div>

      {error && (
        <div style={{ margin: '8px 16px', padding: '8px 12px', background: 'rgba(255,63,63,0.1)', border: '1px solid rgba(255,63,63,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12, display: 'flex', gap: 8 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Stats bar */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 18px', background: 'rgba(0,255,156,0.04)', borderBottom: '1px solid rgba(0,255,156,0.08)', fontSize: 12 }}>
          <span style={{ color: '#4a5568' }}>Групп дублей: <span style={{ color: '#c0caf5' }}>{groups.length}</span></span>
          <span style={{ color: '#4a5568' }}>Потрачено места: <span style={{ color: '#ff6b6b' }}>{formatBytes(totalWasted)}</span></span>
          {selectedPaths.size > 0 && (
            <span style={{ color: '#4a5568' }}>Выбрано: <span style={{ color: '#ff9f0a' }}>{selectedPaths.size} файлов ({formatBytes(selectedWasted)})</span></span>
          )}
          <button onClick={selectAllDuplicates} style={{ marginLeft: 'auto', background: 'rgba(255,63,63,0.1)', border: '1px solid rgba(255,63,63,0.2)', borderRadius: 5, padding: '3px 10px', color: '#ff6b6b', cursor: 'pointer', fontSize: 11 }}>
            Выбрать дубли (оставить по одному)
          </button>
          {selectedPaths.size > 0 && (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ background: 'rgba(255,63,63,0.15)', border: '1px solid rgba(255,63,63,0.4)', borderRadius: 5, padding: '3px 10px', color: '#ff6b6b', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Trash2 size={11} />
              Удалить выбранные
            </button>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDelete && (
        <div style={{ margin: '8px 16px', padding: '10px 14px', background: 'rgba(255,63,63,0.12)', border: '1px solid rgba(255,63,63,0.4)', borderRadius: 8, fontSize: 12 }}>
          <div style={{ color: '#ff6b6b', fontWeight: 700, marginBottom: 6 }}>⚠ Подтвердите удаление</div>
          <div style={{ color: '#c0caf5', marginBottom: 10 }}>
            Удалить <strong>{selectedPaths.size}</strong> файлов ({formatBytes(selectedWasted)})? Это действие необратимо.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              style={{ background: 'rgba(255,63,63,0.2)', border: '1px solid rgba(255,63,63,0.5)', borderRadius: 5, padding: '5px 14px', color: '#ff6b6b', cursor: 'pointer', fontSize: 12 }}
            >
              {deleting ? 'Удаление…' : 'Удалить навсегда'}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '5px 14px', color: '#4a5568', cursor: 'pointer', fontSize: 12 }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {deletedCount > 0 && (
        <div style={{ margin: '8px 16px', padding: '6px 12px', background: 'rgba(0,255,156,0.08)', border: '1px solid rgba(0,255,156,0.2)', borderRadius: 6, color: '#00ff9c', fontSize: 12 }}>
          ✓ Удалено {deletedCount} файлов
        </div>
      )}

      {/* Groups list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: '#4a5568', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={20} className="spin" />
            Вычисление хешей… это может занять время для больших папок
          </div>
        )}
        {!loading && groups.length === 0 && rootPath && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: '#4a5568', fontSize: 13 }}>
            Дублирующихся файлов не найдено в <span style={{ color: '#00ff9c' }}>{rootPath}</span>
          </div>
        )}
        {!loading && groups.length === 0 && !rootPath && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#4a5568' }}>
            <Copy size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 14 }}>Выберите папку для поиска дублей</p>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.hash} style={{ margin: '6px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,63,63,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 11, color: '#ff6b6b', background: 'rgba(255,63,63,0.1)', borderRadius: 4, padding: '2px 6px' }}>{group.paths.length} копии</span>
              <span style={{ fontSize: 11, color: '#ff9f0a' }}>{formatBytes(group.size)} × {group.paths.length - 1} = <strong>{formatBytes(group.size * (group.paths.length - 1))}</strong> потеряно</span>
              <span style={{ fontSize: 10, color: '#2d3748', marginLeft: 'auto' }}>#{group.hash.slice(0, 12)}</span>
            </div>
            {group.paths.map((p, pi) => {
              const isSelected = selectedPaths.has(p);
              const isOriginal = pi === 0;
              return (
                <div
                  key={p}
                  onClick={() => togglePath(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', background: isSelected ? 'rgba(255,63,63,0.08)' : 'transparent', borderBottom: pi < group.paths.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', transition: 'background 0.15s' }}
                >
                  <span style={{ color: isSelected ? '#ff6b6b' : '#4a5568', flexShrink: 0 }}>
                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </span>
                  {isOriginal && (
                    <span style={{ fontSize: 10, color: '#00ff9c', background: 'rgba(0,255,156,0.1)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>оригинал</span>
                  )}
                  <span style={{ fontSize: 12, color: isSelected ? '#ff6b6b' : '#c0caf5', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
