const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cymalikaDesktop", {
  platform: process.platform,
  postMessage: (message) => ipcRenderer.send("cymalika:request", message),
  onReply: (callback) =>
    ipcRenderer.on("cymalika:reply", (_event, message) => callback(message)),
  onStream: (callback) =>
    ipcRenderer.on("cymalika:stream", (_event, message) => callback(message)),
  onStop: (callback) => ipcRenderer.on("cymalika:stop", () => callback()),
});
