import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import started from "electron-squirrel-startup";
import Store from "electron-store";
import type { CloseFlushResult } from "../shared/types/ipc";
import { createNotesFileStore } from "./services/notesFileStore";
import {
  CLOSE_FLUSH_TIMEOUT_MS,
  negotiateClose,
  normalizeFlushResult,
  type FailureChoice,
} from "./services/closeHandshake";

if (started) {
  app.quit();
}

const store = new Store() as Store & { get(key: string): unknown; set(key: string, value: unknown): void };
let mainWindow: BrowserWindow | null = null;
let quitRequested = false;
let quitAllowed = false;
let requestCloseFromGuard: (() => void) | null = null;
let closeRequestSequence = 0;

/**
 * Ask the renderer to flush every pending/in-flight note save (issue #27).
 * Each request has a nonce so a late response from a timed-out attempt cannot
 * approve a later close attempt. Silence is a failure, never permission to
 * close.
 */
const requestRendererFlush = (win: BrowserWindow): Promise<CloseFlushResult> =>
  new Promise((resolve) => {
    const wc = win.webContents;
    const requestId = ++closeRequestSequence;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      ipcMain.removeListener("dirty-check-response", onResponse);
      resolve(normalizeFlushResult(value));
    };
    const onResponse = (event: Electron.IpcMainEvent, value: unknown) => {
      if (event.sender !== wc) return;
      // New preload versions wrap the result with the request id. Accept a
      // legacy bare result as well; there is only one window in this app.
      if (value && typeof value === "object" && "requestId" in value) {
        const response = value as { requestId?: unknown; result?: unknown };
        if (response.requestId !== requestId) return;
        finish(response.result);
        return;
      }
      finish(value);
    };
    timer = setTimeout(
      () => finish({ ok: false, error: "The editor didn't confirm that your notes were saved." }),
      CLOSE_FLUSH_TIMEOUT_MS,
    );
    ipcMain.on("dirty-check-response", onResponse);
    try {
      wc.send("check-dirty", requestId);
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

const promptSaveFailure = async (win: BrowserWindow, error: string): Promise<FailureChoice> => {
  try {
    const result = await dialog.showMessageBox(win, {
      type: "error",
      buttons: ["Try Again", "Discard Changes", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      message: "Your latest changes couldn't be saved.",
      detail: `${error}\n\nYour edits are still in the editor. Try again, or discard them to close anyway.`,
    });
    const map: FailureChoice[] = ["retry", "discard", "cancel"];
    return map[result.response] ?? "cancel";
  } catch {
    // A destroyed/unavailable native dialog must not turn a failed save into
    // an implicit discard.
    return "cancel";
  }
};

/** Gate window close/quit on a successful renderer flush (issue #27). */
const installCloseGuard = (win: BrowserWindow) => {
  let approved = false;
  let negotiating = false;

  const beginNegotiation = () => {
    if (negotiating || win.isDestroyed()) return;
    negotiating = true;
    const wc = win.webContents;
    const flush = (): Promise<CloseFlushResult> =>
      wc.isDestroyed() || wc.isCrashed()
        ? Promise.resolve({ ok: false, error: "The editor is unavailable to save your changes." })
        : requestRendererFlush(win);
    void negotiateClose(flush, (error) => promptSaveFailure(win, error)).then(
      (decision) => {
        negotiating = false;
        if (decision !== "close") {
          quitRequested = false;
          return;
        }

        approved = true;
        if (quitRequested) {
          // before-quit was prevented on the first attempt; resume it only
          // after the renderer has confirmed persistence.
          quitAllowed = true;
          app.quit();
        } else if (!win.isDestroyed()) {
          win.close();
        }
      },
      () => {
        negotiating = false;
        quitRequested = false;
      },
    );
  };

  requestCloseFromGuard = beginNegotiation;
  win.on("closed", () => {
    if (requestCloseFromGuard === beginNegotiation) requestCloseFromGuard = null;
  });
  win.on("close", (event) => {
    if (approved) return;
    event.preventDefault();
    beginNegotiation();
  });
};

const createMainWindow = (): BrowserWindow => {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: "Mac Markdown Workspace",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Block close/quit until pending note saves have persisted (issue #27).
  installCloseGuard(mainWindow);

  return mainWindow;
};

const getFocusedWindow = (): BrowserWindow | null => BrowserWindow.getFocusedWindow();

const sendMenuAction = (action: string) => {
  const win = getFocusedWindow() ?? mainWindow;
  win?.webContents.send("menu:action", action);
};

const buildAppMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuAction("new-file"),
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuAction("open-file"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuAction("save-file"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuAction("save-file-as"),
        },
        { type: "separator" },
        {
          label: "Export as Text",
          click: () => sendMenuAction("export-txt"),
        },
        {
          label: "Export as PDF",
          click: () => sendMenuAction("export-pdf"),
        },
        {
          label: "Export as Word",
          click: () => sendMenuAction("export-docx"),
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Source Mode",
          accelerator: "CmdOrCtrl+1",
          click: () => sendMenuAction("mode-source"),
        },
        {
          label: "Split Mode",
          accelerator: "CmdOrCtrl+2",
          click: () => sendMenuAction("mode-split"),
        },
        {
          label: "Preview Mode",
          accelerator: "CmdOrCtrl+3",
          click: () => sendMenuAction("mode-preview"),
        },
        { type: "separator" },
        {
          label: "Toggle Theme",
          click: () => sendMenuAction("toggle-theme"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    {
      label: "Help",
      submenu: [],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const registerIpc = (): void => {
  ipcMain.handle("app:get-version", () => app.getVersion());

  // Settings
  ipcMain.handle("settings:get", (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    store.set(key, value);
  });

  // Confirm discard dialog
  ipcMain.handle("dialog:confirm-discard", async () => {
    const win = getFocusedWindow();
    const result = await dialog.showMessageBox(win ?? undefined, {
      type: "warning",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      message: "You have unsaved changes.",
      detail: "Do you want to save your changes before proceeding?",
    });
    const map = ["save", "discard", "cancel"] as const;
    return map[result.response];
  });

  // File operations
  ipcMain.handle("file:open", async () => {
    const window = getFocusedWindow();
    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: "Open Markdown File",
      properties: ["openFile"],
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, "utf8");
    return { filePath, content };
  });

  // Read a file by path (used for drag-and-drop)
  ipcMain.handle("file:read", async (_event, payload: { filePath: string }) => {
    try {
      const content = await fs.readFile(payload.filePath, "utf8");
      return { filePath: payload.filePath, content };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "file:save",
    async (_event, payload: { filePath: string; content: string }) => {
      await fs.writeFile(payload.filePath, payload.content, "utf8");
      return { filePath: payload.filePath };
    },
  );

  ipcMain.handle(
    "file:save-as",
    async (_event, payload: { content: string; defaultPath?: string }) => {
      const window = getFocusedWindow();
      const result = await dialog.showSaveDialog(window ?? undefined, {
        title: "Save Markdown File",
        defaultPath: payload.defaultPath,
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Text", extensions: ["txt"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      await fs.writeFile(result.filePath, payload.content, "utf8");
      return { filePath: result.filePath };
    },
  );

  ipcMain.handle("view:set-zoom", (_event, payload: { level: number }) => {
    const window = getFocusedWindow();
    if (!window) return null;
    window.webContents.setZoomLevel(payload.level);
    return { level: payload.level };
  });

  ipcMain.handle("view:get-zoom", () => {
    const window = getFocusedWindow();
    if (!window) return { level: 0 };
    return { level: window.webContents.getZoomLevel() };
  });

  // Export: TXT
  ipcMain.handle("export:txt", async (_event, payload: { content: string }) => {
    const win = getFocusedWindow();
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: "Export as Text",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, payload.content, "utf8");
    return true;
  });

  // Export: PDF
  ipcMain.handle("export:pdf", async (_event, payload: { html: string }) => {
    const win = getFocusedWindow();
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: "Export as PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return false;

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    // payload.html is a complete standalone document built by the renderer
    // (src/services/exportHtml.ts), already carrying the active theme.
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`);
    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: "default" },
    });
    await fs.writeFile(result.filePath, pdfData);
    printWin.destroy();
    return true;
  });

  // Export: DOCX
  ipcMain.handle("export:docx", async (_event, payload: { html: string }) => {
    const win = getFocusedWindow();
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: "Export as Word Document",
      filters: [{ name: "Word Document", extensions: ["docx"] }],
    });
    if (result.canceled || !result.filePath) return false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const htmlToDocx = (await import("html-to-docx")).default;
      const docxBuffer = await htmlToDocx(payload.html, null, {
        table: { row: { cantSplit: true } },
      });
      await fs.writeFile(result.filePath, Buffer.from(docxBuffer as ArrayBuffer));
      return true;
    } catch (err) {
      console.error("DOCX export failed:", err);
      return false;
    }
  });

  // Export: HTML (payload.html is a complete standalone document)
  ipcMain.handle("export:html", async (_event, payload: { html: string }) => {
    const win = getFocusedWindow();
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: "Export as Web Page",
      filters: [{ name: "Web Page", extensions: ["html"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, payload.html, "utf8");
    return true;
  });

  // Notes library — a user-visible folder of .md files in Documents/Mac
  // Markdown. Writes are atomic (temp file + rename in the same directory)
  // and serialized per note / for the tombstone sidecar (issue #27). The
  // tombstone sidecar is hidden; updatedAt rides on each file's mtime, set
  // via utimes when a vault pull supplies a canonical timestamp.
  const notes = createNotesFileStore({
    dir: () => path.join(app.getPath("documents"), "Mac Markdown"),
  });

  ipcMain.handle("notes:list", () => notes.listNotes());

  ipcMain.handle("notes:read", (_event, payload: { id: string }) => notes.readNote(payload.id));

  ipcMain.handle("notes:create", (_event, payload: { body: string }) =>
    notes.createNote(payload.body ?? ""),
  );

  ipcMain.handle(
    "notes:write",
    (_event, payload: { id: string; body: string; updatedAt?: number }) => notes.writeNote(payload),
  );

  ipcMain.handle("notes:delete", (_event, payload: { id: string }) => notes.deleteNote(payload.id));

  ipcMain.handle("notes:tombstones:list", () => notes.listTombstones());

  ipcMain.handle("notes:tombstones:record", (_event, payload: { id: string; deletedAt: number }) =>
    notes.recordTombstone(payload.id, payload.deletedAt),
  );

  ipcMain.handle("notes:tombstones:clear", (_event, payload: { ids: string[] }) =>
    notes.clearTombstones(payload.ids),
  );

  const isPathInsideRoot = (root: string, target: string): boolean => {
    const rel = path.relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };

  ipcMain.handle(
    "tree:materialize",
    async (
      _event,
      payload: { entries: Array<{ relativePath: string; kind: "file" | "dir" }> },
    ) => {
      const win = getFocusedWindow();
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: "Choose scaffold folder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }

      const rootPath = path.resolve(result.filePaths[0]);
      const sorted = [...payload.entries].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        const depthA = a.relativePath.split("/").length;
        const depthB = b.relativePath.split("/").length;
        return depthA - depthB || a.relativePath.localeCompare(b.relativePath);
      });

      try {
        for (const entry of sorted) {
          const segments = entry.relativePath.split("/").filter(Boolean);
          if (segments.length === 0) continue;
          if (segments.some((seg) => seg === ".." || seg === ".")) {
            return { ok: false, error: "Invalid path in tree" };
          }

          const target =
            entry.kind === "dir"
              ? path.resolve(rootPath, ...segments)
              : path.resolve(rootPath, ...segments);
          if (!isPathInsideRoot(rootPath, target)) {
            return { ok: false, error: "Path escapes scaffold root" };
          }

          if (entry.kind === "dir") {
            await fs.mkdir(target, { recursive: true });
            continue;
          }

          const dir = path.dirname(target);
          await fs.mkdir(dir, { recursive: true });
          try {
            await fs.access(target);
            continue;
          } catch {
            await fs.writeFile(target, "", "utf8");
          }
        }
        return { ok: true, rootPath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Scaffold failed" };
      }
    },
  );
};

const setupCSP = () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://mac-markdown-workspace.vercel.app ws://localhost:* http://localhost:*",
          ].join("; "),
        ],
      },
    });
  });
};

app.whenReady().then(() => {
  setupCSP();
  registerIpc();
  buildAppMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Cmd+Q / app.quit(): stop Electron from closing the window before the
// renderer has flushed its saves. The guard resumes the quit after success or
// leaves the window open after a failure/cancel.
app.on("before-quit", (event) => {
  if (quitAllowed) {
    quitAllowed = false;
    return;
  }
  if (!requestCloseFromGuard || !mainWindow || mainWindow.isDestroyed()) return;
  event.preventDefault();
  quitRequested = true;
  requestCloseFromGuard();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
