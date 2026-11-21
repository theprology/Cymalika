// Creates documentation captures from an isolated copy of the real renderer.
// No model/runtime download, real credential, or personal project is used.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { spawn } = require("node:child_process");
(async () => {
  const root = path.resolve(__dirname, "..");
  const out = path.resolve(
    process.argv[2] || path.join(root, "../guide-production-060"),
  );
  await fs.mkdir(out, { recursive: true });
  const runtime = await fs.mkdtemp(
    path.join(os.tmpdir(), "cipher-guide-runtime-"),
  );
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "cipher-guide-data-"));
  await fs.cp(path.join(root, "desktop"), path.join(runtime, "desktop"), {
    recursive: true,
  });
  await fs.cp(path.join(root, "web"), path.join(runtime, "web"), {
    recursive: true,
  });
  await fs.copyFile(
    path.join(root, "package.json"),
    path.join(runtime, "package.json"),
  );
  await fs.copyFile(
    path.join(root, "scripts/guide-runner.cjs"),
    path.join(runtime, "desktop/guide-runner.cjs"),
  );
  await fs.cp(
    path.join(root, "docs/tutorial-project"),
    path.join(data, "Cipher-practice"),
    { recursive: true },
  );
  let main = await fs.readFile(path.join(runtime, "desktop/main.cjs"), "utf8");
  main = main
    .replace("    width: 1440,", "    show: false,\n    width: 1440,")
    .replace("    height: 940,", "    height: 960,")
    .replace(
      '      preload: path.join(__dirname, "preload.cjs"),',
      '      backgroundThrottling: false,\n      preload: path.join(__dirname, "preload.cjs"),',
    )
    .replace(
      "const result = await verifyStartup();",
      'const result = await require("./guide-runner.cjs")({win,workspace,modelLibrary,out:process.env.CIPHER_GUIDE_OUT,data:process.env.CIPHER_SMOKE_DATA});',
    );
  await fs.writeFile(path.join(runtime, "desktop/main.cjs"), main);
  const child = spawn(require("electron"), [runtime, "--smoke-test"], {
    stdio: "inherit",
    env: { ...process.env, CIPHER_SMOKE_DATA: data, CIPHER_GUIDE_OUT: out },
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.rm(data, { recursive: true, force: true });
  if (code !== 0) throw Error("Guide capture failed: " + code);
  console.log("Guide captures:", out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
