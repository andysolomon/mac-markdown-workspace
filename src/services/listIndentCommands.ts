import { EditorView } from "@codemirror/view";
import {
  applyListIndent,
  isListLine,
  type ListIndentDirection,
} from "./listIndent";

/**
 * Apply list-aware indent/outdent to the current line in a CodeMirror view.
 * Returns false when the line is not a list item so the default Tab binding
 * can fall through.
 */
export function applyListIndentCommand(
  view: EditorView,
  direction: ListIndentDirection,
): boolean {
  const { state } = view;
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  if (!isListLine(line.text)) return false;

  const lines = state.doc.toString().split("\n");
  // CodeMirror line.number is 1-based; split index is 0-based.
  const lineIndex = line.number - 1;
  const col = head - line.from;
  const { lines: nextLines, changed, cursorDelta } = applyListIndent(
    lines,
    lineIndex,
    direction,
  );
  if (!changed) return direction === "outdent"; // consume Shift-Tab at column 0

  const nextText = nextLines.join("\n");
  // Recompute absolute offset: renumbering can change lengths of earlier lines.
  let lineStart = 0;
  for (let i = 0; i < lineIndex; i++) lineStart += nextLines[i].length + 1;
  const newCol = Math.max(0, Math.min(col + cursorDelta, nextLines[lineIndex].length));

  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: nextText },
    selection: { anchor: lineStart + newCol },
    userEvent: "input.indent",
  });
  return true;
}
