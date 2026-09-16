import { describe, it, expect, vi } from "vitest";
import { createHostOpenFilesQueue } from "../services/hostOpenFilesQueue";

describe("hostOpenFilesQueue (issue #25)", () => {
  it("holds paths until the renderer is ready, then drains one unique batch", () => {
    const q = createHostOpenFilesQueue();
    const listener = vi.fn();
    q.setListener(listener);
    q.enqueue(["/a.md", "/b.md", "/a.md"]);
    expect(q.getPending()).toEqual(["/a.md", "/b.md"]);
    expect(listener).not.toHaveBeenCalled();

    q.markReady();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(["/a.md", "/b.md"]);
    expect(q.getPending()).toEqual([]);
  });

  it("delivers immediately after ready (second-instance / warm open)", () => {
    const q = createHostOpenFilesQueue();
    const listener = vi.fn();
    q.setListener(listener);
    q.markReady();
    q.enqueue(["/warm.md"]);
    expect(listener).toHaveBeenCalledWith(["/warm.md"]);
    q.enqueue(["/warm.md"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not emit an empty enqueue", () => {
    const q = createHostOpenFilesQueue();
    const listener = vi.fn();
    q.setListener(listener);
    q.markReady();
    q.enqueue([]);
    q.enqueue(["", ""]);
    expect(listener).not.toHaveBeenCalled();
  });

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

  it("drains pending when the listener attaches after markReady", () => {
    const q = createHostOpenFilesQueue();
    q.enqueue(["/late.md"]);
    q.markReady();
    const listener = vi.fn();
    q.setListener(listener);
    expect(listener).toHaveBeenCalledWith(["/late.md"]);
  });

  it("does not recurse when a listener re-enqueues after markUnready (destroyed-window drain)", () => {
    const q = createHostOpenFilesQueue();
    const listener = vi.fn((paths: string[]) => {
      q.markUnready();
      q.enqueue(paths);
    });
    q.setListener(listener);
    q.markReady();
    q.enqueue(["/lost.md"]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(q.getPending()).toEqual(["/lost.md"]);
    q.markReady();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(["/lost.md"]);
  });
});
