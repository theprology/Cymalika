import { spawn } from "node:child_process";
import path from "node:path";
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
try {
  let app;
  for (let i = 0; i < 25; i++) {
    const apps = await computer.runningApps();
    app = apps.find(
      (a) =>
        a.name.includes("Cipher computer fixture") ||
        a.name.includes("computer-fixture"),
    );
    if (app) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(app, "The fixture must appear as a real running accessible app.");
  computer.configure([app.id]);
  let snapshot = await computer.read({ app: app.id });
  const field = snapshot.elements.find(
    (e) =>
      e.editable &&
      (e.value === "before" || e.label === "Cipher fixture entry"),
  );
  assert.ok(field, "Find actual editable fixture field.");
  await computer.action({
    app: app.id,
    operation: "set_text",
    snapshot: snapshot.snapshot,
    element: field.id,
    text: "Cipher",
  });
  snapshot = await computer.read({ app: app.id });
  assert.ok(
    snapshot.elements.some((e) => e.value === "Cipher"),
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
  assert.ok(
    snapshot.elements.some(
      (e) => e.label === "Applied Cipher" || e.value === "Applied Cipher",
    ),
    "Observe actual button effect.",
  );
  console.log(
    "PASS: live target-OS app discovery, accessibility read, text edit, button invocation and independent read-back.",
  );
} finally {
  computer.cancel();
  fixture.kill();
}
