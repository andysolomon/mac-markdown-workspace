import React, { useMemo } from "react";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";

export const StatusBar = React.memo(function StatusBar() {
  const content = useDocumentStore((s) => s.content);
  const viewMode = useDocumentStore((s) => s.viewMode);
  const cursorPosition = useDocumentStore((s) => s.cursorPosition);
  const isDirty = useDocumentStore(selectIsDirty);

  const wordCount = useMemo(() => {
    const words = content.trim().match(/\S+/g);
    return words ? words.length : 0;
  }, [content]);

  const charCount = content.length;
  const lineCount = content.split("\n").length;

  return (
    <footer className="status-bar">
      <span>
        {isDirty ? "Modified" : "Saved"} | Words: {wordCount} | Chars: {charCount} | Lines: {lineCount}
      </span>
      <span>
        Ln {cursorPosition.line}, Col {cursorPosition.col} | {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
      </span>
    </footer>
  );
});
