import React, { useState, useRef, useEffect } from "react";
import { useDocumentStore, selectIsDirty, type ViewMode } from "../services/documentStore";
import { useFileOperations } from "../hooks/useFileOperations";

export const Toolbar = React.memo(function Toolbar() {
  const filePath = useDocumentStore((s) => s.filePath);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const isDirty = useDocumentStore(selectIsDirty);
  const { openFile, saveFile } = useFileOperations();
  const content = useDocumentStore((s) => s.content);

  const [exportOpen, setExportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close hamburger menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const desktopModes: ViewMode[] = ["source", "split", "preview", "wysiwyg"];
  const mobileModes: ViewMode[] = ["source", "preview", "wysiwyg"];

  const handleExport = async (format: "txt" | "pdf" | "docx" | "html") => {
    setExportOpen(false);
    setMenuOpen(false);
    const { exportDocument } = await import("../services/exportActions");
    await exportDocument(format, content);
  };

  const fileName = filePath ? filePath.split("/").pop() : "Unsaved document";

  return (
    <header className="toolbar">
      {/* Desktop layout */}
      <div className="left-group desktop-only">
        <button onClick={openFile}>Open</button>
        <button onClick={saveFile}>Save</button>
        <div className="export-dropdown" ref={exportRef}>
          <button onClick={() => setExportOpen(!exportOpen)}>Export</button>
          {exportOpen && (
            <div className="export-menu">
              <button onClick={() => handleExport("html")}>Web Page (.html)</button>
              <button onClick={() => handleExport("pdf")}>PDF (.pdf)</button>
              <button onClick={() => handleExport("txt")}>Text (.txt)</button>
              <button onClick={() => handleExport("docx")}>Word (.docx)</button>
            </div>
          )}
        </div>
      </div>
      <div className="center-group desktop-only">
        {desktopModes.map((m) => (
          <button
            key={m}
            className={viewMode === m ? "active" : ""}
            onClick={() => setViewMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="right-group desktop-only">
        <span>
          {fileName}
          {isDirty ? " *" : ""}
        </span>
      </div>

      {/* Mobile layout */}
      <div className="mobile-only mobile-toolbar">
        <div className="hamburger-wrapper" ref={menuRef}>
          <button className="hamburger-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            &#9776;
          </button>
          {menuOpen && (
            <div className="hamburger-menu">
              <button onClick={() => { openFile(); setMenuOpen(false); }}>Open</button>
              <button onClick={() => { saveFile(); setMenuOpen(false); }}>Save</button>
              <button onClick={() => handleExport("html")}>Export HTML</button>
              <button onClick={() => handleExport("pdf")}>Export PDF</button>
              <button onClick={() => handleExport("txt")}>Export Text</button>
              <button onClick={() => handleExport("docx")}>Export Word</button>
              <hr />
              {mobileModes.map((m) => (
                <button
                  key={m}
                  className={viewMode === m ? "active" : ""}
                  onClick={() => { setViewMode(m); setMenuOpen(false); }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="mobile-filename">
          {fileName}
          {isDirty ? " *" : ""}
        </span>
      </div>
    </header>
  );
});
