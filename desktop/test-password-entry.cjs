const assert = require("node:assert/strict");
const { Computer } = require("./computer.cjs");
const fs = require("node:fs"),
  vm = require("node:vm");
(async () => {
  let allowed = true,
    changed = false,
    entries = 0,
    secretSeen = false;
  const secret = "public-fixture-value";
  const workspace = {
    require() {
      if (!allowed) throw Error("Denied");
    },
  };
  const rows = () => [
    {
      id: "0",
      role: "secure field",
      label: "Password",
      secure: true,
      value: "[redacted]",
      locator: { runtime: changed ? "changed" : "one" },
    },
  ];
  const computer = new Computer(
    workspace,
    () => {},
    "win32",
    async (req) => {
      if (req.operation === "read") return { elements: rows() };
      if (req.operation === "fill_password") {
        entries++;
        secretSeen = req.secret === secret;
        return { status: "filled", secret: "must not propagate" };
      }
    },
  );
  computer.configure(["fixture"]);
  let state = await computer.read({ app: "fixture" });
  assert.equal(state.elements[0].value, "[redacted]");
  assert(!JSON.stringify(state).includes("runtime"));
  await assert.rejects(
    computer.action({
      app: "fixture",
      snapshot: state.snapshot,
      operation: "set_text",
      element: "0",
      text: secret,
    }),
    /non-secure/,
  );
  computer.passwordPrompt = async () => null;
  assert.equal(
    (
      await computer.fillPassword({
        app: "fixture",
        snapshot: state.snapshot,
        element: "0",
      })
    ).status,
    "rejected",
  );
  assert.equal(entries, 0);
  computer.passwordPrompt = async () => {
    changed = true;
    return secret;
  };
  await assert.rejects(
    computer.fillPassword({
      app: "fixture",
      snapshot: state.snapshot,
      element: "0",
    }),
    /target changed/i,
  );
  assert.equal(entries, 0);
  changed = false;
  state = await computer.read({ app: "fixture" });
  computer.passwordPrompt = async () => {
    computer.cancel();
    return secret;
  };
  await assert.rejects(
    computer.fillPassword({
      app: "fixture",
      snapshot: state.snapshot,
      element: "0",
    }),
    /revoked/,
  );
  assert.equal(entries, 0);
  state = await computer.read({ app: "fixture" });
  computer.passwordPrompt = async () => secret;
  const result = await computer.fillPassword({
    app: "fixture",
    snapshot: state.snapshot,
    element: "0",
  });
  assert.deepEqual(result, { status: "filled", submitted: false });
  assert(secretSeen);
  assert.equal(entries, 1);
  assert(!JSON.stringify(result).includes(secret));
  assert.equal(computer.redact({ value: secret }).value, "[redacted]");
  await assert.rejects(
    computer.screenshot({ app: "fixture" }),
    /redacted text/,
  );
  await assert.rejects(
    computer.fillPassword({
      app: "fixture",
      snapshot: state.snapshot,
      element: "0",
    }),
    /fresh/,
  );
  const moduleObject = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("./browser.cjs"), "utf8"),
    {
      module: moduleObject,
      require: (n) => (n === "electron" ? {} : require(n)),
      URL,
    },
  );
  const browser = new moduleObject.exports.Browser(
    { require() {}, fullComputer: true },
    null,
  );
  const element = {
    type: "password",
    isConnected: true,
    value: "",
    getClientRects: () => [{}],
    dispatchEvent() {},
  };
  class Input {}
  Object.defineProperty(Input.prototype, "value", {
    set(value) {
      this.value = value;
    },
    configurable: true,
  });
  const page = vm.createContext({
    window: { __cipherBrowserElements: [element] },
    location: { href: "https://fixture.test/login" },
    HTMLInputElement: Input,
    Event: class {},
  });
  let url = "https://fixture.test/login";
  const wc = {
    getURL: () => url,
    executeJavaScript: (code) => Promise.resolve(vm.runInContext(code, page)),
  };
  browser.window = { isDestroyed: () => false, webContents: wc };
  browser.snapshot = "browser-one";
  browser.passwordPrompt = async () => secret;
  const filled = await browser.fillPassword({
    snapshot: "browser-one",
    element: "0",
  });
  assert.equal(filled.status, "filled");
  assert.equal(element.value, secret);
  assert(!JSON.stringify(filled).includes(secret));
  browser.snapshot = "browser-two";
  browser.passwordPrompt = async () => {
    url = "https://other.test";
    return secret;
  };
  await assert.rejects(
    browser.fillPassword({ snapshot: "browser-two", element: "0" }),
    /target changed/i,
  );
  url = "https://fixture.test/login";
  browser.snapshot = "permission-one";
  let decisions = [];
  browser.pendingPermissions.set("request-one", {
    id: "request-one",
    origin: "https://fixture.test",
    permission: "notifications",
    media: [],
    callback: (allow) => decisions.push(allow),
  });
  const details = browser.permissionDetails({
    id: "request-one",
    snapshot: "permission-one",
  });
  assert.equal(details.origin, "https://fixture.test");
  assert.deepEqual(decisions, []);
  assert.throws(
    () =>
      browser.permission({ id: "request-one", snapshot: "old", allow: true }),
    /current page/,
  );
  assert.deepEqual(decisions, []);
  assert.equal(
    browser.permission({
      id: "request-one",
      snapshot: "permission-one",
      allow: true,
    }).status,
    "decision_sent",
  );
  assert.deepEqual(decisions, [true]);
  assert.throws(
    () =>
      browser.permission({
        id: "request-one",
        snapshot: "permission-one",
        allow: true,
      }),
    /current page/,
  );
  browser.snapshot = "permission-two";
  browser.pendingPermissions.set("request-two", {
    id: "request-two",
    origin: "https://different.test",
    permission: "media",
    callback: (allow) => decisions.push(allow),
  });
  assert.throws(
    () =>
      browser.permissionDetails({
        id: "request-two",
        snapshot: "permission-two",
      }),
    /current page/,
  );
  browser.denyPermissions();
  assert.deepEqual(decisions, [true, false]);
  assert.equal(browser.permissionGrants.size, 0);
  console.log(
    "PASS: secure entry uses a bound field, keeps values outside tool results, does not submit, rejects stale/changed targets and cancellation, and redacts reflected values.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
