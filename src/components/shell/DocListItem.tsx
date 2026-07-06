import React, { useRef, useState } from "react";

const REVEAL_WIDTH = 84;

/** DocListItem — a row in the middle document list. Bold title with an
    optional single-line, faint preview. Selected rows take the neutral wash;
    hairline rule divider. Delete: hover × on desktop, swipe-left to reveal
    a Delete action on touch (issue #18 / W-000018). */
export function DocListItem({
  title,
  preview,
  selected = false,
  onClick,
  onDelete,
}: {
  title: string;
  preview?: string;
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const dragged = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    dragged.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !onDelete) return;
    const dx = e.touches[0].clientX - touchStartX.current + (dragX < 0 ? -REVEAL_WIDTH : 0);
    const next = Math.min(0, Math.max(-REVEAL_WIDTH - 20, dx));
    if (Math.abs(dx) > 6) dragged.current = true;
    setDragX(next);
  };

  const onTouchEnd = () => {
    touchStartX.current = null;
    setDragX((x) => (x < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
  };

  const handleClick = () => {
    // A tap after (or during) a swipe closes the reveal instead of opening.
    if (dragged.current || dragX !== 0) {
      dragged.current = false;
      setDragX(0);
      return;
    }
    onClick?.();
  };

  return (
    <div className="mm-doc-swipe">
      {onDelete ? (
        <button
          type="button"
          className="mm-swipe-delete"
          aria-label={`Delete note: ${title}`}
          onClick={() => {
            setDragX(0);
            onDelete();
          }}
        >
          Delete
        </button>
      ) : null}
      <div
        className="mm-doc-row"
        onClick={handleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          padding: "22px 28px",
          cursor: "pointer",
          borderBottom: "1px solid var(--mm-border)",
          background: selected ? "var(--mm-sel)" : "var(--mm-bg)",
          transition: touchStartX.current === null ? "transform .15s ease, background .12s" : "background .12s",
          transform: `translateX(${dragX}px)`,
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
            paddingRight: "28px",
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
        {onDelete ? (
          <button
            type="button"
            className="mm-doc-delete"
            aria-label={`Delete note: ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
