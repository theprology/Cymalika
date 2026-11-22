import assert from "node:assert/strict";
import {
  desktopTaskProgress,
  TOOLS,
  requestFor,
  responseFrom,
  systemPrompt,
  trimHistory,
  parseJSON,
  toolsFor,
} from "./web/engine.mjs";
const s = {
  provider: "ollama",
  endpoint: "http://localhost:11434/",
  model: "installed-model",
  context: 16384,
  maxTokens: 2048,
  temperature: 0.2,
  thinking: "off",
};
let messages = [
  { role: "system", content: "system" },
  { role: "user", content: "task" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "read_file", args: { path: "app.py" } }],
  },
  {
    role: "tool",
    name: "read_file",
    callId: "call_1",
    content: "actual content",
  },
];
let r = requestFor(s, messages, TOOLS);
assert.equal(r.url, "http://localhost:11434/api/chat");
assert.equal(r.body.messages[3].tool_name, "read_file");
assert.equal(
  r.body.messages[2].tool_calls[0].function.arguments.path,
  "app.py",
);
assert.equal(r.body.think, false);
r = requestFor(
  {
    ...s,
    provider: "openai",
    endpoint: "https://example.invalid/v1",
    apiKey: "session-key",
  },
  messages,
  TOOLS,
);
assert.equal(r.url, "https://example.invalid/v1/chat/completions");
assert.equal(r.body.messages[3].tool_call_id, "call_1");
assert.equal(r.headers.Authorization, "Bearer session-key");
r = requestFor(
  { ...s, provider: "anthropic", endpoint: "https://api.anthropic.com" },
  messages,
  TOOLS,
);
assert.equal(r.body.messages.at(-1).content[0].tool_use_id, "call_1");
assert.equal(r.body.system, "system");
r = requestFor(s, messages, TOOLS, true);
assert.equal(r.body.format.anyOf[0].properties.action.const, "list_files");
assert.equal(r.body.tools, undefined);
assert(r.body.messages.at(-1).content.includes("ACTUAL TOOL RESULT"));
assert.equal(
  responseFrom("ollama", {
    message: {
      content: "",
      tool_calls: [
        { function: { name: "read_file", arguments: { path: "app.py" } } },
      ],
    },
  }).toolCalls[0].args.path,
  "app.py",
);
assert.equal(
  responseFrom("openai", {
    choices: [
      {
        message: {
          content: "ok",
          tool_calls: [
            {
              id: "x",
              function: { name: "read_file", arguments: '{"path":"x.py"}' },
            },
          ],
        },
      },
    ],
  }).toolCalls[0].args.path,
  "x.py",
);
assert.equal(
  responseFrom(
    "ollama",
    { message: { content: '{"action":"finish","message":"done"}' } },
    true,
  ).content,
  "done",
);
assert.throws(() =>
  responseFrom("ollama", { message: { content: "I cannot do that" } }, true),
);
assert.throws(() => parseJSON("not json"));
assert.equal(toolsFor("ask").length, 3);
assert.equal(toolsFor("plan").length, 3);
assert.equal(toolsFor("build").length, 5);
assert(
  systemPrompt("build", "/project", ["app.py"], true, TOOLS).includes(
    "Never weaken tests",
  ),
);
const long = [
  { role: "user", content: "a".repeat(13000) },
  { role: "assistant", content: "old" },
  { role: "user", content: "latest" },
  {
    role: "assistant",
    content: "call",
    toolCalls: [{ id: "x", name: "read_file", args: {} }],
  },
  { role: "tool", name: "read_file", callId: "x", content: "result" },
];
const trimmed = trimHistory(long, 4096);
assert.equal(trimmed.omitted, 2);
assert.equal(trimmed.messages[0].content, "latest");
assert.equal(trimmed.messages.at(-1).role, "tool");
assert(
  trimHistory([{ role: "user", content: "x".repeat(15000) }], 4096).compacted,
);
console.log(
  "PASS: Ollama, OpenAI-compatible, Anthropic request/response contracts; text fallback; tool-result history; read-only modes; context trimming.",
);
const desktop = [{ role: "user", content: "Do the approved desktop task" }];
for (let i = 0; i < 8; i++)
  desktop.push(
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c" + i, name: "computer_read", args: {} }],
    },
    {
      role: "tool",
      name: "computer_read",
      callId: "c" + i,
      content: "s".repeat(15000),
    },
  );
