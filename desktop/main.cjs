const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  shell,
  Menu,
  globalShortcut,
} = require("electron");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { realpathSync } = require("node:fs");
const { Workspace, request } = require("./core.cjs");
const { Browser } = require("./browser.cjs");
const { Computer } = require("./computer.cjs");
const captureAllowedWindow = require("./capture.cjs");
let win, workspace, browser, computer;
let stopShortcutRegistered = false;
const stopShortcut =
  process.platform === "darwin"
    ? "Command+Shift+Escape"
    : "Control+Alt+Shift+F12";
const smokeTest = process.argv.includes("--smoke-test");
if (smokeTest) {
  if (!process.env.CIPHER_SMOKE_DATA)
    throw Error("Set an isolated smoke-test data directory.");
  app.setPath("userData", path.resolve(process.env.CIPHER_SMOKE_DATA));
}
const tasks = new Map();
const page = path.resolve(__dirname, "../web/index.html");
function isWorkspacePage(url) {
  try {
    const target = new URL(url);
    if (target.protocol !== "file:" || target.search || target.hash)
      return false;
    const canonical = (file) => {
      const resolved = realpathSync(file);
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    return canonical(fileURLToPath(target)) === canonical(page);
  } catch {
    return false;
  }
}
const reply = (id, result = null, error = null) => {
  if (win && !win.isDestroyed())
    win.webContents.send("cipher:reply", { id, result, error });
};
function cancel() {
  workspace.cancel();
  browser.snapshot = "";
  computer?.cancel();
  for (const c of tasks.values()) c.abort();
  tasks.clear();
}
async function handle(action, a, id) {
  switch (action) {
    case "loadState":
      return workspace.readJSON("state.json", {});
    case "saveState": {
      if (Buffer.byteLength(JSON.stringify(a)) > 8e6)
        throw Error(
          "Chat storage exceeds 8 MB. Export and remove old conversations.",
        );
      await workspace.writeJSON("state.json", a);
      return true;
    }
    case "chooseProject": {
      const r = await dialog.showOpenDialog(win, {
        properties: ["openDirectory"],
        title: "Choose your project",
      });
      if (r.canceled) return null;
      await workspace.select(r.filePaths[0]);
      return {
        path: workspace.root,
        name: path.basename(workspace.root),
        files: await workspace.files(a.excludes),
      };
    }
    case "openProject": {
      const s = await workspace.readJSON("state.json", {});
      if (!s.projects?.some((p) => p.path === a.path))
        throw Error("Choose this folder with Open project first.");
      await workspace.select(a.path);
      return {
        path: workspace.root,
        name: path.basename(workspace.root),
        files: await workspace.files(a.excludes),
      };
    }
    case "listFiles":
      workspace.require("files");
      return workspace.files(a.excludes);
    case "readFile":
      workspace.require("files");
      return workspace.read(a.path);
    case "search":
      workspace.require("files");
      return workspace.search(a.query, a.excludes);
    case "prepareWrite":
      workspace.require("edits");
      return workspace.prepare(a.path, a.content, a.expected_hash);
    case "applyWrite":
      workspace.require("edits");
      return workspace.apply(a.proposal);
    case "rejectWrite":
      workspace.proposals.delete(a.proposal);
      return true;
    case "undo":
      workspace.require("edits");
      return workspace.undo(a.revision);
    case "revisions":
      return workspace.revisions
        .filter((p) => p.root === workspace.root && !p.undone)
        .reverse();
    case "prepareCommand": {
      workspace.require("commands");
      if (!workspace.root) throw Error("Open a project first.");
      if (
        typeof a.command !== "string" ||
        !a.command.trim() ||
        a.command.length > 5000
      )
        throw Error("Invalid command.");
      const id = randomUUID();
      workspace.commands.set(id, { command: a.command, root: workspace.root });
      return { id, command: a.command, cwd: workspace.root };
    }
    case "executeCommand":
      return workspace.command(a.proposal);
    case "request":
    case "stream": {
      const c = new AbortController();
      tasks.set(id, c);
      const timeout = setTimeout(() => c.abort(), 180000);
      try {
        return await request(
          a,
          c.signal,
          action === "stream"
            ? (line) => win.webContents.send("cipher:stream", { id, line })
            : null,
        );
      } finally {
        clearTimeout(timeout);
        tasks.delete(id);
      }
    }
    case "configureAccess": {
      cancel();
      workspace.grants = new Set(a.grants || []);
      workspace.origins = new Set(
        (a.origins || []).map((raw) => {
          const u = new URL(raw);
          if (
            !["https:", "http:"].includes(u.protocol) ||
            u.username ||
            u.password ||
            u.pathname !== "/" ||
            u.search ||
            u.hash
          )
            throw Error("Enter website origins only.");
          return u.origin;
        }),
      );
      if (!workspace.grants.has("browser")) browser.close();
      computer.configure(a.apps || []);
      return computer.status();
    }
    case "accessStatus":
      return {
        ...(await computer.status()),
        emergencyShortcut: stopShortcutRegistered ? stopShortcut : null,
      };
    case "runningApps":
      return computer.runningApps();
    case "requestAccessibility":
    case "requestScreenRecording":
      return computer.status();
    case "computerRead":
      return computer.read(a);
    case "computerAction":
      return computer.action(a);
    case "computerScreenshot":
      return computer.screenshot(a);
    case "browserOpen":
      return browser.open(a.url);
    case "browserRead":
      return browser.read();
    case "browserAction":
      return browser.action(a);
    case "browserScreenshot":
      return browser.capture();
    case "browserShow":
      browser.page();
      browser.window.show();
      return { status: "shown" };
    case "gitRead":
      return workspace.gitRead(a.view);
    case "gitChange":
      return workspace.gitChange(a);
    case "importResource":
    case "importImage": {
      const image = action === "importImage";
      const r = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        title: image ? "Attach an image" : "Import a text resource",
        ...(image
          ? {
              filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
            }
          : {}),
      });
      if (r.canceled) return null;
      const p = r.filePaths[0],
        name = path.basename(p),
        s = await fs.stat(p);
      if (
        !s.isFile() ||
        s.size > (image ? 8e6 : 250000) ||
        /^\.env(?:\.|$)|\.(pem|key)$/i.test(name)
      )
        throw Error("Choose a supported file within the size limit.");
      const data = await fs.readFile(p);
      if (image) {
        const png = data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          jpg = data[0] === 255 && data[1] === 216;
        if (!png && !jpg) throw Error("Choose a PNG or JPEG image.");
        return {
          name,
          mime: png ? "image/png" : "image/jpeg",
          data: data.toString("base64"),
        };
      }
      return {
        name,
        content: new TextDecoder("utf-8", { fatal: true }).decode(data),
      };
    }
    case "exportChat": {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: "Cipher-conversation.md",
      });
      if (r.canceled) return false;
      await fs.writeFile(r.filePath, String(a.content || ""));
      return true;
    }
    case "copyText":
      clipboard.writeText(String(a.text || ""));
      return true;
    case "openExternal": {
      const u = new URL(a.url);
      if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
        throw Error("Invalid web URL.");
      await shell.openExternal(u.href);
      return true;
    }
    case "revealProject":
      if (workspace.root) await shell.openPath(workspace.root);
      return true;
    case "cancel":
      cancel();
      return true;
    default:
      throw Error("Unknown application action.");
  }
}
async function createWindow() {
  workspace = new Workspace(path.join(app.getPath("userData"), "workspace"));
  await workspace.init();
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    title: "Cipher",
    backgroundColor: "#111214",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  browser = new Browser(workspace, win);
  computer = new Computer(workspace, captureAllowedWindow);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) =>
    cb(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  ipcMain.on("cipher:request", async (event, message) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      !isWorkspacePage(event.senderFrame.url)
    )
      return;
    if (
      !message ||
      typeof message.id !== "string" ||
      typeof message.action !== "string" ||
      message.id.length > 100
    )
      return;
    try {
      reply(
        message.id,
        await handle(message.action, message.args || {}, message.id),
      );
    } catch (e) {
      reply(message.id, null, e.message);
    }
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "File", submenu: [{ label: "Quit", role: "quit" }] },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
          { role: "togglefullscreen" },
        ],
      },
    ]),
  );
  await win.loadFile(page);
  stopShortcutRegistered = globalShortcut.register(stopShortcut, () => {
    cancel();
    win.webContents.send("cipher:stop");
  });
}
async function verifyStartup() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await win.webContents.executeJavaScript(
      'Boolean(window.cipherDesktop && document.getElementById("tourDialog")?.open)',
    );
    if (ready) break;
    if (attempt === 99) {
      const state = await win.webContents.executeJavaScript(
        "({url:location.href,bridge:Boolean(window.cipherDesktop),text:document.body.innerText.slice(-3500)})",
      );
      throw Error("First-run tour did not open: " + JSON.stringify(state));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const status = await win.webContents.executeJavaScript(
    'native("accessStatus")',
  );
  if (status.platform !== process.platform || status.computerSupported !== true)
    throw Error("Desktop bridge returned an unexpected platform.");
  if (["win32", "linux"].includes(process.platform) && !status.accessibility)
    throw Error(
      "The packaged computer helper is unavailable: " + status.detail,
    );
  const controls = await win.webContents.executeJavaScript(
    '({title:document.title,help:document.getElementById("helpButton").textContent,steps:tourSteps.length})',
  );
  if (
    controls.title !== "Cipher" ||
    !controls.help.includes("Getting started") ||
    controls.steps !== 9
  )
    throw Error("Workspace controls are incomplete.");
  console.log(
    "PASS: packaged desktop startup, sandboxed preload, native IPC, workspace controls and first-run tour.",
  );
}
app
  .whenReady()
  .then(async () => {
    await createWindow();
    if (smokeTest) {
      await verifyStartup();
      await fs.writeFile(
        path.join(app.getPath("userData"), "startup-result.json"),
        JSON.stringify({ ok: true }),
      );
      app.exit(0);
    }
  })
  .catch(async (error) => {
    console.error(error);
    if (smokeTest)
      await fs.writeFile(
        path.join(app.getPath("userData"), "startup-result.json"),
        JSON.stringify({ ok: false, error: error.stack || String(error) }),
      );
    app.exit(1);
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (workspace) cancel();
  globalShortcut.unregisterAll();
});
