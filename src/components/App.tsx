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
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  // Load saved theme from settings
  useEffect(() => {
    window.appApi?.getSetting?.("theme").then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setTheme(saved);
      }
    });
  }, [setTheme]);

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
