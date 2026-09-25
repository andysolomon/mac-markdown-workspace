import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * iOS notes storage location (issue #8 / W-000008).
 *
 * A stateful in-memory Capacitor Filesystem mock keyed by (directory, path)
 * proves that the two choices are physically distinct roots, that
 * Directory.Data is never used for notes, and that switching migrates the
 * complete library safely (copy → verify → activate → clean up) with
 * deterministic retry after any injected failure.
 */

type Op = "readFile" | "writeFile" | "deleteFile" | "readdir" | "stat" | "mkdir";

const DIR = {
  Documents: "DOCUMENTS",
  Data: "DATA",
  Library: "LIBRARY",
  LibraryNoCloud: "LIBRARY_NO_CLOUD",
  Cache: "CACHE",
} as const;

const fs = vi.hoisted(() => {
  const files = new Map<string, { data: string; mtime: number }>();
  const dirs = new Set<string>();
  const calls: Array<{ op: string; directory: string; path: string }> = [];
  let clock = 1_000;
  let failures: Array<{ op: string; test: (directory: string, path: string) => boolean; once: boolean }> = [];

  const key = (directory: string, path: string) => `${directory}::${path}`;
  const parent = (path: string) => path.split("/").slice(0, -1).join("/");
  const notFound = (what: string, path: string) =>
    new Error(`'${what}' failed because file at '${path}' does not exist.`);

  const maybeFail = (op: string, directory: string, path: string) => {
    const idx = failures.findIndex((f) => f.op === op && f.test(directory, path));
    if (idx === -1) return;
    const f = failures[idx];
    if (f.once) failures.splice(idx, 1);
    throw new Error(`injected ${op} failure at ${directory}/${path}`);
  };

  const api = {
    reset() {
      files.clear();
      dirs.clear();
      calls.length = 0;
      failures = [];
      clock = 1_000;
    },
    failOn(op: Op, test: (directory: string, path: string) => boolean, once = true) {
      failures.push({ op, test, once });
    },
    calls,
    files,
    dirs,
    /** All notes (id -> body) physically present in a directory's notes/. */
    notesIn(directory: string): Record<string, string> {
      const out: Record<string, string> = {};
      for (const [k, v] of files) {
        const [d, p] = k.split("::");
        if (d === directory && p.startsWith("notes/") && p.endsWith(".md")) {
          out[p.slice("notes/".length, -3)] = v.data;
        }
      }
      return out;
    },
    metaIn(directory: string): unknown {
      const e = files.get(key(directory, "notes/.vault-meta.json"));
      return e ? JSON.parse(e.data) : null;
    },
    seed(directory: string, path: string, data: string) {
      dirs.add(key(directory, parent(path)));
      files.set(key(directory, path), { data, mtime: clock++ });
    },
    directoriesUsed(): Set<string> {
      return new Set(calls.map((c) => c.directory));
    },
    Filesystem: {
      async readFile({ path, directory }: { path: string; directory: string }) {
        calls.push({ op: "readFile", directory, path });
        maybeFail("readFile", directory, path);
        const e = files.get(key(directory, path));
        if (!e) throw notFound("readFile", path);
        return { data: e.data };
      },
      async writeFile({
        path,
        data,
        directory,
        recursive,
      }: {
        path: string;
        data: string;
        directory: string;
        recursive?: boolean;
      }) {
        calls.push({ op: "writeFile", directory, path });
        maybeFail("writeFile", directory, path);
        const p = parent(path);
        if (p && !dirs.has(key(directory, p))) {
          if (!recursive) throw new Error(`'writeFile' failed because parent '${p}' does not exist.`);
          dirs.add(key(directory, p));
        }
        files.set(key(directory, path), { data, mtime: clock++ });
        return { uri: `file:///${directory}/${path}` };
      },
      async deleteFile({ path, directory }: { path: string; directory: string }) {
        calls.push({ op: "deleteFile", directory, path });
        maybeFail("deleteFile", directory, path);
        if (!files.delete(key(directory, path))) throw notFound("deleteFile", path);
      },
      async readdir({ path, directory }: { path: string; directory: string }) {
        calls.push({ op: "readdir", directory, path });
        maybeFail("readdir", directory, path);
        if (!dirs.has(key(directory, path))) throw notFound("readdir", path);
        const names: string[] = [];
        for (const k of files.keys()) {
          const [d, p] = k.split("::");
          if (d === directory && parent(p) === path) names.push(p.slice(path.length + 1));
        }
        return { files: names.map((name) => ({ name, type: "file", size: 0, mtime: 0, uri: "" })) };
      },
      async stat({ path, directory }: { path: string; directory: string }) {
        calls.push({ op: "stat", directory, path });
        maybeFail("stat", directory, path);
        const e = files.get(key(directory, path));
        if (!e) throw notFound("stat", path);
        return { type: "file", size: e.data.length, mtime: e.mtime, uri: "" };
      },
      async mkdir({ path, directory }: { path: string; directory: string }) {
        calls.push({ op: "mkdir", directory, path });
        dirs.add(key(directory, path));
      },
      async getUri({ path, directory }: { path: string; directory: string }) {
        return { uri: `file:///${directory}/${path}` };
      },
    },
  };
  return api;
});

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: fs.Filesystem,
  Directory: DIR,
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: vi.fn() } }));

