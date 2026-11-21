import { spawnSync } from "node:child_process";
for (const file of [
  "source/test-engine.mjs",
  "source/test-markdown.mjs",
  "source/test-advanced.mjs",
  "source/test-workbench.mjs",
  "source/test-mcp.mjs",
  "desktop/test-core.cjs",
  "desktop/test-coffee.cjs",
  "desktop/test-personal-files.cjs",
  "desktop/test-computer-access.cjs",
  "desktop/test-computer.cjs",
  "desktop/test-password-entry.cjs",
  "desktop/test-secure-prompt.cjs",
  "scripts/test-installers.mjs",
]) {
  const r = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
