const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash, randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
function localEndpoint(raw) {
  const u = new URL(raw);
  if (
    u.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error(
      "Model management needs a local Ollama URL, such as http://localhost:11434.",
    );
  return u.origin;
}
function modelName(raw) {
  const name = String(raw || "").trim();
  if (
    !name ||
    name.length > 300 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(name) ||
    name.includes("..") ||
    name.includes("://") ||
    name.split("/").some((x) => !x)
  )
    throw Error(
      "Enter an Ollama model ID or hf.co/owner/GGUF-repository:quantization.",
    );
  return name;
}
function assetName(platform, arch) {
  if (platform === "darwin") return "ollama-darwin.tgz";
  if (platform === "win32" && arch === "x64") return "ollama-windows-amd64.zip";
  if (platform === "linux" && ["x64", "arm64"].includes(arch))
    return "ollama-linux-" + (arch === "x64" ? "amd64" : "arm64") + ".tar.zst";
  throw Error(
    "No managed runtime package is available for this platform. Connect an existing compatible API.",
  );
}
class ModelLibrary {
  constructor(
    root,
    { fetcher = fetch, platform = process.platform, arch = process.arch } = {},
  ) {
    this.root = root;
    this.fetch = fetcher;
    this.platform = platform;
    this.arch = arch;
    this.jobs = new Map();
    this.plans = new Map();
    this.server = null;
  }
  async binary() {
    for (const p of [
      path.join(
        this.root,
        "runtime",
        this.platform === "win32" ? "ollama.exe" : "ollama",
      ),
      path.join(this.root, "runtime", "bin", "ollama"),
      ...(this.platform === "darwin"
        ? [
            "/Applications/Ollama.app/Contents/Resources/ollama",
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
          ]
        : this.platform === "win32"
          ? [
              path.join(
                process.env.LOCALAPPDATA || "",
                "Programs",
                "Ollama",
                "ollama.exe",
              ),
            ]
          : ["/usr/local/bin/ollama", "/usr/bin/ollama"]),
    ]) {
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    return null;
  }
  async json(url, options = {}) {
    const response = await this.fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw Error("Local engine returned HTTP " + response.status);
    return response.json();
  }
  async status() {
    let endpoint = null;
    for (const base of ["http://127.0.0.1:11434", "http://127.0.0.1:11435"]) {
      try {
        await this.json(base + "/api/version", {
          signal: AbortSignal.timeout(1500),
        });
        endpoint = base;
        break;
      } catch {}
    }
    let freeDisk = 0;
    try {
      await fs.mkdir(this.root, { recursive: true });
      const d = await fs.statfs(this.root);
      freeDisk = d.bavail * d.bsize;
    } catch {}
    return {
      endpoint,
      installed: !!(await this.binary()),
      managedRunning: !!this.server,
      managedEndpoint: "http://127.0.0.1:11435",
      ram: os.totalmem(),
      freeRam: os.freemem(),
      freeDisk,
      modelDirectory: path.join(this.root, "models"),
    };
  }
  async plan() {
    const name = assetName(this.platform, this.arch);
    const r = await this.json(
      "https://api.github.com/repos/ollama/ollama/releases/latest",
      { headers: { "User-Agent": "CyMalika-model-library" } },
    );
    const asset = r.assets?.find((a) => a.name === name);
    if (
      !/^v[0-9][a-zA-Z0-9.\-]*$/.test(r.tag_name) ||
      !asset ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "") ||
      asset.browser_download_url !==
        "https://github.com/ollama/ollama/releases/download/" +
          r.tag_name +
          "/" +
          name
    )
      throw Error(
        "The official runtime package has no verifiable SHA-256 digest. Nothing was installed.",
      );
    const id = randomUUID(),
      p = {
        id,
        version: r.tag_name,
        name,
        size: asset.size,
        sha256: asset.digest.slice(7),
        url: asset.browser_download_url,
      };
    this.plans.clear();
    this.plans.set(id, p);
    return p;
  }
  job(kind, name) {
    if (
      [...this.jobs.values()].filter((j) => j.state === "running").length >= 3
    )
      throw Error("Finish or cancel a current download first.");
    for (const [id, j] of this.jobs)
      if (this.jobs.size >= 20 && j.state !== "running") this.jobs.delete(id);
    const j = {
      id: randomUUID(),
      kind,
      name,
      state: "running",
      status: "Starting…",
      completed: 0,
      total: 0,
      abort: new AbortController(),
    };
    this.jobs.set(j.id, j);
    return j;
  }
  view(j) {
    const { abort, process, ...safe } = j;
    return safe;
  }
  cancel(id) {
    const j = this.jobs.get(id);
    if (j?.state === "running") {
      j.state = "cancelled";
      j.status =
        "Cancelled. You can resume a model download by downloading the same ID again.";
      j.abort.abort();
      j.process?.kill();
    }
    return { status: "cancelled" };
  }
  async pull(a) {
    const base = localEndpoint(a.endpoint),
      name = modelName(a.name);
    if (
      [...this.jobs.values()].some(
        (j) => j.state === "running" && j.name === name,
      )
    )
      throw Error("This model is already downloading.");
    const j = this.job("model", name);
    this.runPull(j, base);
    return this.view(j);
  }
  async runPull(j, base) {
    try {
      const r = await this.fetch(base + "/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: j.name, stream: true }),
        signal: j.abort.signal,
        redirect: "error",
      });
      if (!r.ok) throw Error("Download request returned HTTP " + r.status);
      const decoder = new TextDecoder();
      let buffer = "",
        success = false;
      const consume = (line) => {
        if (!line.trim()) return;
        const p = JSON.parse(line);
        if (p.error) throw Error(String(p.error).slice(0, 800));
        j.status = String(p.status || "Downloading").slice(0, 500);
        j.completed = Number(p.completed) || 0;
        j.total = Number(p.total) || 0;
        if (p.status === "success") success = true;
      };
      for await (const data of r.body) {
        buffer += decoder.decode(data, { stream: true });
        if (buffer.length > 1000000)
          throw Error("Invalid download progress response.");
        let pos;
        while ((pos = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, pos));
          buffer = buffer.slice(pos + 1);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!success)
        throw Error("Download ended without a success confirmation.");
      if (j.state === "running") {
        const tags = await this.json(base + "/api/tags");
        if (
          !(tags.models || []).some(
            (m) =>
              m.name === j.name ||
              m.name === j.name + ":latest" ||
              m.model === j.name,
          )
        )
          throw Error(
            "The engine ended the download but the model is absent from its installed list.",
          );
        j.state = "complete";
        j.status = "Downloaded and verified in the installed-model list.";
      }
    } catch (e) {
      if (j.state === "running") {
        j.state = "failed";
        j.status = e.message;
      }
    }
  }
  async install(a) {
    const plan = this.plans.get(a.plan);
    if (!plan) throw Error("Review the runtime download again.");
    if (this.server)
      throw Error("Stop the managed engine before replacing it.");
    if (
      [...this.jobs.values()].some(
        (j) => j.kind === "runtime" && j.state === "running",
      )
    )
      throw Error("Runtime installation is already running.");
    this.plans.delete(a.plan);
    const j = this.job("runtime", plan.name);
    this.runInstall(j, plan);
    return this.view(j);
  }
  process(j, command, args) {
    return new Promise((resolve, reject) => {
      const p = spawn(command, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      j.process = p;
      let out = "";
      for (const stream of [p.stdout, p.stderr])
        stream.on("data", (d) => {
          out += d.toString();
          if (out.length > 2e6) {
            p.kill();
            reject(Error("Runtime extraction response exceeded its limit."));
          }
        });
      p.on("error", reject);
      p.on("close", (code) => {
        delete j.process;
        code === 0
          ? resolve(out)
          : reject(
              Error(
                "Runtime extraction failed. On Linux, install tar and zstd, then retry.",
              ),
            );
      });
    });
  }
  async runInstall(j, plan) {
    const stage = path.join(this.root, "install-" + j.id);
    try {
      await fs.mkdir(stage, { recursive: true });
      const archive = path.join(stage, plan.name);
      j.status = "Downloading official Ollama runtime";
      j.total = plan.size;
      const r = await this.fetch(plan.url, { signal: j.abort.signal });
      if (!r.ok) throw Error("Runtime download returned HTTP " + r.status);
      const file = await fs.open(archive, "wx");
      const hash = createHash("sha256");
      try {
        for await (const bytes of r.body) {
          if (j.state !== "running") throw Error("Cancelled");
          j.completed += bytes.length;
          if (j.completed > plan.size)
            throw Error(
              "Runtime download size differs from the reviewed package.",
            );
          hash.update(bytes);
          await file.write(bytes);
        }
      } finally {
        await file.close();
      }
      if (j.completed !== plan.size || hash.digest("hex") !== plan.sha256)
        throw Error(
          "Runtime checksum verification failed. Nothing was installed.",
        );
      j.status = "Verified SHA-256. Extracting runtime…";
      const target = path.join(stage, "runtime");
      await fs.mkdir(target);
      const tar =
        this.platform === "win32"
          ? path.join(process.env.SystemRoot, "System32", "tar.exe")
          : "/usr/bin/tar";
      const list = await this.process(j, tar, ["-tf", archive]);
      if (
        list
          .split(/\r?\n/)
          .some(
            (n) =>
              n.startsWith("/") ||
              n.includes("\\") ||
              n.split("/").includes("..") ||
              /^[A-Za-z]:/.test(n),
          )
      )
        throw Error("Unsafe runtime archive paths.");
      await this.process(j, tar, ["-xf", archive, "-C", target]);
      if (j.state !== "running") return;
      const candidates = [
        path.join(target, this.platform === "win32" ? "ollama.exe" : "ollama"),
        path.join(target, "bin", "ollama"),
      ];
      let executable;
      for (const p of candidates)
        try {
          await fs.access(p);
          executable = p;
          break;
        } catch {}
      if (!executable)
        throw Error(
          "The official package contains no expected engine executable.",
        );
      if (this.platform !== "win32") await fs.chmod(executable, 0o755);
      const current = path.join(this.root, "runtime"),
        backup = path.join(this.root, "previous-runtime");
      await fs.rm(backup, { recursive: true, force: true });
      let hadOld = false;
      try {
        await fs.rename(current, backup);
        hadOld = true;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      try {
        await fs.rename(target, current);
      } catch (e) {
        if (hadOld) await fs.rename(backup, current);
        throw e;
      }
      await fs.rm(backup, { recursive: true, force: true });
      j.state = "complete";
      j.status =
        "Ollama " +
        plan.version +
        " installed. Start the engine to download a model.";
    } catch (e) {
      if (j.state === "running") {
        j.state = "failed";
        j.status = e.message;
      }
    } finally {
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  }
  async start(a) {
    if (this.server) return { endpoint: "http://127.0.0.1:11435" };
    try {
      await this.json("http://127.0.0.1:11435/api/version");
      throw Error(
        "Port 11435 is already used by another engine. Connect to it instead.",
      );
    } catch (e) {
      if (e.message.startsWith("Port ")) throw e;
    }
    const binary = await this.binary();
    if (!binary) throw Error("Install the local engine first.");
    const max = Number(a.maxLoaded || 3);
    if (!Number.isInteger(max) || max < 1 || max > 64)
      throw Error("Choose between 1 and 64 loaded models.");
    await fs.mkdir(path.join(this.root, "models"), { recursive: true });
    const managed = binary.startsWith(this.root + path.sep);
    const p = spawn(binary, ["serve"], {
      windowsHide: true,
      env: {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11435",
        OLLAMA_MAX_LOADED_MODELS: String(max),
        ...(managed ? { OLLAMA_MODELS: path.join(this.root, "models") } : {}),
      },
      stdio: "ignore",
    });
    this.server = p;
    let error = null;
    p.on("error", (e) => {
      error = e;
      this.server = null;
    });
    p.on("exit", () => {
      if (this.server === p) this.server = null;
    });
    for (let i = 0; i < 60; i++) {
      if (error)
        throw Error("The local engine could not start: " + error.message);
      if (!this.server)
        throw Error(
          "The local engine exited. Check OS compatibility and GPU drivers.",
        );
      try {
        await this.json("http://127.0.0.1:11435/api/version", {
          signal: AbortSignal.timeout(500),
        });
        return { endpoint: "http://127.0.0.1:11435" };
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    this.stop();
    throw Error("The engine did not become ready.");
  }
  stop() {
    this.server?.kill();
    this.server = null;
    return { status: "stopped" };
  }
  close() {
    for (const j of this.jobs.values()) this.cancel(j.id);
    this.stop();
  }
  async handle(a) {
    switch (a.operation) {
      case "status":
        return this.status();
      case "plan":
        return this.plan();
      case "install":
        return this.install(a);
      case "start":
        return this.start(a);
      case "stop":
        return this.stop();
      case "pull":
        return this.pull(a);
      case "jobs":
        return [...this.jobs.values()].map((j) => this.view(j));
      case "cancel":
        return this.cancel(a.id);
      default:
        throw Error("Unknown model library operation.");
    }
  }
}
module.exports = { ModelLibrary, localEndpoint, modelName, assetName };
