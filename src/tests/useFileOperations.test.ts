import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { confirmDiscardIfDirty } from "../hooks/useFileOperations";
import { useDocumentStore } from "../services/documentStore";
import { useNotesStore } from "../services/notesStore";
import type { AppApi } from "../../shared/types/ipc";

function stubApi(overrides: Partial<AppApi> = {}): AppApi {
  const api = {
    confirmDiscard: vi.fn(async () => "cancel" as const),
    writeNote: vi.fn(async ({ id, body }: { id: string; body: string }) => ({
      id,
      body,
      updatedAt: 1,
    })),
    saveFile: vi.fn(async ({ filePath }: { filePath: string; content: string }) => ({ filePath })),
    saveFileAs: vi.fn(async () => null),
    ...overrides,
  } as unknown as AppApi;
  window.appApi = api;
  return api;
}

describe("confirmDiscardIfDirty (issue #34)", () => {
  beforeEach(() => {
    useDocumentStore.setState({ content: "", savedContent: "", filePath: "" });
    useNotesStore.setState({
      notes: [],
      activeNoteId: null,
      selectedTag: null,
      searchQuery: "",
      loading: false,
      loaded: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { appApi?: AppApi }).appApi;
  });

  it("returns true without a dialog when the buffer is clean", async () => {
    const api = stubApi();
    await expect(confirmDiscardIfDirty()).resolves.toBe(true);
    expect(api.confirmDiscard).not.toHaveBeenCalled();
  });

  it("saves the active note, marks clean, and returns true", async () => {
    useDocumentStore.setState({ content: "# dirty", savedContent: "", filePath: "" });
    useNotesStore.setState({ activeNoteId: "n1" });
    const api = stubApi({
      confirmDiscard: vi.fn(async () => "save" as const),
    });
    const updateNote = vi.spyOn(useNotesStore.getState(), "updateNote");
    const markClean = vi.spyOn(useDocumentStore.getState(), "markClean");

    await expect(confirmDiscardIfDirty()).resolves.toBe(true);
    expect(updateNote).toHaveBeenCalledWith("n1", "# dirty");
    expect(api.writeNote).toHaveBeenCalledWith({ id: "n1", body: "# dirty" });
    expect(markClean).toHaveBeenCalled();
    expect(useDocumentStore.getState().savedContent).toBe("# dirty");
  });

  it("marks clean without saving when the user discards", async () => {
    useDocumentStore.setState({ content: "# dirty", savedContent: "# original", filePath: "" });
    useNotesStore.setState({ activeNoteId: "n1" });
    const api = stubApi({
      confirmDiscard: vi.fn(async () => "discard" as const),
    });
    const updateNote = vi.spyOn(useNotesStore.getState(), "updateNote");
    const markClean = vi.spyOn(useDocumentStore.getState(), "markClean");

    await expect(confirmDiscardIfDirty()).resolves.toBe(true);
    expect(markClean).toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(api.saveFile).not.toHaveBeenCalled();
    expect(useDocumentStore.getState()).toMatchObject({
      content: "# dirty",
      savedContent: "# dirty",
    });
  });

  it("returns false without mutating state when the user cancels", async () => {
    useDocumentStore.setState({ content: "# dirty", savedContent: "# original", filePath: "/tmp/a.md" });
    useNotesStore.setState({ activeNoteId: "n1" });
    const api = stubApi({
      confirmDiscard: vi.fn(async () => "cancel" as const),
    });
    const updateNote = vi.spyOn(useNotesStore.getState(), "updateNote");
    const markClean = vi.spyOn(useDocumentStore.getState(), "markClean");

    await expect(confirmDiscardIfDirty()).resolves.toBe(false);
    expect(markClean).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
    expect(api.writeNote).not.toHaveBeenCalled();
    expect(api.saveFile).not.toHaveBeenCalled();
    expect(useDocumentStore.getState()).toMatchObject({
      content: "# dirty",
      savedContent: "# original",
      filePath: "/tmp/a.md",
    });
    expect(useNotesStore.getState().activeNoteId).toBe("n1");
  });
});