const compacted = trimHistory(desktop, 16384);
assert.equal(compacted.messages.length, desktop.length);
assert.equal(compacted.messages.at(-1).content.length, 15000);
assert(compacted.messages[2].content.includes("superseded"));
assert.equal(desktop[2].content.length, 15000);
assert(
  trimHistory(
    [
      { role: "user", content: "x".repeat(30000) },
      { role: "user", internal: true, content: "image context" },
    ],
    8192,
  ).compacted,
);

const scan = [{ role: "user", content: "Find the right file and fix the bug" }];
for (let i = 0; i < 80; i++)
  scan.push(
    {
      role: "assistant",
      content: "Reading",
      toolCalls: [
        {
          id: `read-${i}`,
          name: "read_file",
          args: { path: `src/file-${i}.py` },
        },
      ],
    },
    {
      role: "tool",
      name: "read_file",
      callId: `read-${i}`,
      content:
        `src/file-${i}.py hash: actual-${i}\n` + "source line\n".repeat(5000),
    },
  );
const original = JSON.stringify(scan);
const managed = trimHistory(scan, 16384, { reservedTokens: 6000 });
assert(managed.compacted);
assert.equal(managed.messages[0].content, scan[0].content);
assert(JSON.stringify(managed.messages).length <= (16384 - 6000) * 2.5);
assert(JSON.stringify(managed.messages).includes("actual-79"));
assert.equal(JSON.stringify(scan), original);
for (const [i, message] of managed.messages.entries()) {
  if (message.role !== "tool") continue;
  const call = managed.messages
    .slice(0, i)
    .findLast((m) => m.role === "assistant");
  assert(call.toolCalls.some((t) => t.id === message.callId));
}
for (const provider of ["ollama", "openai", "anthropic"]) {
  const req = requestFor(
    { ...s, provider },
    [{ role: "system", content: "Inspect files" }, ...managed.messages],
    TOOLS,
  );
  assert(req.body.messages.length > 0);
}
const hugeEdit = trimHistory(
  [
    { role: "user", content: "Fix the file" },
    {
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "edit",
          name: "request_edit",
          args: { path: "big.py", content: "a".repeat(200000) },
        },
      ],
    },
    {
      role: "tool",
      callId: "edit",
      name: "request_edit",
      content: "User rejected this edit; no file was changed.",
    },
  ],
  4096,
);
assert(hugeEdit.compacted);
assert(hugeEdit.messages.some((m) => m.content?.includes("User rejected")));
assert.throws(() => trimHistory(scan, NaN), /context size/);
assert.throws(
  () => trimHistory(scan, 4096, { reservedTokens: 4000 }),
  /Instructions and tools/,
);
console.log(
  "PASS: superseded desktop snapshots compact without losing tool-call history or the original task.",
);

const { visibleModelText } = await import("./web/engine.mjs");
assert.equal(
  visibleModelText("<think>private reasoning</think>Done."),
  "Done.",
);
assert.equal(visibleModelText("<think>partial private reasoning"), "");
assert.equal(
  visibleModelText("Private draft.</think>Verified.", true),
  "Verified.",
);
assert.equal(
  visibleModelText("Use the `</think>` delimiter.", true),
  "Use the `</think>` delimiter.",
);
assert.equal(
  visibleModelText("```html\n<think>example</think>\n```", true),
  "```html\n<think>example</think>\n```",
);
assert.equal(
  responseFrom("ollama", {
    message: { content: "Internal draft.</think>Complete." },
  }).content,
  "Complete.",
);
console.log(
  "PASS: thinking envelopes and unmatched Ollama thinking prefixes are hidden while literal code examples are preserved.",
);

const indexedPrompt = systemPrompt(
  "build",
  "/project",
  Array.from(
    { length: 500 },
    (_, i) => `src/${i}/` + "directory/".repeat(40) + "code.py",
  ),
  false,
  TOOLS,
  4096,
);
assert(indexedPrompt.length < 5000);
assert(indexedPrompt.includes("search_project"));

