import React, { useEffect, useCallback } from "react";
import { Toolbar } from "./Toolbar";
import { Workspace } from "./Workspace";
import { StatusBar } from "./StatusBar";
import { useThemeStore } from "../services/themeStore";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useDocumentStore } from "../services/documentStore";

const MD_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"];

function isMarkdownFile(name: string): boolean {
  return MD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

export function App() {
  const palette = useThemeStore((s) => s.palette);
  const resolvedMode = useThemeStore((s) => s.resolvedMode);
  const setPalette = useThemeStore((s) => s.setPalette);
  const setMode = useThemeStore((s) => s.setMode);

  // Apply palette + mode to the document root. The --md-* markdown roles
  // resolve against :root's --mm-*, so the theme must live on <html>.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", palette);
    document.documentElement.setAttribute("data-mode", resolvedMode);
  }, [palette, resolvedMode]);

  // Load saved palette + mode from settings
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
  }, [setPalette, setMode]);

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

    if (filePath) {
      // Electron: read via IPC using the native file path
      const result = await window.appApi?.readFile({ filePath });
      if (!result) return;
      useDocumentStore.setState({
        content: result.content,
        savedContent: result.content,
        filePath: result.filePath,
      });
    } else {
      // Browser: read via File API
      const content = await file.text();
      useDocumentStore.setState({
        content,
        savedContent: content,
        filePath: file.name,
      });
    }
  }, []);

  return (
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toolbar />
      <Workspace />
      <StatusBar />
    </div>
  );
}
