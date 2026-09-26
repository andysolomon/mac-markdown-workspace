import React, { useState } from "react";
import type { Note } from "../../services/notesModel";
import { DocListItem } from "./DocListItem";

export function DocList({
  notes,
  activeNoteId,
  searchQuery,
  onSearchChange,
  onSelectNote,
  onDeleteNote,
  header,
}: {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  /** Mobile page header: back chevron · title · + (issue #16 / W-000016). */
  header?: { title: string; onBack: () => void; onNew: () => void };
}) {
  // The one row whose swipe-to-delete action is showing, if any.
  const [revealedId, setRevealedId] = useState<string | null>(null);

  return (
    <section className="mm-doclist">
      {header ? (
        <div className="mm-page-head">
          <button type="button" className="mm-back" aria-label="Back" onClick={header.onBack}>
            ‹
          </button>
          <span className="mm-page-title">{header.title}</span>
          <button type="button" className="mm-page-new" aria-label="New note" onClick={header.onNew}>
            +
          </button>
        </div>
      ) : null}
      <div className="mm-search">
        <div className="mm-mag" />
        <input
          value={searchQuery}
          placeholder="Search"
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {/* Scrolling puts an open Delete away. */}
      <div className="mm-scroll" onScroll={() => setRevealedId(null)}>
        {notes.map((n) => (
          <DocListItem
            key={n.id}
            title={n.title}
            preview={n.preview}
            selected={n.id === activeNoteId}
            revealed={n.id === revealedId}
            onClick={() => onSelectNote(n.id)}
            onDelete={() => onDeleteNote(n.id)}
            onRevealChange={(open) =>
              setRevealedId((cur) => (open ? n.id : cur === n.id ? null : cur))
            }
          />
        ))}
      </div>
    </section>
  );
}
