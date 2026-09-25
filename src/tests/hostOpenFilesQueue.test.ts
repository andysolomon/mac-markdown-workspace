import { describe, it, expect, vi } from "vitest";
import { createHostOpenFilesQueue } from "../services/hostOpenFilesQueue";

describe("hostOpenFilesQueue (issue #25)", () => {
  it("re-holds after markUnready (window reload) and drains again", () => {
    const q = createHostOpenFilesQueue();
    const listener = vi.fn();
    q.setListener(listener);
    q.markReady();
    q.markUnready();
    q.enqueue(["/after-reload.md"]);
    expect(listener).not.toHaveBeenCalled();
    q.markReady();
    expect(listener).toHaveBeenCalledWith(["/after-reload.md"]);
  });
});
