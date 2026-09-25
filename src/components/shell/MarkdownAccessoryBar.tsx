import React, { useLayoutEffect } from "react";
import {
  wrapSelection,
  toggleLinePrefix,
  indentLine,
  insertLink,
  revealCaretNow,
} from "../../services/editorBridge";
import { EDITING_CARET_MARGIN, startEditingViewport } from "../../services/editorViewport";

/**
 * MarkdownAccessoryBar — the helper strip that sits on top of the on-screen
 * keyboard while editing (issue #10 / W-000010, per the author's Bear
 * screenshot). Buttons insert markdown at the CodeMirror cursor.
 *
 * It is the last row of the editor column, not a fixed overlay: while it is
 * mounted, startEditingViewport pins the app to the visible area above the
 * keyboard, so the bar lands on the keyboard's top edge (or just above
 * Safari's URL pill on iPhone). The caret is revealed whenever that visible
 * area changes — never on scroll, so the note stays freely scrollable while
 * typing. No Done button — iOS/WKWebView already provide keyboard dismissal
 * (issue #15).
 *
 * Buttons use onMouseDown preventDefault so tapping the bar never blurs the
 * editor mid-insert.
 */

export function MarkdownAccessoryBar() {
  // Layout effect: the bar must be marked "pending" before the first paint so
  // it never flashes at the bottom of the screen ahead of the keyboard.
  useLayoutEffect(
    () =>
      startEditingViewport({
        onVisibleAreaChange: () => revealCaretNow(EDITING_CARET_MARGIN),
      }),
    [],
  );

  const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();

  const buttons: { label: string; aria: string; action: () => void; mono?: boolean }[] = [
    { label: "#", aria: "Heading", action: () => toggleLinePrefix("# ") },
    { label: "B", aria: "Bold", action: () => wrapSelection("**") },
    { label: "I", aria: "Italic", action: () => wrapSelection("*") },
    { label: "–", aria: "List item", action: () => toggleLinePrefix("- ") },
    { label: "☐", aria: "Task", action: () => toggleLinePrefix("- [ ] ") },
    { label: ">", aria: "Quote", action: () => toggleLinePrefix("> ") },
    { label: "`", aria: "Code", action: () => wrapSelection("`"), mono: true },
    { label: "[]", aria: "Link", action: () => insertLink(), mono: true },
    { label: "⇥", aria: "Indent", action: () => indentLine() },
  ];

  return (
    <div className="mm-accessory-dock">
      <div className="mm-accessory" role="toolbar" aria-label="Markdown formatting">
        {buttons.map((b) => (
          <button
            key={b.aria}
            type="button"
            aria-label={b.aria}
            className={`mm-acc-btn${b.mono ? " mono" : ""}`}
            onMouseDown={keepFocus}
            onClick={b.action}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
