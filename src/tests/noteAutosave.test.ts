import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useNotesStore } from "../services/notesStore";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";
import {
  noteSaves,
  syncBufferToAutosave,
  flushNoteSaves,
  loadNoteIntoBuffer,
  retryFailedSaves,
  discardFailedSaves,
  reconcileActiveNoteBuffer,
  AUTOSAVE_MS,
} from "../services/noteAutosave";
import type { RawNote } from "../services/notesModel";

type Deferred = { id: string; body: string; resolve: () => void; reject: (e: unknown) => void };

/** Fake notes API whose writeNote completes only when the test says so. */
function installFakeApi(seed: RawNote[]) {
  const disk = new Map<string, RawNote>(seed.map((n) => [n.id, n]));
  const writes: Deferred[] = [];
  let seq = 0;
  const api = {
    listNotes: async () => [...disk.values()],
    readNote: async ({ id }: { id: string }) => disk.get(id) ?? null,
    createNote: async ({ body }: { body: string }) => {
      const note = { id: `n${++seq}`, body, updatedAt: 1000 + seq };
      disk.set(note.id, note);
      return note;
    },
    writeNote: ({ id, body }: { id: string; body: string }): Promise<RawNote> =>
      new Promise<RawNote>((resolve, reject) => {
        writes.push({
          id,
          body,
          resolve: () => {
            const note = { id, body, updatedAt: 5000 + ++seq };
            disk.set(id, note);
            resolve(note);
          },
          reject,
        });
      }),
    deleteNote: async ({ id }: { id: string }) => {
      disk.delete(id);
    },
    checkDirty: (): (() => void) => () => undefined,
  };
  (window as unknown as { appApi: unknown }).appApi = api;
  return { disk, writes };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

async function loadWith(seed: RawNote[]) {
  const fake = installFakeApi(seed);
  await useNotesStore.getState().loadLibrary();
  loadNoteIntoBuffer(useNotesStore.getState().activeNoteId as string);
  return fake;
}

function type(text: string) {
  useDocumentStore.getState().setContent(text);
  syncBufferToAutosave(); // what NotesShell's [content] effect does
}

describe("noteAutosave (issue #27)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    noteSaves.reset();
    useNotesStore.setState({
      notes: [],
      activeNoteId: null,
      selectedTag: null,
      searchQuery: "",
      loading: false,
      loaded: false,
    });
    useDocumentStore.setState({ content: "", savedContent: "", filePath: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("close handshake flushes an edit younger than the 600ms debounce and persists the exact text", async () => {
    const { disk, writes } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    type("# A\nlast words");
    vi.advanceTimersByTime(AUTOSAVE_MS - 1);
    expect(writes).toHaveLength(0);

    const result = flushNoteSaves();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ id: "a", body: "# A\nlast words" });
    writes[0].resolve();
    await expect(result).resolves.toEqual({ ok: true });
    expect(disk.get("a")?.body).toBe("# A\nlast words");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false);
  });

  it("marks the buffer clean only for the revision that persisted; a stale completion keeps newer edits Modified", async () => {
    const { disk, writes } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    type("# A v1");
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(writes).toHaveLength(1);

    type("# A v2"); // keep typing while v1 is slow
    writes[0].resolve();
    await tick();
    expect(useDocumentStore.getState().savedContent).toBe("# A v1");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true);
    expect(disk.get("a")?.body).toBe("# A v1");

    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toBe("# A v2");
    writes[1].resolve();
    await tick();
    expect(disk.get("a")?.body).toBe("# A v2");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false);
  });

  it("a rejected write blocks close, keeps the edits, and can be retried", async () => {
    const { disk, writes } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    type("# A edited");
    const first = flushNoteSaves();
    writes[0].reject(new Error("Error invoking remote method 'notes:write': Error: EACCES: permission denied"));
    await expect(first).resolves.toEqual({ ok: false, error: "EACCES: permission denied" });

    expect(noteSaves.getState().status).toBe("error");
    expect(useDocumentStore.getState().content).toBe("# A edited");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true);
    expect(disk.get("a")?.body).toBe("# A");

    const retry = retryFailedSaves();
    expect(writes).toHaveLength(2);
    writes[1].resolve();
    await expect(retry).resolves.toEqual({ ok: true });
    expect(disk.get("a")?.body).toBe("# A edited");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(false);
  });

  it("failed edits survive switching away and back; explicit discard reverts to disk", async () => {
    const { writes } = await loadWith([
      { id: "a", body: "# A", updatedAt: 200 },
      { id: "b", body: "# B", updatedAt: 100 },
    ]);
    type("# A unsaved");
    const flush = flushNoteSaves();
    writes[0].reject(new Error("EIO"));
    await flush;

    useNotesStore.getState().selectNote("b");
    loadNoteIntoBuffer("b");
    expect(useDocumentStore.getState().content).toBe("# B");

    useNotesStore.getState().selectNote("a");
    loadNoteIntoBuffer("a");
    expect(useDocumentStore.getState().content).toBe("# A unsaved");
    expect(selectIsDirty(useDocumentStore.getState())).toBe(true);

    expect(discardFailedSaves()).toEqual([{ noteId: "a", body: "# A unsaved", revision: 1 }]);
    expect(useDocumentStore.getState().content).toBe("# A");
    expect(noteSaves.hasUnsaved()).toBe(false);
    await expect(flushNoteSaves()).resolves.toEqual({ ok: true });
  });

  it("a write that started on note A lands on A even after the user switches to B", async () => {
    const { disk, writes } = await loadWith([
      { id: "a", body: "# A", updatedAt: 200 },
      { id: "b", body: "# B", updatedAt: 100 },
    ]);
    type("# A typed");
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(writes[0]).toMatchObject({ id: "a", body: "# A typed" });

    // Switch while the write is in flight (NotesShell awaits flush, which
    // waits on the in-flight write, but selection may already be pending).
    useNotesStore.getState().selectNote("b");
    loadNoteIntoBuffer("b");
    writes[0].resolve();
    await tick();

    expect(disk.get("a")?.body).toBe("# A typed");
    expect(disk.get("b")?.body).toBe("# B");
    const notes = useNotesStore.getState().notes;
    expect(notes.find((n) => n.id === "a")?.body).toBe("# A typed");
    expect(notes.find((n) => n.id === "b")?.body).toBe("# B");
    // B's buffer must not have been touched by A's completion.
    expect(useDocumentStore.getState()).toMatchObject({ content: "# B", savedContent: "# B" });
  });

  it("reverting the buffer to the persisted body cancels the pending write", async () => {
    const { writes } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    type("# A x");
    type("# A");
    vi.advanceTimersByTime(AUTOSAVE_MS * 2);
    expect(writes).toHaveLength(0);
    expect(noteSaves.hasUnsaved()).toBe(false);
  });

  it("reverting while a write is in flight still schedules the revert", async () => {
    const { disk, writes } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    type("# A x");
    vi.advanceTimersByTime(AUTOSAVE_MS);
    type("# A"); // back to the original while "# A x" is being written
    writes[0].resolve();
    await tick();
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toBe("# A");
    writes[1].resolve();
    await tick();
    expect(disk.get("a")?.body).toBe("# A");
  });

  it("refreshes a clean active buffer when sync changes the same note id", async () => {
    const { disk } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    disk.set("a", { id: "a", body: "# Remote A", updatedAt: 200 });
    await useNotesStore.getState().reloadLibrary();
    reconcileActiveNoteBuffer();

    expect(useNotesStore.getState().activeNoteId).toBe("a");
    expect(useDocumentStore.getState()).toMatchObject({
      content: "# Remote A",
      savedContent: "# Remote A",
    });
  });

  it("does not overwrite dirty local text during active-note reconciliation", async () => {
    const { disk } = await loadWith([{ id: "a", body: "# A", updatedAt: 100 }]);
    useDocumentStore.setState({ content: "# Local draft", savedContent: "# A" });
    disk.set("a", { id: "a", body: "# Remote A", updatedAt: 200 });
    await useNotesStore.getState().reloadLibrary();
    reconcileActiveNoteBuffer();

    expect(useDocumentStore.getState()).toMatchObject({
      content: "# Local draft",
      savedContent: "# A",
    });
  });
});
