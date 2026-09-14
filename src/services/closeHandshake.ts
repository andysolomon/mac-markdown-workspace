/**
 * Close/quit handshake policy (issue #27), shared by the Electron main
 * process. Pure so the decision loop can be unit-tested without Electron.
 *
 * The host asks the renderer to flush; on success the window may close. On a
 * persistence failure the user is asked to retry, explicitly discard, or
 * cancel — the close never proceeds silently.
 */

import type { CloseFlushResult } from "../../shared/types/ipc";

export type FailureChoice = "retry" | "discard" | "cancel";
export type CloseDecision = "close" | "cancel";

/** Upper bound on how long the host waits for one renderer flush. */
export const CLOSE_FLUSH_TIMEOUT_MS = 10_000;

export function normalizeFlushResult(value: unknown): CloseFlushResult {
  if (value === true) return { ok: true };
  if (value && typeof value === "object" && "ok" in value) {
    const r = value as { ok: unknown; error?: unknown };
    if (r.ok === true) return { ok: true };
    return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Save failed" };
  }
  return { ok: false, error: "The editor did not confirm that your notes were saved." };
}

/**
 * Run the flush → (prompt on failure) loop until the window may close or the
 * user cancels. `maxAttempts` bounds pathological retry loops.
 */
export async function negotiateClose(
  flush: () => Promise<CloseFlushResult>,
  promptOnFailure: (error: string) => Promise<FailureChoice>,
  maxAttempts = 50,
): Promise<CloseDecision> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let result: CloseFlushResult;
    try {
      result = normalizeFlushResult(await flush());
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (result.ok === true) return "close";
    const choice = await promptOnFailure(result.error);
    if (choice === "discard") return "close";
    if (choice === "retry") continue;
    return "cancel";
  }
  return "cancel";
}
