import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import type { NoteTombstone } from "../../shared/types/ipc";
import type { RawNote } from "../services/notesModel";

/**
 * iOS notes-library storage (issue #8 / W-000008).
 *
 * Owns the storage-location preference, the mapping from preference to a
 * physical Capacitor directory, legacy-value normalization, and the
 * copy → verify → activate → clean-up migration that runs when the user
 * changes the location. Every notes-library operation in the Capacitor shim
 * funnels through `runExclusive` so migration can never interleave with a
 * note write, a scaffold, or a Cloud Sync pull.
 *
 * Roots (Capacitor Filesystem 8):
 *   documents -> Directory.Documents      (sandbox Documents/notes; backed up,
 *                                          Files-visible once the plist keys
 *                                          in docs/ios-icloud.md are set)
 *   private   -> Directory.LibraryNoCloud (Library/NoCloud/notes; app-private,
 *                                          excluded from cloud backup)
 *
 * Directory.Data is deliberately NOT used for notes or metadata: on iOS the
 * plugin maps it to the same Documents directory, which is exactly the defect
 * that made the first "device" option a no-op.
 */

// The canonical type + guard live in the platform-agnostic settings store so
// components never import this Capacitor-bound module.
import { DEFAULT_IOS_STORAGE, isIosStorage, type IosStorage } from "../services/settingsStore";
export { DEFAULT_IOS_STORAGE, isIosStorage, type IosStorage };

/** Settings key for the canonical preference (shared with the UI store). */
export const IOS_STORAGE_KEY = "iosStorage";
/** Settings key for the in-flight migration marker (recovery on relaunch). */
export const IOS_STORAGE_MIGRATION_KEY = "iosStorageMigration";

export const NOTES_DIR = "notes";
export const META_PATH = `${NOTES_DIR}/.vault-meta.json`;
export const notePath = (id: string) => `${NOTES_DIR}/${id}.md`;

export interface VaultMeta {
  times: Record<string, number>;
  tombstones: Record<string, number>;
}

/** A complete, point-in-time picture of one root's notes library. */
export interface LibrarySnapshot {
  notes: RawNote[];
  meta: VaultMeta;
  /** Whether `.vault-meta.json` physically existed (vs synthesized empty). */
  hasMeta: boolean;
}

export class StorageMigrationError extends Error {
  constructor(
    message: string,
    public readonly stage: "snapshot" | "copy" | "verify" | "activate" | "cleanup",
    cause?: unknown,
  ) {
    super(message);
    this.name = "StorageMigrationError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Preference normalization
// ---------------------------------------------------------------------------

export function directoryFor(storage: IosStorage): Directory {
  return storage === "private" ? Directory.LibraryNoCloud : Directory.Documents;
}

export function otherStorage(storage: IosStorage): IosStorage {
  return storage === "private" ? "documents" : "private";
}

/**
 * Resolve whatever was persisted (possibly by the pre-W-000008 build) into a
 * canonical value plus whether a legacy upgrade migration is owed.
 *
 *  - "documents" | "private": canonical, no work.
 *  - "icloud" (legacy): the old default; data lived in Documents -> documents.
 *  - "device" (legacy): the user asked for private storage but the old code
 *    wrote to Directory.Data, which IS Documents on iOS. Honour the intent by
 *    migrating Documents -> LibraryNoCloud on first launch of this build.
 *  - anything else: default.
 */
export function normalizeStoredPreference(raw: unknown): {
  storage: IosStorage;
  legacyUpgrade: "device" | null;
} {
  if (isIosStorage(raw)) return { storage: raw, legacyUpgrade: null };
  if (raw === "icloud") return { storage: "documents", legacyUpgrade: null };
  if (raw === "device") return { storage: "documents", legacyUpgrade: "device" };
  return { storage: DEFAULT_IOS_STORAGE, legacyUpgrade: null };
}

// ---------------------------------------------------------------------------
// Explicit-directory filesystem helpers (never read mutable global state)
// ---------------------------------------------------------------------------

function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /not exist|not found|no such file|ENOENT|does not exist/i.test(msg);
}

export async function readNoteFrom(directory: Directory, id: string): Promise<RawNote> {
  const [read, stat] = await Promise.all([
    Filesystem.readFile({ path: notePath(id), directory, encoding: Encoding.UTF8 }),
    Filesystem.stat({ path: notePath(id), directory }),
  ]);
  return { id, body: read.data as string, updatedAt: stat.mtime };
}

export async function writeNoteTo(directory: Directory, id: string, body: string): Promise<void> {
  await Filesystem.writeFile({
    path: notePath(id),
    data: body,
    directory,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/** Delete a note file; missing is not an error. */
export async function deleteNoteFrom(directory: Directory, id: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: notePath(id), directory });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/** Ids of every `*.md` note file in a root's notes directory ([] if absent). */
export async function listNoteIds(directory: Directory): Promise<string[]> {
  try {
    const res = await Filesystem.readdir({ path: NOTES_DIR, directory });
    return res.files
      .map((entry) => (typeof entry === "string" ? entry : entry.name))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3));
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/**
 * Read `.vault-meta.json` from a root. Returns `null` when the file is
 * missing; throws when it exists but is corrupt. Callers on the CRUD path
 * treat both as empty (so a bad sidecar can't brick note editing), but
 * migration MUST distinguish them — silently treating a corrupt sidecar as
 * empty would drop every canonical timestamp and tombstone.
 */
export async function readMetaFrom(directory: Directory): Promise<VaultMeta | null> {
  let text: string;
  try {
    const res = await Filesystem.readFile({ path: META_PATH, directory, encoding: Encoding.UTF8 });
    text = res.data as string;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  return parseMeta(text);
}

export function parseMeta(text: string): VaultMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Corrupt .vault-meta.json: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Corrupt .vault-meta.json: not an object");
  }
  const obj = parsed as Partial<Record<keyof VaultMeta, unknown>>;
  const pick = (v: unknown, name: string): Record<string, number> => {
    if (v === undefined) return {};
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      throw new Error(`Corrupt .vault-meta.json: ${name} is not an object`);
    }
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n !== "number" || !Number.isFinite(n)) {
        throw new Error(`Corrupt .vault-meta.json: ${name}.${k} is not a number`);
      }
      out[k] = n;
    }
    return out;
  };
  return { times: pick(obj.times, "times"), tombstones: pick(obj.tombstones, "tombstones") };
}

