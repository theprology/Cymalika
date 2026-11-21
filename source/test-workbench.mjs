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
  "\nconst actualSendForTest=send; const actualReviewForTest=reviewAction;globalThis.api={reviewReal:actualReviewForTest,sendReal:actualSendForTest,queueImage,init:featureInit,tool:advancedTool,persisted,runGoal,getDesk:()=>desk,getCurrent:()=>current,setCurrent:c=>current=c,setProject:p=>project=p,setSettings:s=>settings={...settings,...s},setReview:fn=>reviewAction=fn,setSend:fn=>send=fn,setNative:fn=>native=fn,nextEpoch:()=>taskEpoch++,pendingImages:()=>pendingComputerImages,extraSystem,allTools,openTour,getTourStep:()=>tourStep,tourCount:()=>tourSteps.length};";
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

// The real send loop must recover from chat-only claims, but never retry a rejected action.
vm.runInContext(
  `
  imageAttachments = []; attachments = []; cancelled = false; busy = false;
  settings = { ...defaults, model: "fixture", streaming: false, rounds: 8 };
  project = { path: "/fixture", name: "fixture" }; files = ["a.py"];
  native = async () => ({});
  globalThis.recoveryCalls = 0;
  modelRequest = async () => { recoveryCalls++; return { message: { content: "Done, I edited the file." } }; };
  current = { id: "recovery", mode: "build", messages: [], display: [{ role: "notice", content: "App connected" }], created: Date.now() };
  $("prompt").value = "Update a.py to fix the bug";
`,
  context,
);
await api.sendReal();
assert.equal(context.recoveryCalls, 3);
assert.equal(api.getCurrent().title, "Update a.py to fix the bug");
assert(
  api
    .getCurrent()
    .display.some((m) => /stopped without performing/.test(m.content)),
);
assert(!api.getCurrent().display.some((m) => /Done, I edited/.test(m.content)));
vm.runInContext(
  `
  globalThis.rejectCalls = 0;
  modelRequest = async () => { rejectCalls++; return rejectCalls === 1 ? { message: { content: "", tool_calls: [{ function: { name: "request_edit", arguments: { path: "a.py", content: "new" } } }] } } : { message: { content: "Your edit was rejected. No file was changed." } }; };
  approveEdit = async () => ({ status: "rejected" });
  current = { id: "reject", mode: "build", messages: [], display: [], created: Date.now() };
  $("prompt").value = "Edit a.py";
`,
  context,
);
await api.sendReal();
assert.equal(context.rejectCalls, 2);
assert(
  api
    .getCurrent()
    .messages.some((m) => m.role === "tool" && /rejected/.test(m.content)),
);
console.log(
  "PASS: chat-only completion claims trigger bounded recovery; unperformed changes are not presented as success; rejected edits are never retried.",
);

