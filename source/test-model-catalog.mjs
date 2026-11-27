import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import http from "node:http";
class Element {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.value = "";
    this.textContent = "";
    this.classList = { toggle() {} };
  }
  set id(value) {
    nodes.set(value, this);
    this._id = value;
  }
  get id() {
    return this._id;
  }
  append(...items) {
    this.children.push(...items);
    if (this.tag === "select" && !this.value)
      this.value = this.children[0]?.value || "";
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  setAttribute(k, v) {
    this[k] = v;
  }
  scrollIntoView() {}
  focus() {}
}
const nodes = new Map();
const $ = (id) => {
  if (!nodes.has(id)) nodes.set(id, new Element());
  return nodes.get(id);
};
const text = (n) => [n.textContent || "", ...n.children.map(text)].join(" ");
const find = (root, label) => {
  const walk = (n, match) => {
    if (match(n)) return n;
    for (const c of n.children) {
      const r = walk(c, match);
      if (r) return r;
    }
  };
  return (
    walk(root, (n) => n["aria-label"] === label) ||
    walk(root, (n) => n.tag === "button" && n.textContent === label)
  );
};
const metadata = {
  id: "MoonMath-ai/DeepSeek-V4.1-Flash-1017-uncensored",
  pipeline_tag: "text-generation",
  tags: ["safetensors", "fp8"],
  config: {
    architectures: ["DeepseekV41ForCausalLM"],
    quantization_config: { quant_method: "fp8" },
  },
  siblings: [
    { rfilename: "model-00001-of-00002.safetensors", size: 255e9 },
    { rfilename: "model-00002-of-00002.safetensors", size: 255e9 },
  ],
};
let saves = 0,
  pulls = 0,
  requests = [],
  nativeHandler;
const settings = {
  provider: "ollama",
  endpoint: "http://localhost:11434",
  model: "my-existing-model",
  protocol: "auto",
  apiKey: "",
};
const context = vm.createContext({
  URL,
  Map,
  Set,
  console,
  Number,
  String,
  Math,
  crypto: { randomUUID: () => "fixture-profile" },
  defaults: { ...settings, context: 16384, maxTokens: 4096 },
  settings,
  desk: { profiles: [] },
  busy: false,
  $,
  all: () => [],
  elem: (tag, cls, value = "") => {
    const e = new Element(tag);
    e.textContent = value;
    return e;
  },
  button: (label, cls, fn) => {
    const e = new Element("button");
    e.textContent = label;
    e.onclick = fn;
    return e;
  },
  Option: class extends Element {
    constructor(label, value) {
      super("option");
      this.textContent = label;
      this.value = value;
    }
  },
  native: (...args) => nativeHandler(...args),
  endpoint: (base, suffix) => base.replace(/\/$/, "") + "/" + suffix,
  scheduleSave: () => saves++,
  refreshModels: async () => {},
  toast() {},
  setTimeout() {},
  clearTimeout() {},
  settingsOpen() {},
});
vm.runInContext(
  fs.readFileSync(new URL("./web/model-library.mjs", import.meta.url), "utf8") +
    `\nglobalThis.api={hfModelId,modelCatalogURL,modelRequirements,runtimeConnection,renderLibraryDownloads,renderLibraryConnections,inspectCatalogModel,renderModelLibrary,setHardware:x=>libraryRuntime=x,getProfiles:()=>desk.profiles,keyCount:()=>connectionKeys.size};`,
  context,
);
const a = context.api;
for (const raw of [
  metadata.id,
  "https://huggingface.co/" + metadata.id,
  "https://huggingface.co/" + metadata.id + "/tree/main",
])
  assert.equal(a.hfModelId(raw), metadata.id);
for (const bad of [
  "https://evil.test/a/b",
  "https://u:p@huggingface.co/a/b",
  "../x",
  "a/b/c",
  "http://huggingface.co/a/b",
])
  assert.throws(() => a.hfModelId(bad));
assert(!a.modelCatalogURL("DeepSeek").includes("filter="));
assert(a.modelCatalogURL(metadata.id).endsWith("?blobs=true"));
const r = a.modelRequirements(metadata, { ram: 24 * 1024 ** 3 });
assert.equal(r.weightBytes, 510e9);
assert.equal(r.gguf.length, 0);
assert.match(r.memory, /exceed/);
assert.match(r.runtime, /SGLang/);
assert.equal(r.architecture, "DeepseekV41ForCausalLM");
const unknown = a.modelRequirements({
  id: "a/b",
  siblings: [{ rfilename: "model.safetensors" }],
});
assert.equal(unknown.completeSize, false);
assert.equal(unknown.weightBytes, 0);
assert.match(unknown.memory, /cannot confirm/);
assert.equal(
  a.modelRequirements({
    siblings: [
      { rfilename: "adapter_config.json" },
      { rfilename: "adapter_model.safetensors" },
    ],
  }).adapter,
  true,
);
assert.equal(
  a.modelRequirements({
    id: "mlx-community/example",
    siblings: [{ rfilename: "model.safetensors" }],
  }).mlx,
  true,
);
assert.equal(
  a.modelRequirements({ pipeline_tag: "text-to-image" }).chatCandidate,
  false,
);
for (const bad of [
  "http://remote.test/v1",
  "https://user:password@test/v1",
  "https://test/v1?token=x",
  "https://test/v1/chat/completions",
])
  assert.throws(() => a.runtimeConnection(bad));
