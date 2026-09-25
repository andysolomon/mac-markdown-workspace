import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSaveCoordinator, type PendingSave } from "../services/saveCoordinator";

/** A controllable async write: each call returns a deferred the test settles. */
function makeWrite() {
  const calls: Array<{ noteId: string; body: string; resolve: () => void; reject: (e: unknown) => void }> = [];
  const write = vi.fn((noteId: string, body: string) => {
    return new Promise<void>((resolve, reject) => {
      calls.push({ noteId, body, resolve, reject });
    });
  });
  return { write, calls };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

describe("saveCoordinator (issue #27)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("slow write + newer edits: old completion is reported non-current and newer body is written after", async () => {
    const { write, calls } = makeWrite();
    const saved: Array<[PendingSave, boolean]> = [];
    const c = createSaveCoordinator({ write, onSaved: (s, cur) => saved.push([s, cur]) });

    c.schedule("a", "v1");
    vi.advanceTimersByTime(600);
    expect(calls).toHaveLength(1); // v1 in flight (slow)

    c.schedule("a", "v2"); // more typing while v1 is still writing
    vi.advanceTimersByTime(600); // debounce elapses, but v1 still in flight → no overlap
    expect(calls).toHaveLength(1);

    calls[0].resolve(); // old write completes
    await tick();
    expect(saved[0]).toEqual([{ noteId: "a", body: "v1", revision: 1 }, false]);
    expect(c.isCurrent("a", 1)).toBe(false);
    expect(c.getUnsavedBody("a")).toBe("v2");

    // v2 goes out only now, serialized behind v1 — never the other way round.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ noteId: "a", body: "v2" });
    calls[1].resolve();
    await tick();
    expect(saved[1]).toEqual([{ noteId: "a", body: "v2", revision: 2 }, true]);
    expect(c.hasUnsaved()).toBe(false);
  });

  it("a newer edit supersedes a failed save of the same note", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "old");
    const flush = c.flush();
    calls[0].reject(new Error("boom"));
    await flush;
    c.schedule("a", "old plus new");
    expect(c.getState().failed.size).toBe(0);
    expect(c.getUnsavedBody("a")).toBe("old plus new");
  });
});
