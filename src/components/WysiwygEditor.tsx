import React, { useRef, useCallback } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
// eslint-disable-next-line import/no-unresolved -- package exports subpath
import { codeBlockComponent, codeBlockConfig } from "@milkdown/components/code-block";
import { $remark } from "@milkdown/utils";
import { useDocumentStore } from "../services/documentStore";
import { languages } from "../services/codeLanguages";
import { macMarkdownSyntaxHighlighting } from "../services/markdownEditorTheme";
import { remarkSplitOrderedListRestarts } from "../services/remarkSplitOrderedListRestarts";
import { WysiwygToolbar } from "./WysiwygToolbar";
// eslint-disable-next-line import/no-unresolved
import "@milkdown/theme-nord/style.css";

/** Split blank-line `1.` restarts before Milkdown assigns list labels. */
const remarkSplitOrderedListRestartsPlugin = $remark(
  "remarkSplitOrderedListRestarts",
  () => remarkSplitOrderedListRestarts,
);

function MilkdownEditorInner() {
  const initialContent = useRef(useDocumentStore.getState().content);
  const setContent = useDocumentStore((s) => s.setContent);

  const editorCallback = useCallback(
    (root: HTMLElement) => {
      return Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialContent.current);
          ctx.update(codeBlockConfig.key, (defaultConfig) => ({
            ...defaultConfig,
            // Cast: language-data may resolve a nested @codemirror/language
            // copy at typecheck time; Vite dedupes to one instance at runtime.
            languages: languages as unknown as typeof defaultConfig.languages,
            extensions: [macMarkdownSyntaxHighlighting],
          }));
          const l = ctx.get(listenerCtx);
          l.markdownUpdated((_ctx, markdown) => {
            setContent(markdown);
          });
        })
        .use(remarkSplitOrderedListRestartsPlugin)
        .use(commonmark)
        .use(codeBlockComponent)
        .use(listener);
    },
    [setContent],
  );

  useEditor(editorCallback);

  return (
    <div className="wysiwyg-container">
      <WysiwygToolbar />
      <div className="wysiwyg-body">
        <Milkdown />
      </div>
    </div>
  );
}

export const WysiwygEditor = React.memo(function WysiwygEditor() {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner />
    </MilkdownProvider>
  );
});
