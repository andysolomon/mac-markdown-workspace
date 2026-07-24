import { extractTreeFences, parseTree } from "./treeModel";
import { showToast } from "./toast";

/** Materialize the first tree/filesystem fence in a note onto disk. */
export async function scaffoldTreeFromNote(content: string): Promise<void> {
  const fences = extractTreeFences(content);
  if (fences.length === 0) {
    showToast("No tree fence found");
    return;
  }

  const entries = parseTree(fences[0]);
  if (entries.length === 0) {
    showToast("Tree is empty");
    return;
  }

  const result = await window.appApi?.materializeTree?.({ entries });
  if (!result) {
    showToast("Scaffold failed");
    return;
  }
  if (result.canceled) {
    showToast("Scaffold canceled");
    return;
  }
  if (result.ok) {
    showToast(result.rootPath ? `Scaffolded at ${result.rootPath}` : "Scaffolded folders");
    return;
  }
  showToast(result.error ?? "Scaffold failed");
}
