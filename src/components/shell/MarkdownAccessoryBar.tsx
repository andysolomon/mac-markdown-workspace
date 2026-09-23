import React, { useEffect, useRef } from "react";
import {
  wrapSelection,
  toggleLinePrefix,
  indentLine,
  insertLink,
  scrollCursorIntoView,
} from "../../services/editorBridge";
import {
  ACCESSORY_BAR_HEIGHT,
  measureAccessoryOffset,
  measureKeyboardInset,
  type AccessoryHost,
} from "../../services/editorViewport";

/**
 * MarkdownAccessoryBar — the helper strip that rides above the on-screen
 * keyboard while editing (issue #10 / W-000010, per the author's Bear
 * screenshot). Buttons insert markdown at the CodeMirror cursor. Positioned
 * via visualViewport so it tracks the iOS keyboard. On iPhone Safari the
 * floating URL pill overlays a bar that sits flush with the keyboard, so a
 * real keyboard inset also clears that pill. The space under the bar is
 * filled with the theme background (not the white page canvas). The measured
 * offset (plus the bar) is published as --mm-kb-inset so the editor can pad
 * its scroller and keep the caret visible (issue #14 / W-000015).
 * No Done button — iOS/WKWebView already provide keyboard dismissal
 * (issue #15).
 *
 * Every button uses onMouseDown/onTouchStart preventDefault so tapping the
 * bar never blurs the editor mid-insert.
 */

export function MarkdownAccessoryBar() {
  const revealFrame = useRef<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const windowScrollOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    const revealCaret = () => {
      // Reveal immediately for a responsive caret, then once more after the
      // browser has applied the new viewport geometry and CSS variable.
      scrollCursorIntoView();
      if (typeof window.requestAnimationFrame !== "function") return;
      if (revealFrame.current !== null) return;
      revealFrame.current = window.requestAnimationFrame(() => {
        revealFrame.current = null;
        scrollCursorIntoView();
      });
    };

    const update = () => {
      const keyboard = measureKeyboardInset(window.innerHeight, vv);
      const host: AccessoryHost = {
        userAgent: navigator.userAgent,
        nativePlatform:
          (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
            ?.isNativePlatform?.() === true,
      };
      const offset = measureAccessoryOffset(keyboard, host);
      // Keep the bar's position out of React's render cycle. During keyboard
      // animations, a direct CSS update avoids a frame where the app chrome
      // can be panned over the accessory.
      document.documentElement.style.setProperty("--mm-kb-offset", `${offset}px`);
      // The editor needs clearance for the keyboard, Safari's URL pill, and this bar.
      document.documentElement.style.setProperty(
        "--mm-kb-inset",
        `${offset + ACCESSORY_BAR_HEIGHT}px`,
      );
      revealCaret();
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    // Native-resize WebViews report geometry changes on window instead.
    window.addEventListener("resize", update);
    // Some iOS versions pan via window scroll without visualViewport events.
    window.addEventListener("scroll", update, windowScrollOptions);
    return () => {
      if (revealFrame.current !== null) {
        window.cancelAnimationFrame(revealFrame.current);
        revealFrame.current = null;
      }
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, windowScrollOptions);
      document.documentElement.style.setProperty("--mm-kb-offset", "0px");
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
    <>
      {/* Paints the keyboard/pill offset with the theme background. */}
      <div className="mm-accessory-gap" aria-hidden="true" />
      <div className="mm-accessory">
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
    </>
  );
}
