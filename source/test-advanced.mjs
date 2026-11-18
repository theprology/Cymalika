import assert from "node:assert/strict";
import {
  newStream,
  streamLine,
  streamResult,
  permittedTools,
  lineDiff,
  validatePlan,
  resourceContext,
  mcpParameterHeaders,
  mcpHeaderValue,
} from "./web/advanced-engine.mjs";
import { TOOLS, responseFrom, requestFor, trimHistory } from "./web/engine.mjs";
let s = newStream("ollama");
for (const d of [
  { message: { content: "Hello " } },
  {
    message: {
      content: "world",
      tool_calls: [
        { function: { name: "read_file", arguments: { path: "a.py" } } },
      ],
    },
  },
  { done: true, prompt_eval_count: 12, eval_count: 5 },
])
  streamLine(s, JSON.stringify(d));
assert.equal(s.text, "Hello world");
assert.equal(
  responseFrom("ollama", streamResult(s)).toolCalls[0].args.path,
  "a.py",
);
s = newStream("openai");
for (const delta of [
  { content: "Result: " },
  {
    tool_calls: [
      {
        index: 0,
        id: "call_1",
        function: { name: "read_", arguments: '{"pa' },
      },
    ],
  },
  {
    tool_calls: [
      { index: 0, function: { name: "file", arguments: 'th":"a.py"}' } },
    ],
  },
])
  streamLine(s, "data: " + JSON.stringify({ choices: [{ delta }] }));
streamLine(s, "data: [DONE]");
assert.equal(
  responseFrom("openai", streamResult(s)).toolCalls[0].name,
  "read_file",
);
assert.equal(
  responseFrom("openai", streamResult(s)).toolCalls[0].args.path,
  "a.py",
);
s = newStream("anthropic");
for (const d of [
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "c", name: "read_file", input: {} },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { partial_json: '{"path":' },
  },
  { type: "content_block_delta", index: 1, delta: { partial_json: '"a.py"}' } },
  { type: "content_block_delta", index: 0, delta: { text: "Reading" } },
])
  streamLine(s, "data: " + JSON.stringify(d));
assert.equal(
  responseFrom("anthropic", streamResult(s)).toolCalls[0].args.path,
  "a.py",
);
assert.throws(() => streamLine(s, 'data: {"error":{"message":"bad"}}'), /bad/);
const access = {
  files: true,
  edits: true,
  commands: true,
  git: true,
  browser: true,
  computer: true,
  extensions: true,
};
for (const mode of ["ask", "plan"]) {
  const tools = permittedTools(
    TOOLS,
    mode,
    access,
    [{ name: "ext_mutation" }],
    true,
  ).map((t) => t.name);
  for (const forbidden of [
    "request_edit",
    "request_command",
    "computer_action",
    "computer_screenshot",
    "computer_read",
    "git_change",
    "browser_action",
    "ext_mutation",
    "goal_progress",
  ])
    assert(!tools.includes(forbidden), mode + ":" + forbidden);
  assert(tools.includes("propose_plan"));
  assert(tools.includes("resources_list"));
}
assert(
  !permittedTools(TOOLS, "build", { ...access, computer: false }).some((t) =>
    t.name.startsWith("computer_"),
  ),
);
assert(
  !permittedTools(TOOLS, "build", access, [], false).some(
    (t) => t.name === "computer_screenshot",
  ),
);
assert(
  permittedTools(TOOLS, "build", access, [], true).some(
    (t) => t.name === "computer_screenshot",
  ),
);
const resources = [
  { id: "a", enabled: true },
  { id: "b", project: "/p", enabled: true },
  { id: "c", project: "/q", enabled: true },
  { id: "d", project: "/p", goal: "g", enabled: true },
  { id: "e", enabled: false },
];
assert.deepEqual(
  resourceContext(resources, "/p", "g").map((r) => r.id),
  ["a", "b", "d"],
);
assert.deepEqual(
  resourceContext(resources, "/q", "").map((r) => r.id),
  ["a", "c"],
);
assert.throws(() =>
  validatePlan({ title: "x", steps: [{ title: "no check" }] }),
);
assert.equal(
  validatePlan({
    title: "Feature",
    steps: [{ title: "Add test", check: "Test fails before fix" }],
  }).status,
  "draft",
);
const diff = lineDiff("one\ntwo\nthree", "one\nTWO\nthree");
assert(diff.some((r) => r.type === "remove" && r.text === "two"));
assert(diff.some((r) => r.type === "add" && r.text === "TWO"));
assert(!lineDiff("same", "same").some((r) => r.type !== "same"));
for (const provider of ["ollama", "openai", "anthropic"]) {
  const r = requestFor(
    {
      provider,
      endpoint: "http://localhost:11434",
      model: "local",
      context: 8192,
      maxTokens: 1024,
      temperature: 0.2,
    },
    [
      {
        role: "user",
        content: "Look",
        images: [{ data: "aGVsbG8=", mime: "image/png" }],
      },
    ],
    [],
  );
  assert(JSON.stringify(r.body).includes("aGVsbG8="));
}
assert.equal(
  trimHistory(
    [
      {
        role: "user",
        content: "image",
        images: [{ data: "x".repeat(1000000), mime: "image/jpeg" }],
      },
    ],
    8192,
  ).messages.length,
  1,
);
const schema = {
  type: "object",
  properties: {
    region: { type: "string", "x-mcp-header": "Region" },
    nested: {
      type: "object",
      properties: { flag: { type: "boolean", "x-mcp-header": "Flag" } },
    },
  },
};
assert.deepEqual(
  mcpParameterHeaders(schema, { region: "a", nested: { flag: true } }),
  { "Mcp-Param-Region": "a", "Mcp-Param-Flag": "true" },
);
assert(mcpHeaderValue("line\nbreak").startsWith("=?base64?"));
assert.throws(() =>
  mcpParameterHeaders({
    type: "array",
    items: { type: "string", "x-mcp-header": "bad" },
  }),
);
assert.throws(() =>
  mcpParameterHeaders({ type: "string", "x-mcp-header": "bad\r\nheader" }),
);
assert.throws(() =>
  mcpParameterHeaders({
    type: "object",
    properties: {
      a: { type: "string", "x-mcp-header": "X" },
      b: { type: "string", "x-mcp-header": "x" },
    },
  }),
);
console.log(
  "PASS: stream assembly for 3 providers, fragmented tool calls, mode/capability gates, scoped resources, plan validation, line diffs, image history/adapters, MCP header validation.",
);
