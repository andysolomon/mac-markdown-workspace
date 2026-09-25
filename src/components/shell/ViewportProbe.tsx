import React, { useEffect, useState } from "react";

/**
 * ViewportProbe — opt-in on-device diagnostics for the mobile editing
 * viewport (append `?viewport-debug` to the web URL). Prints the live
 * geometry the editing controller works from and outlines the pinned app
 * shell in red, so a single phone screenshot shows where the browser puts
 * the visual viewport's bottom edge relative to the keyboard and Safari's
 * URL pill. Renders nothing unless requested.
 */
export function ViewportProbe() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-mm-viewport-debug", "");
    const round = (n: number | undefined) => (n === undefined ? "–" : Math.round(n).toString());
    const update = () => {
      const vv = window.visualViewport;
      const bar = document.querySelector(".mm-accessory")?.getBoundingClientRect();
      const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
      const offset = vv?.offsetTop ?? 0;
      setLines([
        `inner ${round(window.innerWidth)}×${round(window.innerHeight)} scrollY ${round(window.scrollY)}`,
        `vv h ${round(vv?.height)} top ${round(vv?.offsetTop)} page ${round(vv?.pageTop)}`,
        `kbd ${root.getAttribute("data-mm-keyboard") ?? "–"} edit ${root.getAttribute("data-mm-editing") ?? "–"}${root.hasAttribute("data-mm-url-pill") ? " pill" : ""}`,
        `shell ${round(shell && shell.top - offset)}→${round(shell && shell.bottom - offset)}`,
        `bar ${round(bar && bar.top - offset)}→${round(bar && bar.bottom - offset)}`,
      ]);
    };
    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    // Attribute changes land a frame after focus; keep the readout current.
    const timer = window.setInterval(update, 250);
    return () => {
      root.removeAttribute("data-mm-viewport-debug");
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <pre className="mm-viewport-probe" aria-hidden="true">
      {lines.join("\n")}
    </pre>
  );
}

/** True when the page was opened with `?viewport-debug`. */
export function viewportProbeRequested(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  return new URLSearchParams(window.location.search).has("viewport-debug");
}
