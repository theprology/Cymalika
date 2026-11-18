# Validation

## Local verification

The original Mac release was tested with the user's existing Ollama model. Verified paths include project reads and reviewed writes, checkpoint recovery, streamed tool exchanges, resource retrieval, structured plan creation, persistent goals, browser read/fill/click and capture against a local page, HTTP MCP discovery/resource retrieval, and a selected-file Git commit in an isolated repository.

The model used native Mac accessibility tools to inspect a blank TextEdit document, set a short sentence after approval, and read it back. Independent inspection confirmed the actual document. It initially omitted the required snapshot ID; the tool rejected the malformed request, and the model recovered. A subsequent approved external-window capture produced an image attachment, removed without being sent to the model.

0.3.0 local checks cover provider contracts, text fallback, streaming, scoped resources, goals/plans, approval/cancellation, path boundaries, stale writes, checkpoints, real command execution, Git, HTTP errors, redirect rejection, and fragmented UTF-8.

The packaged Electron backend was also launched on the Mac. It discovered the existing Ollama model and passed native tool invocation/result read-back. Through the app UI, a separate scratch project was selected, a file was read in the editor, an added function was reviewed and saved, and checkpoint undo restored the original file. The shared browser backend also opened an allowed local page, read its actual input/button IDs, filled the input after review, and clicked its button after review. Independent inspection showed `Hello, Cipher!`. This is a Mac-hosted backend check, not Windows/Linux desktop runtime validation.

## What a successful build establishes

The CI matrix runs shared tests on Windows, Linux, and macOS and produces installers. This establishes compilation/packaging and those automated checks. It does not establish all graphical behavior on all operating systems.

## Outstanding validation

- Interactive testing of Windows and Linux installers on actual target desktops.
- Live authenticated cloud providers and cloud vision inference.
- Arbitrary third-party MCP servers and unsupported MCP features.
- Generic Mac pointer/keyboard operations across different applications.
- Mac Intel and the macOS 13 screenshot fallback.
- Independent security/accessibility review and public release signing.

Desktop automation on Windows/Linux is not implemented. The UI does not offer it. No claim of universal model compatibility or Codex-equivalent reliability is made.

## Beginner guidance

The nine-step in-app tour was exercised from its first-run dialog through completion in the installed native Mac app. The same navigation, completion persistence, and absence of model/file actions have regression checks. The eight-page PDF handbook was rendered and visually reviewed, including the dense recovery page. Fresh installs no longer receive automatic starter resources or a formatting demo. Known local test projects and validation chats were removed from the installed app state after a reversible backup. No user application state is distributed.

## Cross-platform runner evidence

- [Native Mac build and checks](https://github.com/theprology/cipher/actions/runs/44348577436/job/134957621691): shared tests, native self-test, native streaming and installer verification passed. The later desktop startup helper changed only Electron/CI files; native Mac inputs remained unchanged.
- [Windows package and startup](https://github.com/theprology/cipher/actions/runs/44349593183/job/134961252368): shared tests, both executable packages, packaged renderer, first-run tour and native IPC checks passed. The first Windows run exposed incorrect command quoting; the corrected run verifies output capture and quoted arguments.
- [Installed Linux package and startup](https://github.com/theprology/cipher/actions/runs/44349593183/job/134961252786): shared tests, AppImage/Debian builds, apt installation, packaged UI under a virtual display, first-run tour and native IPC passed. The test retained the Chromium sandbox.

These checks establish startup and the tested core paths on real target OS runners. They do not replace extended interactive testing on different desktop configurations. Earlier Mac-hosted live tests covered project saves/undo, the existing Ollama model, and browser actions.

Terminal installer checks cover Bash syntax, dry-run selection, checksum verification, corruption rejection, invalid versions, and Windows PowerShell parsing/WhatIf behavior. The installers do not download models or grant OS privacy permissions.

The Mac terminal installer was also exercised with the actual release disk image: checksum verification, disk-image mounting, app signature verification, installation to the user Applications folder, launcher creation, and the installed native self-test all passed. The test copy was removed afterward; the existing installed app and model were preserved.

The Linux runner also exercised the terminal script against the actual Debian package, including checksum verification, apt installation and packaged UI startup. The Windows runner exercised the terminal script against its actual setup executable, including checksum verification, silent installation and installed UI startup. Portable Windows startup is tracked separately from setup validation.
