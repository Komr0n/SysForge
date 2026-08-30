import { create } from 'zustand';
import { sfx } from '../lib/sfx';

export interface WindowState {
  id: string;
  title: string;
  icon: string;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: { x: number; y: number };
  size: { w: number; h: number };
  defaultSize: { w: number; h: number };
  defaultPosition: { x: number; y: number };
  component: string;
}

interface WindowStore {
  windows: Map<string, WindowState>;
  nextZIndex: number;
  openWindow: (id: string, title: string, icon: string, component: string, defaultSize?: { w: number; h: number }, defaultPosition?: { x: number; y: number }) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, size: { w: number; h: number }) => void;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: new Map(),
  nextZIndex: 1,

  openWindow: (id, title, icon, component, defaultSize = { w: 800, h: 500 }, defaultPosition = { x: 100 + (get().windows.size * 30), y: 100 + (get().windows.size * 30) }) => {
    sfx.playOpen();
    const { nextZIndex } = get();
    const newWindow: WindowState = {
      id,
      title,
      icon,
      isMinimized: false,
      isMaximized: false,
      zIndex: nextZIndex,
      position: defaultPosition,
      size: defaultSize,
      defaultSize,
      defaultPosition,
      component,
    };
    const newWindows = new Map(get().windows);
    newWindows.set(id, newWindow);
    set({ windows: newWindows, nextZIndex: nextZIndex + 1 });
  },

  closeWindow: (id) => {
    sfx.playClose();
    const newWindows = new Map(get().windows);
    newWindows.delete(id);
    set({ windows: newWindows });
  },

  minimizeWindow: (id) => {
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      newWindows.set(id, { ...win, isMinimized: true });
      set({ windows: newWindows });
    }
  },

  maximizeWindow: (id) => {
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      const headerH = 44;
      const taskbarH = 40;
      // Measure the actual workspace container so the maximized window
      // accounts for the sidebar/side rail instead of the whole viewport.
      const workspace = document.querySelector('[data-workspace]');
      const w = workspace ? workspace.clientWidth : window.innerWidth;
      const h = workspace ? workspace.clientHeight : window.innerHeight - headerH - taskbarH;
      newWindows.set(id, {
        ...win,
        isMaximized: true,
        position: { x: 0, y: 0 },
        size: { w, h },
      });
      set({ windows: newWindows });
    }
  },

  restoreWindow: (id) => {
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      newWindows.set(id, { ...win, isMaximized: false, isMinimized: false, position: win.defaultPosition, size: win.defaultSize });
      set({ windows: newWindows });
    }
  },

  bringToFront: (id) => {
    const { nextZIndex } = get();
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      newWindows.set(id, { ...win, zIndex: nextZIndex, isMinimized: false });
      set({ windows: newWindows, nextZIndex: nextZIndex + 1 });
    }
  },

  updatePosition: (id, position) => {
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      newWindows.set(id, { ...win, position });
      set({ windows: newWindows });
    }
  },

  updateSize: (id, size) => {
    const newWindows = new Map(get().windows);
    const win = newWindows.get(id);
    if (win) {
      newWindows.set(id, { ...win, size });
      set({ windows: newWindows });
    }
  },
}));