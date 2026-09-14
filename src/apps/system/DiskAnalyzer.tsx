// src/apps/system/DiskAnalyzer.tsx
// Анализатор дискового пространства — squarified treemap — Part N

import { useState, useCallback, useRef } from 'react';
import { HardDrive, FolderOpen, ChevronLeft, RefreshCw, AlertTriangle } from 'lucide-react';

interface DirNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children_scanned: boolean;
}

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const PALETTE = [
  '#00ff9c', '#00d4ff', '#7c6aff', '#ff9f0a', '#ff6b6b',
  '#73daca', '#7dcfff', '#bb9af7', '#e0af68', '#f7768e',
];

interface TreemapRect {
  node: DirNode;
  x: number; y: number; w: number; h: number;
  colorIdx: number;
}

function squarify(nodes: DirNode[], x: number, y: number, w: number, h: number): TreemapRect[] {
  if (nodes.length === 0 || w <= 0 || h <= 0) return [];
  const total = nodes.reduce((s, n) => s + n.size, 0);
  if (total === 0) return [];

  const result: TreemapRect[] = [];
  let remaining = [...nodes].sort((a, b) => b.size - a.size);
  let rx = x, ry = y, rw = w, rh = h;

  while (remaining.length > 0) {
    const row: DirNode[] = [];
    let rowSum = 0;
    const shorter = Math.min(rw, rh);
    let worst = Infinity;

    for (const node of remaining) {
      row.push(node);
      rowSum += node.size;
      const newWorst = row.reduce((acc) => {
        const ratio = shorter ** 2 * rowSum / (rowSum ** 2);
        return Math.max(acc, Math.max(ratio, 1 / ratio));
      }, 0);

      if (newWorst > worst && row.length > 1) {
        row.pop();
        rowSum -= node.size;
        break;
      }
      worst = newWorst;
    }

    // Place row
    const rowArea = (rowSum / total) * rw * rh;
    if (rw >= rh) {
      const colW = rowArea / rh;
      let cy = ry;
      row.forEach((node) => {
        const h2 = (node.size / rowSum) * rh;
        result.push({ node, x: rx, y: cy, w: colW, h: h2, colorIdx: result.length % PALETTE.length });
        cy += h2;
      });
      rx += colW;
      rw -= colW;
    } else {
      const rowH = rowArea / rw;
      let cx = rx;
      row.forEach((node) => {
        const w2 = (node.size / rowSum) * rw;
        result.push({ node, x: cx, y: ry, w: w2, h: rowH, colorIdx: result.length % PALETTE.length });
        cx += w2;
      });
      ry += rowH;
      rh -= rowH;
    }

    remaining = remaining.filter((n) => !row.includes(n));
  }

  return result;
}

