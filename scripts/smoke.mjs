import { mkdtemp, rm, readFile } from "node:fs/promises";
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
    env: {
      ...process.env,
      CIPHER_SMOKE_DATA: data,
      ELECTRON_ENABLE_LOGGING: "1",
      ELECTRON_LOG_FILE: path.join(data, "electron.log"),
    },
  });
  const evidence = await readFile(
    path.join(data, "startup-result.json"),
    "utf8",
  ).catch(() => "No startup result was written.");
  console.log(evidence);
  if (result.status !== 0)
    console.log(
      await readFile(path.join(data, "electron.log"), "utf8").catch(
        () => "No Electron log was written.",
      ),
    );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error("Packaged startup failed with status " + result.status);
  if (JSON.parse(evidence).ok !== true)
    throw Error("The packaged UI did not confirm startup.");
} finally {
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
