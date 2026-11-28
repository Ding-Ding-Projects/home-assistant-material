const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("buildTools", {
  source: () => ipcRenderer.invoke("source"),
  start: (action, board) => ipcRenderer.invoke("build", action, board),
  cancel: () => ipcRenderer.invoke("cancel"),
  subscribe: handler => ipcRenderer.on("build-event", (_event, update) => handler(update))
});
