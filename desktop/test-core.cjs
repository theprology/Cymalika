const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { Workspace, apiURL, request } = require("./core.cjs");
(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "cipher-")),
    root = path.join(base, "project");
  await fs.mkdir(root);
  const w = new Workspace(path.join(base, "state"));
  await w.init();
  await w.select(root);
  try {
    await fs.writeFile(path.join(root, "math.js"), "exports.add=(a,b)=>a+b;\n");
    const original = await w.read("math.js");
    assert.match(original.hash, /^[a-f0-9]{64}$/);
    await assert.rejects(w.prepare("math.js", "changed"));
    await assert.rejects(w.prepare("math.js", "changed", "wrong"));
    const p = await w.prepare(
      "math.js",
      original.content + "exports.subtract=(a,b)=>a-b;\n",
      original.hash,
    );
    await w.apply(p.id);
    assert.match((await w.read("math.js")).content, /subtract/);
    await w.undo(p.id);
    assert.equal((await w.read("math.js")).content, original.content);
    const stale = await w.prepare("math.js", "stale", original.hash);
    await fs.writeFile(path.join(root, "math.js"), "external");
    await assert.rejects(w.apply(stale.id));
    await fs.writeFile(path.join(root, "math.js"), original.content);
    for (const p of [
      "../outside",
      "/etc/passwd",
      ".env",
      ".env.local",
      ".git/config",
      "secrets.key",
      "a\\b",
      "C:/Windows",
      "a:stream",
      "a/../b",
    ])
      await assert.rejects(w.resolve(p));
    const outside = path.join(base, "outside");
    await fs.mkdir(outside);
    try {
      await fs.symlink(
        outside,
        path.join(root, "escape"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await assert.rejects(w.resolve("escape/new.txt"));
    } catch (e) {
      if (!["EPERM", "EACCES"].includes(e.code)) throw e;
    }
    assert.deepEqual(await w.files(), ["math.js"]);
    assert.equal((await w.search("add"))[0].path, "math.js");
    const fresh = await w.prepare("src/new.js", "hello");
    await w.apply(fresh.id);
    await w.undo(fresh.id);
    await assert.rejects(fs.stat(path.join(root, "src/new.js")));
    const cmd = 'node -e "process.stdout.write(String(2+3))"';
    w.commands.set("approved", { root: w.root, command: cmd });
    const run = await w.command("approved");
    assert.equal(run.exit_code, 0);
    assert.equal(run.output, "5");
    w.commands.set("quoted", {
      root: w.root,
      command: "node -e \"console.log('hello world')\"",
    });
    const quoted = await w.command("quoted");
    assert.equal(quoted.exit_code, 0, quoted.output);
    assert.equal(quoted.output.trim(), "hello world");
    await assert.rejects(w.command("approved"));
    w.commands.set("cancelled", { root: w.root, command: cmd });
    w.cancel();
    await assert.rejects(w.command("cancelled"));
    await w.git(["init"]);
    await w.git(["config", "user.name", "Cipher test"]);
    await w.git(["config", "user.email", "test@example.invalid"]);
    const commit = await w.gitChange({
      operation: "commit",
      files: ["math.js"],
      message: "Add math",
    });
    assert.equal(commit.exit_code, 0, commit.output);
    assert.match((await w.gitRead("log")).output, /Add math/);
    assert.equal(
      (await w.gitChange({ operation: "branch", branch: "cipher/check" }))
        .exit_code,
      0,
    );
    await w.select(path.join(root, "src"));
    await assert.rejects(w.gitRead());
    await w.select(root);
    for (const u of [
      "http://example.com",
      "file:///etc/passwd",
      "https://user:secret@example.com",
    ])
      assert.throws(() => apiURL(u));
    assert.equal(apiURL("http://localhost:11434").hostname, "localhost");
    const server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/json" });
        res.end();
      } else if (req.url === "/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const data = Buffer.from("data: café\n\ndata: done\n");
        res.write(data.subarray(0, 10));
        setTimeout(() => res.end(data.subarray(10)), 10);
      } else if (req.url === "/error") {
        res.writeHead(500);
        res.end("fixture failure");
      } else {
        res.setHeader("X-Test", "value");
        res.end('{"ok":true}');
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    try {
      assert.equal(
        (
          await request(
            { url: url + "/json", method: "GET" },
            AbortSignal.timeout(5000),
          )
        ).ok,
        true,
      );
      const r = await request(
        { url: url + "/json", method: "GET", includeHeaders: true },
        AbortSignal.timeout(5000),
      );
      assert.equal(r.headers["x-test"], "value");
      const lines = [];
      await request(
        { url: url + "/stream", method: "GET" },
        AbortSignal.timeout(5000),
        (l) => lines.push(l),
      );
      assert(lines.includes("data: café"));
      await assert.rejects(
        request(
          { url: url + "/redirect", method: "GET" },
          AbortSignal.timeout(5000),
        ),
      );
      await assert.rejects(
        request(
          { url: url + "/error", method: "GET" },
          AbortSignal.timeout(5000),
        ),
        /API 500/,
      );
    } finally {
      server.close();
    }
    console.log(
      "PASS: desktop workspace, stale writes, checkpoints, boundaries, commands, Git, HTTP errors, redirect rejection and UTF-8 streaming.",
    );
  } finally {
    w.cancel();
    await fs.rm(base, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
