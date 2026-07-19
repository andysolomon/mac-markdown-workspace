import { create } from "zustand";

export type ViewMode = "source" | "split" | "preview";

interface CursorPosition {
  line: number;
  col: number;
}

interface DocumentState {
  content: string;
  savedContent: string;
  filePath: string;
  viewMode: ViewMode;
  cursorPosition: CursorPosition;
}

interface DocumentActions {
  setContent: (content: string) => void;
  setFilePath: (filePath: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setCursorPosition: (pos: CursorPosition) => void;
  markClean: () => void;
  resetDocument: () => void;
}

export type DocumentStore = DocumentState & DocumentActions;

const initialContent = `# Mac Markdown Workspace

This is the Bun-first scaffold for your Electron + React app.

- Source editing
- Split preview
- Local file open/save

\`\`\`mermaid
graph TD
  A[Draft] --> B[Review]
\`\`\`

Inline math: $E = mc^2$`;

export const useDocumentStore = create<DocumentStore>((set) => ({
  content: initialContent,
  savedContent: initialContent,
  filePath: "",
  viewMode: "source",
  cursorPosition: { line: 1, col: 1 },

  setContent: (content) => set({ content }),
  setFilePath: (filePath) => set({ filePath }),
  setViewMode: (viewMode) => set({ viewMode }),
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  markClean: () => set((state) => ({ savedContent: state.content })),
  resetDocument: () =>
    set({
      content: "",
      savedContent: "",
      filePath: "",
      cursorPosition: { line: 1, col: 1 },
    }),
}));

export const selectIsDirty = (state: DocumentStore) =>
  state.content !== state.savedContent;
