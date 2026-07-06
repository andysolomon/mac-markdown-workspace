import React, { useEffect, useState } from "react";
import {
  wrapSelection,
  toggleLinePrefix,
  indentLine,
  insertLink,
  scrollCursorIntoView,
} from "../../services/editorBridge";

/**
 * MarkdownAccessoryBar — the helper strip that rides above the on-screen
 * keyboard while editing (issue #10 / W-000010, per the author's Bear
 * screenshot). Buttons insert markdown at the CodeMirror cursor. Positioned
 * via visualViewport so it tracks the iOS keyboard; the measured keyboard
 * inset is also published as --mm-kb-inset so the editor can pad its
 * scroller and keep the caret visible (issue #14 / W-000015). No Done
 * button — iOS/WKWebView already provide keyboard dismissal (issue #15).
 *
 * Every button uses onMouseDown/onTouchStart preventDefault so tapping the
 * bar never blurs the editor mid-insert.
 */

const BAR_HEIGHT = 50;

export function MarkdownAccessoryBar() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const inset = vv
        ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
        : 0;
      setKeyboardInset(inset);
      // Let the editor pad itself above keyboard + bar, then re-reveal the
      // caret in the reduced viewport.
      document.documentElement.style.setProperty("--mm-kb-inset", `${inset + BAR_HEIGHT}px`);
      scrollCursorIntoView();
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    // Some iOS versions pan via window scroll without visualViewport events.
    window.addEventListener("scroll", update, true);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update, true);
      document.documentElement.style.setProperty("--mm-kb-inset", "0px");
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
    </div>
  );
}
