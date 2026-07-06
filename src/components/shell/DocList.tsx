import React from "react";
import type { Note } from "../../services/notesModel";
import { DocListItem } from "./DocListItem";

export function DocList({
  notes,
  activeNoteId,
  searchQuery,
  onSearchChange,
  onSelectNote,
  onDeleteNote,
}: {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  return (
    <section className="mm-doclist">
      <div className="mm-search">
        <div className="mm-mag" />
        <input
          value={searchQuery}
          placeholder="Search"
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="mm-scroll">
        {notes.map((n) => (
          <DocListItem
            key={n.id}
            title={n.title}
            preview={n.preview}
            selected={n.id === activeNoteId}
            onClick={() => onSelectNote(n.id)}
            onDelete={() => onDeleteNote(n.id)}
          />
        ))}
      </div>
    </section>
  );
}
