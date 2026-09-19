// src/apps/system/FileExplorer.tsx
// Мощный тактический поисковик SysForge (Part K):
// 1. Поиск по имени и расширению файла (Instant File Search)
// 2. Полнотекстовый поиск по содержимому файлов со сниппетами (Content Search)
// 3. Быстрый веб-поисковик (Google, DuckDuckGo, Yandex, GitHub)

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search,
  FolderOpen,
  File,
  Folder,
  ExternalLink,
  Filter,
  X,
  FileText,
  Globe,
  Copy,
  Check,
  HardDrive,
  Zap,
  Database,
  RefreshCw,
} from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  extension: string;
}

interface ContentMatch {
  path: string;
  filename: string;
  extension: string;
  size: number;
  line_number: number;
  snippet: string;
}

type SearchTab = 'filename' | 'content' | 'web';

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const EXT_COLORS: Record<string, string> = {
  pdf: '#ff6b6b', docx: '#4fc3f7', xlsx: '#81c784', pptx: '#ff9f0a',
  jpg: '#bb9af7', jpeg: '#bb9af7', png: '#73daca', gif: '#73daca', svg: '#73daca',
  mp4: '#f7768e', mp3: '#e0af68', zip: '#ff9f0a', rar: '#ff9f0a', '7z': '#ff9f0a',
  exe: '#ff6b6b', dll: '#4a5568', ts: '#00d4ff', tsx: '#00d4ff',
  js: '#e0af68', jsx: '#e0af68', json: '#ff9f0a', py: '#73daca', rs: '#ff6b6b',
  txt: '#c0caf5', md: '#c0caf5', log: '#94a3b8', sql: '#bb9af7',
  html: '#f97316', css: '#38bdf8', toml: '#fbbf24', ini: '#a3e635',
};

const CATEGORIES = [
  { label: 'Все', ext: '' },
  { label: 'Документы', ext: 'pdf,docx,xlsx,pptx,odt,ods,odp,txt,md,csv' },
  { label: 'Код', ext: 'ts,tsx,js,jsx,py,rs,json,html,css,sql' },
  { label: 'Медиа', ext: 'png,jpg,jpeg,svg,mp4,mp3' },
  { label: 'Архивы', ext: 'zip,rar,7z,tar,gz' },
  { label: 'Исполняемые', ext: 'exe,bat,cmd,ps1,msi' },
];

