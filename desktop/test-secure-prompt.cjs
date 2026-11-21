const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  { EventEmitter } = require("node:events");
(async () => {
  const ipc = new EventEmitter(),
    created = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (...args) => (this.sent = args);
      created.push(this);
    }
    removeMenu() {}
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
    loadFile() {
      return Promise.resolve();
    }
  }
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("./secure-entry.cjs"), "utf8"),
    {
      module: mod,
      __dirname,
      require: (n) =>
        n === "electron" ? { BrowserWindow: Window, ipcMain: ipc } : require(n),
    },
  );
  const prompt = new mod.exports.SecureEntry(() => ({}));
  const result = prompt.request("Website: https://fixture.test");
  const window = created.at(-1);
  const channel =
    window.options.webPreferences.additionalArguments[0].split("=")[1];
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert(!window.options.webPreferences.partition.startsWith("persist:"));
  window.webContents.emit("did-finish-load");
  assert.equal(window.sent[1], "Website: https://fixture.test");
  ipc.emit(
    channel,
    { sender: {}, senderFrame: window.webContents.mainFrame },
    "public-fixture",
  );
  assert(prompt.active);
  ipc.emit(
    channel,
    { sender: window.webContents, senderFrame: {} },
    "public-fixture",
  );
  assert(prompt.active);
  ipc.emit(
    channel,
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    "public-fixture",
  );
  assert.equal(await result, "public-fixture");
  assert(window.destroyed);
  assert.equal(ipc.listenerCount(channel), 0);
  const cancelled = prompt.request("Fixture only");
  prompt.cancel();
  assert.equal(await cancelled, null);
  assert.equal(prompt.active, null);
  console.log(
    "PASS: secure prompt accepts only its own main frame, uses an ephemeral isolated window, clears listeners and cancels without retaining a value.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
