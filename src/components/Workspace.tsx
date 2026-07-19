import React, { useState, useEffect, useRef, useCallback } from "react";
import { useDocumentStore } from "../services/documentStore";
import { SourceEditor } from "./SourceEditor";
import { Preview } from "./Preview";

function usePaneDrag(initialFraction: number) {
  const [fraction, setFraction] = useState(initialFraction);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clamped = Math.min(Math.max(x / rect.width, 0.15), 0.85);
      setFraction(clamped);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { fraction, containerRef, onMouseDown };
}

export function Workspace() {
  const viewMode = useDocumentStore((s) => s.viewMode);
  const content = useDocumentStore((s) => s.content);

  const { fraction, containerRef, onMouseDown } = usePaneDrag(0.5);

  // Debounce preview content in split/preview mode
  const [debouncedContent, setDebouncedContent] = useState(content);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const showsPreview = viewMode === "split" || viewMode === "preview";

  useEffect(() => {
    if (showsPreview) {
      timerRef.current = setTimeout(() => setDebouncedContent(content), 150);
      return () => clearTimeout(timerRef.current);
    }
    setDebouncedContent(content);
  }, [content, showsPreview]);

  const isSplit = viewMode === "split";

  return (
    <main
      className="workspace"
      ref={containerRef}
      style={
        isSplit
          ? { gridTemplateColumns: `${fraction * 100}% 5px ${(1 - fraction) * 100 - 0.5}%` }
          : undefined
      }
    >
      {(viewMode === "source" || isSplit) && (
        <section className={`pane editor ${viewMode === "source" ? "full" : ""}`}>
          <SourceEditor />
        </section>
      )}

      {isSplit && (
        <div className="pane-divider" onMouseDown={onMouseDown} />
      )}

      {(isSplit || viewMode === "preview") && (
        <section className={`pane preview ${viewMode === "preview" ? "full" : ""}`}>
          <Preview content={debouncedContent} />
        </section>
      )}
    </main>
  );
}