const WEB_ENGINES = [
  { id: 'google', name: 'Google', url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: (q: string) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  { id: 'yandex', name: 'Яндекс', url: (q: string) => `https://yandex.ru/search/?text=${encodeURIComponent(q)}` },
  { id: 'github', name: 'GitHub', url: (q: string) => `https://github.com/search?q=${encodeURIComponent(q)}` },
  { id: 'stackoverflow', name: 'StackOverflow', url: (q: string) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}` },
];

export default function FileExplorer() {
  const [activeTab, setActiveTab] = useState<SearchTab>('filename');
  const [query, setQuery] = useState('');
  const [extFilter, setExtFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Все');
  const [rootPath, setRootPath] = useState('C:\\');
  const [webEngine, setWebEngine] = useState('google');

  // Результаты поиска по имени
  const [nameResults, setNameResults] = useState<FileEntry[]>([]);
  // Результаты поиска по содержимому
  const [contentResults, setContentResults] = useState<ContentMatch[]>([]);

  // MFT State (Part 2.1)
  const [isMftIndexed, setIsMftIndexed] = useState(false);
  const [mftIndexing, setMftIndexing] = useState(false);
  const [mftCount, setMftCount] = useState(0);

  // Tantivy Full-Text State (Part 2.2)
  const [tantivyIndexing, setTantivyIndexing] = useState(false);
  const [tantivyProgress, setTantivyProgress] = useState<{ current: number; total: number; indexed: number; file?: string; done?: boolean } | null>(null);
  const [tantivyDocCount, setTantivyDocCount] = useState(0);
  const [contentSearchMode, setContentSearchMode] = useState<'tantivy' | 'folder'>('tantivy');

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkMftStatus = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const drive = rootPath.slice(0, 1) || 'C';
      const indexed = await invoke<boolean>('is_volume_mft_indexed', { drive });
      setIsMftIndexed(indexed);
    } catch {
      setIsMftIndexed(false);
    }
  }, [rootPath]);

  const loadTantivyStats = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const stats = await invoke<{ indexed_docs: number; index_dir: string }>('get_content_index_stats');
      setTantivyDocCount(stats.indexed_docs);
    } catch {
      setTantivyDocCount(0);
    }
  }, []);

  const startIndexVolumeMft = async () => {
    if (!isTauri) return;
    setMftIndexing(true);
    setMftCount(0);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const drive = rootPath.slice(0, 1) || 'C';
      const count = await invoke<number>('index_volume_mft', { drive });
      setMftCount(count);
      setIsMftIndexed(true);
    } catch (err) {
      console.warn('MFT indexing error:', err);
    } finally {
      setMftIndexing(false);
    }
  };

  const startIndexFolderForContent = async () => {
    if (!isTauri || !rootPath) return;
    setTantivyIndexing(true);
    setTantivyProgress(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke<number>('index_folder_for_content', { root: rootPath });
      await loadTantivyStats();
    } catch (err) {
      console.warn('Tantivy indexing error:', err);
    } finally {
      setTantivyIndexing(false);
    }
  };

  useEffect(() => {
    if (!isTauri) return;
    let unlistenProgress: (() => void) | undefined;
    let unlistenMft: (() => void) | undefined;

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ current: number; total: number; indexed: number; file?: string; done?: boolean }>(
        'sysforge:index-progress',
        (event) => {
          setTantivyProgress(event.payload);
          if (event.payload.done) {
            setTantivyIndexing(false);
            void loadTantivyStats();
          }
        }
      ).then((unsub) => {
        unlistenProgress = unsub;
      });

      listen<{ drive: string; indexed: number; done: boolean }>(
        'sysforge:mft-progress',
        (event) => {
          setMftCount(event.payload.indexed);
          if (event.payload.done) {
            setMftIndexing(false);
            setIsMftIndexed(true);
          }
        }
      ).then((unsub) => {
        unlistenMft = unsub;
      });
    });

    void checkMftStatus();
    void loadTantivyStats();

    return () => {
      unlistenProgress?.();
      unlistenMft?.();
    };
  }, [checkMftStatus, loadTantivyStats]);

  const pickRoot = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true });
        if (selected && typeof selected === 'string') {
          setRootPath(selected);
        }
      } catch {
        setRootPath('C:\\');
      }
    } else {
      setRootPath('C:\\');
    }
  };

  const copyToClipboard = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1800);
    });
  };

  const openInExplorer = async (path: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_path_in_explorer', { path });
      } catch (err) {
        console.warn('Failed to reveal in explorer:', err);
      }
    }
  };

  const openFileNative = async (path: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_file_externally', { path });
      } catch (err) {
        console.warn('Failed to open file:', err);
      }
    }
  };

  // Поиск по имени файла
  const doNameSearch = useCallback(async (q: string, ext: string, root: string) => {
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
          limit: 250,
        });
        setNameResults(res);
      } else {
        // Mock data для браузера
        const demo: FileEntry[] = [
          { name: 'SysForge_Architecture.pdf', path: `${root}\\Docs\\SysForge_Architecture.pdf`, size: 2450000, is_dir: false, extension: 'pdf' },
          { name: 'main.rs', path: `${root}\\Projects\\SysForge\\src-tauri\\src\\main.rs`, size: 12400, is_dir: false, extension: 'rs' },
          { name: 'App.tsx', path: `${root}\\Projects\\SysForge\\src\\App.tsx`, size: 8780, is_dir: false, extension: 'tsx' },
          { name: 'config.json', path: `${root}\\Users\\Config\\config.json`, size: 4096, is_dir: false, extension: 'json' },
          { name: 'system_log.txt', path: `${root}\\Logs\\system_log.txt`, size: 84000, is_dir: false, extension: 'txt' },
        ].filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
        setNameResults(demo);
      }
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Поиск по содержимому (Full-Text с Tantivy)
  const doContentSearch = useCallback(async (q: string, ext: string, root: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        if (contentSearchMode === 'tantivy' && tantivyDocCount > 0) {
          const res = await invoke<ContentMatch[]>('search_indexed_content', {
            query: q,
            limit: 120,
          });
          setContentResults(res);
        } else {
          const res = await invoke<ContentMatch[]>('search_files_by_content', {
            query: q,
            root,
            extensionFilter: ext.trim() || null,
            limit: 120,
          });
          setContentResults(res);
        }
      } else {
        // Mock data
        const demo: ContentMatch[] = [
          {
            path: `${root}\\SysForge\\src\\App.tsx`,
            filename: 'App.tsx',
            extension: 'tsx',
            size: 8780,
            line_number: 42,
            snippet: `export default function App() { const [bootComplete, setBootComplete] = useState(false);`,
          },
          {
            path: `${root}\\SysForge\\README.md`,
            filename: 'README.md',
            extension: 'md',
            size: 24412,
            line_number: 14,
            snippet: `# ⚡ SysForge — Tactical HUD Desktop OS & Jarvis AI with 31 apps`,
          },
        ].filter((m) => m.snippet.toLowerCase().includes(q.toLowerCase()));
        setContentResults(demo);
      }
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [contentSearchMode, tantivyDocCount]);

  // Запуск веб-поиска
  const doWebSearch = async () => {
    if (!query.trim()) return;
    const engine = WEB_ENGINES.find((e) => e.id === webEngine) || WEB_ENGINES[0];
    const url = engine.url(query.trim());

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('jarvis_open_url', { url });
      } catch {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (activeTab === 'web') return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        if (activeTab === 'filename') {
          void doNameSearch(val, extFilter, rootPath);
        } else if (activeTab === 'content') {
          void doContentSearch(val, extFilter, rootPath);
        }
      }, 450);
    } else {
      setNameResults([]);
      setContentResults([]);
      setSearched(false);
    }
  };

  const handleCategorySelect = (cat: typeof CATEGORIES[0]) => {
    setSelectedCategory(cat.label);
    const filter = cat.ext;
    setExtFilter(filter);
    if (query.trim().length >= 2) {
      if (activeTab === 'filename') {
        void doNameSearch(query, filter, rootPath);
      } else if (activeTab === 'content') {
        void doContentSearch(query, filter, rootPath);
      }
    }
  };

  const extColor = (ext: string) => EXT_COLORS[ext.toLowerCase()] ?? '#64748b';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'rgba(8, 12, 20, 0.96)',
        color: '#c0caf5',
        fontFamily: 'var(--font-mono, monospace)',
        overflow: 'hidden',
      }}
    >
      {/* ── 1. Header & Navigation Tabs ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(0, 0, 0, 0.4)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: 1.5 }}>
            SEARCH ENGINE
          </span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 3, padding: '1px 5px' }}>
            ПОИСКОВИК
          </span>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 6, border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => { setActiveTab('filename'); if (query) void doNameSearch(query, extFilter, rootPath); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'filename' ? 'rgba(0, 255, 136, 0.2)' : 'transparent',
              color: activeTab === 'filename' ? '#00ff88' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <FolderOpen size={12} />
            Имя и тип
          </button>
          <button
            onClick={() => { setActiveTab('content'); if (query) void doContentSearch(query, extFilter, rootPath); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'content' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
              color: activeTab === 'content' ? '#00f0ff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <FileText size={12} />
            Содержимое файлов
          </button>
          <button
            onClick={() => setActiveTab('web')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'web' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: activeTab === 'web' ? '#f59e0b' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Globe size={12} />
            Веб-поиск
          </button>
        </div>
      </div>

      {/* ── 2. Quick Target / Drive Bar (for file searches) ── */}
      {activeTab !== 'web' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginRight: 2 }}>
            <HardDrive size={11} />
            ДИСК:
          </span>
          {['C:\\', 'D:\\', 'E:\\'].map((drive) => (
            <button
              key={drive}
              onClick={() => {
                setRootPath(drive);
                if (query) {
                  if (activeTab === 'filename') void doNameSearch(query, extFilter, drive);
                  else void doContentSearch(query, extFilter, drive);
                }
              }}
              style={{
                background: rootPath.toUpperCase().startsWith(drive) ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${rootPath.toUpperCase().startsWith(drive) ? 'rgba(0,255,136,0.4)' : 'var(--border-color)'}`,
                color: rootPath.toUpperCase().startsWith(drive) ? '#00ff88' : 'var(--text-primary)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {drive}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 4px' }} />

          <button
            onClick={pickRoot}
            style={{
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: 4,
              padding: '2px 9px',
              color: '#00f0ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10.5,
              fontFamily: 'inherit',
            }}
            title="Выбрать конкретную папку для поиска"
          >
            <FolderOpen size={11} />
            {rootPath ? (rootPath.length > 25 ? `…${rootPath.slice(-22)}` : rootPath) : 'Обзор папки…'}
          </button>

          {/* MFT status & trigger for filename tab */}
          {activeTab === 'filename' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              {mftIndexing ? (
                <span style={{ fontSize: 10, color: '#00ff88', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                  Индексация MFT: {mftCount.toLocaleString()}...
                </span>
              ) : isMftIndexed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={10} color="#00ff88" />
                    MFT Индекс ({mftCount > 0 ? `${mftCount.toLocaleString()} файлов` : '<1ms'})
                  </span>
                  <button
                    onClick={startIndexVolumeMft}
                    title="Переиндексировать MFT"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startIndexVolumeMft}
                  style={{
                    background: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid rgba(0, 255, 136, 0.3)',
                    color: '#00ff88',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Сканировать Master File Table для мгновенного поиска файлов"
                >
                  <Zap size={10} />
                  ⚡ MFT Индекс ({rootPath.slice(0, 1) || 'C'}:)
                </button>
              )}
            </div>
          )}

          {/* Tantivy Full-Text controls for content tab */}
          {activeTab === 'content' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.3)', padding: 2, borderRadius: 4, border: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setContentSearchMode('tantivy')}
                  style={{
                    background: contentSearchMode === 'tantivy' ? 'rgba(0,240,255,0.2)' : 'transparent',
                    border: 'none',
                    borderRadius: 3,
                    color: contentSearchMode === 'tantivy' ? '#00f0ff' : 'var(--text-muted)',
                    fontSize: 9.5,
                    padding: '1px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Database size={10} />
                  Tantivy {tantivyDocCount > 0 && `(${tantivyDocCount})`}
                </button>
                <button
                  onClick={() => setContentSearchMode('folder')}
                  style={{
                    background: contentSearchMode === 'folder' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    border: 'none',
                    borderRadius: 3,
                    color: contentSearchMode === 'folder' ? '#ffffff' : 'var(--text-muted)',
                    fontSize: 9.5,
                    padding: '1px 6px',
                    cursor: 'pointer',
                  }}
                >
                  Прямой обход
                </button>
              </div>

              {tantivyIndexing ? (
                <span style={{ fontSize: 10, color: '#00f0ff', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                  {tantivyProgress ? `${tantivyProgress.current}/${tantivyProgress.total} (${tantivyProgress.indexed})` : 'Индексация...'}
                </span>
              ) : (
                <button
                  onClick={startIndexFolderForContent}
                  style={{
                    background: 'rgba(0, 240, 255, 0.1)',
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    color: '#00f0ff',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Проиндексировать выбранную папку в полнотекстовую базу Tantivy"
                >
                  <Zap size={10} />
                  ⚡ Индексировать в Tantivy
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 3. Main Search Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: activeTab === 'web' ? '#f59e0b' : activeTab === 'content' ? '#00f0ff' : '#00ff88',
              pointerEvents: 'none',
            }}
          />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (activeTab === 'web') doWebSearch();
                else if (activeTab === 'filename') void doNameSearch(query, extFilter, rootPath);
                else void doContentSearch(query, extFilter, rootPath);
              }
            }}
            placeholder={
              activeTab === 'web'
                ? 'Введите поисковый запрос для интернета… (Enter)'
                : activeTab === 'content'
                ? 'Текст для поиска внутри PDF, Word (.docx), Excel (.xlsx), презентаций (.pptx), кода и документов…'
                : 'Имя файла или папки для поиска…'
            }
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              padding: '7px 32px 7px 32px',
              color: '#f8fafc',
              fontSize: 12.5,
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setNameResults([]);
                setContentResults([]);
                setSearched(false);
              }}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Action Button */}
        {activeTab === 'web' ? (
          <button
            onClick={doWebSearch}
            disabled={!query.trim()}
            style={{
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 6,
              padding: '7px 16px',
              color: '#f59e0b',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Искать в Сети
          </button>
        ) : (
          <button
            onClick={() => {
              if (activeTab === 'filename') void doNameSearch(query, extFilter, rootPath);
              else void doContentSearch(query, extFilter, rootPath);
            }}
            disabled={!query.trim() || !rootPath || loading}
            style={{
              background: activeTab === 'content' ? 'rgba(0, 240, 255, 0.18)' : 'rgba(0, 255, 136, 0.18)',
              border: `1px solid ${activeTab === 'content' ? 'rgba(0, 240, 255, 0.4)' : 'rgba(0, 255, 136, 0.4)'}`,
              borderRadius: 6,
              padding: '7px 16px',
              color: activeTab === 'content' ? '#00f0ff' : '#00ff88',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {loading ? 'Поиск…' : 'Найти'}
          </button>
        )}
      </div>

      {/* ── 4. Category Filter Chips (Filename & Content) ── */}
      {activeTab !== 'web' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            background: 'rgba(0,0,0,0.15)',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <Filter size={11} style={{ color: 'var(--text-muted)' }} />
          {CATEGORIES.map((cat) => (
            <button
              key={cat.label}
              onClick={() => handleCategorySelect(cat)}
              style={{
                background: selectedCategory === cat.label ? 'rgba(0,255,136,0.15)' : 'transparent',
                border: `1px solid ${selectedCategory === cat.label ? '#00ff88' : 'transparent'}`,
                color: selectedCategory === cat.label ? '#00ff88' : 'var(--text-muted)',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 10,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* ── 5. Web Search Engines Selector (Web Tab) ── */}
      {activeTab === 'web' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ПОИСКОВИК:</span>
          {WEB_ENGINES.map((eng) => (
            <button
              key={eng.id}
              onClick={() => setWebEngine(eng.id)}
              style={{
                background: webEngine === eng.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${webEngine === eng.id ? '#f59e0b' : 'var(--border-color)'}`,
                color: webEngine === eng.id ? '#f59e0b' : 'var(--text-primary)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {eng.name}
            </button>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          style={{
            margin: '8px 16px',
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            color: '#ef4444',
            fontSize: 11.5,
          }}
        >
          {error}
        </div>
      )}

      {/* ── 6. Results Viewport ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 12px 0' }}>
        {/* Loading Indicator */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            <div style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', marginBottom: 8 }}>⚡</div>
            <div>Сканирование директории {rootPath}…</div>
          </div>
        )}

        {/* ── TAB 1: FILENAME RESULTS ── */}
        {activeTab === 'filename' && !loading && (
          <>
            {searched && nameResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)', fontSize: 12 }}>
                Ничего не найдено по запросу «<span style={{ color: 'var(--accent-primary)' }}>{query}</span>» в {rootPath}
              </div>
            )}

            {!searched && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <Search size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
                <p style={{ fontSize: 13, color: 'var(--text-primary)' }}>Быстрый поиск файлов по имени и типу</p>
                <p style={{ fontSize: 11, maxWidth: 360, margin: '6px auto 0 auto', lineHeight: 1.5 }}>
                  Введите часть имени файла или выберите категорию. Поиск работает с мгновенной фильтрацией.
                </p>
              </div>
            )}

            {nameResults.length > 0 && (
              <>
                <div style={{ padding: '6px 16px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>НАЙДЕНО ФАЙЛОВ: <strong style={{ color: '#00ff88' }}>{nameResults.length}</strong></span>
                  <span>{rootPath}</span>
                </div>
                {nameResults.map((entry) => (
                  <div
                    key={entry.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {entry.is_dir ? (
                      <Folder size={16} color="#ff9f0a" style={{ flexShrink: 0 }} />
                    ) : (
                      <File size={16} color={extColor(entry.extension)} style={{ flexShrink: 0 }} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => !entry.is_dir && openFileNative(entry.path)}
                        style={{
                          fontSize: 12.5,
                          color: '#f8fafc',
                          fontWeight: 500,
                          cursor: entry.is_dir ? 'default' : 'pointer',
                          textDecoration: entry.is_dir ? 'none' : 'underline',
                          textDecorationColor: 'rgba(255,255,255,0.2)',
                        }}
                        title={entry.is_dir ? '' : 'Нажмите, чтобы открыть файл'}
                      >
                        {entry.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.path}
                      </div>
                    </div>

                    {!entry.is_dir && entry.extension && (
                      <span
                        style={{
                          fontSize: 9,
                          color: extColor(entry.extension),
                          background: `${extColor(entry.extension)}18`,
                          borderRadius: 3,
                          padding: '2px 5px',
                          flexShrink: 0,
                          textTransform: 'uppercase',
                        }}
                      >
                        {entry.extension}
                      </span>
                    )}

                    {!entry.is_dir && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                        {formatBytes(entry.size)}
                      </span>
                    )}

                    {/* Action buttons */}
                    <button
                      onClick={() => copyToClipboard(entry.path)}
                      title="Копировать путь"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}
                    >
                      {copiedPath === entry.path ? <Check size={13} color="#00ff88" /> : <Copy size={13} />}
                    </button>

                    <button
                      onClick={() => openInExplorer(entry.path)}
                      title="Показать в проводнике Windows"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── TAB 2: CONTENT SEARCH RESULTS (Part K Full-Text) ── */}
        {activeTab === 'content' && !loading && (
          <>
            {searched && contentResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)', fontSize: 12 }}>
                Не найдено вхождений текста «<span style={{ color: '#00f0ff' }}>{query}</span>» в документах {rootPath}
              </div>
            )}

            {!searched && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <FileText size={36} style={{ opacity: 0.25, marginBottom: 12, color: '#00f0ff' }} />
                <p style={{ fontSize: 13, color: 'var(--text-primary)' }}>Полнотекстовый поиск по содержимому документов</p>
                <p style={{ fontSize: 11, maxWidth: 460, margin: '6px auto 0 auto', lineHeight: 1.6 }}>
                  Глубокий поиск текста внутри <strong>PDF</strong>, офисных документов (<strong>Word .docx</strong>, <strong>Excel .xlsx</strong>, <strong>PowerPoint .pptx</strong>, <strong>OpenDocument .odt/.ods</strong>), исходного кода (.ts, .rs, .py), логов и файлов конфигураций.
                </p>
              </div>
            )}

            {contentResults.length > 0 && (
              <>
                <div style={{ padding: '6px 16px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>СОВПАДЕНИЙ В ФАЙЛАХ: <strong style={{ color: '#00f0ff' }}>{contentResults.length}</strong></span>
                  <span>{rootPath}</span>
                </div>
                {contentResults.map((item, idx) => (
                  <div
                    key={`${item.path}-${idx}`}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 240, 255, 0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={14} color="#00f0ff" />
                        <span
                          onClick={() => openFileNative(item.path)}
                          style={{ fontSize: 12.5, fontWeight: 600, color: '#00f0ff', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {item.filename}
                        </span>
                        <span style={{ fontSize: 9.5, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: 3 }}>
                          Строка {item.line_number}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          ({formatBytes(item.size)})
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => copyToClipboard(item.path)}
                          title="Копировать путь"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3 }}
                        >
                          {copiedPath === item.path ? <Check size={12} color="#00ff88" /> : <Copy size={12} />}
                        </button>
                        <button
                          onClick={() => openInExplorer(item.path)}
                          title="В проводнике"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 3 }}
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.path}
                    </div>

                    {/* Code / Text Snippet with query highlight */}
                    <div
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(0, 240, 255, 0.15)',
                        borderRadius: 4,
                        padding: '6px 10px',
                        fontSize: 11,
                        color: '#94a3b8',
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 1.4,
                        overflowX: 'auto',
                      }}
                    >
                      <code
                        dangerouslySetInnerHTML={{
                          __html: item.snippet.includes('<mark>')
                            ? item.snippet.replace(/<mark>/g, '<span style="color:#00f0ff;font-weight:700;background:rgba(0,240,255,0.18);padding:1px 4px;border-radius:3px">').replace(/<\/mark>/g, '</span>')
                            : item.snippet,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* ── TAB 3: WEB SEARCH (Google, Yandex, DDG, GitHub) ── */}
        {activeTab === 'web' && (
          <div style={{ padding: '24px 16px', maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
            <Globe size={40} style={{ color: '#f59e0b', opacity: 0.8, marginBottom: 12 }} />
            <h3 style={{ fontSize: 14, color: '#f8fafc', fontWeight: 600, marginBottom: 6 }}>
              Глобальный веб-поисковик
            </h3>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
              Мгновенный запуск поисковых запросов в интернете, документации GitHub и технических базах StackOverflow.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'left' }}>
              {WEB_ENGINES.map((eng) => (
                <div
                  key={eng.id}
                  onClick={() => {
                    setWebEngine(eng.id);
                    if (query.trim()) {
                      const url = eng.url(query.trim());
                      if (isTauri) {
                        import('@tauri-apps/api/core').then(({ invoke }) => {
                          invoke('jarvis_open_url', { url });
                        });
                      } else {
                        window.open(url, '_blank');
                      }
                    }
                  }}
                  style={{
                    background: webEngine === eng.id ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${webEngine === eng.id ? '#f59e0b' : 'var(--border-color)'}`,
                    borderRadius: 6,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: webEngine === eng.id ? '#f59e0b' : '#f8fafc' }}>
                    {eng.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {query.trim() ? `Найти «${query.slice(0, 18)}…»` : 'Открыть поиск'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

