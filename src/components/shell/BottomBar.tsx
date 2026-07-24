import React, { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../services/documentStore";
import {
  exportDocument,
  prepareExport,
  type ExportFormat,
  type PreparedExport,
} from "../../services/exportActions";
import { scaffoldTreeFromNote } from "../../services/scaffoldActions";

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
        <button type="button" className="mm-bb-btn" aria-label="Back to notes" onClick={onBack}>
          <svg viewBox="0 0 24 24" className="mm-bb-icon" aria-hidden="true">
            <path d="M14.5 5 L8 12 L14.5 19" />
          </svg>
        </button>
      ) : null}
      <div className="mm-share-wrap" ref={shareRef}>
        <button
          type="button"
          className="mm-bb-btn"
          aria-label="Share or export"
          onClick={toggleShare}
        >
          <svg viewBox="0 0 24 24" className="mm-bb-icon" aria-hidden="true">
            <path d="M8 10 H6.5 A1.5 1.5 0 0 0 5 11.5 V19 a1.5 1.5 0 0 0 1.5 1.5 h11 A1.5 1.5 0 0 0 19 19 v-7.5 A1.5 1.5 0 0 0 17.5 10 H16" />
            <path d="M12 14.5 V3.5" />
            <path d="M8.5 6.5 L12 3 L15.5 6.5" />
          </svg>
        </button>
        {shareOpen ? (
          <div className="mm-share-menu">
            <button type="button" onClick={() => handleExport("html")}>Web Page (.html)</button>
            <button type="button" onClick={() => handleExport("pdf")}>PDF (.pdf)</button>
            <button type="button" onClick={() => handleExport("txt")}>Text (.txt)</button>
            <button type="button" onClick={() => handleExport("docx")}>Word (.docx)</button>
            <button
              type="button"
              onClick={() => {
                setShareOpen(false);
                void scaffoldTreeFromNote(content);
              }}
            >
              Scaffold folders…
            </button>
          </div>
        ) : null}
      </div>
      <button type="button" className="mm-bb-btn mm-bb-aa" onClick={onFontClick}>
        Aa
      </button>
      <button type="button" className="mm-bb-btn" aria-label="New note" onClick={onNewNote}>
        <svg viewBox="0 0 24 24" className="mm-bb-icon" aria-hidden="true">
          <path d="M12 5.5 V18.5 M5.5 12 H18.5" />
        </svg>
      </button>
    </div>
  );
}
