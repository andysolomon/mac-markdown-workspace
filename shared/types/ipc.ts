export type OpenFileResult =
  | {
      filePath: string;
      content: string;
    }
  | null;

export type SaveFileResult = { filePath: string };
export type SaveAsFileResult = { filePath: string } | null;

export type AppApi = {
  getVersion: () => Promise<string>;
  openFile: () => Promise<OpenFileResult>;
  saveFile: (payload: { filePath: string; content: string }) => Promise<SaveFileResult>;
  saveFileAs: (payload: { content: string; defaultPath?: string }) => Promise<SaveAsFileResult>;
  setZoomLevel: (payload: { level: number }) => Promise<{ level: number } | null>;
  getZoomLevel: () => Promise<{ level: number }>;
};
