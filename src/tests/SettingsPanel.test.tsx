import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "../components/shell/SettingsPanel";
import { useSettingsStore } from "../services/settingsStore";
import { useNotesStore } from "../services/notesStore";
import { useDocumentStore } from "../services/documentStore";
import type { AppApi } from "../../shared/types/ipc";

// Vite injects the build id at bundle time; the panel renders it in a footer.
(globalThis as { __BUILD_ID__?: string }).__BUILD_ID__ = "test";

/**
 * Settings panel — iOS storage location (issue #8 / W-000008).
 * The Storage control is transactional: it awaits the shim's migration,
 * blocks repeat taps, updates the selection only on success, and keeps the
 * previous selection (with an error) on rejection.
 */

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } };
const win = window as CapWindow;

function setNative(native: boolean) {
  win.Capacitor = { isNativePlatform: () => native };
}

function stubApi(overrides: Partial<AppApi> = {}) {
  const api = {
    getSetting: vi.fn(async () => undefined),
    setSetting: vi.fn(async () => undefined),
    listNotes: vi.fn(async () => useNotesStore.getState().notes.map(({ id, body, updatedAt }) => ({ id, body, updatedAt }))),
    writeNote: vi.fn(async ({ id, body }: { id: string; body: string }) => ({ id, body, updatedAt: 5 })),
    ...overrides,
  } as unknown as AppApi;
  window.appApi = api;
  return api;
}

beforeEach(() => {
  useSettingsStore.setState({ iosStorage: "documents", showToolbar: true, syncEnabled: false, vimMode: false });
  useNotesStore.setState({ notes: [], activeNoteId: null, loaded: true, loading: false });
  useDocumentStore.setState({ content: "", savedContent: "", filePath: "" });
});

afterEach(() => {
  cleanup();
  delete win.Capacitor;
  delete (window as { appApi?: AppApi }).appApi;
});

describe("SettingsPanel storage section — transactional switching", () => {
  it("awaits the shim, blocks repeat taps while busy, and updates the selection only on success", async () => {
    setNative(true);
    let resolveSet!: () => void;
    const api = stubApi({
      setSetting: vi.fn(() => new Promise<void>((r) => (resolveSet = r))),
    });
    render(<SettingsPanel open onClose={() => undefined} />);
    const onDevice = screen.getByRole("radio", { name: "On device" });
    const documents = screen.getByRole("radio", { name: "Documents & Backup" });

    fireEvent.click(onDevice);
    await waitFor(() => expect(api.setSetting).toHaveBeenCalledWith("iosStorage", "private"));
    // Busy: both pills disabled, selection unchanged, live status shown.
    expect((onDevice as HTMLButtonElement).disabled).toBe(true);
    expect((documents as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radiogroup").getAttribute("aria-busy")).toBe("true");
    expect(documents.getAttribute("aria-checked")).toBe("true");
    expect(useSettingsStore.getState().iosStorage).toBe("documents");
    expect(screen.getByText("Moving notes…")).toBeTruthy();
    fireEvent.click(documents);
    fireEvent.click(onDevice);
    expect(api.setSetting).toHaveBeenCalledTimes(1);

    resolveSet();
    await waitFor(() => expect(onDevice.getAttribute("aria-checked")).toBe("true"));
    expect(useSettingsStore.getState().iosStorage).toBe("private");
    expect((onDevice as HTMLButtonElement).disabled).toBe(false);
    expect(api.listNotes).toHaveBeenCalled(); // library reloaded from the new root
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the previous selection and shows an actionable error when the shim rejects", async () => {
    setNative(true);
    const api = stubApi({
      setSetting: vi.fn(async () => {
        throw new Error("Could not copy notes to the new location");
      }),
    });
    render(<SettingsPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: "On device" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not copy notes to the new location");
    expect(alert.textContent).toContain("still in the previous location");
    expect(useSettingsStore.getState().iosStorage).toBe("documents");
    expect(screen.getByRole("radio", { name: "Documents & Backup" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("radio", { name: "On device" }) as HTMLButtonElement).disabled).toBe(false);
    expect(api.listNotes).not.toHaveBeenCalled();
    // Retry is possible after a failure.
    fireEvent.click(screen.getByRole("radio", { name: "On device" }));
    await waitFor(() => expect(api.setSetting).toHaveBeenCalledTimes(2));
  });

  it("flushes a pending edit of the active note before migrating, then reloads the library", async () => {
    setNative(true);
    const order: string[] = [];
    const api = stubApi({
      writeNote: vi.fn(async ({ id, body }: { id: string; body: string }) => {
        order.push("writeNote");
        return { id, body, updatedAt: 9 };
      }),
      setSetting: vi.fn(async () => {
        order.push("setSetting");
      }),
      listNotes: vi.fn(async () => {
        order.push("listNotes");
        return [{ id: "n1", body: "latest", updatedAt: 9 }];
      }),
    });
    useNotesStore.setState({
      notes: [{ id: "n1", title: "t", preview: "", tags: [], body: "stale", updatedAt: 1 }],
      activeNoteId: "n1",
    });
    useDocumentStore.setState({ content: "latest", savedContent: "stale", filePath: "" });

    render(<SettingsPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: "On device" }));
    await waitFor(() => expect(useSettingsStore.getState().iosStorage).toBe("private"));
    expect(order).toEqual(["writeNote", "setSetting", "listNotes"]);
    expect(api.writeNote).toHaveBeenCalledWith({ id: "n1", body: "latest" });
    expect(useDocumentStore.getState().savedContent).toBe("latest"); // buffer marked clean
    // Active note preserved across the reload (same id in the new root).
    expect(useNotesStore.getState().activeNoteId).toBe("n1");
    expect(useNotesStore.getState().notes[0].body).toBe("latest");
  });
});
