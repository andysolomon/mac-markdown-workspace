import React, { useEffect, useCallback } from "react";
import { NotesShell } from "./shell/NotesShell";
import {
  useThemeStore,
  FONT_OPTIONS,
  MIN_EDITOR_SIZE,
  MAX_EDITOR_SIZE,
} from "../services/themeStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useNotesStore } from "../services/notesStore";
import { useSettingsStore } from "../services/settingsStore";

const MD_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"];

function isMarkdownFile(name: string): boolean {
  return MD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

export function App() {
  const palette = useThemeStore((s) => s.palette);
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const font = useThemeStore((s) => s.font);
  const size = useThemeStore((s) => s.size);
  const setPalette = useThemeStore((s) => s.setPalette);
  const setMode = useThemeStore((s) => s.setMode);
  const setFont = useThemeStore((s) => s.setFont);
  const setSize = useThemeStore((s) => s.setSize);

  // Apply palette + mode to the document root. The --md-* markdown roles
  // resolve against :root's --mm-*, so the theme must live on <html>.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", palette);
    document.documentElement.setAttribute("data-mode", resolvedMode);
  }, [palette, resolvedMode]);

  // Apply the reader's editor face + size (the Aa popover writes these).
  useEffect(() => {
    const option = FONT_OPTIONS.find((f) => f.key === font) ?? FONT_OPTIONS[0];
    document.documentElement.style.setProperty("--mm-font-editor", `var(${option.cssVar})`);
    document.documentElement.style.setProperty("--mm-editor-size", `${size}px`);
  }, [font, size]);

  // Load saved appearance from settings
  useEffect(() => {
    window.appApi?.getSetting?.("palette").then((saved) => {
      if (saved === "teal" || saved === "forest" || saved === "gold" || saved === "crimson") {
        setPalette(saved);
      }
    });
    window.appApi?.getSetting?.("mode").then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setMode(saved);
      }
    });
    window.appApi?.getSetting?.("font").then((saved) => {
      if (typeof saved === "string" && FONT_OPTIONS.some((f) => f.key === saved)) {
        setFont(saved as (typeof FONT_OPTIONS)[number]["key"]);
      }
    });
    window.appApi?.getSetting?.("size").then((saved) => {
      const n = Number(saved);
      if (Number.isFinite(n) && n >= MIN_EDITOR_SIZE && n <= MAX_EDITOR_SIZE) {
        setSize(n);
      }
    });
    window.appApi?.getSetting?.("showToolbar").then((saved) => {
      if (typeof saved === "boolean") {
        useSettingsStore.getState().setShowToolbar(saved);
      }
    });
    window.appApi?.getSetting?.("iosStorage").then((saved) => {
      if (saved === "icloud" || saved === "device") {
        useSettingsStore.getState().setIosStorage(saved);
      }
    });
  }, [setPalette, setMode, setFont, setSize]);

  // Listen for menu actions from main process
  useEffect(() => {
    const cleanup = window.appApi?.onMenuAction?.((action: string) => {
      window.dispatchEvent(new CustomEvent("menu-action", { detail: action }));
    });
    return cleanup;
  }, []);

  useKeyboardShortcuts();

  // Drag-and-drop .md files to open
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!isMarkdownFile(file.name)) return;

    const filePath = (file as File & { path?: string }).path;

    // Dropped files are imported into the notes library as new notes (the
    // library is the source of truth; writing into the buffer would autosave
    // over the active note).
    let content: string | null = null;
    if (filePath) {
      // Electron: read via IPC using the native file path
      const result = await window.appApi?.readFile({ filePath });
      content = result?.content ?? null;
    } else {
      // Browser: read via File API
      content = await file.text();
    }
    if (content === null) return;
    await useNotesStore.getState().createNote(content);
  }, []);

  return (
    <div
      className="app-shell mm-shell"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <NotesShell />
    </div>
  );
}
