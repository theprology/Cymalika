const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { Computer } = require("./computer.cjs");
const { Workspace } = require("./core.cjs");
const browserModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("./browser.cjs"), "utf8"), {
  module: browserModule,
  require: (name) => (name === "electron" ? {} : require(name)),
  URL,
});
const workspace = new Workspace("unused-fixture");
workspace.grants.add("browser");
workspace.grants.add("computer");
const browser = new browserModule.exports.Browser(workspace, null);
assert.throws(() => browser.check("https://example.org"), /Enable/);
const computer = new Computer(
  workspace,
  () => {},
  "win32",
  async () => ({}),
);
assert.throws(() => computer.require("fixture.editor"), /Allow/);
workspace.fullComputer = true;
assert.equal(
  browser.check("https://example.org/research"),
  "https://example.org/research",
);
assert.equal(browser.check("http://example.org/"), "http://example.org/");
computer.require("fixture.editor");
for (const url of [
  "file:///etc/passwd",
  "javascript:alert(1)",
  "https://user:password@example.org",
])
  assert.throws(() => browser.check(url));
workspace.fullComputer = false;
assert.throws(() => browser.check("https://example.org"), /Enable/);
assert.throws(() => computer.require("fixture.editor"), /Allow/);
assert.equal(new Workspace("unused-fresh-session").fullComputer, false);
console.log(
  "PASS: global app/web scope is session-only, revokes immediately, and still rejects non-web schemes and embedded credentials.",
);
