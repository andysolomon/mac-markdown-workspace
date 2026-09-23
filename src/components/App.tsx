import React, { useEffect, useCallback } from "react";
import { NotesShell } from "./shell/NotesShell";
import {
  useThemeStore,
  FONT_OPTIONS,
  PALETTES,
  MIN_EDITOR_SIZE,
  MAX_EDITOR_SIZE,
} from "../services/themeStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useNotesStore } from "../services/notesStore";
import { useSettingsStore, isIosStorage } from "../services/settingsStore";
import { startAmbientSync } from "../services/ambientSync";

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
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--mm-bg").trim();
    if (!bg) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", bg);
  }, [palette, resolvedMode]);

  // Native iOS: the system keyboard follows the app's light/dark mode
  // (issue #18 / W-000018). No-op on web/Electron.
  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.() !== true) return;
    void import("@capacitor/keyboard").then(({ Keyboard, KeyboardStyle }) =>
      Keyboard.setStyle({ style: resolvedMode === "dark" ? KeyboardStyle.Dark : KeyboardStyle.Light }),
    ).catch(() => undefined);
  }, [resolvedMode]);

  // Apply the reader's editor face + size (the Aa popover writes these).
  useEffect(() => {
    const option = FONT_OPTIONS.find((f) => f.key === font) ?? FONT_OPTIONS[0];
    document.documentElement.style.setProperty("--mm-font-editor", `var(${option.cssVar})`);
    document.documentElement.style.setProperty("--mm-editor-size", `${size}px`);
  }, [font, size]);

  // Load saved appearance from settings
  useEffect(() => {
    window.appApi?.getSetting?.("palette").then((saved) => {
      if (typeof saved === "string" && (PALETTES as string[]).includes(saved)) {
        setPalette(saved as (typeof PALETTES)[number]);
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
    // iOS storage location (issue #8): the shim resolves this only after its
    // storage controller has normalized legacy values and finished any
    // interrupted migration, so the hydrated value is always canonical and
    // always matches the root that listNotes is serving from.
    window.appApi?.getSetting?.("iosStorage").then((saved) => {
      if (isIosStorage(saved)) {
        useSettingsStore.getState().setIosStorage(saved);
      }
    });
    window.appApi?.getSetting?.("vimMode").then((saved) => {
      if (typeof saved === "boolean") {
        useSettingsStore.getState().setVimMode(saved);
      }
    });
    // Cloud sync (issue #21) — restore the non-secret sync config. The
    // passphrase is never persisted; the DERIVED keys may be (opt-in, see
    // vaultKeyStore), and the ambient loop below picks them up once the
    // vault id is known.
    void Promise.all([
      window.appApi?.getSetting?.("syncEnabled"),
      window.appApi?.getSetting?.("syncVaultId"),
      window.appApi?.getSetting?.("lastSyncedAt"),
    ]).then(([enabled, vaultId, lastSynced]) => {
      const s = useSettingsStore.getState();
      if (typeof enabled === "boolean") s.setSyncEnabled(enabled);
      if (typeof vaultId === "string") s.setSyncVaultId(vaultId);
      if (typeof lastSynced === "number") s.setLastSyncedAt(lastSynced);
    });
  }, [setPalette, setMode, setFont, setSize]);

  // Ambient sync (docs/ambient-vault-sync.md): once the sync settings above
  // hydrate, the loop binds to the vault's resident keys and converges in
  // the background — push after edits settle, conditional pull on focus and
  // on an interval. It replaces the old on-return nudge, which could only
  // open a passphrase prompt. A device without resident keys shows "locked"
  // in the chrome instead of being nagged.
  useEffect(() => startAmbientSync(), []);

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
