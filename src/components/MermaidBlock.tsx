import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
  });
  mermaidInitialized = true;
}

let idCounter = 0;

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    initMermaid();
    const id = `mermaid-${++idCounter}`;

    mermaid
      .render(id, code)
      .then((result) => {
        setSvg(result.svg);
        setError("");
      })
      .catch((err) => {
        setError(String(err));
        setSvg("");
      });
  }, [code]);

  if (error) {
    return (
      <pre style={{ color: "red", fontSize: 12 }}>
        Mermaid error: {error}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ display: "flex", justifyContent: "center" }}
    />
  );
}
