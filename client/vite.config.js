import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readGlyphBuild,
  readGlyphVersion,
} from "../shared/meta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glyphVersion = readGlyphVersion();
const glyphBuild = readGlyphBuild();

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  define: {
    // package.json version + git commit count (baked at build / dev start)
    __GLYPH_VERSION__: JSON.stringify(glyphVersion),
    __GLYPH_BUILD__: JSON.stringify(glyphBuild),
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    fs: { allow: [path.join(__dirname, "..")] },
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          ) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
