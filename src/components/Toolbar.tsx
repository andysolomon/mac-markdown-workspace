import React, { useState, useRef, useEffect } from "react";
import { useDocumentStore, selectIsDirty, type ViewMode } from "../services/documentStore";
import { useThemeStore, type ThemeChoice } from "../services/themeStore";
import { useFileOperations } from "../hooks/useFileOperations";

const themeLabels: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const themes: ThemeChoice[] = ["light", "dark", "system"];

export const Toolbar = React.memo(function Toolbar() {
  const filePath = useDocumentStore((s) => s.filePath);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const isDirty = useDocumentStore(selectIsDirty);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { openFile, saveFile } = useFileOperations();
  const content = useDocumentStore((s) => s.content);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const modes: ViewMode[] = ["source", "split", "wysiwyg"];

  const cycleTheme = () => {
    const idx = themes.indexOf(theme);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next);
    window.appApi.setSetting?.("theme", next);
  };

  const handleExport = async (format: "txt" | "pdf" | "docx") => {
    setExportOpen(false);
    if (format === "txt") {
      await window.appApi.exportTxt?.({ content });
    } else {
      // Generate HTML for PDF/DOCX
      const html = await generateHtml(content);
      if (format === "pdf") {
        await window.appApi.exportPdf?.({ html });
      } else {
        await window.appApi.exportDocx?.({ html });
      }
    }
  };

  return (
    <header className="toolbar">
      <div className="left-group">
        <button onClick={openFile}>Open</button>
        <button onClick={saveFile}>Save</button>
        <div className="export-dropdown" ref={exportRef}>
          <button onClick={() => setExportOpen(!exportOpen)}>Export</button>
          {exportOpen && (
            <div className="export-menu">
              <button onClick={() => handleExport("txt")}>Text (.txt)</button>
              <button onClick={() => handleExport("pdf")}>PDF (.pdf)</button>
              <button onClick={() => handleExport("docx")}>Word (.docx)</button>
            </div>
          )}
        </div>
      </div>
      <div className="center-group">
        {modes.map((m) => (
          <button
            key={m}
            className={viewMode === m ? "active" : ""}
            onClick={() => setViewMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="right-group">
        <button onClick={cycleTheme}>{themeLabels[theme]}</button>
        <span>
          {filePath ? filePath.split("/").pop() : "Unsaved document"}
          {isDirty ? " *" : ""}
        </span>
      </div>
    </header>
  );
});

async function generateHtml(markdown: string): Promise<string> {
  // Dynamically import to avoid bundling in main chunk
  const { markdownToHtml } = await import("../services/markdownToHtml");
  return markdownToHtml(markdown);
}
