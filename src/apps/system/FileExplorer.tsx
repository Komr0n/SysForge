// src/apps/system/FileExplorer.tsx
// Проводник-поисковик по имени файла — Part K

import { useState, useRef, useCallback } from 'react';
import { Search, FolderOpen, File, Folder, ExternalLink, Filter, X } from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  extension: string;
}

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const EXT_COLORS: Record<string, string> = {
  pdf: '#ff6b6b', docx: '#4fc3f7', xlsx: '#81c784', pptx: '#ff9f0a',
  jpg: '#bb9af7', jpeg: '#bb9af7', png: '#73daca', gif: '#73daca',
  mp4: '#f7768e', mp3: '#e0af68', zip: '#ff9f0a', rar: '#ff9f0a',
  exe: '#ff6b6b', dll: '#4a5568', ts: '#00d4ff', tsx: '#00d4ff',
  js: '#e0af68', json: '#ff9f0a', py: '#73daca', rs: '#ff6b6b',
  txt: '#c0caf5', md: '#c0caf5', log: '#4a5568', sql: '#bb9af7',
};

export default function FileExplorer() {
  const [query, setQuery] = useState('');
  const [extFilter, setExtFilter] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickRoot = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true });
        if (selected && typeof selected === 'string') setRootPath(selected);
      } catch {
        setRootPath('C:\\Users');
      }
    } else {
      setRootPath('C:\\Users');
    }
  };

  const doSearch = useCallback(async (q: string, ext: string, root: string) => {
    if (!q.trim() || !root) return;
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<FileEntry[]>('search_files_by_name', {
          query: q,
          root,
          extensionFilter: ext.trim() || null,
          limit: 200,
        });
        setResults(res);
      } else {
        // Demo
        const demo: FileEntry[] = [
          { name: 'report.pdf', path: 'C:\\Users\\user\\Documents\\report.pdf', size: 2 * 1024 * 1024, is_dir: false, extension: 'pdf' },
          { name: 'notes.txt', path: 'C:\\Users\\user\\Desktop\\notes.txt', size: 4096, is_dir: false, extension: 'txt' },
          { name: 'Projects', path: 'C:\\Users\\user\\Projects', size: 0, is_dir: true, extension: '' },
        ].filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
        setResults(demo);
      }
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        void doSearch(val, extFilter, rootPath);
      }, 400);
    } else {
      setResults([]);
      setSearched(false);
    }
  };

  const openInExplorer = async (path: string) => {
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      invoke('open_path_in_explorer', { path }).catch(() => {});
    }
  };

  const extColor = (ext: string) => EXT_COLORS[ext.toLowerCase()] ?? '#4a5568';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0e12', color: '#c0caf5', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid rgba(0,255,156,0.12)' }}>
        <Search size={18} color="#00ff9c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#00ff9c', letterSpacing: 1 }}>FILE EXPLORER</span>
        <span style={{ fontSize: 11, color: '#4a5568' }}>Поиск по имени файла</span>
      </div>

      {/* Search controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
        {/* Root picker */}
        <button
          onClick={pickRoot}
          style={{ background: 'rgba(0,255,156,0.08)', border: '1px solid rgba(0,255,156,0.2)', borderRadius: 6, padding: '5px 10px', color: '#00ff9c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }}
        >
          <FolderOpen size={12} />
          {rootPath ? rootPath.split(/[/\\]/).slice(-1)[0] || rootPath : 'Выбрать папку'}
        </button>

        {/* Query input */}
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#4a5568', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Имя файла или папки…"
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 30px 6px 30px', color: '#c0caf5', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setSearched(false); }} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Extension filter */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Filter size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#4a5568', pointerEvents: 'none' }} />
          <input
            value={extFilter}
            onChange={(e) => {
              setExtFilter(e.target.value);
              if (query.trim().length >= 2) void doSearch(query, e.target.value, rootPath);
            }}
            placeholder="расш. (pdf)"
            style={{ width: 90, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 8px 6px 24px', color: '#c0caf5', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        <button
          onClick={() => void doSearch(query, extFilter, rootPath)}
          disabled={!query.trim() || !rootPath || loading}
          style={{ background: 'rgba(0,255,156,0.12)', border: '1px solid rgba(0,255,156,0.3)', borderRadius: 6, padding: '6px 14px', color: '#00ff9c', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
        >
          Найти
        </button>
      </div>

      {error && (
        <div style={{ margin: '8px 16px', padding: '8px 12px', background: 'rgba(255,63,63,0.1)', border: '1px solid rgba(255,63,63,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: '#4a5568', fontSize: 13 }}>
            Поиск в {rootPath}…
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40, color: '#4a5568', fontSize: 13 }}>
            Ничего не найдено по запросу «{query}»
            {extFilter && <span> с расширением .{extFilter}</span>}
          </div>
        )}

        {!loading && !searched && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#4a5568' }}>
            <Search size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
            <p style={{ fontSize: 14 }}>Выберите папку и введите имя файла</p>
            {!rootPath && (
              <button onClick={pickRoot} style={{ marginTop: 8, background: 'rgba(0,255,156,0.1)', border: '1px solid rgba(0,255,156,0.3)', borderRadius: 8, padding: '7px 18px', color: '#00ff9c', cursor: 'pointer', fontSize: 13 }}>
                Выбрать папку
              </button>
            )}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div style={{ padding: '6px 18px', fontSize: 11, color: '#4a5568', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              Найдено: <span style={{ color: '#00ff9c' }}>{results.length}</span>{results.length === 200 && ' (первые 200)'}
            </div>
            {results.map((entry) => (
              <div
                key={entry.path}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {entry.is_dir
                  ? <Folder size={15} color="#ff9f0a" style={{ flexShrink: 0 }} />
                  : <File size={15} color={extColor(entry.extension)} style={{ flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#c0caf5', fontWeight: 500 }}>{entry.name}</div>
                  <div style={{ fontSize: 11, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</div>
                </div>
                {!entry.is_dir && entry.extension && (
                  <span style={{ fontSize: 10, color: extColor(entry.extension), background: `${extColor(entry.extension)}18`, borderRadius: 3, padding: '2px 5px', flexShrink: 0, textTransform: 'uppercase' }}>
                    {entry.extension}
                  </span>
                )}
                {!entry.is_dir && (
                  <span style={{ fontSize: 11, color: '#4a5568', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>
                    {formatBytes(entry.size)}
                  </span>
                )}
                <button
                  onClick={() => openInExplorer(entry.path)}
                  title="Открыть в проводнике"
                  style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#00ff9c')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4a5568')}
                >
                  <ExternalLink size={13} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
