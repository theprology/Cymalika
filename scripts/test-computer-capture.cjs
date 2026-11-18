const { app, nativeImage } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Computer } = require("../desktop/computer.cjs");
const { Workspace } = require("../desktop/core.cjs");
const capture = require("../desktop/capture.cjs");
const id = process.argv[2];
if (!/^\d+:\d+$/.test(id || ""))
  throw Error("Pass the identity of the disposable test app.");
let computer;
app
  .whenReady()
  .then(async () => {
    const data = await fs.mkdtemp(
      path.join(os.tmpdir(), "cipher-capture-test-"),
    );
    try {
      const workspace = new Workspace(data);
      await workspace.init();
      workspace.grants.add("computer");
      computer = new Computer(workspace, capture);
      computer.configure([id]);
      const image = await computer.screenshot({ app: id });
      assert.ok(image.width > 0 && image.height > 0 && image.bounds.width > 0);
      const bytes = Buffer.from(image.data, "base64");
      assert.equal(bytes[0], 255);
      assert.equal(bytes[1], 216);
      const pixels = nativeImage.createFromBuffer(bytes).toBitmap();
      let varied = false;
      for (let i = 4; i < pixels.length; i += 4) {
        if (
          pixels[i] !== pixels[0] ||
          pixels[i + 1] !== pixels[1] ||
          pixels[i + 2] !== pixels[2]
        ) {
          varied = true;
          break;
        }
      }
      assert.ok(varied, "Capture must contain actual visible fixture pixels.");
      await fs.mkdir("build", { recursive: true });
      await fs.writeFile(
        "build/computer-capture-" + process.platform + ".jpg",
        bytes,
      );
      console.log(
        "PASS: native window identity, actual Electron window capture, JPEG decoding and visible pixels.",
      );
    } finally {
      computer?.cancel();
      await fs.rm(data, { recursive: true, force: true });
    }
    app.exit(0);
  })
  .catch((e) => {
    console.error(e);
    computer?.cancel();
    app.exit(1);
  });
