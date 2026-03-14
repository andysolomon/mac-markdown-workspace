declare module "html-to-docx" {
  function htmlToDocx(
    html: string,
    headerHtml: string | null,
    options?: Record<string, unknown>,
  ): Promise<ArrayBuffer>;
  export default htmlToDocx;
}