// jsdom 28's Storage writes through an internal slot, so replacing
// localStorage.setItem (including vi.spyOn) never observes or fails the
// write. The activation-write failure test injects a failing setItem, which
// requires ordinary functions.
{
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      store.set(k, String(v));
    },
    removeItem: (k: string): void => {
      store.delete(k);
    },
    clear: (): void => store.clear(),
    key: (i: number): string | null => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const SETTINGS_KEY = "mmw-settings";
const settings = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
const setSettings = (s: Record<string, unknown>) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

/** Fresh shim instance (module-level controller state) per test. */
async function loadApi() {
  vi.resetModules();
  const mod = await import("../ios/capacitorApi");
  return mod.capacitorApi;
}

function seedLibrary(directory: string, notes: Record<string, string>, meta?: unknown) {
  for (const [id, body] of Object.entries(notes)) fs.seed(directory, `notes/${id}.md`, body);
  if (meta !== undefined) fs.seed(directory, "notes/.vault-meta.json", JSON.stringify(meta));
}

function noteMtime(directory: string, id: string): number {
  const entry = fs.files.get(`${directory}::notes/${id}.md`);
  if (!entry) throw new Error(`Missing seeded note ${directory}/${id}`);
  return entry.mtime;
}

beforeEach(() => {
  fs.reset();
  localStorage.clear();
});

describe("routing by storage setting", () => {
  it("routes every notes operation to LibraryNoCloud when 'private' is persisted", async () => {
    setSettings({ iosStorage: "private" });
    const api = await loadApi();
    expect(await api.getSetting("iosStorage")).toBe("private");
    const note = await api.createNote({ body: "priv" });
    await api.recordTombstone({ id: "gone", deletedAt: 5 });
    expect(await api.listTombstones()).toEqual([{ id: "gone", deletedAt: 5 }]);
    await api.clearTombstones({ ids: ["gone"] });
    expect(await api.listTombstones()).toEqual([]);
    const tree = await api.materializeTree({ entries: [{ relativePath: "proj/a.md", kind: "file" }] });
    expect(tree.ok).toBe(true);
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ [note.id]: "priv" });
    expect(fs.notesIn(DIR.Documents)).toEqual({});
    expect(fs.metaIn(DIR.LibraryNoCloud)).toEqual({ times: { [note.id]: expect.any(Number) }, tombstones: {} });
    const used = fs.directoriesUsed();
    expect(used.has(DIR.Data)).toBe(false);
    // Only the defensive dual-root delete may touch Documents; none happened here.
    expect(used.has(DIR.Documents)).toBe(false);
    await api.deleteNote({ id: note.id });
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({});
  });

  it("reads only the active root — stale copies in the inactive root never surface", async () => {
    seedLibrary(DIR.Documents, { a: "docs copy" });
    seedLibrary(DIR.LibraryNoCloud, { a: "old private copy", zz: "orphan" });
    const api = await loadApi();
    expect((await api.listNotes()).map((n) => [n.id, n.body])).toEqual([["a", "docs copy"]]);
    expect(await api.readNote({ id: "zz" })).toBeNull();
  });

  it("overlays canonical times from metadata onto list and read", async () => {
    seedLibrary(DIR.Documents, { a: "body" }, { times: { a: 42 }, tombstones: {} });
    const api = await loadApi();
    expect((await api.listNotes())[0].updatedAt).toBe(42);
    expect((await api.readNote({ id: "a" }))?.updatedAt).toBe(42);
    await api.writeNote({ id: "a", body: "pulled", updatedAt: 7 }); // vault pull keeps its stamp
    expect((await api.readNote({ id: "a" }))?.updatedAt).toBe(7);
  });
});

