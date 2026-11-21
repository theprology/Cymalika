const { contextBridge, ipcRenderer } = require("electron");
const channel = process.argv
  .find((a) => a.startsWith("--cymalika-secret-channel="))
  ?.split("=")[1];
contextBridge.exposeInMainWorld("secureEntry", {
  target: (callback) =>
    ipcRenderer.once(channel + "-target", (_event, value) => callback(value)),
  submit: (value) => ipcRenderer.send(channel, value),
});
