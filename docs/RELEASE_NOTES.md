# Cipher 0.5.0 local candidate

- One Computer access switch enables session app discovery, internet browsing and user-folder file tools, with no per-app or per-origin setup.
- The same selected model can discover running/installed apps, request opening an app, browse/search websites, find text files, propose saves, and request commands in a chosen user directory.
- No selected coding project or manual file attachment is needed for computer tasks. Project scope remains separate.
- Turning access off cancels pending work, closes Cipher Browser and revokes broad access. App quit and interface recovery reset it too.
- Proposed writes, commands, app launches, clicks and typing remain reviewable. Hidden credential stores, OS permissions and protected human-only actions retain their boundaries.
- The existing local model passed a real shared-loop test discovering notes and saving a correct summary in a disposable user folder.

The local Mac build is signed and notarized. This does not download or switch models. The public 0.4.0 release remains separate from this local candidate until new release assets are published.

---

# Cipher 0.4.1 local candidate

- Chat-first layout with Activity closed by default and clearer mode hints.
- Direct Computer use setup: select an app, connect it, describe the task in chat.
- File, command and computer-action reviews appear in the conversation; command output stays with its review card.
- Smaller context-relevant tool menus, bounded retries for chat-only completion claims, and explicit failure when no action happened. Rejected actions are not retried.
- Clearer computer tool schemas and validation before showing approval requests.
- Interface recovery cancels pending work, disconnects advanced access, and preserves saved conversations and the selected model. Native Mac also provides View → Reload Interface and Stop Task.
- Hidden thinking envelopes and updated in-app guidance. Light, dark and Hacker themes remain available.

This candidate uses existing models. The local Mac build is signed and notarized. See VALIDATION.md for the checks and their limits; the public 0.4.0 downloads remain the previous release.

---

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
