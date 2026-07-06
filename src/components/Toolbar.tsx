import React, { useState, useRef, useEffect } from "react";
import { useDocumentStore, selectIsDirty, type ViewMode } from "../services/documentStore";
import { useNotesStore } from "../services/notesStore";
import { useFileOperations } from "../hooks/useFileOperations";
import {
  exportDocument,
  prepareExport,
  type PreparedExport,
} from "../services/exportActions";

export const Toolbar = React.memo(function Toolbar() {
  const filePath = useDocumentStore((s) => s.filePath);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const isDirty = useDocumentStore(selectIsDirty);
  const { openFile, saveFile } = useFileOperations();
  const content = useDocumentStore((s) => s.content);

  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // Rendered when the menu opens so a format tap can deliver synchronously
  // within its own gesture (iOS Safari, issue #12).
  const prepRef = useRef<PreparedExport | undefined>(undefined);

  const openExportMenu = (open: boolean) => {
    if (open) prepRef.current = prepareExport(content);
    setExportOpen(open);
  };

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

  const desktopModes: ViewMode[] = ["source", "split", "preview", "wysiwyg"];

  const handleExport = (format: "txt" | "pdf" | "docx" | "html") => {
    setExportOpen(false);
    // Called synchronously from the click so iOS Safari's transient
    // activation is still live inside exportDocument (issue #12); the
    // payload was pre-rendered when the menu opened.
    void exportDocument(format, content, prepRef.current);
  };

  // Library-world: show the active note's derived title (filePath only
  // survives legacy flows and is otherwise cleared on selection).
  const noteTitle = useNotesStore(
    (s) => s.notes.find((n) => n.id === s.activeNoteId)?.title ?? "",
  );
  const fileName = noteTitle || (filePath ? filePath.split("/").pop() : "Untitled");

  return (
    <header className="toolbar">
      {/* Desktop layout */}
      <div className="left-group desktop-only">
        <button onClick={openFile}>Import</button>
        <button onClick={saveFile}>Save</button>
        <div className="export-dropdown" ref={exportRef}>
          <button onClick={() => openExportMenu(!exportOpen)}>Export</button>
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

      {/* Mobile has no toolbar — Bear-style page navigation owns the chrome
          (issue #16 / W-000016); the whole bar is display:none under 640px. */}
    </header>
  );
});
