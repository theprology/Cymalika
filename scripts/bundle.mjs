import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "web");
await mkdir(out, { recursive: true });
await cp(path.join(root, "source/web"), out, { recursive: true });
const parts = [];
for (const file of [
  "engine.mjs",
  "markdown.mjs",
  "advanced-engine.mjs",
  "app.mjs",
  "features.mjs",
  "model-library.mjs",
]) {
  let text = await readFile(path.join(out, file), "utf8");
  text = text
    .replace(/^import .*?;\s*$/gm, "")
    .replace(/\bexport (const|function) /g, "$1 ");
  parts.push(text);
}
await writeFile(path.join(out, "app.bundle.js"), parts.join("\n"));
const index = await readFile(path.join(out, "index.html"), "utf8");
await writeFile(
  path.join(out, "index.html"),
  index.replace(
    '<script type="module" src="app.mjs"></script>',
    '<script src="app.bundle.js"></script>',
  ),
);
