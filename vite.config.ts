import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,

  optimizeDeps: {
    // Keep Tauri packages out of Vite's pre-bundler — they're provided by the runtime.
    exclude: ["@tauri-apps/plugin-store", "@tauri-apps/api"],
  },

  build: {
    rollupOptions: {
      // When building as a plain web app (no Tauri), mark Tauri-only packages external
      // so Rollup doesn't try to bundle them. In real Tauri builds the bundler
      // doesn't use this path at all.
      external: ["@tauri-apps/plugin-store"],
    },
  },

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));