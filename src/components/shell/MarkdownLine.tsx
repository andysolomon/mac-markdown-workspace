import React from "react";

/** MarkdownLine — one rendered outline row. Accent marker left; prose neutral. `level` indents by the standard step. Encodes: structure is colored, prose is not. */
export function MarkdownLine({
  marker,
  level = 0,
  muted = false,
  children,
}: {
  marker?: React.ReactNode;
  level?: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.5em",
        alignItems: "baseline",
        lineHeight: "var(--mm-lh-list)",
        fontSize: "var(--mm-text-base)",
        fontFamily: "var(--mm-font-sans)",
        paddingLeft: `calc(${level} * var(--mm-indent-step))`,
        marginTop: "6px",
      }}
    >
      {marker ? (
        <span
          style={{
            flex: "none",
            color: "var(--md-marker)",
            fontWeight: "var(--mm-w-bold)",
          }}
        >
          {marker}
        </span>
      ) : null}
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          color: muted ? "var(--mm-faint)" : "var(--md-body)",
        }}
      >
        {children}
      </span>
    </div>
  );
}
