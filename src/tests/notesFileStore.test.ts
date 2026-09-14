// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createNotesFileStore,
  createSerialQueue,
  writeFileAtomic,
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

  it("creates, writes, and reads notes; replacement leaves no temp artifacts", async () => {
    const store = createNotesFileStore({ dir: () => dir });
    const created = await store.createNote("# One");
    expect(await readNote(created.id)).toBe("# One");

    const written = await store.writeNote({ id: created.id, body: "# One\nmore" });
    expect(written.body).toBe("# One\nmore");
    expect(await readNote(created.id)).toBe("# One\nmore");
    expect((await listDir()).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect((await store.listNotes()).map((n) => n.id)).toEqual([created.id]);
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

  it("a failed data write (disk full) propagates and never touches the target", async () => {
    const fullFs: NotesFs = {
      ...realFs,
      open: async (p, flags) => {
        const handle = await fs.open(p, flags);
        return {
          writeFile: async () => {
            throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      },
    };
    const target = path.join(dir, "keep.md");
    await fs.writeFile(target, "original", "utf8");
    await expect(writeFileAtomic(fullFs, target, "new")).rejects.toThrow("ENOSPC");
    expect(await fs.readFile(target, "utf8")).toBe("original");
    expect((await listDir()).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves a supplied updatedAt via mtime and stamps 'now' for local edits", async () => {
    const store = createNotesFileStore({ dir: () => dir });
    const note = await store.createNote("x");
    const canonical = Date.UTC(2024, 0, 2, 3, 4, 5);
    const pulled = await store.writeNote({ id: note.id, body: "pulled", updatedAt: canonical });
    expect(Math.round(pulled.updatedAt)).toBe(canonical);
    expect((await store.listNotes())[0].updatedAt).toBe(pulled.updatedAt);

    const before = Date.now() - 2000;
    const local = await store.writeNote({ id: note.id, body: "local edit" });
    expect(local.updatedAt).toBeGreaterThanOrEqual(before);
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

  it("listNotes skips temp artifacts and unreadable entries", async () => {
    const store = createNotesFileStore({ dir: () => dir });
    const note = await store.createNote("ok");
    await fs.writeFile(path.join(dir, `.${note.id}.md.deadbeef.tmp`), "partial", "utf8");
    await fs.writeFile(path.join(dir, "notes.txt"), "ignored", "utf8");
    expect((await store.listNotes()).map((n) => n.id)).toEqual([note.id]);
  });

  it("serial queue keeps keys independent and survives a failed task", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const a1 = enqueue("a", async () => {
      await new Promise((r) => setTimeout(r, 10));
      log.push("a1");
    });
    const b1 = enqueue("b", async () => {
      log.push("b1");
    });
    const a2 = enqueue("a", async () => {
      throw new Error("a2 failed");
    });
    const a3 = enqueue("a", async () => {
      log.push("a3");
    });
    await b1;
    expect(log).toEqual(["b1"]); // b did not wait for a
    await a1;
    await expect(a2).rejects.toThrow("a2 failed");
    await a3;
    expect(log).toEqual(["b1", "a1", "a3"]);
  });
});