export default function DiskAnalyzer() {
  const [nodes, setNodes] = useState<DirNode[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<DirNode | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const scan = useCallback(async (scanPath: string) => {
    setLoading(true);
    setError(null);
    try {
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<DirNode[]>('scan_directory_sizes', { path: scanPath });
        setNodes(result);
      } else {
        // Demo data
        setNodes([
          { name: 'Windows', path: 'C:\\Windows', size: 25 * 1024 ** 3, is_dir: true, children_scanned: false },
          { name: 'Users', path: 'C:\\Users', size: 18 * 1024 ** 3, is_dir: true, children_scanned: false },
          { name: 'Program Files', path: 'C:\\Program Files', size: 12 * 1024 ** 3, is_dir: true, children_scanned: false },
          { name: 'Games', path: 'C:\\Games', size: 80 * 1024 ** 3, is_dir: true, children_scanned: false },
          { name: 'pagefile.sys', path: 'C:\\pagefile.sys', size: 8 * 1024 ** 3, is_dir: false, children_scanned: false },
        ]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const pickFolder = async () => {
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true });
        if (selected && typeof selected === 'string') {
          setBreadcrumb([{ name: selected.split(/[/\\]/).pop() || selected, path: selected }]);
          await scan(selected);
        }
      } catch {
        await scan('C:\\');
        setBreadcrumb([{ name: 'C:\\', path: 'C:\\' }]);
      }
    } else {
      setBreadcrumb([{ name: 'C:\\', path: 'C:\\' }]);
      await scan('C:\\');
    }
  };

  const drillDown = async (node: DirNode) => {
    if (!node.is_dir) return;
    setBreadcrumb((prev) => [...prev, { name: node.name, path: node.path }]);
    await scan(node.path);
  };

  const goBack = async (idx: number) => {
    const crumb = breadcrumb[idx];
    setBreadcrumb((prev) => prev.slice(0, idx + 1));
    await scan(crumb.path);
  };

  const W = 600, H = 340;
  const rects = squarify(nodes, 0, 0, W, H);
  const total = nodes.reduce((s, n) => s + n.size, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0e12', color: '#c0caf5', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid rgba(0,255,156,0.12)' }}>
        <HardDrive size={18} color="#00ff9c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#00ff9c', letterSpacing: 1 }}>DISK ANALYZER</span>
        <button
          onClick={pickFolder}
          disabled={loading}
          style={{ marginLeft: 'auto', background: 'rgba(0,255,156,0.1)', border: '1px solid rgba(0,255,156,0.3)', borderRadius: 6, padding: '5px 12px', color: '#00ff9c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <FolderOpen size={13} />
          Выбрать папку
        </button>
      </div>

      {error && (
        <div style={{ margin: '8px 16px', padding: '8px 12px', background: 'rgba(255,63,63,0.1)', border: '1px solid rgba(255,63,63,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12, display: 'flex', gap: 8 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 18px', fontSize: 12, color: '#4a5568', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
          {breadcrumb.length > 1 && (
            <button onClick={() => goBack(breadcrumb.length - 2)} style={{ background: 'none', border: 'none', color: '#00ff9c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 4 }}>
              <ChevronLeft size={12} /> Назад
            </button>
          )}
          {breadcrumb.map((crumb, idx) => (
            <span key={idx}>
              {idx > 0 && <span style={{ margin: '0 4px' }}>›</span>}
              <button
                onClick={() => idx < breadcrumb.length - 1 ? goBack(idx) : undefined}
                style={{ background: 'none', border: 'none', cursor: idx < breadcrumb.length - 1 ? 'pointer' : 'default', color: idx === breadcrumb.length - 1 ? '#c0caf5' : '#00ff9c', fontSize: 12, fontFamily: 'inherit', padding: '2px 4px' }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Treemap */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: nodes.length === 0 ? 'center' : 'flex-start', padding: '12px 16px', gap: 10, overflowY: 'auto' }}>
        {nodes.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#4a5568' }}>
            <HardDrive size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 14 }}>Выберите папку для анализа</p>
            <button onClick={pickFolder} style={{ marginTop: 8, background: 'rgba(0,255,156,0.1)', border: '1px solid rgba(0,255,156,0.3)', borderRadius: 8, padding: '8px 20px', color: '#00ff9c', cursor: 'pointer', fontSize: 13 }}>
              Открыть
            </button>
          </div>
        )}
        {loading && <div style={{ color: '#4a5568', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={14} className="spin" /> Сканирование…</div>}
        {nodes.length > 0 && !loading && (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', maxHeight: 340, borderRadius: 10, border: '1px solid rgba(0,255,156,0.1)', cursor: 'pointer' }}
            >
              {rects.map((r, i) => {
                const minDim = Math.min(r.w, r.h);
                const showLabel = minDim > 30;
                const color = PALETTE[r.colorIdx];
                return (
                  <g key={i} onClick={() => drillDown(r.node)} style={{ cursor: r.node.is_dir ? 'pointer' : 'default' }}>
                    <rect
                      x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)}
                      fill={`${color}22`}
                      stroke={hovered?.path === r.node.path ? color : `${color}55`}
                      strokeWidth={hovered?.path === r.node.path ? 2 : 1}
                      rx={4}
                      onMouseEnter={() => setHovered(r.node)}
                      onMouseLeave={() => setHovered(null)}
                      style={{ transition: 'all 0.15s' }}
                    />
                    {showLabel && (
                      <>
                        <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 5} textAnchor="middle" fill={color} fontSize={Math.min(12, minDim * 0.18)} fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                          {r.node.name.length > 16 ? r.node.name.slice(0, 14) + '…' : r.node.name}
                        </text>
                        <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 10} textAnchor="middle" fill={`${color}99`} fontSize={Math.min(10, minDim * 0.14)} fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                          {formatBytes(r.node.size)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Hover info */}
            <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#4a5568', padding: '0 4px', width: '100%' }}>
              {hovered ? (
                <>
                  <span style={{ color: '#c0caf5', fontWeight: 600 }}>{hovered.name}</span>
                  <span style={{ color: '#00ff9c' }}>{formatBytes(hovered.size)}</span>
                  <span>({((hovered.size / total) * 100).toFixed(1)}%)</span>
                  {hovered.is_dir && <span style={{ color: '#7c6aff' }}>Нажмите чтобы раскрыть →</span>}
                </>
              ) : (
                <span>Наведите на ячейку для подробностей</span>
              )}
            </div>

            {/* Top list */}
            <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              {nodes.slice(0, 8).map((n, i) => (
                <div
                  key={n.path}
                  onClick={() => drillDown(n)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px', cursor: n.is_dir ? 'pointer' : 'default', borderRadius: 4 }}
                >
                  <div style={{ width: 120, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', flexShrink: 0, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(n.size / total) * 100}%`, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#c0caf5', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                  <span style={{ fontSize: 12, color: PALETTE[i % PALETTE.length], flexShrink: 0 }}>{formatBytes(n.size)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
