import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  // Default `/` matches Vercel (vercel.json sets VITE_BASE=/). A non-root
  // base breaks dev: Vite rewrites web/index.html's `../src/web/entry.tsx`
  // to `/src/web/entry.tsx` without the base prefix → blank page 404.
  base: process.env.VITE_BASE ?? "/",
  define: {
    // Surfaced in the Settings panel so stale SPA tabs are diagnosable.
    __BUILD_ID__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
    ),
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      path: "path-browserify",
    },
    // CodeMirror ships nested copies under lang-* packages; duplicate
    // @codemirror/language instances silently break syntaxHighlighting.
    dedupe: [
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
  server: {
    port: 3000,
  },
});
