import React from "react";

/** Tag — a hashtag row in the sidebar. Accent-colored label with a faint selection wash. Truncates with an ellipsis. */
export function Tag({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "7px 15px",
        margin: "1px 11px",
        borderRadius: "var(--mm-radius-md)",
        fontSize: "var(--mm-ui-sm)",
        fontWeight: "var(--mm-w-bold)",
        color: "var(--mm-accent)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        background: selected ? "var(--mm-sel)" : "transparent",
        fontFamily: "var(--mm-font-sans)",
      }}
    >
      {label}
    </div>
  );
}
