const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { migrateProfile } = require("./migration.cjs");
test("upgrade preserves source data and never overwrites an existing profile", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cymalika-upgrade-"));
  try {
    const old = path.join(root, "old");
    const dest = path.join(root, "new");
    await fs.mkdir(path.join(old, "workspace"), { recursive: true });
    const state = JSON.stringify({
      settings: { model: "existing-model", assistantName: "Atlas" },
      chats: [{ id: "saved" }],
    });
    await fs.writeFile(path.join(old, "workspace/state.json"), state);
    assert.equal(
      await migrateProfile(dest, [path.join(root, "missing"), old]),
      true,
    );
    assert.equal(
      await fs.readFile(path.join(dest, "workspace/state.json"), "utf8"),
      state,
    );
    assert.equal(
      await fs.readFile(path.join(old, "workspace/state.json"), "utf8"),
      state,
    );
    await fs.writeFile(path.join(dest, "workspace/state.json"), "newer");
    assert.equal(await migrateProfile(dest, [old]), false);
    assert.equal(
      await fs.readFile(path.join(dest, "workspace/state.json"), "utf8"),
      "newer",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
