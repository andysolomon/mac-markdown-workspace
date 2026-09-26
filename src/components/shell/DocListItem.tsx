import React, { useEffect, useRef, useState } from "react";

const REVEAL_WIDTH = 84;
/** How far a finger travels before the gesture commits to an axis. */
const AXIS_SLOP = 10;
/** Sideways must beat vertical by this much to be a swipe — a thumb flick
    drifts sideways, and a drift must scroll, never reveal Delete. */
const SWIPE_BIAS = 1.5;

type Gesture = {
  startX: number;
  startY: number;
  /** Row offset when the finger went down (open rows start at -REVEAL_WIDTH). */
  base: number;
  /** Live offset — read on touchend, where a not-yet-rendered move would be stale state. */
  offset: number;
  axis: "x" | "y" | null;
};

/** DocListItem — a row in the middle document list. Bold title with an
    optional single-line, faint preview. Selected rows take the neutral wash;
    hairline rule divider. Delete: hover × on desktop, swipe-left to reveal
    a Delete action on touch (issue #18 / W-000018). The list owns which row
    is revealed (`revealed`/`onRevealChange`) so only one is open at a time. */
export function DocListItem({
  title,
  preview,
  selected = false,
  revealed = false,
  onClick,
  onDelete,
  onRevealChange,
}: {
  title: string;
  preview?: string;
  selected?: boolean;
  revealed?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onRevealChange?: (revealed: boolean) => void;
}) {
  // Live offset while a sideways swipe is under the finger; null at rest.
  const [dragX, setDragX] = useState<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragged = useRef(false);
  const stopWatchingScroll = useRef<(() => void) | null>(null);

  const endGesture = () => {
    gesture.current = null;
    stopWatchingScroll.current?.();
    stopWatchingScroll.current = null;
  };

  useEffect(() => () => stopWatchingScroll.current?.(), []);

  const onTouchStart = (e: React.TouchEvent) => {
    endGesture();
    setDragX(null);
    if (!onDelete || e.touches.length !== 1) return;
    const base = revealed ? -REVEAL_WIDTH : 0;
    gesture.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      base,
      offset: base,
      axis: null,
    };
    dragged.current = false;
    // Anything scrolling under the finger means the browser took this
    // gesture as a scroll: it can no longer reveal Delete.
    const onScroll = () => {
      if (gesture.current) gesture.current.axis = "y";
      setDragX(null);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    stopWatchingScroll.current = () => window.removeEventListener("scroll", onScroll, { capture: true });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g || g.axis === "y") return;
    if (e.touches.length !== 1) {
      endGesture();
      setDragX(null);
      return;
    }
    const dx = e.touches[0].clientX - g.startX;
    const dy = e.touches[0].clientY - g.startY;
    if (g.axis === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * SWIPE_BIAS ? "x" : "y";
      if (g.axis === "y") return;
      dragged.current = true;
    }
    g.offset = Math.min(0, Math.max(-REVEAL_WIDTH - 20, g.base + dx));
    setDragX(g.offset);
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    endGesture();
    if (g?.axis === "x") onRevealChange?.(g.offset < -REVEAL_WIDTH / 2);
    setDragX(null);
  };

  const onTouchCancel = () => {
    endGesture();
    setDragX(null);
  };

  const handleClick = () => {
    // A tap after (or during) a swipe closes the reveal instead of opening.
    if (dragged.current || revealed) {
      dragged.current = false;
      onRevealChange?.(false);
      return;
    }
    onClick?.();
  };

  const offset = dragX ?? (revealed ? -REVEAL_WIDTH : 0);

  return (
    <div className="mm-doc-swipe">
      {onDelete ? (
        <button
          type="button"
          className="mm-swipe-delete"
          aria-label={`Delete note: ${title}`}
          onClick={() => {
            onRevealChange?.(false);
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
        onTouchCancel={onTouchCancel}
        style={{
          position: "relative",
          padding: "22px 28px",
          cursor: "pointer",
          borderBottom: "1px solid var(--mm-border)",
          background: selected ? "var(--mm-sel)" : "var(--mm-bg)",
          transition: dragX === null ? "transform .15s ease, background .12s" : "background .12s",
          transform: `translateX(${offset}px)`,
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
