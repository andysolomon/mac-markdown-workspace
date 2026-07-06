import React, { useEffect, useState } from "react";
import {
  wrapSelection,
  toggleLinePrefix,
  indentLine,
  insertLink,
  blurEditor,
} from "../../services/editorBridge";

/**
 * MarkdownAccessoryBar — the helper strip that rides above the on-screen
 * keyboard while editing (issue #10 / W-000010, per the author's Bear
 * screenshot). Buttons insert markdown at the CodeMirror cursor; Done
 * dismisses the keyboard. Positioned via visualViewport so it tracks the
 * iOS keyboard; on plain mobile web it sits at the viewport bottom.
 *
 * Every button uses onMouseDown/onTouchStart preventDefault so tapping the
 * bar never blurs the editor mid-insert.
 */
export function MarkdownAccessoryBar() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardInset(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

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
    <div className="mm-accessory" style={{ bottom: keyboardInset }}>
      {buttons.map((b) => (
        <button
          key={b.aria}
          type="button"
          aria-label={b.aria}
          className={`mm-acc-btn${b.mono ? " mono" : ""}`}
          onMouseDown={keepFocus}
          onTouchStart={keepFocus}
          onClick={b.action}
        >
          {b.label}
        </button>
      ))}
      <button
        type="button"
        className="mm-acc-done"
        onClick={() => blurEditor()}
      >
        Done
      </button>
    </div>
  );
}
