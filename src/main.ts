import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import started from "electron-squirrel-startup";
import Store from "electron-store";

if (started) {
  app.quit();
}

const store = new Store() as Store & { get(key: string): unknown; set(key: string, value: unknown): void };
let mainWindow: BrowserWindow | null = null;

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

  // Check dirty state before closing
  mainWindow.on("close", () => {
    // Renderer handles dirty checks via IPC
  });

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
          label: "WYSIWYG Mode",
          accelerator: "CmdOrCtrl+3",
          click: () => sendMenuAction("mode-wysiwyg"),
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

    const htmlDoc = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow: auto; }
  code { font-family: ui-monospace, Menlo, monospace; }
  img { max-width: 100%; }
</style>
</head><body>${payload.html}</body></html>`;

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDoc)}`);
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

  // Notes library — a user-visible folder of .md files in Documents/Mac Markdown.
  const notesDir = () => path.join(app.getPath("documents"), "Mac Markdown");
  const ensureNotesDir = () => fs.mkdir(notesDir(), { recursive: true });
  const notePath = (id: string) => path.join(notesDir(), `${id}.md`);
  const readRawNote = async (id: string) => {
    const full = notePath(id);
    const [body, stat] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
    return { id, body, updatedAt: stat.mtimeMs };
  };

  ipcMain.handle("notes:list", async () => {
    await ensureNotesDir();
    const entries = await fs.readdir(notesDir());
    const notes = [];
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      try {
        notes.push(await readRawNote(name.slice(0, -3)));
      } catch {
        /* skip unreadable files */
      }
    }
    return notes;
  });

  ipcMain.handle("notes:read", async (_event, payload: { id: string }) => {
    try {
      return await readRawNote(payload.id);
    } catch {
      return null;
    }
  });

  ipcMain.handle("notes:create", async (_event, payload: { body: string }) => {
    await ensureNotesDir();
    const id = randomUUID();
    await fs.writeFile(notePath(id), payload.body ?? "", "utf8");
    return readRawNote(id);
  });

  ipcMain.handle("notes:write", async (_event, payload: { id: string; body: string }) => {
    await ensureNotesDir();
    await fs.writeFile(notePath(payload.id), payload.body, "utf8");
    return readRawNote(payload.id);
  });

  ipcMain.handle("notes:delete", async (_event, payload: { id: string }) => {
    try {
      await fs.unlink(notePath(payload.id));
    } catch {
      /* already gone */
    }
  });
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
            "connect-src 'self' ws://localhost:* http://localhost:*",
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
