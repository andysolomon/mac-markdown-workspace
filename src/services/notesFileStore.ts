/**
 * Notes file store (issue #27) — MAIN-PROCESS ONLY. Node fs persistence for
 * the Electron notes library (`~/Documents/Mac Markdown/*.md` plus the hidden
 * `.vault-tombstones.json` sidecar).
 *
 * Guarantees:
 *  - Atomic same-directory replacement: content is written to a temp file
 *    next to the target, fsync'd, then renamed over it. An interruption
 *    leaves either the previous valid file or the new one — never a
 *    truncated note. Failed attempts remove their temp file.
 *  - Serialized writes: operations on the same note id (and on the tombstone
 *    sidecar) run one after another in submission order, so concurrent
 *    read-modify-write cycles can't clobber each other.
 *  - `updatedAt` semantics are preserved: a supplied timestamp is stamped via
 *    utimes (vault pulls), otherwise the file's mtime is "now".
 *
 * Limits after forced termination (SIGKILL / power loss): an edit that had
 * not yet been sent by the renderer, or a write still in progress, is lost;
 * the previously persisted note remains readable.
 *
 * Kept free of `electron` imports so it can be unit-tested on plain Node.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface RawNoteRecord {
  id: string;
  body: string;
  updatedAt: number;
}

export interface NotesFileHandle {
  writeFile: (data: string, encoding: "utf8") => Promise<void>;
  sync: () => Promise<void>;
  close: () => Promise<void>;
}

/** The slice of `fs.promises` the store uses; injectable for tests. */
export interface NotesFs {
  readFile: (p: string, encoding: "utf8") => Promise<string>;
  writeFile: (p: string, data: string, encoding: "utf8") => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (p: string) => Promise<void>;
  stat: (p: string) => Promise<{ mtimeMs: number }>;
  readdir: (p: string) => Promise<string[]>;
  mkdir: (p: string, opts: { recursive: true }) => Promise<unknown>;
  utimes: (p: string, atime: Date, mtime: Date) => Promise<void>;
  open?: (p: string, flags: string) => Promise<NotesFileHandle>;
}

export interface NotesFileStoreOptions {
  /** Resolved lazily so `app.getPath` can be consulted after ready. */
  dir: () => string;
  fs?: NotesFs;
  uuid?: () => string;
}

export interface NotesFileStore {
  listNotes: () => Promise<RawNoteRecord[]>;
  readNote: (id: string) => Promise<RawNoteRecord | null>;
  createNote: (body: string) => Promise<RawNoteRecord>;
  writeNote: (payload: { id: string; body: string; updatedAt?: number }) => Promise<RawNoteRecord>;
  deleteNote: (id: string) => Promise<void>;
  listTombstones: () => Promise<Array<{ id: string; deletedAt: number }>>;
  recordTombstone: (id: string, deletedAt: number) => Promise<void>;
  clearTombstones: (ids: string[]) => Promise<void>;
}

export const TOMBSTONES_FILE = ".vault-tombstones.json";
const TOMBSTONE_QUEUE_KEY = "\0tombstones";
const TEMP_SUFFIX = ".tmp";

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

/** Per-key FIFO: tasks with the same key never overlap. */
export function createSerialQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    tails.set(key, next);
    next
      .catch(() => undefined)
      .finally(() => {
        if (tails.get(key) === next) tails.delete(key);
      });
    return next;
  };
}

export function isTempArtifact(name: string): boolean {
  return name.endsWith(TEMP_SUFFIX);
}

