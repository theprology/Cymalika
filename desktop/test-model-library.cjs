const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  ModelLibrary,
  modelName,
  localEndpoint,
  assetName,
} = require("./model-library.cjs");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "cipher-model-library-"),
  );
  let mode = "success",
    installed = [],
    pulls = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/api/pull") {
      pulls++;
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      if (mode === "error")
        return res.end(
          JSON.stringify({ error: "Fixture model unavailable" }) + "\n",
        );
      if (mode === "incomplete")
        return res.end('{"status":"pulling manifest"}\n');
      if (mode === "slow") {
        res.write('{"status":"pulling manifest"}\n');
        return;
      }
      let body = "";
      req.on("data", (x) => (body += x));
      req.on("end", () => {
        const name = JSON.parse(body).model;
        res.write('{"status":"pulling fixture", "completed":3,');
        setTimeout(() => {
          installed = [{ name: name.includes(":") ? name : name + ":latest" }];
          res.end('"total":6}\n{"status":"success"}\n');
        }, 15);
      });
    } else if (req.url === "/api/tags")
      res.end(JSON.stringify({ models: installed }));
    else if (req.url === "/api/version") res.end('{"version":"fixture"}');
    else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const lib = new ModelLibrary(path.join(root, "models"));
  async function complete(job) {
    for (let i = 0; i < 200; i++) {
      const j = lib.jobs.get(job.id);
      if (j.state !== "running") return lib.view(j);
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("Fixture job did not finish");
  }
  try {
    for (const url of [
      "https://example.com",
      "http://127.0.0.1.evil.test",
      "http://localhost/path",
      "http://user:secret@localhost",
      "http://localhost?x=1",
    ])
      assert.throws(() => localEndpoint(url));
    assert.equal(localEndpoint(base), base);
    for (const name of [
      "../escape",
      "qwen; echo hi",
      "http://evil/model",
      "a\nb",
      "a//b",
    ])
      assert.throws(() => modelName(name));
    assert.equal(
      modelName("hf.co/owner/repo-GGUF:Q4_K_M"),
      "hf.co/owner/repo-GGUF:Q4_K_M",
    );
    assert.equal(assetName("win32", "x64"), "ollama-windows-amd64.zip");
    let job = await lib.pull({ endpoint: base, name: "fixture" });
    let result = await complete(job);
    assert.equal(result.state, "complete");
    assert(!JSON.stringify(result).includes("AbortController"));
    assert.equal(pulls, 1);
    mode = "incomplete";
    result = await complete(
      await lib.pull({ endpoint: base, name: "partial" }),
    );
    assert.equal(result.state, "failed");
    assert.match(result.status, /without a success/);
    mode = "error";
    result = await complete(
      await lib.pull({ endpoint: base, name: "missing" }),
    );
    assert.equal(result.state, "failed");
    assert.match(result.status, /unavailable/);
    mode = "slow";
    job = await lib.pull({ endpoint: base, name: "cancelled" });
    await assert.rejects(
      lib.pull({ endpoint: base, name: "cancelled" }),
      /already downloading/,
    );
    lib.cancel(job.id);
    assert.equal(lib.jobs.get(job.id).state, "cancelled");
    assert.equal(
      lib.server,
      null,
      "Existing engines are never adopted as owned processes",
    );
    const payload = path.join(root, "payload");
    await fs.mkdir(payload);
    await fs.writeFile(
      path.join(
        payload,
        process.platform === "win32" ? "ollama.exe" : "ollama",
      ),
      "public inert runtime fixture",
    );
    const archive = path.join(root, "fixture.tgz");
    assert.equal(
      spawnSync("tar", ["-czf", archive, "-C", payload, "."]).status,
      0,
    );
    const bytes = await fs.readFile(archive);
    const digest = createHash("sha256").update(bytes).digest("hex");
    let wrongHash = false;
    const runtime = new ModelLibrary(path.join(root, "runtime-test"), {
      fetcher: async (url) => {
        if (
          url === "https://api.github.com/repos/ollama/ollama/releases/latest"
        ) {
          const name = assetName(process.platform, process.arch);
          return new Response(
            JSON.stringify({
              tag_name: "v1.0.0",
              assets: [
                {
                  name,
                  size: bytes.length,
                  digest: "sha256:" + (wrongHash ? "0".repeat(64) : digest),
                  browser_download_url:
                    "https://github.com/ollama/ollama/releases/download/v1.0.0/" +
                    name,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(bytes, { status: 200 });
      },
    });
    let plan = await runtime.plan();
    result = await (async () => {
      const j = await runtime.install({ plan: plan.id });
      for (let i = 0; i < 200; i++) {
        const r = runtime.jobs.get(j.id);
        if (r.state !== "running") return r;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw Error("Install fixture timed out");
    })();
    assert.equal(result.state, "complete", result.status);
    assert.equal(
      (
        await fs.readFile(
          path.join(
            runtime.root,
            "runtime",
            process.platform === "win32" ? "ollama.exe" : "ollama",
          ),
        )
      ).toString(),
      "public inert runtime fixture",
    );
    wrongHash = true;
    plan = await runtime.plan();
    job = await runtime.install({ plan: plan.id });
    for (
      let i = 0;
      i < 200 && runtime.jobs.get(job.id).state === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(runtime.jobs.get(job.id).state, "failed");
    assert.match(runtime.jobs.get(job.id).status, /checksum/);
    assert.equal(
      (
        await fs.readFile(
          path.join(
            runtime.root,
            "runtime",
            process.platform === "win32" ? "ollama.exe" : "ollama",
          ),
        )
      ).toString(),
      "public inert runtime fixture",
      "A failed upgrade preserves the installed runtime",
    );
    await assert.rejects(runtime.install({ plan: plan.id }), /Review/);
    runtime.close();
    console.log(
      "PASS: model-library local boundaries, fragmented progress, installed-list verification, failure/cancellation, official runtime manifest, real archive extraction, checksum rejection and preserved runtime. No AI model was downloaded.",
    );
  } finally {
    lib.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
