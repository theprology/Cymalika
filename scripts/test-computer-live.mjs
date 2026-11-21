import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import assert from "node:assert/strict";
import { Computer } from "../desktop/computer.cjs";
const windows = process.platform === "win32";
const fixture = spawn(
  windows
    ? path.join(
        process.env.SystemRoot,
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      )
    : "/usr/bin/python3",
  windows
    ? ["-NoProfile", "-File", "scripts/computer-fixture.ps1"]
    : ["scripts/computer-fixture.py"],
  { stdio: "inherit", env: { ...process.env, NO_AT_BRIDGE: "0" } },
);
const computer = new Computer({ require: () => {} }, () => {});
const deadline = setTimeout(() => {
  console.error("Live computer test exceeded 75 seconds.");
  computer.cancel();
  fixture.kill();
  process.exit(1);
}, 75000);
try {
  const available = await computer.call({ operation: "installed" });
  assert(Array.isArray(available));
  assert(
    available.every(
      (entry) => typeof entry.id === "string" && typeof entry.name === "string",
    ),
  );
  let app;
  for (let i = 0; i < 25; i++) {
    const apps = await computer.runningApps();
    app = apps.find(
      (a) =>
        a.name.includes("CyMalika computer fixture") ||
        a.name.includes("computer-fixture"),
    );
    if (app) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(app, "The fixture must appear as a real running accessible app.");
  computer.configure([app.id]);
  let snapshot = await computer.read({ app: app.id });
  assert.ok(
    !JSON.stringify(snapshot).includes("fixture-secret-never-read"),
    "Password text is never exposed.",
  );
  assert.ok(
    snapshot.elements.some((e) => e.role === "secure field"),
    "Password field is explicitly redacted.",
  );
  const field = snapshot.elements.find(
    (e) =>
      e.editable &&
      (e.value === "before" || e.label === "CyMalika fixture entry"),
  );
  if (!field) console.log(JSON.stringify(snapshot));
  assert.ok(field, "Find actual editable fixture field.");
  await computer.action({
    app: app.id,
    operation: "set_text",
    snapshot: snapshot.snapshot,
    element: field.id,
    text: "CyMalika",
  });
  snapshot = await computer.read({ app: app.id });
  console.log(JSON.stringify(snapshot));
  assert.ok(
    snapshot.elements.some((e) => e.value === "CyMalika"),
    "Read actual replacement text.",
  );
  const button = snapshot.elements.find(
    (e) => e.label === "Apply fixture" && e.actions?.length,
  );
  assert.ok(button, "Find actual fixture button.");
  await computer.action({
    app: app.id,
    operation: "press",
    snapshot: snapshot.snapshot,
    element: button.id,
  });
  snapshot = await computer.read({ app: app.id });
  console.log(JSON.stringify(snapshot));
  assert.ok(
    snapshot.elements.some(
      (e) => e.label === "Applied CyMalika" || e.value === "Applied CyMalika",
    ),
    "Observe actual button effect.",
  );
  const entryAgain = snapshot.elements.find(
    (e) => e.editable && e.value === "CyMalika",
  );
  await computer.action({
    app: app.id,
    operation: "set_text",
    snapshot: snapshot.snapshot,
    element: entryAgain.id,
    text: "Clicked",
  });
  snapshot = await computer.read({ app: app.id });
  const clickTarget = snapshot.elements.find(
    (e) => e.label === "Apply fixture",
  );
  assert.ok(
    clickTarget.bounds?.width > 0,
    "Native control coordinates are available.",
  );
  await computer.action({
    app: app.id,
    operation: "click",
    snapshot: snapshot.snapshot,
    x: Math.round(clickTarget.bounds.x + clickTarget.bounds.width / 2),
    y: Math.round(clickTarget.bounds.y + clickTarget.bounds.height / 2),
  });
  snapshot = await computer.read({ app: app.id });
  assert.ok(
    snapshot.elements.some(
      (e) => e.label === "Applied Clicked" || e.value === "Applied Clicked",
    ),
    "Pointer click reached the actual allowed button.",
  );
  await computer.action({
    app: app.id,
    operation: "key",
    snapshot: snapshot.snapshot,
    key: "left",
    modifiers: [],
  });
  const target = await computer.call({ operation: "window", app: app.id });
  assert.ok(
    target.window && target.bounds.width > 0,
    "Allowed capture window has a native identity and bounds.",
  );
  assert.equal(
    Number(app.id.split(":")[0]),
    fixture.pid,
    "Only capture the disposable fixture process.",
  );
  const captured = spawnSync(
    require("electron"),
    ["scripts/test-computer-capture.cjs", app.id],
    { stdio: "inherit", timeout: 35000 },
  );
  if (captured.error) throw captured.error;
  assert.equal(
    captured.status,
    0,
    "Actual native window capture must succeed.",
  );
  snapshot = await computer.read({ app: app.id });
  const secureField = snapshot.elements.find((e) => e.secure);
  assert(secureField?.id, "Password field has a redacted target reference.");
  computer.passwordPrompt = async () => "cymalika-public-password-fixture";
  const filled = await computer.fillPassword({
    app: app.id,
    snapshot: snapshot.snapshot,
    element: secureField.id,
    reason: "Public fixture only",
  });
  assert.equal(filled.status, "filled");
  snapshot = await computer.read({ app: app.id });
  assert(
    !JSON.stringify(snapshot).includes("cymalika-public-password-fixture"),
  );
  assert(
    snapshot.elements.some(
      (e) =>
        e.label === "Password fixture filled" ||
        e.value === "Password fixture filled",
    ),
    "The actual secure field received the fixture value without exposing it.",
  );
  const permission = snapshot.elements.find(
    (e) => e.label === "Allow demo feature",
  );
  assert(permission?.id);
  await computer.action({
    app: app.id,
    snapshot: snapshot.snapshot,
    element: permission.id,
    operation: "press",
  });
  snapshot = await computer.read({ app: app.id });
  assert(
    snapshot.elements.some(
      (e) =>
        e.label === "Demo permission: allowed" ||
        e.value === "Demo permission: allowed",
    ),
  );
  console.log(
    "PASS: actual target-OS fixture password fill/redaction and permission checkbox invocation/readback.",
  );
  console.log(
    "PASS: live target-OS app discovery, password redaction, text edit, button invocation, pointer click, key input and independent read-back.",
  );
} finally {
  clearTimeout(deadline);
  computer.cancel();
  fixture.kill();
}