assert.equal(
  a.runtimeConnection("http://localhost:1234"),
  "http://localhost:1234/v1",
);
assert.equal(
  a.runtimeConnection("https://test/custom/v1/"),
  "https://test/custom/v1",
);
nativeHandler = async (type, args) => {
  if (type === "modelLibrary") {
    if (args.operation === "pull") pulls++;
    throw Error("Unexpected runtime operation");
  }
  requests.push(args);
  if (args.url.includes("/api/models/")) return metadata;
  if (args.url.includes("/api/models?")) return [metadata];
  throw Error("Unexpected request: " + args.url);
};
a.setHardware({ ram: 24 * 1024 ** 3, freeDisk: 100 * 1024 ** 3 });
a.renderLibraryDownloads();
find($("modelLibraryBody"), "Find a model").value =
  "https://huggingface.co/" + metadata.id;
await find($("modelLibraryBody"), "Find model").onclick();
assert.match(text($("modelSearchResults")), /DeepSeek/);
assert.match(text($("modelLibraryReview")), /Safetensors/);
assert.match(text($("modelLibraryReview")), /exceed/);
assert(!find($("modelLibraryReview"), "Review Ollama download"));
assert.equal(pulls, 0);
assert.equal(settings.model, "my-existing-model");
await find($("modelLibraryReview"), "Set up a runtime connection").onclick();
assert.equal(find($("modelLibraryBody"), "Server model ID").value, metadata.id);
// A real local HTTP fixture exercises model discovery and both chat/tool API shapes without loading a model.
let chats = 0;
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/models" && req.method === "GET")
    return res.end(JSON.stringify({ data: [{ id: "fixture-coder" }] }));
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);
  assert.equal(data.model, "fixture-coder");
  assert(req.url === "/v1/chat/completions");
  chats++;
  res.end(
    JSON.stringify({
      choices: [
        {
          message: data.tools?.length
            ? {
                content: null,
                tool_calls: [
                  {
                    id: "t1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: '{"path":"hello.py"}',
                    },
                  },
                ],
              }
            : { content: "fixture response" },
        },
      ],
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  nativeHandler = async (type, args) => {
    assert.equal(type, "request");
    requests.push(args);
    const response = await fetch(args.url, {
      method: args.method,
      headers: args.headers,
    });
    return response.json();
  };
  const base = "http://127.0.0.1:" + server.address().port + "/v1";
  for (const runtime of [
    "lmstudio",
    "llamacpp",
    "mlx",
    "vllm",
    "sglang",
    "tgi",
    "compatible",
  ]) {
    $("modelLibraryBody").replaceChildren();
    a.renderLibraryConnections();
    const root = $("modelLibraryBody");
    const select = find(root, "Runtime");
    select.value = runtime;
    select.onchange();
    find(root, "API base URL").value = base;
    await find(root, "Check connection & list models").onclick();
    assert.match(text(root), /1 model\(s\) reported/);
  }
  const root = $("modelLibraryBody");
  find(root, "API key (optional, session only)").value = "must-clear";
  find(root, "API base URL").oninput();
  assert.equal(find(root, "API key (optional, session only)").value, "");
  find(root, "Server model ID").value = "fixture-coder";
  find(root, "API key (optional, session only)").value = "fixture-session-key";
  const before = JSON.stringify(settings);
  await find(root, "Save connection").onclick();
  assert.equal(JSON.stringify(settings), before);
  assert.equal(a.getProfiles().length, 1);
  assert.equal(a.getProfiles()[0].settings.provider, "openai");
  assert(!JSON.stringify(a.getProfiles()).includes("fixture-session-key"));
  assert.equal(a.keyCount(), 1);
  assert(saves);
  // Use the actual request builder/parser with the fixture for normal chat and function calls.
  const { requestFor, responseFrom } = await import("./web/engine.mjs");
  const profile = {
    ...a.getProfiles()[0].settings,
    temperature: 0.2,
    maxTokens: 1024,
    streaming: false,
  };
  for (const tools of [
    [],
    [
      {
        name: "read_file",
        description: "Read project file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  ]) {
    const req = requestFor(
      profile,
      [{ role: "user", content: "fixture" }],
      tools,
    );
    const response = await fetch(req.url, {
      method: req.method,
      headers: { "Content-Type": "application/json", ...req.headers },
      body: JSON.stringify(req.body),
    });
    const parsed = responseFrom("openai", await response.json(), false);
    if (tools.length) assert.equal(parsed.toolCalls[0].name, "read_file");
    else assert.match(parsed.content, /fixture response/);
  }
  assert.equal(chats, 2);
  assert.equal(pulls, 0);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  "PASS: all-format search, exact links, size/architecture/adapter requirements, seven runtime presets, compatible chat/tool APIs, session-only keys and unchanged existing model. Zero model downloads.",
);