// Navigation is one reviewed request; every native input still consumes a fresh snapshot.
vm.runInContext(
  `
  access.computerAccess=true; cancelled=false;
  globalThis.navigationEvents=[]; globalThis.navigationReads=0;
  native = async (action,args={}) => {
    navigationEvents.push({action,...args});
    if(action==="computerApps") return {running:[{id:"chrome-fixture",name:"Google Chrome"}]};
    if(action==="computerRead") return {snapshot:"nav-"+(++navigationReads),elements:[]};
    if(action==="computerAction") return {status:"performed"};
    if(action==="computerNavigate") return {status:"navigation_requested"};
    return {};
  };
`,
  context,
);
let navigationReview;
api.setReview(async (title, args, execute) => {
  navigationReview = { title, args, execute };
  return { status: "waiting" };
});
await api.tool(
  {
    name: "computer_navigate",
    args: {
      app: "chrome-fixture",
      url: "https://example.com",
      reason: "Open requested page",
    },
  },
  "build",
);
assert.equal(
  context.navigationEvents.filter((e) => e.action === "computerAction").length,
  0,
);
assert.match(navigationReview.title, /new tab/);
const navResult = await navigationReview.execute();
assert.equal(navResult.status, "navigation_requested");
const inputs = context.navigationEvents.filter(
  (e) => e.action === "computerAction",
);
assert.equal(inputs.length, 0);
const nativeNavigation = context.navigationEvents.find(
  (e) => e.action === "computerNavigate",
);
assert.equal(nativeNavigation.url, "https://example.com/");
assert.equal(nativeNavigation.app, "chrome-fixture");
await assert.rejects(
  api.tool(
    {
      name: "computer_navigate",
      args: { app: "chrome-fixture", url: "file:///etc/passwd" },
    },
    "build",
  ),
  /HTTP/,
);
await assert.rejects(
  api.tool(
    {
      name: "computer_navigate",
      args: { app: "chrome-fixture", url: "https://user:password@example.com" },
    },
    "build",
  ),
  /credentials/,
);
await api.tool(
  {
    name: "computer_navigate",
    args: {
      app: "chrome-fixture",
      url: "https://example.com",
      reason: "fixture",
    },
  },
  "build",
);
const beforeRevocation = context.navigationEvents.length;
vm.runInContext("access.computerAccess=false", context);
await assert.rejects(navigationReview.execute(), /cancelled/);
assert.equal(context.navigationEvents.length, beforeRevocation);
console.log(
  "PASS: browser navigation waits for approval, uses the native Mac URL handoff without address-bar typing, rejects non-web URLs/credentials and cancels on access revocation.",
);

// A browser observation must not turn an actionable laptop request into a handoff.
vm.runInContext(
  `
  globalThis.desktopCalls = 0; globalThis.desktopTools = [];
  const originalToolForDesktopRegression = tool;
  access.computerAccess = true; access.computer = true; access.browser = true;
  project = null; files = []; settings = {...defaults, model:"fixture", streaming:false, rounds:12};
  current = {id:"desktop-recovery",mode:"build",messages:[],display:[],created:Date.now()};
  native = async () => ({});
  const toolReply = (name,args={}) => ({message:{content:"",tool_calls:[{function:{name,arguments:args}}]}});
  const replies = [
    toolReply("computer_read",{app:"browser",reason:"Inspect browser"}),
    {message:{content:"The browser is not on the target website. Next step: the user needs to navigate to example.com."}},
    toolReply("browser_open",{url:"https://example.com",reason:"Read requested website"}),
    toolReply("browser_read"),
    {message:{content:"I opened the website. Done."}},
    toolReply("computer_write_file",{path:"Documents/report.txt",content:"Example Domain",reason:"Save requested report"}),
    toolReply("computer_files",{operation:"read",path:"Documents/report.txt"}),
    {message:{content:"Opened the site and verified the saved report."}},
  ];
  modelRequest = async () => {desktopCalls++; return replies.shift();};
  tool = async (t) => {desktopTools.push(t.name);return {status:t.name==="computer_write_file"?"saved":"performed"};};
  $("prompt").value = "Use my laptop browser to open https://example.com and save a report to Documents/report.txt";
`,
  context,
);
await api.sendReal();
assert.equal(context.desktopCalls, 8);
assert.deepEqual(
  [...context.desktopTools],
  [
    "computer_read",
    "browser_open",
    "browser_read",
    "computer_write_file",
    "computer_files",
  ],
);
assert(
  !api
    .getCurrent()
    .display.some((m) =>
      /user needs to navigate|website. Done/.test(m.content),
    ),
);
assert(
  api
    .getCurrent()
    .display.some((m) => /verified the saved report/.test(m.content)),
);
vm.runInContext(
  `tool=originalToolForDesktopRegression; access.computerAccess=false; access.computer=false; access.browser=false;`,
  context,
);
console.log(
  "PASS: real agent loop continues a laptop navigation request, suppresses premature handoffs, and requires report save and readback.",
);

