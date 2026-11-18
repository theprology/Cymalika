import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const executable = process.argv[2];
if (!executable) throw Error("Pass the packaged executable path.");
const data = await mkdtemp(path.join(tmpdir(), "cipher-startup-"));
try {
  const result = spawnSync(path.resolve(executable), ["--smoke-test"], {
    stdio: "inherit",
    timeout: 45000,
    env: { ...process.env, CIPHER_SMOKE_DATA: data },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error("Packaged startup failed with status " + result.status);
} finally {
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
