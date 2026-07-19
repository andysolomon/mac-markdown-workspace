import { useEffect } from "react";
import { useDocumentStore } from "../services/documentStore";
import { useThemeStore } from "../services/themeStore";
import { useFileOperations } from "./useFileOperations";

export function useKeyboardShortcuts() {
  const { openFile, saveFile, saveFileAs, newFile } = useFileOperations();
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key) {
        case "s":
          e.preventDefault();
          if (e.shiftKey) {
            saveFileAs();
          } else {
            saveFile();
          }
          break;
        case "o":
          e.preventDefault();
          openFile();
          break;
        case "n":
          e.preventDefault();
          newFile();
          break;
        case "1":
          e.preventDefault();
          setViewMode("source");
          break;
        case "2":
          e.preventDefault();
          setViewMode("split");
          break;
        case "3":
          e.preventDefault();
          setViewMode("preview");
          break;
      }
    };

    const handleMenuAction = (e: Event) => {
      const action = (e as CustomEvent).detail;
      switch (action) {
        case "new-file":
          newFile();
          break;
        case "open-file":
          openFile();
          break;
        case "save-file":
          saveFile();
          break;
        case "save-file-as":
          saveFileAs();
          break;
        case "mode-source":
          setViewMode("source");
          break;
        case "mode-split":
          setViewMode("split");
          break;
        case "mode-preview":
          setViewMode("preview");
          break;
        case "toggle-theme": {
          cycleMode();
          window.appApi.setSetting?.("mode", useThemeStore.getState().mode);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("menu-action", handleMenuAction);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("menu-action", handleMenuAction);
    };
  }, [openFile, saveFile, saveFileAs, newFile, setViewMode, cycleMode]);
}
