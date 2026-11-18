import { spawnSync } from "node:child_process";
for (const file of [
  "source/test-engine.mjs",
  "source/test-markdown.mjs",
  "source/test-advanced.mjs",
  "source/test-workbench.mjs",
  "source/test-mcp.mjs",
  "desktop/test-core.cjs",
]) {
  const r = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
