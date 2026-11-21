const { BrowserWindow, ipcMain } = require("electron");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
class SecureEntry {
  constructor(parent) {
    this.parent = parent;
    this.active = null;
  }
  cancel() {
    this.active?.finish(null);
  }
  request(target) {
    if (this.active) throw Error("Finish the pending secure entry first.");
    const channel = "cipher-secret-" + randomUUID();
    const parent = this.parent();
    return new Promise((resolve) => {
      const window = new BrowserWindow({
        parent,
        modal: true,
        width: 560,
        height: 430,
        resizable: false,
        title: "Cipher · Secure password entry",
        webPreferences: {
          preload: path.join(__dirname, "secure-entry-preload.cjs"),
          partition: "cipher-secure-" + randomUUID(),
          devTools: false,
          spellcheck: false,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          additionalArguments: ["--cipher-secret-channel=" + channel],
        },
      });
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        ipcMain.removeListener(channel, receive);
        this.active = null;
        if (!window.isDestroyed()) window.destroy();
        resolve(value);
      };
      const receive = (event, value) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          return;
        finish(
          typeof value === "string" && value.length > 0 && value.length <= 4096
            ? value
            : null,
        );
      };
      this.active = { finish };
      ipcMain.on(channel, receive);
      window.removeMenu();
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.on("closed", () => finish(null));
      window.webContents.once("did-finish-load", () =>
        window.webContents.send(
          channel + "-target",
          String(target).slice(0, 1000),
        ),
      );
      window
        .loadFile(path.join(__dirname, "secure-entry.html"))
        .catch(() => finish(null));
    });
  }
}
module.exports = { SecureEntry };