vm.runInContext(
  `
  connectedApp = null; access.computerAccess = false; access.computer = false; access.browser = false; access.apps = [];
  project = null; busy = false;
  globalThis.grantRequests = [];
  native = async (action, args) => { grantRequests.push({ action, args }); throw Error("Fixture grant failed"); };
  globalThis.changeComputerAccess = setComputerAccess;
`,
  context,
);
await assert.rejects(
  context.changeComputerAccess(true),
  /Fixture grant failed/,
);
assert.equal(vm.runInContext("access.computerAccess", context), false);
assert.equal(nodes.get("computerAccessSwitch").checked, false);
assert.equal(nodes.get("computerAccessSwitch").disabled, false);
vm.runInContext(
  `native = async (action, args) => { grantRequests.push({ action, args }); return { enabled: args.enabled, home: "/fixture-home", accessibility: true }; }`,
  context,
);
await context.changeComputerAccess(true);
assert.equal(
  vm.runInContext(
    "access.computerAccess && access.computer && access.browser",
    context,
  ),
  true,
);
assert.equal(nodes.get("computerAccessSwitch").checked, true);
vm.runInContext('modelCapabilities.set(settings.model, ["vision"])', context);
assert(
  api.allTools("build").some((tool) => tool.name === "computer_screenshot"),
);
for (const name of [
  "computer_apps",
  "computer_files",
  "computer_write_file",
  "computer_command",
  "browser_search",
  "browser_open",
  "computer_read",
])
  assert(
    api.allTools("build").some((tool) => tool.name === name),
    name,
  );
for (const name of [
  "computer_write_file",
  "computer_command",
  "computer_open_app",
  "computer_action",
])
  assert(!api.allTools("ask").some((tool) => tool.name === name), name);
assert(api.extraSystem().includes("No per-app or per-website setup is needed"));
assert.equal(api.persisted().access, undefined);
vm.runInContext(
  `
  busy = true; cancelled = false;
  globalThis.pendingWasCancelled = false;
  approval = { card: elem("div"), resolve: () => { pendingWasCancelled = true; } };
`,
  context,
);
await context.changeComputerAccess(false);
assert.equal(context.pendingWasCancelled, true);
assert.equal(
  vm.runInContext(
    "access.computerAccess || access.computer || access.browser",
    context,
  ),
  false,
);
assert.equal(vm.runInContext("cancelled", context), true);
assert.equal(nodes.get("computerAccessSwitch").checked, false);
assert(!api.allTools("build").some((tool) => tool.name === "computer_files"));
vm.runInContext("busy = false", context);
console.log(
  "PASS: one-switch grant transaction, model tool discovery without a selected project, read-only mode boundaries, no persisted grants and immediate pending-review cancellation on revocation.",
);

// A file/browser/command review has no app ID: it must still render and wait for a real choice.
vm.runInContext(
  "busy = false; cancelled = false; connectedApp = null",
  context,
);
let actionRan = false;
const approved = api.reviewReal(
  "Save fixture report",
  { path: "Documents/report.txt", reason: "Fixture report" },
  async () => {
    actionRan = true;
    return { status: "saved" };
  },
);
const reviewCard = nodes.get("messages").children.at(-1);
assert.equal(actionRan, false);
const approveButton = descendantsForReview(reviewCard).find(
  (node) => node.textContent === "Approve this action",
);
assert(
  approveButton,
  "A file save without an app ID must render its approval button",
);
await approveButton.onclick();
assert.equal((await approved).status, "saved");
assert.equal(actionRan, true);
console.log(
  "PASS: the actual approval renderer handles file reviews without an app ID and does not execute them before approval.",
);
let sensitiveRuns = 0;
const confirmation =
  "Delete the named disposable fixture permanently? It cannot be restored by Cipher.";
