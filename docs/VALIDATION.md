# Validation

## Local verification

The original Mac release was tested with the user's existing Ollama model. Verified paths include project reads and reviewed writes, checkpoint recovery, streamed tool exchanges, resource retrieval, structured plan creation, persistent goals, browser read/fill/click and capture against a local page, HTTP MCP discovery/resource retrieval, and a selected-file Git commit in an isolated repository.

The model used native Mac accessibility tools to inspect a blank TextEdit document, set a short sentence after approval, and read it back. Independent inspection confirmed the actual document. It initially omitted the required snapshot ID; the tool rejected the malformed request, and the model recovered. A subsequent approved external-window capture produced an image attachment, removed without being sent to the model.

0.3.0 local checks cover provider contracts, text fallback, streaming, scoped resources, goals/plans, approval/cancellation, path boundaries, stale writes, checkpoints, real command execution, Git, HTTP errors, redirect rejection, and fragmented UTF-8.

The packaged Electron backend was also launched on the Mac. It discovered the existing Ollama model and passed native tool invocation/result read-back. Through the app UI, a separate scratch project was selected, a file was read in the editor, an added function was reviewed and saved, and checkpoint undo restored the original file. This is a Mac-hosted backend check, not Windows/Linux desktop runtime validation.

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
