import { describe, it, expect, vi } from "vitest";
import { negotiateClose } from "../services/closeHandshake";

describe("closeHandshake (issue #27)", () => {
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
});
