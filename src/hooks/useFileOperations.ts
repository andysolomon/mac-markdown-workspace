import { useCallback } from "react";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";
import { useNotesStore } from "../services/notesStore";

async function checkDirtyAndProceed(): Promise<boolean> {
  const state = useDocumentStore.getState();
  const isDirty = selectIsDirty(state);
  if (!isDirty) return true;

  try {
    const result = await window.appApi.confirmDiscard();
    if (result === "cancel") return false;
    if (result === "save") {
      const { content, filePath } = state;
      if (filePath) {
        await window.appApi.saveFile({ filePath, content });
      } else {
        const saved = await window.appApi.saveFileAs({ content, defaultPath: "document.md" });
        if (!saved) return false;
        useDocumentStore.getState().setFilePath(saved.filePath);
      }
      useDocumentStore.getState().markClean();
    }
  } catch {
    // If dialog fails (e.g. no focused window), proceed anyway
    return true;
  }
  return true;
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

    // Library-first: Save flushes the buffer into the active note — no file
    // dialog (issue #4 / W-000004). Export is the path to a file on disk.
    const { activeNoteId } = useNotesStore.getState();
    if (activeNoteId) {
      await useNotesStore.getState().updateActiveNote(content);
      useDocumentStore.getState().markClean();
      return;
    }

    // Legacy fallback when no note is active (shouldn't happen in the shell).
    if (!filePath) {
      const saved = await window.appApi.saveFileAs({
        content,
        defaultPath: "document.md",
      });
      if (saved) {
        useDocumentStore.setState({ filePath: saved.filePath });
        useDocumentStore.getState().markClean();
      }
      return;
    }
    await window.appApi.saveFile({ filePath, content });
    useDocumentStore.getState().markClean();
  }, []);

  const saveFileAs = useCallback(async () => {
    const { content, filePath } = useDocumentStore.getState();
    const saved = await window.appApi.saveFileAs({
      content,
      defaultPath: filePath || "document.md",
    });
    if (saved) {
      useDocumentStore.setState({ filePath: saved.filePath });
      useDocumentStore.getState().markClean();
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
