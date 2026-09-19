// src/apps/developer/RealTerminal.tsx
// Полноценный PTY-терминал (PowerShell) через xterm.js — Part L

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export default function RealTerminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef<string>(crypto.randomUUID());
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#020509',
        foreground: '#00ff9c',
        cursor: '#00ff9c',
        cursorAccent: '#020509',
        black: '#000000',
        green: '#00ff9c',
        cyan: '#00d4ff',
        white: '#c0caf5',
        brightGreen: '#73daca',
        brightCyan: '#7dcfff',
      },
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 2000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    let unlisten: (() => void) | null = null;

    async function init() {
      if (!isTauri) {
        term.writeln('\x1b[32mTerminal (PTY mode) is only available in the desktop app.\x1b[0m');
        term.writeln('\x1b[90mBuild and run with Tauri to use real PowerShell sessions.\x1b[0m');
        return;
      }
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        await invoke('create_terminal_session', { sessionId: sessionId.current });
        const unlistenFn = await listen<string>(
          `terminal:output:${sessionId.current}`,
          (event) => term.write(event.payload)
        );
        unlisten = unlistenFn;
        term.onData((data) =>
          invoke('write_to_terminal', { sessionId: sessionId.current, data }).catch(() => {})
        );
      } catch (e) {
        term.writeln(`\x1b[31mError starting terminal: ${e}\x1b[0m`);
      }
    }

    void init();

    const handleResize = () => {
      fit.fit();
      if (isTauri) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('resize_terminal', {
            sessionId: sessionId.current,
            rows: term.rows,
            cols: term.cols,
          }).catch(() => {});
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      unlisten?.();
      if (isTauri && sessionId.current) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('close_terminal_session', { sessionId: sessionId.current }).catch(() => {});
        });
      }
      term.dispose();
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#020509' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(0,255,156,0.06)', borderBottom: '1px solid rgba(0,255,156,0.15)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'rgba(0,255,156,0.5)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}>
          ■ PTY Terminal — PowerShell
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['#ff5f57','#febc2e','#28c840'].map((c, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, padding: '8px 4px 4px', overflow: 'hidden' }} />
    </div>
  );
}
