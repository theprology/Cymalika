# Validation

## 0.5.0 computer access — November 19, 2026

- The already-installed `CyberCrew/notmythos-8b:3.8-27b-uncensored` model passed a disposable-user-folder task twice through the actual shared agent loop. It discovered the relevant note without a selected project or attached files and saved a correct summary; the second run used the actual review renderer with an automated fixture-only approval.
- In the installed native Mac app, a single Computer access switch enabled the same model to open/read example.com, discover running apps, find/read the permitted test note, request a report save, and read the saved report back. The reviewed report contained the actual page title, `lantern-6842` from the note, and the running-app count. Independent filesystem inspection confirmed the report and the unchanged original note.
- macOS displayed a Documents permission prompt during the first attempt. The user handled it manually; no protected system dialog was automated. A separate approval-renderer bug prevented the first save before any write occurred. Both were addressed before the successful retry: file/catalog work now uses a serial background queue with immediate cancellation, and file reviews without app IDs are covered by a real-renderer regression test.
- Native self-tests simulate blocked file work and verify that cancellation stays responsive, pending operation replies are cancelled, and stale results are discarded. Shared checks cover session revocation, protected paths/symlinks, hashes/checkpoints, command directories, capability-aware image tools and browser-session destruction.
- The switch was turned off after the live test. Cipher displayed that pending work was cancelled, its temporary browser was closed, and broad app/user-file tools were disconnected. The selected model was preserved. The local Mac app is Developer ID signed, Apple-notarized and Gatekeeper-accepted. A later disconnect check exposed a native window-ownership issue; the workspace now has a strong owner, browser teardown detaches only its own web view, and native automatic window tabbing is disabled. Reopening a browser, disconnecting it and creating a new chat left the workspace visibly usable.
- Cross-platform run [44654779273](https://github.com/theprology/cipher/actions/runs/44654779273) passed at `f9a82aa`: Mac checks, Windows/Linux tests, installed-app catalog discovery, native app-control/capture fixtures, packaging and installer/startup checks. Interactive multi-tool testing with this local model was performed on Mac; the complete workflow was not manually exercised on Windows/Linux.

No model was downloaded or switched. Direct computer-file tools cover ordinary home-folder text files, not protected credential stores or every file format. Existing operating-system permissions still apply. Public release assets remain separate from this local/source candidate.

## 0.4.1 local candidate — November 19, 2026

- The existing `CyberCrew/notmythos-8b:3.8-27b-uncensored` model completed two independent runs of a disposable project task through the actual shared `send()` loop: discover files, fix the implementation, leave tests unchanged, and run two passing Python tests. The fixture harness approves only its disposable writes and a fixed unittest command. It does not establish general task reliability.
- In the installed native Mac app, the same model read the existing TextEdit test document, proposed a `set_text` action with its snapshot/element references, performed it after review, and called `computer_read` again. Independent inspection confirmed the exact replacement sentence. Nothing was saved to disk and no other document was opened.
- The redesigned connection dialog, in-chat action review and model selection were inspected in the running app. An earlier malformed keystroke proposal failed; tool schemas now explain snapshot IDs, editable element references and key modifiers, and missing references fail before review.
- The native View → Reload Interface and Stop Task command reloaded the interface and displayed the recovery notice while preserving the selected model. Native self-tests and desktop backend tests verify that recovery discards pending proposals, cancels work, clears snapshots and revokes advanced session grants. Automatic recovery after an actual renderer crash has not been deliberately fault-injected.
- Shared regression checks cover bounded recovery from chat-only completion claims, no automatic retry of rejected edits, atomic app connection after a failed native grant, and hiding model thinking envelopes without damaging literal code examples. Reopening the completed computer-test conversation in the final installed app confirmed its reply no longer displayed the thinking prefix or closing marker.
- The updated Mac app is Developer ID signed, notarized and installed locally. The Windows/Linux recovery changes pass backend tests; new Windows/Linux installers have not been packaged or manually exercised for 0.4.1.

Run `npm test` for offline checks. `npm run test:live-model` additionally requires that the existing named model is already installed and Ollama is running. It never downloads a model.

## Local verification

The original Mac release was tested with the user's existing Ollama model. Verified paths include project reads and reviewed writes, checkpoint recovery, streamed tool exchanges, resource retrieval, structured plan creation, persistent goals, browser read/fill/click and capture against a local page, HTTP MCP discovery/resource retrieval, and a selected-file Git commit in an isolated repository.

The model used native Mac accessibility tools to inspect a blank TextEdit document, set a short sentence after approval, and read it back. Independent inspection confirmed the actual document. It initially omitted the required snapshot ID; the tool rejected the malformed request, and the model recovered. A subsequent approved external-window capture produced an image attachment, removed without being sent to the model.

0.3.0 local checks cover provider contracts, text fallback, streaming, scoped resources, goals/plans, approval/cancellation, path boundaries, stale writes, checkpoints, real command execution, Git, HTTP errors, redirect rejection, and fragmented UTF-8.

The packaged Electron backend was also launched on the Mac. It discovered the existing Ollama model and passed native tool invocation/result read-back. Through the app UI, a separate scratch project was selected, a file was read in the editor, an added function was reviewed and saved, and checkpoint undo restored the original file. The shared browser backend also opened an allowed local page, read its actual input/button IDs, filled the input after review, and clicked its button after review. Independent inspection showed `Hello, Cipher!`. This is a Mac-hosted backend check, not Windows/Linux desktop runtime validation.

## What a successful build establishes

The CI matrix runs shared tests on Windows, Linux, and macOS and produces installers. This establishes compilation/packaging and those automated checks. It does not establish all graphical behavior on all operating systems.

## Outstanding validation

- Extended interactive testing of Windows and Linux on diverse target desktops; automated install/startup checks are recorded below.
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

The Linux runner also exercised the terminal script against the actual Debian package, including checksum verification, apt installation and packaged UI startup. The Windows runner exercised the terminal script against its actual setup executable, including checksum verification, silent installation and installed UI startup. Portable Windows installation and UI startup also passed. Its first test exposed a difference between Windows short temporary paths and their canonical paths; the corrected IPC check still requires the trusted main frame and the exact canonical workspace file.

The final [cross-platform run](https://github.com/theprology/cipher/actions/runs/44355147649) passed on all three platforms, including actual terminal installation and installed startup. Windows setup and portable launchers both produced explicit successful startup evidence. The shared tests cover core tools; this does not imply every graphical flow or external integration was manually exercised on each OS.

## 0.4 desktop control and publisher evidence

The Windows backend uses an MTA UI Automation client. The Linux backend uses AT-SPI and X11 window identities. Live disposable-app checks cover discovery, secure-field redaction, text replacement, button invocation, actual pointer clicks, supported key input, window bounds and actual Electron window capture with decoded, nonuniform pixels. Each action is followed by a new inspection. These tests use actual target-OS desktop sessions, rather than a mocked accessibility tree.

- [Windows live control, capture, packages and installed startup](https://github.com/theprology/cipher/actions/runs/44373806258/job/135047431667) passed.
- [Linux live control, capture, installed startup and provenance](https://github.com/theprology/cipher/actions/runs/44374246897/job/135049004027) passed. The Chromium sandbox was retained. A separate matrix attempt exposed an X11 window-manager startup race in the test harness; the harness now waits for readiness before launching the fixture.
- The native Mac 0.4 app passed its self-test, Developer ID signature verification, Apple notarization, ticket stapling/validation and Gatekeeper assessment. It was installed, reopened with the existing Ollama model, and its existing Accessibility and Screen Recording grants were refreshed and independently observed as granted/available in the app.

The Mac publisher certificate was created under the user's approved Apple developer team. Its private key remains in the local login Keychain; the temporary plaintext key copy was removed after successful signing. No private signing material is included in the repository or release.

Windows Authenticode signing is not complete: the free signing inquiry was sent, but the external provider has not approved or issued credentials. Linux attestations are distinct from Windows/macOS publisher signatures. Wayland compositor-mediated pointer/keyboard/capture support remains outstanding. Extended interactive testing across different apps and desktop configurations is still needed.

## Cipher 0.5.4 across desktop platforms

Source commit `a3b3c2e472791a69b13a57c00aa2428a633dcd6e` passed [Build and test](https://github.com/theprology/cipher/actions/runs/44876623232). Windows setup and portable packages were installed and started on Windows CI. The Debian package was installed and started on Linux CI. The packaged applications exercised native keep-awake registration/release, whole-app colour changes, Enter/Shift+Enter and IME handling, folder grouping, source tabs, line numbers, draft isolation and Explorer width controls. Native app-control fixtures also passed on both platforms. These checks used CI desktops, not a physical sleep/wake cycle or an Ollama model hosted on each runner.

The Mac app was tested locally with the existing Ollama model and macOS power assertions; the Mac download was signed and notarized separately. No model is included in the downloads.