const escapedEvidence = [
  {
    role: "user",
    content: JSON.stringify({
      question: "Are the tools ready?",
      results: Array.from({ length: 30 }, (_, i) => ({
        path: `src/worker-${i}.py`,
        content: '"quoted"\\path\n'.repeat(2000),
      })),
    }),
  },
];
const escapedSaved = JSON.stringify(escapedEvidence);
const escapedTrimmed = trimHistory(escapedEvidence, 16384, {
  reservedTokens: 1500,
});
assert(escapedTrimmed.compacted);
assert(JSON.stringify(escapedTrimmed.messages).length <= (16384 - 1500) * 2.5);
assert.equal(JSON.stringify(escapedEvidence), escapedSaved);
console.log(
  "PASS: large serialized evidence with escaped source fits the actual request budget without mutating saved history.",
);

const desktopEvent = (name, args = {}, result = { status: "performed" }) => ({
  name,
  args,
  result,
});
const desktopTask =
  "Open https://example.com in my browser and save a report to Documents/report.txt";
assert.equal(desktopTaskProgress(desktopTask, "ask", true).active, false);
assert.equal(desktopTaskProgress(desktopTask, "build", false).active, false);
assert.equal(
  desktopTaskProgress("How can I use my laptop browser?", "build", true).active,
  false,
);
assert(
  desktopTaskProgress(
    "Then use my laptop and control Hostinger for production use",
    "build",
    true,
  ).missing.length,
);
let desktopEvents = [
  desktopEvent("computer_apps"),
  desktopEvent("computer_read"),
];
assert.equal(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing.length,
  2,
);
desktopEvents.push(desktopEvent("browser_open"));
assert.equal(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing.length,
  2,
);
desktopEvents.push(desktopEvent("browser_read"));
assert.equal(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing.length,
  1,
);
desktopEvents.push(
  desktopEvent(
    "computer_write_file",
    { path: "Documents/report.txt" },
    { status: "saved" },
  ),
);
assert.match(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing.join(),
  /Read the saved file/,
);
desktopEvents.push(
  desktopEvent("computer_files", {
    operation: "read",
    path: "Documents/other.txt",
  }),
);
assert.equal(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing.length,
  1,
);
desktopEvents.push(
  desktopEvent("computer_files", {
    operation: "read",
    path: "Documents/report.txt",
  }),
);
assert.deepEqual(
  desktopTaskProgress(desktopTask, "build", true, desktopEvents).missing,
  [],
);
assert(
  desktopTaskProgress(desktopTask, "build", true, [
    desktopEvent("browser_open", {}, { error: "offline" }),
  ]).missing.length,
);
assert.deepEqual(
  desktopTaskProgress(desktopTask, "build", true, [
    desktopEvent("browser_open", {}, { status: "rejected" }),
  ]).missing,
  [],
);
assert.deepEqual(
  desktopTaskProgress("Read the website; do not save a report", "build", true)
    .missing,
  [],
);
console.log(
  "PASS: desktop completion distinguishes discovery, navigation, verification, file saves and matching readback; rejected actions stop recovery.",
);

for (const content of [
  "null",
  "[]",
  '{"action":"read_file","arguments":[]}',
  '{"response":"reading now"}',
  "not JSON",
]) {
  assert.throws(
    () => responseFrom("ollama", { message: { content } }, true),
    (e) => e.code === "MODEL_ACTION_FORMAT",
  );
}
for (const call of [
  { name: "read_file", arguments: { path: "x.py" } },
  { function: { name: "read_file", arguments: '{"path":"x.py"}' } },
]) {
  assert.equal(
    responseFrom("ollama", { message: { content: JSON.stringify(call) } }, true)
      .toolCalls[0].args.path,
    "x.py",
  );
}
assert.throws(
  () =>
    responseFrom("ollama", {
      message: {
        tool_calls: [{ function: { name: "read_file", arguments: "{" } }],
      },
    }),
  (e) => e.code === "MODEL_ACTION_FORMAT",
);
console.log(
  "PASS: action decoding accepts explicit function envelopes, rejects non-object arguments, and classifies malformed native/text calls for safe recovery.",
);
