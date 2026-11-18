const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { TextDecoder } = require("node:util");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const id = () => crypto.randomUUID();
const decoder = new TextDecoder("utf-8", { fatal: true });
const excluded = (name) =>
  [".git", ".ssh", ".aws"].includes(name.toLowerCase()) ||
  /^\.env(?:\.|$)/i.test(name) ||
  /\.(pem|key)$/i.test(name);
class Workspace {
  constructor(storage) {
    this.storage = storage;
    this.root = null;
    this.proposals = new Map();
    this.revisions = [];
    this.commands = new Map();
    this.children = new Set();
    this.epoch = 0;
    this.grants = new Set(["files", "edits", "commands", "git"]);
    this.origins = new Set();
  }
  require(cap) {
    if (!this.grants.has(cap))
      throw Error("Enable " + cap + " access for this session first.");
  }
  async init() {
    await fs.mkdir(this.storage, { recursive: true });
  }
  async readJSON(name, fallback) {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.storage, name), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT" || e instanceof SyntaxError) return fallback;
      throw e;
    }
  }
  async writeJSON(name, value) {
    const dest = path.join(this.storage, name),
      tmp = dest + "." + id() + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(tmp, dest);
  }
  async select(folder) {
    const root = await fs.realpath(folder);
    if (!(await fs.stat(root)).isDirectory())
      throw Error("Select a project folder.");
    this.cancel();
    this.root = root;
    this.revisions = await this.readJSON("revisions.json", []);
  }
  async resolve(relative) {
    if (!this.root) throw Error("Open a project first.");
    if (
      typeof relative !== "string" ||
      !relative ||
      path.isAbsolute(relative) ||
      /^[a-z]:/i.test(relative) ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      relative.includes(":")
    )
      throw Error("Use a relative path inside the project.");
    const parts = relative.split("/");
    if (
      parts.some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          excluded(p) ||
          p.endsWith(".") ||
          p.endsWith(" "),
      )
    )
      throw Error("Excluded or invalid project path.");
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        const s = await fs.lstat(current);
        if (s.isSymbolicLink())
          throw Error("Symbolic-link paths are excluded.");
        const real = await fs.realpath(current);
        if (!inside(this.root, real)) throw Error("Path leaves the project.");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    if (!inside(this.root, current)) throw Error("Path leaves the project.");
    return current;
  }
  async read(relative) {
    const p = await this.resolve(relative),
      s = await fs.stat(p);
    if (!s.isFile() || s.size > 1e6)
      throw Error("Choose a regular UTF-8 file smaller than 1 MB.");
    const content = decoder.decode(await fs.readFile(p));
    return { path: relative, content, hash: hash(content) };
  }
  async files(extra = []) {
    if (!this.root) throw Error("Open a project first.");
    const skips = new Set([
      "node_modules",
      ".venv",
      "venv",
      "vendor",
      "build",
      "dist",
      ".next",
      "__pycache__",
      ...extra,
    ]);
    const out = [];
    const walk = async (folder, depth) => {
      if (depth > 12 || out.length >= 5000) return;
      for (const e of await fs.readdir(folder, { withFileTypes: true })) {
        if (out.length >= 5000) break;
        if (
          e.name.startsWith(".") ||
          skips.has(e.name) ||
          excluded(e.name) ||
          e.isSymbolicLink()
        )
          continue;
        const p = path.join(folder, e.name),
          rel = path.relative(this.root, p).split(path.sep).join("/");
        try {
          await this.resolve(rel);
        } catch {
          continue;
        }
        if (e.isDirectory()) await walk(p, depth + 1);
        else if (e.isFile()) out.push(rel);
      }
    };
    await walk(this.root, 0);
    return out.sort();
  }
  async search(query, extra = []) {
    if (typeof query !== "string" || query.length < 2)
      throw Error("Search needs two characters.");
    const hits = [];
    for (const p of await this.files(extra)) {
      let r;
      try {
        r = await this.read(p);
      } catch {
        continue;
      }
      for (const [i, line] of r.content.split("\n").entries()) {
        if (line.toLowerCase().includes(query.toLowerCase()))
          hits.push({ path: p, line: i + 1, text: line.slice(0, 350) });
        if (hits.length >= 60) return hits;
      }
    }
    return hits;
  }
  async existing(relative) {
    try {
      return { exists: true, ...(await this.read(relative)) };
    } catch (e) {
      if (e.code === "ENOENT")
        return { exists: false, content: "", hash: hash("") };
      throw e;
    }
  }
  async prepare(relative, content, expected) {
    await this.resolve(relative);
    if (typeof content !== "string" || Buffer.byteLength(content) > 1e6)
      throw Error("Proposed file exceeds 1 MB.");
    const old = await this.existing(relative);
    if (old.exists && !expected)
      throw Error("Read the existing file and pass its hash first.");
    if (expected && expected !== old.hash)
      throw Error("File changed; read it again.");
    const record = {
      id: id(),
      root: this.root,
      path: relative,
      before: old.content,
      after: content,
      beforeHash: old.hash,
      afterHash: hash(content),
      existed: old.exists,
      date: new Date().toISOString(),
    };
    this.proposals.set(record.id, record);
    return record;
  }
  async apply(key) {
    const p = this.proposals.get(key);
    if (!p || p.root !== this.root) throw Error("Proposal expired.");
    const epoch = this.epoch,
      old = await this.existing(p.path);
    if (old.exists !== p.existed || old.hash !== p.beforeHash)
      throw Error("File changed outside Cipher. Read it again.");
    const dest = await this.resolve(p.path);
    if (epoch !== this.epoch) throw Error("Save cancelled.");
    this.revisions.push(p);
    await this.writeJSON("revisions.json", this.revisions);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await this.resolve(p.path);
    await fs.writeFile(dest, p.after, {
      encoding: "utf8",
      flag: p.existed ? "w" : "wx",
    });
    this.proposals.delete(key);
    return { status: "saved", path: p.path, hash: p.afterHash, revision: key };
  }
  async undo(key) {
    const p = this.revisions.find(
      (p) => p.id === key && p.root === this.root && !p.undone,
    );
    if (!p) throw Error("No active checkpoint found.");
    const current = await this.read(p.path);
    if (current.hash !== p.afterHash)
      throw Error("File changed since this checkpoint.");
    const dest = await this.resolve(p.path);
    if (p.existed) await fs.writeFile(dest, p.before);
    else await fs.unlink(dest);
    p.undone = true;
    await this.writeJSON("revisions.json", this.revisions);
    return { status: "restored", path: p.path };
  }
  cancel() {
    this.epoch++;
    this.proposals.clear();
    this.commands.clear();
    for (const child of this.children) killTree(child);
  }
  async run(command, args, options = {}) {
    if (!this.root) throw Error("Open a project first.");
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.root,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      });
      this.children.add(child);
      let output = Buffer.alloc(0),
        truncated = false;
      const append = (data) => {
        if (output.length + data.length > 1e6) truncated = true;
        output = Buffer.concat([
          output,
          data.subarray(0, Math.max(0, 1e6 - output.length)),
        ]);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(() => killTree(child), options.timeout || 60000);
      child.once("error", (e) => {
        clearTimeout(timer);
        this.children.delete(child);
        reject(e);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        this.children.delete(child);
        resolve({
          exit_code: code ?? 130,
          output:
            output.toString("utf8") +
            (truncated ? "\n[Output truncated at 1 MB]" : ""),
        });
      });
    });
  }
  async command(key) {
    this.require("commands");
    const p = this.commands.get(key);
    this.commands.delete(key);
    if (!p || p.root !== this.root) throw Error("Command approval expired.");
    const env = {};
    for (const k of [
      "PATH",
      "HOME",
      "USERPROFILE",
      "TMPDIR",
      "TEMP",
      "TMP",
      "LANG",
      "SystemRoot",
      "COMSPEC",
      "PATHEXT",
    ])
      if (process.env[k]) env[k] = process.env[k];
    const win = process.platform === "win32";
    const result = await this.run(
      win ? process.env.COMSPEC || "cmd.exe" : "/bin/sh",
      win ? ["/d", "/s", "/c", p.command] : ["-lc", p.command],
      { env },
    );
    return { ...result, command: p.command };
  }
  async git(args) {
    return this.run(
      "git",
      [
        "-c",
        "core.hooksPath=" +
          (process.platform === "win32" ? "NUL" : "/dev/null"),
        "-c",
        "core.fsmonitor=false",
        "-c",
        "credential.helper=",
        "--no-pager",
        "--literal-pathspecs",
        ...args,
      ],
      {
        timeout: 20000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    );
  }
  async gitRoot() {
    this.require("git");
    const r = await this.git(["rev-parse", "--show-toplevel"]);
    if (r.exit_code !== 0 || (await fs.realpath(r.output.trim())) !== this.root)
      throw Error("Open the Git repository top-level folder first.");
  }
  async gitRead(view = "status") {
    await this.gitRoot();
    const choices = {
      status: ["status", "--short", "--branch"],
      diff: ["diff", "--no-ext-diff", "--no-textconv"],
      staged: ["diff", "--cached", "--no-ext-diff", "--no-textconv"],
      log: ["log", "-10", "--oneline"],
      branches: ["branch", "--list"],
    };
    if (!choices[view]) throw Error("Unknown Git view.");
    return this.git(choices[view]);
  }
  async gitChange(a) {
    await this.gitRoot();
    const epoch = this.epoch,
      root = this.root;
    const valid = () => {
      this.require("git");
      if (epoch !== this.epoch || root !== this.root)
        throw Error("Git action cancelled.");
    };
    if (a.operation === "branch") {
      if (!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,100}$/.test(a.branch))
        throw Error("Invalid branch.");
      valid();
      return this.git(["switch", "-c", a.branch]);
    }
    if (
      a.operation !== "commit" ||
      !Array.isArray(a.files) ||
      !a.files.length ||
      typeof a.message !== "string" ||
      !a.message.trim() ||
      a.message.length > 5000
    )
      throw Error("Choose files and a commit message.");
    for (const p of a.files) {
      const f = await this.resolve(p);
      try {
        if ((await fs.stat(f)).isDirectory())
          throw Error("Choose individual files.");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    if ((await this.git(["diff", "--cached", "--quiet"])).exit_code !== 0)
      throw Error("The staging area already has changes. Review it first.");
    const filters = await this.git([
      "config",
      "--name-only",
      "--get-regexp",
      "^filter\\.",
    ]);
    const overrides = [];
    for (const key of filters.output.trim().split("\n"))
      if (/^filter\..+\.(clean|smudge|process|required)$/.test(key))
        overrides.push(
          "-c",
          key + "=" + (key.endsWith(".required") ? "false" : ""),
        );
    valid();
    const staged = await this.git([...overrides, "add", "--", ...a.files]);
    if (staged.exit_code !== 0) return staged;
    const index = await this.git(["diff", "--cached", "--name-only", "-z"]);
    const paths = index.output.split("\0").filter(Boolean);
    if (
      index.exit_code !== 0 ||
      !paths.length ||
      paths.some((p) => !a.files.includes(p))
    )
      throw Error("The staging area changed. Review it before committing.");
    valid();
    return this.git(["-c", "commit.gpgsign=false", "commit", "-m", a.message]);
  }
}
function inside(root, dest) {
  const rel = path.relative(root, dest);
  return (
    rel !== "" &&
    !path.isAbsolute(rel) &&
    rel !== ".." &&
    !rel.startsWith(".." + path.sep)
  );
}
function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
    });
    killer.on("error", () => child.kill());
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
    const t = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 2000);
    t.unref();
  }
}
function apiURL(raw) {
  const u = new URL(raw);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
  )
    throw Error("Use HTTPS, or HTTP on localhost, for API requests.");
  return u;
}
async function request(args, signal, onLine) {
  const u = apiURL(args.url),
    res = await fetch(u, {
      method: args.method || "POST",
      headers: { "Content-Type": "application/json", ...args.headers },
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
      redirect: "error",
      signal,
    });
  if (!res.ok) {
    const reader = res.body?.getReader();
    let error = "";
    if (reader) {
      const { value } = await reader.read();
      error = Buffer.from(value || [])
        .toString()
        .slice(0, 1200);
      await reader.cancel();
    }
    throw Error("API " + res.status + ": " + error);
  }
  const reader = res.body?.getReader();
  let bytes = 0,
    text = "",
    buffer = "";
  const utf8 = new TextDecoder();
  if (reader)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 12e6) {
        await reader.cancel();
        throw Error("Response exceeds 12 MB.");
      }
      const chunk = utf8.decode(value, { stream: true });
      if (onLine) {
        buffer += chunk;
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          onLine(buffer.slice(0, i).replace(/\r$/, ""));
          buffer = buffer.slice(i + 1);
        }
      } else text += chunk;
    }
  const tail = utf8.decode();
  if (onLine) {
    buffer += tail;
    if (buffer) onLine(buffer);
    return true;
  }
  text += tail;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { text };
  }
  return args.includeHeaders
    ? { data, headers: Object.fromEntries(res.headers) }
    : data;
}
module.exports = { Workspace, hash, inside, apiURL, request };
