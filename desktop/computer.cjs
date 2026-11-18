const { spawn } = require("node:child_process");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
class Computer {
  constructor(workspace, capture, platform = process.platform, runner = null) {
    this.workspace = workspace;
    this.capture = capture;
    this.platform = platform;
    this.runner = runner;
    this.apps = new Set();
    this.snapshot = null;
    this.children = new Set();
    this.epoch = 0;
  }
  cancel() {
    this.epoch++;
    this.snapshot = null;
    for (const c of this.children) c.kill();
    this.children.clear();
  }
  configure(apps) {
    this.cancel();
    this.apps = new Set(apps);
  }
  async call(request) {
    if (this.runner) return this.runner(request);
    const windows = this.platform === "win32";
    if (!windows && this.platform !== "linux")
      throw Error("Use the native Mac app for Mac computer tools.");
    const script = path.join(
      __dirname,
      "native",
      windows ? "windows.ps1" : "linux.py",
    );
    const helper = script.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    const executable = windows
      ? path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : "/usr/bin/python3";
    const args = windows
      ? ["-NoProfile", "-NonInteractive", "-File", helper]
      : [helper];
    const epoch = this.epoch;
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.children.add(child);
      let data = "",
        error = "";
      let settled = false;
      const finish = (e, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.children.delete(child);
        e ? reject(e) : resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(
          Error("Computer tool timed out. No further input will be sent."),
        );
      }, 20000);
      child.stdout.on("data", (b) => {
        data += b;
        if (Buffer.byteLength(data) > 1e6) {
          child.kill();
          finish(Error("Computer snapshot exceeds its limit."));
        }
      });
      child.stderr.on("data", (b) => {
        error = (error + b).slice(-2000);
      });
      child.on("error", (e) =>
        finish(Error("Computer helper unavailable: " + e.message)),
      );
      child.on("close", (code) => {
        try {
          if (epoch !== this.epoch)
            throw Error("Computer operation cancelled.");
          if (code !== 0)
            throw Error(error || data || "Computer helper failed.");
          const value = JSON.parse(data.replace(/^\uFEFF/, ""));
          if (value.error) throw Error(value.error);
          finish(null, value);
        } catch (e) {
          finish(e);
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ ...request, ownPid: process.pid }));
    });
  }
  async status() {
    try {
      return {
        platform: this.platform,
        computerSupported: true,
        ...(await this.call({ operation: "status" })),
      };
    } catch (e) {
      return {
        platform: this.platform,
        computerSupported: true,
        accessibility: false,
        screenRecording: false,
        detail: e.message,
      };
    }
  }
  async runningApps() {
    return this.call({ operation: "apps" });
  }
  require(app) {
    this.workspace.require("computer");
    if (typeof app !== "string" || !this.apps.has(app))
      throw Error("Allow this running app in Access first.");
  }
  async read(a) {
    this.require(a.app);
    const epoch = this.epoch;
    const result = await this.call({
      operation: "read",
      app: a.app,
      include_menus: !!a.include_menus,
    });
    if (epoch !== this.epoch) throw Error("Read cancelled.");
    const elements = new Map();
    let bytes = 0;
    const rows = [];
    for (const row of (result.elements || []).slice(0, 120)) {
      const { locator, ...visible } = row;
      bytes += Buffer.byteLength(JSON.stringify(visible));
      if (bytes > 16000) break;
      rows.push(visible);
      if (locator) elements.set(visible.id, locator);
    }
    const id = randomUUID();
    this.snapshot = { id, app: a.app, elements, created: Date.now() };
    return {
      ...result,
      snapshot: id,
      elements: rows,
      truncated: result.truncated || rows.length !== result.elements.length,
    };
  }
  async action(a) {
    this.require(a.app);
    if (
      ![
        "activate",
        "press",
        "set_text",
        "type",
        "key",
        "click",
        "scroll",
      ].includes(a.operation)
    )
      throw Error("Unsupported computer operation.");
    let locator;
    if (a.operation !== "activate") {
      const s = this.snapshot;
      if (
        !s ||
        s.id !== a.snapshot ||
        s.app !== a.app ||
        Date.now() - s.created > 60000
      )
        throw Error("Read a fresh app snapshot before each action.");
      if (["press", "set_text"].includes(a.operation)) {
        locator = s.elements.get(a.element);
        if (!locator)
          throw Error("Choose a non-secure element from the current snapshot.");
      }
    }
    if (
      a.text !== undefined &&
      (typeof a.text !== "string" || a.text.length > 10000)
    )
      throw Error("Text is limited to 10,000 characters.");
    this.snapshot = null;
    return this.call({
      operation: a.operation,
      app: a.app,
      locator,
      text: a.text,
      x: a.x,
      y: a.y,
      key: a.key,
      modifiers: a.modifiers,
      amount: a.amount,
    });
  }
  async screenshot(a) {
    this.require(a.app);
    const epoch = this.epoch;
    const target = await this.call({ operation: "window", app: a.app });
    if (!target.window)
      throw Error(
        target.detail || "This desktop does not expose a capturable window ID.",
      );
    const result = await this.capture(target);
    if (epoch !== this.epoch) throw Error("Capture cancelled.");
    return { ...result, app: a.app };
  }
}
module.exports = { Computer };
