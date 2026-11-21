// Run the actual browser-independent app logic with a small DOM/native-bridge harness.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PersonalFiles } = require("../desktop/personal-files.cjs");
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
      messageHandlers: { cymalika: { postMessage: (m) => posted.push(m) } },
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

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cymalika-live-computer-"));
const home = path.join(root, "home");
fs.mkdirSync(path.join(home, "Documents"), { recursive: true });
fs.writeFileSync(
  path.join(home, "Documents", "nebula-notes.txt"),
  "Project Nebula\nMeeting: Friday\nBudget: 120 GBP\n",
);
fs.writeFileSync(
  path.join(home, "Documents", "unrelated.txt"),
  "These unrelated notes must stay untouched.\n",
);
const files = new PersonalFiles(path.join(root, "state"), home);
await files.init();
let granted = false;
const events = [];
context.liveBridge = async (action, args = {}) => {
  if (action === "request") {
    console.log("MODEL request");
    const response = await fetch(args.url, {
      method: args.method || "POST",
      headers: args.headers,
      body: JSON.stringify(args.body),
      signal: AbortSignal.timeout(180000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || response.statusText);
    return data;
  }
  if (action === "saveState") return {};
  if (action === "setComputerAccess") {
    granted = args.enabled;
    files.cancel();
    return { enabled: granted, home: files.home, accessibility: true };
  }
  if (!granted) throw Error("Computer access is off.");
  events.push({ action, ...args });
  console.log("TOOL", action, args.operation || args.path || "");
  if (action === "computerFiles")
    return files.inspect(args.operation, args.path);
  if (action === "computerApps") return { running: [], available: [] };
  if (action === "prepareComputerWrite") {
    if (files.relative(args.path) !== "Documents/summary.txt")
      throw Error("Only the requested fixture summary may be written.");
    return files.prepare(args);
  }
  if (action === "applyComputerWrite")
    return files.workspace.apply(args.proposal);
  throw Error(
    "This isolated test does not permit browsers, apps, commands or files outside its disposable home fixture.",
  );
};
vm.runInContext(
  `
  featureInit({});
  native = liveBridge;
  settings = { ...defaults, model: "CyberCrew/notmythos-8b:3.8-27b-uncensored", thinking: "off", streaming: false, rounds: 12 };
  project = null; files = [];
  current = { id: "computer-fixture", mode: "build", messages: [], display: [], created: Date.now() };
  const fixtureReviewRenderer = reviewAction;
  reviewAction = async (title, args, execute, preview) => {
    if (!title.startsWith("Save ")) throw Error("Only fixture file saves may be auto-approved in this test.");
    const result = fixtureReviewRenderer(title, args, execute, preview);
    const flatten = (node) => [node, ...node.children.flatMap(flatten)];
    const button = flatten($("messages").children.at(-1)).find((node) => node.textContent === "Approve this action");
    if (!button) throw Error("The actual review card failed to render its approval button.");
    await button.onclick();
    return result;
  };
  globalThis.enableFixture = () => setComputerAccess(true);
  globalThis.runFixture = send;
`,
  context,
);
await context.enableFixture();
doc.getElementById("prompt").value =
  "Find my Project Nebula notes in my user folders. Save a short summary containing the meeting day and budget to Documents/summary.txt. Discover the relevant files yourself. Do not change the original notes or unrelated files.";
await context.runFixture();
const chat = context.api.getCurrent();
fs.writeFileSync(
  path.join(root, "evidence.json"),
  JSON.stringify(
    { events, display: chat.display, messages: chat.messages },
    null,
    2,
  ),
);
console.log("EVIDENCE", root);
const result = fs.readFileSync(
  path.join(home, "Documents", "summary.txt"),
  "utf8",
);
assert.match(result, /Friday/i);
assert.match(result, /120/);
assert(
  events.some(
    (event) => event.action === "computerFiles" && event.operation === "list",
  ),
);
assert(
  events.some(
    (event) =>
      event.action === "computerFiles" &&
      event.operation === "read" &&
      /nebula-notes/.test(event.path),
  ),
);
assert.equal(
  fs.readFileSync(path.join(home, "Documents", "nebula-notes.txt"), "utf8"),
  "Project Nebula\nMeeting: Friday\nBudget: 120 GBP\n",
);
assert.equal(
  fs.readFileSync(path.join(home, "Documents", "unrelated.txt"), "utf8"),
  "These unrelated notes must stay untouched.\n",
);
console.log(
  "PASS: existing model found relevant user files and saved a correct report through the shared agent loop with no selected project or manually attached files.",
);
