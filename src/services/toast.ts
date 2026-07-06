/** Minimal toast bus — quiet, single-line confirmations in the system's
    voice (no emoji, short fragments). NotesShell renders the pill. */

export const TOAST_EVENT = "mm-toast";

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}
