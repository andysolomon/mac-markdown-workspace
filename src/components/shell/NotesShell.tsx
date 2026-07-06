import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { DocList } from "./DocList";
import { EditorChrome } from "./EditorChrome";
import { FontPopover } from "./FontPopover";
import { Toolbar } from "../Toolbar";
import { Workspace } from "../Workspace";
import { StatusBar } from "../StatusBar";
import { useNotesStore } from "../../services/notesStore";
import { buildTagIndex, filterNotes } from "../../services/notesModel";
import { useDocumentStore } from "../../services/documentStore";

const AUTOSAVE_MS = 600;

/**
 * NotesShell — the Bear-style three-pane workspace container. Wires the notes
 * library (sidebar tags, doc list, selection) to the existing editor stack.
 * documentStore remains the editing buffer: the active note is synced into it
 * on selection, and buffer changes are autosaved back (debounced).
 */
export function NotesShell() {
  const loadLibrary = useNotesStore((s) => s.loadLibrary);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const selectedTag = useNotesStore((s) => s.selectedTag);
  const searchQuery = useNotesStore((s) => s.searchQuery);
  const setSelectedTag = useNotesStore((s) => s.setSelectedTag);
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery);
  const selectNote = useNotesStore((s) => s.selectNote);
  const createNote = useNotesStore((s) => s.createNote);
  // Subscribe to the raw slice and derive with useMemo — selectors that build
  // new arrays per call must not be passed to useNotesStore directly (the
  // fresh reference every snapshot would loop useSyncExternalStore).
  const notes = useNotesStore((s) => s.notes);
  const tags = useMemo(() => buildTagIndex(notes), [notes]);
  const filteredNotes = useMemo(
    () => filterNotes(notes, { tag: selectedTag, query: searchQuery }),
    [notes, selectedTag, searchQuery],
  );

  const content = useDocumentStore((s) => s.content);

  const [listOpen, setListOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );
  const [fontOpen, setFontOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Selection changed: load the active note into the editing buffer.
  // filePath is cleared so file-save shortcuts can never write a note's
  // content over a previously opened file.
  useEffect(() => {
    if (!activeNoteId) return;
    const note = useNotesStore.getState().notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    useDocumentStore.setState({
      content: note.body,
      savedContent: note.body,
      filePath: "",
    });
  }, [activeNoteId]);

  // Debounced autosave: editing buffer -> active note. The effect cleanup is
  // the debounce; a no-op when the buffer matches the stored body (e.g. right
  // after selection sync).
  useEffect(() => {
    const s = useNotesStore.getState();
    if (!s.loaded || !s.activeNoteId) return;
    const active = s.notes.find((n) => n.id === s.activeNoteId);
    if (!active || content === active.body) return;

    const timer = window.setTimeout(() => {
      saveTimer.current = null;
      useNotesStore
        .getState()
        .updateActiveNote(useDocumentStore.getState().content)
        .then(() => useDocumentStore.getState().markClean());
    }, AUTOSAVE_MS);
    saveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (saveTimer.current === timer) saveTimer.current = null;
    };
  }, [content]);

  // Write any pending edit immediately (before switching notes).
  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current === null) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const buffer = useDocumentStore.getState().content;
    const s = useNotesStore.getState();
    const active = s.notes.find((n) => n.id === s.activeNoteId);
    if (active && buffer !== active.body) {
      await s.updateActiveNote(buffer);
      useDocumentStore.getState().markClean();
    }
  }, []);

  const handleSelectNote = useCallback(
    async (id: string) => {
      await flushPendingSave();
      selectNote(id);
      if (typeof window !== "undefined" && window.innerWidth <= 640) {
        setListOpen(false);
      }
    },
    [flushPendingSave, selectNote],
  );

  const handleNewNote = useCallback(async () => {
    await flushPendingSave();
    await createNote("");
  }, [flushPendingSave, createNote]);

  return (
    <>
      <Sidebar tags={tags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
      {listOpen && (
        <DocList
          notes={filteredNotes}
          activeNoteId={activeNoteId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectNote={handleSelectNote}
        />
      )}
      <section className="mm-editor">
        <EditorChrome
          onToggleList={() => setListOpen((v) => !v)}
          onFontClick={() => setFontOpen((v) => !v)}
          onNewNote={handleNewNote}
        />
        <FontPopover open={fontOpen} onClose={() => setFontOpen(false)} />
        <Toolbar />
        <Workspace />
        <StatusBar />
      </section>
    </>
  );
}
