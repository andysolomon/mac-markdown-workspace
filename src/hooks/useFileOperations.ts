import { useCallback } from "react";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";

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
  const resetDocument = useDocumentStore((s) => s.resetDocument);

  const openFile = useCallback(async () => {
    const canProceed = await checkDirtyAndProceed();
    if (!canProceed) return;

    const result = await window.appApi.openFile();
    if (!result) return;

    // Update all state at once to avoid partial renders
    useDocumentStore.setState({
      content: result.content,
      savedContent: result.content,
      filePath: result.filePath,
    });
  }, []);

  const saveFile = useCallback(async () => {
    const { content, filePath } = useDocumentStore.getState();
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
    resetDocument();
  }, [resetDocument]);

  return { openFile, saveFile, saveFileAs, newFile };
}
