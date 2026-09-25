// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createNotesFileStore,
  TOMBSTONES_FILE,
  type NotesFs,
} from "../services/notesFileStore";

let dir: string;
const realFs = fs as unknown as NotesFs;

const listDir = () => fs.readdir(dir);
const readNote = (id: string) => fs.readFile(path.join(dir, `${id}.md`), "utf8");
const readTombstones = async () =>
  JSON.parse(await fs.readFile(path.join(dir, TOMBSTONES_FILE), "utf8")) as Record<string, number>;

describe("notesFileStore (issue #27)", () => {
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmw-notes-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("an interrupted replacement (rename fails) preserves the previous valid note and cleans up", async () => {
    let failRename = false;
    const flakyFs: NotesFs = {
      ...realFs,
      readFile: realFs.readFile,
      rename: async (from, to) => {
        if (failRename) throw Object.assign(new Error("EIO: rename interrupted"), { code: "EIO" });
        return realFs.rename(from, to);
      },
    };
    const store = createNotesFileStore({ dir: () => dir, fs: flakyFs });
    const note = await store.createNote("# Safe");

    failRename = true;
    await expect(store.writeNote({ id: note.id, body: "# Half-written" })).rejects.toThrow("EIO");
    expect(await readNote(note.id)).toBe("# Safe");
    expect((await listDir()).filter((n) => n.endsWith(".tmp"))).toEqual([]);

    failRename = false;
    await store.writeNote({ id: note.id, body: "# Recovered" });
    expect(await readNote(note.id)).toBe("# Recovered");
  });

  it("serializes concurrent writes to the same note in submission order", async () => {
    const order: string[] = [];
    let gate: (() => void) | null = null;
    let slowStarted: () => void = () => undefined;
    const slowHasStarted = new Promise<void>((r) => (slowStarted = r));
    const slowFs: NotesFs = {
      ...realFs,
      open: async (p, flags) => {
        const handle = await fs.open(p, flags);
        return {
          writeFile: async (data, enc) => {
            order.push(`start:${data}`);
            if (data === "slow") {
              slowStarted();
              await new Promise<void>((r) => (gate = r));
            }
            await handle.writeFile(data, enc);
            order.push(`end:${data}`);
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      },
    };
    const store = createNotesFileStore({ dir: () => dir, fs: slowFs });
    const note = await store.createNote("seed");
    order.length = 0;

    const first = store.writeNote({ id: note.id, body: "slow" });
    const second = store.writeNote({ id: note.id, body: "fast" });
    await slowHasStarted;
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["start:slow"]); // "fast" has not started
    (gate as unknown as () => void)();
    await Promise.all([first, second]);
    expect(order).toEqual(["start:slow", "end:slow", "start:fast", "end:fast"]);
    expect(await readNote(note.id)).toBe("fast");
  });

  it("tombstone updates are serialized read-modify-write: no concurrent update is lost", async () => {
    const store = createNotesFileStore({ dir: () => dir });
    const ids = Array.from({ length: 25 }, (_, i) => `t${i}`);
    await Promise.all([
      ...ids.map((id, i) => store.recordTombstone(id, 1000 + i)),
      store.clearTombstones(["t0", "t1"]), // interleaved clear of ids recorded earlier in the queue
    ]);
    const map = await readTombstones();
    expect(Object.keys(map).sort()).toEqual(ids.slice(2).sort());
    expect(await store.listTombstones()).toHaveLength(23);
  });

  it("rewriting a note clears its stale tombstone, and delete is serialized behind writes", async () => {
    const store = createNotesFileStore({ dir: () => dir });
    const note = await store.createNote("x");
    await store.recordTombstone(note.id, 42);
    await store.writeNote({ id: note.id, body: "resurrected" });
    expect(await readTombstones()).toEqual({});

    await Promise.all([store.writeNote({ id: note.id, body: "final" }), store.deleteNote(note.id)]);
    expect(await store.readNote(note.id)).toBeNull();
  });

  it("fails closed on a corrupt tombstone sidecar instead of replacing it with an empty map", async () => {
    const sidecar = path.join(dir, TOMBSTONES_FILE);
    await fs.writeFile(sidecar, "{not-json", "utf8");
    const store = createNotesFileStore({ dir: () => dir });

    await expect(store.recordTombstone("a", 1)).rejects.toThrow("sidecar is corrupt");
    expect(await fs.readFile(sidecar, "utf8")).toBe("{not-json");
  });
});
