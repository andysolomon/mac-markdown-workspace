/**
 * Single queue for CLI argv, second-instance activation, and macOS `open-file`
 * (issue #25). Paths accumulate until the renderer signals ready, then drain
 * as one batch so cold-start multi-file opens share one import/confirm pass.
 * After ready, each enqueue is a new batch (warm second-instance).
 */

export type HostOpenFilesListener = (paths: string[]) => void;

export function createHostOpenFilesQueue() {
  let ready = false;
  const pending: string[] = [];
  let listener: HostOpenFilesListener | null = null;

  const uniqueOf = (paths: string[], seen: Set<string>): string[] => {
    const out: string[] = [];
    for (const p of paths) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
    return out;
  };

  const drain = (): void => {
    if (!ready || !listener || pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    listener(batch);
  };

  return {
    enqueue(paths: string[]): void {
      const unique = uniqueOf(paths, ready ? new Set() : new Set(pending));
      if (unique.length === 0) return;
      if (ready && listener) {
        listener(unique);
        return;
      }
      pending.push(...unique);
    },
    markReady(): void {
      ready = true;
      drain();
    },
    markUnready(): void {
      ready = false;
    },
    setListener(fn: HostOpenFilesListener | null): void {
      listener = fn;
      drain();
    },
    getPending(): string[] {
      return [...pending];
    },
    isReady(): boolean {
      return ready;
    },
  };
}

export type HostOpenFilesQueue = ReturnType<typeof createHostOpenFilesQueue>;
