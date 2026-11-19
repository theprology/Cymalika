const assert = require("node:assert/strict");
const { Computer } = require("./computer.cjs");
(async () => {
  const calls = [];
  const workspace = {
    require: (cap) => {
      if (!granted) throw Error("Denied");
    },
  };
  let granted = false;
  const computer = new Computer(
    workspace,
    async () => ({ data: "image" }),
    "win32",
    async (a) => {
      calls.push(a);
      if (a.operation === "read")
        return {
          elements: [
            { id: "0", label: "field", locator: { runtime: "42" } },
            { role: "secure field", label: "[redacted]" },
          ],
        };
      return { status: "performed" };
    },
  );
  computer.configure(["fixture"]);
  await assert.rejects(computer.read({ app: "fixture" }), /Denied/);
  granted = true;
  await assert.rejects(computer.read({ app: "other" }), /Allow/);
  const first = await computer.read({ app: "fixture" });
  assert.equal(first.elements[0].locator, undefined);
  await assert.rejects(
    computer.action({
      app: "fixture",
      operation: "set_text",
      snapshot: first.snapshot,
      element: "1",
      text: "x",
    }),
    /non-secure/,
  );
  await computer.action({
    app: "fixture",
    operation: "set_text",
    snapshot: first.snapshot,
    element: "0",
    text: "Cipher",
  });
  assert.deepEqual(calls.at(-1).locator, { runtime: "42" });
  await assert.rejects(
    computer.action({
      app: "fixture",
      operation: "press",
      snapshot: first.snapshot,
      element: "0",
    }),
    /fresh/,
  );
  const second = await computer.read({ app: "fixture" });
  computer.configure([]);
  await assert.rejects(
    computer.action({
      app: "fixture",
      operation: "press",
      snapshot: second.snapshot,
      element: "0",
    }),
    /Allow/,
  );
  assert.equal(calls.filter((c) => c.operation === "set_text").length, 1);
  console.log(
    "PASS: computer grants, app boundaries, private locators, secure fields and single-use snapshots.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Recovery must invalidate both executable proposals and app grants.
{
  const { Workspace } = require("./core.cjs");
  const { resetAfterRendererFailure } = require("./recovery.cjs");
  const workspace = new Workspace("unused-fixture-path");
  workspace.proposals.set("pending", {});
  workspace.commands.set("pending", {});
  workspace.grants = new Set(["computer", "browser", "extensions"]);
  workspace.origins = new Set(["http://localhost:3000"]);
  const computer = new Computer(
    workspace,
    () => {},
    "win32",
    async () => ({}),
  );
  computer.apps.add("fixture.editor");
  computer.snapshot = { id: "old" };
  const notice = resetAfterRendererFailure(
    () => {
      workspace.cancel();
      computer.cancel();
    },
    workspace,
    computer,
  );
  assert.equal(workspace.proposals.size, 0);
  assert.equal(workspace.commands.size, 0);
  assert.equal(computer.apps.size, 0);
  assert.equal(computer.snapshot, null);
  assert.equal(workspace.origins.size, 0);
  assert.deepEqual([...workspace.grants].sort(), [
    "commands",
    "edits",
    "files",
    "git",
  ]);
  assert.match(notice, /Pending work was cancelled/);
  console.log(
    "PASS: renderer recovery discards executable proposals, clears snapshots, revokes app/browser/extension access, and explains the interruption.",
  );
}
