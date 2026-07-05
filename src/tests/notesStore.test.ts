import { describe, it, expect, beforeEach } from "vitest";
import {
  useNotesStore,
  selectActiveNote,
  selectTagIndex,
  selectFilteredNotes,
} from "../services/notesStore";
import type { RawNote } from "../services/notesModel";

/** In-memory fake of the notes half of window.appApi. */
function installFakeApi(seed: RawNote[] = []) {
  const notes = new Map<string, RawNote>(seed.map((n) => [n.id, n]));
  let seq = 0;
  const api = {
    listNotes: async () => [...notes.values()],
    readNote: async ({ id }: { id: string }) => notes.get(id) ?? null,
    createNote: async ({ body }: { body: string }) => {
      const note = { id: `n${++seq}`, body: body ?? "", updatedAt: 1000 + seq };
      notes.set(note.id, note);
      return note;
    },
    writeNote: async ({ id, body }: { id: string; body: string }) => {
      const note = { id, body, updatedAt: 5000 + ++seq };
      notes.set(id, note);
      return note;
    },
    deleteNote: async ({ id }: { id: string }) => { notes.delete(id); },
  };
  (window as unknown as { appApi: unknown }).appApi = api;
  return { notes };
}

describe("notesStore", () => {
  beforeEach(() => {
    useNotesStore.setState({
      notes: [],
      activeNoteId: null,
      selectedTag: null,
      searchQuery: "",
      loading: false,
      loaded: false,
    });
  });

  it("seeds a welcome note when the library is empty", async () => {
    installFakeApi([]);
    await useNotesStore.getState().loadLibrary();
    const { notes, activeNoteId } = useNotesStore.getState();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Welcome to Mac Markdown");
    expect(activeNoteId).toBe(notes[0].id);
  });

  it("loads and sorts existing notes newest-first, deriving title + tags", async () => {
    installFakeApi([
      { id: "a", body: "# Older\ntagged #x", updatedAt: 100 },
      { id: "b", body: "# Newer", updatedAt: 200 },
    ]);
    await useNotesStore.getState().loadLibrary();
    const { notes } = useNotesStore.getState();
    expect(notes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(notes[1].title).toBe("Older");
    expect(notes[1].tags).toEqual(["x"]);
  });

  it("creates a note, prepends it, and makes it active", async () => {
    installFakeApi([{ id: "a", body: "# A", updatedAt: 100 }]);
    await useNotesStore.getState().loadLibrary();
    const created = await useNotesStore.getState().createNote("# Fresh");
    const { notes, activeNoteId } = useNotesStore.getState();
    expect(activeNoteId).toBe(created.id);
    expect(notes[0].id).toBe(created.id);
    expect(notes[0].title).toBe("Fresh");
  });

  it("updates the active note's body and re-derives fields", async () => {
    installFakeApi([{ id: "a", body: "# A", updatedAt: 100 }]);
    await useNotesStore.getState().loadLibrary();
    await useNotesStore.getState().updateActiveNote("# Renamed\nwith #tag");
    const active = selectActiveNote(useNotesStore.getState());
    expect(active?.title).toBe("Renamed");
    expect(active?.tags).toEqual(["tag"]);
  });

  it("deletes a note and reselects a remaining one", async () => {
    installFakeApi([
      { id: "a", body: "# A", updatedAt: 200 },
      { id: "b", body: "# B", updatedAt: 100 },
    ]);
    await useNotesStore.getState().loadLibrary();
    await useNotesStore.getState().deleteNote("a"); // "a" was active (newest)
    const { notes, activeNoteId } = useNotesStore.getState();
    expect(notes.map((n) => n.id)).toEqual(["b"]);
    expect(activeNoteId).toBe("b");
  });

  it("exposes a tag index and filters the list by tag + search", async () => {
    installFakeApi([
      { id: "a", body: "# Roadmap\nship the #app", updatedAt: 300 },
      { id: "b", body: "# Groceries\nmilk, eggs", updatedAt: 200 },
      { id: "c", body: "# App ideas\n#app #ideas brainstorm", updatedAt: 100 },
    ]);
    await useNotesStore.getState().loadLibrary();

    expect(selectTagIndex(useNotesStore.getState())).toEqual([
      { tag: "app", count: 2 },
      { tag: "ideas", count: 1 },
    ]);

    useNotesStore.getState().setSelectedTag("app");
    expect(selectFilteredNotes(useNotesStore.getState()).map((n) => n.id)).toEqual(["a", "c"]);

    useNotesStore.getState().setSearchQuery("brainstorm");
    expect(selectFilteredNotes(useNotesStore.getState()).map((n) => n.id)).toEqual(["c"]);

    useNotesStore.getState().setSelectedTag(null);
    useNotesStore.getState().setSearchQuery("milk");
    expect(selectFilteredNotes(useNotesStore.getState()).map((n) => n.id)).toEqual(["b"]);
  });
});
