import React from "react";

/** DocListItem — a row in the middle document list. Bold title with an optional single-line, faint preview. Selected rows take the neutral wash; hairline rule divider. */
export function DocListItem({
  title,
  preview,
  selected = false,
  onClick,
}: {
  title: string;
  preview?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "22px 28px",
        cursor: "pointer",
        borderBottom: "1px solid var(--mm-border)",
        background: selected ? "var(--mm-sel)" : "transparent",
        transition: "background .12s",
        fontFamily: "var(--mm-font-sans)",
      }}
    >
      <div
        style={{
          fontSize: "var(--mm-ui-md)",
          fontWeight: "var(--mm-w-bold)",
          color: "var(--mm-text)",
          lineHeight: 1.32,
          marginBottom: preview ? "9px" : 0,
        }}
      >
        {title}
      </div>
      {preview ? (
        <div
          style={{
            fontSize: "var(--mm-ui-sm)",
            fontWeight: "var(--mm-w-regular)",
            color: "var(--mm-faint)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {preview}
        </div>
      ) : null}
    </div>
  );
}
