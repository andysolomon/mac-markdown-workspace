import React, { useRef, useCallback } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $remark } from "@milkdown/utils";
import { useDocumentStore } from "../services/documentStore";
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
          const l = ctx.get(listenerCtx);
          l.markdownUpdated((_ctx, markdown) => {
            setContent(markdown);
          });
        })
        .use(remarkSplitOrderedListRestartsPlugin)
        .use(commonmark)
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
