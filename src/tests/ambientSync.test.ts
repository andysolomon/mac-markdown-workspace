import { describe, it, expect, vi } from "vitest";
import { createAmbientScheduler, type AmbientStatus } from "../services/ambientSync";
import type { ConvergeMode, ConvergeResult } from "../services/syncBackend";

/** Deterministic timers: fire by id in the order they'd expire. */
function fakeTimers() {
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let now = 0;
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h: unknown) => {
      timers.delete(h as number);
    },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await flush();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const ok = (over: Partial<ConvergeResult> = {}): ConvergeResult => ({
  pulled: 0,
  pushed: false,
  notModified: false,
  ...over,
});

function harness(opts: { run?: (mode: ConvergeMode) => Promise<ConvergeResult>; online?: () => boolean } = {}) {
  const timers = fakeTimers();
  const calls: ConvergeMode[] = [];
  const statuses: AmbientStatus[] = [];
  const run = vi.fn(async (mode: ConvergeMode) => {
    calls.push(mode);
    return opts.run ? opts.run(mode) : ok();
  });
  const prepare = vi.fn(async () => undefined);
  const scheduler = createAmbientScheduler({
    run,
    prepare,
    onStatus: (s) => statuses.push(s),
    isOnline: opts.online,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    pushDelayMs: 100,
    backoffMinMs: 50,
    backoffMaxMs: 400,
  });
  return { timers, calls, statuses, run, prepare, scheduler };
}

describe("ambient scheduler — push coalescing", () => {
  it("a typing burst produces exactly one full cycle after the debounce", async () => {
    const h = harness();
    for (let i = 0; i < 10; i++) {
      h.scheduler.noteChanged();
      await h.timers.advance(30);
    }
    expect(h.calls).toEqual([]);
    await h.timers.advance(100);
    expect(h.calls).toEqual(["full"]);
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.scheduler.getState().dirty).toBe(false);
  });

  it("pushNow flushes a pending change immediately and is a no-op when clean", async () => {
    const h = harness();
    await h.scheduler.pushNow();
    expect(h.calls).toEqual([]);
    h.scheduler.noteChanged();
    await h.scheduler.pushNow();
    expect(h.calls).toEqual(["full"]);
    expect(h.timers.pending()).toBe(0); // the debounce timer was cancelled
  });

  it("a poll is upgraded to a full cycle when local edits are pending", async () => {
    const h = harness();
    await h.scheduler.pullNow();
    expect(h.calls).toEqual(["pull-if-changed"]);
    h.scheduler.noteChanged();
    await h.scheduler.pullNow();
    expect(h.calls).toEqual(["pull-if-changed", "full"]);
  });
});

describe("ambient scheduler — single flight", () => {
  it("never runs two cycles at once; a change mid-cycle runs one follow-up", async () => {
    let release: () => void = () => undefined;
    const h = harness({
      run: () =>
        new Promise<ConvergeResult>((resolve) => {
          release = () => resolve(ok());
        }),
    });
    h.scheduler.noteChanged();
    await h.timers.advance(100);
    expect(h.calls).toEqual(["full"]);
    expect(h.scheduler.getState().running).toBe(true);

    // Edits and polls arriving mid-cycle don't start anything.
    h.scheduler.noteChanged();
    void h.scheduler.pullNow();
    await flush();
    expect(h.calls).toEqual(["full"]);

    release();
    await flush();
    // One follow-up, and it's full (the mid-cycle edit is dirty).
    expect(h.calls).toEqual(["full", "full"]);
    release();
    await flush();
    expect(h.calls).toEqual(["full", "full"]);
    expect(h.scheduler.getState().dirty).toBe(false);
  });

  it("syncNow waits for the loop to be free and rethrows its own failure", async () => {
    let n = 0;
    const h = harness({
      run: async () => {
        n++;
        if (n === 2) throw new Error("boom");
        return ok();
      },
    });
    await expect(h.scheduler.syncNow()).resolves.toEqual(ok());
    await expect(h.scheduler.syncNow()).rejects.toThrow("boom");
    expect(h.scheduler.getState().status).toBe("error");
  });
});

describe("ambient scheduler — failure, backoff, offline", () => {
  it("backs off exponentially, never loops tightly, and recovers on success", async () => {
    let fail = true;
    const h = harness({
      run: async () => {
        if (fail) throw new Error("500");
        return ok();
      },
    });
    h.scheduler.noteChanged();
    await h.timers.advance(100);
    expect(h.calls.length).toBe(1);
    expect(h.scheduler.getState().status).toBe("error");
    expect(h.scheduler.getState().dirty).toBe(true); // the edit is still owed

    await h.timers.advance(49);
    expect(h.calls.length).toBe(1);
    await h.timers.advance(1); // 50ms retry
    expect(h.calls.length).toBe(2);
    await h.timers.advance(100); // 100ms retry
    expect(h.calls.length).toBe(3);
    await h.timers.advance(200); // 200ms retry
    expect(h.calls.length).toBe(4);
    await h.timers.advance(400); // capped at 400ms
    expect(h.calls.length).toBe(5);
    expect(h.calls.every((m) => m === "full")).toBe(true);

    fail = false;
    await h.timers.advance(400);
    expect(h.calls.length).toBe(6);
    expect(h.scheduler.getState()).toMatchObject({ status: "idle", dirty: false, backoffMs: 50 });
    expect(h.timers.pending()).toBe(0);
  });

  it("parks while offline instead of failing, and a network TypeError reads as offline", async () => {
    let online = false;
    const h = harness({ online: () => online });
    h.scheduler.noteChanged();
    await h.timers.advance(100);
    expect(h.calls).toEqual([]);
    expect(h.scheduler.getState().status).toBe("offline");
    expect(h.scheduler.getState().dirty).toBe(true);

    online = true;
    await h.scheduler.pullNow(); // the "online" event path
    expect(h.calls).toEqual(["full"]);
    expect(h.scheduler.getState().status).toBe("idle");

    const h2 = harness({
      run: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await h2.scheduler.pullNow();
    expect(h2.scheduler.getState().status).toBe("offline");
  });

  it("stop cancels timers and ignores later requests", async () => {
    const h = harness();
    h.scheduler.noteChanged();
    h.scheduler.stop();
    await h.timers.advance(1000);
    await h.scheduler.pullNow();
    expect(h.calls).toEqual([]);
    expect(h.timers.pending()).toBe(0);
  });
});
