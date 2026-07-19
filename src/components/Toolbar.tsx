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

  const desktopModes: ViewMode[] = ["source", "split", "preview"];

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
    <div className="mm-toolbar-inline desktop-only">
      <div className="left-group">
        <button type="button" onClick={openFile}>
          Import
        </button>
        <button type="button" onClick={saveFile}>
          Save
        </button>
        <div className="export-dropdown" ref={exportRef}>
          <button type="button" onClick={() => openExportMenu(!exportOpen)}>
            Export
          </button>
          {exportOpen && (
            <div className="export-menu">
              <button type="button" onClick={() => handleExport("html")}>
                Web Page (.html)
              </button>
              <button type="button" onClick={() => handleExport("pdf")}>
                PDF (.pdf)
              </button>
              <button type="button" onClick={() => handleExport("txt")}>
                Text (.txt)
              </button>
              <button type="button" onClick={() => handleExport("docx")}>
                Word (.docx)
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="center-group">
        {desktopModes.map((m) => (
          <button
            key={m}
            type="button"
            className={viewMode === m ? "active" : ""}
            onClick={() => setViewMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="right-group">
        <span>
          {fileName}
          {isDirty ? " *" : ""}
        </span>
      </div>
    </div>
  );
});
