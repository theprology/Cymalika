import { spawnSync } from "node:child_process";
import { writeFile, mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
if (process.platform !== "win32")
  throw Error("Build Windows releases on Windows.");
const base = JSON.parse(await readFile("package.json", "utf8")).build;
const config = {
  ...base,
  forceCodeSigning: true,
  win: { ...base.win, signExecutable: true, signExts: [".ps1"] },
};
const azure = process.env.CYMALIKA_AZURE_ENDPOINT;
if (azure) {
  for (const key of [
    "CYMALIKA_AZURE_ACCOUNT",
    "CYMALIKA_AZURE_PROFILE",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
  ])
    if (!process.env[key]) throw Error("Missing signing credential: " + key);
  config.win.azureSignOptions = {
    endpoint: azure,
    codeSigningAccountName: process.env.CYMALIKA_AZURE_ACCOUNT,
    certificateProfileName: process.env.CYMALIKA_AZURE_PROFILE,
  };
} else if (!process.env.WIN_CSC_LINK)
  throw Error(
    "Configure a Windows publisher certificate or Azure Artifact Signing. Unsigned release builds are refused.",
  );
const dir = await mkdtemp(path.join(tmpdir(), "cymalika-sign-config-"));
try {
  const file = path.join(dir, "sign.json");
  await writeFile(file, JSON.stringify(config), { mode: 0o600 });
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/electron-builder/cli.js",
      "--win",
      "--x64",
      "--publish",
      "never",
      "--config",
      file,
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error("Signed Windows build failed: " + result.status);
  const verify = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop';$files=@(Get-ChildItem dist -Filter *.exe);$files+=Get-Item dist/win-unpacked/CyMalika.exe;$files+=Get-Item dist/win-unpacked/resources/app.asar.unpacked/desktop/native/windows.ps1;foreach($file in $files){$signature=Get-AuthenticodeSignature $file.FullName;if($signature.Status -ne 'Valid'){throw ('Invalid Authenticode signature: '+$file.Name)};Write-Output ('Verified publisher signature: '+$file.Name)}",
    ],
    { stdio: "inherit" },
  );
  if (verify.error) throw verify.error;
  if (verify.status !== 0)
    throw Error("Windows signature verification failed.");
} finally {
  await rm(dir, { recursive: true, force: true });
}
