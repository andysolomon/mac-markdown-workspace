import type { EditorView } from "@codemirror/view";

/**
 * Bridge to the live CodeMirror view so chrome outside SourceEditor (the
 * markdown keyboard accessory, issue #10) can insert at the cursor.
 */

let activeView: EditorView | null = null;

export function registerEditorView(view: EditorView | null): void {
  activeView = view;
}

export function getEditorView(): EditorView | null {
  return activeView;
}

/** Wrap the selection (or insert a pair and park the cursor inside). */
export function wrapSelection(before: string, after = before): void {
  const view = activeView;
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: selected
      ? { anchor: from, head: to + before.length + after.length }
      : { anchor: from + before.length },
  });
  view.focus();
}

/** Toggle a prefix at the start of the current line (e.g. "# ", "- [ ] "). */
export function toggleLinePrefix(prefix: string): void {
  const view = activeView;
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (line.text.startsWith(prefix)) {
    view.dispatch({ changes: { from: line.from, to: line.from + prefix.length, insert: "" } });
  } else {
    view.dispatch({ changes: { from: line.from, insert: prefix } });
  }
  view.focus();
}

/** Indent the current line by two spaces (list nesting step). */
export function indentLine(): void {
  const view = activeView;
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  view.dispatch({ changes: { from: line.from, insert: "  " } });
  view.focus();
}

/** Insert a markdown link around the selection. */
export function insertLink(): void {
  const view = activeView;
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || "text";
  const insert = `[${selected}](url)`;
  const urlStart = from + selected.length + 3; // "[sel](".length after selection
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  view.focus();
}

/** Dismiss the keyboard. */
export function blurEditor(): void {
  activeView?.contentDOM.blur();
}