describe("legacy upgrades", () => {
  it("upgrades legacy 'device' by migrating Documents -> LibraryNoCloud (old data lived in Documents)", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" }, { times: { a: 11, b: 22 }, tombstones: { t: 33 } });
    setSettings({ iosStorage: "device" });
    const api = await loadApi();
    expect(await api.getSetting("iosStorage")).toBe("private");
    expect(settings().iosStorage).toBe("private");
    expect(settings().iosStorageMigration).toBeUndefined();
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A", b: "B" });
    expect(fs.metaIn(DIR.LibraryNoCloud)).toEqual({ times: { a: 11, b: 22 }, tombstones: { t: 33 } });
    expect(fs.notesIn(DIR.Documents)).toEqual({});
    expect(fs.metaIn(DIR.Documents)).toBeNull();
    expect((await api.listNotes()).map((n) => [n.id, n.updatedAt]).sort()).toEqual([["a", 11], ["b", 22]]);
    expect(fs.directoriesUsed().has(DIR.Data)).toBe(false);
  });

  it("a pre-activation legacy 'device' upgrade failure falls back to Documents", async () => {
    seedLibrary(DIR.Documents, { a: "A" });
    setSettings({ iosStorage: "device" });
    fs.failOn("writeFile", (d) => d === DIR.LibraryNoCloud);
    const api = await loadApi();
    expect(await api.getSetting("iosStorage")).toBe("documents");
    expect(settings().iosStorage).toBe("documents");
    expect(settings().iosStorageMigration).toBeUndefined();
    expect(fs.notesIn(DIR.Documents)).toEqual({ a: "A" });
    expect((await api.listNotes()).map((n) => n.id)).toEqual(["a"]);
  });
});

