import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:5174",
        ws: true,
      },
      "/api": {
        target: "http://127.0.0.1:5174",
      },
    },
  },
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
  },
});
