import React, { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import type { ViewUpdate } from "@codemirror/view";
import { useDocumentStore } from "../services/documentStore";
import { useThemeStore } from "../services/themeStore";

export const SourceEditor = React.memo(function SourceEditor() {
  const content = useDocumentStore((s) => s.content);
  const setContent = useDocumentStore((s) => s.setContent);
  const setCursorPosition = useDocumentStore((s) => s.setCursorPosition);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const onChange = useCallback(
    (value: string) => {
      setContent(value);
    },
    [setContent],
  );

  const onUpdate = useCallback(
    (viewUpdate: ViewUpdate) => {
      if (viewUpdate.selectionSet) {
        const pos = viewUpdate.state.selection.main.head;
        const line = viewUpdate.state.doc.lineAt(pos);
        setCursorPosition({
          line: line.number,
          col: pos - line.from + 1,
        });
      }
    },
    [setCursorPosition],
  );

  const extensions = useMemo(() => {
    const exts = [markdown(), EditorView.lineWrapping];
    if (resolvedTheme === "dark") {
      exts.push(oneDark);
    }
    return exts;
  }, [resolvedTheme]);

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      onUpdate={onUpdate}
      extensions={extensions}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      basicSetup={{
        lineNumbers: true,
        bracketMatching: true,
        foldGutter: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
      }}
      style={{ height: "100%", overflow: "auto" }}
    />
  );
});
