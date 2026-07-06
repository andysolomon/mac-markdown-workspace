import React, { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../services/documentStore";
import {
  exportDocument,
  prepareExport,
  type ExportFormat,
  type PreparedExport,
} from "../../services/exportActions";

/**
 * BottomBar — Bear-style mobile tool strip (issue #9 / W-000009):
 * share/export on the left, Aa centered, + on the right. Rendered only on
 * narrow viewports while the keyboard accessory is not active.
 */
export function BottomBar({
  onFontClick,
  onNewNote,
  onBack,
}: {
  onFontClick: () => void;
  onNewNote: () => void;
  /** Back to the notes list (mobile page navigation, issue #16). */
  onBack?: () => void;
}) {
  const content = useDocumentStore((s) => s.content);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  // Pre-rendered when the share menu opens (iOS gesture discipline, #12).
  const prepRef = useRef<PreparedExport | undefined>(undefined);

  const toggleShare = () => {
    if (!shareOpen) prepRef.current = prepareExport(content);
    setShareOpen((v) => !v);
  };

  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen]);

  const handleExport = (format: ExportFormat) => {
    setShareOpen(false);
    // Synchronous into exportDocument with the pre-rendered payload — keeps
    // iOS transient activation live for share/print delivery.
    void exportDocument(format, content, prepRef.current);
  };

  return (
    <div className="mm-bottombar">
      {onBack ? (
        <button type="button" className="mm-bb-btn mm-bb-back" aria-label="Back to notes" onClick={onBack}>
          ‹
        </button>
      ) : null}
      <div className="mm-share-wrap" ref={shareRef}>
        <button
          type="button"
          className="mm-bb-btn"
          aria-label="Share or export"
          onClick={toggleShare}
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
