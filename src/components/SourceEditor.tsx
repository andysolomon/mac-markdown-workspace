import React, { useCallback, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { indentMore, indentLess } from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { useDocumentStore } from "../services/documentStore";
import { defaultCodeLanguage, resolveCodeLanguage } from "../services/codeLanguages";
import { macMarkdownEditorTheme } from "../services/markdownEditorTheme";
import { registerEditorView } from "../services/editorBridge";
import { LIST_INDENT_UNIT } from "../services/listIndent";
import { applyListIndentCommand } from "../services/listIndentCommands";

const listTabKeymap = Prec.high(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        if (applyListIndentCommand(view, "indent")) return true;
        return indentMore(view);
      },
      shift: (view) => {
        if (applyListIndentCommand(view, "outdent")) return true;
        return indentLess(view);
      },
    },
  ]),
);

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
  // indentUnit is set explicitly after markdown() so a nested
  // @codemirror/language copy cannot leave Tab at the 2-space default.
  const extensions = useMemo(
    () => [
      markdown({
        defaultCodeLanguage,
        codeLanguages: resolveCodeLanguage,
      }),
      indentUnit.of(LIST_INDENT_UNIT),
      listTabKeymap,
      EditorView.lineWrapping,
      macMarkdownEditorTheme,
    ],
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
      indentWithTab={false}
      basicSetup={{
        // Distraction-free editing surface — no gutters (design system).
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        highlightActiveLine: false,
        bracketMatching: true,
        tabSize: 4,
      }}
      style={{ height: "100%", overflow: "auto" }}
    />
  );
});