const rejectedConfirmation = api.reviewReal(
  "Fixture confirmation",
  { confirmation },
  async () => {
    sensitiveRuns++;
    return { status: "performed" };
  },
);
const confirmationCard = nodes.get("messages").children.at(-1);
assert(
  descendantsForReview(confirmationCard).some(
    (n) => n.textContent === confirmation,
  ),
);
assert.equal(sensitiveRuns, 0);
await descendantsForReview(confirmationCard)
  .find((n) => n.textContent === "Reject")
  .onclick();
assert.equal((await rejectedConfirmation).status, "rejected");
assert.equal(sensitiveRuns, 0);
const allowedConfirmation = api.reviewReal(
  "Fixture confirmation",
  { confirmation: "Allow the fixture-only action?" },
  async () => {
    sensitiveRuns++;
    return { status: "performed" };
  },
);
const allowedCard = nodes.get("messages").children.at(-1);
assert.equal(sensitiveRuns, 0);
await descendantsForReview(allowedCard)
  .find((n) => n.textContent === "Approve this action")
  .onclick();
assert.equal((await allowedConfirmation).status, "performed");
assert.equal(sensitiveRuns, 1);
await assert.rejects(
  api.reviewReal("Invalid confirmation", { confirmation: 123 }, async () => {
    sensitiveRuns++;
  }),
  /confirmation question/,
);
assert.equal(sensitiveRuns, 1);
console.log(
  "PASS: explicit confirmation text is displayed; rejection performs nothing; approval executes only that action once; malformed questions cannot execute.",
);

function descendantsForReview(node) {
  return [node, ...node.children.flatMap(descendantsForReview)];
}

vm.runInContext(
  "access.computerAccess=true;access.computer=true;access.browser=true;cancelled=false;",
  context,
);
let secretRequest;
api.setNative(async (action, args) => {
  secretRequest = { action, args };
  return { status: "filled", submitted: false };
});
assert(api.allTools("build").some((t) => t.name === "password_fill"));
assert(!api.allTools("ask").some((t) => t.name === "password_fill"));
assert(!api.allTools("plan").some((t) => t.name === "computer_permission"));
await assert.rejects(
  api.tool(
    {
      name: "password_fill",
      args: {
        target: "browser",
        snapshot: "s",
        element: "0",
        password: "never-send",
      },
    },
    "build",
  ),
  /field reference/,
);
const secureResult = await api.tool(
  {
    name: "password_fill",
    args: { target: "browser", snapshot: "s", element: "0", reason: "fixture" },
  },
  "build",
);
assert.equal(secretRequest.action, "fillPassword");
assert.equal(secureResult.status, "filled");
assert(!JSON.stringify(secretRequest.args).includes("never-send"));
let permissionReview;
api.setReview(async (title, args, execute) => {
  permissionReview = { title, args, execute };
  return { status: "waiting" };
});
api.setNative(async (action, args) => {
  secretRequest = { action, args };
  if (action === "computerRead")
    return {
      snapshot: "s",
      elements: [{ id: "2", role: "button", label: "Allow demo feature" }],
    };
  return { status: "performed" };
});
await api.tool(
  {
    name: "computer_read",
    args: { app: "fixture", reason: "Inspect demo permission" },
  },
  "build",
);
secretRequest = null;
await api.tool(
  {
    name: "computer_permission",
    args: {
      app: "fixture",
      snapshot: "s",
      element: "2",
      permission: "Demo feature",
      decision: "allow",
      confirmation: "Allow the demo feature in this fixture?",
      reason: "fixture",
    },
  },
  "build",
);
assert.equal(secretRequest, null);
const permissionResult = await permissionReview.execute();
assert.equal(secretRequest.action, "computerAction");
assert.equal(secretRequest.args.operation, "press");
assert.equal(permissionResult.verified, false);
vm.runInContext(
  "access.computerAccess=false;access.computer=false;access.browser=false;",
  context,
);
console.log(
  "PASS: password entry is Build-only and contains field references rather than values; permission controls wait for explicit review and require result verification.",
);

