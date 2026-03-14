import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { StatusBar } from "../components/StatusBar";
import { useDocumentStore } from "../services/documentStore";

describe("StatusBar", () => {
  beforeEach(() => {
    useDocumentStore.setState({
      content: "Hello world\nSecond line",
      savedContent: "Hello world\nSecond line",
      filePath: "",
      viewMode: "split",
      cursorPosition: { line: 1, col: 1 },
    });
  });

  it("should show word count", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Words: 4");
  });

  it("should show character count", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Chars: 23");
  });

  it("should show line count", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Lines: 2");
  });

  it("should show Saved when not dirty", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Saved");
  });

  it("should show Modified when dirty", () => {
    useDocumentStore.setState({ content: "modified content" });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Modified");
  });

  it("should show cursor position", () => {
    useDocumentStore.setState({ cursorPosition: { line: 3, col: 7 } });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Ln 3, Col 7");
  });

  it("should show view mode", () => {
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("Split");
  });
});
