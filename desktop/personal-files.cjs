const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Workspace } = require("./core.cjs");
const protectedPart = (part) =>
  part.startsWith(".") ||
  /^(library|appdata|keychains?|login data|cookies|credentials|id_rsa|id_ed25519|wallet\.dat)$/i.test(
    part,
  );
class PersonalFiles {
  constructor(storage, home = os.homedir()) {
    this.home = path.resolve(home);
    this.workspace = new Workspace(storage);
    this.ready = null;
  }
  async init() {
    if (!this.ready)
      this.ready = (async () => {
        await this.workspace.init();
        await this.workspace.select(this.home);
        this.home = this.workspace.root;
      })();
    await this.ready;
  }
  relative(value = "") {
    if (typeof value !== "string") throw Error("Use a file path.");
    if (value === "~") value = "";
    if (value.startsWith("~/")) value = value.slice(2);
    if (path.isAbsolute(value)) {
      const absolute = path.resolve(value);
      if (absolute !== this.home && !absolute.startsWith(this.home + path.sep))
        throw Error("Computer file tools stay inside your user folder.");
      value = path.relative(this.home, absolute).split(path.sep).join("/");
    }
    if (value.split(/[\\/]/).some((part) => protectedPart(part)))
      throw Error(
        "Hidden folders and credential stores are not available to the model.",
      );
    return value;
  }
  async directory(value = "") {
    await this.init();
    const relative = this.relative(value);
    const resolved = relative
      ? await this.workspace.resolve(relative)
      : this.home;
    if (!(await fs.stat(resolved)).isDirectory())
      throw Error("Choose a directory.");
    return resolved;
  }
  async inspect(operation, value = "") {
    await this.init();
    const relative = this.relative(value);
    if (operation === "read") {
      const result = await this.workspace.read(relative);
      if (result.content.length > 45000)
        throw Error(
          "File exceeds the 45,000-character read limit. Use a reviewed command to inspect a relevant section instead of replacing unread content.",
        );
      return result;
    }
    if (operation !== "list") throw Error("Use list or read.");
    const folder = await this.directory(value);
    const entries = [];
    const children = await fs.readdir(folder, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (protectedPart(child.name) || child.isSymbolicLink()) continue;
      const item = path
        .relative(this.home, path.join(folder, child.name))
        .split(path.sep)
        .join("/");
      try {
        await this.workspace.resolve(item);
      } catch {
        continue;
      }
      entries.push({
        path: item,
        name: child.name,
        kind: child.isDirectory() ? "folder" : "file",
      });
      if (entries.length === 150) break;
    }
    return {
      home: this.home,
      path: folder,
      entries,
      truncated: entries.length >= 150 && children.length > 150,
    };
  }
  async prepare(args) {
    await this.init();
    return this.workspace.prepare(
      this.relative(args.path),
      args.content,
      args.expected_hash,
    );
  }
  cancel() {
    this.workspace.cancel();
  }
}
module.exports = { PersonalFiles };
