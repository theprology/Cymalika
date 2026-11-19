// Run the actual browser-independent app logic with a small DOM/native-bridge harness.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Workspace } = require("../desktop/core.cjs");
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
class Node {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = { setProperty() {} };
    this.dataset = {};
    this.value = "";
    this.textContent = "";
    this.open = false;
    this.ownerDocument = doc;
  }
  append(...n) {
    this.children.push(...n);
  }
  prepend(...n) {
    this.children.unshift(...n);
  }
  replaceChildren(...n) {
    this.children = n;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  setAttribute(k, v) {
    this[k] = v;
  }
  focus() {}
  close() {
    this.open = false;
  }
  showModal() {
    this.open = true;
  }
  remove() {}
  addEventListener() {}
}
const nodes = new Map(),
  posted = [];
let doc = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, new Node());
    return nodes.get(id);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return new Node();
  },
  createElement(tag) {
    return new Node(tag);
  },
  createTextNode(text) {
    const n = new Node("#text");
    n.textContent = text;
    return n;
  },
  addEventListener() {},
  body: { dataset: {}, style: { setProperty() {} } },
  documentElement: { style: {} },
};
const context = vm.createContext({
  document: doc,
  window: {
    webkit: {
      messageHandlers: { cipher: { postMessage: (m) => posted.push(m) } },
    },
  },
  crypto: webcrypto,
  URL,
  TextEncoder,
  TextDecoder,
  console,
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
  btoa,
  Option: class extends Node {
    constructor(label, value) {
      super("option");
      this.textContent = label;
      this.value = value;
    }
  },
});
const web = new URL("./web/", import.meta.url);
let script = "";
for (const file of [
  "engine.mjs",
  "markdown.mjs",
  "advanced-engine.mjs",
  "app.mjs",
  "features.mjs",
]) {
  let text = fs.readFileSync(new URL(file, web), "utf8");
  text = text
    .replace(/^import .*\n/, "")
    .replaceAll("export const ", "const ")
    .replaceAll("export function ", "function ");
  script += "\n" + text;
}
script +=
  "\nconst actualSendForTest=send;globalThis.api={sendReal:actualSendForTest,queueImage,init:featureInit,tool:advancedTool,persisted,runGoal,getDesk:()=>desk,getCurrent:()=>current,setCurrent:c=>current=c,setProject:p=>project=p,setSettings:s=>settings={...settings,...s},setReview:fn=>reviewAction=fn,setSend:fn=>send=fn,setNative:fn=>native=fn,nextEpoch:()=>taskEpoch++,pendingImages:()=>pendingComputerImages,extraSystem,allTools,openTour,getTourStep:()=>tourStep,tourCount:()=>tourSteps.length};";
vm.runInContext(script, context);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cipher-live-"));
const projectRoot = path.join(root, "project");
fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
fs.mkdirSync(path.join(projectRoot, "tests"));
fs.writeFileSync(
  path.join(projectRoot, "src/prices.py"),
  "def total(items):\n    return sum(items) + 1\n",
);
fs.writeFileSync(
  path.join(projectRoot, "tests/test_prices.py"),
  "import unittest\nfrom src.prices import total\nclass Prices(unittest.TestCase):\n    def test_total(self):\n        self.assertEqual(total([2, 3]), 5)\n    def test_empty(self):\n        self.assertEqual(total([]), 0)\n",
);
fs.writeFileSync(
  path.join(projectRoot, "README.md"),
  "Run checks with python3 -m unittest discover -s tests -v.\n",
);
const workspace = new Workspace(path.join(root, "state"));
await workspace.init();
await workspace.select(projectRoot);
const events = [];
context.liveBridge = async (action, args = {}) => {
  if (action === "request") {
    const request =
      typeof args.body === "string" ? JSON.parse(args.body) : args.body;
    console.log("MODEL request", request.messages.length, "messages");
    const response = await fetch(args.url, {
      method: args.method || "POST",
      headers: args.headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(180000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || response.statusText);
    return data;
  }
  if (action === "listFiles") return workspace.files();
  if (action === "search") return workspace.search(args.query);
  if (action === "readFile") {
    events.push({ action, path: args.path });
    return workspace.read(args.path);
  }
  if (action === "saveState") return {};
  if (action === "revisions") return [];
  throw Error("Unexpected test bridge action: " + action);
};
context.liveEdit = async (args) => {
  console.log("EDIT", args.path);
  const proposal = await workspace.prepare(
    args.path,
    args.content,
    args.expected_hash,
  );
  const result = await workspace.apply(proposal.id);
  events.push({ action: "edit", path: args.path });
  return result;
};
context.liveCommand = async (args) => {
  // This harness approves only the fixed test command in its disposable fixture.
  if (!/^python3 -m unittest discover -s tests(?: -v| -q)?$/.test(args.command))
    throw Error(
      "Fixture command must be python3 -m unittest discover -s tests -v",
    );
  workspace.commands.set("fixture", {
    root: workspace.root,
    command: args.command,
  });
  const result = await workspace.command("fixture");
  events.push({ action: "command", ...result });
  console.log("CHECK", result.exit_code, result.output);
  return result;
};
context.fixturePath = projectRoot;
context.fixtureFiles = await workspace.files();
vm.runInContext(
  `
  featureInit({});
  settings = { ...defaults, model: "CyberCrew/notmythos-8b:3.8-27b-uncensored", thinking: "off", streaming: false, rounds: 12 };
  current = { id: "live", mode: "build", messages: [], display: [], created: Date.now() };
  project = { name: "Prices", path: fixturePath }; files = fixtureFiles;
  native = liveBridge;
  approveEdit = async (args) => { const result = await liveEdit(args); taskEdits++; return result; };
  approveCommand = async (args) => { const result = await liveCommand(args); taskCommands++; return result; };
  $("prompt").value = "Fix the incorrect total calculation. Find the relevant files yourself, make the smallest fix, and run the existing tests. Do not change the tests.";
  globalThis.runLive = send;
`,
  context,
);
await context.runLive();
const transcript = context.api.getCurrent();
fs.writeFileSync(
  path.join(root, "evidence.json"),
  JSON.stringify(
    { events, display: transcript.display, messages: transcript.messages },
    null,
    2,
  ),
);
console.log("EVIDENCE", root);
assert(
  events.some((e) => e.action === "edit" && e.path === "src/prices.py"),
  "Model must find and edit the implementation",
);
assert(
  events.some((e) => e.action === "command" && e.exit_code === 0),
  "Model must run successful checks",
);
assert.equal(
  fs
    .readFileSync(path.join(projectRoot, "tests/test_prices.py"), "utf8")
    .includes("assertEqual(total([]), 0)"),
  true,
);
assert(
  !fs
    .readFileSync(path.join(projectRoot, "src/prices.py"), "utf8")
    .includes("+ 1"),
);
console.log(
  "PASS: existing model independently found and fixed implementation and ran its tests through Cipher's actual agent loop.",
);