// Reproduce a question that loops over identical discovery calls, then demand a conclusion.
vm.runInContext(
  `
  access.files = true; imageAttachments = []; attachments = []; cancelled = false; busy = false;
  settings = { ...defaults, model: "fixture", streaming: false, rounds: 12 };
  project = { path: "/fixture", name: "fixture" }; files = ["src/scanner.py"];
  globalThis.loopModelCalls = 0; globalThis.loopSearchCalls = 0; globalThis.summarySeen = false;
  native = async (action) => { if (action === "search") { loopSearchCalls++; return [{path:"src/scanner.py",line:1,text:"def scan():"}]; } return {}; };
  modelRequest = async request => {
    loopModelCalls++;
    if (!request.body.tools && !request.body.format) {
      summarySeen = true;
      return {message:{content:"The search found src/scanner.py, but I did not inspect its callers or run checks. I cannot confirm runtime readiness."}};
    }
    if (request.body.format === "json") return {message:{content:JSON.stringify({action:"search_project",arguments:{query:"scanner"},message:"Let me look at the source files."})}};
    return {message:{content:"Let me look at the source files.",tool_calls:[{function:{name:"search_project",arguments:{query:"scanner"}}}]}};
  };
  current = {id:"loop-question",mode:"build",messages:[],display:[],created:Date.now()};
  $("prompt").value = "Are the scanner tools wired up and working? Do not change files or run commands.";
`,
  context,
);
await api.sendReal();
assert.equal(
  context.loopSearchCalls,
  2,
  "Do not execute the same discovery indefinitely",
);
assert(
  context.summarySeen,
  "An investigation must conclude with an evidence answer",
);
assert(context.loopModelCalls < 12);
assert.equal(
  api
    .getCurrent()
    .display.filter((m) => m.content === "Let me look at the source files.")
    .length,
  1,
);
assert(
  api
    .getCurrent()
    .display.some((m) =>
      /cannot confirm that the project is working/.test(m.content),
    ),
);

vm.runInContext(
  `
  globalThis.promiseCalls = 0;
  modelRequest = async request => { promiseCalls++; return {message:{content:"Let me investigate the source."}}; };
  current = {id:"promise-question",mode:"ask",messages:[],display:[],created:Date.now()};
  $("prompt").value = "Is the scanner connected?";
`,
  context,
);
await api.sendReal();
assert.equal(context.promiseCalls, 3);
assert(
  api
    .getCurrent()
    .display.some((m) =>
      /could not complete this investigation/.test(m.content),
    ),
);
console.log(
  "PASS: repeated discovery is bounded, compatibility recovery uses the same model, duplicate progress is hidden, and questions conclude with evidence or a clear unresolved result.",
);

vm.runInContext(
  `
  globalThis.coffeeCalls = [];
  native = async (action, args) => { coffeeCalls.push({action,args}); if (action === "setCoffee") return {enabled:args.enabled}; return {enabled:false}; };
  settings.coffeeColour = 0;
`,
  context,
);
await vm.runInContext("initCoffee()", context);
assert.equal(vm.runInContext("coffeeEnabled", context), false);
vm.runInContext('$("coffeeSwitch").checked = true', context);
await vm.runInContext("toggleCoffee()", context);
assert.equal(vm.runInContext("coffeeEnabled", context), true);
vm.runInContext("chooseCoffeeColour(2)", context);
assert.equal(vm.runInContext("settings.coffeeColour", context), 2);
vm.runInContext('$("coffeePrevious").onclick()', context);
assert.equal(vm.runInContext("settings.coffeeColour", context), 1);
vm.runInContext("chooseCoffeeColour(-1)", context);
assert.equal(vm.runInContext("settings.coffeeColour", context), 5);
assert.equal(vm.runInContext("persisted().settings.coffeeColour", context), 5);
assert.equal(
  vm.runInContext("persisted().settings.coffeeEnabled", context),
  undefined,
);
vm.runInContext('$("coffeeSwitch").checked = false', context);
await vm.runInContext("toggleCoffee()", context);
assert.equal(vm.runInContext("coffeeEnabled", context), false);
vm.runInContext(
  'native = async () => { throw Error("sleep service unavailable"); }; $("coffeeSwitch").checked = true;',
  context,
);
const previousConsole = context.console;
context.console = { ...console, error() {} };
await vm.runInContext("toggleCoffee()", context);
context.console = previousConsole;
assert.equal(vm.runInContext("coffeeEnabled", context), false);
assert.equal(vm.runInContext('$("coffeeSwitch").checked', context), false);
console.log(
  "PASS: Coffee confirms native state, reverses colours, remembers colour only and rolls back failed keep-awake requests.",
);

