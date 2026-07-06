/** Shared export dispatch used by the toolbar's Export menu and the mobile
    bottom bar's share menu (issues #2/#3/#9/#12).

    iOS Safari discipline: transient user activation does NOT survive awaits
    (dynamic imports, markdown rendering), and share/download/print must run
    inside a live gesture. So:
    - Import this module STATICALLY from click handlers.
    - Call prepareExport() when the export MENU OPENS (that tap's gesture pays
      for the rendering); by the time the user taps a format, the payload is a
      plain string and delivery happens synchronously inside the second tap.
    - The touch-WebKit PDF path opens its tab synchronously in the click
      call stack. */

export type ExportFormat = "txt" | "pdf" | "docx" | "html";

/** Mutable holder filled in the background after prepareExport(). */
export interface PreparedExport {
  html?: string; // rendered fragment (docx input)
  doc?: string; // complete standalone themed document (html/pdf input)
}

/** Kick off rendering when the export menu opens. Fire-and-forget; the ref
    fills as chunks/rendering finish (typically well before the format tap). */
export function prepareExport(content: string): PreparedExport {
  const prep: PreparedExport = {};
  void (async () => {
    try {
      const { markdownToHtml } = await import("./markdownToHtml");
      prep.html = await markdownToHtml(content);
      const { buildStandaloneHtml } = await import("./exportHtml");
      const { deriveTitle } = await import("./notesModel");
      prep.doc = buildStandaloneHtml(prep.html, deriveTitle(content));
    } catch {
      /* leave prep unfilled; exportDocument falls back to rendering inline */
    }
  })();
  return prep;
}

/** Touch WebKit (iPad/iPhone Safari): iframe print is a no-op there, and
    programmatic downloads are unreliable — PDF goes through a real tab. */
function isTouchWebKit(): boolean {
  return (
    navigator.maxTouchPoints > 1 &&
    /AppleWebKit/.test(navigator.userAgent) &&
    !/Chrome|CriOS/.test(navigator.userAgent)
  );
}

export async function exportDocument(
  format: ExportFormat,
  content: string,
  prep?: PreparedExport,
): Promise<void> {
  // MUST happen before any await, while transient activation is live.
  const pdfTab = format === "pdf" && isTouchWebKit() ? window.open("", "_blank") : null;

  if (format === "txt") {
    // No rendering: the shim's share/download runs inside the tap's stack.
    await window.appApi.exportTxt?.({ content });
    return;
  }

  if (format === "html" && prep?.doc) {
    // Pre-rendered on menu open — delivery starts synchronously in this tap.
    await window.appApi.exportHtml?.({ html: prep.doc });
    return;
  }

  if (format === "pdf" && prep?.doc) {
    if (pdfTab) {
      writeAndPrint(pdfTab, prep.doc);
      return;
    }
    await window.appApi.exportPdf?.({ html: prep.doc });
    return;
  }

  // Fallback: render inline (desktop browsers keep activation; huge notes on
  // iOS may still need a second tap once prepared).
  const html = prep?.html ?? (await (await import("./markdownToHtml")).markdownToHtml(content));
  if (format === "docx") {
    await window.appApi.exportDocx?.({ html });
    return;
  }
  const { buildStandaloneHtml } = await import("./exportHtml");
  const { deriveTitle } = await import("./notesModel");
  const doc = buildStandaloneHtml(html, deriveTitle(content));
  if (format === "html") {
    await window.appApi.exportHtml?.({ html: doc });
    return;
  }
  if (pdfTab) {
    writeAndPrint(pdfTab, doc);
    return;
  }
  await window.appApi.exportPdf?.({ html: doc });
}

function writeAndPrint(tab: Window, doc: string): void {
  // iOS: render into the pre-opened tab and invoke the print controller
  // (Share → Print also offers Save to Files as PDF).
  tab.document.open();
  tab.document.write(doc);
  tab.document.close();
  window.setTimeout(() => {
    try {
      tab.focus();
      tab.print();
    } catch {
      /* tab stays open; the user can print/share from Safari UI */
    }
  }, 250);
}
