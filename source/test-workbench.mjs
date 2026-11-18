// Run the actual browser-independent app logic with a small DOM/native-bridge harness.
import assert from "node:assert/strict";
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
const api = context.api;
api.init({});
api.setProject({ path: "/fixture", name: "fixture" });
api.setCurrent({
  id: "chat",
  mode: "plan",
  messages: [],
  display: [],
  created: Date.now(),
});
const r = await api.tool(
  {
    name: "propose_plan",
    args: {
      title: "A real draft",
      steps: [
        {
          title: "Add behavior",
          files: ["a.py"],
          check: "Original tests still pass",
        },
      ],
    },
  },
  "plan",
);
assert.equal(r.status, "draft");
assert.equal(api.getDesk().plans.length, 1);
assert.equal(api.getCurrent().planId, r.plan.id);
assert.equal(r.plan.status, "draft");
assert.equal(
  (await api.tool({ name: "resources_list", args: {} }, "ask")).length,
  0,
);
api.getDesk().resources.push({
  id: "workflow",
  title: "Workflow",
  kind: "skill",
  content: "Use actual command output and request approval.",
  enabled: true,
  project: "",
});
const resources = await api.tool({ name: "resources_list", args: {} }, "ask");
assert.equal(resources.length, 1);
const read = await api.tool(
  { name: "resource_read", args: { id: resources[0].id } },
  "ask",
);
assert(read.content.includes("actual command output"));
assert(
  (
    await api.tool(
      { name: "resource_search", args: { query: "approval" } },
      "ask",
    )
  ).length > 0,
);
api.getDesk().resources.push({
  id: "private",
  title: "Another project",
  project: "/other",
  content: "private",
  enabled: true,
});
await assert.rejects(
  api.tool({ name: "resource_read", args: { id: "private" } }, "ask"),
);
const goal = {
  id: "g",
  project: "/fixture",
  title: "Ship the fixture",
  objective: "Implement it",
  acceptance: "Tests pass",
  state: "paused",
  milestones: [{ id: "m", title: "Test it", done: false, evidence: "" }],
};
api.getDesk().goals.push(goal);
api.getCurrent().goalId = "g";
let reviewArgs;
api.setReview(async (title, args, execute) => {
  reviewArgs = { title, args, execute };
  return { status: "pending" };
});
await api.tool(
  { name: "goal_progress", args: { milestone: "m", evidence: "3 tests pass" } },
  "build",
);
assert.equal(goal.milestones[0].done, false);
await reviewArgs.execute();
assert.equal(goal.milestones[0].done, true);
assert.equal(goal.milestones[0].evidence, "3 tests pass");
assert.equal(goal.state, "paused");
api.setSettings({ apiKey: "session-secret" });
api.getCurrent().messages.push({
  role: "user",
  content: "inspect",
  images: [{ mime: "image/png", data: "image-secret" }],
});
api
  .getDesk()
  .audit.push({ title: "fixture", time: Date.now(), project: "/fixture" });
// Put current chat into saved history through the real goal-resume/new-chat path.
let sent = false;
api.setSend(() => {
  sent = true;
});
api.runGoal(goal);
assert(sent);
assert.equal(goal.state, "active");
assert.equal(api.getCurrent().goalId, "g");
assert(nodes.get("prompt").value.includes("Ship the fixture"));
assert(api.extraSystem().includes("Tests pass"));
api.getCurrent().messages.push({
  role: "user",
  content: "inspect",
  images: [{ mime: "image/png", data: "image-secret" }],
});
const saved = api.persisted();
const serialized = JSON.stringify(saved);
assert(!serialized.includes("session-secret"));
assert(!serialized.includes("image-secret"));
assert(serialized.includes("not retained"));
assert(
  !api
    .allTools("plan")
    .some((t) =>
      ["request_edit", "request_command", "computer_action"].includes(t.name),
    ),
);
let finishCapture;
api.setNative(() => new Promise((resolve) => (finishCapture = resolve)));
api.setReview(async (title, args, execute) => execute());
const capture = api.tool(
  { name: "browser_screenshot", args: { reason: "fixture" } },
  "build",
);
api.nextEpoch();
finishCapture({ data: "late-private-image", mime: "image/jpeg" });
assert.equal((await capture).status, "cancelled");
assert.equal(api.pendingImages().length, 0);
api.setSettings({ vision: false, model: "fixture" });
api.queueImage({ data: "fixture-image", mime: "image/png" });
const beforeSend = posted.length;
await api.sendReal();
assert.equal(posted.length, beforeSend);
assert(nodes.get("toast").textContent.includes("image support"));
console.log(
  "PASS: actual Workbench logic, plan binding, scoped resource retrieval/search, approval-gated milestone evidence, goal resume, project context, and persisted secret/image exclusion.",
);

const beforeTour = posted.length;
api.openTour();
assert.equal(api.tourCount(), 9);
assert.equal(nodes.get("tourDialog").open, true);
assert.equal(nodes.get("tourTitle").textContent, "Your coding workspace");
const tourRow = nodes.get("tourBody").children.at(-1);
await tourRow.children.at(-1).onclick();
assert.equal(api.getTourStep(), 1);
assert.equal(posted.length, beforeTour);
api.openTour(8);
await nodes.get("tourBody").children.at(-1).children.at(-1).onclick();
assert.equal(nodes.get("tourDialog").open, false);
assert.equal(api.persisted().settings.tourSeen, true);
console.log(
  "PASS: nine-step beginner tour, progress navigation, completion persistence and no model/file actions.",
);
