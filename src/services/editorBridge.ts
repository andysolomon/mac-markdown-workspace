import { EditorView } from "@codemirror/view";
import { applyListIndentCommand } from "./listIndentCommands";

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

/** Scroll the caret back into the visible area (after accessory insertions —
    issue #14 / W-000015). Runs in CodeMirror's next measure cycle. */
export function scrollCursorIntoView(): void {
  const view = activeView;
  if (!view) return;
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest" }),
  });
}

/** The caret's on-screen rect. On a tap the DOM selection is placed before
    CodeMirror reads it back, so prefer the live DOM caret. */
function caretRect(view: EditorView): { top: number; bottom: number } | null {
  const selection = view.dom.ownerDocument.getSelection?.();
  if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    if (view.contentDOM.contains(range.startContainer)) {
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (rect && rect.height > 0) return { top: rect.top, bottom: rect.bottom };
    }
  }
  const coords = view.coordsAtPos(view.state.selection.main.head);
  return coords ? { top: coords.top, bottom: coords.bottom } : null;
}

/**
 * Scroll the editor so the caret sits inside its visible box, synchronously.
 * Used when the visible editing area changes (keyboard up/down) so the caret
 * is already clear of the keyboard when iOS decides whether to pan the page.
 */
export function revealCaretNow(bottomMargin = 16): void {
  const view = activeView;
  if (!view) return;
  const caret = caretRect(view);
  if (!caret) return;
  const box = view.scrollDOM.getBoundingClientRect();
  const top = box.top + 8;
  const bottom = box.bottom - bottomMargin;
  let delta = 0;
  if (caret.bottom > bottom) delta = caret.bottom - bottom;
  else if (caret.top < top) delta = caret.top - top;
  if (Math.abs(delta) >= 1) view.scrollDOM.scrollTop += delta;
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

/** Indent the current list line by 4 spaces (list nesting step). */
export function indentLine(): void {
  const view = activeView;
  if (!view) return;
  if (!applyListIndentCommand(view, "indent")) {
    // Non-list line: insert a 4-space indent at the line start.
    const { head } = view.state.selection.main;
    const line = view.state.doc.lineAt(head);
    view.dispatch({
      changes: { from: line.from, insert: "    " },
      selection: { anchor: head + 4 },
    });
  }
  focusAndReveal(view);
}

/** Outdent the current list line by 4 spaces. */
export function outdentLine(): void {
  const view = activeView;
  if (!view) return;
  applyListIndentCommand(view, "outdent");
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
