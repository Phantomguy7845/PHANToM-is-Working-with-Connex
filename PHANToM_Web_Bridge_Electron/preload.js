const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridgeAPI", {
  getInfo: () => ipcRenderer.invoke("get-info"),
  setPort: (port) => ipcRenderer.invoke("set-port", port),
  openAtLogin: (on) => ipcRenderer.invoke("open-at-login", on),
  relaunch: () => ipcRenderer.invoke("relaunch"),
  getReleasesURL: () => ipcRenderer.invoke("get-releases-url")
});
