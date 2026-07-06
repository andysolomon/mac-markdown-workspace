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
  createNote: (body?: string) => Promise<Note>;
  updateActiveNote: (body: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  selectNote: (id: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export type NotesStore = NotesState & NotesActions;

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const useNotesStore = create<NotesStore>((set, get) => ({
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

  updateActiveNote: async (body) => {
    const id = get().activeNoteId;
    if (!id) return;
    const updated = buildNote(await window.appApi.writeNote({ id, body }));
    set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === id ? updated : n))) }));
  },

  deleteNote: async (id) => {
    await window.appApi.deleteNote({ id });
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      const activeNoteId = s.activeNoteId === id ? notes[0]?.id ?? null : s.activeNoteId;
      return { notes, activeNoteId };
    });
  },

  selectNote: (id) => set({ activeNoteId: id }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

export const selectActiveNote = (s: NotesStore): Note | null =>
  s.notes.find((n) => n.id === s.activeNoteId) ?? null;

/** Counted, alphabetical tag index for the sidebar. */
export const selectTagIndex = (s: NotesStore): TagCount[] => buildTagIndex(s.notes);

/** The document list after applying the active tag + search query. */
export const selectFilteredNotes = (s: NotesStore): Note[] =>
  filterNotes(s.notes, { tag: s.selectedTag, query: s.searchQuery });
