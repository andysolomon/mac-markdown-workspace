import type { LocalNotesPort } from "./vaultSync";

/**
 * Bridges the vault sync engine's LocalNotesPort onto whichever platform shim
 * is bound to window.appApi (issue #21). The engine drives local CRUD through
 * this port; the three shims (web IndexedDB, iOS Capacitor FS, Electron fs)
 * each satisfy the same contract — verbatim updatedAt on writeNote and real
 * tombstone persistence, added in the Phase C data-model backbone.
 *
 * Note: port.deleteNote is a pure hard-delete (the engine calls it to apply a
 * REMOTE deletion locally). A USER-initiated delete goes through
 * notesStore.deleteNote, which additionally records a tombstone so the
 * deletion propagates outward.
 */
export function createLocalNotesPort(): LocalNotesPort {
  const api = window.appApi;
  return {
    listNotes: () => api.listNotes(),
    writeNote: ({ id, body, updatedAt }) => api.writeNote({ id, body, updatedAt }),
    deleteNote: ({ id }) => api.deleteNote({ id }),
    listTombstones: () => api.listTombstones(),
    clearTombstones: (ids) => api.clearTombstones({ ids }),
  };
}
