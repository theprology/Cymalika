import assert from "node:assert/strict";
import { createProgressGuard, requestFor } from "./web/engine.mjs";
const read = { name: "read_file", args: { path: "src/app.py" } },
  search = { name: "search_project", args: { query: "missing" } };
const original = {
  path: "src/app.py",
  content: "def total(): return 2",
  hash: "original",
};
const g = createProgressGuard();
assert.equal(g.before(read), null);
g.observe(read, original);
assert.equal(
  g.before({ ...read, args: { path: "./src/app.py" } }).tool_result.hash,
  "original",
);
assert.equal(g.before(read).reused, true);
assert.equal(g.recover().attempt, 1);
assert(
  !g
    .tools([{ name: "read_file" }, { name: "request_edit" }])
    .some((t) => t.name === "read_file"),
);
g.observe(
  { name: "request_edit", args: { path: "src/app.py" } },
  { status: "saved" },
);
assert.equal(
  g.before(read),
  null,
  "A saved edit invalidates the observation cache",
);
g.observe(read, { ...original, hash: "updated" });
const refresh = {
  name: "read_file",
  args: { path: "src/app.py", refresh: true },
};
assert.equal(g.before(refresh), null);
g.observe(refresh, { ...original, hash: "external" });
assert.equal(
  g.before(refresh).tool_result.hash,
  "external",
  "Refresh cannot defeat loop detection",
);
const cmd = {
  name: "request_command",
  args: { command: "python3 -m unittest" },
};
g.observe(cmd, { exit_code: 1, output: "failed" });
assert(
  g.before(cmd).repeated,
  "Do not repeat the same failed command without a change",
);
g.observe(
  { name: "request_edit", args: { path: "src/app.py" } },
  { status: "saved" },
);
assert.equal(g.before(cmd), null, "Tests may run again after a fix");
const denied = {
  name: "request_edit",
  args: { path: "other.py", content: "change" },
};
g.observe(denied, { status: "rejected" });
g.observe(
  { name: "request_command", args: { command: "unrelated check" } },
  { exit_code: 0 },
);
assert(
  g.before(denied).repeated,
  "An unrelated change never overrides rejection",
);
const b = createProgressGuard();
b.observe(search, []);
b.observe({ ...search, args: { query: "also missing" } }, []);
assert(b.recover(), "Different empty searches still trigger recovery");
b.observe(cmd, {
  exit_code: 2,
  output: JSON.stringify({
    state: "not_configured",
    missing_configuration: ["DATABASE_URL", "MANIFEST_PATH"],
    workers_started: false,
  }),
});
b.observe(read, original);
b.before(read);
b.before(read);
assert(b.recover().blocker);
assert.deepEqual(
  b.tools([{ name: "read_file" }, { name: "request_command" }]),
  [],
);
assert.match(b.prompt(), /DATABASE_URL/);
assert.match(b.prompt(), /not an uninspected live server/);
const history = requestFor(
  {
    provider: "ollama",
    endpoint: "http://localhost:11434",
    model: "existing",
    context: 4096,
    maxTokens: 1000,
  },
  [
    {
      role: "assistant",
      content: "Checking",
      toolCalls: [{ name: "read_file", args: { path: "source.py" } }],
    },
  ],
  [],
  true,
);
assert.match(
  history.body.messages[0].content,
  /source.py/,
  "Text fallback preserves action arguments alongside progress prose",
);
const snapshots = createProgressGuard(),
  snap = { name: "browser_read", args: {} };
snapshots.observe(snap, { snapshot: "a", text: "Loading" });
assert.equal(
  snapshots.before(snap),
  null,
  "Browser observations must stay fresh",
);
snapshots.observe(snap, { snapshot: "b", text: "Loaded" });
assert.equal(snapshots.before(snap), null);
console.log(
  "PASS: repeated reads/searches/actions, rejected-action persistence, fresh observations after edits, bounded external refresh, configuration blockers, and preserved action history.",
);

const partial = createProgressGuard(),
  first = {
    name: "read_file",
    args: { path: "large.py", start_line: 1, line_count: 2 },
  };
partial.observe(first, {
  path: "large.py",
  hash: "all-bytes",
  partial: true,
  start_line: 1,
  end_line: 2,
  total_lines: 4,
  content: "first half",
});
assert(
  partial.before({
    name: "request_edit",
    args: { path: "large.py", content: "partial replacement" },
  }).repeated,
);
partial.observe(
  {
    name: "read_file",
    args: { path: "large.py", start_line: 3, line_count: 2 },
  },
  {
    path: "large.py",
    hash: "all-bytes",
    partial: true,
    start_line: 3,
    end_line: 4,
    total_lines: 4,
    content: "second half",
  },
);
assert.equal(
  partial.before({
    name: "request_edit",
    args: { path: "large.py", content: "complete replacement" },
  }),
  null,
);
console.log(
  "PASS: partial file reads cannot silently replace unseen file contents.",
);

const cycle = createProgressGuard();
cycle.observe(
  { name: "read_file", args: { path: "compose.json" } },
  { content: "services", hash: "compose" },
);
cycle.observe(
  { name: "read_file", args: { path: "check.py" } },
  { content: "readiness", hash: "check" },
);
assert(
  cycle.before({ name: "read_file", args: { path: "compose.json" } }).reused,
);
assert(cycle.before({ name: "read_file", args: { path: "check.py" } }).reused);
assert(cycle.recover(), "Alternating repeated files must trigger recovery too");
console.log(
  "PASS: alternating file-read cycles are detected, not just adjacent duplicates.",
);
