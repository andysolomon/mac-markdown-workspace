import { useCallback } from "react";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";
import { useNotesStore } from "../services/notesStore";
import { showToast } from "../services/toast";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function markCleanIfCurrent(noteId: string | null, body: string): void {
  const note = useNotesStore.getState();
  const document = useDocumentStore.getState();
  if (note.activeNoteId === noteId && document.content === body) {
    document.markClean();
  }
}

/** Shared by File > Open and host open-file imports (issue #25). */
export async function confirmDiscardIfDirty(): Promise<boolean> {
  return checkDirtyAndProceed();
}

async function checkDirtyAndProceed(): Promise<boolean> {
  const state = useDocumentStore.getState();
  if (!selectIsDirty(state)) return true;

  try {
    const result = await window.appApi.confirmDiscard();
    if (result === "cancel") return false;
    if (result === "discard") {
      useDocumentStore.getState().markClean();
      return true;
    }
    if (result !== "save") return false;

    const { content, filePath } = useDocumentStore.getState();
    const { activeNoteId } = useNotesStore.getState();
    if (activeNoteId) {
      await useNotesStore.getState().updateNote(activeNoteId, content);
      markCleanIfCurrent(activeNoteId, content);
      return true;
    }

    if (filePath) {
      await window.appApi.saveFile({ filePath, content });
    } else {
      const saved = await window.appApi.saveFileAs({ content, defaultPath: "document.md" });
      if (!saved) return false;
      useDocumentStore.getState().setFilePath(saved.filePath);
    }
    const current = useDocumentStore.getState();
    if (current.content === content) current.markClean();
    return true;
  } catch (error) {
    showToast(`Couldn't save: ${errorMessage(error)}`);
    return false;
  }
}

export function useFileOperations() {

  const openFile = useCallback(async () => {
    const canProceed = await checkDirtyAndProceed();
    if (!canProceed) return;

    const result = await window.appApi.openFile();
    if (!result) return;

    // Import the file into the notes library as a new note (the library is
    // the source of truth; creating selects it, and the shell syncs the
    // editing buffer from the selection).
    await useNotesStore.getState().createNote(result.content);
  }, []);

  const saveFile = useCallback(async () => {
    const { content, filePath } = useDocumentStore.getState();

    try {
      // Library-first: Save flushes the buffer into the active note — no file
      // dialog (issue #4 / W-000004). Export is the path to a file on disk.
      const { activeNoteId } = useNotesStore.getState();
      if (activeNoteId) {
        await useNotesStore.getState().updateNote(activeNoteId, content);
        markCleanIfCurrent(activeNoteId, content);
        return;
      }

      // Legacy fallback when no note is active (shouldn't happen in the shell).
      if (!filePath) {
        const saved = await window.appApi.saveFileAs({
          content,
          defaultPath: "document.md",
        });
        if (saved) {
          const current = useDocumentStore.getState();
          useDocumentStore.setState({ filePath: saved.filePath });
          if (current.content === content) useDocumentStore.getState().markClean();
        }
        return;
      }
      await window.appApi.saveFile({ filePath, content });
      if (useDocumentStore.getState().content === content) {
        useDocumentStore.getState().markClean();
      }
    } catch (error) {
      showToast(`Couldn't save: ${errorMessage(error)}`);
    }
  }, []);

  const saveFileAs = useCallback(async () => {
    const { content, filePath } = useDocumentStore.getState();
    try {
      const saved = await window.appApi.saveFileAs({
        content,
        defaultPath: filePath || "document.md",
      });
      if (saved) {
        useDocumentStore.setState({ filePath: saved.filePath });
        if (useDocumentStore.getState().content === content) {
          useDocumentStore.getState().markClean();
        }
      }
    } catch (error) {
      showToast(`Couldn't save: ${errorMessage(error)}`);
    }
  }, []);

  const newFile = useCallback(async () => {
    const canProceed = await checkDirtyAndProceed();
    if (!canProceed) return;
    // A "new file" is a new note in the library. Resetting the buffer alone
    // would autosave an empty body over the active note.
    await useNotesStore.getState().createNote("");
  }, []);

  return { openFile, saveFile, saveFileAs, newFile };
}
