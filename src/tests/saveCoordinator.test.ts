import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSaveCoordinator, describeError, type PendingSave } from "../services/saveCoordinator";

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

  it("debounces 600ms and writes the scheduled note id + body", async () => {
    const { write, calls } = makeWrite();
    const saved: Array<[PendingSave, boolean]> = [];
    const c = createSaveCoordinator({ write, onSaved: (s, cur) => saved.push([s, cur]) });

    c.schedule("a", "one");
    c.schedule("a", "one two");
    vi.advanceTimersByTime(599);
    expect(write).not.toHaveBeenCalled();
    expect(c.getState().status).toBe("pending");

    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a", "one two");
    expect(c.getState().status).toBe("saving");

    calls[0].resolve();
    await tick();
    expect(saved).toEqual([[{ noteId: "a", body: "one two", revision: 2 }, true]]);
    expect(c.getState().status).toBe("idle");
    expect(c.hasUnsaved()).toBe(false);
  });

  it("flush() writes a <600ms-old edit immediately and resolves ok after success", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "fresh");
    vi.advanceTimersByTime(100);

    const flush = c.flush();
    expect(write).toHaveBeenCalledWith("a", "fresh");
    calls[0].resolve();
    await expect(flush).resolves.toEqual({ ok: true });
    expect(c.hasUnsaved()).toBe(false);
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

  it("retains a failed write, reports flush failure, and supports retry", async () => {
    const { write, calls } = makeWrite();
    const failed: string[] = [];
    const c = createSaveCoordinator({ write, onFailed: (_s, e) => failed.push(e) });

    c.schedule("a", "body");
    const flush = c.flush();
    calls[0].reject(new Error("Error invoking remote method 'notes:write': Error: ENOSPC: no space left"));
    await expect(flush).resolves.toEqual({ ok: false, error: "ENOSPC: no space left" });
    expect(failed).toEqual(["ENOSPC: no space left"]);
    expect(c.getState().status).toBe("error");
    expect(c.hasUnsaved()).toBe(true);
    expect(c.getUnsavedBody("a")).toBe("body");

    const retry = c.retry();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ noteId: "a", body: "body" });
    calls[1].resolve();
    await expect(retry).resolves.toEqual({ ok: true });
    expect(c.hasUnsaved()).toBe(false);
  });

  it("explicit discard drops failed saves and clears the error", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "body");
    const flush = c.flush();
    calls[0].reject(new Error("EACCES"));
    await flush;
    expect(c.discardFailed()).toEqual([{ noteId: "a", body: "body", revision: 1 }]);
    expect(c.getState()).toMatchObject({ status: "idle", error: null });
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

  it("each write targets its original note even when other notes are scheduled meanwhile", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "A body");
    vi.advanceTimersByTime(600);
    expect(calls[0]).toMatchObject({ noteId: "a", body: "A body" });

    c.schedule("b", "B body"); // user switched notes while A is in flight
    calls[0].resolve();
    await tick();
    vi.advanceTimersByTime(600);
    expect(calls[1]).toMatchObject({ noteId: "b", body: "B body" });
    expect(calls.map((x) => x.noteId)).toEqual(["a", "b"]);
  });

  it("cancel() drops a pending save so nothing is written", () => {
    const { write } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "typo");
    c.cancel("a");
    vi.advanceTimersByTime(1000);
    expect(write).not.toHaveBeenCalled();
    expect(c.getState().status).toBe("idle");
  });

  it("flush() waits for work scheduled behind an in-flight write", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    c.schedule("a", "v1");
    vi.advanceTimersByTime(600);
    c.schedule("a", "v2");
    const flush = c.flush();
    calls[0].resolve();
    await tick();
    expect(calls[1]).toMatchObject({ body: "v2" });
    calls[1].resolve();
    await expect(flush).resolves.toEqual({ ok: true });
  });

  it("a flush with nothing pending (every note switch) does not disable later saves", async () => {
    const { write, calls } = makeWrite();
    const c = createSaveCoordinator({ write });
    await expect(c.flush()).resolves.toEqual({ ok: true });
    await expect(c.flush()).resolves.toEqual({ ok: true });

    c.schedule("a", "after idle flush");
    vi.advanceTimersByTime(600);
    expect(calls).toHaveLength(1);
    calls[0].resolve();
    await tick();
    expect(c.hasUnsaved()).toBe(false);

    c.schedule("a", "again");
    const flush = c.flush();
    expect(calls).toHaveLength(2);
    calls[1].resolve();
    await expect(flush).resolves.toEqual({ ok: true });
  });

  it("describeError strips Electron's remote-method prefix", () => {
    expect(describeError(new Error("Error invoking remote method 'notes:write': Error: EIO"))).toBe("EIO");
    expect(describeError("plain")).toBe("plain");
  });
});