vm.runInContext(
  `
  globalThis.keyboardSends = 0;
  globalThis.actualSendBeforeKeyboardTest = send;
  send = () => { keyboardSends++; };
  busy = false;
  globalThis.enterEvent = (extra={}) => ({key:"Enter",keyCode:13,preventDefault(){this.prevented=true},stopPropagation(){},...extra});
  handleComposerKey(enterEvent());
  handleComposerKey(enterEvent({shiftKey:true}));
  handleComposerKey(enterEvent({isComposing:true}));
  handleComposerKey(enterEvent({keyCode:229}));
  handleComposerKey(enterEvent({altKey:true}));
`,
  context,
);
assert.equal(context.keyboardSends, 1);
vm.runInContext(
  "handleComposerKey(enterEvent({metaKey:true})); busy=true; handleComposerKey(enterEvent()); busy=false; send=actualSendBeforeKeyboardTest;",
  context,
);
assert.equal(context.keyboardSends, 2);
vm.runInContext("chooseCoffeeColour(2);", context);
assert.equal(doc.body.dataset.appColour, "red");
assert.equal(vm.runInContext("coffeeEnabled", context), false);

vm.runInContext(
  `
  files = ["src/a.py","src/b.ts","docs/README.md"];
  project = {path:"/explorer-fixture",name:"Explorer"};
  $("fileFilter").value = "";
  expandedFolders.clear(); openFileTabs.clear(); filePreview=null;
  globalThis.explorerReads = [];
  globalThis.sourceFixture = {"src/a.py":"def add(a, b):\\n    return a + b\\n", "src/b.ts":"export const n = 3;\\n", "docs/README.md":"# Project\\n"};
  native = async (action,args) => { if(action === "readFile") { explorerReads.push(args.path); return {path:args.path,content:sourceFixture[args.path],hash:"original-hash"}; } return {}; };
  renderFiles();
`,
  context,
);
assert.equal(
  nodes.get("files").children.length,
  2,
  "Root folders are grouped, not flat paths",
);
vm.runInContext('expandedFolders.add("src"); renderFiles();', context);
assert.equal(nodes.get("files").children.length, 4);
vm.runInContext('$("fileFilter").value="a.py"; renderFiles();', context);
assert.equal(
  nodes.get("files").children.length,
  2,
  "Search reveals matching ancestors",
);
await vm.runInContext('preview("src/a.py")', context);
assert.equal(vm.runInContext("filePreview.path", context), "src/a.py");
assert.equal(nodes.get("editorLines").textContent, "1\n2\n3");
vm.runInContext(
  '$("editFileToggle").onclick(); $("fileContent").value="draft a"; $("fileContent").oninput();',
  context,
);
await vm.runInContext('preview("src/b.ts")', context);
await vm.runInContext('preview("src/a.py")', context);
assert.equal(nodes.get("fileContent").value, "draft a");
assert.equal(vm.runInContext("openFileTabs.size", context), 2);
assert.equal(
  context.explorerReads.filter((p) => p === "src/a.py").length,
  1,
  "A draft must not be overwritten by a fresh read",
);
assert.equal(
  context.sourceFixture["src/a.py"],
  "def add(a, b):\n    return a + b\n",
);
assert.equal(vm.runInContext("hasFileDrafts()", context), true);
vm.runInContext('$("discardFileEdits").onclick();', context);
assert.equal(vm.runInContext("hasFileDrafts()", context), false);
vm.runInContext("resizeExplorer(10000);", context);
assert.equal(vm.runInContext("settings.explorerWidth", context), 480);
vm.runInContext("resizeExplorer(1);", context);
assert.equal(vm.runInContext("settings.explorerWidth", context), 220);
console.log(
  "PASS: Enter sends, Shift+Enter and IME do not; global palette works while Coffee is off; explorer groups folders, searches ancestors and preserves tab drafts without writing files.",
);

