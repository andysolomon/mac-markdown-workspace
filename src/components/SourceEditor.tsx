import React, { useCallback, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import { useDocumentStore } from "../services/documentStore";
import { macMarkdownEditorTheme } from "../services/markdownEditorTheme";
import { registerEditorView } from "../services/editorBridge";

export const SourceEditor = React.memo(function SourceEditor() {
  const content = useDocumentStore((s) => s.content);
  const setContent = useDocumentStore((s) => s.setContent);
  const setCursorPosition = useDocumentStore((s) => s.setCursorPosition);

  const onChange = useCallback(
    (value: string) => {
      setContent(value);
    },
    [setContent],
  );

  // Expose the live view so the markdown keyboard accessory can insert at
  // the cursor (src/services/editorBridge.ts).
  const onCreateEditor = useCallback((view: EditorView) => {
    registerEditorView(view);
  }, []);

  useEffect(() => () => registerEditorView(null), []);

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

  // The structure-colored theme styles via CSS custom properties, so palette
  // and light/dark switches restyle live — the extension never rebuilds.
  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, macMarkdownEditorTheme],
    [],
  );

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      onUpdate={onUpdate}
      onCreateEditor={onCreateEditor}
      extensions={extensions}
      theme="none"
      basicSetup={{
        // Distraction-free editing surface — no gutters (design system).
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        highlightActiveLine: false,
        bracketMatching: true,
      }}
      style={{ height: "100%", overflow: "auto" }}
    />
  );
});
