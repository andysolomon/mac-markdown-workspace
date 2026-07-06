import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/mac-markdown-workspace/",
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
