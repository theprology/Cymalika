import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const source = process.argv[2];
if (!source) throw Error("Pass the built package path.");
if (process.platform === "darwin" && process.arch !== "arm64") {
  console.log(
    "Mac terminal download targets Apple Silicon; skipping Intel installation.",
  );
  process.exit(0);
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const asset =
  process.platform === "darwin"
    ? `Cipher-${version}-mac-arm64.dmg`
    : `Cipher-${version}-amd64.deb`;
const fixture = await mkdtemp(path.join(tmpdir(), "cipher-package-install-"));
try {
  await copyFile(source, path.join(fixture, asset));
  const digest = createHash("sha256")
    .update(await readFile(source))
    .digest("hex");
  await writeFile(
    path.join(fixture, "SHA256SUMS.txt"),
    `${digest}  ${asset}\n`,
  );
  await writeFile(
    path.join(fixture, "curl"),
    `#!/bin/sh
out='';url=''
while [ "$#" -gt 0 ]; do
 case "$1" in --output|-o) out="$2";shift 2;; -*) shift;; *) url="$1";shift;; esac
done
name=$(basename "$url")
case "$name" in SHA256SUMS.txt|Cipher-*) cp "$CIPHER_INSTALL_PACKAGE/$name" "$out";; *) exit 1;; esac
`,
    { mode: 0o755 },
  );
  const result = spawnSync("bash", ["install.sh", "--version", version], {
    stdio: "inherit",
    timeout: 180000,
    env: {
      ...process.env,
      PATH: fixture + path.delimiter + process.env.PATH,
      CIPHER_INSTALL_PACKAGE: fixture,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error("Terminal package installation failed: " + result.status);
  console.log(
    "PASS: terminal installer verified and installed the real built package.",
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
