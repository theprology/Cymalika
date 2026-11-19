import assert from "node:assert/strict";
import {
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
assert.equal(r.body.format, "json");
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
assert.throws(() =>
  trimHistory([{ role: "user", content: "x".repeat(15000) }], 4096),
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
assert.throws(() =>
  trimHistory(
    [
      { role: "user", content: "x".repeat(30000) },
      { role: "user", internal: true, content: "image context" },
    ],
    8192,
  ),
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