describe("explicit switch (migration)", () => {
  const META = { times: { a: 1, b: 2 }, tombstones: { deleted: 99 } };

  it("atomic activation-write failure rejects with the complete source still active across relaunch", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" }, META);
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      const next = key === SETTINGS_KEY ? JSON.parse(value) as Record<string, unknown> : {};
      if (
        next.iosStorage === "private" &&
        (next.iosStorageMigration as { phase?: string } | undefined)?.phase === "cleanup"
      ) {
        throw new Error("injected atomic settings write failure");
      }
      originalSetItem(key, value);
    });

    const api = await loadApi();
    await expect(api.setSetting("iosStorage", "private")).rejects.toThrow(/storage preference/i);
    setItem.mockRestore();

    expect(await api.getSetting("iosStorage")).toBe("documents");
    expect(settings().iosStorage).toBe("documents");
    expect(settings().iosStorageMigration).toBeUndefined();
    expect(fs.notesIn(DIR.Documents)).toEqual({ a: "A", b: "B" });
    const relaunched = await loadApi();
    expect(await relaunched.getSetting("iosStorage")).toBe("documents");
    expect((await relaunched.listNotes()).map((note) => note.id).sort()).toEqual(["a", "b"]);
  });

  it("fills every missing metadata time from its source note mtime without replacing canonical times", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" });
    const bSourceTime = noteMtime(DIR.Documents, "b");
    fs.seed(DIR.Documents, "notes/.vault-meta.json", JSON.stringify({ times: { a: 42 }, tombstones: { gone: 9 } }));
    const api = await loadApi();
    await api.setSetting("iosStorage", "private");

    expect(fs.metaIn(DIR.LibraryNoCloud)).toEqual({
      times: { a: 42, b: bSourceTime },
      tombstones: { gone: 9 },
    });
    expect(Object.fromEntries((await api.listNotes()).map((note) => [note.id, note.updatedAt]))).toEqual({
      a: 42,
      b: bSourceTime,
    });
  });

  it("reconciles the target exactly: overwrites duplicates and removes target-only stale notes", async () => {
    seedLibrary(DIR.Documents, { a: "A-new", b: "B" }, META);
    seedLibrary(DIR.LibraryNoCloud, { a: "A-stale", stale: "should vanish" }, { times: { stale: 1 }, tombstones: {} });
    const api = await loadApi();
    await api.setSetting("iosStorage", "private");
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A-new", b: "B" });
    expect(fs.metaIn(DIR.LibraryNoCloud)).toEqual(META);
  });

  it("copy failure: rejects, keeps the old location active and the source intact; retry succeeds", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" }, META);
    const api = await loadApi();
    fs.failOn("writeFile", (d, p) => d === DIR.LibraryNoCloud && p === "notes/b.md");
    await expect(api.setSetting("iosStorage", "private")).rejects.toThrow(/copy/i);
    expect(await api.getSetting("iosStorage")).toBe("documents");
    expect(settings().iosStorage).toBe("documents");
    expect(settings().iosStorageMigration).toBeUndefined();
    expect(fs.notesIn(DIR.Documents)).toEqual({ a: "A", b: "B" });
    expect(fs.metaIn(DIR.Documents)).toEqual(META);
    expect((await api.listNotes()).map((n) => n.id).sort()).toEqual(["a", "b"]);
    // Retry converges (the partial target copy is reconciled).
    await api.setSetting("iosStorage", "private");
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A", b: "B" });
    expect(fs.notesIn(DIR.Documents)).toEqual({});
  });

  it("corrupt source metadata fails closed: nothing moves, old location stays active", async () => {
    seedLibrary(DIR.Documents, { a: "A" });
    fs.seed(DIR.Documents, "notes/.vault-meta.json", "{not json");
    const api = await loadApi();
    await expect(api.setSetting("iosStorage", "private")).rejects.toThrow(/Corrupt/);
    expect(await api.getSetting("iosStorage")).toBe("documents");
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({});
    expect(fs.notesIn(DIR.Documents)).toEqual({ a: "A" });
    // Editing still works (the CRUD path is lenient about the sidecar).
    expect((await api.listNotes()).map((n) => n.id)).toEqual(["a"]);
  });

  it("source-cleanup failure resolves on the target; a cleanup marker retries on next launch", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" }, META);
    const api = await loadApi();
    fs.failOn("deleteFile", (d, p) => d === DIR.Documents && p === "notes/b.md");
    await expect(api.setSetting("iosStorage", "private")).resolves.toBeUndefined();
    expect(await api.getSetting("iosStorage")).toBe("private");
    expect(settings().iosStorage).toBe("private");
    expect(settings().iosStorageMigration).toEqual({ from: "documents", to: "private", phase: "cleanup" });
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A", b: "B" });
    // Leftover in the old root is invisible (active-root-only reads)...
    expect(fs.notesIn(DIR.Documents)).toEqual({ b: "B" });
    expect((await api.listNotes()).map((n) => n.id).sort()).toEqual(["a", "b"]);
    // ...and a relaunch finishes the cleanup.
    const relaunched = await loadApi();
    expect(await relaunched.getSetting("iosStorage")).toBe("private");
    expect(fs.notesIn(DIR.Documents)).toEqual({});
    expect(settings().iosStorageMigration).toBeUndefined();
  });

  it("a cleanup that keeps failing on relaunch stays on the target and retains the marker without data loss", async () => {
    seedLibrary(DIR.Documents, { a: "A", b: "B" }, META);
    fs.failOn("deleteFile", (d, p) => d === DIR.Documents && p === "notes/b.md", false);
    const api = await loadApi();
    await api.setSetting("iosStorage", "private");
    const relaunched = await loadApi();
    expect(await relaunched.getSetting("iosStorage")).toBe("private");
    expect(settings().iosStorageMigration).toEqual({ from: "documents", to: "private", phase: "cleanup" });
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A", b: "B" });
    expect(fs.metaIn(DIR.LibraryNoCloud)).toEqual(META);
    expect((await relaunched.listNotes()).map((n) => [n.id, n.updatedAt]).sort()).toEqual([["a", 1], ["b", 2]]);
  });

  it("a cleanup marker that disagrees with the persisted preference never deletes the preference's root", async () => {
    seedLibrary(DIR.Documents, { b: "B", fresh: "written after the marker" });
    seedLibrary(DIR.LibraryNoCloud, { a: "A", b: "B" }, META);
    setSettings({ iosStorage: "documents", iosStorageMigration: { from: "documents", to: "private", phase: "cleanup" } });
    const api = await loadApi();
    expect(await api.getSetting("iosStorage")).toBe("documents");
    expect(settings().iosStorage).toBe("documents");
    expect(settings().iosStorageMigration).toBeUndefined();
    expect(fs.notesIn(DIR.Documents)).toEqual({ b: "B", fresh: "written after the marker" });
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A", b: "B" });
    expect((await api.listNotes()).map((n) => n.id).sort()).toEqual(["b", "fresh"]);
  });

  it("serializes concurrent writes with a migration: a write issued mid-switch lands in the new root", async () => {
    seedLibrary(DIR.Documents, { a: "A" }, META);
    const api = await loadApi();
    await api.listNotes(); // ensure initialized
    const switching = api.setSetting("iosStorage", "private");
    const write = api.writeNote({ id: "a", body: "edited during switch" });
    const create = api.createNote({ body: "new during switch" });
    await Promise.all([switching, write, create]);
    const priv = fs.notesIn(DIR.LibraryNoCloud);
    expect(priv.a).toBe("edited during switch");
    expect(Object.values(priv)).toContain("new during switch");
    expect(fs.notesIn(DIR.Documents)).toEqual({});
    expect((await api.listNotes()).map((n) => n.body).sort()).toEqual(["edited during switch", "new during switch"]);
  });

  it("repeat switch requests are serialized and idempotent", async () => {
    seedLibrary(DIR.Documents, { a: "A" }, META);
    const api = await loadApi();
    await Promise.all([api.setSetting("iosStorage", "private"), api.setSetting("iosStorage", "private")]);
    expect(await api.getSetting("iosStorage")).toBe("private");
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({ a: "A" });
    expect(fs.notesIn(DIR.Documents)).toEqual({});
    await api.setSetting("iosStorage", "documents");
    expect(fs.notesIn(DIR.Documents)).toEqual({ a: "A" });
    expect(fs.metaIn(DIR.Documents)).toEqual(META);
    expect(fs.notesIn(DIR.LibraryNoCloud)).toEqual({});
  });
});
