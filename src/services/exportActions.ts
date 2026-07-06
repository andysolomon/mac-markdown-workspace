/** Shared export dispatch used by the toolbar's Export menu and the mobile
    bottom bar's share menu (issues #2/#3/#9/#12).

    Import this module STATICALLY from click handlers: on iOS Safari the
    user-gesture (transient activation) does not survive dynamic-import
    awaits, and the PDF path must open its tab synchronously in the click
    call stack. */

export type ExportFormat = "txt" | "pdf" | "docx" | "html";

/** Touch WebKit (iPad/iPhone Safari): iframe print is a no-op there, and
    programmatic downloads are unreliable — PDF goes through a real tab. */
function isTouchWebKit(): boolean {
  return (
    navigator.maxTouchPoints > 1 &&
    /AppleWebKit/.test(navigator.userAgent) &&
    !/Chrome|CriOS/.test(navigator.userAgent)
  );
}

export async function exportDocument(format: ExportFormat, content: string): Promise<void> {
  // MUST happen before any await, while transient activation is live.
  const pdfTab = format === "pdf" && isTouchWebKit() ? window.open("", "_blank") : null;

  if (format === "txt") {
    await window.appApi.exportTxt?.({ content });
    return;
  }
  const { markdownToHtml } = await import("./markdownToHtml");
  const html = await markdownToHtml(content);
  if (format === "docx") {
    await window.appApi.exportDocx?.({ html });
    return;
  }
  // HTML and PDF take a complete standalone themed document.
  const { buildStandaloneHtml } = await import("./exportHtml");
  const { deriveTitle } = await import("./notesModel");
  const doc = buildStandaloneHtml(html, deriveTitle(content));
  if (format === "html") {
    await window.appApi.exportHtml?.({ html: doc });
    return;
  }
  if (pdfTab) {
    // iOS: render into the pre-opened tab and invoke the print controller
    // (Share → Print also offers Save to Files as PDF).
    pdfTab.document.open();
    pdfTab.document.write(doc);
    pdfTab.document.close();
    window.setTimeout(() => {
      try {
        pdfTab.focus();
        pdfTab.print();
      } catch {
        /* tab stays open; the user can print/share from Safari UI */
      }
    }, 250);
    return;
  }
  await window.appApi.exportPdf?.({ html: doc });
}
