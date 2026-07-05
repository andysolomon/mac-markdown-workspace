import React from "react";

/** WindowDots — macOS traffic-light dots, top-left of the sidebar. Decorative; fixed brand colors, never themed. */
export function WindowDots({ size = 13, gap = 8 }: { size?: number; gap?: number }) {
  const dot = (bg: string): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: "50%",
    background: bg,
  });
  return (
    <div style={{ display: "flex", gap }}>
      <span style={dot("var(--mm-dot-red)")} />
      <span style={dot("var(--mm-dot-yellow)")} />
      <span style={dot("var(--mm-dot-green)")} />
    </div>
  );
}