/** Write `data` to `target` via a same-directory temp file + rename. */
export async function writeFileAtomic(
  fs: NotesFs,
  target: string,
  data: string,
  uuid: () => string = randomUUID,
): Promise<void> {
  const dir = path.dirname(target);
  const temp = path.join(dir, `.${path.basename(target)}.${uuid()}${TEMP_SUFFIX}`);
  try {
    if (fs.open) {
      const handle = await fs.open(temp, "wx");
      try {
        await handle.writeFile(data, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    } else {
      await fs.writeFile(temp, data, "utf8");
    }
    await fs.rename(temp, target);
  } catch (err) {
    await fs.unlink(temp).catch(() => undefined);
    throw err;
  }
  // Best effort: persist the directory entry too (not supported everywhere).
  if (fs.open) {
    try {
      const dirHandle = await fs.open(dir, "r");
      try {
        await dirHandle.sync();
      } finally {
        await dirHandle.close();
      }
    } catch {
      /* directory fsync unavailable on this platform/filesystem */
    }
  }
}

export function createNotesFileStore(options: NotesFileStoreOptions): NotesFileStore {
  const fs: NotesFs = options.fs ?? (nodeFs as unknown as NotesFs);
  const uuid = options.uuid ?? randomUUID;
  const enqueue = createSerialQueue();

  const dir = options.dir;
  const notePath = (id: string) => path.join(dir(), `${id}.md`);
  const tombstonesPath = () => path.join(dir(), TOMBSTONES_FILE);
  const ensureDir = () => fs.mkdir(dir(), { recursive: true });

  const readRaw = async (id: string): Promise<RawNoteRecord> => {
    const full = notePath(id);
    const [body, stat] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
    return { id, body, updatedAt: stat.mtimeMs };
  };

  const readTombstoneMap = async (): Promise<Record<string, number>> => {
    let raw: string;
    try {
      raw = await fs.readFile(tombstonesPath(), "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") return {};
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The tombstone sidecar is corrupt and cannot be used safely.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The tombstone sidecar has an invalid format.");
    }
    for (const [id, deletedAt] of Object.entries(parsed)) {
      if (!id || typeof deletedAt !== "number" || !Number.isFinite(deletedAt)) {
        throw new Error("The tombstone sidecar has an invalid entry.");
      }
    }
    return parsed as Record<string, number>;
  };

  const writeTombstoneMap = async (map: Record<string, number>) => {
    await ensureDir();
    await writeFileAtomic(fs, tombstonesPath(), JSON.stringify(map), uuid);
  };

  /** Serialized read-modify-write of the sidecar. */
  const mutateTombstones = (mutate: (map: Record<string, number>) => boolean) =>
    enqueue(TOMBSTONE_QUEUE_KEY, async () => {
      const map = await readTombstoneMap();
      if (mutate(map)) await writeTombstoneMap(map);
    });

  return {
    listNotes: async () => {
      await ensureDir();
      const entries = await fs.readdir(dir());
      const notes: RawNoteRecord[] = [];
      for (const name of entries) {
        if (!name.endsWith(".md") || isTempArtifact(name)) continue;
        try {
          notes.push(await readRaw(name.slice(0, -3)));
        } catch {
          /* skip unreadable files */
        }
      }
      return notes;
    },

    readNote: async (id) => {
      try {
        return await readRaw(id);
      } catch {
        return null;
      }
    },

    createNote: (body) => {
      const id = uuid();
      return enqueue(id, async () => {
        await ensureDir();
        await writeFileAtomic(fs, notePath(id), body ?? "", uuid);
        return readRaw(id);
      });
    },

    writeNote: ({ id, body, updatedAt }) =>
      enqueue(id, async () => {
        await ensureDir();
        const target = notePath(id);
        await writeFileAtomic(fs, target, body, uuid);
        // Preserve a vault-pulled note's canonical timestamp by stamping mtime
        // so listNotes reads it back; local edits keep "now".
        if (updatedAt !== undefined) {
          const when = new Date(updatedAt);
          await fs.utimes(target, when, when);
        }
        // A (re)written note must not keep a stale tombstone.
        await mutateTombstones((map) => {
          if (!(id in map)) return false;
          delete map[id];
          return true;
        });
        return readRaw(id);
      }),

    deleteNote: (id) =>
      enqueue(id, async () => {
        try {
          await fs.unlink(notePath(id));
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
        }
      }),

    listTombstones: () =>
      enqueue(TOMBSTONE_QUEUE_KEY, async () =>
        Object.entries(await readTombstoneMap()).map(([id, deletedAt]) => ({ id, deletedAt })),
      ),

    recordTombstone: (id, deletedAt) =>
      mutateTombstones((map) => {
        map[id] = deletedAt;
        return true;
      }),

    clearTombstones: (ids) =>
      mutateTombstones((map) => {
        let changed = false;
        for (const id of ids) {
          if (id in map) {
            delete map[id];
            changed = true;
          }
        }
        return changed;
      }),
  };
}
