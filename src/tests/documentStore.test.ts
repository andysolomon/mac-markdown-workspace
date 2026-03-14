import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore, selectIsDirty } from "../services/documentStore";

describe("documentStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useDocumentStore.setState({
      content: "",
      savedContent: "",
      filePath: "",
      viewMode: "split",
      cursorPosition: { line: 1, col: 1 },
    });
  });

  it("should start clean when content matches savedContent", () => {
    const state = useDocumentStore.getState();
    expect(selectIsDirty(state)).toBe(false);
  });

  it("should be dirty when content differs from savedContent", () => {
    useDocumentStore.getState().setContent("changed");
    const state = useDocumentStore.getState();
    expect(selectIsDirty(state)).toBe(true);
  });

  it("should mark clean after markClean()", () => {
    useDocumentStore.getState().setContent("changed");
    useDocumentStore.getState().markClean();
    const state = useDocumentStore.getState();
    expect(selectIsDirty(state)).toBe(false);
    expect(state.savedContent).toBe("changed");
  });

  it("should update view mode", () => {
    useDocumentStore.getState().setViewMode("source");
    expect(useDocumentStore.getState().viewMode).toBe("source");
  });

  it("should update cursor position", () => {
    useDocumentStore.getState().setCursorPosition({ line: 5, col: 10 });
    expect(useDocumentStore.getState().cursorPosition).toEqual({ line: 5, col: 10 });
  });

  it("should reset document", () => {
    useDocumentStore.getState().setContent("some content");
    useDocumentStore.getState().setFilePath("/tmp/test.md");
    useDocumentStore.getState().resetDocument();

    const state = useDocumentStore.getState();
    expect(state.content).toBe("");
    expect(state.savedContent).toBe("");
    expect(state.filePath).toBe("");
  });

  it("should set file path", () => {
    useDocumentStore.getState().setFilePath("/tmp/doc.md");
    expect(useDocumentStore.getState().filePath).toBe("/tmp/doc.md");
  });
});
