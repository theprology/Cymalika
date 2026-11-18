# Cipher 0.4.0

Computer tools now extend beyond the native Mac app.

- Windows UI Automation and Linux AT-SPI can discover allowed apps, inspect controls, replace editable text and activate buttons.
- Windows and Linux X11 add reviewed pointer clicks, supported key combinations, scrolling and window capture.
- Single-use snapshots, process identities, password-field redaction, window ownership checks and cancellation protect app boundaries.
- Access includes an explicit **Select all listed apps** option for the session.
- Windows/Linux use Ctrl + Alt + Shift + F12 for global stop when the desktop allows it; the visible Stop button remains available.
- The beginner handbook and computer-use guide explain setup and platform differences.

## Signing status

**Mac:** Developer ID Application signed by N&RDRIVEWAYS&PATIOS LTD (CQC6547AK7), hardened runtime, trusted timestamp, Apple notarization and stapled tickets. The installed application passes Gatekeeper as Notarized Developer ID.

**Linux:** packages have GitHub build-provenance attestations, in addition to release SHA-256 checksums. This is supply-chain verification; Linux has no Apple notarization service.

**Windows:** the applications and installers are still unsigned by a trusted Windows publisher. A request for free open-source signing review has been sent to SignPath. The signed-build pipeline is prepared and refuses unsigned candidates when signing is required. An enrollment request is not an issued certificate.

## Desktop limits

Normal operating-system permissions apply. Windows protected/elevated windows and secure desktops are not bypassed. Linux X11 supports pointer/key/capture tools; Wayland currently supports exposed accessibility operations, with compositor-mediated pointer and capture sessions still outstanding. Choose allowed apps and review actions in Cipher. No model weights are included or downloaded.
