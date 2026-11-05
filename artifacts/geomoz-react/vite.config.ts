import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { cpSync, createReadStream, statSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

// Serve the pinned SDK from our own origin, including worker and widget assets.
function cesiumAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const sdk = path.join(path.dirname(require.resolve("cesium/package.json")), "Build/Cesium");
  const prefix = "/cesium/1.127.0/";
  const mime: Record<string, string> = { ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png",
    ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
  return {
    name: "geomoz-cesium-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(prefix)) return next();
        let file: string;
        try { file = path.resolve(sdk, decodeURIComponent(url.slice(prefix.length))); }
        catch { res.statusCode = 400; res.end(); return; }
        if (!file.startsWith(sdk + path.sep)) { res.statusCode = 403; res.end(); return; }
        try { if (!statSync(file).isFile()) return next(); } catch { return next(); }
        res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
        createReadStream(file).on("error", next).pipe(res);
      });
    },
    closeBundle() {
      cpSync(sdk, path.resolve(import.meta.dirname, "dist/public/cesium/1.127.0"), { recursive: true });
    },
  };
}
// runtime error overlay removed to avoid runtime-insertBefore overlay crashes during local dev

const rawPort = process.env.PORT;

if (!rawPort) {
  console.warn("PORT env var missing, defaulting to 3000");
}

const port = Number(rawPort) || 3000;

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    cesiumAssets(),
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  optimizeDeps: { exclude: ["geolibre-wasm", "geolibre-wasm/tools"] },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  worker: {
    format: "es",
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/geomoz-api": {
        target: "http://127.0.0.1:5003",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
