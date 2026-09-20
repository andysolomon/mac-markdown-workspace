/**
 * Library change bus (docs/ambient-vault-sync.md, Part 3). notesStore emits
 * one event per USER-driven mutation that reached local storage — create,
 * update, delete — and the ambient sync loop listens to schedule a push.
 * Sync-driven writes (reloadLibrary after a pull) never emit: what they
 * wrote came from the vault, so pushing it back would be a loop.
 */

export interface LibraryChange {
  kind: "create" | "update" | "delete";
  id: string;
}

type Listener = (change: LibraryChange) => void;
const listeners = new Set<Listener>();

export function onLibraryChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLibraryChange(change: LibraryChange): void {
  for (const listener of listeners) listener(change);
}
