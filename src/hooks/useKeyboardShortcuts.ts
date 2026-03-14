import { useEffect } from "react";
import { useDocumentStore } from "../services/documentStore";
import { useThemeStore, type ThemeChoice } from "../services/themeStore";
import { useFileOperations } from "./useFileOperations";

const themes: ThemeChoice[] = ["light", "dark", "system"];

export function useKeyboardShortcuts() {
  const { openFile, saveFile, saveFileAs, newFile } = useFileOperations();
  const setViewMode = useDocumentStore((s) => s.setViewMode);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

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
          setViewMode("wysiwyg");
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
        case "mode-wysiwyg":
          setViewMode("wysiwyg");
          break;
        case "toggle-theme": {
          const idx = themes.indexOf(theme);
          const next = themes[(idx + 1) % themes.length];
          setTheme(next);
          window.appApi.setSetting?.("theme", next);
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
  }, [openFile, saveFile, saveFileAs, newFile, setViewMode, theme, setTheme]);
}
