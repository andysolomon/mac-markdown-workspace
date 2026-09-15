import { useEffect } from "react";
import { hasOpenableExtension } from "../services/argvParser";
import { flushNoteSaves } from "../services/noteAutosave";
import { useNotesStore } from "../services/notesStore";
import { showToast } from "../services/toast";
import { confirmDiscardIfDirty } from "./useFileOperations";

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

async function importHostOpenFiles(paths: string[]): Promise<void> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }
  if (unique.length === 0) return;

  // Same gate as File > Open: never dump imported bodies over a dirty buffer.
  const canProceed = await confirmDiscardIfDirty();
  if (!canProceed) return;
  await flushNoteSaves();

  for (const filePath of unique) {
    const name = basename(filePath);
    if (!hasOpenableExtension(filePath)) {
      showToast(`Couldn't open ${name}: not a Markdown file.`);
      continue;
    }
    try {
      const result = await window.appApi.readFile({ filePath });
      if (!result) {
        showToast(`Couldn't open ${name}: the file is missing or unreadable.`);
        continue;
      }
      await useNotesStore.getState().createNote(result.content);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showToast(`Couldn't open ${name}: ${detail}`);
    }
  }
}

/**
 * Subscribe to host-requested Markdown paths (CLI, file manager, macOS
 * open-file) once the notes library has loaded, then import each as a new
 * note. Subscribing also signals main to drain its queue.
 */
export function useHostOpenFiles(): void {
  const loaded = useNotesStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) return;
    const subscribe = window.appApi?.onHostOpenFiles;
    if (!subscribe) return;

    let cancelled = false;
    let chain = Promise.resolve();

    const unsubscribe = subscribe((paths) => {
      chain = chain
        .then(async () => {
          if (cancelled) return;
          await importHostOpenFiles(paths);
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loaded]);
}
