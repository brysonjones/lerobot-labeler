import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),
});
