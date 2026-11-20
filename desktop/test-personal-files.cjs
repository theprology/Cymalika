const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PersonalFiles } = require("./personal-files.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cipher-personal-"));
  const home = path.join(root, "home");
  await fs.mkdir(path.join(home, "Documents"), { recursive: true });
  await fs.mkdir(path.join(home, "Library"));
  await fs.writeFile(
    path.join(home, "Documents", "notes.txt"),
    "Original notes\n",
  );
  await fs.writeFile(
    path.join(home, "Library", "credentials"),
    "private fixture",
  );
  const files = new PersonalFiles(path.join(root, "state"), home);
  const listing = await files.inspect("list");
  assert.deepEqual(
    listing.entries.map((e) => e.name),
    ["Documents"],
  );
  const read = await files.inspect("read", "Documents/notes.txt");
  assert.equal(read.content, "Original notes\n");
  for (const forbidden of [
    "../outside",
    "/etc/passwd",
    "Library/credentials",
    ".ssh/id_rsa",
    "Documents/.env",
    "Documents/id_rsa",
    "AppData/Cookies",
  ]) {
    await assert.rejects(files.inspect("read", forbidden));
  }
  await assert.rejects(
    files.prepare({ path: "Documents/notes.txt", content: "missing hash" }),
  );
  const edit = await files.prepare({
    path: "Documents/notes.txt",
    content: "Revised notes\n",
    expected_hash: read.hash,
  });
  assert.equal(
    (await files.inspect("read", "Documents/notes.txt")).content,
    read.content,
  );
  await files.workspace.apply(edit.id);
  assert.equal(
    (await files.inspect("read", "Documents/notes.txt")).content,
    "Revised notes\n",
  );
  await files.workspace.undo(edit.id);
  assert.equal(
    (await files.inspect("read", "Documents/notes.txt")).content,
    read.content,
  );
  const cancelled = await files.prepare({
    path: "Documents/report.txt",
    content: "should not save",
  });
  files.workspace.commands.set("pending", {
    root: files.home,
    command: "echo should-not-run",
  });
  files.cancel();
  await assert.rejects(files.workspace.apply(cancelled.id));
  await assert.rejects(files.workspace.command("pending"));
  try {
    await fs.symlink(
      root,
      path.join(home, "Documents", "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(files.inspect("list", "Documents/escape"));
  } catch (error) {
    if (!["EPERM", "EACCES"].includes(error.code)) throw error;
  }
  files.workspace.commands.set("cwd", {
    root: files.home,
    cwd: path.join(home, "Documents"),
    command: 'node -e "process.stdout.write(process.cwd())"',
  });
  const result = await files.workspace.command("cwd");
  assert.equal(result.exit_code, 0, result.output);
  assert.equal(result.output, await fs.realpath(path.join(home, "Documents")));
  console.log(
    "PASS: user-folder discovery, protected paths, stale-write hashes, reviewed save/undo, chosen command cwd and revocation of prepared operations.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