vm.runInContext('resizeExplorer(300); $("widenExplorer").onclick();', context);
assert.equal(vm.runInContext("settings.explorerWidth", context), 420);
vm.runInContext('$("widenExplorer").onclick();', context);
assert.equal(vm.runInContext("settings.explorerWidth", context), 300);
console.log(
  "PASS: Explorer can also widen/compact with one accessible button.",
);

vm.runInContext(
  `
  globalThis.savedSipTimeout = setTimeout; globalThis.savedSipClear = clearTimeout;
  globalThis.sipCallbacks = []; globalThis.sipNativeCalls = [];
  setTimeout = (fn,ms) => { sipCallbacks.push({fn,ms}); return sipCallbacks.length; };
  clearTimeout = () => {};
  native = async (action,args) => { sipNativeCalls.push({action,args}); return {enabled:args?.enabled === true}; };
  coffeeEnabled = false; dismissCoffeeSip();
  $("coffeeSwitch").checked = true;
`,
  context,
);
await vm.runInContext("toggleCoffee()", context);
assert.equal(vm.runInContext("coffeeSipVisible", context), true);
assert.equal(context.sipCallbacks.at(-1).ms, 5500);
context.sipCallbacks.at(-1).fn();
assert.equal(vm.runInContext("coffeeSipVisible", context), false);
assert.equal(vm.runInContext("coffeeEnabled", context), true);
assert.equal(
  context.sipNativeCalls.length,
  1,
  "Dismissing the animation must not disable keep-awake",
);
await vm.runInContext(
  '$("coffeeSwitch").checked=false; toggleCoffee()',
  context,
);
await vm.runInContext(
  '$("coffeeSwitch").checked=true; toggleCoffee()',
  context,
);
const staleSip = context.sipCallbacks.at(-1).fn;
await vm.runInContext(
  '$("coffeeSwitch").checked=false; toggleCoffee()',
  context,
);
await vm.runInContext(
  '$("coffeeSwitch").checked=true; toggleCoffee()',
  context,
);
staleSip();
assert.equal(
  vm.runInContext("coffeeSipVisible", context),
  true,
  "A stale timer must not dismiss a newer sip",
);
context.sipCallbacks.at(-1).fn();
assert.equal(vm.runInContext("coffeeEnabled", context), true);
vm.runInContext(
  "window.matchMedia = () => ({matches:true}); playCoffeeSip();",
  context,
);
assert.equal(context.sipCallbacks.at(-1).ms, 900);
await vm.runInContext(
  '$("coffeeSwitch").checked=false; toggleCoffee()',
  context,
);
assert.equal(vm.runInContext("coffeeSipVisible", context), false);
vm.runInContext(
  "setTimeout=savedSipTimeout; clearTimeout=savedSipClear; delete window.matchMedia;",
  context,
);
console.log(
  "PASS: Coffee sip dismisses automatically, preserves keep-awake, ignores stale timers, cancels on off and respects reduced motion.",
);
