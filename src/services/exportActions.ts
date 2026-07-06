/** Shared export dispatch used by the toolbar's Export menu and the mobile
    bottom bar's share menu (issues #2/#3/#9). */

export type ExportFormat = "txt" | "pdf" | "docx" | "html";

export async function exportDocument(format: ExportFormat, content: string): Promise<void> {
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
  } else {
    await window.appApi.exportPdf?.({ html: doc });
  }
}
