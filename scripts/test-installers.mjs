import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const run = (exe, args, env = process.env) =>
  spawnSync(exe, args, { encoding: "utf8", env, timeout: 15000 });
if (process.platform === "win32") {
  const parse =
    '$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path "install.ps1"),[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|Out-String|Write-Error;exit 1};& ./install.ps1 -Version 0.3.0 -WhatIf';
  const r = run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", parse]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /What if:/i);
  console.log("PASS: Windows installer syntax and no-download WhatIf mode.");
} else {
  assert.equal(run("bash", ["-n", "install.sh"]).status, 0);
  const fixture = await mkdtemp(path.join(tmpdir(), "cipher-installer-"));
  try {
    const bin = path.join(fixture, "bin");
    await mkdir(bin);
    await writeFile(
      path.join(bin, "uname"),
      '#!/bin/sh\nif [ "$1" = -s ]; then echo Linux; else echo x86_64; fi\n',
      { mode: 0o755 },
    );
    await writeFile(
      path.join(bin, "curl"),
      `#!/bin/sh
out='';url=''
while [ "$#" -gt 0 ]; do
 case "$1" in --output|-o) out="$2";shift 2;; -*) shift;; *) url="$1";shift;; esac
done
case "$url" in */SHA256SUMS.txt) cp "$CIPHER_INSTALL_TEST/sums" "$out";; *) cp "$CIPHER_INSTALL_TEST/payload" "$out";; esac
`,
      { mode: 0o755 },
    );
    const payload = "Cipher installer checksum fixture\n",
      digest = createHash("sha256").update(payload).digest("hex");
    await writeFile(path.join(fixture, "payload"), payload);
    await writeFile(
      path.join(fixture, "sums"),
      digest + "  Cipher-0.3.0-x86_64.AppImage\n",
    );
    const env = {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      CIPHER_INSTALL_TEST: fixture,
    };
    let r = run(
      "bash",
      ["install.sh", "--version", "0.3.0", "--appimage", "--dry-run"],
      env,
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No files were downloaded or installed/);
    r = run(
      "bash",
      ["install.sh", "--version", "0.3.0", "--appimage", "--verify-only"],
      env,
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Checksum verified/);
    assert.match(r.stdout, /Nothing was installed/);
    await writeFile(path.join(fixture, "payload"), "corrupted download");
    r = run(
      "bash",
      ["install.sh", "--version", "0.3.0", "--appimage", "--verify-only"],
      env,
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Checksum mismatch/);
    r = run(
      "bash",
      ["install.sh", "--version", "../../invalid", "--dry-run"],
      env,
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /valid release version/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
  console.log(
    "PASS: terminal installer syntax, dry-run, checksum verification, corruption rejection and version validation.",
  );
}
