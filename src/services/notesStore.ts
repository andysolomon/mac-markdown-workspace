import { create } from "zustand";
import { buildNote, buildTagIndex, filterNotes, type Note, type TagCount } from "./notesModel";

const WELCOME_BODY = `# Welcome to Mac Markdown

Your notes live here. Create one with **+**, organize with #hashtags, and
search across everything.

- Structure is colored in the theme accent
- Prose stays neutral and readable
`;

interface NotesState {
  notes: Note[];        // sorted by updatedAt, newest first
  activeNoteId: string | null;
  selectedTag: string | null;   // null = "All"
  searchQuery: string;
  loading: boolean;
  loaded: boolean;
}

interface NotesActions {
  loadLibrary: () => Promise<void>;
  reloadLibrary: () => Promise<void>;
  createNote: (body?: string) => Promise<Note>;
  /** Persist `body` as the content of the note with `id` — the id is bound
      at call time so a write that started on one note can never land on
      whichever note is active when it completes (issue #27). Rejects on a
      failed write; the in-memory entry is updated only after success. */
  updateNote: (id: string, body: string) => Promise<Note>;
  /** Convenience wrapper: `updateNote` for the currently active note. */
  updateActiveNote: (body: string) => Promise<void>;
  /** Wait for writes initiated by this store, including direct Save actions. */
  waitForWrites: () => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  selectNote: (id: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export type NotesStore = NotesState & NotesActions;

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useNotesStore = create<NotesStore>((set, get) => {
  // Keep every renderer-initiated write for a note in submission order. The
  // Electron adapter also serializes filesystem mutations, but this queue
  // covers direct Save/settings callers that bypass NotesShell's autosave
  // coordinator and gives close a complete in-flight set to await.
  const writeTails = new Map<string, Promise<void>>();
  const inFlightWrites = new Set<Promise<unknown>>();

  const updateNote = (id: string, body: string): Promise<Note> => {
    const previous = writeTails.get(id);
    const persist = async () => {
      const updated = buildNote(await window.appApi.writeNote({ id, body }));
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === id ? updated : n))),
      }));
      return updated;
    };
    // Start an idle write in the current turn so a close flush does not leave
    // a sub-600ms edit queued behind an avoidable microtask.
    const operation = previous ? previous.then(persist) : persist();
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    writeTails.set(id, tail);
    inFlightWrites.add(operation);
    const cleanup = () => {
      inFlightWrites.delete(operation);
      if (writeTails.get(id) === tail) writeTails.delete(id);
    };
    void operation.then(cleanup, cleanup);
    return operation;
  };

  const waitForWrites = async (): Promise<void> => {
    let failed = false;
    let firstError: unknown;
    while (inFlightWrites.size > 0) {
      const results = await Promise.allSettled([...inFlightWrites]);
      for (const result of results) {
        if (result.status === "rejected" && !failed) {
          failed = true;
          firstError = result.reason;
        }
      }
    }
    if (failed) throw firstError;
  };

  return {
  notes: [],
  activeNoteId: null,
  selectedTag: null,
  searchQuery: "",
  loading: false,
  loaded: false,

  loadLibrary: async () => {
    // Re-entry guard: React StrictMode double-invokes mount effects in dev;
    // two concurrent loads both see an empty library and seed two welcome
    // notes (observed on the Electron runtime pass).
    if (get().loading || get().loaded) return;
    set({ loading: true });
    const raw = await window.appApi.listNotes();
    let notes = sortNotes(raw.map(buildNote));
    if (notes.length === 0) {
      notes = [buildNote(await window.appApi.createNote({ body: WELCOME_BODY }))];
    }
    set({ notes, activeNoteId: notes[0]?.id ?? null, loading: false, loaded: true });
  },

  createNote: async (body = "") => {
    const note = buildNote(await window.appApi.createNote({ body }));
    set((s) => ({ notes: sortNotes([note, ...s.notes]), activeNoteId: note.id }));
    return note;
  },

  updateNote,

  updateActiveNote: async (body) => {
    const id = get().activeNoteId;
    if (!id) return;
    await updateNote(id, body);
  },

  waitForWrites,

  // Re-read the whole library from storage without re-seeding a welcome note.
  // Used after a vault sync applies remote edits/deletions underneath the store.
  reloadLibrary: async () => {
    const raw = await window.appApi.listNotes();
    const notes = sortNotes(raw.map(buildNote));
    set((s) => ({
      notes,
      activeNoteId: notes.some((n) => n.id === s.activeNoteId)
        ? s.activeNoteId
        : notes[0]?.id ?? null,
    }));
  },

  deleteNote: async (id) => {
    // Never delete behind an active write for the same library. A failed
    // write remains recoverable in the editor instead of being hidden by the
    // subsequent delete.
    await waitForWrites();
    await window.appApi.deleteNote({ id });
    // Record a tombstone so the deletion propagates on the next vault sync
    // instead of the note resurrecting from the remote snapshot.
    await window.appApi.recordTombstone?.({ id, deletedAt: Date.now() });
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      const activeNoteId = s.activeNoteId === id ? notes[0]?.id ?? null : s.activeNoteId;
      return { notes, activeNoteId };
    });
  },

  selectNote: (id) => set({ activeNoteId: id }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  };
});

export const selectActiveNote = (s: NotesStore): Note | null =>
  s.notes.find((n) => n.id === s.activeNoteId) ?? null;

/** Counted, alphabetical tag index for the sidebar. */
export const selectTagIndex = (s: NotesStore): TagCount[] => buildTagIndex(s.notes);

/** The document list after applying the active tag + search query. */
export const selectFilteredNotes = (s: NotesStore): Note[] =>
  filterNotes(s.notes, { tag: s.selectedTag, query: s.searchQuery });
