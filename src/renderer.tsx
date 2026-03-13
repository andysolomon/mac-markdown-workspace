import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./index.css";

const starterMarkdown = `# Mac Markdown Workspace\n\nThis is the Bun-first scaffold for your Electron + React app.\n\n- Source editing\n- Split preview\n- Local file open/save\n\n\`\`\`mermaid\ngraph TD\n  A[Draft] --> B[Review]\n\`\`\`\n\nInline math: $E = mc^2$`;

type Mode = "source" | "split" | "wysiwyg";

function App() {
  const [mode, setMode] = useState<Mode>("split");
  const [markdown, setMarkdown] = useState(starterMarkdown);
  const [filePath, setFilePath] = useState<string>("");

  const wordCount = useMemo(() => {
    const words = markdown.trim().match(/\S+/g);
    return words ? words.length : 0;
  }, [markdown]);

  const charCount = markdown.length;

  const openFile = async () => {
    const result = await window.appApi.openFile();
    if (!result) return;
    setFilePath(result.filePath);
    setMarkdown(result.content);
  };

  const save = async () => {
    if (!filePath) {
      const saved = await window.appApi.saveFileAs({ content: markdown, defaultPath: "document.md" });
      if (saved) setFilePath(saved.filePath);
      return;
    }

    await window.appApi.saveFile({ filePath, content: markdown });
  };

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="left-group">
          <button onClick={openFile}>Open</button>
          <button onClick={save}>Save</button>
        </div>
        <div className="center-group">
          <button onClick={() => setMode("source")}>Source</button>
          <button onClick={() => setMode("split")}>Split</button>
          <button onClick={() => setMode("wysiwyg")}>WYSIWYG</button>
        </div>
        <div className="right-group">{filePath || "Unsaved document"}</div>
      </header>

      <main className="workspace">
        {mode !== "wysiwyg" && (
          <section className={`pane editor ${mode === "source" ? "full" : ""}`}>
            <textarea
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck={false}
            />
          </section>
        )}

        {mode !== "source" && (
          <section className={`pane preview ${mode === "wysiwyg" ? "full" : ""}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
              rehypePlugins={[rehypeKatex]}
            >
              {markdown}
            </ReactMarkdown>
          </section>
        )}
      </main>

      <footer className="status-bar">
        <span>Words: {wordCount}</span>
        <span>Characters: {charCount}</span>
        <span>Mode: {mode}</span>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
