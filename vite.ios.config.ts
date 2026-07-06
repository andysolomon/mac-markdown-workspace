import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "ios",
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7)),
  },
  base: "./",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      path: "path-browserify",
    },
    // Keep CodeMirror single-instance (see vite.web.config.ts).
    dedupe: [
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
});
