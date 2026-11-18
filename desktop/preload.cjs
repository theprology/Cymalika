const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cipherDesktop", {
  platform: process.platform,
  postMessage: (message) => ipcRenderer.send("cipher:request", message),
  onReply: (callback) =>
    ipcRenderer.on("cipher:reply", (_event, message) => callback(message)),
  onStream: (callback) =>
    ipcRenderer.on("cipher:stream", (_event, message) => callback(message)),
  onStop: (callback) => ipcRenderer.on("cipher:stop", () => callback()),
});
