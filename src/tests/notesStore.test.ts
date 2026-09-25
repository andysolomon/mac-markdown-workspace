import { describe, it, expect, beforeEach } from "vitest";
import { useNotesStore, selectActiveNote } from "../services/notesStore";
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

  it("updateNote targets the given id even when another note is active (issue #27)", async () => {
    const { notes: disk } = installFakeApi([
      { id: "a", body: "# A", updatedAt: 200 },
      { id: "b", body: "# B", updatedAt: 100 },
    ]);
    await useNotesStore.getState().loadLibrary();
    useNotesStore.getState().selectNote("b");
    await useNotesStore.getState().updateNote("a", "# A edited");
    const { notes } = useNotesStore.getState();
    expect(notes.find((n) => n.id === "a")?.body).toBe("# A edited");
    expect(notes.find((n) => n.id === "b")?.body).toBe("# B");
    expect(disk.get("a")?.body).toBe("# A edited");
    expect(disk.get("b")?.body).toBe("# B");
  });

  it("waitForWrites includes direct saves and does not resolve early", async () => {
    installFakeApi([{ id: "a", body: "# A", updatedAt: 100 }]);
    await useNotesStore.getState().loadLibrary();
    let release: ((note: RawNote) => void) | undefined;
    (window.appApi as unknown as { writeNote: unknown }).writeNote = ({ id, body }: { id: string; body: string }) =>
      new Promise<RawNote>((resolve) => {
        release = (note) => resolve(note);
        void id;
        void body;
      });

    const write = useNotesStore.getState().updateNote("a", "# A latest");
    let finished = false;
    const waiting = useNotesStore.getState().waitForWrites().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);

    release?.({ id: "a", body: "# A latest", updatedAt: 200 });
    await Promise.all([write, waiting]);
    expect(finished).toBe(true);
    expect(selectActiveNote(useNotesStore.getState())?.body).toBe("# A latest");
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
});
