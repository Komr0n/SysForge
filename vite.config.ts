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
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      external: ["@tauri-apps/plugin-store"],
      output: {
        manualChunks: {
          three: ["three"],
          icons: ["lucide-react"],
          vendor: ["react", "react-dom", "zustand"],
        },
      },
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