const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  shell,
  Menu,
  globalShortcut,
  powerSaveBlocker,
} = require("electron");
const { ModelLibrary } = require("./model-library.cjs");
let modelLibrary;
const { SecureEntry } = require("./secure-entry.cjs");
const secureEntry = new SecureEntry(() => win);
const { CoffeeAwake } = require("./coffee.cjs");
const coffee = new CoffeeAwake(powerSaveBlocker);
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { realpathSync } = require("node:fs");
const { Workspace, request } = require("./core.cjs");
const { Browser } = require("./browser.cjs");
const { Computer } = require("./computer.cjs");
const { PersonalFiles } = require("./personal-files.cjs");
const { resetAfterRendererFailure } = require("./recovery.cjs");
const captureAllowedWindow = require("./capture.cjs");
let win, workspace, browser, computer, personalFiles;
let computerBaseGrants = new Set(["files", "edits", "commands", "git"]);
let rendererNotice = "",
  quitting = false;
let stopShortcutRegistered = false;
const stopShortcut =
  process.platform === "darwin"
    ? "Command+Shift+Escape"
    : "Control+Alt+Shift+F12";
const smokeTest = process.argv.includes("--smoke-test");
if (smokeTest) {
  if (!process.env.CYMALIKA_SMOKE_DATA)
    throw Error("Set an isolated smoke-test data directory.");
  app.setPath("userData", path.resolve(process.env.CYMALIKA_SMOKE_DATA));
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
    win.webContents.send("cymalika:reply", { id, result, error });
};
function cancel() {
  secureEntry.cancel();
  workspace.cancel();
  personalFiles?.cancel();
  browser.snapshot = "";
  browser.denyPermissions(false);
  computer?.cancel();
  for (const c of tasks.values()) c.abort();
  tasks.clear();
}
function requireComputerAccess() {
  if (!workspace.fullComputer) throw Error("Turn on Computer access first.");
}
async function handle(action, a, id) {
  switch (action) {
    case "modelLibrary":
      return modelLibrary.handle(a);
    case "coffeeStatus":
      return { enabled: coffee.enabled };
    case "setCoffee":
      return coffee.setEnabled(a.enabled);
    case "loadState": {
      const state = await workspace.readJSON("state.json", {});
      if (rendererNotice) {
        state.runtimeNotice = rendererNotice;
        rendererNotice = "";
      }
      return state;
    }
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
      return workspace.search(a.query, a.excludes, a.path_contains);
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
            ? (line) => win.webContents.send("cymalika:stream", { id, line })
            : null,
        );
      } finally {
        clearTimeout(timeout);
        tasks.delete(id);
      }
    }
    case "setComputerAccess": {
      if (typeof a.enabled !== "boolean")
        throw Error("Computer access needs an on/off value.");
      cancel();
      if (a.enabled && !workspace.fullComputer)
        computerBaseGrants = new Set(
          [...workspace.grants].filter((grant) =>
            ["files", "edits", "commands", "git"].includes(grant),
          ),
        );
      workspace.fullComputer = a.enabled;
      workspace.grants = a.enabled
        ? new Set(["files", "edits", "commands", "git", "browser", "computer"])
        : new Set(computerBaseGrants);
      workspace.origins = new Set();
      computer.configure([]);
      if (!a.enabled) browser.close();
      await personalFiles.init();
      return {
        enabled: a.enabled,
        home: personalFiles.home,
        ...(await computer.status()),
      };
    }
    case "computerApps":
      requireComputerAccess();
      return {
        running: await computer.runningApps(),
        available: await computer.call({ operation: "installed" }),
      };
    case "computerOpenApp":
      requireComputerAccess();
      return computer.call({ operation: "launch", app: a.app });
    case "computerFiles":
      requireComputerAccess();
      return personalFiles.inspect(a.operation, a.path);
    case "prepareComputerWrite":
      requireComputerAccess();
      return personalFiles.prepare(a);
    case "applyComputerWrite":
      requireComputerAccess();
      return personalFiles.workspace.apply(a.proposal);
    case "undoComputerWrite":
      requireComputerAccess();
      return personalFiles.workspace.undo(a.revision);
    case "prepareComputerCommand": {
      requireComputerAccess();
      const cwd = await personalFiles.directory(a.cwd);
      if (
        typeof a.command !== "string" ||
        !a.command.trim() ||
        a.command.length > 5000
      )
        throw Error("Invalid command.");
      const key = randomUUID();
      personalFiles.workspace.commands.set(key, {
        command: a.command,
        root: personalFiles.home,
        cwd,
      });
      return { id: key, command: a.command, cwd };
    }
    case "executeComputerCommand":
      requireComputerAccess();
      return personalFiles.workspace.command(a.proposal);
    case "configureAccess": {
      workspace.fullComputer = false;
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
    case "fillPassword":
      if (a.target === "browser") return browser.fillPassword(a);
      if (a.target === "computer") return computer.fillPassword(a);
      throw Error("Choose browser or computer for password entry.");
    case "computerAction":
      return computer.action(a);
    case "computerScreenshot":
      return computer.screenshot(a);
    case "browserOpen":
      return browser.open(a.url);
    case "browserRead":
      return browser.read();
    case "browserPermissionDetails":
      return browser.permissionDetails(a);
    case "browserPermission":
      return browser.permission(a);
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
        defaultPath: "CyMalika-conversation.md",
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
  if (!smokeTest) {
    const { migrateProfile } = require("./migration.cjs");
    await migrateProfile(app.getPath("userData"), [
      path.join(app.getPath("appData"), "cipher-workspace"),
      path.join(app.getPath("appData"), "Cipher"),
    ]);
  }
  modelLibrary = new ModelLibrary(
    path.join(app.getPath("userData"), "local-models"),
  );
  workspace = new Workspace(path.join(app.getPath("userData"), "workspace"));
  await workspace.init();
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    title: "CyMalika",
    backgroundColor: "#111214",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  personalFiles = new PersonalFiles(
    path.join(app.getPath("userData"), "computer-files"),
  );
  browser = new Browser(workspace, win);
  computer = new Computer(workspace, captureAllowedWindow);
  browser.passwordPrompt = (target) => secureEntry.request(target);
  computer.passwordPrompt = (target) => secureEntry.request(target);
  win.webContents.on("render-process-gone", () => {
    if (quitting || win.isDestroyed()) return;
    coffee.stop();
    rendererNotice = resetAfterRendererFailure(cancel, workspace, computer);
    browser.close();
    win
      .loadFile(page)
      .catch((error) =>
        dialog.showErrorBox("CyMalika could not reload", error.message),
      );
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _p, cb) =>
    cb(false),
  );
  win.webContents.session.setPermissionCheckHandler(() => false);
  ipcMain.on("cymalika:request", async (event, message) => {
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
    win.webContents.send("cymalika:stop");
  });
}
async function verifyStartup() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await win.webContents.executeJavaScript(
      'Boolean(window.cymalikaDesktop && document.getElementById("tourDialog")?.open)',
    );
    if (ready) break;
    if (attempt === 99) {
      const state = await win.webContents.executeJavaScript(
        "({url:location.href,bridge:Boolean(window.cymalikaDesktop),text:document.body.innerText.slice(-3500)})",
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
    controls.title !== "CyMalika" ||
    !controls.help.includes("Getting started") ||
    controls.steps !== 9
  )
    throw Error("Workspace controls are incomplete.");
  const fixtureRoot = path.join(app.getPath("userData"), "startup-project");
  await fs.mkdir(path.join(fixtureRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(fixtureRoot, "src/one.py"),
    "def one():\n    return 1\n",
  );
  await fs.writeFile(
    path.join(fixtureRoot, "src/two.js"),
    "export const two = 2;\n",
  );
  await fs.writeFile(
    path.join(fixtureRoot, "README.md"),
    "# Startup fixture\n",
  );
  await workspace.select(fixtureRoot);
  const fixtureFiles = await workspace.files();
  const featureChecks = await win.webContents.executeJavaScript(`(async () => {
    const check = (condition, description) => { if (!condition) throw Error(description); };
    $("tourDialog").close();
    const originalName = settings.assistantName;
    settings.assistantName = "Atlas"; paintIdentity();
    check($("assistantBrand").textContent === "Atlas", "Assistant name did not update");
    check(!Object.hasOwn(connectionSettings({...settings,apiKey:"fixture-session-key"}),"apiKey"), "Connection profile contains an API key");
    check(!Object.hasOwn(connectionSettings(settings),"assistantName"), "Model connection overwrites assistant identity");
    settings.assistantName = originalName; paintIdentity();
    check(Array.isArray(await native("modelLibrary",{operation:"jobs"})), "Native model-library bridge unavailable");
    libraryTab = "connections"; await renderModelLibrary();
    check($("modelLibraryBody").querySelector('[aria-label="Runtime"]').options.length === 7, "Runtime connection choices did not render");
    check($("modelLibraryBody").querySelector('[aria-label="API key (optional, session only)"]').type === "password", "Runtime key field is not protected");
    libraryTab = "download"; await renderModelLibrary();
    check($("modelLibraryBody").querySelector('[aria-label="Model source"]').value === "huggingface", "All-format model discovery is not the default");
    check($("modelLibraryBody").querySelector('[aria-label="Find a model"]'), "Model link/search field did not render");
    $("coffeeSwitch").checked = true;
    await toggleCoffee();
    check(coffeeEnabled && coffeeSipVisible, "Coffee did not show its brief sip animation");
    check(!document.getElementById("coffeeStage") && !document.getElementById("coffeeShowAnimation"), "Legacy Coffee screen or replay control remains");
    check((await native("coffeeStatus")).enabled, "Native keep-awake registration failed");
    check($("coffeeSip").textContent.includes("Thanks man"), "Coffee thank-you message missing");
    check(getComputedStyle($("coffeeSip")).pointerEvents === "none", "Coffee splash intercepts input");
    for (let attempt=0; attempt<140 && coffeeSipVisible; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
    check(!coffeeSipVisible && $("coffeeSip").classList.contains("hidden"), "Sip animation did not dismiss itself");
    check(coffeeEnabled && (await native("coffeeStatus")).enabled, "Automatic dismissal stopped Coffee");
    chooseCoffeeColour(2);
    const red = getComputedStyle(document.body).backgroundColor;
    chooseCoffeeColour(1);
    const green = getComputedStyle(document.body).backgroundColor;
    check(red !== green && document.body.dataset.appColour === "green", "Palette did not change the whole app");
    $("coffeeSwitch").checked = false;
    await toggleCoffee();
    check(!(await native("coffeeStatus")).enabled, "Native keep-awake registration was not released");
    check(getComputedStyle(document.body).backgroundColor === green, "Palette incorrectly depends on Coffee being enabled");
    const originalSend = send;
    let sent = 0;
    try {
      send = () => { sent++; };
      const enter = new KeyboardEvent("keydown", {key:"Enter",bubbles:true,cancelable:true});
      $("prompt").dispatchEvent(enter);
      const shift = new KeyboardEvent("keydown", {key:"Enter",shiftKey:true,bubbles:true,cancelable:true});
      $("prompt").dispatchEvent(shift);
      const composing = new KeyboardEvent("keydown", {key:"Enter",isComposing:true,bubbles:true,cancelable:true});
      $("prompt").dispatchEvent(composing);
      check(sent === 1 && enter.defaultPrevented && !shift.defaultPrevented && !composing.defaultPrevented, "Composer keyboard handling failed");
    } finally { send = originalSend; }
    await activateProject(${JSON.stringify({ path: fixtureRoot, name: "Startup fixture", files: fixtureFiles })});
    check(document.querySelectorAll("#files .explorer-folder").length === 1, "Explorer did not group the source folder");
    await preview("src/one.py");
    check($("fileHighlighted").textContent === ${JSON.stringify("def one():\n    return 1\n")}, "Source text changed in the viewer");
    check($("editorLines").textContent === ${JSON.stringify("1\n2\n3")}, "Source line numbers are incorrect");
    $("editFileToggle").click();
    $("fileContent").value = "local draft";
    $("fileContent").dispatchEvent(new Event("input"));
    await preview("src/two.js"); await preview("src/one.py");
    check($("fileContent").value === "local draft" && openFileTabs.size === 2, "Switching tabs discarded a draft");
    check((await native("readFile", {path:"src/one.py"})).content.includes("return 1"), "A draft was written without review");
    $("discardFileEdits").click();
    const before = document.querySelector(".sidebar").getBoundingClientRect().width;
    resizeExplorer(300); $("widenExplorer").click();
    check(settings.explorerWidth > 300, "Explorer widening control did not work");
    check(document.querySelector(".sidebar").getBoundingClientRect().width !== before, "Explorer width did not update on screen");
    closeFileViewer();
    return {coffee:true,appPalette:true,keyboard:true,explorer:true,sourceTabs:true,draftIsolation:true};
  })()`);
  if (coffee.enabled)
    throw Error("Startup checks leaked a keep-awake registration.");
  console.log(
    "PASS: packaged startup, IPC, Coffee on/off, app-wide palette, Enter/Shift+Enter, Explorer, source tabs and draft isolation.",
  );
  return {
    platform: process.platform,
    version: app.getVersion(),
    checks: featureChecks,
  };
}
app
  .whenReady()
  .then(async () => {
    await createWindow();
    if (smokeTest) {
      const result = await verifyStartup();
      await fs.writeFile(
        path.join(app.getPath("userData"), "startup-result.json"),
        JSON.stringify({ ok: true, ...result }),
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
  quitting = true;
  coffee.stop();
  modelLibrary?.close();
  if (workspace) cancel();
  globalShortcut.unregisterAll();
});
