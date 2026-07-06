import { EditorView } from "@codemirror/view";

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

/** Refocus and keep the caret visible above the on-screen keyboard. */
function focusAndReveal(view: EditorView): void {
  view.focus();
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }),
  });
}

/** Scroll the caret back into the visible area (called when the keyboard
    inset changes and after accessory insertions — issue #14 / W-000015). */
export function scrollCursorIntoView(): void {
  const view = activeView;
  if (!view) return;
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }),
  });
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
  focusAndReveal(view);
}

/** Toggle a prefix at the start of the current line (e.g. "# ", "- [ ] ").
    The caret lands after the prefix so typing continues the construct
    (issue #15 / W-000014: it previously stayed before the inserted text). */
export function toggleLinePrefix(prefix: string): void {
  const view = activeView;
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (line.text.startsWith(prefix)) {
    const newHead = Math.max(line.from, head - prefix.length);
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: "" },
      selection: { anchor: newHead },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, insert: prefix },
      selection: { anchor: head + prefix.length },
    });
  }
  focusAndReveal(view);
}

/** Indent the current line by two spaces (list nesting step). */
export function indentLine(): void {
  const view = activeView;
  if (!view) return;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  view.dispatch({
    changes: { from: line.from, insert: "  " },
    selection: { anchor: head + 2 },
  });
  focusAndReveal(view);
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
  focusAndReveal(view);
}

/** Dismiss the keyboard. */
export function blurEditor(): void {
  activeView?.contentDOM.blur();
}
