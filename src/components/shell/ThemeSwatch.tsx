import React from "react";

const THEMES = {
  teal: { accent: "#1ea7bb", bottom: "#d7eef2" },
  forest: { accent: "#2f9e73", bottom: "#efe4c6" },
  gold: { accent: "#c8971a", bottom: "#f4ecc9" },
  crimson: { accent: "#c23b6a", bottom: "#f6dbe4" },
  blue: { accent: "#3d8fd1", bottom: "#cfe4f4" },
  olive: { accent: "#7d9426", bottom: "#dfe6b8" },
  graphite: { accent: "#64707c", bottom: "#cdd4da" },
  red: { accent: "#d2453c", bottom: "#f6cdc9" },
} as const;

export type ThemeSwatchTheme = keyof typeof THEMES;

/** ThemeSwatch — two-tone round chip in the Aa picker. Top half accent, bottom half tint. Selected chips get a ring. */
export function ThemeSwatch({
  theme = "teal",
  selected = false,
  size = 46,
  onClick,
}: {
  theme?: ThemeSwatchTheme;
  selected?: boolean;
  size?: number;
  onClick?: () => void;
}) {
  const t = THEMES[theme] || THEMES.teal;
  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        cursor: "pointer",
        flex: "none",
        background: `linear-gradient(to bottom, ${t.accent} 0 50%, ${t.bottom} 50% 100%)`,
        boxShadow: selected
          ? `0 0 0 2px #fff, 0 0 0 4px ${t.accent}`
          : "inset 0 0 0 1px rgba(0,0,0,.12)",
      }}
    />
  );
}
