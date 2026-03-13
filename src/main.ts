import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import started from "electron-squirrel-startup";

if (started) {
  app.quit();
}

const createMainWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
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

  return mainWindow;
};

const getFocusedWindow = (): BrowserWindow | null => BrowserWindow.getFocusedWindow();

const registerIpc = (): void => {
  ipcMain.handle("app:get-version", () => app.getVersion());

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
};

app.whenReady().then(() => {
  registerIpc();
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
