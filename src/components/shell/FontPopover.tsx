import React, { useEffect, useRef } from "react";
import { ThemeSwatch } from "./ThemeSwatch";
import {
  useThemeStore,
  FONT_OPTIONS,
  PALETTES,
  MODES,
  MIN_EDITOR_SIZE,
  MAX_EDITOR_SIZE,
  type ModeChoice,
} from "../../services/themeStore";

const modeLabels: Record<ModeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * FontPopover — the Aa panel: curated editor faces, a size stepper, the
 * four two-tone palette swatches, and the light/dark/system mode pills.
 * The floating card carries the system's single sanctioned shadow.
 * Every change applies live and persists via AppApi settings.
 */
export function FontPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const font = useThemeStore((s) => s.font);
  const size = useThemeStore((s) => s.size);
  const palette = useThemeStore((s) => s.palette);
  const mode = useThemeStore((s) => s.mode);
  const setFont = useThemeStore((s) => s.setFont);
  const setSize = useThemeStore((s) => s.setSize);
  const setPalette = useThemeStore((s) => s.setPalette);
  const setMode = useThemeStore((s) => s.setMode);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Ignore the Aa triggers: their own click toggles the popover closed —
      // closing on their mousedown would make the click instantly reopen it
      // (issue #15 / W-000014).
      if (target.closest && target.closest(".mm-aa, .mm-bb-aa")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const persist = (key: string, value: unknown) => {
    window.appApi?.setSetting?.(key, value);
  };

  return (
    <div className="mm-popover" ref={ref}>
      <div className="mm-pop-section">
        <div className="mm-pop-label">Fonts</div>
        {FONT_OPTIONS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`mm-font-row${f.key === font ? " sel" : ""}`}
            style={{ fontFamily: `var(${f.cssVar})` }}
            onClick={() => {
              setFont(f.key);
              persist("font", f.key);
            }}
          >
            <span>{f.label}</span>
            {f.key === font ? <span className="mm-check">✓</span> : null}
          </button>
        ))}
      </div>

      <div className="mm-pop-section">
        <div className="mm-pop-label">Size</div>
        <div className="mm-size-row">
          <button
            type="button"
            className="mm-size-btn"
            aria-label="Smaller text"
            disabled={size <= MIN_EDITOR_SIZE}
            onClick={() => {
              // Read fresh state so rapid clicks each step once (no stale closure).
              setSize(useThemeStore.getState().size - 1);
              persist("size", useThemeStore.getState().size);
            }}
          >
            A−
          </button>
          <span className="mm-size-read">{size}px</span>
          <button
            type="button"
            className="mm-size-btn"
            aria-label="Larger text"
            disabled={size >= MAX_EDITOR_SIZE}
            onClick={() => {
              setSize(useThemeStore.getState().size + 1);
              persist("size", useThemeStore.getState().size);
            }}
          >
            A+
          </button>
        </div>
      </div>

      <div className="mm-pop-section">
        <div className="mm-pop-label">Theme</div>
        <div className="mm-swatch-row">
          {PALETTES.map((p) => (
            <ThemeSwatch
              key={p}
              theme={p}
              size={34}
              selected={p === palette}
              onClick={() => {
                setPalette(p);
                persist("palette", p);
              }}
            />
          ))}
        </div>
      </div>

      <div className="mm-pop-section" style={{ marginBottom: 0 }}>
        <div className="mm-pop-label">Mode</div>
        <div className="mm-mode-row">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`mm-mode-pill${m === mode ? " sel" : ""}`}
              onClick={() => {
                setMode(m);
                persist("mode", m);
              }}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
