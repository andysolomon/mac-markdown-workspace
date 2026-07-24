interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  kind: "directory";
  name: string;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
