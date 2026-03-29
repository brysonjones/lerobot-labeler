import { app, BrowserWindow, dialog, ipcMain, net } from "electron";
import path from "path";
import { PythonManager } from "./python-manager";

const BACKEND_URL = "http://127.0.0.1:8976";

let mainWindow: BrowserWindow | null = null;
let pythonManager: PythonManager | null = null;
let forceQuit = false;

/** Ask the backend how many episodes are pending deletion. Returns 0 on error. */
async function getPendingDeletionCount(): Promise<number> {
  try {
    const resp = await net.fetch(`${BACKEND_URL}/api/datasets/session`);
    if (!resp.ok) return 0;
    const data = (await resp.json()) as { deleted_episodes: number[] };
    return data.deleted_episodes.length;
  } catch {
    return 0;
  }
}

/** Tell the backend to export (apply pending deletions). */
async function exportDataset(): Promise<void> {
  await net.fetch(`${BACKEND_URL}/api/datasets/export`, { method: "POST" });
}

async function createWindow(isDev: boolean = false) {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    title: "LeRobot Labeler",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // IPC: Native directory picker
  ipcMain.handle("dialog:openDirectory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select LeRobot Dataset Directory",
    });
    return result.filePaths[0] || null;
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }

  if (process.env.DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "bottom" });
  }

  // Intercept close to check for unsaved changes
  mainWindow.on("close", (e) => {
    if (forceQuit || !mainWindow) return;

    e.preventDefault();

    getPendingDeletionCount().then(async (count) => {
      if (count === 0) {
        forceQuit = true;
        mainWindow?.close();
        return;
      }

      const { response } = await dialog.showMessageBox(mainWindow!, {
        type: "question",
        title: "Unsaved Changes",
        message: `You have ${count} episode${count === 1 ? "" : "s"} pending deletion.`,
        detail:
          "Would you like to export the dataset before quitting? This will re-encode video files and may take a few minutes.",
        buttons: ["Export & Quit", "Quit Without Saving", "Cancel"],
        defaultId: 0,
        cancelId: 2,
      });

      if (response === 2) {
        // Cancel: do nothing
        return;
      }

      if (response === 0) {
        // Export & Quit
        try {
          await exportDataset();
        } catch (err) {
          console.error("Export failed during quit:", err);
        }
      }

      // Quit (with or without export)
      forceQuit = true;
      mainWindow?.close();
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const isDev = !app.isPackaged;

  // Start Python backend
  pythonManager = new PythonManager(isDev);
  try {
    await pythonManager.start();
  } catch (err) {
    console.error("Failed to start Python backend:", err);
    // Continue anyway; user may have started it manually
  }

  await createWindow(isDev);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(isDev);
    }
  });
});

app.on("window-all-closed", () => {
  pythonManager?.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  pythonManager?.stop();
});
