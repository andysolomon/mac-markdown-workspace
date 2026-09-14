import { describe, it, expect, vi } from "vitest";
import { negotiateClose, normalizeFlushResult } from "../services/closeHandshake";

describe("closeHandshake (issue #27)", () => {
  it("closes only after a successful flush", async () => {
    const flush = vi.fn(async () => ({ ok: true as const }));
    const prompt = vi.fn();
    await expect(negotiateClose(flush, prompt)).resolves.toBe("close");
    expect(flush).toHaveBeenCalledTimes(1);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("keeps the window open (cancel) when the flush fails and the user cancels", async () => {
    const flush = vi.fn(async () => ({ ok: false as const, error: "ENOSPC" }));
    const prompt = vi.fn(async () => "cancel" as const);
    await expect(negotiateClose(flush, prompt)).resolves.toBe("cancel");
    expect(prompt).toHaveBeenCalledWith("ENOSPC");
  });

  it("retries the flush when asked and closes once it succeeds", async () => {
    let attempts = 0;
    const flush = vi.fn(async () =>
      ++attempts < 3 ? { ok: false as const, error: "EIO" } : { ok: true as const },
    );
    const prompt = vi.fn(async () => "retry" as const);
    await expect(negotiateClose(flush, prompt)).resolves.toBe("close");
    expect(flush).toHaveBeenCalledTimes(3);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it("closes only via an explicit discard after a failure — never silently", async () => {
    const flush = vi.fn(async () => ({ ok: false as const, error: "EACCES" }));
    const prompt = vi.fn(async () => "discard" as const);
    await expect(negotiateClose(flush, prompt)).resolves.toBe("close");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown flush (e.g. timeout) as a failure that must be confirmed", async () => {
    const flush = vi.fn(async () => {
      throw new Error("renderer timed out");
    });
    const prompt = vi.fn(async () => "cancel" as const);
    await expect(negotiateClose(flush, prompt)).resolves.toBe("cancel");
    expect(prompt).toHaveBeenCalledWith("renderer timed out");
  });

  it("normalizes legacy boolean and malformed responses conservatively", () => {
    expect(normalizeFlushResult(true)).toEqual({ ok: true });
    expect(normalizeFlushResult({ ok: true })).toEqual({ ok: true });
    expect(normalizeFlushResult({ ok: false, error: "x" })).toEqual({ ok: false, error: "x" });
    expect(normalizeFlushResult({ ok: false })).toEqual({ ok: false, error: "Save failed" });
    expect(normalizeFlushResult(false).ok).toBe(false);
    expect(normalizeFlushResult(undefined).ok).toBe(false);
  });
});