/** Lenient read for the CRUD path: missing or corrupt -> empty. */
export async function readMetaLenient(directory: Directory): Promise<VaultMeta> {
  try {
    return (await readMetaFrom(directory)) ?? { times: {}, tombstones: {} };
  } catch {
    return { times: {}, tombstones: {} };
  }
}

export async function writeMetaTo(directory: Directory, meta: VaultMeta): Promise<void> {
  await Filesystem.writeFile({
    path: META_PATH,
    data: JSON.stringify(meta),
    directory,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

async function deleteMetaFrom(directory: Directory): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: META_PATH, directory });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/** Full library read of one root. Strict: corrupt metadata throws. */
export async function snapshotLibrary(directory: Directory): Promise<LibrarySnapshot> {
  const ids = await listNoteIds(directory);
  const notes: RawNote[] = [];
  for (const id of ids) notes.push(await readNoteFrom(directory, id));
  const meta = await readMetaFrom(directory);
  const completeMeta: VaultMeta = meta
    ? { times: { ...meta.times }, tombstones: { ...meta.tombstones } }
    : { times: {}, tombstones: {} };
  // A missing sidecar, or a sidecar with only some note ids, means the file
  // mtime is still that note's logical updatedAt. Materialize every fallback
  // before copying: target writes receive new mtimes and cannot reconstruct it.
  for (const note of notes) {
    if (completeMeta.times[note.id] === undefined) completeMeta.times[note.id] = note.updatedAt;
  }
  return {
    notes,
    meta: completeMeta,
    hasMeta: meta !== null,
  };
}

/** Notes of a root with canonical `times` overlaid (mtime is the fallback). */
export async function listNotesIn(directory: Directory): Promise<RawNote[]> {
  const ids = await listNoteIds(directory);
  const notes: RawNote[] = [];
  for (const id of ids) {
    try {
      notes.push(await readNoteFrom(directory, id));
    } catch {
      /* skip an unreadable file rather than fail the whole list */
    }
  }
  const { times } = await readMetaLenient(directory);
  for (const note of notes) {
    const canonical = times[note.id];
    if (canonical !== undefined) note.updatedAt = canonical;
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/** Persisted marker describing an in-flight migration so relaunch can finish it. */
export interface MigrationMarker {
  from: IosStorage;
  to: IosStorage;
  /** "copy": target not yet verified/activated — the source is still authoritative.
      "cleanup": activated; only the source copy remains to be removed. */
  phase: "copy" | "cleanup";
}

export function isMigrationMarker(value: unknown): value is MigrationMarker {
  if (value === null || typeof value !== "object") return false;
  const m = value as Partial<MigrationMarker>;
  return (
    isIosStorage(m.from) &&
    isIosStorage(m.to) &&
    m.from !== m.to &&
    (m.phase === "copy" || m.phase === "cleanup")
  );
}

/** Persistence seam: the shim supplies settings get/set (localStorage today). */
export interface PreferenceStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Persist several keys in one backing-store transaction. */
  setMany(values: Record<string, unknown>): void;
  remove(key: string): void;
}

function sameMeta(a: VaultMeta, b: VaultMeta): boolean {
  return (
    JSON.stringify(sortRecord(a.times)) === JSON.stringify(sortRecord(b.times)) &&
    JSON.stringify(sortRecord(a.tombstones)) === JSON.stringify(sortRecord(b.tombstones))
  );
}

function sortRecord(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Reconcile `target` to exactly `snapshot`: overwrite matching ids, write
 * source-only ids, delete target-only stale files, and write metadata.
 * Then read the target back and verify ids, bodies, and metadata. Throws a
 * StorageMigrationError; never touches the source.
 */
export async function copyAndVerify(
  snapshot: LibrarySnapshot,
  target: Directory,
): Promise<void> {
  let existingIds: string[];
  try {
    existingIds = await listNoteIds(target);
  } catch (err) {
    throw new StorageMigrationError("Could not read the destination library", "copy", err);
  }
  const wanted = new Set(snapshot.notes.map((n) => n.id));

  try {
    for (const stale of existingIds) {
      if (!wanted.has(stale)) await deleteNoteFrom(target, stale);
    }
    for (const note of snapshot.notes) await writeNoteTo(target, note.id, note.body);
    if (snapshot.hasMeta || snapshot.notes.length > 0) {
      await writeMetaTo(target, snapshot.meta);
    } else {
      await deleteMetaFrom(target);
    }
  } catch (err) {
    throw new StorageMigrationError("Could not copy notes to the new location", "copy", err);
  }

  let readback: LibrarySnapshot;
  try {
    readback = await snapshotLibrary(target);
  } catch (err) {
    throw new StorageMigrationError("Could not read back the copied notes", "verify", err);
  }
  const byId = new Map(readback.notes.map((n) => [n.id, n.body]));
  if (byId.size !== snapshot.notes.length) {
    throw new StorageMigrationError(
      `Verification failed: expected ${snapshot.notes.length} notes, found ${byId.size}`,
      "verify",
    );
  }
  for (const note of snapshot.notes) {
    if (byId.get(note.id) !== note.body) {
      throw new StorageMigrationError(`Verification failed: note ${note.id} differs`, "verify");
    }
  }
  const expectMeta = snapshot.hasMeta || snapshot.notes.length > 0;
  if (expectMeta && !sameMeta(readback.meta, snapshot.meta)) {
    throw new StorageMigrationError("Verification failed: metadata differs", "verify");
  }
}

/** Remove every note file and the metadata sidecar from a root. */
export async function clearLibrary(directory: Directory): Promise<void> {
  const ids = await listNoteIds(directory);
  for (const id of ids) await deleteNoteFrom(directory, id);
  await deleteMetaFrom(directory);
}

// ---------------------------------------------------------------------------
// The storage controller: one per app, serializes everything.
// ---------------------------------------------------------------------------

export interface NotesStorageController {
  /** Resolves once legacy normalization + any interrupted migration finished. */
  ready(): Promise<void>;
  /** Active canonical preference (after `ready()`). */
  current(): Promise<IosStorage>;
  /** Active physical root (after `ready()`). */
  activeDirectory(): Promise<Directory>;
  /** Run `fn` with the active root, serialized against migration and other ops. */
  withActive<T>(fn: (directory: Directory) => Promise<T>): Promise<T>;
  /** Switch location: copy → verify → persist → clean up. Serialized. */
  setStorage(next: IosStorage): Promise<IosStorage>;
}

export function createNotesStorageController(prefs: PreferenceStore): NotesStorageController {
  // A promise chain acts as an async mutex: every operation appends itself.
  let chain: Promise<unknown> = Promise.resolve();
  const runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  let active: IosStorage = DEFAULT_IOS_STORAGE;
  let initialized: Promise<void> | null = null;

  /** Persist the marker before any destructive step so relaunch can resume. */
  const setMarker = (marker: MigrationMarker | null) => {
    if (marker) prefs.set(IOS_STORAGE_MIGRATION_KEY, marker);
    else prefs.remove(IOS_STORAGE_MIGRATION_KEY);
  };

  /**
   * The core transition. `from` is authoritative until activation; `to` is
   * reconciled to it. Idempotent: rerunning after any interruption converges.
   */
  const migrate = async (from: IosStorage, to: IosStorage): Promise<void> => {
    const source = directoryFor(from);
    const target = directoryFor(to);

    setMarker({ from, to, phase: "copy" });

    let snapshot: LibrarySnapshot;
    try {
      snapshot = await snapshotLibrary(source);
    } catch (err) {
      setMarker(null); // nothing changed yet; the old preference stands
      throw new StorageMigrationError(
        "Could not read the current notes library" +
          (err instanceof Error && /Corrupt/.test(err.message) ? ` (${err.message})` : ""),
        "snapshot",
        err,
      );
    }

    try {
      await copyAndVerify(snapshot, target);
    } catch (err) {
      // Target may hold a partial copy, but it is inactive and will be
      // reconciled on retry; the source is untouched. Drop the marker so a
      // relaunch does not attempt an unrequested migration.
      setMarker(null);
      throw err;
    }

    // Activation: the preference and cleanup marker land in the same settings
    // blob write. There is no durable state where the target is selected but a
    // relaunch has no record that source cleanup remains.
    try {
      prefs.setMany({
        [IOS_STORAGE_KEY]: to,
        [IOS_STORAGE_MIGRATION_KEY]: { from, to, phase: "cleanup" } satisfies MigrationMarker,
      });
    } catch (err) {
      // Activation did not land, so the source stays authoritative. Clearing
      // the copy marker is best-effort; if persistence is still unavailable,
      // copy-phase recovery also keeps the source active on relaunch.
      try {
        setMarker(null);
      } catch {
        /* retain the safe copy marker */
      }
      throw new StorageMigrationError("Could not save the storage preference", "activate", err);
    }
    active = to;

    // Source cleanup happens last and is best-effort. Once activation commits,
    // callers must resolve on the target; rejecting here would make Settings
    // display the old choice even though notes already use the new root. The
    // retained marker makes a relaunch retry partial cleanup safely.
    try {
      await clearLibrary(source);
      setMarker(null);
    } catch {
      /* keep the cleanup marker and the target active */
    }
  };

  const initialize = async (): Promise<void> => {
    const marker = prefs.get(IOS_STORAGE_MIGRATION_KEY);
    const { storage, legacyUpgrade } = normalizeStoredPreference(prefs.get(IOS_STORAGE_KEY));
    active = storage;

    if (isMigrationMarker(marker)) {
      if (marker.phase === "cleanup" && storage === marker.to) {
        // Activated before the interruption (preference and marker were
        // committed in one write): finish removing the source.
        active = marker.to;
        try {
          await clearLibrary(directoryFor(marker.from));
          setMarker(null);
        } catch {
          /* keep the marker; retry on the next launch */
        }
        return;
      }
      // Either activation never committed (copy phase — the source is still
      // complete), or a cleanup marker disagrees with the persisted preference.
      // In both cases the persisted preference's root is authoritative: it may
      // hold writes made after the marker was left behind, so a stale marker
      // must never delete it. Discard the marker, delete nothing, and continue
      // normal initialization (which retries an unfinished legacy upgrade).
      try {
        setMarker(null);
      } catch {
        /* a stale marker is harmless: it can no longer delete anything */
      }
    }

    if (legacyUpgrade === "device") {
      // Old "device" data physically lives in Documents. Honour the intent.
      try {
        await migrate("documents", "private");
      } catch {
        // `migrate` resolves after activation even when cleanup is incomplete.
        // Keep this guard so no future post-activation failure can reset the
        // controller to a source that may already have been partially deleted.
        if (active === "private") return;
        // Fall back to documents (where the data actually is) and persist
        // the canonical value so the UI reflects reality; the user can
        // retry the switch from Settings.
        active = "documents";
        prefs.set(IOS_STORAGE_KEY, "documents");
      }
      return;
    }

    // Canonicalize legacy "icloud"/unknown values so the next read is clean.
    if (prefs.get(IOS_STORAGE_KEY) !== storage) prefs.set(IOS_STORAGE_KEY, storage);
  };

  const ready = (): Promise<void> => {
    if (!initialized) initialized = runExclusive(initialize);
    return initialized;
  };

  return {
    ready,
    current: async () => {
      await ready();
      return active;
    },
    activeDirectory: async () => {
      await ready();
      return directoryFor(active);
    },
    withActive: async (fn) => {
      await ready();
      return runExclusive(() => fn(directoryFor(active)));
    },
    setStorage: async (next) => {
      await ready();
      return runExclusive(async () => {
        if (next === active) return active;
        await migrate(active, next);
        return active;
      });
    },
  };
}

/** Convert metadata tombstones to the AppApi shape. */
export function tombstonesOf(meta: VaultMeta): NoteTombstone[] {
  return Object.entries(meta.tombstones).map(([id, deletedAt]) => ({ id, deletedAt }));
}
