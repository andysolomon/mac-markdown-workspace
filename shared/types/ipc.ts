export type OpenFileResult =
  | {
      filePath: string;
      content: string;
    }
  | null;

export type SaveFileResult = { filePath: string };
export type SaveAsFileResult = { filePath: string } | null;

export type ConfirmDiscardResult = "save" | "discard" | "cancel";

export type AppApi = {
  getVersion: () => Promise<string>;
  openFile: () => Promise<OpenFileResult>;
  readFile: (payload: { filePath: string }) => Promise<OpenFileResult>;
  saveFile: (payload: { filePath: string; content: string }) => Promise<SaveFileResult>;
  saveFileAs: (payload: { content: string; defaultPath?: string }) => Promise<SaveAsFileResult>;
  setZoomLevel: (payload: { level: number }) => Promise<{ level: number } | null>;
  getZoomLevel: () => Promise<{ level: number }>;
  getSetting: (key: string) => Promise<unknown>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  onMenuAction: (callback: (action: string) => void) => () => void;
  confirmDiscard: () => Promise<ConfirmDiscardResult>;
  exportTxt: (payload: { content: string }) => Promise<boolean>;
  exportPdf: (payload: { html: string }) => Promise<boolean>;
  exportDocx: (payload: { html: string }) => Promise<boolean>;
  checkDirty: (callback: () => Promise<boolean>) => () => void;
};
