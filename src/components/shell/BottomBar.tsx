import React, { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../services/documentStore";
import { exportDocument, type ExportFormat } from "../../services/exportActions";

/**
 * BottomBar — Bear-style mobile tool strip (issue #9 / W-000009):
 * share/export on the left, Aa centered, + on the right. Rendered only on
 * narrow viewports while the keyboard accessory is not active.
 */
export function BottomBar({
  onFontClick,
  onNewNote,
}: {
  onFontClick: () => void;
  onNewNote: () => void;
}) {
  const content = useDocumentStore((s) => s.content);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen]);

  const handleExport = async (format: ExportFormat) => {
    setShareOpen(false);
    await exportDocument(format, content);
  };

  return (
    <div className="mm-bottombar">
      <div className="mm-share-wrap" ref={shareRef}>
        <button
          type="button"
          className="mm-bb-btn"
          aria-label="Share or export"
          onClick={() => setShareOpen((v) => !v)}
        >
          <span className="mm-share-icon">
            <span className="mm-share-arrow">↑</span>
          </span>
        </button>
        {shareOpen ? (
          <div className="mm-share-menu">
            <button type="button" onClick={() => handleExport("html")}>Web Page (.html)</button>
            <button type="button" onClick={() => handleExport("pdf")}>PDF (.pdf)</button>
            <button type="button" onClick={() => handleExport("txt")}>Text (.txt)</button>
            <button type="button" onClick={() => handleExport("docx")}>Word (.docx)</button>
          </div>
        ) : null}
      </div>
      <button type="button" className="mm-bb-btn mm-bb-aa" onClick={onFontClick}>
        Aa
      </button>
      <button type="button" className="mm-bb-btn mm-bb-plus" aria-label="New note" onClick={onNewNote}>
        +
      </button>
    </div>
  );
}
